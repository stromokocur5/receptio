<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { formatEur, formatGrams, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import NutrientBars from '$lib/components/NutrientBars.svelte';
	import PlateArt from '$lib/components/PlateArt.svelte';
	import RecipePicker from '$lib/components/RecipePicker.svelte';
	import { CATEGORY_LABELS } from '$lib/labels';
	import {
		DAILY_REFERENCE,
		VEGAN_PROTEIN_G_PER_KG,
		emptyNutrients,
		scaleNutrients
	} from '$lib/nutrition';
	import { basketByStore } from '$lib/pricing';
	import { FRIDGE_DAYS, mealSchedule } from '$lib/schedule';
	import { encodeSharedPlan } from '$lib/share';
	import { approxPieces, buildShoppingList, type ShoppingItem } from '$lib/shopping';
	import {
		checkedItems,
		markCooked,
		movePlanEntryUp,
		outOfStock,
		pantry,
		plan,
		setPantryItem,
		setPlanServings,
		settings,
		ui,
		type Settings
	} from '$lib/state.svelte';

	const catalog = useCatalog();
	const today = $derived(new Date());

	let copied = $state(false);
	let shareState = $state<'idle' | 'copied' | 'failed'>('idle');
	let confirmClear = $state(false);
	let cookedMessage = $state('');

	const entries = $derived(
		plan.current
			.map((e) => ({ ...e, recipe: catalog.recipesById.get(e.recipeId) }))
			.filter((e) => e.recipe !== undefined)
			.map((e) => {
				const recipe = e.recipe!;
				const variant = e.variant ? recipe.variants.find((v) => v.name === e.variant) : undefined;
				// `data` holds whatever differs between variants: lines, nutrition, cost.
				return { ...e, recipe, data: variant ?? recipe, key: `${e.recipeId}|${e.variant ?? ''}` };
			})
	);
	const totalServings = $derived(entries.reduce((s, e) => s + e.servings, 0));

	const list = $derived(
		buildShoppingList(
			plan.current,
			catalog.recipesById,
			catalog.ingredientsById,
			pantry.current,
			catalog.prices,
			today,
			new Set(Object.keys(outOfStock.current).filter((id) => outOfStock.current[id]))
		)
	);
	const allItems = $derived(list.byCategory.flatMap(([, items]) => items));
	const checkedCount = $derived(
		allItems.filter((i) => checkedItems.current[i.ingredient.id]).length
	);

	const baskets = $derived(
		basketByStore(
			allItems.map((i) => ({ ingredient: i.ingredient, grams: i.buyGrams })),
			catalog.stores,
			catalog.prices,
			today
		)
	);

	const perDay = $derived.by(() => {
		const total = emptyNutrients();
		for (const e of entries) {
			const factor = e.servings;
			const n = e.data.perServing;
			for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += n[key] * factor;
		}
		return scaleNutrients(total, 1 / (settings.current.planDays * settings.current.people));
	});

	const schedule = $derived(
		mealSchedule(
			plan.current,
			settings.current.people,
			settings.current.mealsPerDay,
			settings.current.planDays
		)
	);
	const dayLabel = new Intl.DateTimeFormat('sk-SK', {
		weekday: 'short',
		day: 'numeric',
		month: 'numeric'
	});
	function dayName(offset: number) {
		if (offset === 0) return 'Dnes';
		if (offset === 1) return 'Zajtra';
		return dayLabel.format(new Date(today.getTime() + offset * 86_400_000));
	}
	const titleOf = (recipeId: string) => catalog.recipesById.get(recipeId)?.title ?? recipeId;

	function updateSettings(patch: Partial<Settings>) {
		settings.current = { ...settings.current, ...patch };
	}

	function cooked(e: (typeof entries)[number]) {
		const used = markCooked(
			e.recipeId,
			e.variant,
			e.servings,
			e.data.lines,
			e.recipe.servings,
			catalog.ingredientsById
		);
		cookedMessage = used.length
			? `${e.recipe.title}: zapísané, zo špajze ubudlo ${used.map((u) => u.ingredient.name).join(', ')}.`
			: `${e.recipe.title}: zapísané do histórie.`;
	}
	const targets = $derived({
		...DAILY_REFERENCE,
		protein: settings.current.weightKg
			? settings.current.weightKg * VEGAN_PROTEIN_G_PER_KG
			: DAILY_REFERENCE.protein
	});

	const planCost = $derived(entries.reduce((s, e) => s + e.data.costPerServing * e.servings, 0));

	function setOutOfStock(id: string, missing: boolean) {
		const { [id]: _previous, ...rest } = outOfStock.current;
		outOfStock.current = missing ? { ...rest, [id]: true } : rest;
	}

	function toggleChecked(id: string) {
		checkedItems.current = { ...checkedItems.current, [id]: !checkedItems.current[id] };
	}

	const pieces = (item: ShoppingItem) => approxPieces(item.ingredient, item.buyGrams);

	async function copyList() {
		const lines = list.byCategory.flatMap(([category, items]) => [
			`${CATEGORY_LABELS[category]}:`,
			...items.map((i) => `- ${i.ingredient.name}: ${formatGrams(i.buyGrams)}${pieces(i)}`),
			''
		]);
		try {
			await navigator.clipboard.writeText(lines.join('\n').trim());
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			copied = false;
		}
	}

	/** Link with the plan and the still-to-buy list in the URL fragment (never sent to the server). */
	async function shareList() {
		const fragment = encodeSharedPlan({
			plan: plan.current,
			buy: allItems.map((i) => [i.ingredient.id, i.buyGrams]),
			people: settings.current.people,
			days: settings.current.planDays
		});
		const url = `${location.origin}/zoznam#${fragment}`;
		try {
			if (navigator.share) {
				await navigator.share({ title: 'Nákupný zoznam · Receptio', url });
				return;
			}
			await navigator.clipboard.writeText(url);
			shareState = 'copied';
		} catch (err) {
			// Closing the share sheet is not an error worth showing.
			if (err instanceof DOMException && err.name === 'AbortError') return;
			shareState = 'failed';
		}
		setTimeout(() => (shareState = 'idle'), 2200);
	}

	function boughtToPantry() {
		for (const item of allItems) {
			if (!checkedItems.current[item.ingredient.id]) continue;
			if (item.restock) {
				setOutOfStock(item.ingredient.id, false);
				continue;
			}
			const current = pantry.current[item.ingredient.id];
			if (current === null) continue;
			setPantryItem(item.ingredient.id, Math.round((current ?? 0) + item.buyGrams));
		}
		checkedItems.current = {};
	}

	function clearPlan() {
		if (!confirmClear) {
			confirmClear = true;
			setTimeout(() => (confirmClear = false), 3000);
			return;
		}
		plan.current = [];
		checkedItems.current = {};
		confirmClear = false;
	}
</script>

<Seo
	title="Plán a nákup"
	description="Týždenný plán jedál, živiny na deň a jeden nákupný zoznam."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Plán a nákup</p>
		<h1>Týždeň bez stresu</h1>
		<p class="lede">
			Pridaj recepty a počet porcií. Receptio z nich spraví jeden nákupný zoznam, odpočíta to, čo
			máš v špajzi, a ukáže, ako na tom si so živinami.
		</p>
	</header>

	<div class="layout">
		<div class="left">
			<section class="card box">
				<div class="box-head">
					<h2><Icon name="calendar" size={24} /> Recepty v pláne</h2>
					{#if entries.length}
						<button class="btn ghost small" onclick={clearPlan}>
							<Icon name="trash" size={16} />
							{confirmClear ? 'Naozaj?' : 'Vymazať'}
						</button>
					{/if}
				</div>

				{#if !ui.loaded}
					<p class="muted">Načítavam…</p>
				{:else if entries.length === 0}
					<p class="muted empty">
						Plán je prázdny. Pridaj recept nižšie, tlačidlom + na karte receptu alebo „Do plánu“ v
						detaile.
					</p>
				{:else}
					<ul class="entries">
						{#each entries as e, i (e.key)}
							<li>
								<div class="mini plate-host">
									<PlateArt
										seed={e.recipe.id}
										lines={e.data.lines}
										byId={catalog.ingredientsById}
										animate={false}
									/>
								</div>
								<div class="info">
									<a href="/recepty/{e.recipe.id}">{e.recipe.title}</a>
									<span class="muted">
										{#if e.variant}{e.variant} ·
										{/if}{formatEur(e.data.costPerServing * e.servings)}
										{#if settings.current.people > 1 || settings.current.mealsPerDay > 1}
											· {Math.floor(e.servings / settings.current.people)}× jedlo
										{/if}
									</span>
									<span class="entry-actions">
										{#if i > 0}
											<button onclick={() => movePlanEntryUp(i)} title="Variť skôr">
												<Icon name="arrow-up" size={14} stroke={2.2} /> Skôr
											</button>
										{/if}
										<button onclick={() => cooked(e)} title="Uvarené – odpočítať zo špajze">
											<Icon name="check" size={14} stroke={2.2} /> Uvarené
										</button>
									</span>
								</div>
								<div class="stepper" role="group" aria-label="Porcie pre {e.recipe.title}">
									<button
										class="icon-btn"
										aria-label="Menej porcií"
										onclick={() => setPlanServings(e.recipeId, e.variant, e.servings - 1)}
									>
										<Icon name={e.servings === 1 ? 'trash' : 'minus'} size={16} />
									</button>
									<span>{e.servings}</span>
									<button
										class="icon-btn"
										aria-label="Viac porcií"
										onclick={() => setPlanServings(e.recipeId, e.variant, e.servings + 1)}
									>
										<Icon name="plus" size={16} />
									</button>
								</div>
							</li>
						{/each}
					</ul>
					{#if cookedMessage}
						<p class="cooked-msg" role="status">
							<Icon name="check" size={16} />
							{cookedMessage}
							<a href="/spajza">Špajza</a>
						</p>
					{/if}
					<p class="summary">
						<strong>{totalServings}</strong> porcií · spolu <strong>{formatEur(planCost)}</strong>
						· <strong>{formatEur(totalServings ? planCost / totalServings : 0)}</strong> / porcia
					</p>
				{/if}

				<div class="picker-wrap">
					<h3><Icon name="plus" size={18} /> Pridať recept</h3>
					<RecipePicker />
				</div>
			</section>

			{#if entries.length}
				<section class="card box">
					<h2><Icon name="clock" size={24} /> Rozpis dní</h2>
					<div class="settings">
						<label>
							Plán na
							<select
								value={settings.current.planDays}
								onchange={(e) => updateSettings({ planDays: Number(e.currentTarget.value) })}
							>
								{#each [1, 2, 3, 4, 5, 6, 7, 10, 14] as d (d)}<option value={d}>{d}</option>{/each}
							</select>
							dní
						</label>
						<label>
							Varím pre
							<select
								value={settings.current.people}
								onchange={(e) => updateSettings({ people: Number(e.currentTarget.value) })}
							>
								{#each [1, 2, 3, 4, 5, 6, 8] as p (p)}<option value={p}>{p}</option>{/each}
							</select>
							{settings.current.people === 1 ? 'osobu' : 'osoby'}
						</label>
						<label>
							Jedál denne
							<select
								value={settings.current.mealsPerDay}
								onchange={(e) =>
									updateSettings({ mealsPerDay: e.currentTarget.value === '2' ? 2 : 1 })}
							>
								<option value={1}>1 (obed)</option>
								<option value={2}>2 (obed a večera)</option>
							</select>
						</label>
					</div>
					<ol class="days">
						{#each schedule.days as day, d (d)}
							<li>
								<span class="day">{dayName(d)}</span>
								<span class="meals">
									{#each day.meals as meal, m (m)}
										{#if meal}
											<span
												class="meal"
												class:cook={meal.kind === 'cook'}
												class:old={meal.age > FRIDGE_DAYS}
											>
												<Icon name={meal.kind === 'cook' ? 'pot' : 'jar'} size={16} />
												{meal.kind === 'cook' ? 'Uvar' : 'Zvyšky'}: {titleOf(meal.entry.recipeId)}
												{#if meal.age > FRIDGE_DAYS}<small>– radšej zamraz</small>{/if}
											</span>
										{:else}
											<span class="meal empty">nič naplánované</span>
										{/if}
									{/each}
								</span>
							</li>
						{/each}
					</ol>
					<p class="muted small">
						{#if schedule.unplannedMeals}
							Chýba ešte {schedule.unplannedMeals}
							{schedule.unplannedMeals === 1
								? 'jedlo'
								: schedule.unplannedMeals < 5
									? 'jedlá'
									: 'jedál'}
							– pridaj recept alebo porcie.
						{:else}
							Plán pokryje všetky jedlá.
						{/if}
						{#if schedule.extraServings}
							Zvýši {schedule.extraServings} porc. navyše.
						{/if}
						Varené jedlo vydrží v chladničke asi {FRIDGE_DAYS} dni. Poradie zmeníš tlačidlom „Skôr“.
					</p>
				</section>

				<section class="card box">
					<h2><Icon name="bean" size={24} /> Živiny na deň</h2>
					<div class="settings">
						<label>
							Moja váha
							<input
								inputmode="numeric"
								placeholder="—"
								value={settings.current.weightKg ?? ''}
								onchange={(e) => {
									const w = Number(e.currentTarget.value);
									updateSettings({ weightKg: w >= 20 && w <= 250 ? w : null });
								}}
							/>
							kg
						</label>
					</div>
					<p class="muted small">
						Priemer na osobu a deň len z naplánovaných jedál (raňajky a snacky mimo plánu sa
						nepočítajú).
						{settings.current.weightKg
							? `Cieľ bielkovín: ${formatNumber(targets.protein, 0)} g (1,1 g/kg).`
							: ''}
					</p>
					<NutrientBars
						values={perDay}
						{targets}
						keys={['kcal', 'protein', 'fiber', 'iron', 'calcium', 'zinc', 'ala', 'salt']}
					/>
					<p class="b12">
						<Icon name="pill" size={18} /> B12 a vitamín D pokryje len suplement.
						<a href="/wiki/b12">Viac</a>
					</p>
				</section>
			{/if}
		</div>

		<section class="card box shop">
			<div class="box-head">
				<h2><Icon name="basket" size={24} /> Nákupný zoznam</h2>
				{#if allItems.length}
					<div class="head-actions">
						<button class="btn ghost small" onclick={copyList}>
							<Icon name={copied ? 'check' : 'copy'} size={16} />
							{copied ? 'Skopírované' : 'Text'}
						</button>
						<button class="btn leaf small" onclick={shareList}>
							<Icon name={shareState === 'copied' ? 'check' : 'share'} size={16} />
							{shareState === 'copied'
								? 'Odkaz skopírovaný'
								: shareState === 'failed'
									? 'Nepodarilo sa'
									: 'Zdieľať'}
						</button>
					</div>
				{/if}
			</div>

			{#if !ui.loaded}
				<p class="muted">Načítavam…</p>
			{:else if entries.length === 0}
				<p class="muted empty">Tu sa objaví zoznam, keď pridáš recepty.</p>
			{:else if allItems.length === 0}
				<p class="empty"><Icon name="check" size={20} /> Všetko máš doma. Môžeš variť.</p>
			{:else}
				{#each list.byCategory as [category, items] (category)}
					<div class="cat">
						<h3>{CATEGORY_LABELS[category]}</h3>
						<ul>
							{#each items as item (item.ingredient.id)}
								{@const checked = !!checkedItems.current[item.ingredient.id]}
								<li class:checked>
									<label>
										<input
											type="checkbox"
											{checked}
											onchange={() => toggleChecked(item.ingredient.id)}
										/>
										<span class="box-ui" aria-hidden="true"
											><Icon name="check" size={14} stroke={3} /></span
										>
										<span class="nm">
											{item.ingredient.name}
											<small>
												{formatGrams(item.buyGrams)}{pieces(item)}
												{#if item.buyGrams < item.needGrams - 0.5}· zvyšok máš doma{/if}
												{#if item.restock}· stačí najmenšie balenie{/if}
											</small>
										</span>
										<span class="price" class:est={item.costIsEstimate}>{formatEur(item.cost)}</span
										>
									</label>
									{#if item.restock}
										<button
											class="undo"
											title="Predsa to mám doma"
											aria-label="Predsa mám doma: {item.ingredient.name}"
											onclick={() => setOutOfStock(item.ingredient.id, false)}
										>
											<Icon name="x" size={14} />
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/each}

				{#if list.staples.length}
					<div class="staples">
						<h3><Icon name="jar" size={16} /> Skontroluj doma</h3>
						<p class="muted small">
							Korenie a oleje nerátame do nákupu. Ťukni na to, čo doma nemáš, a pridá sa do zoznamu.
						</p>
						<div class="staple-chips">
							{#each list.staples as item (item.ingredient.id)}
								{#if item.ingredient.byproduct}
									<span class="chip byproduct" title="Nekupuje sa – zostane z inej suroviny">
										{item.ingredient.name}
									</span>
								{:else}
									<button
										class="chip"
										title="Nemám doma – pridať do nákupu"
										onclick={() => setOutOfStock(item.ingredient.id, true)}
									>
										<Icon name="plus" size={12} stroke={2.4} />
										{item.ingredient.name}
									</button>
								{/if}
							{/each}
						</div>
					</div>
				{/if}

				<div class="total">
					<span>Spolu {list.hasEstimates ? '(odhad)' : ''}</span>
					<strong>{formatEur(list.total)}</strong>
				</div>

				{#if baskets.length}
					<div class="stores">
						<h3><Icon name="store" size={18} /> Kde nakúpiť</h3>
						<ul>
							{#each baskets.slice(0, 4) as b, i (b.store.id)}
								<li class:best={i === 0}>
									<span class="sdot" style:background={b.store.color}></span>
									{b.store.name}
									<span class="muted small">{b.covered}/{b.items} cien</span>
									<strong>{formatEur(b.total)}</strong>
								</li>
							{/each}
						</ul>
						<p class="muted small">Chýbajúce ceny sú doplnené odhadom.</p>
					</div>
				{:else}
					<p class="muted small">
						Ceny sú zatiaľ odhady. Keď pribudnú reálne ceny z obchodov, tu uvidíš, kde je nákup
						najlacnejší.
					</p>
				{/if}

				{#if checkedCount}
					<button class="btn leaf wide" onclick={boughtToPantry}>
						<Icon name="jar" size={18} /> Nakúpené ({checkedCount}) → do špajze
					</button>
				{/if}
			{/if}
		</section>
	</div>
</div>

<style>
	.page {
		padding-top: 28px;
	}
	.lede {
		max-width: 44em;
		color: var(--ink-2);
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 20px;
	}
	.left {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 20px;
		align-content: start;
	}
	.box {
		padding: 20px;
	}
	.box-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 12px;
	}
	.box h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.4rem;
		margin: 0 0 12px;
	}
	.box-head h2 {
		margin: 0;
	}
	.empty {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 18px 0 4px;
	}
	.entries {
		list-style: none;
		margin: 16px 0 0;
		padding: 0;
	}
	.entries li {
		display: grid;
		grid-template-columns: 52px 1fr auto;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
		animation: rise 0.35s var(--ease-out);
	}
	.mini {
		width: 52px;
	}
	.info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.info a {
		color: var(--ink);
		font-weight: 650;
		text-decoration: none;
	}
	.info a:hover {
		text-decoration: underline;
	}
	.info span {
		font-size: 0.85rem;
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.stepper .icon-btn {
		width: 30px;
		height: 30px;
	}
	.stepper span {
		min-width: 1.4em;
		text-align: center;
	}
	.head-actions {
		display: flex;
		gap: 6px;
	}
	.entry-actions {
		display: flex;
		gap: 6px;
		margin-top: 4px;
	}
	.entry-actions button {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: transparent;
		color: var(--ink-2);
		font-size: 0.75rem;
		font-weight: 650;
		padding: 2px 8px;
	}
	.entry-actions button:hover {
		border-color: var(--leaf-2);
		color: var(--leaf);
	}
	.cooked-msg {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin: 12px 0 0;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--leaf-soft);
		font-size: 0.88rem;
	}
	.days {
		list-style: none;
		margin: 8px 0 12px;
		padding: 0;
	}
	.days li {
		display: grid;
		grid-template-columns: 5.5em 1fr;
		gap: 10px;
		padding: 7px 0;
		border-bottom: 1px dashed var(--line);
		align-items: baseline;
	}
	.day {
		font-weight: 700;
		font-size: 0.85rem;
		text-transform: capitalize;
	}
	.meals {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.meal {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.9rem;
		color: var(--ink-2);
	}
	.meal.cook {
		color: var(--ink);
		font-weight: 650;
	}
	.meal.old small {
		color: var(--tomato);
		font-weight: 650;
	}
	.meal.empty {
		color: var(--muted);
		font-style: italic;
	}
	.picker-wrap {
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px dashed var(--line);
	}
	.picker-wrap h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 1.05rem;
	}
	.summary {
		margin: 14px 0 0;
		font-size: 0.92rem;
		color: var(--ink-2);
	}
	.settings {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-bottom: 8px;
		font-weight: 600;
		font-size: 0.92rem;
	}
	.settings select,
	.settings input {
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--paper);
		padding: 4px 8px;
		margin: 0 4px;
	}
	.settings input {
		width: 4.5em;
	}
	.small {
		font-size: 0.84rem;
	}
	.b12 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 16px 0 0;
		font-size: 0.88rem;
		color: var(--sky);
	}
	.cat {
		margin-top: 16px;
	}
	.cat h3 {
		font-family: var(--font-body);
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
		margin-bottom: 4px;
	}
	.cat ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cat li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.cat li label {
		flex: 1;
		min-width: 0;
	}
	.undo {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--muted);
	}
	.undo:hover {
		background: var(--tomato-soft);
		color: var(--tomato);
	}
	.cat label {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		cursor: pointer;
	}
	.cat input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.box-ui {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 8px;
		border: 2px solid var(--line);
		color: transparent;
		transition:
			background 0.2s,
			border-color 0.2s,
			transform 0.3s var(--ease-spring);
	}
	.cat input:focus-visible + .box-ui {
		outline: 3px solid var(--turmeric);
		outline-offset: 2px;
	}
	.checked .box-ui {
		background: var(--leaf);
		border-color: var(--leaf);
		color: var(--paper);
		transform: rotate(-6deg);
	}
	.nm {
		display: flex;
		flex-direction: column;
		transition: opacity 0.2s;
	}
	.nm small {
		color: var(--muted);
		font-size: 0.82rem;
	}
	.checked .nm {
		opacity: 0.5;
		text-decoration: line-through;
	}
	.price {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		font-size: 0.92rem;
	}
	.price.est::after {
		content: '*';
		color: var(--muted);
	}
	.staples {
		margin-top: 18px;
		padding: 14px;
		border-radius: var(--radius-sm);
		background: var(--paper);
	}
	.staples h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 1rem;
		margin-bottom: 4px;
	}
	.staples p {
		margin: 0 0 10px;
	}
	.staple-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.staple-chips .chip {
		font-size: 0.8rem;
		padding: 0.25em 0.7em;
	}
	.staple-chips .byproduct {
		border-style: dashed;
		color: var(--muted);
	}
	.total {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-top: 16px;
		padding-top: 14px;
		border-top: 2px solid var(--ink);
		font-weight: 700;
	}
	.total strong {
		font-family: var(--font-display);
		font-size: 1.6rem;
	}
	.stores {
		margin-top: 18px;
	}
	.stores h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 1rem;
	}
	.stores ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.stores li {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		gap: 10px;
		align-items: center;
		padding: 6px 10px;
		border-radius: 10px;
	}
	.stores li.best {
		background: var(--leaf-soft);
	}
	.sdot {
		width: 12px;
		height: 12px;
		border-radius: 4px;
	}
	.wide {
		width: 100%;
		justify-content: center;
		margin-top: 18px;
	}
	@media (min-width: 960px) {
		.layout {
			grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
			align-items: start;
		}
		.shop {
			position: sticky;
			top: 84px;
			max-height: calc(100vh - 100px);
			overflow: auto;
		}
	}
</style>

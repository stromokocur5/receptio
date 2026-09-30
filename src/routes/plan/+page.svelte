<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { formatEur, formatGrams, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import AutoPlanner from '$lib/components/AutoPlanner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NutrientBars from '$lib/components/NutrientBars.svelte';
	import PlanSettings from '$lib/components/PlanSettings.svelte';
	import PlateArt from '$lib/components/PlateArt.svelte';
	import { vesselFor } from '$lib/categories';
	import RecipePicker from '$lib/components/RecipePicker.svelte';
	import { CATEGORY_LABELS } from '$lib/labels';
	import {
		DAILY_REFERENCE,
		VEGAN_PROTEIN_G_PER_KG,
		emptyNutrients,
		scaleNutrients
	} from '$lib/nutrition';
	import { compareStores, shelfCost, type ShelfCost, type StorePlan } from '$lib/pricing';
	import { mealSchedule } from '$lib/schedule';
	import { encodeSharedPlan } from '$lib/share';
	import { approxPieces, buildShoppingList, type ShoppingItem } from '$lib/shopping';
	import {
		addExtraItem,
		checkedItems,
		extraItems,
		type ExtraItem,
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
	let plannerOpen = $state(false);

	/** Adding recipes happens in a sheet; the full list inline made the page endless. */
	let pickerDialog = $state<HTMLDialogElement>();
	const openPicker = () => pickerDialog?.showModal();
	const closePicker = () => pickerDialog?.close();

	function startWithPlanner() {
		plannerOpen = true;
		document.getElementById('navrh')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

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

	/** Aisles (default) or one list per store where each item is cheapest. */
	let groupBy = $state<'aisle' | 'store'>('aisle');
	const hasRealPrices = $derived(allItems.some((i) => i.storeId));
	const groups = $derived.by((): [string, string, ShoppingItem[]][] => {
		if (groupBy === 'aisle') {
			return list.byCategory.map(([c, items]) => [c, CATEGORY_LABELS[c], items]);
		}
		const byStore = new Map<string, ShoppingItem[]>();
		for (const item of allItems) {
			// Follow the recommended shops; anything they lack goes where it's cheapest.
			const key =
				comparison.recommended?.assignment.get(item.ingredient.id) ??
				item.shelf?.storeId ??
				item.storeId ??
				'';
			byStore.set(key, [...(byStore.get(key) ?? []), item]);
		}
		return [...byStore]
			.sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
			.map(([id, items]) => [
				id || 'any',
				id ? (catalog.storesById.get(id)?.name ?? id) : 'Kdekoľvek (reálnu cenu zatiaľ nepoznáme)',
				items
			]);
	});
	const checkedCount = $derived(
		allItems.filter((i) => checkedItems.current[i.ingredient.id]).length
	);

	const comparison = $derived(
		compareStores(
			allItems.map((i) => ({ ingredient: i.ingredient, grams: i.buyGrams })),
			catalog.stores,
			catalog.prices,
			today
		)
	);
	const storeName = (id: string) => catalog.storesById.get(id)?.name ?? id;
	const storeNames = (plan: StorePlan) => plan.storeIds.map(storeName).join(' a ');

	/**
	 * What each item costs at the till: whole packs in the recommended shop, or wherever it's
	 * cheapest if that shop lacks it; an estimate (by weight) when no real price is known.
	 */
	const pay = $derived(
		new Map(
			allItems.map((item): [string, { shelf: ShelfCost | null; cost: number }] => {
				const storeId = comparison.recommended?.assignment.get(item.ingredient.id);
				const shelf = storeId
					? shelfCost(item.ingredient, item.buyGrams, catalog.prices, today, storeId)
					: item.shelf;
				return [item.ingredient.id, { shelf, cost: shelf?.cost ?? item.cost }];
			})
		)
	);
	const payTotal = $derived([...pay.values()].reduce((sum, p) => sum + p.cost, 0));
	const payHasEstimates = $derived([...pay.values()].some((p) => !p.shelf));
	/** Shops that have every item with a known price – real one-stop options. */
	const completeShops = $derived(comparison.singles.filter((s) => s.missing === 0));
	const incompleteShops = $derived(comparison.singles.filter((s) => s.missing > 0));

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
			settings.current.planDays,
			(id) => catalog.recipesById.get(id)?.keeps
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

	let extraText = $state('');
	const itemCount = $derived(allItems.length + extraItems.current.length);
	const boughtCount = $derived(checkedCount + extraItems.current.filter((x) => x.checked).length);

	function toggleExtra(id: string) {
		extraItems.current = extraItems.current.map((x) =>
			x.id === id ? { ...x, checked: !x.checked } : x
		);
	}
	function removeExtra(id: string) {
		extraItems.current = extraItems.current.filter((x) => x.id !== id);
	}
	/** Unticks everything; bought extras are done with and go away. */
	function clearChecked() {
		checkedItems.current = {};
		extraItems.current = extraItems.current.filter((x) => !x.checked);
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
		const extras = extraItems.current.filter((x) => !x.checked);
		if (extras.length) lines.push('Navyše:', ...extras.map((x) => `- ${x.text}`));
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
			if (item.restock) setOutOfStock(item.ingredient.id, false);
			const current = pantry.current[item.ingredient.id];
			if (current === null) continue;
			// Whole packs go into the pantry – what the recipes don't use is still at home.
			const shelf = pay.get(item.ingredient.id)?.shelf;
			const bought =
				shelf && Number.isInteger(shelf.packs) ? shelf.packs * shelf.packGrams : item.buyGrams;
			setPantryItem(item.ingredient.id, Math.round((current ?? 0) + bought));
		}
		checkedItems.current = {};
		extraItems.current = extraItems.current.filter((x) => !x.checked);
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

	/** Phones stack everything; these tabs jump straight to the shopping list in the shop. */
	const PLAN_SECTIONS = [
		{ id: 'rozpis', label: 'Týždeň' },
		{ id: 'recepty-v-plane', label: 'Porcie' },
		{ id: 'ziviny', label: 'Živiny' },
		{ id: 'nakup', label: 'Nákup' }
	] as const;
	let currentSection = $state<string>('rozpis');
	$effect(() => {
		if (!entries.length) return;
		const observer = new IntersectionObserver(
			(seen) => {
				for (const entry of seen) if (entry.isIntersecting) currentSection = entry.target.id;
			},
			{ rootMargin: '-35% 0px -60% 0px' }
		);
		for (const s of PLAN_SECTIONS) {
			const el = document.getElementById(s.id);
			if (el) observer.observe(el);
		}
		return () => observer.disconnect();
	});
</script>

<Seo
	title="Plán a nákup"
	description="Naplánuj si jedlá na týždeň a dostaneš jeden nákupný zoznam – bez vecí, ktoré už máš doma."
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

	{#if entries.length}
		<nav class="jump-bar" aria-label="Časti plánu" data-noprint>
			{#each PLAN_SECTIONS as s (s.id)}
				<a href="#{s.id}" class:active={currentSection === s.id}
					>{s.label}{#if s.id === 'nakup' && allItems.length > checkedCount}<span class="n"
							>{allItems.length - checkedCount}</span
						>{/if}</a
				>
			{/each}
		</nav>
	{/if}

	<div class="layout">
		<div class="left">
			{#if ui.loaded && entries.length === 0}
				<section class="card box start">
					<h2>Ako chceš začať?</h2>
					<p class="muted">
						Plán je zatiaľ prázdny. Vyber si, čo ti sedí – všetko sa dá neskôr zmeniť.
					</p>
					<div class="start-grid">
						<button class="start-opt" onclick={startWithPlanner}>
							<span class="start-ico" style:--tone="var(--sky)"
								><Icon name="sparkle" size={22} /></span
							>
							<strong>Navrhni mi týždeň</strong>
							<small>Podľa rozpočtu, bielkovín a toho, čo máš doma.</small>
						</button>
						<button class="start-opt" onclick={openPicker}>
							<span class="start-ico" style:--tone="var(--tomato)"
								><Icon name="bowl" size={22} /></span
							>
							<strong>Vyberiem recepty</strong>
							<small>Nájdi recepty a pridaj ich jedným ťuknutím.</small>
						</button>
						<a class="start-opt" href="/spajza">
							<span class="start-ico" style:--tone="var(--turmeric)"
								><Icon name="jar" size={22} /></span
							>
							<strong>Z toho, čo mám doma</strong>
							<small>Naklikaj špajzu a uvidíš, čo z nej uvaríš.</small>
						</a>
					</div>
				</section>
			{/if}
			<AutoPlanner bind:open={plannerOpen} />
			{#if entries.length}
				<section class="card box" id="rozpis">
					<div class="box-head">
						<h2><Icon name="calendar" size={24} /> Tvoj týždeň</h2>
						<button class="btn leaf small" onclick={openPicker}>
							<Icon name="plus" size={16} /> Pridať recept
						</button>
					</div>
					<PlanSettings />
					<ol class="days">
						{#each schedule.days as day, d (d)}
							<li class:today={d === 0}>
								<span class="day">{dayName(d)}</span>
								<span class="meals">
									{#each day.meals as meal, m (m)}
										{#if meal}
											<span
												class="meal"
												class:cook={meal.kind === 'cook'}
												class:old={meal.freeze || meal.spoils}
											>
												{#if meal.kind === 'cook'}
													{@const r = catalog.recipesById.get(meal.entry.recipeId)}
													{#if r}
														<span class="day-plate" aria-hidden="true"
															><PlateArt
																seed={r.id}
																lines={r.lines}
																byId={catalog.ingredientsById}
																vessel={vesselFor(r.categories)}
																animate={false}
															/></span
														>
													{/if}
												{:else}
													<span class="leftover-ico" aria-hidden="true"
														><Icon name="jar" size={16} /></span
													>
												{/if}
												<span class="meal-text">
													<span class="meal-kind">{meal.kind === 'cook' ? 'Uvariť' : 'Zvyšky'}</span
													>
													<a href="/recepty/{meal.entry.recipeId}">{titleOf(meal.entry.recipeId)}</a
													>
													{#if meal.freeze}<small>tieto porcie hneď zamraz</small>
													{:else if meal.spoils}<small>nevydrží – uvar menej alebo neskôr</small
														>{/if}
												</span>
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
						Rozpis počíta s tým, koľko ktoré jedlo vydrží v chladničke a či sa dá zamraziť. Poradie zmeníš
						tlačidlom „Skôr“. <a href="/wiki/meal-prep">Ako variť na viac dní</a>
					</p>
				</section>
				<section class="card box" id="recepty-v-plane">
					<div class="box-head">
						<h2><Icon name="bowl" size={24} /> Recepty a porcie</h2>
						<button class="btn ghost small" onclick={clearPlan}>
							<Icon name="trash" size={16} />
							{confirmClear ? 'Naozaj?' : 'Vymazať plán'}
						</button>
					</div>

					<ul class="entries">
						{#each entries as e, i (e.key)}
							<li>
								<div class="mini plate-host">
									<PlateArt
										seed={e.recipe.id}
										lines={e.data.lines}
										byId={catalog.ingredientsById}
										vessel={vesselFor(e.recipe.categories)}
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
				</section>
				<section class="card box" id="ziviny">
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

		<section class="card box shop" id="nakup">
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
				{#if hasRealPrices}
					<div class="group-by" role="group" aria-label="Zoradenie zoznamu">
						<button
							class="chip"
							aria-pressed={groupBy === 'aisle'}
							onclick={() => (groupBy = 'aisle')}
						>
							Podľa uličiek
						</button>
						<button
							class="chip"
							aria-pressed={groupBy === 'store'}
							onclick={() => (groupBy = 'store')}
						>
							Kde je najlacnejšie
						</button>
					</div>
				{/if}
				<div class="shop-summary">
					<div
						class="progress"
						role="progressbar"
						aria-label="Nakúpené"
						aria-valuemin="0"
						aria-valuemax={itemCount}
						aria-valuenow={boughtCount}
					>
						<span style:width="{itemCount ? (boughtCount / itemCount) * 100 : 0}%"></span>
					</div>
					<p>
						{#if boughtCount === itemCount}
							<strong>Všetko v košíku.</strong>
						{:else}
							<strong>{boughtCount} z {itemCount}</strong> v košíku
						{/if}
						· zaplatíš {payHasEstimates ? 'asi' : ''} <strong>{formatEur(payTotal)}</strong>
						{#if comparison.recommended}
							· najlacnejšie v {storeNames(comparison.recommended)}
						{/if}
					</p>
				</div>
				{#each groups as [key, label, items] (key)}
					{@const toBuy = items.filter((i) => !checkedItems.current[i.ingredient.id])}
					{#if toBuy.length}
						<div class="cat">
							<h3>{label}</h3>
							<ul>
								{#each toBuy as item (item.ingredient.id)}
									{@render itemRow(item)}
								{/each}
							</ul>
						</div>
					{/if}
				{/each}

				<div class="cat extra">
					<h3>Niečo navyše</h3>
					{#if extraItems.current.length}
						<ul>
							{#each extraItems.current.filter((x) => !x.checked) as x (x.id)}
								{@render extraRow(x)}
							{/each}
						</ul>
					{/if}
					<form
						class="extra-add"
						onsubmit={(e) => {
							e.preventDefault();
							addExtraItem(extraText);
							extraText = '';
						}}
					>
						<label class="sr-only" for="extra-text">Pridať vlastnú položku</label>
						<input
							id="extra-text"
							bind:value={extraText}
							maxlength="80"
							placeholder="Pridať vlastnú vec – káva, papierové utierky…"
						/>
						<button class="btn small" disabled={!extraText.trim()}>
							<Icon name="plus" size={16} /> Pridať
						</button>
					</form>
				</div>

				{#if boughtCount}
					<details class="cat in-cart" open>
						<summary><h3>V košíku ({boughtCount})</h3></summary>
						<ul>
							{#each allItems.filter((i) => checkedItems.current[i.ingredient.id]) as item (item.ingredient.id)}
								{@render itemRow(item)}
							{/each}
							{#each extraItems.current.filter((x) => x.checked) as x (x.id)}
								{@render extraRow(x)}
							{/each}
						</ul>
						{#if checkedCount}
							<button class="btn leaf wide" onclick={boughtToPantry}>
								<Icon name="jar" size={18} /> Nakúpené → do špajze
							</button>
						{/if}
						<button class="link-btn" onclick={clearChecked}>Vyčistiť košík</button>
					</details>
				{/if}

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
					<span>Zaplatíš {payHasEstimates ? 'asi' : ''}</span>
					<strong>{formatEur(payTotal)}</strong>
				</div>
				<p class="muted small used">
					Za celé balenia{comparison.recommended
						? ` v obchode ${storeNames(comparison.recommended)}`
						: ''}. Na tieto recepty z nich spotrebuješ za {formatEur(list.total)}, zvyšok ti ostane.
				</p>

				{#if comparison.recommended}
					{@const rec = comparison.recommended}
					{@const single = comparison.single!}
					{@const extra = comparison.unpricedCost}
					<div class="stores">
						<h3><Icon name="store" size={18} /> Kde nakúpiť</h3>
						<p class="rec">
							{#if rec.storeIds.length > 1}
								Najlacnejšie vyjde nakúpiť v <strong>{storeNames(rec)}</strong> – ušetríš
								{formatEur(single.total - rec.total)} oproti nákupu len v {storeNames(single)}.
							{:else}
								Najlacnejšie je všetko kúpiť v <strong>{storeNames(rec)}</strong>.
								{#if comparison.pair && comparison.pair !== rec}
									Druhý obchod by ušetril len {formatEur(single.total - comparison.pair.total)},
									nevyplatí sa.
								{/if}
							{/if}
							{#if rec.missing}
								{rec.missing === 1 ? '1 vec' : `${rec.missing} veci`} tam nemajú, kúp ich inde.
							{/if}
						</p>
						<ul>
							{#each completeShops.slice(0, 4) as plan (plan.storeIds[0])}
								<li class:best={plan === rec}>
									<span
										class="sdot"
										style:background={catalog.storesById.get(plan.storeIds[0])?.color}
									></span>
									Všetko v {storeNames(plan)}
									<strong>{formatEur(plan.total + extra)}</strong>
								</li>
							{/each}
							{#if comparison.pair && comparison.pair.missing <= single.missing}
								<li class:best={comparison.pair === rec}>
									<span class="sdot two" aria-hidden="true"></span>
									{storeNames(comparison.pair)}
									<strong>{formatEur(comparison.pair.total + extra)}</strong>
								</li>
							{/if}
						</ul>
						{#if incompleteShops.length}
							<p class="muted small">
								{incompleteShops.map((s) => storeName(s.storeIds[0])).join(', ')}
								{incompleteShops.length === 1 ? 'nemá' : 'nemajú'} všetko z nákupu, samé by nestačili.
							</p>
						{/if}
						{#if comparison.unpriced}
							<p class="muted small">
								{comparison.unpriced === 1 ? '1 vec' : `${comparison.unpriced} veci`} z nákupu zatiaľ
								nemá cenu zo žiadneho obchodu, rátame ju odhadom.
							</p>
						{/if}
					</div>
				{:else}
					<p class="muted small">
						Ceny sú zatiaľ odhady. Keď pribudnú reálne ceny z obchodov, tu uvidíš, kde je nákup
						najlacnejší.
					</p>
				{/if}
			{/if}
		</section>
	</div>
</div>

{#snippet itemRow(item: ShoppingItem)}
	{@const checked = !!checkedItems.current[item.ingredient.id]}
	{@const itemPay = pay.get(item.ingredient.id)}
	<li class:checked>
		<label>
			<input type="checkbox" {checked} onchange={() => toggleChecked(item.ingredient.id)} />
			<span class="box-ui" aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span>
			<span class="nm">
				{item.ingredient.name}
				<small>
					{formatGrams(item.buyGrams)}{pieces(item)}
					{#if item.buyGrams < item.needGrams - 0.5}· zvyšok máš doma{/if}
					{#if item.restock}· stačí najmenšie balenie{/if}
					{#if itemPay?.shelf}
						<span title={itemPay.shelf.product}
							>· {Number.isInteger(itemPay.shelf.packs)
								? `${itemPay.shelf.packs}× balenie`
								: 'na váhu'}{groupBy === 'aisle'
								? `, ${storeName(itemPay.shelf.storeId)}`
								: ''}</span
						>
					{:else}· cena odhadom{/if}
				</small>
			</span>
			<span class="price" class:est={!itemPay?.shelf}>{formatEur(itemPay?.cost ?? item.cost)}</span>
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
{/snippet}

{#snippet extraRow(x: ExtraItem)}
	<li class:checked={x.checked}>
		<label>
			<input type="checkbox" checked={x.checked} onchange={() => toggleExtra(x.id)} />
			<span class="box-ui" aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span>
			<span class="nm">{x.text}</span>
		</label>
		<button class="undo" aria-label="Odstrániť: {x.text}" onclick={() => removeExtra(x.id)}>
			<Icon name="x" size={14} />
		</button>
	</li>
{/snippet}

<dialog
	class="sheet picker-sheet"
	bind:this={pickerDialog}
	onclick={(e) => e.target === pickerDialog && closePicker()}
	aria-labelledby="picker-title"
>
	<div class="sheet-inner">
		<header class="sheet-head">
			<h2 id="picker-title"><Icon name="plus" size={22} /> Pridať recept</h2>
			<button class="close" onclick={closePicker} aria-label="Zavrieť">
				<Icon name="x" size={20} />
			</button>
		</header>
		<RecipePicker />
	</div>
</dialog>

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
	.jump-bar {
		position: sticky;
		top: 64px;
		z-index: 6;
		display: flex;
		gap: 4px;
		margin: 0 -16px 12px;
		padding: 6px 16px;
		background: color-mix(in srgb, var(--paper) 90%, transparent);
		backdrop-filter: blur(10px);
	}
	.jump-bar a {
		flex: 1;
		display: inline-flex;
		justify-content: center;
		align-items: center;
		gap: 5px;
		padding: 7px 8px;
		border-radius: 999px;
		color: var(--ink-2);
		font-weight: 650;
		font-size: 0.9rem;
		text-decoration: none;
		transition:
			background 0.2s,
			color 0.2s;
	}
	.jump-bar a.active {
		background: var(--ink);
		color: var(--paper);
	}
	.jump-bar .n {
		padding: 0 6px;
		border-radius: 999px;
		background: var(--tomato);
		color: #fff;
		font-size: 0.72rem;
	}
	#recepty-v-plane,
	#rozpis,
	#ziviny,
	#nakup {
		scroll-margin-top: 120px;
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
	.group-by {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
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
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
		align-items: center;
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
		gap: 10px;
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
	.start {
		display: grid;
		gap: 10px;
	}
	.start h2 {
		margin: 0;
	}
	.start p {
		margin: 0;
	}
	.start-grid {
		display: grid;
		gap: 10px;
		margin-top: 6px;
	}
	.start-opt {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto;
		column-gap: 12px;
		align-items: center;
		padding: 14px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition:
			transform 0.25s var(--ease-spring),
			border-color 0.2s;
	}
	.start-opt:hover {
		transform: translateY(-2px);
		border-color: var(--leaf-2);
	}
	.start-opt small {
		grid-column: 2;
		color: var(--muted);
	}
	.start-ico {
		grid-row: span 2;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--tone) 18%, transparent);
		color: color-mix(in srgb, var(--tone) 70%, var(--ink));
	}
	@media (min-width: 720px) {
		.start-grid {
			grid-template-columns: repeat(3, 1fr);
		}
		.start-opt {
			grid-template-columns: 1fr;
			row-gap: 6px;
			align-content: start;
		}
		.start-opt small {
			grid-column: 1;
		}
		.start-ico {
			grid-row: auto;
		}
	}
	.days li.today {
		background: color-mix(in srgb, var(--leaf-2) 8%, transparent);
		border-radius: var(--radius-sm);
		padding-inline: 8px;
		margin-inline: -8px;
	}
	.day-plate {
		flex: none;
		display: block;
		width: 34px;
		height: 34px;
	}
	.leftover-ico {
		flex: none;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--paper-2);
		color: var(--muted);
	}
	.meal-text {
		display: grid;
		line-height: 1.25;
	}
	.meal-kind {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.meal-text a {
		color: inherit;
		text-decoration: none;
	}
	.meal-text a:hover {
		text-decoration: underline;
	}
	.sheet {
		width: min(640px, 100%);
		max-width: 100%;
		max-height: min(88dvh, 900px);
		margin: auto auto 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius) var(--radius) 0 0;
		background: var(--card);
		color: var(--ink);
		box-shadow: var(--shadow-lift);
	}
	.sheet[open] {
		animation: sheet-up 0.35s var(--ease-out);
	}
	.sheet::backdrop {
		background: rgba(17, 26, 20, 0.45);
		backdrop-filter: blur(2px);
	}
	@keyframes sheet-up {
		from {
			transform: translateY(40%);
			opacity: 0;
		}
	}
	@media (min-width: 700px) {
		.sheet {
			margin: auto;
			border-radius: var(--radius);
		}
	}
	.sheet-inner {
		display: grid;
		gap: 12px;
		padding: 0 20px 22px;
		max-height: inherit;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.sheet-head {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 0 10px;
		background: var(--card);
	}
	.sheet-head h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 1.4rem;
	}
	.close {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 50%;
		background: var(--paper-2);
		color: var(--ink);
		cursor: pointer;
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
	.settings input {
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--paper);
		padding: 4px 8px;
		margin: 0 4px;
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
	.shop-summary {
		position: sticky;
		top: -20px;
		z-index: 2;
		display: grid;
		gap: 6px;
		margin: 4px 0 14px;
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: var(--paper);
	}
	.shop-summary p {
		margin: 0;
		font-size: 0.9rem;
	}
	.progress {
		height: 8px;
		border-radius: 999px;
		background: var(--paper-2);
		overflow: hidden;
	}
	.progress span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--leaf-2);
		transition: width 0.4s var(--ease-out);
	}
	.extra-add {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.extra-add input {
		flex: 1;
		min-width: 0;
		padding: 8px 12px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		font-size: 0.9rem;
	}
	.in-cart summary {
		cursor: pointer;
		list-style: none;
	}
	.in-cart summary::-webkit-details-marker {
		display: none;
	}
	.in-cart summary h3::after {
		content: ' ▾';
		color: var(--muted);
	}
	.in-cart:not([open]) summary h3::after {
		content: ' ▸';
	}
	.link-btn {
		display: block;
		margin: 10px auto 0;
		border: 0;
		background: none;
		color: var(--ink-2);
		font: inherit;
		font-size: 0.86rem;
		text-decoration: underline;
		cursor: pointer;
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
	.used {
		margin: 6px 0 0;
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
	.rec {
		margin: 4px 0 10px;
		font-size: 0.92rem;
	}
	.sdot.two {
		background: linear-gradient(135deg, var(--leaf) 50%, var(--sky) 50%);
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
		.jump-bar {
			display: none;
		}
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

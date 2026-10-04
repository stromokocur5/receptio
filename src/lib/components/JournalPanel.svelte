<script lang="ts">
	import { formatNumber, toGrams } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import NutrientBars from '$lib/components/NutrientBars.svelte';
	import {
		addItem,
		addWater,
		dayTotals,
		EMPTY_DAY,
		itemNutrients,
		localToday,
		NO_JOURNAL,
		removeItem,
		shiftDate,
		WATER_STEP_ML,
		withDay,
		type JournalDay,
		type JournalItem
	} from '$lib/journal';
	import { normalizeSearch, ingredientSearchText } from '$lib/labels';
	import { history, journal } from '$lib/state.svelte';
	import type { Ingredient, NutrientKey, Nutrients, RecipeSummary, Unit } from '$lib/types';

	let { targets }: { targets: Nutrients } = $props();

	const catalog = useCatalog();
	const dayFormat = new Intl.DateTimeFormat('sk-SK', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});

	const today = localToday();
	let date = $state(today);
	const day = $derived(journal.current.days[date] ?? EMPTY_DAY);
	const totals = $derived(dayTotals(day, catalog.recipesById, catalog.ingredientsById));
	const barKeys = $derived<NutrientKey[]>([
		...(journal.current.showKcal ? (['kcal'] as const) : []),
		'protein',
		'fiber',
		'iron',
		'calcium',
		'zinc',
		'ala'
	]);
	const glasses = $derived(Math.ceil(journal.current.waterGoalMl / WATER_STEP_ML));
	const fullGlasses = $derived(Math.floor(day.waterMl / WATER_STEP_ML));

	/** Recipes cooked on the shown day, offered as one-tap entries. */
	const cookedThatDay = $derived(
		[
			...new Map(
				history.current
					.filter((h) => h.date === date && catalog.recipesById.has(h.recipeId))
					.map((h) => [`${h.recipeId}|${h.variant ?? ''}`, h])
			).values()
		].filter(
			(h) =>
				!day.items.some(
					(i) => i.kind === 'recipe' && i.recipeId === h.recipeId && i.variant === h.variant
				)
		)
	);

	function change(fn: (d: JournalDay) => JournalDay) {
		journal.current = withDay(journal.current, date, fn, today);
	}
	const newId = () => crypto.randomUUID().slice(0, 8);

	// ── Adding food ────────────────────────────────────────────
	let query = $state('');
	type Pick =
		{ kind: 'recipe'; recipe: RecipeSummary } | { kind: 'ingredient'; ingredient: Ingredient };
	let picked = $state<Pick | null>(null);
	let portions = $state(1);
	let amount = $state(100);
	let unit = $state<Unit>('g');
	let custom = $state(false);
	let customName = $state('');
	let customKcal = $state<number | null>(null);
	let customProtein = $state<number | null>(null);

	const results = $derived.by(() => {
		const q = normalizeSearch(query.trim());
		if (q.length < 2) return { recipes: [], ingredients: [] };
		const rank = (name: string) => (name.startsWith(q) ? 0 : 1);
		const recipes = catalog.recipes
			.map((r) => ({ r, name: normalizeSearch(r.title) }))
			.filter(({ name }) => name.includes(q))
			.sort((a, b) => rank(a.name) - rank(b.name))
			.slice(0, 5)
			.map(({ r }) => r);
		const ingredients = catalog.ingredients
			.filter((i) => i.id !== 'voda' && !i.byproduct)
			.map((i) => ({ i, name: normalizeSearch(i.name) }))
			.filter(({ i }) => ingredientSearchText(i).includes(q))
			.sort((a, b) => rank(a.name) - rank(b.name))
			.slice(0, 6)
			.map(({ i }) => i);
		return { recipes, ingredients };
	});

	const pickedUnits = $derived(
		picked?.kind === 'ingredient'
			? (['g', ...Object.keys(picked.ingredient.units).filter((u) => u !== 'g')] as Unit[])
			: []
	);

	function pick(p: Pick) {
		picked = p;
		query = '';
		portions = 1;
		unit = 'g';
		amount = 100;
		if (p.kind === 'ingredient' && p.ingredient.units.ks) {
			unit = 'ks';
			amount = 1;
		}
	}

	function addPicked() {
		if (!picked) return;
		if (picked.kind === 'recipe') {
			if (!(portions > 0)) return;
			change((d) =>
				addItem(d, {
					id: newId(),
					kind: 'recipe',
					recipeId: picked!.kind === 'recipe' ? picked!.recipe.id : '',
					portions: Math.min(20, portions)
				})
			);
		} else {
			const grams = Math.round(toGrams(amount, unit, picked.ingredient));
			if (!(grams >= 1)) return;
			const ingredientId = picked.ingredient.id;
			change((d) =>
				addItem(d, { id: newId(), kind: 'ingredient', ingredientId, grams: Math.min(5000, grams) })
			);
		}
		picked = null;
	}

	function addCustom() {
		const name = customName.trim().slice(0, 60);
		if (!name) return;
		const clean = (v: number | null, max: number) =>
			typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : null;
		change((d) =>
			addItem(d, {
				id: newId(),
				kind: 'custom',
				name,
				kcal: clean(customKcal, 5000),
				protein: clean(customProtein, 500)
			})
		);
		customName = '';
		customKcal = null;
		customProtein = null;
		custom = false;
	}

	function itemLabel(item: JournalItem): string {
		if (item.kind === 'recipe') {
			const title = catalog.recipesById.get(item.recipeId)?.title ?? item.recipeId;
			const n = formatNumber(item.portions);
			return `${title}${item.variant ? ` (${item.variant})` : ''} · ${n} ${item.portions === 1 ? 'porcia' : item.portions < 5 ? 'porcie' : 'porcií'}`;
		}
		if (item.kind === 'ingredient') {
			return `${catalog.ingredientsById.get(item.ingredientId)?.name ?? item.ingredientId} · ${item.grams} g`;
		}
		return item.name;
	}

	function itemFacts(item: JournalItem): string {
		const n = itemNutrients(item, catalog.recipesById, catalog.ingredientsById);
		if (!n) return 'hodnoty nepoznáme';
		const facts = [];
		if (journal.current.showKcal) facts.push(`${formatNumber(n.kcal, 0)} kcal`);
		facts.push(`bielk. ${formatNumber(n.protein, 0)} g`);
		if (item.kind !== 'custom') facts.push(`vlákn. ${formatNumber(n.fiber)} g`);
		return facts.join(' · ');
	}

	function setPref(patch: Partial<typeof NO_JOURNAL>) {
		journal.current = { ...journal.current, ...patch };
	}

	let confirmClear = $state(false);
</script>

<section class="card journal" id="dennik">
	<h2><Icon name="cup" size={24} /> Denník jedla a vody</h2>

	{#if !journal.current.enabled}
		<p>
			Zapisuj si vodu a jedlá a uvidíš, koľko máš za deň bielkovín, vlákniny, železa či vápnika.
			Recepty z Receptia a suroviny sa spočítajú samé, kúpené veci zadáš ručne. Kalórie sú skryté,
			kým si ich sám/sama nezapneš.
		</p>
		<button class="btn leaf" onclick={() => setPref({ enabled: true })}>
			<Icon name="plus" size={18} /> Zapnúť denník
		</button>
		<p class="muted small">
			Záznamy ostávajú len v tomto prehliadači (a v synchronizácii, ak ju máš).
		</p>
	{:else}
		<div class="daynav">
			<button
				class="btn ghost small"
				aria-label="Predchádzajúci deň"
				onclick={() => (date = shiftDate(date, -1))}><Icon name="arrow-left" size={16} /></button
			>
			<strong>{date === today ? 'Dnes' : dayFormat.format(new Date(`${date}T12:00:00`))}</strong>
			<button
				class="btn ghost small"
				aria-label="Ďalší deň"
				disabled={date >= today}
				onclick={() => (date = shiftDate(date, 1))}><Icon name="arrow-right" size={16} /></button
			>
		</div>

		<div class="water">
			<div class="water-head">
				<h3><Icon name="drop" size={18} /> Voda</h3>
				<p>
					<strong>{formatNumber(day.waterMl / 1000, 2)} l</strong>
					<span class="muted">z {formatNumber(journal.current.waterGoalMl / 1000, 1)} l</span>
				</p>
			</div>
			<div class="glasses" aria-hidden="true">
				{#each { length: Math.max(glasses, fullGlasses) } as _, i (i)}
					<span class="glass" class:full={i < fullGlasses}></span>
				{/each}
			</div>
			<div class="water-actions">
				<button
					class="btn ghost small"
					disabled={day.waterMl === 0}
					onclick={() => change((d) => addWater(d, -WATER_STEP_ML))}
				>
					<Icon name="minus" size={16} /> Pohár
				</button>
				<button class="btn leaf small" onclick={() => change((d) => addWater(d, WATER_STEP_ML))}>
					<Icon name="plus" size={16} /> Pohár (250 ml)
				</button>
			</div>
		</div>

		<h3><Icon name="bowl" size={18} /> Jedlo</h3>
		{#if cookedThatDay.length}
			<div class="chips" role="group" aria-label="Uvarené v ten deň">
				{#each cookedThatDay as h (`${h.recipeId}|${h.variant ?? ''}`)}
					<button
						class="chip"
						onclick={() =>
							change((d) =>
								addItem(
									d,
									h.variant
										? {
												id: newId(),
												kind: 'recipe',
												recipeId: h.recipeId,
												variant: h.variant,
												portions: 1
											}
										: { id: newId(), kind: 'recipe', recipeId: h.recipeId, portions: 1 }
								)
							)}
					>
						<Icon name="plus" size={13} />
						{catalog.recipesById.get(h.recipeId)?.title} · 1 porcia
					</button>
				{/each}
			</div>
		{/if}

		{#if picked}
			<div class="picked">
				<p>
					<strong>{picked.kind === 'recipe' ? picked.recipe.title : picked.ingredient.name}</strong>
				</p>
				<div class="picked-row">
					{#if picked.kind === 'recipe'}
						<label class="field small-field">
							<span>Porcie</span>
							<input type="number" min="0.25" max="20" step="any" bind:value={portions} />
						</label>
					{:else}
						<label class="field small-field">
							<span class="sr-only">Množstvo</span>
							<input type="number" min="0" max="5000" step="any" bind:value={amount} />
						</label>
						{#if pickedUnits.length > 1}
							<label class="field small-field">
								<span class="sr-only">Jednotka</span>
								<select bind:value={unit}>
									{#each pickedUnits as u (u)}<option value={u}>{u}</option>{/each}
								</select>
							</label>
						{:else}
							<span>g</span>
						{/if}
					{/if}
					<button class="btn leaf small" onclick={addPicked}>Zapísať</button>
					<button class="btn ghost small" onclick={() => (picked = null)}>Zrušiť</button>
				</div>
				{#if picked.kind === 'recipe' && !picked.recipe.showNutrition}
					<p class="muted small">
						Pri tomto recepte hodnoty nepoznáme (cedí sa). Zapíš radšej hotový výrobok, napríklad
						tofu v gramoch.
					</p>
				{/if}
			</div>
		{:else if custom}
			<form
				class="picked"
				onsubmit={(e) => {
					e.preventDefault();
					addCustom();
				}}
			>
				<label class="field small-field">
					<span class="sr-only">Čo to bolo</span>
					<input
						bind:value={customName}
						maxlength="60"
						placeholder="Napr. sezamová tyčinka"
						required
					/>
				</label>
				<div class="picked-row">
					<label class="field small-field">
						<span>Bielkoviny g</span>
						<input type="number" min="0" max="500" step="any" bind:value={customProtein} />
					</label>
					{#if journal.current.showKcal}
						<label class="field small-field">
							<span>kcal</span>
							<input type="number" min="0" max="5000" step="any" bind:value={customKcal} />
						</label>
					{/if}
					<button class="btn leaf small" type="submit">Zapísať</button>
					<button class="btn ghost small" type="button" onclick={() => (custom = false)}
						>Zrušiť</button
					>
				</div>
				<p class="muted small">Čísla nájdeš na obale. Ak ich nepoznáš, nechaj prázdne.</p>
			</form>
		{:else}
			<label class="field small-field">
				<Icon name="search" size={16} />
				<span class="sr-only">Hľadaj recept alebo surovinu</span>
				<input
					type="search"
					bind:value={query}
					placeholder="Recept alebo surovina: dal, jablko, tofu…"
					autocomplete="off"
				/>
			</label>
			{#if results.recipes.length || results.ingredients.length}
				<ul class="results">
					{#each results.recipes as r (r.id)}
						<li>
							<button onclick={() => pick({ kind: 'recipe', recipe: r })}>
								<Icon name="bowl" size={15} />
								{r.title}
								<small class="muted">recept</small>
							</button>
						</li>
					{/each}
					{#each results.ingredients as i (i.id)}
						<li>
							<button onclick={() => pick({ kind: 'ingredient', ingredient: i })}>
								<Icon name="leaf" size={15} />
								{i.name}
								<small class="muted">surovina</small>
							</button>
						</li>
					{/each}
				</ul>
			{:else if query.trim().length >= 2}
				<p class="muted small">Nič také nemáme.</p>
			{/if}
			<button class="btn ghost small other" onclick={() => (custom = true)}>
				<Icon name="pencil" size={15} /> Niečo kúpené alebo mimo Receptia
			</button>
		{/if}

		{#if day.items.length}
			<ul class="items">
				{#each day.items as item (item.id)}
					<li>
						<span class="name">{itemLabel(item)}</span>
						<span class="muted small">{itemFacts(item)}</span>
						<button
							class="icon-btn"
							aria-label="Odstrániť: {itemLabel(item)}"
							onclick={() => change((d) => removeItem(d, item.id))}
						>
							<Icon name="x" size={16} />
						</button>
					</li>
				{/each}
			</ul>

			<h3>Spolu za deň</h3>
			<NutrientBars values={totals.nutrients} {targets} keys={barKeys} />
			{#if totals.unknown || totals.partial}
				<p class="muted small">
					{#if totals.unknown}Pri {totals.unknown}
						{totals.unknown === 1 ? 'položke' : 'položkách'} hodnoty nepoznáme.{/if}
					{#if totals.partial}Kúpené veci sa rátajú len do bielkovín{journal.current.showKcal
							? ' a kalórií'
							: ''}.{/if}
					Skutočné čísla sú teda vyššie.
				</p>
			{/if}
		{:else}
			<p class="muted">V tento deň zatiaľ nič.</p>
		{/if}
		<p class="muted small">
			Hodnoty sú orientačné (USDA, surové suroviny). B12 z jedla nezískaš,
			<a href="/wiki/b12">suplementuj</a>. Koľko piť, nájdeš v návode
			<a href="/wiki/pitny-rezim">Pitný režim</a>.
		</p>

		<details class="prefs">
			<summary>Nastavenia denníka</summary>
			<label class="check">
				<input
					type="checkbox"
					checked={journal.current.showKcal}
					onchange={(e) => setPref({ showKcal: e.currentTarget.checked })}
				/>
				Ukazovať kalórie
			</label>
			<label class="field small-field goal">
				<span>Cieľ vody (ml)</span>
				<input
					type="number"
					min="500"
					max="5000"
					step="250"
					value={journal.current.waterGoalMl}
					onchange={(e) => {
						const v = Number(e.currentTarget.value);
						if (v >= 500 && v <= 5000) setPref({ waterGoalMl: Math.round(v) });
					}}
				/>
			</label>
			<div class="pref-actions">
				<button class="btn ghost small" onclick={() => setPref({ enabled: false })}>
					Skryť denník
				</button>
				{#if confirmClear}
					<button
						class="btn small danger"
						onclick={() => {
							setPref({ days: {} });
							confirmClear = false;
						}}
					>
						Naozaj zmazať všetky záznamy
					</button>
				{:else}
					<button class="btn ghost small" onclick={() => (confirmClear = true)}>
						<Icon name="trash" size={15} /> Zmazať záznamy
					</button>
				{/if}
			</div>
			<p class="muted small">Skrytý denník si záznamy nechá. Uchovávajú sa posledné 3 mesiace.</p>
		</details>
	{/if}
</section>

<style>
	.journal {
		margin-bottom: 20px;
		padding: 20px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.4rem;
		margin: 0 0 12px;
	}
	h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 1.05rem;
		margin: 18px 0 10px;
	}
	.daynav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 6px;
		border-radius: 14px;
		background: var(--paper-2);
	}
	.daynav strong {
		text-align: center;
		text-transform: capitalize;
	}
	.water-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
	}
	.water-head h3 {
		margin-bottom: 4px;
	}
	.water-head p {
		margin: 0;
	}
	.glasses {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 8px 0 10px;
	}
	.glass {
		width: 18px;
		height: 24px;
		border: 2px solid var(--line);
		border-top: none;
		border-radius: 0 0 6px 6px;
		background: transparent;
		transition: background 0.25s;
	}
	.glass.full {
		border-color: var(--sky, #4a90c2);
		background: linear-gradient(to top, var(--sky, #4a90c2) 75%, transparent 75%);
	}
	.water-actions,
	.picked-row,
	.pref-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 10px;
	}
	.picked {
		display: grid;
		gap: 8px;
		padding: 12px;
		border-radius: 14px;
		background: var(--paper-2);
	}
	.picked p {
		margin: 0;
	}
	.picked-row .field {
		flex: 0 1 9em;
		min-width: 0;
	}
	.picked-row .field input {
		min-width: 0;
		width: 100%;
	}
	.results {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	.results button {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 10px;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.results button:hover,
	.results button:focus-visible {
		background: var(--paper-2);
	}
	.results small {
		margin-left: auto;
	}
	.other {
		margin-top: 10px;
	}
	.items {
		list-style: none;
		margin: 14px 0 0;
		padding: 0;
	}
	.items li {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2px 10px;
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
	}
	.items .name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.items .muted {
		grid-row: 2;
	}
	.icon-btn {
		grid-row: 1 / span 2;
		grid-column: 2;
		align-self: center;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--ink-2);
		cursor: pointer;
	}
	.icon-btn:hover {
		background: var(--tomato-soft);
	}
	.prefs {
		margin-top: 16px;
	}
	.prefs summary {
		cursor: pointer;
		font-weight: 650;
	}
	.prefs > * + * {
		margin-top: 10px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.goal {
		max-width: 16em;
	}
	.danger {
		background: var(--tomato-soft);
	}
	.small {
		font-size: 0.84rem;
	}
	a {
		color: var(--ink);
		font-weight: 650;
	}
</style>

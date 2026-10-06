<script lang="ts">
	import { formatNumber, toGrams } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import NutrientBars from '$lib/components/NutrientBars.svelte';
	import SupplementsPanel from '$lib/components/SupplementsPanel.svelte';
	import WaterReminders from '$lib/components/WaterReminders.svelte';
	import {
		addItem,
		addWater,
		dayTotals,
		compactJournal,
		EMPTY_DAY,
		JOURNAL_DAYS_KEPT,
		averageNutrients,
		itemNutrients,
		localToday,
		MIN_DAYS_FOR_GAPS,
		nutrientGaps,
		recentTotals,
		recipesRichIn,
		NO_JOURNAL,
		removeItem,
		setPortions,
		shiftDate,
		WATER_STEP_ML,
		withDay,
		DIARY_MEALS,
		DIARY_MEAL_LABELS,
		LABEL_KEYS,
		LABEL_MAX,
		mealAt,
		removeSavedFood,
		saveFood,
		savedFoodItem,
		type DiaryMeal,
		type JournalDay,
		type JournalItem,
		type LabelValues,
		type SavedFood
	} from '$lib/journal';
	import { normalizeSearch, ingredientSearchText } from '$lib/labels';
	import {
		ACTIVITY_LABELS,
		ACTIVITY_PROTEIN,
		dailyTargets,
		GOAL_KEYS,
		GOAL_LIMITS,
		NUTRIENT_META,
		type Activity,
		type GoalKey
	} from '$lib/nutrition';
	import { history, journal, settings } from '$lib/state.svelte';
	import { onMount } from 'svelte';
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
	const oldestDate = shiftDate(today, -(JOURNAL_DAYS_KEPT - 1));
	const day = $derived(journal.current.days[date] ?? EMPTY_DAY);
	/** Days older than three months only have totals left and can't be edited. */
	const summary = $derived(
		journal.current.days[date] ? undefined : journal.current.summaries[date]
	);

	onMount(() => {
		const compacted = compactJournal(
			journal.current,
			today,
			catalog.recipesById,
			catalog.ingredientsById
		);
		if (compacted !== journal.current) journal.current = compacted;
	});
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
	// ── The last seven days ─────────────────────────────────────
	const recent = $derived(
		recentTotals(journal.current, today, catalog.recipesById, catalog.ingredientsById)
	);
	const weekAverage = $derived(averageNutrients(recent));
	const gaps = $derived(
		recent.length >= MIN_DAYS_FOR_GAPS
			? nutrientGaps(
					weekAverage,
					targets,
					barKeys.filter((k) => k !== 'kcal')
				).slice(0, 3)
			: []
	);
	const gapRecipes = $derived.by(() => {
		const shown = new Set<string>();
		return gaps.map((key) => {
			const recipes = recipesRichIn(catalog.recipes, key, 3, shown);
			for (const r of recipes) shown.add(r.id);
			return { key, recipes };
		});
	});

	// ── Goals ──────────────────────────────────────────────────
	const goals = $derived(journal.current.goals);
	/** What each goal would be without the user's own number, shown as the placeholder. */
	const autoTargets = $derived(
		dailyTargets(settings.current.weightKg, { activity: goals.activity, custom: {} })
	);
	const goalKeys = $derived(GOAL_KEYS.filter((k) => k !== 'kcal' || journal.current.showKcal));
	function setActivity(activity: Activity) {
		setPref({ goals: { ...goals, activity } });
	}
	function setGoal(key: GoalKey, raw: string) {
		const { [key]: _old, ...rest } = goals.custom;
		const [min, max] = GOAL_LIMITS[key];
		const v = Number(raw.replace(',', '.'));
		const custom = raw.trim() && v >= min && v <= max ? { ...rest, [key]: v } : rest;
		setPref({ goals: { ...goals, custom } });
	}
	function setWeight(raw: string) {
		const v = Number(raw.replace(',', '.'));
		settings.current = {
			...settings.current,
			weightKg: raw.trim() && v >= 20 && v <= 250 ? Math.round(v) : null
		};
	}

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
	/** The meal new entries go to; starts at the one this time of day suggests. */
	let meal = $state<DiaryMeal>(mealAt(new Date()));
	type Pick =
		| { kind: 'recipe'; recipe: RecipeSummary }
		| { kind: 'ingredient'; ingredient: Ingredient }
		| { kind: 'saved'; food: SavedFood };
	let picked = $state<Pick | null>(null);
	let portions = $state(1);
	let amount = $state(100);
	let unit = $state<Unit>('g');
	let custom = $state(false);
	let customName = $state('');
	let customPer100g = $state(false);
	let customGrams = $state(100);
	let customSave = $state(true);
	const emptyLabel = (): LabelValues =>
		Object.fromEntries(LABEL_KEYS.map((k) => [k, null])) as unknown as LabelValues;
	let customValues = $state(emptyLabel());
	/** What every label lists; the rest is printed only on some packs. */
	const MAIN_LABEL: NutrientKey[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'salt'];
	const labelField = (key: NutrientKey) => ({
		key,
		label: key === 'kcal' ? 'kcal' : `${NUTRIENT_META[key].label} ${NUTRIENT_META[key].unit}`,
		max: LABEL_MAX[key]
	});
	const mainFields = $derived(
		MAIN_LABEL.filter((k) => k !== 'kcal' || journal.current.showKcal).map(labelField)
	);
	const extraFields = LABEL_KEYS.filter((k) => !MAIN_LABEL.includes(k)).map(labelField);
	const savedFoods = $derived(journal.current.foods);

	const results = $derived.by(() => {
		const q = normalizeSearch(query.trim());
		if (q.length < 2) return { foods: [], recipes: [], ingredients: [] };
		const foods = savedFoods.filter((f) => normalizeSearch(f.name).includes(q)).slice(0, 4);
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
		return { foods, recipes, ingredients };
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
		if (p.kind === 'saved' && !p.food.per100g) amount = 1;
		if (p.kind === 'ingredient' && p.ingredient.units.ks) {
			unit = 'ks';
			amount = 1;
		}
	}

	function addPicked() {
		if (!picked) return;
		if (picked.kind === 'saved') {
			const food = picked.food;
			if (!(amount > 0)) return;
			change((d) => addItem(d, savedFoodItem(food, Math.min(5000, amount), newId(), meal)));
		} else if (picked.kind === 'recipe') {
			if (!(portions > 0)) return;
			change((d) =>
				addItem(d, {
					id: newId(),
					kind: 'recipe',
					recipeId: picked!.kind === 'recipe' ? picked!.recipe.id : '',
					portions: Math.min(20, portions),
					meal
				})
			);
		} else {
			const grams = Math.round(toGrams(amount, unit, picked.ingredient));
			if (!(grams >= 1)) return;
			const ingredientId = picked.ingredient.id;
			change((d) =>
				addItem(d, {
					id: newId(),
					kind: 'ingredient',
					ingredientId,
					grams: Math.min(5000, grams),
					meal
				})
			);
		}
		picked = null;
	}

	function addCustom() {
		const name = customName.trim().slice(0, 60);
		if (!name) return;
		const values = Object.fromEntries(
			LABEL_KEYS.map(labelField).map(({ key, max }) => {
				const v = customValues[key];
				return [
					key,
					typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : null
				];
			})
		) as unknown as LabelValues;
		const food = { name, per100g: customPer100g, ...values };
		if (customPer100g && !(customGrams > 0)) return;
		const item: JournalItem = customPer100g
			? savedFoodItem({ ...food, id: '' }, Math.min(5000, customGrams), newId(), meal)
			: { id: newId(), kind: 'custom', ...values, name, meal };
		change((d) => addItem(d, item));
		if (customSave) journal.current = saveFood(journal.current, food, newId());
		customName = '';
		customValues = emptyLabel();
		customGrams = 100;
		custom = false;
	}

	/** The day's entries under their meals, in the order of the day; older entries had none. */
	const mealGroups = $derived.by(() => {
		const groups: { meal: DiaryMeal | null; items: JournalItem[] }[] = [];
		for (const m of [...DIARY_MEALS, null]) {
			const items = day.items.filter((i) => (i.meal ?? null) === m);
			if (items.length) groups.push({ meal: m, items });
		}
		return groups;
	});
	function groupFacts(items: JournalItem[]): string {
		let kcal = 0;
		let protein = 0;
		for (const item of items) {
			const n = itemNutrients(item, catalog.recipesById, catalog.ingredientsById);
			kcal += n?.kcal ?? 0;
			protein += n?.protein ?? 0;
		}
		return journal.current.showKcal
			? `${formatNumber(kcal, 0)} kcal · bielk. ${formatNumber(protein, 0)} g`
			: `bielk. ${formatNumber(protein, 0)} g`;
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
		if (item.kind !== 'custom' || item.fiber !== null)
			facts.push(`vlákn. ${formatNumber(n.fiber)} g`);
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
				disabled={date <= oldestDate}
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

		{#if summary}
			<p class="water-old">
				<Icon name="drop" size={18} /> Voda:
				<strong>{formatNumber(summary.waterMl / 1000, 2)} l</strong>
				<span class="muted">· zjedené: {summary.items}×</span>
			</p>
			{#if summary.items}
				<NutrientBars values={summary.nutrients} {targets} keys={barKeys} />
			{/if}
			<p class="muted small">
				Pri dňoch starších ako 3 mesiace si denník pamätá len súčty, aby sa zmestil celý rok.
			</p>
		{:else}
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
				<WaterReminders
					todayMl={journal.current.days[today]?.waterMl ?? 0}
					goalMl={journal.current.waterGoalMl}
				/>
			</div>

			<SupplementsPanel {date} {today} />

			<h3><Icon name="bowl" size={18} /> Jedlo</h3>
			<div class="chips meal-pick" role="group" aria-label="Ku ktorému jedlu zapisuješ">
				{#each DIARY_MEALS as m (m)}
					<button class="chip" aria-pressed={meal === m} onclick={() => (meal = m)}
						>{DIARY_MEAL_LABELS[m]}</button
					>
				{/each}
			</div>
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
													portions: 1,
													meal
												}
											: { id: newId(), kind: 'recipe', recipeId: h.recipeId, portions: 1, meal }
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
						<strong
							>{picked.kind === 'recipe'
								? picked.recipe.title
								: picked.kind === 'saved'
									? picked.food.name
									: picked.ingredient.name}</strong
						>
					</p>
					<div class="picked-row">
						{#if picked.kind === 'recipe'}
							<label class="field small-field">
								<span>Porcie</span>
								<input type="number" min="0.25" max="20" step="any" bind:value={portions} />
							</label>
						{:else if picked.kind === 'saved'}
							<label class="field small-field">
								<span class="sr-only">Množstvo</span>
								<input type="number" min="0" max="5000" step="any" bind:value={amount} />
							</label>
							<span>{picked.food.per100g ? 'g' : 'ks'}</span>
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
					<div class="chips" role="group" aria-label="Hodnoty z obalu sú">
						<button
							type="button"
							class="chip"
							aria-pressed={!customPer100g}
							onclick={() => (customPer100g = false)}>Na porciu</button
						>
						<button
							type="button"
							class="chip"
							aria-pressed={customPer100g}
							onclick={() => (customPer100g = true)}>Na 100 g</button
						>
					</div>
					<div class="picked-row label-row">
						{#if customPer100g}
							<label class="field small-field">
								<span>Zjedené g</span>
								<input type="number" min="1" max="5000" step="any" bind:value={customGrams} />
							</label>
						{/if}
						{#each mainFields as f (f.key)}
							<label class="field small-field">
								<span>{f.label}</span>
								<input
									type="number"
									min="0"
									max={f.max}
									step="any"
									bind:value={customValues[f.key]}
								/>
							</label>
						{/each}
					</div>
					<details class="more-label">
						<summary>Ďalšie z obalu (železo, vápnik, B12…)</summary>
						<div class="picked-row label-row">
							{#each extraFields as f (f.key)}
								<label class="field small-field">
									<span>{f.label}</span>
									<input
										type="number"
										min="0"
										max={f.max}
										step="any"
										bind:value={customValues[f.key]}
									/>
								</label>
							{/each}
						</div>
					</details>
					<label class="check">
						<input type="checkbox" bind:checked={customSave} /> Uložiť medzi moje potraviny
					</label>
					<div class="picked-row">
						<button class="btn leaf small" type="submit">Zapísať</button>
						<button class="btn ghost small" type="button" onclick={() => (custom = false)}
							>Zrušiť</button
						>
					</div>
					<p class="muted small">
						Čísla nájdeš na obale (výživové údaje na 100 g alebo na porciu). Čo nepoznáš, nechaj
						prázdne.
					</p>
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
				{#if results.foods.length || results.recipes.length || results.ingredients.length}
					<ul class="results">
						{#each results.foods as f (f.id)}
							<li>
								<button onclick={() => pick({ kind: 'saved', food: f })}>
									<Icon name="star" size={15} />
									{f.name}
									<small class="muted">moje</small>
								</button>
							</li>
						{/each}
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
					<p class="muted small">Nič také nemáme – zapíš to ako vlastné jedlo nižšie.</p>
				{:else if savedFoods.length}
					<div class="chips" role="group" aria-label="Moje potraviny">
						{#each savedFoods.slice(-8).toReversed() as f (f.id)}
							<button class="chip" onclick={() => pick({ kind: 'saved', food: f })}>
								<Icon name="star" size={13} />
								{f.name}
							</button>
						{/each}
					</div>
				{/if}
				<button class="btn ghost small other" onclick={() => (custom = true)}>
					<Icon name="pencil" size={15} /> Vlastné jedlo (z obalu, mimo Receptia)
				</button>
			{/if}

			{#if day.items.length}
				{#each mealGroups as group (group.meal ?? 'other')}
					<h4 class="meal-head">
						{group.meal ? DIARY_MEAL_LABELS[group.meal] : 'Ostatné'}
						<span class="muted small">{groupFacts(group.items)}</span>
					</h4>
					<ul class="items">
						{#each group.items as item (item.id)}
							<li>
								<span class="name">{itemLabel(item)}</span>
								<span class="muted small">{itemFacts(item)}</span>
								{#if item.kind === 'recipe'}
									<span class="stepper">
										<button
											class="icon-btn"
											aria-label="O pol porcie menej: {itemLabel(item)}"
											onclick={() => change((d) => setPortions(d, item.id, item.portions - 0.5))}
										>
											<Icon name="minus" size={15} />
										</button>
										<button
											class="icon-btn"
											aria-label="O pol porcie viac: {itemLabel(item)}"
											onclick={() => change((d) => setPortions(d, item.id, item.portions + 0.5))}
										>
											<Icon name="plus" size={15} />
										</button>
									</span>
								{/if}
								<button
									class="icon-btn remove"
									aria-label="Odstrániť: {itemLabel(item)}"
									onclick={() => change((d) => removeItem(d, item.id))}
								>
									<Icon name="x" size={16} />
								</button>
							</li>
						{/each}
					</ul>
				{/each}

				<h3>Spolu za deň</h3>
				<NutrientBars values={totals.nutrients} {targets} keys={barKeys} />
				{#if journal.current.showKcal && targets.kcal > 0}
					{@const left = targets.kcal - totals.nutrients.kcal}
					<p class="kcal-left">
						{#if left >= 0}Do cieľa ostáva <strong>{formatNumber(left, 0)} kcal</strong>
						{:else}Nad cieľom o <strong>{formatNumber(-left, 0)} kcal</strong>{/if}
						<span class="muted small">(cieľ {formatNumber(targets.kcal, 0)} kcal)</span>
					</p>
				{/if}
				{#if totals.unknown || totals.partial}
					<p class="muted small">
						{#if totals.unknown}Pri {totals.unknown}
							{totals.unknown === 1 ? 'položke' : 'položkách'} hodnoty nepoznáme.{/if}
						{#if totals.partial}Pri vlastných jedlách rátame len čísla z obalu (bez železa,
							vápnika…).{/if}
						Skutočné čísla sú teda vyššie.
					</p>
				{/if}
			{:else}
				<p class="muted">V tento deň zatiaľ nič.</p>
			{/if}
		{/if}
		{#if recent.length}
			<div class="week">
				<h3><Icon name="calendar" size={18} /> Týždeň v denníku</h3>
				<p class="muted small">
					Priemer na deň zo {recent.length}
					{recent.length === 1 ? 'dňa' : 'dní'} so zápisom.
				</p>
				<NutrientBars values={weekAverage} {targets} keys={barKeys} />
				{#if gapRecipes.length}
					<div class="gaps">
						<h4>Čo ti chýba</h4>
						{#each gapRecipes as gap (gap.key)}
							<div class="gap">
								<p>
									<strong>{NUTRIENT_META[gap.key].label}</strong>
									<span class="muted"
										>– v priemere {formatNumber(
											weekAverage[gap.key],
											weekAverage[gap.key] < 10 ? 1 : 0
										)}
										z {formatNumber(targets[gap.key], 0)}
										{NUTRIENT_META[gap.key].unit}. Veľa ho majú:</span
									>
								</p>
								<div class="chips">
									{#each gap.recipes as r (r.id)}
										<a class="chip" href="/recepty/{r.id}"
											>{r.title}
											<small
												>{formatNumber(r.perServing[gap.key], r.perServing[gap.key] < 10 ? 1 : 0)}
												{NUTRIENT_META[gap.key].unit}</small
											></a
										>
									{/each}
								</div>
							</div>
						{/each}
						{#if gaps.includes('iron')}
							<p class="muted small">
								Železo sa lepšie vstrebe s vitamínom C (paprika, citrón) a horšie s čajom či kávou k
								jedlu. <a href="/wiki/zelezo">Viac o železe</a>
							</p>
						{/if}
					</div>
				{:else if recent.length < MIN_DAYS_FOR_GAPS}
					<p class="muted small">
						Po {MIN_DAYS_FOR_GAPS} zapísaných dňoch ti tu ukážem, čoho máš dlhodobo málo, a recepty, ktoré
						to doplnia.
					</p>
				{/if}
			</div>
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
			{#if savedFoods.length}
				<div class="saved-foods">
					<h4>Moje potraviny</h4>
					<ul>
						{#each savedFoods as f (f.id)}
							<li>
								<span
									>{f.name}
									<small class="muted"
										>{f.per100g ? 'na 100 g' : 'na kus'}{f.kcal !== null && journal.current.showKcal
											? ` · ${formatNumber(f.kcal, 0)} kcal`
											: ''}{f.protein !== null
											? ` · bielk. ${formatNumber(f.protein)} g`
											: ''}</small
									></span
								>
								<button
									class="icon-btn"
									aria-label="Odstrániť z mojich potravín: {f.name}"
									onclick={() => (journal.current = removeSavedFood(journal.current, f.id))}
								>
									<Icon name="x" size={14} />
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
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
			<fieldset class="goals">
				<legend>Ciele na deň</legend>
				<div class="goal-row">
					<label class="field small-field">
						<span>Váha (kg)</span>
						<input
							type="number"
							min="20"
							max="250"
							inputmode="numeric"
							value={settings.current.weightKg ?? ''}
							placeholder="nevyplnená"
							onchange={(e) => setWeight(e.currentTarget.value)}
						/>
					</label>
					<label class="field small-field">
						<span>Pohyb</span>
						<select
							value={goals.activity}
							onchange={(e) => setActivity(e.currentTarget.value as Activity)}
						>
							{#each Object.entries(ACTIVITY_LABELS) as [id, name] (id)}
								<option value={id}
									>{name} ({formatNumber(ACTIVITY_PROTEIN[id as Activity], 1)} g bielk./kg)</option
								>
							{/each}
						</select>
					</label>
				</div>
				<div class="goal-grid">
					{#each goalKeys as key (key)}
						<label class="field small-field">
							<span>{NUTRIENT_META[key].label} ({NUTRIENT_META[key].unit})</span>
							<input
								type="number"
								min={GOAL_LIMITS[key][0]}
								max={GOAL_LIMITS[key][1]}
								step="any"
								value={goals.custom[key] ?? ''}
								placeholder={formatNumber(autoTargets[key], autoTargets[key] < 10 ? 1 : 0)}
								onchange={(e) => setGoal(key, e.currentTarget.value)}
							/>
						</label>
					{/each}
				</div>
				<p class="muted small">
					Prázdne políčko = odporúčaná hodnota (EÚ, bielkoviny podľa váhy a pohybu). Vlastné číslo
					si nastav, keď ti ho odporučil lekár alebo výživový poradca, alebo keď ideš za konkrétnym
					cieľom. Ciele platia aj v Pláne a pri receptoch.
				</p>
			</fieldset>
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
			<p class="muted small">
				Skrytý denník si záznamy nechá. Pamätá si rok: posledné 3 mesiace po položkách, staršie dni
				ako súčty.
			</p>
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
	}
	.daynav strong::first-letter {
		text-transform: uppercase;
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
		grid-template-columns: 1fr auto auto;
		gap: 2px 6px;
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
	.stepper {
		grid-row: 1 / span 2;
		grid-column: 2;
		align-self: center;
		display: flex;
	}
	.remove {
		grid-row: 1 / span 2;
		grid-column: 3;
		align-self: center;
	}
	.water-old {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin: 16px 0;
	}
	.icon-btn {
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
		background: var(--paper-2);
	}
	.remove:hover {
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
	.goals {
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 12px;
		margin-inline: 0;
	}
	.goals legend {
		font-weight: 650;
		padding: 0 6px;
	}
	.goal-row,
	.goal-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 8px;
		margin-bottom: 8px;
	}
	.goal-row {
		grid-template-columns: minmax(100px, 140px) minmax(0, 1fr);
	}
	.goal-row select {
		min-width: 0;
		width: 100%;
	}
	.week {
		margin-top: 20px;
		padding-top: 4px;
		border-top: 1px dashed var(--line);
	}
	.week > p {
		margin: 0 0 8px;
	}
	.gaps h4 {
		margin: 16px 0 6px;
		font-size: 1rem;
	}
	.gap p {
		margin: 8px 0 6px;
	}
	.gap .chip small {
		color: var(--muted);
		margin-left: 4px;
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
	.meal-pick {
		margin-bottom: 10px;
	}
	.meal-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		margin: 14px 0 4px;
		font-size: 0.92rem;
	}
	.more-label summary {
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--plum);
		margin: 4px 0;
	}
	.label-row {
		flex-wrap: wrap;
	}
	.label-row .field {
		flex: 1 1 110px;
	}
	.kcal-left {
		margin: 8px 0 0;
	}
	.saved-foods h4 {
		margin: 12px 0 6px;
		font-size: 0.9rem;
	}
	.saved-foods ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.saved-foods li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-size: 0.88rem;
	}
</style>

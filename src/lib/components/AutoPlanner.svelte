<script lang="ts">
	import { budgetForDays } from '$lib/budget';
	import { diaryGaps, gapBonus, localToday } from '$lib/journal';
	import { dailyTargets, NUTRIENT_META } from '$lib/nutrition';
	import { onMount } from 'svelte';
	import { formatEur, formatNumber } from '$lib/amounts';
	import {
		autoPlan,
		swapEntry,
		type AutoPlanContext,
		type AutoPlanOptions,
		type AutoPlanResult
	} from '$lib/autoplan';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import PlanSettings from '$lib/components/PlanSettings.svelte';
	import { ALLERGEN_LABELS } from '$lib/nutrition';
	import { matchRecipe, pantryByGroup, useSoon } from '$lib/pantry';
	import { recipeSeason } from '$lib/season';
	import { avoidFilter } from '$lib/avoid';
	import { hasNeeds, householdFilter, wishesOf } from '$lib/household';
	import {
		household,
		planFromHousehold,
		planSlots,
		tableMembers,
		tableNeeds
	} from '$lib/household.svelte';
	import {
		addToPlan,
		avoid,
		journal,
		pantry,
		pantryAdded,
		plan,
		settings,
		ui,
		mainMeals
	} from '$lib/state.svelte';
	import type { Allergen, RecipeSummary } from '$lib/types';
	import { toast } from '$lib/toast.svelte';

	const catalog = useCatalog();
	const EXCLUDABLE: Allergen[] = ['soy', 'peanuts', 'nuts', 'sesame'];
	const month = new Date().getMonth() + 1;

	/** Bindable, so the plan page's empty state can open it. */
	let { open = $bindable(false) }: { open?: boolean } = $props();

	/** Ready-made budgets per person for a 7-day week; scaled to the plan's days and people. */
	const BUDGET_PRESETS = [15, 20, 30];
	const plannedMeals = $derived(
		[
			settings.current.breakfasts && 'raňajky',
			settings.current.lunches && 'obedy',
			settings.current.dinners && 'večere'
		]
			.filter(Boolean)
			.join(', ')
			.replace(/, ([^,]*)$/, ' a $1')
	);
	const PRESET_PARAM = 'rozpocet';
	/** For how long and whom; only once the saved settings are in, so defaults don't flash. */
	const scope = $derived.by(() => {
		if (!ui.loaded) return '';
		const { planDays: d, people: p } = settings.current;
		const days = `${d} ${d === 1 ? 'deň' : d < 5 ? 'dni' : 'dní'}`;
		const who = planFromHousehold()
			? 'pre domácnosť'
			: `pre ${p} ${p === 1 ? 'osobu' : p < 5 ? 'osoby' : 'osôb'}`;
		return ` – na ${days}, ${who}`;
	});

	// Links like "Navrhni mi týždeň" land here already opened; /plan?rozpocet=25 also proposes.
	onMount(() => {
		if (location.hash === '#navrh') open = true;
		const perWeek = Number(new URLSearchParams(location.search).get(PRESET_PARAM));
		if (BUDGET_PRESETS.includes(perWeek)) {
			open = true;
			usePreset(perWeek);
		}
	});
	let budget = $state<number | null>(null);
	const targets = $derived(dailyTargets(settings.current.weightKg, journal.current.goals));
	/** Fresh food at home that should be cooked before it spoils. */
	const soonIds = $derived(
		new Set(
			ui.loaded
				? useSoon(pantry.current, pantryAdded.current, catalog.ingredientsById, new Date()).map(
						(s) => s.ingredient.id
					)
				: []
		)
	);
	/** What the diary says the last week lacked, so the plan can make up for it. */
	const gaps = $derived(
		ui.loaded
			? diaryGaps(
					journal.current,
					localToday(),
					catalog.recipesById,
					catalog.ingredientsById,
					targets
				)
			: []
	);
	/** Without a number of its own, the planner keeps to the weekly budget from the plan settings. */
	const settingsBudget = $derived(
		settings.current.weeklyBudget === null
			? null
			: Math.round(budgetForDays(settings.current.weeklyBudget, settings.current.planDays) * 100) /
					100
	);
	let minProtein = $state(20);
	let mild = $state(false);
	let glutenFree = $state(false);
	let noSubstitutes = $state(false);
	let excludeAllergens = $state<Allergen[]>([]);
	let usePantry = $state(true);
	let batchCooking = $state(false);
	let seed = $state(1);
	let result = $state<AutoPlanResult | null>(null);

	function planInput(): {
		recipes: RecipeSummary[];
		options: AutoPlanOptions;
		ctx: AutoPlanContext;
	} {
		const groups = pantryByGroup(pantry.current, catalog.ingredientsById);
		const hasPantry = Object.keys(pantry.current).length > 0;
		const options: AutoPlanOptions = {
			days: settings.current.planDays,
			people: settings.current.people,
			mealsPerDay: mainMeals(settings.current).length,
			breakfasts: settings.current.breakfasts,
			budget: budget && budget > 0 ? budget : settingsBudget,
			minProtein,
			mild,
			glutenFree,
			noSubstitutes,
			excludeAllergens,
			batchCooking,
			seed,
			slots: planSlots(settings.current)
		};
		const allowed = avoidFilter(avoid.current, catalog.ingredientsById);
		const needs = tableNeeds();
		const atTable = needs ? householdFilter(needs, catalog.ingredientsById) : () => true;
		const wished =
			household.doc && !household.solo ? wishesOf(household.doc, tableMembers()) : new Map();
		return {
			recipes: catalog.recipes.filter((r) => allowed(r) && atTable(r)),
			options,
			ctx: {
				pantryScore:
					usePantry && hasPantry
						? (r) => matchRecipe(r, groups, catalog.ingredientsById).score
						: undefined,
				inSeason: (r) => recipeSeason(r, catalog.ingredientsById, month).inSeason,
				bonus: (r) =>
					(gaps.length ? gapBonus(r.perServing, gaps, targets) : 0) +
					r.lines.filter((l) => soonIds.has(l.ingredientId)).length +
					// Someone at home asked for it: a strong reason, more with every person asking.
					Math.min(3, (wished.get(r.id)?.length ?? 0) * 1.5)
			}
		};
	}

	function presetBudget(perWeek: number) {
		return Math.round((perWeek * settings.current.people * settings.current.planDays) / 7);
	}

	function usePreset(perWeek: number) {
		budget = presetBudget(perWeek);
		// Each preset gets its own plan, not the same one under a different limit.
		seed = perWeek;
		suggest();
	}

	function suggest() {
		const { recipes, options, ctx } = planInput();
		result = autoPlan(recipes, options, ctx);
	}

	/** Just one recipe doesn't appeal: swap it for a similar one, keep the rest. */
	function swap(index: number) {
		if (!result) return;
		seed += 1;
		const { recipes, options, ctx } = planInput();
		result = swapEntry(recipes, options, result, index, ctx);
	}

	function another() {
		seed += 1;
		suggest();
	}

	/** Replaces at once; the old plan can come back from the message below. */
	function replace() {
		if (!result) return;
		const before = plan.current;
		plan.current = result.entries;
		result = null;
		open = false;
		if (before.length)
			toast('Návrh je v pláne', () => {
				plan.current = before;
			});
	}

	function append() {
		if (!result) return;
		for (const e of result.entries) addToPlan(e.recipeId, e.servings, e.variant);
		result = null;
		open = false;
	}

	function toggleAllergen(a: Allergen) {
		excludeAllergens = excludeAllergens.includes(a)
			? excludeAllergens.filter((x) => x !== a)
			: [...excludeAllergens, a];
	}
</script>

<section id="navrh" class="card box auto">
	<button class="head" onclick={() => (open = !open)} aria-expanded={open}>
		<Icon name="sparkle" size={22} />
		<span>
			<strong>Navrhni mi týždeň</strong>
			<small>
				Podľa rozpočtu, bielkovín a toho, čo máš doma{scope}
			</small>
		</span>
		<Icon name={open ? 'minus' : 'plus'} size={18} />
	</button>

	{#if open}
		<div class="form">
			<div class="presets">
				<p class="label">Hotový týždeň za:</p>
				<div class="chips">
					{#each BUDGET_PRESETS as perWeek (perWeek)}
						<button
							class="chip"
							aria-pressed={budget === presetBudget(perWeek)}
							onclick={() => usePreset(perWeek)}
						>
							do {perWeek} € na osobu
						</button>
					{/each}
				</div>
				<p class="hint">
					Za suroviny, ktoré recepty spotrebujú. Pri nákupe celých balení zaplatíš viac, zvyšok ti
					ostane doma.
				</p>
			</div>
			<PlanSettings />
			<label class="row">
				Rozpočet na celý plán
				<span class="inline">
					<input
						class="input sm"
						type="number"
						min="0"
						step="1"
						inputmode="decimal"
						placeholder={settingsBudget ? `${settingsBudget} (z rozpočtu)` : 'bez limitu'}
						value={budget ?? ''}
						oninput={(e) => {
							const v = Number(e.currentTarget.value);
							budget = e.currentTarget.value && v > 0 ? v : null;
						}}
					/> €
				</span>
			</label>
			<label class="row">
				Bielkoviny na porciu aspoň
				<select class="input sm" bind:value={minProtein}>
					{#each [10, 15, 20, 25, 30] as g (g)}<option value={g}>{g} g</option>{/each}
				</select>
			</label>
			<div class="chips">
				<button class="chip" aria-pressed={usePantry} onclick={() => (usePantry = !usePantry)}>
					Najprv čo mám doma
				</button>
				<button
					class="chip"
					aria-pressed={batchCooking}
					onclick={() => (batchCooking = !batchCooking)}
					title="Z jedného varenia až 3 jedlá – menej varenia, menej rozmanitosti"
				>
					Varím na viac dní
				</button>
				<button class="chip" aria-pressed={mild} onclick={() => (mild = !mild)}>Nepálivé</button>
				<button class="chip" aria-pressed={glutenFree} onclick={() => (glutenFree = !glutenFree)}>
					Bezlepkové
				</button>
				<button
					class="chip"
					aria-pressed={noSubstitutes}
					onclick={() => (noSubstitutes = !noSubstitutes)}
				>
					Bez náhrad
				</button>
				{#each EXCLUDABLE as a (a)}
					<button
						class="chip"
						aria-pressed={excludeAllergens.includes(a)}
						onclick={() => toggleAllergen(a)}
					>
						bez: {ALLERGEN_LABELS[a]}
					</button>
				{/each}
			</div>
			{#if tableNeeds() && hasNeeds(tableNeeds()!)}
				<p class="small with-icon">
					<Icon name="users" size={16} /> Len jedlá, ktoré môže jesť každý z domácnosti ({tableMembers()
						.map((m) => m.name)
						.join(', ')}). <a href="/domacnost">Upraviť</a>
				</p>
			{/if}
			<p class="hint">
				Plánuje {plannedMeals}{planFromHousehold()
					? ' – porcie podľa toho, kto je doma a koľko zje'
					: ''}. Snacky rieš zvlášť.
			</p>
			{#if gaps.length}
				<p class="small with-icon">
					<Icon name="info" size={15} /> Podľa denníka ti minulý týždeň chýbalo:
					{gaps.map((k) => NUTRIENT_META[k].label.toLowerCase()).join(', ')}. Uprednostním recepty,
					ktoré to doplnia.
				</p>
			{/if}
			<button class="btn leaf" onclick={suggest}><Icon name="sparkle" size={18} /> Navrhnúť</button>
		</div>

		{#if result}
			<div class="result" aria-live="polite">
				{#if result.entries.length === 0}
					<p>
						Žiadny recept nespĺňa všetky podmienky. Skús znížiť bielkoviny alebo vypnúť niektorý
						filter.
					</p>
				{:else}
					<ul class="divided">
						{#each result.entries as e, i (e.recipeId + (e.variant ?? ''))}
							{@const r = catalog.recipesById.get(e.recipeId)!}
							<li>
								<span class="title">
									<a href="/recepty/{r.id}">{r.title}</a>
									<small class="muted">
										{#if e.breakfast}raňajky ·
										{/if}{e.servings} porc.{#if e.variant}
											· {e.variant}{/if}
									</small>
								</span>
								<button
									class="chip swap"
									onclick={() => swap(i)}
									aria-label="Vymeniť {r.title} za iný recept"
									title="Iný recept"><Icon name="history" size={14} /> Iný</button
								>
							</li>
						{/each}
					</ul>
					<p class="sum">
						Spolu <strong>{formatEur(result.cost)}</strong>
						({formatEur(result.cost / result.entries.reduce((sum, e) => sum + e.servings, 0))} / porcia)
						· bielkoviny od {formatNumber(result.minProtein, 0)} g na porciu
					</p>
					{#if !result.withinBudget}
						<p class="notice warn">
							<Icon name="alert" size={18} /> Do rozpočtu sa to nezmestí – toto je najlacnejšie, čo ide
							pri týchto podmienkach.
						</p>
					{/if}
					{#if result.meals < result.wanted}
						<p class="notice warn">
							<Icon name="alert" size={18} /> Pokryje len {result.meals} z {result.wanted} jedál – málo
							receptov spĺňa podmienky.
						</p>
					{/if}
					<div class="actions">
						<button class="btn leaf small" onclick={replace}>
							<Icon name="check" size={16} /> Použiť ako plán
						</button>
						<button class="btn ghost small" onclick={append}>
							<Icon name="plus" size={16} /> Pridať k plánu
						</button>
						<button class="btn ghost small" onclick={another}>
							<Icon name="history" size={16} /> Iný návrh
						</button>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</section>

<style>
	.head {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		min-height: var(--tap);
		border: 0;
		background: none;
		padding: 0;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.head > :global(svg:first-child) {
		color: var(--leaf);
	}
	.head strong {
		display: block;
		font-family: var(--font-display);
		font-size: var(--fs-lg);
	}
	.head small {
		display: block;
		color: var(--muted);
		font-size: var(--fs-sm);
		line-height: 1.4;
	}
	.form {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}
	.form p {
		margin: 0;
	}
	.label {
		font-weight: 650;
		font-size: var(--fs-md);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		font-weight: 600;
		font-size: var(--fs-md);
	}
	.inline {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.row input {
		width: 9em;
	}
	.presets {
		display: grid;
		gap: var(--sp-2);
		padding-bottom: var(--sp-3);
		border-bottom: 1px dashed var(--line);
	}
	.presets .hint {
		margin: 0;
	}
	.with-icon {
		display: flex;
		gap: 6px;
		align-items: flex-start;
	}
	.with-icon > :global(svg) {
		flex: none;
		margin-top: 3px;
	}
	.form > .btn {
		justify-self: start;
	}
	.result {
		margin-top: var(--sp-4);
		padding-top: 14px;
		border-top: 1px dashed var(--line);
	}
	.result li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: var(--sp-2) 0;
	}
	.title {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.title a {
		color: var(--ink);
		font-weight: 650;
	}
	.title small {
		font-size: var(--fs-sm);
	}
	.swap {
		flex: none;
	}
	.sum {
		margin: 10px 0;
		font-size: var(--fs-md);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}
</style>

<script lang="ts">
	import { formatEur, formatNumber } from '$lib/amounts';
	import { autoPlan, type AutoPlanOptions, type AutoPlanResult } from '$lib/autoplan';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import PlanSettings from '$lib/components/PlanSettings.svelte';
	import { ALLERGEN_LABELS } from '$lib/nutrition';
	import { matchRecipe, pantryByGroup } from '$lib/pantry';
	import { recipeSeason } from '$lib/season';
	import { addToPlan, pantry, plan, settings } from '$lib/state.svelte';
	import type { Allergen } from '$lib/types';

	const catalog = useCatalog();
	const EXCLUDABLE: Allergen[] = ['soy', 'peanuts', 'nuts', 'sesame'];
	const month = new Date().getMonth() + 1;

	let open = $state(false);
	let budget = $state<number | null>(null);
	let minProtein = $state(20);
	let mild = $state(false);
	let glutenFree = $state(false);
	let noSubstitutes = $state(false);
	let excludeAllergens = $state<Allergen[]>([]);
	let usePantry = $state(true);
	let batchCooking = $state(false);
	let seed = $state(1);
	let result = $state<AutoPlanResult | null>(null);
	let confirmReplace = $state(false);

	function suggest() {
		const groups = pantryByGroup(pantry.current, catalog.ingredientsById);
		const hasPantry = Object.keys(pantry.current).length > 0;
		const options: AutoPlanOptions = {
			days: settings.current.planDays,
			people: settings.current.people,
			mealsPerDay: settings.current.mealsPerDay,
			budget: budget && budget > 0 ? budget : null,
			minProtein,
			mild,
			glutenFree,
			noSubstitutes,
			excludeAllergens,
			batchCooking,
			seed
		};
		result = autoPlan(catalog.recipes, options, {
			pantryScore:
				usePantry && hasPantry
					? (r) => matchRecipe(r, groups, catalog.ingredientsById).score
					: undefined,
			inSeason: (r) => recipeSeason(r, catalog.ingredientsById, month).inSeason
		});
		confirmReplace = false;
	}

	function another() {
		seed += 1;
		suggest();
	}

	function replace() {
		if (!result) return;
		if (plan.current.length && !confirmReplace) {
			confirmReplace = true;
			return;
		}
		plan.current = result.entries;
		result = null;
		open = false;
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

<section class="card box auto">
	<button class="head" onclick={() => (open = !open)} aria-expanded={open}>
		<Icon name="sparkle" size={22} />
		<span>
			<strong>Navrhni mi plán</strong>
			<small>
				Podľa rozpočtu, bielkovín a toho, čo máš doma – na {settings.current.planDays}
				{settings.current.planDays === 1 ? 'deň' : settings.current.planDays < 5 ? 'dni' : 'dní'},
				pre
				{settings.current.people}
				{settings.current.people === 1 ? 'osobu' : settings.current.people < 5 ? 'osoby' : 'osôb'}
			</small>
		</span>
		<Icon name={open ? 'minus' : 'plus'} size={18} />
	</button>

	{#if open}
		<div class="form">
			<PlanSettings />
			<label>
				Rozpočet na celý plán
				<span class="inline">
					<input
						type="number"
						min="0"
						step="1"
						inputmode="decimal"
						placeholder="bez limitu"
						value={budget ?? ''}
						oninput={(e) => {
							const v = Number(e.currentTarget.value);
							budget = e.currentTarget.value && v > 0 ? v : null;
						}}
					/> €
				</span>
			</label>
			<label>
				Bielkoviny na porciu aspoň
				<select bind:value={minProtein}>
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
			<p class="muted small">
				Plánuje obedy{settings.current.mealsPerDay === 2 ? ' a večere' : ''}. Raňajky a snacky rieš
				zvlášť.
			</p>
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
					<ul>
						{#each result.entries as e (e.recipeId + (e.variant ?? ''))}
							{@const r = catalog.recipesById.get(e.recipeId)!}
							<li>
								<a href="/recepty/{r.id}">{r.title}</a>
								<span class="muted">
									{e.servings} porc.{#if e.variant}
										· {e.variant}{/if}
								</span>
							</li>
						{/each}
					</ul>
					<p class="sum">
						Spolu <strong>{formatEur(result.cost)}</strong>
						({formatEur(result.cost / (result.meals * settings.current.people))} / porcia) · bielkoviny
						od {formatNumber(result.minProtein, 0)} g na porciu
					</p>
					{#if !result.withinBudget}
						<p class="warn">
							<Icon name="alert" size={16} /> Do rozpočtu sa to nezmestí – toto je najlacnejšie, čo ide
							pri týchto podmienkach.
						</p>
					{/if}
					{#if result.meals < result.wanted}
						<p class="warn">
							<Icon name="alert" size={16} /> Pokryje len {result.meals} z {result.wanted} jedál – málo
							receptov spĺňa podmienky.
						</p>
					{/if}
					<div class="actions">
						<button class="btn leaf small" onclick={replace}>
							<Icon name="check" size={16} />
							{confirmReplace ? 'Naozaj nahradiť?' : 'Použiť ako plán'}
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
	.box {
		padding: 16px 20px;
	}
	.head {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 12px;
		width: 100%;
		border: 0;
		background: none;
		padding: 0;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.head strong {
		display: block;
		font-family: var(--font-display);
		font-size: 1.2rem;
	}
	.head small {
		color: var(--muted);
	}
	.form {
		display: grid;
		gap: 12px;
		margin-top: 16px;
	}
	label {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-weight: 600;
		font-size: 0.92rem;
	}
	.inline {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	input,
	select {
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--paper);
		color: var(--ink);
		padding: 5px 8px;
		font: inherit;
	}
	input {
		width: 7em;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.small {
		font-size: 0.84rem;
		margin: 0;
	}
	.form > .btn {
		justify-self: start;
	}
	.result {
		margin-top: 16px;
		padding-top: 14px;
		border-top: 1px dashed var(--line);
	}
	.result ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.result li {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 6px 0;
		border-bottom: 1px dashed var(--line);
	}
	.result a {
		color: var(--ink);
		font-weight: 650;
	}
	.sum {
		margin: 10px 0;
		font-size: 0.92rem;
	}
	.warn {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 6px 0;
		font-size: 0.88rem;
		color: color-mix(in srgb, var(--turmeric) 55%, var(--ink));
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}
</style>

<script lang="ts">
	import { formatGrams } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import { scaleStep } from '$lib/cooking';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { asPlanned, formatMinutes, prepList, prepSchedule } from '$lib/mealprep';
	import { approxPieces } from '$lib/shopping';
	import { plan, ui } from '$lib/state.svelte';

	const catalog = useCatalog();

	/** Plan entries with their recipe; unknown recipes (removed from the site) are skipped. */
	const entries = $derived(
		plan.current.flatMap((entry, index) => {
			const recipe = catalog.recipesById.get(entry.recipeId);
			return recipe
				? [{ entry, recipe: asPlanned(recipe, entry.variant), key: `${index}-${entry.recipeId}` }]
				: [];
		})
	);
	/** Dishes that don't keep (fridge 0) are cooked on the day, not ahead. */
	const keepsAhead = (r: (typeof entries)[number]['recipe']) => (r.keeps?.fridge ?? 2) > 0;

	let excluded = $state<string[]>([]);
	const chosen = $derived(entries.filter((e) => !excluded.includes(e.key) && keepsAhead(e.recipe)));
	const schedule = $derived(prepSchedule(chosen));
	const chopping = $derived(prepList(chosen, catalog.ingredientsById));
	const aheadNotes = $derived(chosen.filter((e) => e.recipe.ahead));
	const ovenCount = $derived(chosen.filter((e) => e.recipe.equipment.includes('rura')).length);

	function toggle(key: string) {
		excluded = excluded.includes(key) ? excluded.filter((k) => k !== key) : [...excluded, key];
	}

	/** Steps load when a recipe is opened; the catalog doesn't carry them. */
	type RecipeSteps = { steps: string[]; variants?: Record<string, string[]> };
	let steps = $state<Record<string, RecipeSteps | 'error'>>({});
	async function loadSteps(recipeId: string) {
		if (steps[recipeId]) return;
		try {
			const res = await fetch(`/recepty/${recipeId}/kroky.json`);
			if (!res.ok) throw new Error(String(res.status));
			steps[recipeId] = (await res.json()) as RecipeSteps;
		} catch {
			steps[recipeId] = 'error';
		}
	}

	function keepsText(r: (typeof entries)[number]['recipe']): string {
		const fridge = r.keeps?.fridge ?? 2;
		const freezer = r.keeps?.freezer ?? 0;
		const days = fridge === 1 ? 'deň' : fridge < 5 ? 'dni' : 'dní';
		return `v chladničke ${fridge} ${days}${freezer ? `, v mrazničke ${freezer} mes.` : ''}`;
	}
</script>

<Seo
	title="Navar naraz"
	description="Uvar recepty z plánu v jeden deň: čo nakrájať naraz, v akom poradí variť a ako dlho čo vydrží."
/>

<div class="wrap page">
	<header class="rise">
		<a class="back" href="/plan"><Icon name="arrow-left" size={16} /> Plán a nákup</a>
		<p class="eyebrow">Meal prep</p>
		<h1>Navar naraz, jedz celý týždeň</h1>
		<p class="lede">
			Jedno popoludnie v kuchyni namiesto každodenného varenia. Cibuľu krájaš raz, dlhé veci sa
			varia samy, kým robíš ostatné, a do krabičiek to máš na päť dní.
		</p>
	</header>

	{#if !ui.loaded}
		<p class="muted">Načítavam…</p>
	{:else if entries.length === 0}
		<section class="card box">
			<p>V pláne zatiaľ nič nie je. Pridaj recepty a potom sa sem vráť.</p>
			<a class="btn leaf" href="/plan#navrh"><Icon name="sparkle" size={18} /> Navrhni mi týždeň</a>
		</section>
	{:else}
		<section class="card box">
			<h2><Icon name="check" size={22} /> Čo navaríš</h2>
			<ul class="pick">
				{#each entries as e (e.key)}
					{@const ahead = keepsAhead(e.recipe)}
					<li>
						<label class:off={!ahead}>
							<input
								type="checkbox"
								checked={ahead && !excluded.includes(e.key)}
								disabled={!ahead}
								onchange={() => toggle(e.key)}
							/>
							<span>
								<strong>{e.recipe.title}</strong>
								<small>
									{e.entry.servings} porc. ·
									{ahead ? keepsText(e.recipe) : 'nevydrží, sprav ho v deň jedla'}
								</small>
							</span>
						</label>
					</li>
				{/each}
			</ul>
			{#if chosen.length > 1}
				<p class="saving">
					<Icon name="clock" size={20} />
					<span>
						Spolu asi <strong>{formatMinutes(schedule.total)}</strong>
						{#if schedule.oneByOne > schedule.total}
							namiesto {formatMinutes(schedule.oneByOne)}, keby si varil/a jedno po druhom.
						{/if}
					</span>
				</p>
			{/if}
		</section>

		{#if chosen.length}
			{#if aheadNotes.length}
				<section class="card box">
					<h2><Icon name="moon" size={22} /> Deň vopred</h2>
					<ul class="notes">
						{#each aheadNotes as e (e.key)}
							<li><strong>{e.recipe.title}:</strong> {e.recipe.ahead}</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if chopping.length}
				<section class="card box">
					<h2><Icon name="knife" size={22} /> Najprv všetko umy a nakrájaj</h2>
					<p class="muted small">
						Rozlož si misky. Čo ide do viacerých jedál, krájaj naraz a rozdeľ.
					</p>
					<ul class="chop">
						{#each chopping as c (c.ingredient.id)}
							<li>
								<span class="dot" style:--c={c.ingredient.color}></span>
								<span>
									<strong>{c.ingredient.name}</strong>
									<small>{c.usedIn.join(' · ')}</small>
								</span>
								<span class="amt">{formatGrams(c.grams)}{approxPieces(c.ingredient, c.grams)}</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="card box">
				<h2><Icon name="pot" size={22} /> V tomto poradí</h2>
				<p class="muted small">
					Najdlhšie veci idú prvé – kým sa dusia alebo pečú, pripravíš ďalšie.
					{#if ovenCount > 1}
						{ovenCount} jedlá idú do rúry: peč ich naraz, ak majú podobnú teplotu, alebo jedno po druhom
						bez vypínania.
					{/if}
				</p>
				<ol class="timeline">
					{#each schedule.slots as slot, i (slot.recipe.id + i)}
						{@const loaded = steps[slot.recipe.id]}
						{@const list =
							!loaded || loaded === 'error'
								? loaded
								: (slot.entry.variant && loaded.variants?.[slot.entry.variant]) || loaded.steps}
						<li>
							<span class="when">{slot.start ? `+${formatMinutes(slot.start)}` : 'Začni'}</span>
							<details
								ontoggle={(ev) => {
									if ((ev.currentTarget as HTMLDetailsElement).open) void loadSteps(slot.recipe.id);
								}}
							>
								<summary>
									<strong>{slot.recipe.title}</strong>
									<small>
										{slot.recipe.activeTime} min práce{#if slot.recipe.time > slot.recipe.activeTime},
											potom
											{slot.recipe.time - slot.recipe.activeTime} min samo{/if} · hotové o {formatMinutes(
											slot.end
										)}
									</small>
								</summary>
								{#if list === 'error'}
									<p class="muted small">
										Kroky sa nenačítali. <a href="/recepty/{slot.recipe.id}">Otvor recept</a>.
									</p>
								{:else if list}
									<ol class="steps">
										{#each list as step, s (s)}
											<li>{scaleStep(step, slot.entry.servings / slot.recipe.servings)}</li>
										{/each}
									</ol>
									<a class="small" href="/recepty/{slot.recipe.id}">Celý recept a režim varenia</a>
								{:else}
									<p class="muted small">Načítavam kroky…</p>
								{/if}
							</details>
						</li>
					{/each}
				</ol>
			</section>

			<section class="card box">
				<h2><Icon name="fridge" size={22} /> Do krabičiek</h2>
				<p class="muted small">
					Nechaj vychladnúť najviac 2 hodiny a hneď do chladničky. Čo nezješ do troch dní, zamraz
					hneď, nie až keď sa minie čas.
				</p>
				<ul class="notes">
					{#each chosen as e (e.key)}
						<li><strong>{e.recipe.title}:</strong> {keepsText(e.recipe)}</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>

<style>
	.page {
		padding-top: 28px;
		display: grid;
		gap: 20px;
		max-width: 820px;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 600;
		font-size: 0.9rem;
	}
	.lede {
		color: var(--ink-2);
		max-width: 44em;
	}
	.box {
		padding: 20px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.35rem;
		margin: 0 0 10px;
	}
	ul,
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.pick label {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 8px 0;
		cursor: pointer;
	}
	.pick input {
		width: 20px;
		height: 20px;
		margin-top: 2px;
		accent-color: var(--leaf);
	}
	.pick span,
	.chop span:not(.dot):not(.amt),
	summary {
		display: flex;
		flex-direction: column;
	}
	small {
		color: var(--muted);
	}
	.off {
		opacity: 0.6;
		cursor: default;
	}
	.saving {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 12px 0 0;
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--leaf) 12%, var(--card));
	}
	.small {
		font-size: 0.86rem;
	}
	.notes li {
		padding: 6px 0;
		border-bottom: 1px dashed var(--line);
	}
	.chop li {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--c);
	}
	.amt {
		font-weight: 650;
		white-space: nowrap;
	}
	.timeline > li {
		display: grid;
		grid-template-columns: 5.5em 1fr;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px dashed var(--line);
	}
	.when {
		font-weight: 700;
		color: var(--leaf);
		font-size: 0.9rem;
		padding-top: 2px;
	}
	summary {
		cursor: pointer;
	}
	.steps {
		list-style: decimal;
		padding-left: 1.3em;
		margin: 10px 0;
		display: grid;
		gap: 6px;
	}
</style>

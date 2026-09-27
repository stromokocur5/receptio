<script lang="ts">
	import { formatGrams, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import { harvestRecipes, harvestTotals, monthTasks, type TaskKind } from '$lib/garden';
	import { IN_MONTH } from '$lib/season';
	import { garden, pantry, setPantryItem } from '$lib/state.svelte';
	import type { GardenDiary } from '$lib/state.svelte';
	import type { GrowGuide } from '$lib/types';

	let { diary, guides }: { diary: GardenDiary; guides: GrowGuide[] } = $props();

	const catalog = useCatalog();
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth() + 1;
	const nextMonth = (month % 12) + 1;
	const today = now.toISOString().slice(0, 10);

	const PLACE = { parapet: 'v byte', balkon: 'na balkóne', zahrada: 'v záhrade' } as const;
	const KIND_LABEL: Record<TaskKind, string> = {
		indoor: 'Predpestuj doma',
		sow: 'Zasej alebo vysaď von',
		harvest: 'Zbieraj'
	};

	const guideById = $derived(new Map(guides.map((g) => [g.ingredientId, g])));
	const tasks = $derived(monthTasks(diary.plants, guides, diary.done, year, month));
	const upcoming = $derived(
		monthTasks(diary.plants, guides, diary.done, nextMonth === 1 ? year + 1 : year, nextMonth)
			.filter((t) => t.kind !== 'harvest')
			.map((t) => t.name)
	);
	const harvestNow = $derived(tasks.filter((t) => t.kind === 'harvest'));
	const totals = $derived(harvestTotals(diary.harvests, year));
	const recipes = $derived(
		harvestRecipes(
			catalog.recipes,
			harvestNow.map((t) => t.ingredientId)
		)
	);

	let harvestId = $state('');
	let harvestGrams = $state<number | null>(null);
	let harvestNote = $state('');
	let confirmDelete = $state(false);

	const plantName = (id: string) => guideById.get(id)?.name ?? id;

	function toggle(key: string) {
		const { [key]: was, ...rest } = diary.done;
		garden.current = { ...diary, done: was ? rest : { ...rest, [key]: today } };
	}

	function logHarvest(event: SubmitEvent) {
		event.preventDefault();
		const id = harvestId || harvestNow[0]?.ingredientId || diary.plants[0]?.ingredientId;
		if (!id || !harvestGrams || harvestGrams <= 0) return;
		const grams = Math.round(harvestGrams);
		garden.current = {
			...diary,
			harvests: [...diary.harvests, { ingredientId: id, grams, date: today }]
		};
		const had = pantry.current[id];
		setPantryItem(id, (typeof had === 'number' ? had : 0) + grams);
		harvestNote = `${formatGrams(grams)} ${plantName(id).toLowerCase()} je v špajzi.`;
		harvestGrams = null;
	}
</script>

<section id="moja-zahradka" class="card diary">
	<header>
		<div>
			<p class="eyebrow"><Icon name="sprout" size={16} /> Moja záhradka</p>
			<h2>
				{formatNumber(diary.area)} m² {PLACE[diary.place]}, {diary.plants.length}
				{diary.plants.length === 1 ? 'druh' : diary.plants.length < 5 ? 'druhy' : 'druhov'} rastlín
			</h2>
		</div>
		<div class="head-actions">
			<a class="btn ghost small" href="#planovac"><Icon name="pencil" size={16} /> Upraviť plán</a>
			<button
				class="btn ghost small"
				onclick={() => {
					if (confirmDelete) garden.current = null;
					confirmDelete = !confirmDelete;
				}}
			>
				<Icon name="trash" size={16} />
				{confirmDelete ? 'Naozaj zmazať?' : 'Zmazať'}
			</button>
		</div>
	</header>

	<div class="cols">
		<section>
			<h3>Úlohy {IN_MONTH[month - 1]}</h3>
			{#if tasks.length}
				{#each ['indoor', 'sow', 'harvest'] as const as kind (kind)}
					{@const list = tasks.filter((t) => t.kind === kind)}
					{#if list.length}
						<p class="kind k-{kind}">{KIND_LABEL[kind]}</p>
						<ul class="tasks">
							{#each list as t (t.key)}
								<li>
									<label class:done={diary.done[t.key]}>
										<input
											type="checkbox"
											checked={Boolean(diary.done[t.key])}
											onchange={() => toggle(t.key)}
										/>
										{t.name}
									</label>
								</li>
							{/each}
						</ul>
					{/if}
				{/each}
			{:else}
				<p class="muted">Tento mesiac je v záhradke pokoj.</p>
			{/if}
			{#if upcoming.length}
				<p class="muted small">Budúci mesiac: {upcoming.join(', ')}.</p>
			{/if}
		</section>

		<section>
			<h3>Zapíš úrodu</h3>
			<form class="harvest" onsubmit={logHarvest}>
				<select bind:value={harvestId} aria-label="Plodina">
					{#each harvestNow.length ? harvestNow : diary.plants.map( (p) => ({ ingredientId: p.ingredientId, name: plantName(p.ingredientId) }) ) as p (p.ingredientId)}
						<option value={p.ingredientId}>{p.name}</option>
					{/each}
				</select>
				<input
					type="number"
					min="1"
					step="any"
					placeholder="gramov"
					bind:value={harvestGrams}
					aria-label="Hmotnosť v gramoch"
				/>
				<button class="btn leaf small" type="submit" disabled={!harvestGrams}>
					<Icon name="plus" size={16} /> Zapísať
				</button>
			</form>
			{#if harvestNote}<p class="note" role="status">
					<Icon name="check" size={16} />
					{harvestNote}
				</p>{/if}
			{#if totals.length}
				<p class="kind">Úroda {year}</p>
				<ul class="totals">
					{#each totals as t (t.ingredientId)}
						<li><span>{plantName(t.ingredientId)}</span><strong>{formatGrams(t.grams)}</strong></li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	{#if recipes.length}
		<section class="cook">
			<h3>Uvar z toho, čo práve zbieraš</h3>
			<div class="grid">
				{#each recipes as recipe, i (recipe.id)}
					<RecipeCard {recipe} index={i} />
				{/each}
			</div>
		</section>
	{/if}
</section>

<style>
	.diary {
		padding: 22px;
		margin-top: 28px;
		scroll-margin-top: 80px;
		border: 2px solid var(--leaf-2);
	}
	header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 12px;
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0;
	}
	h2 {
		margin: 4px 0 0;
	}
	.head-actions {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}
	.cols {
		display: grid;
		gap: 20px;
		margin-top: 16px;
	}
	@media (min-width: 760px) {
		.cols {
			grid-template-columns: 1fr 1fr;
		}
	}
	h3 {
		margin: 0 0 8px;
	}
	.kind {
		margin: 12px 0 4px;
		font-weight: 700;
		font-size: 0.9rem;
	}
	.k-indoor {
		color: var(--sky);
	}
	.k-sow {
		color: var(--leaf);
	}
	.k-harvest {
		color: #a4741a;
	}
	.tasks,
	.totals {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.tasks label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}
	.tasks input {
		width: 18px;
		height: 18px;
		accent-color: var(--leaf);
	}
	.tasks .done {
		color: var(--muted);
		text-decoration: line-through;
	}
	.harvest {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.harvest select,
	.harvest input {
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 8px 10px;
		font: inherit;
	}
	.harvest select {
		flex: 1 1 140px;
	}
	.harvest input {
		width: 110px;
	}
	.note {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--leaf);
	}
	.totals li {
		display: flex;
		justify-content: space-between;
		border-bottom: 1px dashed var(--line);
		padding: 4px 0;
	}
	.cook {
		margin-top: 20px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 14px;
	}
	.small {
		font-size: 0.86rem;
	}
</style>

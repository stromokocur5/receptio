<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import {
		CELL_M,
		bedPlants,
		bedSize,
		bedWarnings,
		fillWithCombo,
		newSeason,
		type Bed
	} from '$lib/garden';
	import { garden, type GardenDiary } from '$lib/state.svelte';
	import type { GrowCombo, GrowGuide } from '$lib/types';

	let { diary, guides, combos }: { diary: GardenDiary; guides: GrowGuide[]; combos: GrowCombo[] } =
		$props();

	const catalog = useCatalog();
	const guideById = $derived(new Map(guides.map((g) => [g.ingredientId, g])));
	/** Crops of this garden's place, the ones already in the plan first. */
	const palette = $derived.by(() => {
		const inPlan = new Set(diary.plants.map((p) => p.ingredientId));
		return guides
			.filter((g) => g.where.includes(diary.place))
			.sort(
				(a, b) =>
					Number(inPlan.has(b.ingredientId)) - Number(inPlan.has(a.ingredientId)) ||
					a.name.localeCompare(b.name, 'sk')
			);
	});
	const placeCombos = $derived(combos.filter((c) => c.where.includes(diary.place)));

	let brush = $state<string>('');
	let newName = $state('');
	let newWidth = $state<number | null>(null);
	let newDepth = $state<number | null>(null);
	let confirming = $state<string | null>(null);
	let painting = false;

	const color = (id: string) => catalog.ingredientsById.get(id)?.color ?? '#6fa35a';
	const short = (id: string) => (guideById.get(id)?.name ?? id).slice(0, 2);

	function update(bed: Bed) {
		garden.current = { ...diary, beds: diary.beds.map((b) => (b.id === bed.id ? bed : b)) };
	}

	function addBed(event: SubmitEvent) {
		event.preventDefault();
		if (!newWidth || !newDepth) return;
		const defaults = { parapet: 'Truhlík', balkon: 'Nádoba', zahrada: 'Záhon' } as const;
		const bed: Bed = {
			id: crypto.randomUUID().slice(0, 8),
			name: newName.trim() || `${defaults[diary.place]} ${diary.beds.length + 1}`,
			width: Math.min(50, newWidth),
			depth: Math.min(50, newDepth),
			cells: {},
			past: []
		};
		garden.current = { ...diary, beds: [...diary.beds, bed] };
		newName = '';
		newWidth = null;
		newDepth = null;
	}

	function paint(bed: Bed, key: string) {
		const cells = { ...bed.cells };
		if (!brush || cells[key] === brush) delete cells[key];
		else cells[key] = brush;
		update({ ...bed, cells });
	}

	function paintOver(bed: Bed, key: string, event: PointerEvent) {
		// Drag to paint several squares; a plain tap is handled by click.
		if (!painting || event.buttons === 0 || !brush || bed.cells[key] === brush) return;
		update({ ...bed, cells: { ...bed.cells, [key]: brush } });
	}

	function confirm(id: string, action: () => void) {
		if (confirming === id) {
			action();
			confirming = null;
		} else confirming = id;
	}
</script>

<section class="beds">
	<h3><Icon name="pencil" size={18} /> Moje záhony</h3>
	<p class="muted small">
		Nakresli si skutočné záhony, truhlíky alebo nádoby. Jedno políčko je {CELL_M * 100} × {CELL_M *
			100} cm – vyber plodinu a klikaj (alebo ťahaj) po políčkach. Upozorním na zlých susedov, veľké rastliny
		bez miesta a na to, čo tu rástlo minulý rok.
	</p>

	<form class="add" onsubmit={addBed}>
		<input bind:value={newName} placeholder="Názov (napr. Záhon pri plote)" aria-label="Názov" />
		<label
			><input
				type="number"
				min="0.1"
				max="50"
				step="any"
				bind:value={newWidth}
				aria-label="Šírka v metroch"
				placeholder="šírka"
			/> m</label
		>
		<span>×</span>
		<label
			><input
				type="number"
				min="0.1"
				max="50"
				step="any"
				bind:value={newDepth}
				aria-label="Hĺbka v metroch"
				placeholder="hĺbka"
			/> m</label
		>
		<button class="btn leaf small" type="submit" disabled={!newWidth || !newDepth}>
			<Icon name="plus" size={16} /> Pridať záhon
		</button>
	</form>

	{#if diary.beds.length}
		<div class="palette" role="radiogroup" aria-label="Čo sadíš">
			<button class="chip" aria-pressed={brush === ''} onclick={() => (brush = '')}>
				<Icon name="x" size={14} /> Guma
			</button>
			{#each palette as g (g.ingredientId)}
				<button
					class="chip"
					aria-pressed={brush === g.ingredientId}
					onclick={() => (brush = g.ingredientId)}
					><i style:background={color(g.ingredientId)}></i>{g.name}</button
				>
			{/each}
		</div>
	{/if}

	{#each diary.beds as bed (bed.id)}
		{@const size = bedSize(bed)}
		{@const warnings = bedWarnings(bed, guides)}
		{@const flagged = new Set(warnings.flatMap((w) => w.cells))}
		{@const plants = bedPlants(bed, guides)}
		<article class="bed">
			<header>
				<h4>{bed.name} <small class="muted">{bed.width} × {bed.depth} m</small></h4>
				<div class="bed-actions">
					{#if placeCombos.length}
						<select
							aria-label="Vložiť kombináciu"
							onchange={(e) => {
								const combo = placeCombos.find((c) => c.id === e.currentTarget.value);
								if (combo) update(fillWithCombo(bed, combo, guides));
								e.currentTarget.value = '';
							}}
						>
							<option value="">Vložiť kombináciu…</option>
							{#each placeCombos as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
						</select>
					{/if}
					<button
						class="btn ghost small"
						onclick={() =>
							confirm(`season-${bed.id}`, () =>
								update(newSeason(bed, guides, new Date().getFullYear()))
							)}
					>
						{confirming === `season-${bed.id}` ? 'Naozaj? Vyčistí záhon' : 'Nová sezóna'}
					</button>
					<button
						class="btn ghost small"
						aria-label="Zmazať záhon"
						onclick={() =>
							confirm(`del-${bed.id}`, () => {
								garden.current = { ...diary, beds: diary.beds.filter((b) => b.id !== bed.id) };
							})}
					>
						<Icon name="trash" size={16} />
						{confirming === `del-${bed.id}` ? 'Naozaj?' : ''}
					</button>
				</div>
			</header>

			<div class="grid-wrap">
				<p class="north muted">sever ↑</p>
				<div
					class="grid"
					style:grid-template-columns="repeat({size.cols}, 30px)"
					onpointerdown={() => (painting = true)}
					onpointerup={() => (painting = false)}
					onpointerleave={() => (painting = false)}
					role="group"
					aria-label="Záhon {bed.name}"
				>
					{#each Array.from({ length: size.rows }, (_, r) => r) as r (r)}
						{#each Array.from({ length: size.cols }, (_, c) => c) as c (c)}
							{@const key = `${c},${r}`}
							{@const id = bed.cells[key]}
							<button
								class="cell"
								class:flag={flagged.has(key)}
								style:background={id ? color(id) : undefined}
								aria-label="{c + 1}. stĺpec, {r + 1}. rad: {id
									? guideById.get(id)?.name
									: 'prázdne'}"
								onclick={() => paint(bed, key)}
								onpointerenter={(e) => paintOver(bed, key, e)}>{id ? short(id) : ''}</button
							>
						{/each}
					{/each}
				</div>
			</div>

			{#if plants.length}
				<p class="plants small">
					{#each plants as p, i (p.ingredientId)}{i ? ' · ' : ''}<span
							><i style:background={color(p.ingredientId)}></i>{guideById.get(p.ingredientId)
								?.name}:
							{p.count
								? `${p.count} ${p.count === 1 ? 'rastlina' : p.count < 5 ? 'rastliny' : 'rastlín'}`
								: 'málo miesta'}</span
						>{/each}
				</p>
			{/if}
			{#if warnings.length}
				<ul class="warnings">
					{#each warnings as w, i (i)}<li><Icon name="alert" size={16} /> {w.text}</li>{/each}
				</ul>
			{/if}
			{#if bed.past.length}
				<p class="muted small">
					Predtým tu rástli: {bed.past
						.map((p) => `${p.year} – ${p.families.join(', ') || 'nič'}`)
						.join('; ')}.
				</p>
			{/if}
		</article>
	{/each}
</section>

<style>
	.beds {
		margin-top: 24px;
	}
	h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 6px;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 12px 0;
	}
	.add input {
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 8px 10px;
		font: inherit;
	}
	.add > input {
		flex: 1 1 200px;
	}
	.add label input {
		width: 80px;
	}
	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 10px 0 16px;
		max-height: 150px;
		overflow-y: auto;
	}
	.palette i,
	.plants i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		margin-right: 4px;
		vertical-align: -1px;
	}
	.bed {
		padding: 14px;
		border-radius: var(--radius-sm);
		background: var(--paper);
		border: 1px solid var(--line);
		margin-bottom: 14px;
	}
	.bed header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 8px;
		align-items: center;
	}
	h4 {
		margin: 0;
	}
	.bed-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.bed-actions select {
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--card);
		color: var(--ink);
		padding: 6px 8px;
		font: inherit;
		font-size: 0.85rem;
	}
	.grid-wrap {
		overflow-x: auto;
		margin-top: 8px;
		padding-bottom: 4px;
	}
	.north {
		margin: 0 0 4px;
		font-size: 0.75rem;
	}
	.grid {
		display: grid;
		gap: 2px;
		width: max-content;
		padding: 4px;
		border-radius: 8px;
		background: color-mix(in srgb, #8a5a3c 30%, var(--paper));
		touch-action: none;
	}
	.cell {
		width: 30px;
		height: 30px;
		border: 0;
		border-radius: 5px;
		background: color-mix(in srgb, #8a5a3c 18%, var(--paper));
		font-size: 0.62rem;
		font-weight: 700;
		color: #1d2e24;
		padding: 0;
		cursor: pointer;
	}
	.cell.flag {
		outline: 2px solid var(--tomato);
		outline-offset: -2px;
	}
	.plants {
		margin: 10px 0 0;
	}
	.warnings {
		list-style: none;
		padding: 0;
		margin: 8px 0 0;
		display: grid;
		gap: 4px;
		color: var(--tomato);
		font-size: 0.88rem;
	}
	.warnings li {
		display: flex;
		gap: 6px;
		align-items: flex-start;
	}
	.small {
		font-size: 0.86rem;
	}
</style>

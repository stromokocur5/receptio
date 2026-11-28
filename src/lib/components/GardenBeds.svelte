<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import PlantGlyph from '$lib/components/PlantGlyph.svelte';
	import {
		CELL_M,
		bedPlants,
		bedSize,
		bedWarnings,
		fillWithCombo,
		newSeason,
		type Bed
	} from '$lib/garden';
	import { normalizeSearch } from '$lib/labels';
	import { saveGarden, type GardenDiary } from '$lib/state.svelte';
	import { toast } from '$lib/toast.svelte';
	import type { GrowCombo, GrowGuide } from '$lib/types';

	let {
		diary,
		guides,
		combos,
		oncrop
	}: {
		diary: GardenDiary;
		guides: GrowGuide[];
		combos: GrowCombo[];
		oncrop: (ingredientId: string) => void;
	} = $props();

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
	let paletteQuery = $state('');
	const paletteShown = $derived.by(() => {
		const q = normalizeSearch(paletteQuery.trim());
		return q ? palette.filter((g) => normalizeSearch(g.name).includes(q)) : palette;
	});
	const placeCombos = $derived(combos.filter((c) => c.where.includes(diary.place)));

	let brush = $state<string>('');
	let newName = $state('');
	let newWidth = $state<number | null>(null);
	let newDepth = $state<number | null>(null);

	/** Width available for a bed's grid, so squares shrink to fit the phone instead of scrolling. */
	let gridSpace = $state(0);
	const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
	const MIN_CELL = 16;
	const GAP = 2;
	/** The bed card's padding and border plus the grid frame, on both sides. */
	const FRAME_PAD = 30 + 12;
	function cellSize(cols: number): number {
		const max = coarse ? 36 : 30;
		if (!gridSpace) return max;
		const fit = Math.floor((gridSpace - FRAME_PAD - (cols - 1) * GAP) / cols);
		return Math.max(MIN_CELL, Math.min(max, fit));
	}
	const overflows = (cols: number) =>
		gridSpace > 0 && cols * (MIN_CELL + GAP) + FRAME_PAD > gridSpace;
	/** Beds too big for the screen: while on, a finger moves the view instead of painting. */
	let panning = $state<Record<string, boolean>>({});

	/** Earlier versions of each bed's squares, newest last; lives only until the page reloads. */
	let undoStack = $state<Record<string, Bed['cells'][]>>({});
	const UNDO_LIMIT = 30;

	const color = (id: string) => catalog.ingredientsById.get(id)?.color ?? '#6fa35a';

	function update(bed: Bed) {
		saveGarden({ ...diary, beds: diary.beds.map((b) => (b.id === bed.id ? bed : b)) });
	}

	function remember(bed: Bed) {
		undoStack[bed.id] = [...(undoStack[bed.id] ?? []), bed.cells].slice(-UNDO_LIMIT);
	}

	function undo(bed: Bed) {
		const stack = undoStack[bed.id];
		if (!stack?.length) return;
		undoStack[bed.id] = stack.slice(0, -1);
		update({ ...bed, cells: stack.at(-1)! });
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
		saveGarden({ ...diary, beds: [...diary.beds, bed] });
		newName = '';
		newWidth = null;
		newDepth = null;
	}

	/**
	 * One stroke paints (or erases) every square the finger or mouse passes over. What it does is
	 * decided on the first square: pressing on a square that already has the brush's crop erases.
	 */
	let stroke: { bedId: string; value: string | null; last: string } | null = null;

	function apply(bedId: string, key: string) {
		const bed = diary.beds.find((b) => b.id === bedId);
		if (!bed || !stroke) return;
		const cells = { ...bed.cells };
		if (stroke.value === null) {
			if (!(key in cells)) return;
			delete cells[key];
		} else {
			if (cells[key] === stroke.value) return;
			cells[key] = stroke.value;
		}
		update({ ...bed, cells });
	}

	function cellAt(event: PointerEvent): string | null {
		const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cell]');
		return cell instanceof HTMLElement ? (cell.dataset.cell ?? null) : null;
	}

	function strokeStart(bed: Bed, event: PointerEvent) {
		if (panning[bed.id]) return;
		const key = cellAt(event);
		if (!key || event.button !== 0) return;
		event.preventDefault();
		// Touch captures the pointer to the first square; release it so moves hit-test anew.
		(event.target as Element).releasePointerCapture?.(event.pointerId);
		remember(bed);
		stroke = {
			bedId: bed.id,
			value: !brush || bed.cells[key] === brush ? null : brush,
			last: key
		};
		apply(bed.id, key);
	}

	function strokeMove(event: PointerEvent) {
		if (!stroke) return;
		const key = cellAt(event);
		if (!key || key === stroke.last) return;
		stroke.last = key;
		apply(stroke.bedId, key);
	}

	function strokeEnd() {
		stroke = null;
	}

	/** Keyboard users toggle one square at a time; pointers are handled by the stroke above. */
	function keyPaint(bed: Bed, key: string, event: MouseEvent) {
		if (event.detail !== 0) return;
		remember(bed);
		const cells = { ...bed.cells };
		if (!brush || cells[key] === brush) delete cells[key];
		else cells[key] = brush;
		update({ ...bed, cells });
	}

	function rename(bed: Bed, name: string) {
		const trimmed = name.trim().slice(0, 60);
		if (trimmed && trimmed !== bed.name) update({ ...bed, name: trimmed });
	}

	/** Puts a bed back as it was (or where it was, if it was deleted). */
	function restore(bed: Bed, at: number) {
		const others = diary.beds.filter((b) => b.id !== bed.id);
		saveGarden({ ...diary, beds: [...others.slice(0, at), bed, ...others.slice(at)] });
	}

	// Both can be put back, so they happen at once and the toast offers to undo them.
	function startSeason(bed: Bed) {
		const at = diary.beds.indexOf(bed);
		remember(bed);
		update(newSeason(bed, guides, new Date().getFullYear()));
		toast(`${bed.name}: nová sezóna, záhon je prázdny`, () => restore(bed, at));
	}
	function deleteBed(bed: Bed) {
		const at = diary.beds.indexOf(bed);
		saveGarden({ ...diary, beds: diary.beds.filter((b) => b.id !== bed.id) });
		toast(`Zmazané: ${bed.name}`, () => restore(bed, at));
	}
</script>

<svelte:window onpointerup={strokeEnd} onpointercancel={strokeEnd} />

<section class="beds" bind:clientWidth={gridSpace}>
	<h3><Icon name="pencil" size={18} /> Moje záhony</h3>
	<p class="muted small">
		Nakresli si skutočné záhony, truhlíky alebo nádoby. Jedno políčko je {CELL_M * 100} × {CELL_M *
			100} cm – vyber plodinu a ťahaj prstom alebo myšou po políčkach. Upozorníme ťa na zlých susedov,
		veľké rastliny bez miesta a na to, čo tu rástlo minulý rok.
	</p>

	<form class="add" onsubmit={addBed}>
		<input
			class="input"
			bind:value={newName}
			placeholder="Názov, napr. Záhon pri plote"
			aria-label="Názov"
		/>
		<span class="size">
			<label
				><input
					class="input"
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
					class="input"
					type="number"
					min="0.1"
					max="50"
					step="any"
					bind:value={newDepth}
					aria-label="Hĺbka v metroch"
					placeholder="hĺbka"
				/> m</label
			>
		</span>
		<button class="btn leaf small" type="submit" disabled={!newWidth || !newDepth}>
			<Icon name="plus" size={16} /> Pridať záhon
		</button>
	</form>

	{#if diary.beds.length}
		<div class="toolbox">
			<div class="brush-now" aria-live="polite">
				<i
					class="swatch"
					class:eraser={!brush}
					style:background={brush ? color(brush) : undefined}
					aria-hidden="true"
				></i>
				<span>
					{brush ? `Sadíš: ${guideById.get(brush)?.name}` : 'Guma – ťahaním mažeš'}
				</span>
				{#if palette.length > 10}
					<input
						class="input sm palette-search"
						type="search"
						bind:value={paletteQuery}
						placeholder="Hľadať plodinu"
						aria-label="Hľadať plodinu na sadenie"
					/>
				{/if}
			</div>
			<div class="palette" role="group" aria-label="Čo sadíš">
				<button class="chip" aria-pressed={brush === ''} onclick={() => (brush = '')}>
					<Icon name="x" size={14} /> Guma
				</button>
				{#each paletteShown as g (g.ingredientId)}
					<button
						class="chip"
						aria-pressed={brush === g.ingredientId}
						onclick={() => (brush = g.ingredientId)}
						><svg class="glyph" viewBox="-11 -11 22 22" aria-hidden="true"
							><PlantGlyph family={g.family} form={g.form} color={color(g.ingredientId)} /></svg
						>{g.name}</button
					>
				{/each}
			</div>
		</div>
	{/if}

	{#each diary.beds as bed (bed.id)}
		{@const size = bedSize(bed)}
		{@const warnings = bedWarnings(bed, guides)}
		{@const flagged = new Set(warnings.flatMap((w) => w.cells))}
		{@const plants = bedPlants(bed, guides)}
		{@const filled = Object.keys(bed.cells).length}
		<article class="bed">
			<header>
				<div class="bed-title">
					<input
						class="bed-name"
						value={bed.name}
						aria-label="Názov záhonu"
						maxlength="60"
						onchange={(e) => rename(bed, e.currentTarget.value)}
						onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
					/>
					<small class="muted"
						>{bed.width} × {bed.depth} m · osadené {filled} z {size.cols * size.rows} políčok</small
					>
				</div>
				<div class="bed-actions">
					<button
						class="btn ghost small"
						onclick={() => undo(bed)}
						disabled={!undoStack[bed.id]?.length}
						aria-label="Späť"
						title="Späť"
					>
						<Icon name="history" size={16} /> Späť
					</button>
					{#if placeCombos.length}
						<select
							class="input sm"
							aria-label="Vložiť kombináciu"
							onchange={(e) => {
								const combo = placeCombos.find((c) => c.id === e.currentTarget.value);
								if (combo) {
									remember(bed);
									update(fillWithCombo(bed, combo, guides));
								}
								e.currentTarget.value = '';
							}}
						>
							<option value="">Vložiť kombináciu…</option>
							{#each placeCombos as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
						</select>
					{/if}
					<button
						class="btn ghost small"
						title="Vyčistí záhon a zapamätá si, čo v ňom rástlo"
						onclick={() => startSeason(bed)}
					>
						Nová sezóna
					</button>
					<button
						class="icon-btn plain"
						aria-label="Zmazať záhon {bed.name}"
						title="Zmazať záhon"
						onclick={() => deleteBed(bed)}
					>
						<Icon name="trash" size={16} />
					</button>
				</div>
			</header>

			<div class="grid-wrap" class:panning={panning[bed.id]}>
				<p class="north muted">
					sever ↑
					{#if overflows(size.cols)}
						<button
							class="pan-toggle"
							aria-pressed={!!panning[bed.id]}
							onclick={() => (panning[bed.id] = !panning[bed.id])}
						>
							<Icon name={panning[bed.id] ? 'pencil' : 'arrow-right'} size={14} />
							{panning[bed.id] ? 'Späť na kreslenie' : 'Posúvať záhon'}
						</button>
					{/if}
				</p>
				<div
					class="grid"
					class:erasing={!brush}
					style:--cell="{cellSize(size.cols)}px"
					style:grid-template-columns="repeat({size.cols}, var(--cell))"
					onpointerdown={(e) => strokeStart(bed, e)}
					onpointermove={strokeMove}
					role="group"
					aria-label="Záhon {bed.name}"
				>
					{#each Array.from({ length: size.rows }, (_, r) => r) as r (r)}
						{#each Array.from({ length: size.cols }, (_, c) => c) as c (c)}
							{@const key = `${c},${r}`}
							{@const id = bed.cells[key]}
							<button
								class="cell"
								class:planted={!!id}
								class:flag={flagged.has(key)}
								data-cell={key}
								title={id ? guideById.get(id)?.name : undefined}
								aria-label="{c + 1}. stĺpec, {r + 1}. rad: {id
									? guideById.get(id)?.name
									: 'prázdne'}"
								onclick={(e) => keyPaint(bed, key, e)}
								>{#if id}<svg viewBox="-11 -11 22 22" aria-hidden="true"
										><PlantGlyph
											family={guideById.get(id)?.family}
											form={guideById.get(id)?.form}
											color={color(id)}
											seed={c * 7 + r}
										/></svg
									>{/if}</button
							>
						{/each}
					{/each}
				</div>
				<p class="scale muted">
					{size.cols * CELL_M * 100 >= 100
						? `${Math.round(size.cols * CELL_M * 10) / 10} m`
						: `${Math.round(size.cols * CELL_M * 100)} cm`} ↔
				</p>
			</div>

			{#if plants.length}
				<p class="plants small">
					{#each plants as p (p.ingredientId)}<button
							class="plant"
							onclick={() => oncrop(p.ingredientId)}
							><i style:background={color(p.ingredientId)}></i>{guideById.get(p.ingredientId)
								?.name}:
							{p.count
								? `${p.count} ${p.count === 1 ? 'rastlina' : p.count < 5 ? 'rastliny' : 'rastlín'}`
								: 'málo miesta'}</button
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
	.add > input {
		flex: 1 1 240px;
		min-width: 0;
	}
	/* Width × depth stay on one line, also on a phone. */
	.size {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
	}
	.add label input {
		width: 80px;
	}
	/* Sticks under the header and the garden page's tab bar (taller for fingers). */
	.toolbox {
		position: sticky;
		top: calc(var(--header-h) + 60px);
		z-index: 2;
		margin: 10px 0 16px;
		padding: 10px;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--card) 92%, transparent);
		backdrop-filter: blur(8px);
		border: 1px solid var(--line);
		box-shadow: var(--shadow);
	}
	.brush-now {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
		font-weight: 650;
		font-size: var(--fs-md);
	}
	.swatch {
		width: 22px;
		height: 22px;
		border-radius: 6px;
		border: 1.5px solid color-mix(in srgb, var(--ink) 25%, transparent);
		transition: background 0.2s;
	}
	.swatch.eraser {
		background: repeating-linear-gradient(
			45deg,
			var(--paper),
			var(--paper) 3px,
			var(--line) 3px,
			var(--line) 6px
		);
	}
	.palette-search {
		margin-left: auto;
		padding: 5px 10px;
		width: 160px;
		font-size: var(--fs-sm);
	}
	/* One scrolling row, so the sticky toolbox covers as little of the beds as possible. */
	/* One swipeable row; the faded edges show there is more to the side. */
	.palette {
		display: flex;
		gap: 6px;
		margin: 0 -10px;
		padding: 2px 10px 4px;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scroll-snap-type: x proximity;
		scrollbar-width: none;
		mask-image: linear-gradient(
			to right,
			transparent,
			#000 12px,
			#000 calc(100% - 28px),
			transparent
		);
	}
	.palette::-webkit-scrollbar {
		display: none;
	}
	.palette .chip {
		scroll-snap-align: start;
	}
	.palette .chip {
		flex: none;
	}
	.glyph {
		width: 20px;
		height: 20px;
		margin: -2px 4px -2px -6px;
		border-radius: 50%;
		background: #6b4a33;
		flex: none;
	}
	.plant i {
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
	.bed-title {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.bed-name {
		width: 100%;
		max-width: 280px;
		padding: 2px 6px;
		margin-left: -6px;
		border: 1.5px solid transparent;
		border-radius: var(--radius-xs);
		background: none;
		color: var(--ink);
		font: inherit;
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 700;
	}
	.bed-name:hover {
		border-color: var(--line);
	}
	/* The field's own ring replaces the global focus outline. */
	.bed-name:focus {
		outline: none;
		border-color: var(--leaf);
		background: var(--card);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--leaf) 18%, transparent);
	}
	.bed-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.bed-actions select {
		font-size: var(--fs-sm);
	}
	.grid-wrap {
		overflow-x: auto;
		margin-top: 8px;
		padding-bottom: 8px;
		overscroll-behavior-x: contain;
	}
	.grid-wrap.panning .grid {
		touch-action: pan-x pan-y;
		cursor: grab;
	}
	.north {
		display: flex;
		align-items: center;
		gap: 10px;
		position: sticky;
		left: 0;
	}
	.pan-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--card);
		color: var(--ink-2);
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: 650;
		cursor: pointer;
	}
	.pan-toggle[aria-pressed='true'] {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--paper);
	}
	.north,
	.scale {
		margin: 0 0 4px;
		font-size: var(--fs-xs);
	}
	.scale {
		margin: 4px 0 0;
	}
	.grid {
		display: grid;
		gap: 2px;
		width: max-content;
		padding: 6px;
		border-radius: var(--radius-xs);
		background: #b98a5a;
		box-shadow:
			inset 0 0 0 1.5px #8a6039,
			0 5px 0 rgba(40, 25, 10, 0.18);
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		cursor: crosshair;
	}
	.grid.erasing {
		cursor: cell;
	}
	.cell {
		width: var(--cell);
		height: var(--cell);
		border: 0;
		border-radius: 4px;
		background: radial-gradient(circle at 30% 30%, #7a5640, #62432f);
		padding: 1px;
		cursor: inherit;
		transition:
			transform 0.15s,
			box-shadow 0.15s;
	}
	.cell:hover {
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--ink) 35%, transparent);
	}
	.cell svg {
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	.cell.planted svg {
		animation: sprout 0.35s var(--ease-spring);
	}
	@keyframes sprout {
		from {
			transform: scale(0.3) rotate(-60deg);
		}
	}
	.cell.flag {
		outline: 2px solid var(--tomato);
		outline-offset: -2px;
	}
	.plants {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 10px 0 0;
	}
	.plant {
		padding: 3px 9px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--card);
		color: var(--ink-2);
		font: inherit;
		cursor: pointer;
	}
	.plant:hover {
		border-color: var(--leaf);
	}
	.warnings {
		list-style: none;
		padding: 0;
		margin: 8px 0 0;
		display: grid;
		gap: 4px;
		color: var(--tomato);
		font-size: var(--fs-sm);
	}
	.warnings li {
		display: flex;
		gap: 6px;
		align-items: flex-start;
	}
	.small {
		font-size: var(--fs-sm);
	}
	@media (pointer: coarse) {
		.toolbox {
			top: calc(var(--header-h) + 68px);
		}
	}
</style>

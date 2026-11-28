<script lang="ts">
	import { useDishCatalog } from '$lib/dish-catalog';
	import Icon from '$lib/components/Icon.svelte';
	import PantryShelf from '$lib/components/PantryShelf.svelte';
	import { KITCHEN_TOOLS, TOOL_META } from '$lib/dish';
	import { CATEGORY_LABELS, ingredientSearchText, normalizeSearch } from '$lib/labels';
	import { isAssumedAtHome } from '$lib/pantry';
	import {
		kitchen,
		MAX_BURNERS,
		pantry,
		removePantryItem,
		setPantryItem,
		settings,
		toggleTool,
		ui
	} from '$lib/state.svelte';
	import { toast } from '$lib/toast.svelte';
	import type { IngredientLite } from '$lib/types';

	const catalog = useDishCatalog();

	function markSet() {
		if (!settings.current.kitchenSet) settings.current = { ...settings.current, kitchenSet: true };
	}
	function setBurners(n: number) {
		kitchen.current = { ...kitchen.current, burners: Math.min(MAX_BURNERS, Math.max(1, n)) };
		markSet();
	}

	/** Ingredients the dishes use most, minus salt and spices – the quickest way to fill the pantry. */
	const common = $derived.by(() => {
		const { parts, ingredientsById } = catalog();
		const uses = new Map<string, number>();
		for (const part of parts) {
			for (const l of part.methods[0].lines) {
				const i = ingredientsById.get(l.ingredientId);
				if (!i || isAssumedAtHome(i) || i.id === 'voda') continue;
				uses.set(i.id, (uses.get(i.id) ?? 0) + 1);
			}
		}
		return [...uses]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 18)
			.map(([id]) => ingredientsById.get(id)!);
	});

	let query = $state('');
	const searchable = $derived(
		catalog().ingredients.map((i) => ({ ingredient: i, text: ingredientSearchText(i) }))
	);
	const results = $derived.by(() => {
		const q = normalizeSearch(query.trim());
		if (q.length < 2) return [];
		return searchable
			.filter((s) => s.text.includes(q))
			.sort(
				(a, b) =>
					Number(normalizeSearch(b.ingredient.name).startsWith(q)) -
						Number(normalizeSearch(a.ingredient.name).startsWith(q)) ||
					a.ingredient.name.length - b.ingredient.name.length
			)
			.slice(0, 8)
			.map((s) => s.ingredient);
	});

	const has = (id: string) => ui.loaded && id in pantry.current;
	function add(ingredient: IngredientLite) {
		if (!has(ingredient.id)) setPantryItem(ingredient.id, null);
		query = '';
	}
	function toggle(ingredient: IngredientLite) {
		if (has(ingredient.id)) removePantryItem(ingredient.id);
		else setPantryItem(ingredient.id, null);
	}

	/** Cooktop drawing: burners in one, two or three columns. */
	const hob = $derived.by(() => {
		const n = kitchen.current.burners;
		const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
		return { n, cols, rows: Math.ceil(n / cols), w: n <= 4 ? 120 : 170 };
	});

	const items = $derived(
		ui.loaded
			? Object.keys(pantry.current)
					.map((id) => catalog().ingredientsById.get(id))
					.filter((i): i is IngredientLite => !!i)
			: []
	);

	function takeOut(ingredient: IngredientLite) {
		const before = pantry.current;
		removePantryItem(ingredient.id);
		toast(`${ingredient.name} preč zo špajze`, () => (pantry.current = before));
	}

	function clearAll() {
		const before = pantry.current;
		pantry.current = {};
		toast('Špajza je prázdna', () => (pantry.current = before));
	}
</script>

<svelte:head>
	<title>Moja kuchyňa – Receptio</title>
</svelte:head>

<div class="wrap page">
	<p class="eyebrow">Moja kuchyňa</p>
	<h1>Čím a z čoho varíš</h1>
	<p class="lede">
		Podľa toho sa jedlá zoradia, vyberie sa spôsob prípravy, ktorý zvládneš, a naplánuje sa čas pre
		tvoje platne a rúru.
	</p>

	<section id="vybavenie" class="card box">
		<h2 class="section-title"><Icon name="pot" size={20} /> Vybavenie</h2>

		<div class="burners">
			<div>
				<h3>Platne na sporáku</h3>
				<p class="hint">Koľko hrncov a panvíc môže ísť naraz.</p>
			</div>
			<div class="burner-row" role="group" aria-label="Počet platní">
				<button
					class="icon-btn"
					onclick={() => setBurners(kitchen.current.burners - 1)}
					disabled={kitchen.current.burners <= 1}
					aria-label="Menej platní"><Icon name="minus" size={18} /></button
				>
				<svg
					class="cooktop"
					viewBox="0 0 {kitchen.current.burners <= 2
						? 120
						: kitchen.current.burners <= 4
							? 120
							: 170} 110"
					role="img"
					aria-label="{kitchen.current.burners} {kitchen.current.burners === 1
						? 'platňa'
						: kitchen.current.burners < 5
							? 'platne'
							: 'platní'}"
				>
					<rect x="2" y="2" width={hob.w - 4} height="106" rx="12" class="glass-top" />
					{#each Array.from({ length: hob.n }, (_, i) => i) as i (i)}
						{@const x = ((i % hob.cols) + 0.5) * ((hob.w - 4) / hob.cols) + 2}
						{@const y = (Math.floor(i / hob.cols) + 0.5) * (106 / hob.rows) + 2}
						<g class="hob" style:--i={i}>
							<circle cx={x} cy={y} r={hob.rows > 1 ? 18 : 26} class="hob-ring" />
							<circle cx={x} cy={y} r={hob.rows > 1 ? 10 : 15} class="hob-ring inner" />
						</g>
					{/each}
				</svg>
				<button
					class="icon-btn"
					onclick={() => setBurners(kitchen.current.burners + 1)}
					disabled={kitchen.current.burners >= MAX_BURNERS}
					aria-label="Viac platní"><Icon name="plus" size={18} /></button
				>
			</div>
		</div>

		<h3>Spotrebiče</h3>
		<div class="tools">
			{#each KITCHEN_TOOLS as tool (tool)}
				{@const meta = TOOL_META[tool]}
				{@const on = kitchen.current.tools.includes(tool)}
				<button
					class="tool draw-host"
					aria-pressed={on}
					onclick={() => {
						toggleTool(tool);
						markSet();
					}}
				>
					<span class="tool-icon"><Icon name={meta.icon} size={30} /></span>
					<span class="tool-text">
						<strong>{meta.label}</strong>
						<small>{meta.hint}</small>
					</span>
					<span class="tick"><Icon name={on ? 'check' : 'plus'} size={16} stroke={2.4} /></span>
				</button>
			{/each}
		</div>
		{#if ui.loaded && !settings.current.kitchenSet}
			<button class="btn leaf small" onclick={markSet}
				><Icon name="check" size={16} /> Takto to sedí</button
			>
		{/if}
	</section>

	<section id="spajza" class="card box">
		<h2 class="section-title">
			<Icon name="jar" size={20} /> Špajza
			{#if items.length}<span class="badge">{items.length}</span>{/if}
		</h2>
		<p class="hint">
			Čo máš doma. Soľ, olej a koreniny netreba – s tými sa počíta. Po varení ich vieš odpočítať.
		</p>

		<div class="search">
			<label class="field">
				<Icon name="search" size={18} />
				<span class="sr-only">Pridať surovinu</span>
				<input type="search" placeholder="Pridať surovinu…" bind:value={query} autocomplete="off" />
			</label>
			{#if results.length}
				<ul class="results" role="listbox" aria-label="Nájdené suroviny">
					{#each results as r (r.id)}
						<li>
							<button onclick={() => add(r)} disabled={has(r.id)}>
								<span class="swatch" style:--c={r.color}></span>
								{r.name}
								<span class="muted small">{CATEGORY_LABELS[r.category]}</span>
								{#if has(r.id)}<Icon name="check" size={16} />{/if}
							</button>
						</li>
					{/each}
				</ul>
			{:else if query.trim().length >= 2}
				<p class="hint">Nič také nepoznáme.</p>
			{/if}
		</div>

		<h3>Najčastejšie v jedlách</h3>
		<div class="chips quick">
			{#each common as i (i.id)}
				<button class="chip" aria-pressed={has(i.id)} onclick={() => toggle(i)}>
					<span class="swatch" style:--c={i.color}></span>
					{i.name}
				</button>
			{/each}
		</div>

		{#if items.length}
			<div class="have">
				<PantryShelf {items} onremove={takeOut} />
			</div>
			<div class="foot-actions">
				<a class="btn leaf" href="/tanier"><Icon name="pot" size={18} /> Čo z toho uvarím</a>
				<button class="btn ghost small" onclick={clearAll}
					><Icon name="trash" size={16} /> Vyprázdniť</button
				>
			</div>
		{/if}
	</section>
</div>

<style>
	.page > h1 {
		margin: var(--sp-1) 0 var(--sp-2);
	}
	section {
		margin-top: var(--sp-5);
	}
	h3 {
		margin: var(--sp-4) 0 var(--sp-2);
		font-size: var(--fs-base);
	}
	.burners {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}
	.burners h3 {
		margin-top: 0;
		margin-bottom: 2px;
	}
	.burners .hint {
		margin: 0;
	}
	.burner-row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.cooktop {
		width: 150px;
		height: auto;
	}
	.glass-top {
		fill: #22282a;
	}
	.hob {
		animation: hob-in 0.45s var(--ease-spring) both;
		animation-delay: calc(var(--i) * 40ms);
		transform-box: fill-box;
		transform-origin: center;
	}
	@keyframes hob-in {
		from {
			opacity: 0;
			transform: scale(0.4);
		}
	}
	.hob-ring {
		fill: none;
		stroke: var(--tomato);
		stroke-width: 3;
		filter: drop-shadow(0 0 3px var(--tomato));
	}
	.hob-ring.inner {
		stroke-width: 2;
		opacity: 0.6;
	}
	.tools {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}
	.tool {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3);
		border: 2px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--card);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			border-color 0.2s,
			background 0.2s,
			transform 0.25s var(--ease-spring);
	}
	.tool:hover {
		transform: translateY(-2px);
	}
	.tool[aria-pressed='true'] {
		border-color: var(--leaf);
		background: var(--leaf-soft);
	}
	.tool-icon {
		display: grid;
		color: var(--ink-2);
	}
	.tool[aria-pressed='true'] .tool-icon {
		color: var(--leaf);
	}
	.tool-text {
		display: grid;
		min-width: 0;
	}
	.tool-text small {
		color: var(--muted);
		font-size: var(--fs-xs);
	}
	.tick {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--paper-2);
		color: var(--muted);
	}
	.tool[aria-pressed='true'] .tick {
		background: var(--leaf);
		color: var(--paper);
	}
	.search {
		position: relative;
		max-width: 480px;
	}
	.results {
		display: grid;
		margin: var(--sp-2) 0 0;
		padding: var(--sp-1);
		list-style: none;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--card);
		box-shadow: var(--shadow);
	}
	.results button {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		width: 100%;
		min-height: var(--tap);
		padding: var(--sp-1) var(--sp-3);
		border: 0;
		border-radius: var(--radius-xs);
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.results button:hover:not(:disabled) {
		background: var(--paper-2);
	}
	.results button:disabled {
		color: var(--leaf);
		cursor: default;
	}
	.results .small {
		margin-left: auto;
	}
	.quick {
		flex-wrap: wrap;
	}
	.chip .swatch {
		width: 10px;
		height: 10px;
	}
	.have {
		display: grid;
		gap: var(--sp-1);
		margin-top: var(--sp-4);
		padding-top: var(--sp-2);
		border-top: 1px dashed var(--line);
	}
	.foot-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-top: var(--sp-5);
	}
</style>

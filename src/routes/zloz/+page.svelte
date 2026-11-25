<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { formatEur, formatMinutes, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import PartArt from '$lib/components/PartArt.svelte';
	import {
		amountText,
		composePart,
		decodeComposition,
		GROUPS,
		shortName,
		suits,
		TECHNIQUES,
		type Group,
		type Technique
	} from '$lib/composer';
	import { pantryByGroup } from '$lib/pantry';
	import { keepPart, kitchen, pantry, ui } from '$lib/state.svelte';
	import { planTimeline } from '$lib/timeline';

	const catalog = useCatalog();
	const data = $derived(catalog().composer);

	const ICONS: Record<Technique, IconName> = {
		wok: 'pan',
		plech: 'tray',
		hrniec: 'pot',
		polievka: 'soup',
		salat: 'salad'
	};
	const GROUP_LABELS: Record<Group, string> = {
		bielkovina: 'Bielkovina',
		zelenina: 'Zelenina',
		listy: 'Listová zelenina',
		aroma: 'Na chuť'
	};
	const MAX_ITEMS = 10;

	let technique = $state<Technique>('wok');
	let items = $state<string[]>([]);
	let base = $state('');
	let toppings = $state<string[]>([]);
	/** Where to go back to: the builder's query and the spot this recipe fills. */
	let back = $state('');
	let spot = $state('hlavne');

	onMount(() => {
		const params = new URLSearchParams(location.search);
		back = params.get('spat') ?? '';
		spot = params.get('miesto') === 'zelenina' ? 'zelenina' : 'hlavne';
		const editing = params.get('recept');
		const c = editing ? decodeComposition(editing, catalog().composer) : null;
		if (c) {
			technique = c.technique;
			items = c.items;
			base = c.base;
			toppings = c.toppings;
		} else if (spot === 'zelenina') technique = 'salat';
	});

	const bases = $derived(Object.values(data.bases).filter((b) => b.techniques.includes(technique)));
	const fitting = $derived(Object.values(data.ingredients).filter((i) => suits(i, technique)));

	function pickTechnique(t: Technique) {
		technique = t;
		// Keep what still works with the new technique.
		items = items.filter((i) => data.ingredients[i] && suits(data.ingredients[i], t));
		if (!data.bases[base]?.techniques.includes(t)) base = '';
	}

	function toggle(id: string) {
		items = items.includes(id)
			? items.filter((i) => i !== id)
			: items.length < MAX_ITEMS
				? [...items, id]
				: items;
	}
	function toggleTopping(id: string) {
		toppings = toppings.includes(id)
			? toppings.filter((t) => t !== id)
			: [...toppings, id].slice(-4);
	}

	const groups = $derived(
		ui.loaded ? pantryByGroup(pantry.current, catalog().ingredientsById) : new Map()
	);
	const atHome = (id: string) => {
		const i = catalog().ingredientsById.get(id);
		return !!i && groups.has(i.group);
	};
	const label = (id: string) => {
		const n = shortName(catalog().ingredientsById.get(id)?.name ?? id);
		return n.charAt(0).toUpperCase() + n.slice(1);
	};

	const chosenBase = $derived(base || bases[0]?.id || '');
	const hasMain = $derived(items.some((i) => data.ingredients[i]?.group !== 'aroma'));
	const part = $derived(
		hasMain && chosenBase
			? composePart(
					{ technique, items, base: chosenBase, toppings },
					data,
					catalog().ingredientsById,
					catalog().prices,
					items.some((i) => data.ingredients[i]?.group === 'bielkovina') ? 'hlavne' : 'zelenina'
				)
			: null
	);
	const method = $derived(part?.methods[0]);
	const timeline = $derived(
		part && method
			? planTimeline(
					[{ id: part.id, name: part.name, early: part.early, steps: method.steps }],
					[],
					kitchen.current
				)
			: null
	);
	const noOven = $derived(technique === 'plech' && !kitchen.current.tools.includes('rura'));

	function onPlate() {
		if (!part) return;
		catalog().partsById.set(part.id, part);
		keepPart(part.id);
		const params = new URLSearchParams(back);
		params.set(part.kind === 'zelenina' ? 'zelenina' : spot, part.id);
		params.delete('typ');
		void goto(`/?${params}`);
	}

	function cookNow() {
		if (!part) return;
		catalog().partsById.set(part.id, part);
		keepPart(part.id);
		void goto(
			`/jedlo/vlastne/varim?${part.kind === 'zelenina' ? 'zelenina' : 'hlavne'}=${encodeURIComponent(part.id)}`
		);
	}
</script>

<svelte:head>
	<title>Zlož si recept – Receptio</title>
</svelte:head>

<div class="wrap page">
	<a class="back" href={back ? `/?${back}` : '/'}
		><Icon name="arrow-left" size={16} /> Späť na tanier</a
	>
	<h1>Zlož si recept</h1>
	<p class="lede">Vyber spôsob a suroviny. Množstvá, poradie, časy aj kroky sa poskladajú samé.</p>

	<div class="layout">
		<div class="steps">
			<section>
				<h2><span class="num">1</span> Ako</h2>
				<div class="techniques">
					{#each TECHNIQUES as t (t)}
						<button
							class="technique draw-host"
							aria-pressed={technique === t}
							onclick={() => pickTechnique(t)}
						>
							<Icon name={ICONS[t]} size={28} />
							<strong>{data.techniques[t].name}</strong>
							<small>{data.techniques[t].about}</small>
						</button>
					{/each}
				</div>
				{#if noOven}
					<p class="notice warn">
						<Icon name="alert" size={18} />
						<span>Na plech treba rúru – v tvojej kuchyni nie je.</span>
					</p>
				{/if}
			</section>

			<section>
				<h2>
					<span class="num">2</span> Z čoho
					<span class="badge">{items.length}/{MAX_ITEMS}</span>
				</h2>
				{#each GROUPS as g (g)}
					{@const options = fitting.filter((i) => i.group === g)}
					{#if options.length}
						<h3>{GROUP_LABELS[g]}</h3>
						<div class="chips wrapped">
							{#each options as i (i.id)}
								<button
									class="chip ing"
									aria-pressed={items.includes(i.id)}
									onclick={() => toggle(i.id)}
								>
									<span class="swatch" style:--c={catalog().ingredientsById.get(i.id)?.color}
									></span>
									{label(i.id)}
									{#if atHome(i.id)}<span class="home" title="Máš doma">doma</span>{/if}
								</button>
							{/each}
						</div>
					{/if}
				{/each}
			</section>

			<section>
				<h2><span class="num">3</span> Chuť</h2>
				<div class="chips wrapped">
					{#each bases as b (b.id)}
						<button class="chip" aria-pressed={chosenBase === b.id} onclick={() => (base = b.id)}
							>{b.name}</button
						>
					{/each}
				</div>
			</section>

			<section>
				<h2><span class="num">4</span> Navrch <small class="muted">nepovinné</small></h2>
				<div class="chips wrapped">
					{#each Object.keys(data.toppings) as t (t)}
						<button
							class="chip"
							aria-pressed={toppings.includes(t)}
							onclick={() => toggleTopping(t)}>{label(t)}</button
						>
					{/each}
				</div>
			</section>
		</div>

		<aside class="preview card">
			{#if part && method && timeline}
				<div class="art"><PartArt {part} {method} byId={catalog().ingredientsById} /></div>
				<h2 class="name">{part.name}</h2>
				<p class="muted small">{part.description}</p>
				<ul class="facts">
					<li><Icon name="clock" size={15} /> {formatMinutes(timeline.total)}</li>
					<li><Icon name="bean" size={15} /> {formatNumber(method.perServing.protein, 0)} g</li>
					<li><Icon name="flame" size={15} /> {formatNumber(method.perServing.kcal, 0)} kcal</li>
					<li><Icon name="euro" size={15} /> ~{formatEur(method.costPerServing)}</li>
				</ul>
				<details class="disclosure">
					<summary>Suroviny a kroky na 2 porcie</summary>
					<ul class="lines">
						{#each method.lines.filter((l) => l.ingredientId !== 'voda') as l, i (i)}
							<li><span>{label(l.ingredientId)}</span><span>{amountText(l)}</span></li>
						{/each}
					</ul>
					<ol class="recipe">
						{#each method.steps.filter((s) => s.text !== 'Nechaj postáť.') as s, i (i)}
							<li>{s.text}</li>
						{/each}
					</ol>
				</details>
				<div class="go">
					<button class="btn leaf" onclick={onPlate} disabled={noOven}
						><Icon name="plus" size={16} /> Na tanier</button
					>
					<button class="btn ghost" onclick={cookNow} disabled={noOven}
						><Icon name="play" size={16} /> Variť hneď</button
					>
				</div>
			{:else}
				<div class="empty-preview">
					<Icon name={ICONS[technique]} size={40} draw />
					<p>Vyber aspoň jednu bielkovinu alebo zeleninu.</p>
				</div>
			{/if}
		</aside>
	</div>
</div>

<style>
	.page > h1 {
		margin: var(--sp-1) 0 var(--sp-1);
	}
	.lede {
		margin: 0 0 var(--sp-4);
	}
	.layout {
		display: grid;
		gap: var(--sp-5);
	}
	.steps {
		display: grid;
		gap: var(--sp-5);
		min-width: 0;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin: 0 0 var(--sp-3);
		font-size: var(--fs-xl);
	}
	h3 {
		margin: var(--sp-3) 0 var(--sp-2);
		color: var(--muted);
		font-size: var(--fs-sm);
	}
	.num {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--leaf);
		color: var(--paper);
		font-family: var(--font-body);
		font-size: var(--fs-sm);
		font-weight: 800;
	}
	.techniques {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--sp-2);
	}
	.technique {
		display: grid;
		justify-items: start;
		gap: 4px;
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
	.technique:hover {
		transform: translateY(-2px);
	}
	.technique[aria-pressed='true'] {
		border-color: var(--leaf);
		background: var(--leaf-soft);
		color: var(--ink);
	}
	.technique :global(svg) {
		color: var(--leaf);
	}
	.technique small {
		color: var(--muted);
		font-size: var(--fs-xs);
		line-height: 1.35;
	}
	.wrapped {
		flex-wrap: wrap;
	}
	.ing .swatch {
		width: 10px;
		height: 10px;
	}
	.home {
		padding: 0 5px;
		border-radius: 999px;
		background: var(--leaf-soft);
		color: var(--leaf);
		font-size: 10px;
		font-weight: 800;
	}
	.chip[aria-pressed='true'] .home {
		background: color-mix(in srgb, var(--paper) 25%, transparent);
		color: var(--paper);
	}
	.preview {
		display: grid;
		gap: var(--sp-2);
		align-content: start;
		padding: var(--sp-4);
	}
	.art {
		justify-self: center;
		width: 140px;
		animation: pop 0.5s var(--ease-spring);
	}
	@keyframes pop {
		from {
			transform: scale(0.8) rotate(-15deg);
		}
	}
	.name {
		margin: 0;
		font-size: var(--fs-lg);
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1) var(--sp-3);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--fs-sm);
		font-weight: 650;
	}
	.facts li {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.lines {
		margin: var(--sp-2) 0;
		padding: 0;
		list-style: none;
		font-size: var(--fs-sm);
	}
	.lines li {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-2);
		padding: 3px 0;
		border-bottom: 1px dashed var(--line);
	}
	.recipe {
		display: grid;
		gap: var(--sp-2);
		margin: var(--sp-2) 0 0;
		padding-left: 1.3em;
		font-size: var(--fs-sm);
	}
	.go {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
	}
	.go .btn {
		flex: 1;
		justify-content: center;
	}
	.empty-preview {
		display: grid;
		justify-items: center;
		gap: var(--sp-2);
		padding: var(--sp-5) 0;
		color: var(--muted);
		text-align: center;
	}
	@media (max-width: 899px) {
		.preview {
			position: sticky;
			bottom: calc(84px + env(safe-area-inset-bottom));
			z-index: 20;
			box-shadow: var(--shadow-lift);
			max-height: 60dvh;
			overflow: auto;
		}
		.art,
		.preview > .small {
			display: none;
		}
	}
	@media (min-width: 900px) {
		.layout {
			grid-template-columns: 1fr 340px;
			align-items: start;
		}
		.preview {
			position: sticky;
			top: calc(var(--header-h) + var(--sp-4));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.art {
			animation: none;
		}
	}
</style>

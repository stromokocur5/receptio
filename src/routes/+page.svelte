<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import DishCard from '$lib/components/DishCard.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import {
		buildToParams,
		defaultChoice,
		matchDish,
		rankDishes,
		TOOL_META,
		type Build,
		type Dish,
		type DishMatch
	} from '$lib/dish';
	import { normalizeSearch, searchMatcher } from '$lib/labels';
	import { composePlate, type Plate } from '$lib/plate';
	import { kitchen, pantry, settings, ui } from '$lib/state.svelte';

	const catalog = useCatalog();

	type MealFilter = 'vsetko' | 'ranajky' | 'jedlo';
	const FILTERS: { id: MealFilter; label: string }[] = [
		{ id: 'vsetko', label: 'Všetko' },
		{ id: 'ranajky', label: 'Raňajky' },
		{ id: 'jedlo', label: 'Obed a večera' }
	];
	let filter = $state<MealFilter>('vsetko');
	let query = $state('');

	const pantryCount = $derived(ui.loaded ? Object.keys(pantry.current).length : 0);
	const hasPantry = $derived(pantryCount > 0);

	interface Entry {
		dish: Dish;
		match?: DishMatch;
		plate: Plate;
		href: string;
		/** Names of the dish, its parts and their ingredients, for the search. */
		text: string;
	}

	const entries = $derived.by((): Entry[] => {
		const { dishes, partsById, ingredientsById } = catalog();
		const matches = hasPantry
			? rankDishes(
					dishes.flatMap((d) => {
						const m = matchDish(d, pantry.current, partsById, ingredientsById, kitchen.current);
						return m ? [m] : [];
					})
				)
			: null;
		const ordered: { dish: Dish; match?: DishMatch }[] =
			matches?.map((match) => ({ dish: match.dish, match })) ?? dishes.map((dish) => ({ dish }));
		return ordered.map(({ dish, match }) => {
			const build: Build = {
				servings: dish.servings,
				choice: match?.choice ?? defaultChoice(dish),
				methods: {}
			};
			const plate = composePlate(dish, build, kitchen.current, partsById, ingredientsById);
			const params = buildToParams(dish, build).toString();
			const names = dish.slots.flatMap((s) =>
				s.options.flatMap((id) => {
					const part = partsById.get(id)!;
					return [
						part.name,
						...part.methods[0].lines.map((l) => ingredientsById.get(l.ingredientId)?.name ?? '')
					];
				})
			);
			return {
				dish,
				match,
				plate,
				href: `/jedlo/${dish.id}${params ? `?${params}` : ''}`,
				text: normalizeSearch([dish.name, dish.description, ...names].join(' '))
			};
		});
	});

	const visible = $derived.by(() => {
		const matches = searchMatcher(
			entries.map((e) => e.text),
			query
		);
		return entries.filter(
			(e) =>
				matches(e.text) &&
				(filter === 'vsetko' ||
					(filter === 'ranajky'
						? e.dish.meals.includes('ranajky')
						: e.dish.meals.some((m) => m === 'obed' || m === 'vecera')))
		);
	});

	const missingCount = (e: Entry) => (e.match ? e.match.missing.length + e.match.short.length : 0);
	const groups = $derived(
		hasPantry
			? [
					{
						title: 'Môžeš hneď',
						hint: 'Všetko máš doma.',
						items: visible.filter((e) => missingCount(e) === 0)
					},
					{
						title: 'Skoro',
						hint: 'Chýba jedna alebo dve veci.',
						items: visible.filter((e) => missingCount(e) > 0 && missingCount(e) <= 2)
					},
					{ title: 'Na nákup', hint: '', items: visible.filter((e) => missingCount(e) > 2) }
				].filter((g) => g.items.length)
			: [{ title: '', hint: '', items: visible }]
	);

	const kitchenSummary = $derived(
		[
			`${kitchen.current.burners} ${kitchen.current.burners === 1 ? 'platňa' : kitchen.current.burners < 5 ? 'platne' : 'platní'}`,
			...kitchen.current.tools.map((t) => TOOL_META[t].label.toLowerCase())
		].join(' · ')
	);
</script>

<svelte:head>
	<title>Receptio – čo dnes uvaríš</title>
	<meta
		name="description"
		content="Vegánske jedlá poskladané z toho, čo máš doma, a uvarené tým, čo máš v kuchyni."
	/>
</svelte:head>

<div class="wrap page">
	<header class="hero">
		<p class="eyebrow">Vegánska kuchyňa</p>
		<h1>Čo dnes uvaríš?</h1>
		<p class="lede">
			{#if hasPantry}
				Máš doma {pantryCount}
				{pantryCount === 1 ? 'vec' : pantryCount < 5 ? 'veci' : 'vecí'} – tu je, čo z nich spravíš. Prílohu
				aj spôsob prípravy si v jedle vymeníš.
			{:else}
				Jedlá poskladané z častí – prílohu, omáčku aj spôsob prípravy si vymeníš. Povedz, čo máš
				doma, a zoradia sa podľa toho.
			{/if}
		</p>
		<a class="kitchen-strip draw-host" href="/kuchyna">
			<Icon name="jar" size={18} />
			<span>
				<strong>{hasPantry ? `Špajza: ${pantryCount}` : 'Špajza je prázdna'}</strong>
				<span class="muted"> · {kitchenSummary}</span>
			</span>
			<Icon name="arrow-right" size={16} />
		</a>
	</header>

	{#if ui.loaded && !settings.current.kitchenSet}
		<aside class="setup card">
			<div class="tools-art" aria-hidden="true">
				<Icon name="oven" size={30} />
				<Icon name="airfryer" size={30} />
				<Icon name="pressure-cooker" size={30} />
			</div>
			<div>
				<h2>Čím varíš?</h2>
				<p>
					Máš airfryer, ale nie rúru? Dve platne namiesto štyroch? Recepty sa prispôsobia – ukážu
					spôsob, ktorý zvládneš, a čas, ktorý naozaj potrebuješ.
				</p>
			</div>
			<a class="btn leaf" href="/kuchyna#vybavenie"
				><Icon name="sliders" size={18} /> Nastaviť kuchyňu</a
			>
		</aside>
	{/if}

	<div class="controls">
		<div class="segmented" role="group" aria-label="Jedlo dňa">
			{#each FILTERS as f (f.id)}
				<button aria-pressed={filter === f.id} onclick={() => (filter = f.id)}>{f.label}</button>
			{/each}
		</div>
		<label class="field search">
			<Icon name="search" size={18} />
			<span class="sr-only">Hľadať jedlo alebo surovinu</span>
			<input type="search" placeholder="Jedlo alebo surovina…" bind:value={query} />
		</label>
	</div>

	{#each groups as group (group.title)}
		<section class="group">
			{#if group.title}
				<h2 class="group-title">
					{group.title}
					<span class="badge">{group.items.length}</span>
				</h2>
				{#if group.hint}<p class="hint">{group.hint}</p>{/if}
			{/if}
			<div class="grid">
				{#each group.items as entry, i (entry.dish.id)}
					<DishCard
						dish={entry.dish}
						plate={entry.plate}
						match={entry.match}
						href={entry.href}
						index={i}
					/>
				{/each}
			</div>
		</section>
	{:else}
		<div class="empty">
			<Icon name="search" size={28} />
			<p>Nič také tu zatiaľ nie je. Skús iné slovo.</p>
		</div>
	{/each}
</div>

<style>
	.hero {
		display: grid;
		gap: var(--sp-2);
		margin-bottom: var(--sp-5);
	}
	.hero h1 {
		margin: 0;
		font-size: clamp(2.2rem, 7vw, 3.6rem);
	}
	.hero .lede {
		margin: 0;
	}
	.kitchen-strip {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		justify-self: start;
		max-width: 100%;
		margin-top: var(--sp-2);
		padding: var(--sp-2) var(--sp-4);
		border: 1.5px solid var(--line);
		border-radius: 999px;
		background: var(--card);
		color: var(--ink);
		text-decoration: none;
		font-size: var(--fs-sm);
		transition: border-color 0.2s;
	}
	.kitchen-strip:hover {
		border-color: var(--ink-2);
	}
	.kitchen-strip > span {
		min-width: 0;
	}
	.setup {
		display: grid;
		gap: var(--sp-3) var(--sp-5);
		align-items: center;
		margin-bottom: var(--sp-5);
		padding: var(--sp-5);
		background: linear-gradient(135deg, var(--leaf-soft), var(--card) 70%);
	}
	.setup h2 {
		margin: 0 0 var(--sp-1);
	}
	.setup p {
		margin: 0;
		color: var(--ink-2);
		max-width: 60ch;
	}
	.setup .btn {
		justify-self: start;
	}
	.tools-art {
		display: flex;
		gap: var(--sp-3);
		color: var(--leaf);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		align-items: center;
		margin-bottom: var(--sp-5);
	}
	.search {
		flex: 1 1 240px;
		max-width: 420px;
	}
	.group + .group {
		margin-top: var(--sp-6);
	}
	.group-title {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin: 0;
	}
	.group .hint {
		margin: var(--sp-1) 0 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
		gap: var(--sp-4);
		margin-top: var(--sp-4);
	}
	@media (min-width: 720px) {
		.setup {
			grid-template-columns: auto 1fr auto;
		}
	}
</style>

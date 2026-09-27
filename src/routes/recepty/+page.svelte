<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { onMount } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import { MEAL_LABELS, normalizeSearch, searchMatcher, pluralRecipes } from '$lib/labels';
	import {
		ALLERGEN_LABELS,
		COMPUTED_TAG_LABELS,
		SALT_HIGH_G,
		computedTags,
		cookingStyle
	} from '$lib/nutrition';
	import { recipeSeason } from '$lib/season';
	import { rankByPantry, type PantryMatch } from '$lib/pantry';
	import { likes, pantry, ui } from '$lib/state.svelte';
	import { MEALS, type Allergen, type Meal, type RecipeSummary } from '$lib/types';

	const catalog = useCatalog();

	const SORTS = {
		odporucane: 'Odporúčané',
		'protein-eur': 'Bielkoviny za €',
		protein: 'Najviac bielkovín',
		cas: 'Najrýchlejšie',
		cena: 'Najlacnejšie',
		spajza: 'Podľa špajze'
	} as const;
	type Sort = keyof typeof SORTS;
	const EXCLUDABLE: Allergen[] = ['soy', 'peanuts', 'nuts', 'sesame', 'celery', 'mustard'];
	const TIME_STEPS = [15, 20, 30, 45, 60, 0];
	/** Tools people often don't have; "nemám rúru" hides recipes that need one. */
	const MISSING_TOOLS: Record<string, string> = {
		rura: 'rúru',
		mixer: 'mixér',
		sekacik: 'sekáčik',
		teplomer: 'teplomer'
	};

	let q = $state('');
	/** 0 = all, 1 = strictly GF (+ label-check risk), 2 = also GF after swaps */
	let gf = $state(0);
	let cuisine = $state('');
	let meal = $state<Meal | ''>('');
	let maxTimeIndex = $state(TIME_STEPS.length - 1);
	let minProtein = $state(0);
	let excluded = $state<Allergen[]>([]);
	let missingTools = $state<string[]>([]);
	/** Quick picks: one pot, no cooking, oven only, mild (kids), in season now. */
	const QUICK = [
		'jeden-hrniec',
		'bez-varenia',
		'len-rura',
		'jemne',
		'sezonne',
		'menej-soli'
	] as const;
	type Quick = (typeof QUICK)[number];
	const QUICK_LABELS: Record<Quick, string> = {
		'jeden-hrniec': COMPUTED_TAG_LABELS['jeden-hrniec'],
		'bez-varenia': COMPUTED_TAG_LABELS['bez-varenia'],
		'len-rura': COMPUTED_TAG_LABELS['len-rura'],
		jemne: 'Nepálivé, pre deti',
		sezonne: 'Z toho, čo je v sezóne',
		'menej-soli': 'Menej soli'
	};
	let quick = $state<Quick[]>([]);
	/** Salty recipes still count when their automatic "Menej soli" version gets under the line. */
	const lowSalt = (r: RecipeSummary) =>
		r.perServing.salt <= SALT_HIGH_G ||
		r.variants.some((v) => v.name === 'Menej soli' && v.perServing.salt <= SALT_HIGH_G);
	const month = new Date().getMonth() + 1;
	/** all | bez = works without vegan substitutes | s = uses them (base or a variant) */
	let subs = $state<'all' | 'bez' | 's'>('all');
	let difficulty = $state<0 | 1 | 2 | 3>(0);
	let onlyPantry = $state(false);
	let sort = $state<Sort>('odporucane');
	let filtersOpen = $state(false);

	const PAGE_SIZE = 24;
	let limit = $state(PAGE_SIZE);

	const maxTime = $derived(TIME_STEPS[maxTimeIndex]);

	const searchIndex = $derived(
		new Map(
			catalog.recipes.map((r) => [
				r.id,
				normalizeSearch(
					[
						r.title,
						r.description,
						catalog.cuisinesById.get(r.cuisine)?.name ?? '',
						...r.lines.map((l) => catalog.ingredientsById.get(l.ingredientId)?.name ?? '')
					].join(' ')
				)
			])
		)
	);

	const matches = $derived(
		new Map<string, PantryMatch>(
			rankByPantry(catalog.recipes, pantry.current, catalog.ingredientsById).map((m) => [
				m.recipe.id,
				m
			])
		)
	);
	const hasPantry = $derived(ui.loaded && Object.keys(pantry.current).length > 0);

	const matchesQuery = $derived(searchMatcher([...searchIndex.values()], q));

	const filtered = $derived.by(() => {
		const list = catalog.recipes.filter((r) => {
			if (!matchesQuery(searchIndex.get(r.id)!)) return false;
			if (gf === 1 && r.gluten === 'contains') return false;
			if (gf === 2 && r.gluten === 'contains' && !r.gfSwappable) return false;
			if (cuisine && r.cuisine !== cuisine) return false;
			if (meal && !r.meals.includes(meal)) return false;
			if (maxTime && r.time > maxTime) return false;
			if (r.perServing.protein < minProtein) return false;
			if (excluded.some((a) => r.allergens.includes(a))) return false;
			if (missingTools.some((t) => r.equipment.includes(t))) return false;
			for (const q of quick) {
				if (q === 'jemne' && r.spicy > 0) return false;
				if (q === 'sezonne' && !recipeSeason(r, catalog.ingredientsById, month).inSeason) {
					return false;
				}
				if (q === 'menej-soli' && !lowSalt(r)) return false;
				if (
					q !== 'jemne' &&
					q !== 'sezonne' &&
					q !== 'menej-soli' &&
					cookingStyle(r.equipment) !== q
				) {
					return false;
				}
			}
			if (subs === 'bez' && r.substitutes === 'required') return false;
			if (subs === 's' && !r.usesSubstitutes && !r.variants.some((v) => v.usesSubstitutes)) {
				return false;
			}
			if (difficulty && r.difficulty !== difficulty) return false;
			return true;
		});
		const by: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
			odporucane: (a, b) =>
				(likes.counts[b.id] ?? 0) - (likes.counts[a.id] ?? 0) ||
				computedTags(b).length - computedTags(a).length,
			'protein-eur': (a, b) =>
				b.perServing.protein / b.costPerServing - a.perServing.protein / a.costPerServing,
			protein: (a, b) => b.perServing.protein - a.perServing.protein,
			cas: (a, b) => a.time - b.time,
			cena: (a, b) => a.costPerServing - b.costPerServing,
			spajza: (a, b) => matches.get(b.id)!.score - matches.get(a.id)!.score
		};
		if (!onlyPantry) return { list: list.sort(by[sort]), closest: 0 };
		const missingCount = (r: (typeof list)[number]) => matches.get(r.id)!.missing.length;
		const cookable = list.filter((r) => missingCount(r) === 0);
		if (cookable.length || !list.length) return { list: cookable.sort(by[sort]), closest: 0 };
		// Nothing cookable from the pantry alone → the nearest recipes, fewest missing first.
		const closest = Math.max(2, Math.min(...list.map(missingCount)));
		return {
			list: list
				.filter((r) => missingCount(r) <= closest)
				.sort((a, b) => missingCount(a) - missingCount(b) || by[sort](a, b)),
			closest
		};
	});
	const results = $derived(filtered.list);

	/** A random recipe from what the current filters allow (or from all, if none match). */
	function surprise() {
		const pool = results.length ? results : catalog.recipes;
		const pick = pool[Math.floor(Math.random() * pool.length)];
		if (pick) void goto(`/recepty/${pick.id}`);
	}

	const shown = $derived(results.slice(0, limit));
	$effect(() => {
		// Any filter change starts from the first page again.
		void results;
		limit = PAGE_SIZE;
	});

	const activeFilterCount = $derived(
		[
			gf,
			cuisine,
			meal,
			maxTime,
			minProtein,
			excluded.length,
			missingTools.length,
			quick.length,
			onlyPantry,
			subs !== 'all',
			difficulty
		].filter(Boolean).length
	);

	function toggleAllergen(a: Allergen) {
		excluded = excluded.includes(a) ? excluded.filter((x) => x !== a) : [...excluded, a];
	}

	function toggleQuick(q: Quick) {
		quick = quick.includes(q) ? quick.filter((x) => x !== q) : [...quick, q];
	}

	function toggleTool(tool: string) {
		missingTools = missingTools.includes(tool)
			? missingTools.filter((t) => t !== tool)
			: [...missingTools, tool];
	}

	function reset() {
		q = '';
		gf = 0;
		cuisine = '';
		meal = '';
		maxTimeIndex = TIME_STEPS.length - 1;
		minProtein = 0;
		excluded = [];
		missingTools = [];
		quick = [];
		subs = 'all';
		difficulty = 0;
		onlyPantry = false;
		sort = 'odporucane';
	}

	// Filters live in the URL so links like /recepty?gf=1 work; prerendered pages can only read it on mount.
	let urlReady = false;
	onMount(() => {
		const p = new URLSearchParams(location.search);
		q = p.get('q') ?? '';
		gf = Math.min(2, Math.max(0, Number(p.get('gf')) || 0));
		cuisine = catalog.cuisinesById.has(p.get('kuchyna') ?? '') ? p.get('kuchyna')! : '';
		const m = p.get('jedlo');
		meal = (MEALS as readonly string[]).includes(m ?? '') ? (m as Meal) : '';
		const s = p.get('sort');
		if (s && s in SORTS) sort = s as Sort;
		if (p.get('spajza') === '1') onlyPantry = true;
		const n = p.get('nahrady');
		if (n === 'bez' || n === 's') subs = n;
		const d = Number(p.get('narocnost'));
		if (d === 1 || d === 2 || d === 3) difficulty = d;
		missingTools = (p.get('nemam') ?? '').split(',').filter((t) => t in MISSING_TOOLS);
		quick = (p.get('rychlo') ?? '')
			.split(',')
			.filter((q): q is Quick => (QUICK as readonly string[]).includes(q));
		urlReady = true;
	});

	$effect(() => {
		const p = new URLSearchParams();
		if (q) p.set('q', q);
		if (gf) p.set('gf', String(gf));
		if (cuisine) p.set('kuchyna', cuisine);
		if (meal) p.set('jedlo', meal);
		if (sort !== 'odporucane') p.set('sort', sort);
		if (onlyPantry) p.set('spajza', '1');
		if (subs !== 'all') p.set('nahrady', subs);
		if (difficulty) p.set('narocnost', String(difficulty));
		if (missingTools.length) p.set('nemam', missingTools.join(','));
		if (quick.length) p.set('rychlo', quick.join(','));
		if (!urlReady) return;
		const search = p.toString();
		if (search !== location.search.slice(1))
			replaceState(search ? `?${search}` : location.pathname, {});
	});
</script>

<Seo
	title="Recepty"
	description="Vegánske a bezlepkové recepty z celého sveta so živinami a cenou porcie."
/>

<div class="wrap page">
	<header class="page-head rise">
		<p class="eyebrow">Recepty</p>
		<h1>Čo dnes uvaríme?</h1>
	</header>

	<div class="toolbar">
		<div class="field grow">
			<Icon name="search" size={20} />
			<label for="q" class="sr-only">Hľadať</label>
			<input id="q" type="search" bind:value={q} placeholder="Názov, surovina, kuchyňa…" />
		</div>
		<label class="field sort">
			<span class="sr-only">Zoradiť</span>
			<select bind:value={sort}>
				{#each Object.entries(SORTS) as [value, label] (value)}
					<option {value} disabled={value === 'spajza' && !hasPantry}>{label}</option>
				{/each}
			</select>
		</label>
		<button
			class="btn ghost filter-toggle"
			aria-expanded={filtersOpen}
			aria-controls="filters"
			onclick={() => (filtersOpen = !filtersOpen)}
		>
			<Icon name="sliders" size={18} /> Filtre
			{#if activeFilterCount}<span class="count">{activeFilterCount}</span>{/if}
		</button>
	</div>

	<nav class="ideas" aria-label="Nevieš, čo variť?">
		<span class="ideas-label">Nevieš, čo variť?</span>
		<a class="idea" href="/spajza" style:--tone="var(--turmeric)"
			><span class="idea-ico"><Icon name="jar" size={16} /></span> Z toho, čo mám doma</a
		>
		<a class="idea" href="/zvysky" style:--tone="var(--leaf-2)"
			><span class="idea-ico"><Icon name="history" size={16} /></span> Zo zvyškov</a
		>
		<a class="idea" href="/sezona" style:--tone="var(--leaf)"
			><span class="idea-ico"><Icon name="leaf" size={16} /></span> V sezóne</a
		>
		<a class="idea" href="/plan#navrh" style:--tone="var(--sky)"
			><span class="idea-ico"><Icon name="calendar" size={16} /></span> Navrhni mi týždeň</a
		>
		<button class="idea" style:--tone="var(--tomato)" onclick={surprise}
			><span class="idea-ico"><Icon name="sparkle" size={16} /></span> Prekvap ma</button
		>
	</nav>

	<div class="layout">
		<aside id="filters" class="filters card" class:open={filtersOpen}>
			<fieldset>
				<legend>Rýchly výber</legend>
				<div class="chips">
					{#each QUICK as q (q)}
						<button class="chip" aria-pressed={quick.includes(q)} onclick={() => toggleQuick(q)}>
							{QUICK_LABELS[q]}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Lepok</legend>
				<div class="chips">
					{#each ['Všetko', 'Bezlepkové', 'Aj s bezlepkovou verziou'] as label, i (label)}
						<button class="chip" aria-pressed={gf === i} onclick={() => (gf = i)}>{label}</button>
					{/each}
				</div>
				{#if gf}
					<p class="hint">
						Bezlepkové* = niektorá surovina (bujón, tortilly…) môže mať lepok, kontroluj etiketu.
					</p>
				{/if}
			</fieldset>

			<fieldset>
				<legend>Jedlo</legend>
				<div class="chips">
					{#each MEALS as m (m)}
						<button
							class="chip"
							aria-pressed={meal === m}
							onclick={() => (meal = meal === m ? '' : m)}
						>
							{MEAL_LABELS[m]}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Vegánske náhrady</legend>
				<div class="chips">
					<button class="chip" aria-pressed={subs === 'all'} onclick={() => (subs = 'all')}
						>Všetko</button
					>
					<button class="chip" aria-pressed={subs === 'bez'} onclick={() => (subs = 'bez')}>
						Bez náhrad
					</button>
					<button class="chip" aria-pressed={subs === 's'} onclick={() => (subs = 's')}>
						S náhradami
					</button>
				</div>
				<p class="hint">
					Rastlinná smotana, maslo, syr, jogurt, majonéza, sójové mäso. <a href="/wiki/nahrady"
						>Čo kupovať</a
					>
				</p>
			</fieldset>

			<fieldset>
				<legend>Náročnosť</legend>
				<div class="chips">
					{#each ['Jednoduché', 'Stredné', 'Náročnejšie'] as label, i (label)}
						<button
							class="chip"
							aria-pressed={difficulty === i + 1}
							onclick={() => (difficulty = difficulty === i + 1 ? 0 : ((i + 1) as 1 | 2 | 3))}
						>
							{label}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Kuchyňa</legend>
				<label class="field">
					<span class="sr-only">Kuchyňa</span>
					<select bind:value={cuisine}>
						<option value="">Všetky kuchyne</option>
						{#each catalog.cuisines as c (c.id)}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
				</label>
			</fieldset>

			<fieldset>
				<legend>Čas: <strong>{maxTime ? `do ${maxTime} min` : 'hocikoľko'}</strong></legend>
				<input
					type="range"
					min="0"
					max={TIME_STEPS.length - 1}
					step="1"
					bind:value={maxTimeIndex}
					aria-label="Maximálny čas"
				/>
			</fieldset>

			<fieldset>
				<legend
					>Bielkoviny: <strong>{minProtein ? `aspoň ${minProtein} g/porcia` : 'hocikoľko'}</strong
					></legend
				>
				<input
					type="range"
					min="0"
					max="30"
					step="5"
					bind:value={minProtein}
					aria-label="Minimum bielkovín"
				/>
			</fieldset>

			<fieldset>
				<legend>Bez alergénov</legend>
				<div class="chips">
					{#each EXCLUDABLE as a (a)}
						<button
							class="chip"
							aria-pressed={excluded.includes(a)}
							onclick={() => toggleAllergen(a)}
						>
							bez: {ALLERGEN_LABELS[a]}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Nemám doma</legend>
				<div class="chips">
					{#each Object.entries(MISSING_TOOLS) as [tool, label] (tool)}
						<button
							class="chip"
							aria-pressed={missingTools.includes(tool)}
							onclick={() => toggleTool(tool)}
						>
							{label}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Špajza</legend>
				<button
					class="chip"
					aria-pressed={onlyPantry}
					disabled={!hasPantry}
					onclick={() => (onlyPantry = !onlyPantry)}
				>
					<Icon name="jar" size={16} /> Len z toho, čo mám
				</button>
				{#if !hasPantry}<p class="hint"><a href="/spajza">Nakliknúť špajzu →</a></p>{/if}
			</fieldset>

			{#if activeFilterCount || q}
				<button class="btn ghost small" onclick={reset}
					><Icon name="x" size={16} /> Zrušiť filtre</button
				>
			{/if}
		</aside>

		<section class="results" aria-live="polite">
			<p class="count-line muted">{results.length} {pluralRecipes(results.length)}</p>
			{#if filtered.closest}
				<p class="closest card">
					<Icon name="jar" size={18} />
					Len z toho, čo máš doma, sa nedá uvariť nič. Najbližšie sú tieto – chýba im najviac
					{filtered.closest}
					{filtered.closest < 5 ? 'veci' : 'vecí'}.
				</p>
			{/if}
			{#if results.length}
				<div class="grid">
					{#each shown as recipe, i (recipe.id)}
						<RecipeCard
							{recipe}
							index={i % PAGE_SIZE}
							match={hasPantry ? matches.get(recipe.id) : undefined}
						/>
					{/each}
				</div>
				{#if results.length > shown.length}
					<div class="more">
						<button class="btn ghost" onclick={() => (limit += PAGE_SIZE)}>
							Zobraziť ďalšie ({results.length - shown.length})
						</button>
					</div>
				{/if}
			{:else}
				<div class="empty card">
					<svg viewBox="0 0 120 90" width="140" aria-hidden="true">
						<path
							d="M10 45h100a50 40 0 0 1-100 0Z"
							fill="var(--paper-2)"
							stroke="var(--line)"
							stroke-width="2"
						/>
						<path
							d="M45 30c-4-6 4-10 0-16M60 28c-4-6 4-10 0-16M75 30c-4-6 4-10 0-16"
							stroke="var(--muted)"
							stroke-width="2.5"
							fill="none"
							stroke-linecap="round"
						/>
					</svg>
					<h3>Nič také zatiaľ nemáme</h3>
					<p class="muted">Skús uvoľniť filtre, alebo si recept vyžiadaj a pridáme ho.</p>
					<button class="btn" onclick={reset}>Zrušiť filtre</button>
				</div>
			{/if}
		</section>
	</div>
</div>

<style>
	.ideas {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 14px -16px 0;
		padding: 2px 16px 6px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.ideas::-webkit-scrollbar {
		display: none;
	}
	.ideas-label {
		flex: none;
		margin-right: 4px;
		font-size: 0.85rem;
		font-weight: 650;
		color: var(--muted);
	}
	.idea {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 5px 14px 5px 5px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		background: var(--card);
		color: var(--ink);
		font: inherit;
		font-size: 0.88rem;
		font-weight: 650;
		text-decoration: none;
		cursor: pointer;
		transition:
			transform 0.25s var(--ease-spring),
			border-color 0.2s;
	}
	.idea:hover {
		transform: translateY(-2px);
		border-color: var(--tone);
	}
	.idea-ico {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--tone) 18%, transparent);
		color: color-mix(in srgb, var(--tone) 75%, var(--ink));
		transition: transform 0.3s var(--ease-spring);
	}
	.idea:hover .idea-ico {
		transform: rotate(-12deg) scale(1.08);
	}
	.page {
		padding-top: 28px;
	}
	.page-head h1 {
		margin-bottom: 18px;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 18px;
	}
	.grow {
		flex: 1 1 260px;
	}
	.sort {
		flex: 0 1 220px;
	}
	.count {
		display: inline-grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		border-radius: 999px;
		background: var(--tomato);
		color: #fff;
		font-size: 0.72rem;
	}
	.layout {
		display: grid;
		gap: 22px;
	}
	.filters {
		display: none;
		padding: 18px;
		flex-direction: column;
		gap: 18px;
		align-self: start;
	}
	.filters.open {
		display: flex;
		animation: rise 0.35s var(--ease-out);
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
		display: grid;
		gap: 10px;
	}
	legend {
		font-weight: 700;
		font-size: 0.9rem;
		margin-bottom: 8px;
		padding: 0;
	}
	legend strong {
		font-weight: 600;
		color: var(--leaf);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.hint {
		font-size: 0.82rem;
		color: var(--muted);
		margin: 0;
	}
	.closest {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 12px 14px;
		margin: 0 0 14px;
		background: var(--turmeric-soft);
		border-color: transparent;
	}
	.count-line {
		margin: 0 0 12px;
		font-size: 0.9rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}
	.more {
		display: flex;
		justify-content: center;
		margin-top: 24px;
	}
	.empty {
		display: grid;
		justify-items: center;
		text-align: center;
		padding: 40px 20px;
		gap: 6px;
	}
	@media (min-width: 980px) {
		.filter-toggle {
			display: none;
		}
		.layout {
			grid-template-columns: 280px 1fr;
		}
		.filters {
			display: flex;
			position: sticky;
			top: 84px;
			/* Taller than the viewport: scroll inside, or the bottom filters are unreachable. */
			max-height: calc(100vh - 100px);
			overflow-y: auto;
			overscroll-behavior: contain;
			scrollbar-width: thin;
		}
	}
</style>

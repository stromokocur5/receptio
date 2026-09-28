<script lang="ts">
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { replaceState } from '$app/navigation';
	import { formatEur, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import ComboLayout from '$lib/components/ComboLayout.svelte';
	import CropSheet from '$lib/components/CropSheet.svelte';
	import GardenDiary from '$lib/components/GardenDiary.svelte';
	import GrowMonths from '$lib/components/GrowMonths.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LocationPicker from '$lib/components/LocationPicker.svelte';
	import PlaceArt from '$lib/components/PlaceArt.svelte';
	import PlantGlyph from '$lib/components/PlantGlyph.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import WeatherPanel from '$lib/components/WeatherPanel.svelte';
	import {
		FORM_LABELS,
		LEVEL_LABELS,
		yearsPhrase,
		PLACE_LABELS,
		decodeShared,
		localizeGuide,
		planGarden,
		seasonDelayWeeks,
		sowNow,
		yieldEstimate,
		type GardenInput,
		type SharedGarden
	} from '$lib/garden';
	import { normalizeSearch } from '$lib/labels';
	import { artSvg } from '$lib/wiki-art';
	import { bestPrice } from '$lib/pricing';
	import { IN_MONTH, MONTH_NAMES } from '$lib/season';
	import { favorites, garden, plan as mealPlan, settings, ui } from '$lib/state.svelte';
	import type { GrowGuide, GrowPlace, GrowSun } from '$lib/types';

	let { data } = $props();
	const catalog = useCatalog();
	const techniques = $derived(catalog.wiki.filter((w) => w.group === 'techniky-pestovania'));

	/** Calendars moved to the grower's altitude (lowlands when no place is set). */
	const delay = $derived(seasonDelayWeeks(settings.current.location?.elevation ?? 150));
	const guides = $derived(data.grow.map((g) => localizeGuide(g, delay)));
	const guideById = $derived(new Map(guides.map((g) => [g.ingredientId, g])));

	const PLACES: {
		id: GrowPlace;
		label: string;
		hint: string;
		area: number;
		/** Range of the area slider; the number field still takes anything. */
		max: number;
		step: number;
	}[] = [
		{
			id: 'parapet',
			label: 'Byt, okno',
			hint: 'parapet, kuchynská linka',
			area: 0.3,
			max: 2,
			step: 0.1
		},
		{ id: 'balkon', label: 'Balkón', hint: 'nádoby, truhlíky', area: 2, max: 20, step: 0.5 },
		{ id: 'zahrada', label: 'Záhrada', hint: 'záhon, pole', area: 20, max: 400, step: 5 }
	];
	const SUNS: { id: GrowSun; label: string }[] = [
		{ id: 'slnko', label: 'Slnko väčšinu dňa' },
		{ id: 'polotien', label: 'Pár hodín slnka' },
		{ id: 'tien', label: 'Bez priameho slnka' }
	];
	const LEVELS: { id: 1 | 2 | 3; label: string }[] = [
		{ id: 1, label: 'Začínam' },
		{ id: 2, label: 'Niečo som už pestoval/a' },
		{ id: 3, label: 'Mám skúsenosti' }
	];

	type Tab = 'moja-zahradka' | 'planovac' | 'techniky' | 'plodiny' | 'nepestuje-sa';
	const TABS: { id: Tab; label: string; icon: 'sprout' | 'sparkle' | 'leaf' | 'globe' | 'book' }[] =
		[
			{ id: 'moja-zahradka', label: 'Moja záhradka', icon: 'sprout' },
			{ id: 'planovac', label: 'Plánovač', icon: 'sparkle' },
			{ id: 'techniky', label: 'Techniky', icon: 'book' },
			{ id: 'plodiny', label: 'Plodiny', icon: 'leaf' },
			{ id: 'nepestuje-sa', label: 'Čo u nás nerastie', icon: 'globe' }
		];

	const STORAGE_KEY = 'receptio:garden';
	let input = $state<GardenInput>({ place: 'balkon', area: 2, sun: 'slnko', level: 1 });
	let month = $state(new Date().getMonth() + 1);
	let tab = $state<Tab>('planovac');
	/** A link into a tab or crop wins over opening "my garden" by default. */
	let hashChoseTab = false;

	const hasGarden = $derived(ui.loaded && !!garden.current);
	const current = $derived<Tab>(tab === 'moja-zahradka' && !hasGarden ? 'planovac' : tab);
	const visibleTabs = $derived(TABS.filter((t) => t.id !== 'moja-zahradka' || hasGarden));

	onMount(() => {
		month = new Date().getMonth() + 1;
		const shared = location.hash.startsWith('#zahradka=')
			? decodeShared(location.hash.slice('#zahradka='.length))
			: null;
		if (shared) {
			sharedPlan = shared;
			input = { place: shared.place, area: shared.area, sun: shared.sun, level: shared.level };
			hashChoseTab = true;
			return;
		}
		hashChoseTab = readHash();
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
			if (saved && PLACES.some((p) => p.id === saved.place)) input = { ...input, ...saved };
		} catch {
			// Starts from the defaults.
		}
	});

	// Stored state arrives after the page mounts (the root layout loads it), so the saved garden
	// is picked up here rather than in onMount.
	let gardenRestored = false;
	$effect(() => {
		if (!ui.loaded || gardenRestored) return;
		gardenRestored = true;
		const diary = garden.current;
		if (!diary || sharedPlan) return;
		input = { place: diary.place, area: diary.area, sun: diary.sun, level: diary.level };
		if (!hashChoseTab) tab = 'moja-zahradka';
	});

	/** Opens the tab or crop the URL points at; false when it points at nothing here. */
	function readHash(): boolean {
		const hash = decodeURIComponent(location.hash.slice(1));
		if (hash.startsWith('p-')) {
			tab = 'plodiny';
			openId = hash.slice(2);
			return true;
		}
		if (hash === 'oplati-sa') {
			tab = 'plodiny';
			return true;
		}
		const target = TABS.find((t) => t.id === hash);
		if (target) tab = target.id;
		return !!target;
	}

	let tablist = $state<HTMLElement>();
	/** Marks where the sticky tab bar sits in the flow; the bar itself reports its stuck position. */
	let tabsAnchor: HTMLElement;
	let indicator = $state({ left: 0, width: 0 });
	const tabButtons = $state<Partial<Record<Tab, HTMLButtonElement>>>({});

	function measureIndicator() {
		const button = tabButtons[current];
		if (button) indicator = { left: button.offsetLeft, width: button.offsetWidth };
	}
	$effect(() => {
		void current;
		void visibleTabs;
		measureIndicator();
		const button = tabButtons[current];
		if (button && tablist) {
			tablist.scrollTo({ left: button.offsetLeft - 16, behavior: 'smooth' });
		}
	});
	$effect(() => {
		if (!tablist) return;
		const observer = new ResizeObserver(measureIndicator);
		observer.observe(tablist);
		return () => observer.disconnect();
	});

	function selectTab(id: Tab) {
		tab = id;
		replaceState(`#${id}`, {});
		// When the tab bar is stuck to the top, jump back so the new panel starts in view.
		const top = tabsAnchor.getBoundingClientRect().top + window.scrollY - 64;
		if (window.scrollY > top) window.scrollTo({ top });
	}

	function onTabKey(event: KeyboardEvent) {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const i = visibleTabs.findIndex((t) => t.id === current);
		const next = visibleTabs[(i + step + visibleTabs.length) % visibleTabs.length];
		selectTab(next.id);
		tabButtons[next.id]?.focus();
	}

	let openId = $state<string | null>(null);
	const openGuide = $derived(openId ? (guideById.get(openId) ?? null) : null);
	function openCrop(id: string) {
		openId = id;
		replaceState(`#p-${id}`, {});
	}
	function closeCrop() {
		if (!openId) return;
		openId = null;
		replaceState(`#${current}`, {});
	}

	function save() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
		} catch {
			// The planner still works, it just won't remember.
		}
	}

	const placeInfo = $derived(PLACES.find((p) => p.id === input.place)!);
	function setPlace(id: GrowPlace) {
		input.place = id;
		input.area = PLACES.find((p) => p.id === id)!.area;
		save();
	}

	/** Recipes the garden should feed; their growable ingredients steer the planner. */
	let goalRecipes = $state<string[]>([]);
	let goalQuery = $state('');
	const growableIds = $derived(new Set(data.grow.map((g) => g.ingredientId)));
	const wanted = $derived(
		new Set(
			goalRecipes.flatMap(
				(id) =>
					catalog.recipesById
						.get(id)
						?.lines.map((l) => l.ingredientId)
						.filter((i) => growableIds.has(i)) ?? []
			)
		)
	);
	const goalMatches = $derived.by(() => {
		const q = normalizeSearch(goalQuery.trim());
		if (q.length < 2) return [];
		return catalog.recipes
			.filter((r) => !goalRecipes.includes(r.id) && normalizeSearch(r.title).includes(q))
			.slice(0, 6);
	});
	function addGoals(ids: string[]) {
		goalRecipes = [
			...new Set([...goalRecipes, ...ids.filter((id) => catalog.recipesById.has(id))])
		];
		goalQuery = '';
	}

	const plan = $derived(planGarden(input, data.growCombos, guides, wanted));
	const covered = $derived(
		[...wanted].filter((id) => plan.plants.some((p) => p.ingredientId === id))
	);
	const uncovered = $derived([...wanted].filter((id) => !covered.includes(id)));

	const priceToday = $derived(new Date(catalog.builtAt));
	const estimate = $derived(
		yieldEstimate(plan.plants, guides, (id) => {
			const ingredient = catalog.ingredientsById.get(id);
			return ingredient ? bestPrice(ingredient, catalog.prices, priceToday).perKg : null;
		})
	);
	const kgById = $derived(new Map(estimate.perCrop.map((c) => [c.ingredientId, c.kg])));

	/** Numbers in the summary roll to their new value when the plan changes. */
	const reduceMotion =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const rollOptions = { duration: reduceMotion ? 0 : 450, easing: cubicOut };
	const combosShown = Tween.of(() => plan.combos.length, rollOptions);
	const plantsShown = Tween.of(() => plan.plants.length, rollOptions);
	const kgShown = Tween.of(() => estimate.kg, rollOptions);
	const eurShown = Tween.of(() => estimate.eur, rollOptions);

	let sharedPlan = $state<SharedGarden | null>(null);
	function adoptShared() {
		if (!sharedPlan) return;
		const shared = sharedPlan;
		const beds = (shared.beds ?? []).map((b) => ({
			...b,
			id: crypto.randomUUID().slice(0, 8),
			past: []
		}));
		sharedPlan = null;
		saveGarden(beds);
	}

	const nameById = $derived(
		new Map([...data.grow, ...data.notGrown].map((g) => [g.ingredientId, g.name]))
	);
	const recommended = $derived(guides.filter((g) => g.recommend));
	const planMonths = $derived(
		plan.calendar.filter((c) => c.indoor.length || c.sow.length || c.harvest.length)
	);

	let placeFilter = $state<GrowPlace | ''>('');
	let onlyNow = $state(false);
	let onlyEasy = $state(false);
	/** Vegetables and herbs, trees and shrubs, or mushrooms. */
	let kind = $state<'' | 'zelenina' | 'drevina' | 'huba'>('');
	const kindOf = (g: GrowGuide) =>
		g.form === 'strom' || g.form === 'ker' ? 'drevina' : g.form === 'huba' ? 'huba' : 'zelenina';
	let cropQuery = $state('');
	const nowIds = $derived(new Set(sowNow(guides, month).map((g) => g.ingredientId)));
	const crops = $derived.by(() => {
		const q = normalizeSearch(cropQuery.trim());
		return guides.filter(
			(g) =>
				(!q || normalizeSearch(g.name).includes(q)) &&
				(!placeFilter || g.where.includes(placeFilter)) &&
				(!onlyNow || nowIds.has(g.ingredientId)) &&
				(!onlyEasy || g.level === 1) &&
				(!kind || kindOf(g) === kind)
		);
	});

	const notHere = $derived(data.notGrown.filter((n) => n.status === 'nie'));
	const hardHere = $derived(data.notGrown.filter((n) => n.status === 'tazko'));

	/** Keeps the plan (and the diary already written for it) as "my garden". */
	function saveGarden(beds?: NonNullable<typeof garden.current>['beds'], empty = false) {
		const previous = garden.current;
		garden.current = {
			...input,
			combos: empty ? [] : plan.combos.map((c) => ({ id: c.combo.id, modules: c.modules })),
			plants: empty
				? []
				: plan.plants.map((p) => ({ ingredientId: p.ingredientId, count: p.count })),
			done: previous?.done ?? {},
			harvests: previous?.harvests ?? [],
			beds: beds ?? previous?.beds ?? [],
			savedAt: new Date().toISOString().slice(0, 10)
		};
		selectTab('moja-zahradka');
	}

	function names(ids: string[]): string {
		return ids.map((id) => nameById.get(id) ?? id).join(', ');
	}

	const color = (id: string) => catalog.ingredientsById.get(id)?.color ?? '#6fa35a';
</script>

<svelte:window onhashchange={readHash} />

<Seo
	title="Pestuj si sám"
	description="Čo sa oplatí pestovať na Slovensku, plánovač záhradky, balkóna aj okna v byte so zmiešanými výsadbami a kalendárom."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow"><Icon name="sprout" size={16} /> Pestuj si sám</p>
		<h1>Pestuj si sám</h1>
		<p class="lede">
			Aj z okna v byte sa dá zbierať – a zo záhonu celé jedlá. Tu nájdeš, čo sa u nás oplatí
			pestovať, plánovač, ktorý ti z tvojho miesta navrhne zmiešané výsadby, a návod ku každej
			plodine.
		</p>
		<nav class="guides" aria-label="Návody">
			<a class="chip" href="/wiki/ako-zacat-pestovat">Ako začať</a>
			<a class="chip" href="/wiki/naradie-na-pestovanie">Náradie a nádoby</a>
			<a class="chip" href="/wiki/uskladnenie-urody">Uskladnenie</a>
			<a class="chip" href="/wiki/kompost">Kompost</a>
			<a class="chip" href="/wiki/polievanie">Polievanie</a>
			<a class="chip" href="/wiki/automatizacia-zahrady">Menej práce</a>
		</nav>
	</header>

	{#if sharedPlan}
		<section class="card shared" role="status">
			<p>
				<strong>Niekto ti poslal plán záhradky</strong> – {formatNumber(sharedPlan.area)} m²,
				{PLACE_LABELS[sharedPlan.place]}{sharedPlan.beds?.length
					? `, ${sharedPlan.beds.length} ${sharedPlan.beds.length === 1 ? 'nakreslený záhon' : sharedPlan.beds.length < 5 ? 'nakreslené záhony' : 'nakreslených záhonov'}`
					: ''}. Plánovač nižšie ho už ukazuje.
			</p>
			<div class="save-row">
				<button class="btn leaf" onclick={adoptShared}>
					<Icon name="bookmark" size={18} />
					{garden.current ? 'Nahradiť moju záhradku' : 'Uložiť ako moju záhradku'}
				</button>
				<button class="btn ghost" onclick={() => (sharedPlan = null)}>Len si ho pozriem</button>
			</div>
		</section>
	{/if}

	{#if ui.loaded}
		<LocationPicker />
		{#if settings.current.location && !garden.current}
			<WeatherPanel location={settings.current.location} tender={false} plantingTender={false} />
		{/if}
	{/if}

	<div bind:this={tabsAnchor}></div>
	<div class="tabs-bar">
		<div
			class="tabs"
			role="tablist"
			aria-label="Pestuj si sám"
			tabindex="-1"
			bind:this={tablist}
			onkeydown={onTabKey}
		>
			<span
				class="indicator"
				aria-hidden="true"
				style:transform="translateX({indicator.left}px)"
				style:width="{indicator.width}px"
			></span>
			{#each visibleTabs as t (t.id)}
				<button
					role="tab"
					id="tab-{t.id}"
					aria-selected={current === t.id}
					aria-controls={t.id}
					tabindex={current === t.id ? 0 : -1}
					bind:this={tabButtons[t.id]}
					onclick={() => selectTab(t.id)}
				>
					<Icon name={t.icon} size={16} />
					{t.label}
					{#if t.id === 'plodiny'}<span class="count">{guides.length}</span>{/if}
				</button>
			{/each}
		</div>
	</div>

	{#if hasGarden && garden.current}
		<div
			id="moja-zahradka"
			class="panel"
			role="tabpanel"
			aria-labelledby="tab-moja-zahradka"
			hidden={current !== 'moja-zahradka'}
		>
			<GardenDiary
				diary={garden.current}
				{guides}
				combos={data.growCombos}
				onplan={() => selectTab('planovac')}
				oncrop={openCrop}
			/>
		</div>
	{/if}

	<div
		id="planovac"
		class="panel"
		role="tabpanel"
		aria-labelledby="tab-planovac"
		hidden={current !== 'planovac'}
	>
		<div class="card planner">
			<h2><Icon name="sparkle" size={22} /> Plánovač</h2>
			<p class="muted">
				Povedz, koľko máš miesta, a plánovač ho zaplní kombináciami rastlín, ktoré si navzájom
				pomáhajú – namiesto jedného záhonu kapusty, kde sa darí hlavne škodcom.
			</p>
			{#if ui.loaded && !garden.current}
				<p class="muted small">
					Chceš si záhony nakresliť sám?
					<button class="linkish" onclick={() => saveGarden([], true)}
						>Začni s prázdnou záhradkou</button
					>.
				</p>
			{/if}

			<div class="form">
				<fieldset>
					<legend>Kde</legend>
					<div class="opts">
						{#each PLACES as p (p.id)}
							<button
								class="opt"
								aria-pressed={input.place === p.id}
								onclick={() => setPlace(p.id)}
							>
								<PlaceArt place={p.id} active={input.place === p.id} />
								<strong>{p.label}</strong>
								<small>{p.hint}</small>
							</button>
						{/each}
					</div>
				</fieldset>
				<div class="area">
					<label for="garden-area">Plocha</label>
					<div class="area-row">
						<input
							class="slider"
							type="range"
							min={placeInfo.step}
							max={placeInfo.max}
							step={placeInfo.step}
							value={Math.min(input.area, placeInfo.max)}
							aria-label="Plocha v m²"
							style:--fill="{(Math.min(input.area, placeInfo.max) / placeInfo.max) * 100}%"
							oninput={(e) => {
								input.area = Number(e.currentTarget.value);
								save();
							}}
						/>
						<span class="area-input">
							<input
								id="garden-area"
								type="number"
								min="0.1"
								max="10000"
								step="any"
								bind:value={input.area}
								oninput={save}
							/>
							m²
						</span>
					</div>
					<small class="muted">
						{input.place === 'parapet'
							? '0,1 m² je zhruba jeden kvetináč'
							: input.place === 'balkon'
								? 'podlaha, ktorú môžeš zaplniť nádobami'
								: '1 ár = 100 m²; pätinu nechám na chodníky'}
					</small>
				</div>
				<fieldset>
					<legend>Svetlo</legend>
					<div class="chips">
						{#each SUNS as s (s.id)}
							<button
								class="chip"
								aria-pressed={input.sun === s.id}
								onclick={() => {
									input.sun = s.id;
									save();
								}}>{s.label}</button
							>
						{/each}
					</div>
				</fieldset>
				<fieldset>
					<legend>Na čo chceš pestovať <small class="muted">nepovinné</small></legend>
					<div class="chips">
						{#if ui.loaded && mealPlan.current.length}
							<button class="chip" onclick={() => addGoals(mealPlan.current.map((e) => e.recipeId))}
								><Icon name="calendar" size={14} /> Na môj plán jedál</button
							>
						{/if}
						{#if ui.loaded && Object.keys(favorites.current).length}
							<button class="chip" onclick={() => addGoals(Object.keys(favorites.current))}
								><Icon name="bookmark" size={14} /> Na obľúbené recepty</button
							>
						{/if}
						<input
							class="goal-search"
							bind:value={goalQuery}
							placeholder="Pridaj recept (lečo, hummus…)"
							aria-label="Hľadať recept"
						/>
					</div>
					{#if goalMatches.length}
						<div class="chips goal-results">
							{#each goalMatches as r (r.id)}
								<button class="chip" onclick={() => addGoals([r.id])}
									><Icon name="plus" size={14} /> {r.title}</button
								>
							{/each}
						</div>
					{/if}
					{#if goalRecipes.length}
						<div class="chips goal-results">
							{#each goalRecipes as id (id)}
								<button
									class="chip"
									aria-pressed="true"
									onclick={() => (goalRecipes = goalRecipes.filter((g) => g !== id))}
									>{catalog.recipesById.get(id)?.title} <Icon name="x" size={12} /></button
								>
							{/each}
						</div>
					{/if}
				</fieldset>
				<fieldset>
					<legend>Skúsenosti</legend>
					<div class="chips">
						{#each LEVELS as l (l.id)}
							<button
								class="chip"
								aria-pressed={input.level === l.id}
								onclick={() => {
									input.level = l.id;
									save();
								}}>{l.label}</button
							>
						{/each}
					</div>
				</fieldset>
			</div>

			{#if plan.combos.length}
				<div class="stats" aria-live="polite">
					<div>
						<strong>{Math.round(combosShown.current)}</strong>
						<span
							>{plan.combos.length === 1
								? 'výsadba'
								: plan.combos.length < 5
									? 'výsadby'
									: 'výsadieb'}</span
						>
					</div>
					<div>
						<strong>{Math.round(plantsShown.current)}</strong>
						<span>druhov rastlín</span>
					</div>
					{#if estimate.kg >= 0.5}
						<div>
							<strong>{formatNumber(Math.round(kgShown.current))} kg</strong>
							<span>úrody za sezónu</span>
						</div>
						<div class="money">
							<strong>{formatEur(eurShown.current)}</strong>
							<span>v obchode <span class="badge turmeric">odhad</span></span>
						</div>
					{/if}
				</div>
				<p class="summary muted small">
					{formatNumber(input.area)} m²{plan.paths
						? `, z toho ${formatNumber(plan.paths)} m² na chodníky`
						: ''}{plan.free >= 0.1 ? `, ${formatNumber(plan.free)} m² ostáva voľných` : ''}.
					{#if estimate.kg >= 0.5}
						Úroda podľa bežného výnosu na rastlinu a cien z obchodov; počasie a starostlivosť ju
						môžu zdvojnásobiť aj prepoloviť.
					{/if}
				</p>
				{#if wanted.size}
					<p class="coverage">
						{#if covered.length}
							<Icon name="check" size={16} /> Na tvoje recepty dopestuješ: {names(covered)}.
						{/if}
						{#if uncovered.length}
							<span class="muted"
								>Nezmestí sa alebo sa sem nehodí: {names(uncovered)} – skús iné miesto alebo si to pridaj
								v editore záhonov.</span
							>
						{/if}
					</p>
				{/if}
				<div class="save-row">
					<button class="btn leaf" onclick={() => saveGarden()}>
						<Icon name="bookmark" size={18} />
						{garden.current ? 'Aktualizovať moju záhradku' : 'Uložiť ako moju záhradku'}
					</button>
					<span class="muted small"
						>Dostaneš úlohy na každý mesiac, zápis úrody a recepty z nej.</span
					>
				</div>
				<ol class="combos">
					{#each plan.combos as { combo, modules, area }, i (combo.id)}
						<li class="combo" style:--i={i}>
							<details open={i === 0}>
								<summary>
									<span class="thumb"><ComboLayout {combo} {guides} compact /></span>
									<span class="combo-sum">
										<strong>{combo.name}</strong>
										<span class="combo-meta">
											{modules > 1 ? `${modules} × ` : ''}{formatNumber(combo.area)} m²{modules > 1
												? ` = ${formatNumber(area)} m²`
												: ''} · {combo.members.length}
											{combo.members.length === 1
												? 'druh'
												: combo.members.length < 5
													? 'druhy'
													: 'druhov'}
										</span>
										<span class="why-short">{combo.why}</span>
									</span>
									<span class="chev" aria-hidden="true"><Icon name="plus" size={18} /></span>
								</summary>
								<div class="combo-body">
									<ComboLayout {combo} {guides} />
									<p class="members">
										{#each combo.members as m (m.ingredientId)}
											<button class="member" onclick={() => openCrop(m.ingredientId)}
												><i style:background={color(m.ingredientId)}></i>{m.count * modules} × {m.name}</button
											>
										{/each}
									</p>
									<p class="how-to"><Icon name="sprout" size={16} /> {combo.how}</p>
									<p class="why"><Icon name="heart" size={16} /> {combo.why}</p>
								</div>
							</details>
						</li>
					{/each}
				</ol>

				{#if plan.extras.length}
					<section class="extras">
						<h3>Samostatne, na tvoje recepty</h3>
						<ul>
							{#each plan.extras as e (e.ingredientId)}
								<li>
									<button class="linkish" onclick={() => openCrop(e.ingredientId)}
										>{e.count} × {e.name}</button
									>
									<small class="muted"
										>{formatNumber(e.area)} m²{e.level > input.level
											? ` · ${LEVEL_LABELS[e.level]}`
											: ''}</small
									>
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				<div class="plan-cols">
					<section>
						<h3>Čo si zaobstarať</h3>
						<ul class="shopping">
							{#each plan.plants as p (p.ingredientId)}
								{@const g = guideById.get(p.ingredientId)}
								<li>
									<strong>{p.count}</strong>
									<button class="linkish plain" onclick={() => openCrop(p.ingredientId)}
										>{p.name}</button
									>
									{#if (kgById.get(p.ingredientId) ?? 0) >= 0.1}<small class="muted"
											>≈ {formatNumber(Math.round((kgById.get(p.ingredientId) ?? 0) * 10) / 10)} kg</small
										>{/if}
									<small class="muted">
										{g?.perennial
											? 'sadenica, trvalka'
											: g?.indoor.length
												? 'semená na predpestovanie alebo sadenice'
												: 'semená'}
									</small>
								</li>
							{/each}
						</ul>
					</section>
					<section>
						<h3>Kalendár prác</h3>
						<ul class="tasks">
							{#each planMonths as c (c.month)}
								<li class:now={c.month === month}>
									<strong>{MONTH_NAMES[c.month - 1]}</strong>
									{#if c.indoor.length}<span
											><i class="t-indoor"></i> predpestuj doma: {c.indoor.join(', ')}</span
										>{/if}
									{#if c.sow.length}<span
											><i class="t-sow"></i> zasej alebo vysaď von: {c.sow.join(', ')}</span
										>{/if}
									{#if c.harvest.length}<span
											><i class="t-harvest"></i> zbieraj: {c.harvest.join(', ')}</span
										>{/if}
								</li>
							{/each}
						</ul>
					</section>
				</div>
				<section class="gear">
					<h3><Icon name="basket" size={18} /> Budeš potrebovať</h3>
					<ul>
						{#each plan.gear as g, i (i)}<li>{g}</li>{/each}
					</ul>
					<a href="/wiki/naradie-na-pestovanie"
						>Náradie, nádoby, voda a semená – podrobne <Icon name="arrow-right" size={14} /></a
					>
				</section>
				{#if input.place === 'zahrada' && plan.families.length > 1}
					<p class="muted rotate">
						<Icon name="info" size={16} /> Na budúci rok posuň výsadby o jeden záhon ďalej, aby na tom
						istom mieste nerástla rovnaká čeľaď ({plan.families.length} čeľadí v pláne). Pôda sa tak nevyčerpá
						a choroby sa nenahromadia.
					</p>
				{/if}
			{:else}
				<p class="empty">
					Na takú plochu a svetlo zatiaľ nemám kombináciu. Skús väčšiu plochu alebo menej náročné
					skúsenosti – a v tieni sa darí aspoň klíčkom a hlive v byte.
				</p>
			{/if}
		</div>
	</div>

	<div
		id="techniky"
		class="panel"
		role="tabpanel"
		aria-labelledby="tab-techniky"
		hidden={current !== 'techniky'}
	>
		<p class="muted tech-intro">
			Ako si ušetriť prácu, vodu aj peniaze – a mať väčšiu úrodu. Každý návod má postup krok za
			krokom, tabuľky a nakreslené schémy.
		</p>
		<div class="tech-grid">
			{#each techniques as t, i (t.slug)}
				<a class="card tech-card" href="/wiki/{t.slug}" style:--i={i}>
					{#if t.art}
						<span class="tech-thumb" aria-hidden="true">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- static drawing from wiki-art -->
							{@html artSvg(t.art)}
						</span>
					{/if}
					<span class="tech-body">
						<strong>{t.title}</strong>
						<span class="muted">{t.summary}</span>
					</span>
				</a>
			{/each}
		</div>
	</div>

	<div
		id="plodiny"
		class="panel"
		role="tabpanel"
		aria-labelledby="tab-plodiny"
		hidden={current !== 'plodiny'}
	>
		<h2>Čo sa u nás oplatí pestovať</h2>
		<p class="muted">
			Plodiny, ktoré zvládnu slovenské leto aj suchšie roky, dajú veľa jedla z malej plochy alebo
			ušetria najviac peňazí.
		</p>
		<div class="rec-strip">
			{#each recommended as g (g.ingredientId)}
				<button class="card rec" onclick={() => openCrop(g.ingredientId)}>
					<i class="rec-dot" style:background={color(g.ingredientId)}></i>
					<strong>{g.name}</strong>
					<span>{g.recommend}</span>
					<small class="muted">
						{g.where.map((w) => PLACE_LABELS[w]).join(' · ')} · {LEVEL_LABELS[g.level]}
					</small>
				</button>
			{/each}
		</div>

		<h2 class="all-h">Všetky plodiny</h2>
		<div class="crop-tools">
			<label class="field crop-search">
				<Icon name="search" size={18} />
				<input
					type="search"
					bind:value={cropQuery}
					placeholder="Hľadať plodinu (paradajka, bazalka…)"
					aria-label="Hľadať plodinu"
				/>
			</label>
			<div class="chips filters">
				<button class="chip" aria-pressed={placeFilter === ''} onclick={() => (placeFilter = '')}
					>Všade</button
				>
				{#each PLACES as p (p.id)}
					<button
						class="chip"
						aria-pressed={placeFilter === p.id}
						onclick={() => (placeFilter = placeFilter === p.id ? '' : p.id)}>{p.label}</button
					>
				{/each}
				<button class="chip" aria-pressed={onlyNow} onclick={() => (onlyNow = !onlyNow)}
					>Siať {IN_MONTH[month - 1]}</button
				>
				<button class="chip" aria-pressed={onlyEasy} onclick={() => (onlyEasy = !onlyEasy)}
					>Len ľahké</button
				>
			</div>
			<div class="chips kinds" role="group" aria-label="Druh">
				{#each [['', 'Všetko', 'sparkle'], ['zelenina', 'Zelenina a bylinky', 'sprout'], ['drevina', 'Stromy a kry', 'tree'], ['huba', 'Huby', 'mushroom']] as const as [id, label, icon] (id)}
					<button class="chip" aria-pressed={kind === id} onclick={() => (kind = id)}
						><Icon name={icon} size={15} /> {label}</button
					>
				{/each}
			</div>
			<div class="legend-row">
				<div class="legend-wrap"><GrowMonths sow={[]} harvest={[]} legend /></div>
				<span class="muted small" aria-live="polite">{crops.length} z {guides.length}</span>
			</div>
		</div>
		<div class="crops">
			{#each crops as g (g.ingredientId)}
				<article class="card crop" id="p-{g.ingredientId}">
					<h3>
						<svg class="crop-glyph" viewBox="-11 -11 22 22" aria-hidden="true"
							><PlantGlyph family={g.family} form={g.form} color={color(g.ingredientId)} /></svg
						>
						<button class="stretch" onclick={() => openCrop(g.ingredientId)}>{g.name}</button>
						{#if nowIds.has(g.ingredientId)}<span class="badge leaf now-badge">teraz</span>{/if}
					</h3>
					<GrowMonths indoor={g.indoor} sow={g.sow} harvest={g.harvest} />
					<p class="how">{g.how}</p>
					<p class="meta">
						{g.form ? `${FORM_LABELS[g.form]} · ` : ''}{LEVEL_LABELS[g.level]} · {g.where
							.map((w) => PLACE_LABELS[w])
							.join(', ')}{g.perennial && !g.form ? ' · trvalka' : ''}{g.yearsToHarvest
							? ` · úroda ${yearsPhrase(g.yearsToHarvest)}`
							: ''}
					</p>
				</article>
			{:else}
				<p class="muted">Takú plodinu tu nemám – skús iný filter.</p>
			{/each}
		</div>
	</div>

	<div
		id="nepestuje-sa"
		class="panel"
		role="tabpanel"
		aria-labelledby="tab-nepestuje-sa"
		hidden={current !== 'nepestuje-sa'}
	>
		<h2>Čo sa u nás pestovať nedá</h2>
		<p class="muted">
			Tieto suroviny kupujeme z teplejších krajín. Pri niektorých sa dá aspoň skúsiť rastlinka v
			byte alebo teplom kúte na juhu.
		</p>
		<div class="not-cols">
			<section>
				<h3>Skúsiť sa dá, úroda je neistá</h3>
				<ul class="not">
					{#each hardHere as n (n.ingredientId)}
						<li>
							<a href="/suroviny/{n.ingredientId}">{n.name}</a>
							<small>{n.origin}</small>
							{#if n.note}<span>{n.note}</span>{/if}
						</li>
					{/each}
				</ul>
			</section>
			<section>
				<h3>U nás nerastie</h3>
				<ul class="not">
					{#each notHere as n (n.ingredientId)}
						<li>
							<a href="/suroviny/{n.ingredientId}">{n.name}</a>
							<small>{n.origin}</small>
							{#if n.note}<span>{n.note}</span>{/if}
						</li>
					{/each}
				</ul>
			</section>
		</div>
	</div>
</div>

<CropSheet
	guide={openGuide}
	{guides}
	place={placeFilter || (hasGarden && garden.current ? garden.current.place : input.place)}
	onpick={openCrop}
	onclose={closeCrop}
/>

<style>
	.page {
		padding-top: 28px;
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.lede {
		color: var(--ink-2);
		max-width: 68ch;
	}
	.guides,
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	/* ── Tabs ── */
	.tabs-bar {
		position: sticky;
		top: 64px;
		z-index: 5;
		margin: 28px -16px 0;
		padding: 8px 16px;
		background: color-mix(in srgb, var(--paper) 88%, transparent);
		backdrop-filter: blur(10px);
	}
	.tabs {
		position: relative;
		display: flex;
		gap: 4px;
		width: max-content;
		max-width: 100%;
		padding: 4px;
		border-radius: 999px;
		background: var(--paper-2);
		border: 1px solid var(--line);
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		outline: none;
	}
	.tabs::-webkit-scrollbar {
		display: none;
	}
	.tabs button {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex: none;
		padding: 8px 14px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--ink-2);
		font: inherit;
		font-weight: 650;
		font-size: 0.92rem;
		white-space: nowrap;
		cursor: pointer;
		transition: color 0.25s;
	}
	.tabs button[aria-selected='true'] {
		color: var(--paper);
	}
	.tabs button:focus-visible {
		outline: 2px solid var(--leaf);
		outline-offset: 2px;
	}
	.indicator {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 0;
		border-radius: 999px;
		background: var(--leaf);
		box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--leaf) 60%, transparent);
		transition:
			transform 0.4s var(--ease-spring),
			width 0.4s var(--ease-spring);
	}
	.count {
		padding: 0 6px;
		border-radius: 999px;
		font-size: 0.72rem;
		background: color-mix(in srgb, currentColor 18%, transparent);
	}
	.panel {
		margin-top: 16px;
		scroll-margin-top: 130px;
	}
	.panel[hidden] {
		display: none;
	}
	.tech-intro {
		margin: 4px 0 16px;
	}
	.tech-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 16px;
	}
	.tech-card {
		display: grid;
		align-content: start;
		overflow: hidden;
		color: var(--ink);
		text-decoration: none;
		animation: rise 0.45s var(--ease-out) both;
		animation-delay: calc(var(--i) * 40ms);
		transition:
			transform 0.25s var(--ease-spring),
			box-shadow 0.25s;
	}
	.tech-card:hover {
		transform: translateY(-3px);
		box-shadow: var(--shadow-lift);
	}
	.tech-thumb {
		display: block;
		padding: 10px 10px 4px;
		background: color-mix(in srgb, var(--leaf-soft) 45%, var(--card));
		border-bottom: 1px solid var(--line);
	}
	.tech-body {
		display: grid;
		gap: 4px;
		padding: 14px 16px 16px;
	}
	.tech-body strong {
		font-family: var(--font-display);
		font-size: 1.08rem;
	}
	.tech-body .muted {
		font-size: 0.88rem;
		line-height: 1.4;
	}
	.panel:not([hidden]) {
		animation: rise 0.4s var(--ease-out) both;
	}
	.panel > h2 {
		margin-bottom: 6px;
	}

	/* ── Planner ── */
	.planner {
		padding: 22px;
	}
	.planner > h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 6px;
	}
	.form {
		display: grid;
		gap: 18px;
		margin: 18px 0;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
	}
	legend,
	.area > label {
		font-weight: 700;
		margin-bottom: 8px;
	}
	.opts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.opt {
		display: grid;
		justify-items: start;
		gap: 2px;
		padding: 12px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			transform 0.25s var(--ease-spring),
			border-color 0.2s,
			background 0.2s;
	}
	.opt:hover {
		transform: translateY(-2px);
	}
	.opt:active {
		transform: scale(0.97);
	}
	.opt small {
		color: var(--muted);
	}
	.opt[aria-pressed='true'] {
		border-color: var(--leaf);
		background: var(--leaf-soft);
	}
	.area {
		display: grid;
		gap: 4px;
	}
	.area-row {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.slider {
		flex: 1;
		min-width: 0;
		height: 8px;
		border-radius: 4px;
		appearance: none;
		background: linear-gradient(
			to right,
			var(--leaf-2) var(--fill),
			color-mix(in srgb, var(--line) 80%, transparent) var(--fill)
		);
		cursor: pointer;
	}
	.slider::-webkit-slider-thumb {
		appearance: none;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--card);
		border: 3px solid var(--leaf);
		box-shadow: var(--shadow);
		transition: transform 0.2s var(--ease-spring);
	}
	.slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--card);
		border: 3px solid var(--leaf);
		box-shadow: var(--shadow);
	}
	.slider:active::-webkit-slider-thumb {
		transform: scale(1.2);
	}
	.area-input {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
	}
	.area-input input {
		width: 96px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 10px 12px;
		font: inherit;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		gap: 8px;
	}
	.stats div {
		display: grid;
		gap: 2px;
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: var(--leaf-soft);
	}
	.stats strong {
		font-family: var(--font-display);
		font-size: 1.7rem;
		line-height: 1.1;
		color: var(--leaf);
		font-variant-numeric: tabular-nums;
	}
	.stats span {
		font-size: 0.85rem;
		color: var(--ink-2);
	}
	.stats .money {
		background: var(--turmeric-soft);
	}
	.stats .money strong {
		color: color-mix(in srgb, var(--turmeric) 60%, var(--ink));
	}
	.summary {
		margin: 8px 0 0;
	}
	.shared {
		margin-top: 20px;
		padding: 18px;
		border: 2px solid var(--sky);
	}
	.goal-search {
		flex: 1 1 200px;
		min-width: 0;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		background: var(--paper);
		color: var(--ink);
		padding: 6px 14px;
		font: inherit;
	}
	.goal-results {
		margin-top: 8px;
	}
	.extras {
		margin-top: 16px;
	}
	.extras ul {
		margin: 0;
		padding-left: 1.2em;
	}
	.coverage {
		font-size: 0.95rem;
	}
	.linkish {
		border: 0;
		padding: 0;
		background: none;
		color: var(--leaf);
		font: inherit;
		font-weight: 650;
		text-decoration: underline;
		cursor: pointer;
	}
	.linkish.plain {
		color: inherit;
		font-weight: inherit;
		text-decoration-color: var(--line);
		text-underline-offset: 3px;
	}
	.save-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		margin: 12px 0 18px;
	}
	.combos {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 12px;
	}
	.combo {
		border-radius: var(--radius-sm);
		background: var(--paper);
		border: 1px solid var(--line);
		animation: rise 0.45s var(--ease-out) both;
		animation-delay: calc(var(--i) * 70ms);
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}
	.combo:has(details[open]) {
		border-color: var(--leaf-2);
		box-shadow: var(--shadow);
	}
	.combo summary {
		display: grid;
		grid-template-columns: 110px 1fr auto;
		gap: 14px;
		align-items: center;
		padding: 12px;
		cursor: pointer;
		list-style: none;
	}
	.combo summary::-webkit-details-marker {
		display: none;
	}
	.thumb {
		display: block;
		transition: transform 0.3s var(--ease-spring);
	}
	.combo summary:hover .thumb {
		transform: rotate(-2deg) scale(1.04);
	}
	.combo-sum {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.combo-sum strong {
		font-family: var(--font-display);
		font-size: 1.1rem;
		line-height: 1.2;
	}
	.combo-meta {
		font-size: 0.82rem;
		font-weight: 650;
		color: var(--leaf);
	}
	.why-short {
		font-size: 0.85rem;
		color: var(--ink-2);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	details[open] .why-short {
		display: none;
	}
	.chev {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--card);
		border: 1px solid var(--line);
		transition: transform 0.35s var(--ease-spring);
	}
	details[open] .chev {
		transform: rotate(45deg);
	}
	.combo-body {
		padding: 0 16px 16px;
		animation: rise 0.35s var(--ease-out);
	}
	.how-to {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}
	.members {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.member {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--card);
		color: var(--ink);
		font: inherit;
		font-weight: 600;
		font-size: 0.88rem;
		cursor: pointer;
		transition: transform 0.2s var(--ease-spring);
	}
	.member:hover {
		transform: translateY(-2px);
	}
	.crop-glyph {
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: #6b4a33;
		transition: transform 0.35s var(--ease-spring);
	}
	.crop:hover .crop-glyph {
		transform: rotate(-15deg) scale(1.1);
	}
	.kinds {
		margin-top: 2px;
	}
	.kinds :global(svg) {
		color: var(--leaf);
	}
	.member i,
	.rec-dot {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 25%, transparent);
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex: none;
	}
	.why {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		color: var(--leaf);
		margin-bottom: 0;
	}
	.plan-cols,
	.not-cols {
		display: grid;
		gap: 20px;
		margin-top: 20px;
	}
	@media (min-width: 760px) {
		.plan-cols,
		.not-cols {
			grid-template-columns: 1fr 1fr;
		}
	}
	.shopping,
	.tasks,
	.not {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 6px;
	}
	.shopping li {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: baseline;
	}
	.tasks li {
		display: grid;
		gap: 2px;
		padding: 8px 10px;
		border-radius: 10px;
	}
	.tasks li.now {
		background: var(--leaf-soft);
	}
	.tasks i {
		display: inline-block;
		width: 12px;
		height: 5px;
		border-radius: 3px;
		vertical-align: middle;
		margin-right: 4px;
	}
	.t-indoor {
		background: var(--sky);
	}
	.t-sow {
		background: var(--leaf-2);
	}
	.t-harvest {
		background: var(--turmeric);
	}
	.gear {
		margin-top: 20px;
		padding: 16px;
		border-radius: var(--radius-sm);
		background: var(--paper-2);
	}
	.gear h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 8px;
	}
	.gear ul {
		margin: 0 0 10px;
		padding-left: 1.2em;
	}
	.gear a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 600;
	}
	.rotate {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		margin-top: 16px;
	}
	.empty {
		padding: 16px;
		border-radius: var(--radius-sm);
		background: var(--paper-2);
	}

	/* ── Crops ── */
	.rec-strip {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(220px, 260px);
		gap: 12px;
		margin: 14px -16px 0;
		padding: 4px 16px 14px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-padding: 16px;
	}
	.rec {
		display: grid;
		align-content: start;
		gap: 6px;
		padding: 16px;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		scroll-snap-align: start;
		transition: transform 0.25s var(--ease-spring);
	}
	.rec:hover {
		transform: translateY(-3px) rotate(-0.5deg);
	}
	.rec strong {
		font-family: var(--font-display);
		font-size: 1.15rem;
		color: var(--leaf);
	}
	.rec-dot {
		width: 14px;
		height: 14px;
	}
	.all-h {
		margin-top: 22px;
	}
	.crop-tools {
		display: grid;
		gap: 10px;
		margin: 10px 0 14px;
	}
	.crop-search {
		max-width: 460px;
	}
	.crop-search input {
		flex: 1;
		min-width: 0;
	}
	.legend-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-end;
		gap: 8px;
	}
	.legend-wrap :global(ol) {
		display: none;
	}
	.legend-wrap :global(.legend) {
		margin: 0;
	}
	.crops {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 12px;
	}
	.crop {
		position: relative;
		display: grid;
		gap: 8px;
		align-content: start;
		padding: 14px;
		scroll-margin-top: 140px;
		transition:
			transform 0.25s var(--ease-spring),
			box-shadow 0.25s;
	}
	.crop:hover {
		transform: translateY(-3px);
		box-shadow: var(--shadow-lift);
	}
	.crop:has(.stretch:focus-visible) {
		outline: 2px solid var(--leaf);
	}
	.crop h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 1.1rem;
	}
	.stretch {
		flex: 1;
		border: 0;
		padding: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		outline: none;
	}
	/* The whole card opens the crop. */
	.stretch::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}
	.now-badge {
		animation: pulse 2.4s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			transform: scale(1.08);
		}
	}
	.crop .how {
		margin: 0;
		font-size: 0.9rem;
		color: var(--ink-2);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.crop .meta {
		margin: 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.small {
		font-size: 0.85rem;
	}

	/* ── Not grown here ── */
	.not li {
		display: grid;
		gap: 2px;
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
	}
	.not a {
		font-weight: 700;
	}
	.not small {
		color: var(--muted);
	}
	.not span {
		font-size: 0.9rem;
		color: var(--ink-2);
	}
	@media (max-width: 520px) {
		.combo summary {
			grid-template-columns: 84px 1fr auto;
			gap: 10px;
		}
		.opts {
			grid-template-columns: 1fr;
		}
		.opt {
			grid-template-columns: 72px 1fr;
			column-gap: 12px;
			align-items: center;
		}
		.opt :global(.place-art) {
			grid-row: span 2;
		}
		.planner {
			padding: 16px;
		}
	}
</style>

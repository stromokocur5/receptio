<script lang="ts">
	import BarcodeScanner from '$lib/components/BarcodeScanner.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { formatGrams } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import PlanScope from '$lib/components/PlanScope.svelte';
	import PreservesShelf from '$lib/components/PreservesShelf.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import { CATEGORY_LABELS, ingredientSearchText, pluralRecipes, searchMatcher } from '$lib/labels';
	import { rankByPantry, TAP_WATER_ID, useSoon } from '$lib/pantry';
	import { avoidFilter, missableTools } from '$lib/avoid';
	import IngredientExcluder from '$lib/components/IngredientExcluder.svelte';
	import {
		addExtraItem,
		avoid,
		digestReminder,
		extraItems,
		pantry,
		pantryAdded,
		removePantryItem,
		setPantryItem,
		ui
	} from '$lib/state.svelte';
	import { INGREDIENT_CATEGORIES, type Ingredient } from '$lib/types';
	import { enableDigests, remindersSupported, updateDigests } from '$lib/reminders';
	import { onMount } from 'svelte';
	import { toast } from '$lib/toast.svelte';

	/** The morning overview tells what's about to spoil and what to cook with it. */
	let canRemind = $state(false);
	let remindBusy = $state(false);
	let remindError = $state('');
	onMount(() => (canRemind = remindersSupported()));
	async function remindMornings() {
		remindBusy = true;
		remindError = '';
		const kinds = { weekly: digestReminder.current?.weekly ?? false, morning: true };
		try {
			await (digestReminder.current ? updateDigests(kinds) : enableDigests(kinds));
		} catch (err) {
			remindError = err instanceof Error ? err.message : 'Nepodarilo sa zapnúť.';
		} finally {
			remindBusy = false;
		}
	}

	const catalog = useCatalog();

	let search = $state('');

	const ingredientNames = catalog.ingredients.map(ingredientSearchText);
	const matchesName = $derived(searchMatcher(ingredientNames, search));
	const pickable = $derived(
		catalog.ingredients.filter((i) => i.id !== TAP_WATER_ID && matchesName(ingredientSearchText(i)))
	);
	const pickableByCategory = $derived(
		INGREDIENT_CATEGORIES.map((c) => [c, pickable.filter((i) => i.category === c)] as const).filter(
			([, list]) => list.length > 0
		)
	);

	const items = $derived(
		Object.entries(pantry.current)
			.map(([id, grams]) => ({ ingredient: catalog.ingredientsById.get(id), grams }))
			.filter(
				(x): x is { ingredient: Ingredient; grams: number | null } => x.ingredient !== undefined
			)
			.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'sk'))
	);

	const suggestions = $derived(
		rankByPantry(
			catalog.recipes.filter(avoidFilter(avoid.current, catalog.ingredientsById)),
			pantry.current,
			catalog.ingredientsById
		)
			.filter((m) => m.have > 0)
			.slice(0, 8)
	);
	const cookable = $derived(suggestions.filter((m) => m.missing.length === 0).length);

	const toolOptions = $derived(
		missableTools(catalog.equipment, catalog.recipes, avoid.current.tools)
	);

	function toggleAvoidTool(id: string) {
		const tools = avoid.current.tools;
		avoid.current = {
			...avoid.current,
			tools: tools.includes(id) ? tools.filter((t) => t !== id) : [...tools, id]
		};
	}

	/** One tap fills what most kitchens have; the long list is for the rest. */
	const BUNDLES: { label: string; icon: IconName; ids: string[] }[] = [
		{
			label: 'Základy',
			icon: 'jar',
			ids: [
				'ryza-basmati',
				'cestoviny',
				'ovsene-vlocky',
				'hladka-muka',
				'cibula',
				'cesnak',
				'zemiaky',
				'sosovica-cervena',
				'cicer-sterilizovany',
				'paradajky-sterilizovane'
			]
		},
		{
			label: 'Bežná zelenina a ovocie',
			icon: 'leaf',
			ids: [
				'mrkva',
				'paprika-cervena',
				'cuketa',
				'brokolica',
				'paradajky',
				'jablko',
				'banan',
				'citron'
			]
		},
		{
			label: 'Ázijská kuchyňa',
			icon: 'soup',
			ids: [
				'sojova-omacka',
				'ryzove-rezance',
				'kokosove-mlieko',
				'zazvor',
				'tofu-natural',
				'limetka',
				'jarna-cibulka'
			]
		},
		{
			label: 'Mexická kuchyňa',
			icon: 'chili',
			ids: [
				'fazula-cierna',
				'kukuricne-tortilly',
				'avokado',
				'kukurica',
				'cili-papricka',
				'limetka'
			]
		},
		{
			label: 'Raňajky',
			icon: 'sunrise',
			ids: ['ovsene-vlocky', 'sojove-mlieko', 'arasidove-maslo', 'chia', 'banan']
		}
	];
	const bundleMissing = (ids: string[]) =>
		ids.filter((id) => catalog.ingredientsById.has(id) && !(id in pantry.current));
	function addBundle(ids: string[]) {
		for (const id of bundleMissing(ids)) setPantryItem(id, null);
	}

	const soon = $derived(
		ui.loaded
			? useSoon(pantry.current, pantryAdded.current, catalog.ingredientsById, new Date())
			: []
	);
	const daysAgo = (days: number) => {
		if (days === 1) return 'včera';
		if (days < 14) return `pred ${days} dňami`;
		return `pred ${Math.round(days / 7)} týždňami`;
	};

	function toggle(ingredient: Ingredient) {
		if (ingredient.id in pantry.current) removePantryItem(ingredient.id);
		else setPantryItem(ingredient.id, null);
	}

	function setGrams(id: string, value: string) {
		const grams = Number(value.replace(',', '.'));
		setPantryItem(id, value.trim() === '' || !Number.isFinite(grams) || grams < 0 ? null : grams);
	}

	let scanning = $state(false);

	/** Takes a change back: the pantry, its dates and (for "ran out") the shopping list. */
	function snapshot() {
		const before = {
			pantry: pantry.current,
			added: pantryAdded.current,
			extras: extraItems.current
		};
		return () => {
			pantry.current = before.pantry;
			pantryAdded.current = before.added;
			extraItems.current = before.extras;
		};
	}

	/** Ran out: off the pantry and onto the shopping list in one tap. */
	function useUp(ingredient: Ingredient) {
		const undo = snapshot();
		removePantryItem(ingredient.id);
		if (!extraItems.current.some((x) => !x.checked && x.text === ingredient.name))
			addExtraItem(ingredient.name);
		toast(`${ingredient.name}: v nákupnom zozname`, undo);
	}

	function remove(ingredient: Ingredient) {
		const undo = snapshot();
		removePantryItem(ingredient.id);
		toast(`${ingredient.name}: preč zo špajze`, undo);
	}

	function clearAll() {
		const undo = snapshot();
		pantry.current = {};
		pantryAdded.current = {};
		toast('Špajza je prázdna', undo);
	}
</script>

<Seo
	title="Špajza"
	description="Naklikaj, čo máš doma, a uvidíš, čo z toho uvaríš bez cesty do obchodu."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Špajza</p>
		<h1>Čo máš doma?</h1>
		<p class="lede">
			Naklikaj suroviny a Receptio ti ukáže, čo z nich uvaríš. Množstvo vyplň, iba ak chceš
			presnejší nákupný zoznam. Všetko ostáva len v tvojom prehliadači.
		</p>
		<PlanScope />
		<div class="intro-links">
			<a class="leftovers-link card draw-host" href="/zvysky">
				<Icon name="jar" size={22} />
				<span>
					<strong>Treba minúť len pár vecí?</strong>
					<small
						>Pol cukety, ryža zo včera – nájdi recept zo zvyškov bez vypĺňania celej špajze.</small
					>
				</span>
				<Icon name="arrow-right" size={18} />
			</a>
			<nav class="chips jump" aria-label="Na stránke">
				<a class="chip" href="#moja-spajza"><Icon name="jar" size={16} /> Moja špajza</a>
				<a class="chip" href="#zavaraniny"
					><Icon name="snowflake" size={16} /> Zaváraniny a mraznička</a
				>
				<a class="chip" href="#nemam"><Icon name="x" size={16} /> Čo nemám a nejem</a>
			</nav>
		</div>
	</header>

	{#if suggestions.length}
		<section class="cook">
			<div class="cook-head">
				<h2>Čo z toho uvarím</h2>
				<a class="btn ghost small" href="/recepty?spajza=1&sort=spajza"
					>Všetky <Icon name="arrow-right" size={16} /></a
				>
			</div>
			<p class="muted">
				{cookable
					? `${cookable} ${pluralRecipes(cookable)} môžeš uvariť hneď, ostatným chýba len málo.`
					: 'Tieto recepty sú najbližšie k tomu, čo máš doma.'}
			</p>
			<div class="grid">
				{#each suggestions.slice(0, 4) as m, i (m.recipe.id)}<RecipeCard
						recipe={m.recipe}
						match={m}
						index={i}
					/>{/each}
			</div>
		</section>
	{/if}

	<div class="layout">
		<section class="picker card">
			<div class="field">
				<Icon name="search" size={20} />
				<label for="pantry-q" class="sr-only">Hľadať surovinu</label>
				<input
					id="pantry-q"
					type="search"
					bind:value={search}
					placeholder="Hľadaj surovinu – cícer, huby…"
				/>
				<button
					class="icon-btn plain scan"
					aria-label="Pridať podľa čiarového kódu"
					title="Pridať podľa čiarového kódu"
					aria-expanded={scanning}
					onclick={() => (scanning = !scanning)}
				>
					<Icon name="barcode" size={20} />
				</button>
			</div>
			<BarcodeScanner bind:open={scanning} />
			{#if !search.trim()}
				<div class="bundles" role="group" aria-label="Pridať naraz">
					<span class="bundles-label">Pridať naraz:</span>
					{#each BUNDLES as bundle (bundle.label)}
						{@const missing = ui.loaded ? bundleMissing(bundle.ids).length : bundle.ids.length}
						<button
							class="chip"
							disabled={missing === 0}
							onclick={() => addBundle(bundle.ids)}
							title={bundle.ids.map((id) => catalog.ingredientsById.get(id)?.name).join(', ')}
						>
							<Icon name={missing ? bundle.icon : 'check'} size={15} />
							{bundle.label}
							{#if missing && missing < bundle.ids.length}<small class="more">+{missing}</small
								>{/if}
						</button>
					{/each}
				</div>
			{/if}
			<div class="cats">
				{#each pickableByCategory as [category, list] (category)}
					{@const picked = ui.loaded ? list.filter((i) => i.id in pantry.current).length : 0}
					<details class="cat" open={!!search.trim()}>
						<summary>
							<h3 class="eyebrow">{CATEGORY_LABELS[category]}</h3>
							<span class="cat-n">{picked ? `${picked} z ${list.length}` : list.length}</span>
						</summary>
						<div class="chips">
							{#each list as ingredient (ingredient.id)}
								{@const on = ui.loaded && ingredient.id in pantry.current}
								<button class="chip pick" aria-pressed={on} onclick={() => toggle(ingredient)}>
									<span class="swatch" style:--c={ingredient.color}></span>
									{ingredient.name}
									{#if on}<Icon name="check" size={14} stroke={2.6} draw />{/if}
								</button>
							{/each}
						</div>
					</details>
				{:else}
					<p class="muted">Takú surovinu v databáze zatiaľ nemáme.</p>
				{/each}
			</div>
		</section>

		<div class="side">
			{#if soon.length}
				<section class="card box soon" aria-labelledby="soon-title">
					<h2 class="section-title" id="soon-title">
						<Icon name="clock" size={24} /> Minúť čoskoro
					</h2>
					<p class="hint">Čerstvé veci, ktoré máš v špajzi už pár dní.</p>
					<ul>
						{#each soon.slice(0, 5) as { ingredient, days } (ingredient.id)}
							<li>
								<span class="swatch" style:--c={ingredient.color}></span>
								<span class="soon-name">{ingredient.name}</span>
								<small class="muted">{daysAgo(days)}</small>
							</li>
						{/each}
					</ul>
					<a
						class="btn leaf small"
						href="/zvysky?s={soon
							.slice(0, 5)
							.map((s) => s.ingredient.id)
							.join(',')}">Nájdi recept, ktorý to minie <Icon name="arrow-right" size={16} /></a
					>
					{#if canRemind && ui.loaded && !digestReminder.current?.morning}
						<button class="btn ghost small" disabled={remindBusy} onclick={remindMornings}>
							<Icon name="bell" size={16} /> Pripomeň mi to ráno
						</button>
						{#if remindError}<p class="notice danger" role="alert">
								<Icon name="alert" size={18} />
								{remindError}
							</p>{/if}
					{:else if digestReminder.current?.morning}
						<p class="hint">Ráno o 7:00 ti pripomenieme, čo sa minie, aj s receptom.</p>
					{/if}
				</section>
			{/if}
			<section class="card box mine" id="moja-spajza">
				<div class="mine-head">
					<h2 class="section-title"><Icon name="jar" size={24} /> Moja špajza</h2>
					{#if ui.loaded && items.length}
						<button class="btn danger small" onclick={clearAll}>
							<Icon name="trash" size={16} /> Vyprázdniť
						</button>
					{/if}
				</div>
				{#if !ui.loaded}
					<p class="muted">Načítavam…</p>
				{:else if items.length === 0}
					<div class="empty">
						<svg viewBox="0 0 80 90" width="80" aria-hidden="true">
							<rect
								x="14"
								y="20"
								width="52"
								height="62"
								rx="10"
								fill="var(--paper-2)"
								stroke="var(--line)"
								stroke-width="2"
							/>
							<rect x="20" y="8" width="40" height="14" rx="4" fill="var(--leaf-2)" />
							<path d="M24 50h32" stroke="var(--line)" stroke-width="3" stroke-linecap="round" />
						</svg>
						<p>Zatiaľ prázdne. Ťukni na suroviny v zozname alebo pridaj celú sadu naraz.</p>
					</div>
				{:else}
					<ul class="divided items">
						{#each items as { ingredient, grams } (ingredient.id)}
							<li>
								<span class="swatch" style:--c={ingredient.color}></span>
								<span class="nm">{ingredient.name}</span>
								<label class="qty">
									<span class="sr-only">Množstvo v gramoch pre {ingredient.name}</span>
									<input
										class="input sm"
										inputmode="decimal"
										value={grams ?? ''}
										placeholder="—"
										onchange={(e) => setGrams(ingredient.id, e.currentTarget.value)}
									/>
									<span class="unit">g</span>
								</label>
								<button
									class="icon-btn plain buy"
									aria-label="Došlo – do nákupu: {ingredient.name}"
									title="Došlo – do nákupného zoznamu"
									onclick={() => useUp(ingredient)}
								>
									<Icon name="basket" size={18} />
								</button>
								<button
									class="icon-btn plain rm"
									aria-label="Odstrániť {ingredient.name}"
									onclick={() => remove(ingredient)}
								>
									<Icon name="x" size={18} />
								</button>
							</li>
						{/each}
					</ul>
					<p class="hint">
						Množstvo v gramoch je nepovinné – prázdne znamená, že máš dosť. Košík: došlo, daj do
						<a href="/plan#nakup">nákupu</a>.
					</p>
					<p class="hint">
						Tip: 1 plechovka cícera ≈ {formatGrams(240)} scedeného, hrnček ryže ≈ {formatGrams(
							185
						)}.
					</p>
				{/if}
			</section>
			<PreservesShelf />
		</div>
	</div>

	<section class="card box never" id="nemam" aria-labelledby="nemam-title">
		<div class="never-head">
			<h2 class="section-title" id="nemam-title"><Icon name="x" size={24} /> Čo nemám a nejem</h2>
			<p class="muted">
				Recepty s týmito vecami ti Receptio nebude ponúkať – v receptoch, v návrhu týždňa ani tu. V
				receptoch sa to dá na chvíľu vypnúť.
			</p>
		</div>
		<div class="never-cols">
			<div>
				<h3>Suroviny</h3>
				<IngredientExcluder
					selected={ui.loaded ? avoid.current.ingredients : []}
					onchange={(ids) => (avoid.current = { ...avoid.current, ingredients: ids })}
					prefix="nemám"
					placeholder="Napr. huby, tofu, koriander…"
					hint="Čo nejedávaš, na čo je niekto alergický alebo čo v obchode nekúpiš. Platí aj pre iné podoby (sušený aj varený cícer)."
				/>
			</div>
			<div>
				<h3>Náradie</h3>
				<div class="chips">
					{#each toolOptions as tool (tool.id)}
						<button
							class="chip"
							aria-pressed={ui.loaded && avoid.current.tools.includes(tool.id)}
							onclick={() => toggleAvoidTool(tool.id)}
						>
							{tool.name}
						</button>
					{/each}
				</div>
				<p class="hint">
					Ťukni na to, čo doma nemáš. <a href="/vybavenie">Čím to nahradiť</a>
				</p>
			</div>
		</div>
		<div class="never-treats">
			<h3>Fast food a jedlá na občas</h3>
			<div class="chips">
				<button
					class="chip"
					aria-pressed={ui.loaded && avoid.current.treats}
					onclick={() => (avoid.current = { ...avoid.current, treats: !avoid.current.treats })}
				>
					Neukazovať fast food a jedlá na občas
				</button>
			</div>
			<p class="hint">
				Skryje kebab, burgre, vyprážané a všetko so štítkom „Na občas“ – veľa tuku alebo cukru.
				Recepty nezmiznú, cez odkaz alebo vyhľadanie v receptoch s vypnutým filtrom ich otvoríš
				stále.
			</p>
		</div>
	</section>
</div>

<style>
	.intro-links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3) var(--sp-5);
		margin-top: 14px;
	}
	.leftovers-link {
		flex: 1 1 320px;
		max-width: 560px;
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		color: var(--ink);
		text-decoration: none;
		transition: transform 0.25s var(--ease-spring);
	}
	.leftovers-link:hover {
		transform: translateY(-2px);
	}
	.leftovers-link strong {
		display: block;
	}
	.leftovers-link small {
		color: var(--ink-2);
		font-size: var(--fs-sm);
	}
	.jump {
		flex: 1 1 280px;
	}
	.layout {
		display: grid;
		gap: 20px;
		margin-top: var(--sp-3);
	}
	.picker {
		padding: 18px;
	}
	.cats {
		display: grid;
		gap: 2px;
		margin-top: var(--sp-3);
		max-height: 70vh;
		overflow: auto;
		padding-right: var(--sp-1);
	}
	.cat .chips {
		padding: var(--sp-1) 0 14px;
	}
	.pick {
		white-space: normal;
		text-align: left;
	}
	.bundles {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		margin: 14px 0 var(--sp-1);
	}
	.bundles-label {
		font-size: var(--fs-sm);
		font-weight: 650;
		color: var(--muted);
	}
	.more {
		opacity: 0.7;
	}
	.cat summary {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: var(--tap);
		cursor: pointer;
		list-style: none;
	}
	.cat summary::-webkit-details-marker {
		display: none;
	}
	.cat summary::before {
		content: '';
		width: 7px;
		height: 7px;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(-45deg);
		transition: transform 0.2s var(--ease-out);
	}
	.cat[open] summary::before {
		transform: rotate(45deg);
	}
	.cat summary h3 {
		margin: 0;
		font-family: var(--font-body);
		color: var(--ink-2);
	}
	.cat-n {
		font-size: var(--fs-sm);
		color: var(--muted);
	}
	.side {
		display: grid;
		gap: 18px;
		align-content: start;
	}
	.soon {
		display: grid;
		gap: var(--sp-2);
		background: var(--turmeric-soft);
		border-color: transparent;
	}
	.soon .section-title,
	.soon p {
		margin: 0;
	}
	.soon ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--sp-1);
	}
	.soon li {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.soon-name {
		min-width: 0;
	}
	.soon li small {
		margin-left: auto;
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	.soon .btn {
		justify-self: start;
		white-space: normal;
	}
	.mine-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
	}
	.mine-head .section-title {
		margin: 0;
	}
	.items {
		margin-top: var(--sp-3);
	}
	.items li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto auto;
		align-items: center;
		gap: var(--sp-2);
		padding: 6px 0;
		animation: rise 0.35s var(--ease-out);
	}
	.nm {
		font-size: var(--fs-md);
	}
	.qty {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
	}
	.qty input {
		width: 4.8em;
		text-align: right;
	}
	.qty input::placeholder {
		text-align: right;
	}
	.unit {
		font-size: var(--fs-sm);
		color: var(--muted);
	}
	.rm {
		color: var(--muted);
	}
	.rm:hover {
		background: var(--tomato-soft);
		color: var(--tomato);
	}
	.buy {
		color: var(--muted);
	}
	.buy:hover {
		background: var(--leaf-soft);
		color: var(--leaf);
	}
	.never {
		display: grid;
		gap: var(--sp-4);
		margin-top: var(--sp-5);
	}
	.never-head .section-title {
		margin: 0 0 var(--sp-1);
	}
	.never-head p {
		margin: 0;
	}
	.never h3 {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-base);
	}
	.never-cols {
		display: grid;
		gap: 20px;
	}
	@media (min-width: 760px) {
		.never-cols {
			grid-template-columns: 1fr 1fr;
		}
	}
	.cook {
		margin: var(--sp-5) 0 var(--sp-6);
	}
	.cook-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.cook-head h2 {
		margin: 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}
	@media (prefers-reduced-motion: reduce) {
		.items li {
			animation: none;
		}
	}
	@media (min-width: 960px) {
		.layout {
			grid-template-columns: 1.3fr 1fr;
			align-items: start;
		}
	}
</style>

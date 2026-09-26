<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { formatGrams } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import { CATEGORY_LABELS, normalizeSearch } from '$lib/labels';
	import { rankByPantry } from '$lib/pantry';
	import { pantry, removePantryItem, setPantryItem, ui } from '$lib/state.svelte';
	import { INGREDIENT_CATEGORIES, type Ingredient } from '$lib/types';

	const catalog = useCatalog();

	let search = $state('');
	let confirmClear = $state(false);

	const pickable = $derived(
		catalog.ingredients.filter(
			(i) => !i.staple && normalizeSearch(i.name).includes(normalizeSearch(search.trim()))
		)
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
		rankByPantry(catalog.recipes, pantry.current, catalog.ingredientsById)
			.filter((m) => m.have > 0)
			.slice(0, 8)
	);
	const cookable = $derived(suggestions.filter((m) => m.missing.length === 0).length);

	function toggle(ingredient: Ingredient) {
		if (ingredient.id in pantry.current) removePantryItem(ingredient.id);
		else setPantryItem(ingredient.id, null);
	}

	function setGrams(id: string, value: string) {
		const grams = Number(value.replace(',', '.'));
		setPantryItem(id, value.trim() === '' || !Number.isFinite(grams) || grams < 0 ? null : grams);
	}

	function clearAll() {
		if (!confirmClear) {
			confirmClear = true;
			setTimeout(() => (confirmClear = false), 3000);
			return;
		}
		pantry.current = {};
		confirmClear = false;
	}
</script>

<Seo title="Špajza" description="Nakliknem, čo mám doma, a Receptio zoradí recepty podľa zhody." />

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Špajza</p>
		<h1>Čo máš doma?</h1>
		<p class="lede">
			Naklikaj suroviny a Receptio ti ukáže, čo z nich uvaríš. Množstvo vyplň, iba ak chceš
			presnejší nákupný zoznam. Soľ, oleje a korenie berieme ako samozrejmosť. Všetko ostáva len v
			tvojom prehliadači.
		</p>
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
	</header>

	<div class="layout">
		<section class="picker card">
			<div class="field">
				<Icon name="search" size={20} />
				<label for="pantry-q" class="sr-only">Hľadať surovinu</label>
				<input id="pantry-q" type="search" bind:value={search} placeholder="Hľadaj surovinu…" />
			</div>
			<div class="cats">
				{#each pickableByCategory as [category, list] (category)}
					<div class="cat">
						<h3>{CATEGORY_LABELS[category]}</h3>
						<div class="chips">
							{#each list as ingredient (ingredient.id)}
								{@const on = ui.loaded && ingredient.id in pantry.current}
								<button
									class="chip pick"
									aria-pressed={on}
									onclick={() => toggle(ingredient)}
									style:--c={ingredient.color}
								>
									<span class="dot"></span>
									{ingredient.name}
									{#if on}<Icon name="check" size={14} stroke={2.6} draw />{/if}
								</button>
							{/each}
						</div>
					</div>
				{:else}
					<p class="muted">Takú surovinu v databáze zatiaľ nemáme.</p>
				{/each}
			</div>
		</section>

		<div class="side">
			<section class="card mine">
				<div class="mine-head">
					<h2><Icon name="jar" size={24} /> Moja špajza</h2>
					{#if items.length}
						<button class="btn ghost small" onclick={clearAll}>
							<Icon name="trash" size={16} />
							{confirmClear ? 'Naozaj?' : 'Vyprázdniť'}
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
						<p class="muted">Zatiaľ prázdne. Ťukni na suroviny vľavo.</p>
					</div>
				{:else}
					<ul>
						{#each items as { ingredient, grams } (ingredient.id)}
							<li>
								<span class="dot" style:--c={ingredient.color}></span>
								<span class="nm">{ingredient.name}</span>
								<label class="qty">
									<span class="sr-only">Množstvo v gramoch pre {ingredient.name}</span>
									<input
										inputmode="decimal"
										value={grams ?? ''}
										placeholder="dosť"
										onchange={(e) => setGrams(ingredient.id, e.currentTarget.value)}
									/>
									<span class="unit">g</span>
								</label>
								<button
									class="rm"
									aria-label="Odstrániť {ingredient.name}"
									onclick={() => removePantryItem(ingredient.id)}
								>
									<Icon name="x" size={16} />
								</button>
							</li>
						{/each}
					</ul>
					<p class="muted small">
						Tip: 1 plechovka cícera ≈ {formatGrams(240)} scedeného, hrnček ryže ≈ {formatGrams(
							185
						)}.
					</p>
				{/if}
			</section>
		</div>
	</div>

	{#if suggestions.length}
		<section class="cook">
			<h2>Čo z toho uvarím</h2>
			<p class="muted">
				{cookable
					? `${cookable} ${cookable === 1 ? 'recept môžeš uvariť' : 'recepty môžeš uvariť'} hneď, ostatným chýba len málo.`
					: 'Tieto recepty sú najbližšie k tomu, čo máš doma.'}
			</p>
			<div class="grid">
				{#each suggestions as m, i (m.recipe.id)}<RecipeCard
						recipe={m.recipe}
						match={m}
						index={i}
					/>{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.leftovers-link {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 12px;
		max-width: 560px;
		margin-top: 14px;
		padding: 12px 16px;
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
	}
	.page {
		padding-top: 28px;
	}
	.lede {
		max-width: 44em;
		color: var(--ink-2);
	}
	.layout {
		display: grid;
		gap: 20px;
		margin-top: 12px;
	}
	.picker {
		padding: 18px;
	}
	.cats {
		display: grid;
		gap: 18px;
		margin-top: 16px;
		max-height: 70vh;
		overflow: auto;
		padding-right: 4px;
	}
	.cat h3 {
		font-size: 0.8rem;
		font-family: var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
		margin-bottom: 8px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.pick {
		white-space: normal;
		text-align: left;
	}
	.pick[aria-pressed='true'] {
		background: var(--leaf);
		border-color: var(--leaf);
		color: var(--paper);
	}
	.dot {
		flex: none;
		width: 12px;
		height: 12px;
		border-radius: 45% 55% 50% 50%;
		background: var(--c);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
	}
	.mine {
		padding: 18px;
	}
	.mine-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.mine-head h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.4rem;
		margin: 0;
	}
	.mine ul {
		list-style: none;
		margin: 14px 0 0;
		padding: 0;
	}
	.mine li {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
		animation: rise 0.35s var(--ease-out);
	}
	.nm {
		font-size: 0.95rem;
	}
	.qty {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: var(--paper);
		border-radius: 10px;
		padding: 2px 8px;
	}
	.qty input {
		width: 4.2em;
		border: 0;
		background: transparent;
		text-align: right;
		padding: 4px 0;
		outline: none;
	}
	.unit {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.rm {
		border: 0;
		background: transparent;
		color: var(--muted);
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
	}
	.rm:hover {
		background: var(--tomato-soft);
		color: var(--tomato);
	}
	.empty {
		display: grid;
		justify-items: center;
		padding: 24px 0 8px;
		text-align: center;
	}
	.small {
		font-size: 0.82rem;
		margin: 12px 0 0;
	}
	.cook {
		margin-top: 44px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}
	@media (min-width: 960px) {
		.layout {
			grid-template-columns: 1.3fr 1fr;
			align-items: start;
		}
		.side {
			position: sticky;
			top: 84px;
		}
	}
</style>

<script lang="ts">
	import { backupFileName, exportBackup, importBackup } from '$lib/backup';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import SyncPanel from '$lib/components/SyncPanel.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { formatEur, formatNumber } from '$lib/amounts';
	import JournalPanel from '$lib/components/JournalPanel.svelte';
	import NutrientBars from '$lib/components/NutrientBars.svelte';
	import { dailyTargets } from '$lib/nutrition';
	import {
		RATING_LABELS,
		collections,
		createCollection,
		deleteCollection,
		favorites,
		history,
		journal,
		likes,
		MAX_COLLECTION_NAME,
		MAX_COLLECTIONS,
		notes,
		renameCollection,
		settings,
		ui
	} from '$lib/state.svelte';
	import { CATEGORY_IDS, RECIPE_CATEGORIES, splitCategory } from '$lib/categories';
	import type { RecipeSummary } from '$lib/types';
	import { onboarding } from '$lib/onboarding.svelte';
	import { weekSummary } from '$lib/week';

	const catalog = useCatalog();
	const dateFormat = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'long' });

	const favoriteRecipes = $derived(
		ui.loaded ? catalog.recipes.filter((r) => favorites.current[r.id]) : []
	);
	/** Which shelf of saved recipes is shown: all, liked, or a collection id. */
	let shelf = $state<string>('all');
	const likedRecipes = $derived(
		ui.loaded ? catalog.recipes.filter((r) => likes.mine.includes(r.id)) : []
	);
	const activeCollection = $derived(collections.current.find((c) => c.id === shelf));
	const shown = $derived.by((): RecipeSummary[] => {
		if (shelf === 'liked') return likedRecipes;
		if (activeCollection) {
			return activeCollection.recipeIds.flatMap((id) => catalog.recipesById.get(id) ?? []);
		}
		return favoriteRecipes;
	});
	/** A long list of everything saved reads better split by kind of dish. */
	const groups = $derived.by(() => {
		if (shelf !== 'all' || shown.length <= 6) return null;
		const byCategory = new Map<string, RecipeSummary[]>();
		for (const r of shown) {
			const category = r.categories[0] ? splitCategory(r.categories[0]).category : '';
			byCategory.set(category, [...(byCategory.get(category) ?? []), r]);
		}
		return [...byCategory]
			.sort(
				([a], [b]) =>
					CATEGORY_IDS.indexOf(a as never) - CATEGORY_IDS.indexOf(b as never) || a.localeCompare(b)
			)
			.map(([category, recipes]) => ({
				label:
					category in RECIPE_CATEGORIES
						? RECIPE_CATEGORIES[category as keyof typeof RECIPE_CATEGORIES].label
						: 'Ostatné',
				recipes
			}));
	});
	let newCollection = $state<string | null>(null);
	let renaming = $state<string | null>(null);
	let confirmDelete = $state(false);

	function addCollection(event: SubmitEvent) {
		event.preventDefault();
		const id = createCollection(newCollection ?? '');
		if (id) {
			shelf = id;
			newCollection = null;
		}
	}

	const cooked = $derived(
		ui.loaded
			? history.current
					.filter((h) => catalog.recipesById.has(h.recipeId))
					.slice()
					.reverse()
			: []
	);
	const topCooked = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const h of cooked) counts.set(h.recipeId, (counts.get(h.recipeId) ?? 0) + 1);
		return [...counts]
			.filter(([, n]) => n > 1)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3);
	});
	const thisMonth = $derived(
		cooked.filter((h) => h.date.slice(0, 7) === new Date().toISOString().slice(0, 7)).length
	);
	const noted = $derived(
		ui.loaded ? Object.entries(notes.current).filter(([id]) => catalog.recipesById.has(id)) : []
	);

	const week = $derived(
		ui.loaded
			? weekSummary(history.current, catalog.recipesById, settings.current.people, new Date())
			: null
	);
	const targets = $derived(dailyTargets(settings.current.weightKg, journal.current.goals));

	let showAllHistory = $state(false);
	let restoreMessage = $state<{ ok: boolean; text: string } | null>(null);

	const titleOf = (id: string) => catalog.recipesById.get(id)?.title ?? id;

	function download() {
		const blob = new Blob([exportBackup()], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = backupFileName();
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function restore(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file) return;
		const restored = importBackup(await file.text());
		restoreMessage =
			restored === null
				? { ok: false, text: 'Toto nie je záloha z Receptia.' }
				: restored.length
					? { ok: true, text: 'Hotovo – špajza, plán, história aj poznámky sú späť.' }
					: { ok: false, text: 'Záloha je prázdna alebo poškodená, nič sa nezmenilo.' };
	}
</script>

<Seo
	title="Moje"
	description="Tvoje obľúbené recepty, história varenia a poznámky na jednom mieste."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Moje</p>
		<h1>Moja kuchyňa</h1>
		<p class="lede">
			Obľúbené recepty, história varenia, poznámky a denník jedla. Všetko je uložené len v tomto
			prehliadači, bez účtu.
		</p>
	</header>

	<section class="block">
		<h2><Icon name="bookmark" size={24} /> Obľúbené</h2>
		{#if !ui.loaded}
			<p class="muted">Načítavam…</p>
		{:else}
			<div class="shelves" role="group" aria-label="Čo ukázať">
				<button class="chip" aria-pressed={shelf === 'all'} onclick={() => (shelf = 'all')}>
					Všetky uložené ({favoriteRecipes.length})
				</button>
				<button class="chip" aria-pressed={shelf === 'liked'} onclick={() => (shelf = 'liked')}>
					<Icon name="heart" size={13} /> Lajknuté ({likedRecipes.length})
				</button>
				{#each collections.current as c (c.id)}
					<button
						class="chip"
						aria-pressed={shelf === c.id}
						onclick={() => {
							shelf = c.id;
							renaming = null;
							confirmDelete = false;
						}}
					>
						{c.name} ({c.recipeIds.length})
					</button>
				{/each}
				{#if newCollection !== null}
					<form class="inline-form" onsubmit={addCollection}>
						<label class="field small-field">
							<span class="sr-only">Názov kolekcie</span>
							<!-- svelte-ignore a11y_autofocus -->
							<input
								bind:value={newCollection}
								maxlength={MAX_COLLECTION_NAME}
								placeholder="Napr. Desiata, Na návštevu"
								autofocus
								required
							/>
						</label>
						<button class="btn leaf small" type="submit">Vytvoriť</button>
						<button class="btn ghost small" type="button" onclick={() => (newCollection = null)}
							>Zrušiť</button
						>
					</form>
				{:else if collections.current.length < MAX_COLLECTIONS}
					<button class="chip" onclick={() => (newCollection = '')}>
						<Icon name="plus" size={13} /> Nová kolekcia
					</button>
				{/if}
			</div>

			{#if activeCollection}
				<div class="collection-tools">
					{#if renaming !== null}
						<form
							class="inline-form"
							onsubmit={(e) => {
								e.preventDefault();
								renameCollection(activeCollection.id, renaming ?? '');
								renaming = null;
							}}
						>
							<label class="field small-field">
								<span class="sr-only">Nový názov</span>
								<input bind:value={renaming} maxlength={MAX_COLLECTION_NAME} required />
							</label>
							<button class="btn leaf small" type="submit">Uložiť</button>
						</form>
					{:else}
						<button class="btn ghost small" onclick={() => (renaming = activeCollection.name)}>
							<Icon name="pencil" size={15} /> Premenovať
						</button>
					{/if}
					{#if confirmDelete}
						<button
							class="btn small danger"
							onclick={() => {
								deleteCollection(activeCollection.id);
								shelf = 'all';
								confirmDelete = false;
							}}>Naozaj zmazať kolekciu</button
						>
					{:else}
						<button class="btn ghost small" onclick={() => (confirmDelete = true)}>
							<Icon name="trash" size={15} /> Zmazať kolekciu
						</button>
					{/if}
					<span class="muted small">Recepty v nej ostanú uložené.</span>
				</div>
			{/if}

			{#if shown.length === 0}
				<p class="muted">
					{#if shelf === 'liked'}
						Zatiaľ si nič nelajkol/a. Srdiečko je pri každom recepte.
					{:else if activeCollection}
						Kolekcia je prázdna. Recept do nej pridáš na jeho stránke – keď je uložený, pod
						tlačidlami uvidíš svoje kolekcie.
					{:else}
						Zatiaľ nič. Recept si uložíš ikonou záložky vedľa tlačidla „Do plánu“.
					{/if}
				</p>
			{:else if groups}
				{#each groups as group (group.label)}
					<h3 class="group-title">
						{group.label} <span class="muted">({group.recipes.length})</span>
					</h3>
					<div class="grid">
						{#each group.recipes as recipe, i (recipe.id)}<RecipeCard {recipe} index={i} />{/each}
					</div>
				{/each}
			{:else}
				<div class="grid">
					{#each shown as recipe, i (recipe.id)}<RecipeCard {recipe} index={i} />{/each}
				</div>
			{/if}
			{#if shelf === 'liked'}
				<p class="muted small">
					Lajky sa pamätajú pre toto zariadenie, synchronizácia ich neprenáša.
				</p>
			{/if}
		{/if}
	</section>

	{#if ui.loaded}
		<JournalPanel {targets} />
	{/if}

	{#if week && week.portions > 0}
		<section class="card box weekbox">
			<h2><Icon name="calendar" size={24} /> Posledných 7 dní</h2>
			<p class="stats">
				<strong>{formatNumber(week.portions, 0)}</strong>
				{week.portions < 1.5 ? 'porcia' : week.portions < 4.5 ? 'porcie' : 'porcií'} na osobu ·
				{formatEur(week.cost)}
			</p>
			<NutrientBars
				values={week.perDay}
				{targets}
				keys={['protein', 'fiber', 'iron', 'calcium', 'zinc', 'ala']}
			/>
			<p class="muted small">
				Priemer na deň len z jedál uvarených podľa Receptia, rozdelených na
				{settings.current.people}
				{settings.current.people === 1 ? 'osobu' : settings.current.people < 5 ? 'osoby' : 'osôb'} (nastavíš
				v Pláne). Raňajky a jedlá mimo Receptia tu nie sú, takže reálne číslo je vyššie. B12 a vitamín
				D rieš <a href="/wiki/b12">suplementom</a>.
			</p>
		</section>
	{/if}

	<div class="two">
		<section class="card box">
			<h2><Icon name="history" size={24} /> Uvarené</h2>
			{#if cooked.length === 0}
				<p class="muted">
					Keď dovaríš recept v režime varenia alebo ho v pláne označíš „Uvarené“, objaví sa tu.
				</p>
			{:else}
				<p class="stats">
					Spolu <strong>{cooked.length}×</strong>, tento mesiac <strong>{thisMonth}×</strong>.
					{#if topCooked.length}
						Najčastejšie: {topCooked.map(([id, n]) => `${titleOf(id)} (${n}×)`).join(', ')}.
					{/if}
				</p>
				<ul class="history">
					{#each showAllHistory ? cooked : cooked.slice(0, 8) as h, i (i)}
						<li>
							<span class="muted">{dateFormat.format(new Date(h.date))}</span>
							<a href="/recepty/{h.recipeId}"
								>{titleOf(h.recipeId)}{#if h.rating}
									<small class="rating r{h.rating}">{RATING_LABELS[h.rating]}</small>{/if}</a
							>
							<span class="muted">{h.servings} porc.</span>
						</li>
					{/each}
				</ul>
				{#if cooked.length > 8}
					<button class="btn ghost small" onclick={() => (showAllHistory = !showAllHistory)}>
						{showAllHistory ? 'Menej' : `Všetko (${cooked.length})`}
					</button>
				{/if}
			{/if}
		</section>

		<section class="card box">
			<h2><Icon name="pencil" size={24} /> Poznámky</h2>
			{#if noted.length === 0}
				<p class="muted">Poznámku si napíšeš pod postupom každého receptu.</p>
			{:else}
				<ul class="notes">
					{#each noted as [id, text] (id)}
						<li>
							<a href="/recepty/{id}">{titleOf(id)}</a>
							<p>{text}</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<SyncPanel />

	<p class="guide-again">
		<button class="btn ghost small" onclick={() => (onboarding.open = true)}>
			<Icon name="info" size={16} /> Ako Receptio funguje – spustiť sprievodcu
		</button>
	</p>

	<section class="card box backup">
		<h2><Icon name="package" size={24} /> Záloha do súboru</h2>
		<p>
			Špajza, plán, záhradka, história, obľúbené a poznámky žijú v tomto prehliadači. Ak nechceš
			synchronizáciu, stiahni si zálohu ako súbor a na druhom zariadení ju obnov (pošli si ho
			napríklad mailom).
		</p>
		<div class="backup-actions">
			<button class="btn leaf" onclick={download}>
				<Icon name="download" size={18} /> Stiahnuť zálohu
			</button>
			<label class="btn ghost">
				<Icon name="upload" size={18} /> Obnoviť zo zálohy
				<input type="file" accept="application/json,.json" onchange={restore} />
			</label>
		</div>
		{#if restoreMessage}
			<p class="msg" class:ok={restoreMessage.ok} role="status">
				<Icon name={restoreMessage.ok ? 'check' : 'alert'} size={18} />
				{restoreMessage.text}
			</p>
		{/if}
		<p class="muted small">Obnovenie prepíše to, čo máš v tomto prehliadači teraz.</p>
	</section>
</div>

<style>
	.guide-again {
		margin: 16px 0 0;
	}
	.page {
		padding-top: 28px;
	}
	.lede {
		max-width: 44em;
		color: var(--ink-2);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.4rem;
		margin: 0 0 12px;
	}
	.block {
		margin: 28px 0;
	}
	.shelves,
	.collection-tools,
	.inline-form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.shelves {
		margin-bottom: 14px;
	}
	.collection-tools {
		margin-bottom: 14px;
	}
	.inline-form .field {
		min-width: 0;
		flex: 1 1 12em;
	}
	.inline-form input {
		min-width: 0;
		width: 100%;
	}
	.group-title {
		margin: 18px 0 10px;
		font-size: 1.1rem;
	}
	.danger {
		background: var(--tomato-soft);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}
	.two {
		display: grid;
		gap: 20px;
	}
	.box {
		padding: 20px;
	}
	.stats {
		margin: 0 0 10px;
		font-size: 0.92rem;
		color: var(--ink-2);
	}
	ul {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
	}
	.history li {
		display: grid;
		grid-template-columns: 6.5em 1fr auto;
		gap: 10px;
		padding: 7px 0;
		border-bottom: 1px dashed var(--line);
		font-size: 0.92rem;
	}
	a {
		color: var(--ink);
		font-weight: 650;
	}
	.rating {
		margin-left: 6px;
		padding: 0 6px;
		border-radius: 6px;
		font-size: 0.72rem;
		font-weight: 700;
		background: var(--paper-2);
		color: var(--ink-2);
	}
	.rating.r3 {
		background: var(--leaf-soft);
		color: var(--leaf);
	}
	.rating.r1 {
		background: var(--turmeric-soft);
	}
	.notes li {
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
	}
	.notes p {
		margin: 4px 0 0;
		white-space: pre-line;
		color: var(--ink-2);
		font-size: 0.92rem;
	}
	.weekbox {
		margin-bottom: 20px;
	}
	.backup {
		margin-top: 20px;
	}
	.backup-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.backup-actions label {
		cursor: pointer;
	}
	.backup-actions input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.backup-actions label:focus-within {
		outline: 3px solid var(--turmeric);
		outline-offset: 2px;
	}
	.msg {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--tomato-soft);
	}
	.msg.ok {
		background: var(--leaf-soft);
	}
	.small {
		font-size: 0.84rem;
	}
	@media (min-width: 900px) {
		.two {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
	}
</style>

<script lang="ts">
	import { backupFileName, exportBackup, importBackup } from '$lib/backup';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import SyncPanel from '$lib/components/SyncPanel.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { formatEur, formatNumber } from '$lib/amounts';
	import NutrientBars from '$lib/components/NutrientBars.svelte';
	import { DAILY_REFERENCE, VEGAN_PROTEIN_G_PER_KG } from '$lib/nutrition';
	import { RATING_LABELS, favorites, history, notes, settings, ui } from '$lib/state.svelte';
	import { onboarding } from '$lib/onboarding.svelte';
	import { weekSummary } from '$lib/week';

	const catalog = useCatalog();
	const dateFormat = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'long' });

	const favoriteRecipes = $derived(
		ui.loaded ? catalog.recipes.filter((r) => favorites.current[r.id]) : []
	);
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
	const targets = $derived({
		...DAILY_REFERENCE,
		protein: settings.current.weightKg
			? settings.current.weightKg * VEGAN_PROTEIN_G_PER_KG
			: DAILY_REFERENCE.protein
	});

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

<Seo title="Moje" description="Obľúbené recepty, história varenia, poznámky a záloha dát." />

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Moje</p>
		<h1>Moja kuchyňa</h1>
		<p class="lede">
			Obľúbené recepty, história varenia a tvoje poznámky. Všetko je uložené len v tomto
			prehliadači, bez účtu.
		</p>
	</header>

	<section class="block">
		<h2><Icon name="bookmark" size={24} /> Obľúbené</h2>
		{#if !ui.loaded}
			<p class="muted">Načítavam…</p>
		{:else if favoriteRecipes.length === 0}
			<p class="muted">Zatiaľ nič. Recept si uložíš ikonou záložky vedľa tlačidla „Do plánu“.</p>
		{:else}
			<div class="grid">
				{#each favoriteRecipes as recipe, i (recipe.id)}<RecipeCard {recipe} index={i} />{/each}
			</div>
		{/if}
	</section>

	{#if week && week.portions > 0}
		<section class="card box weekbox">
			<h2><Icon name="calendar" size={24} /> Posledných 7 dní</h2>
			<p class="stats">
				<strong>{formatNumber(week.portions, 0)}</strong>
				{week.portions < 1.5 ? 'porcia' : week.portions < 4.5 ? 'porcie' : 'porcií'} na osobu ·
				{formatEur(week.cost)} · ≈ {formatNumber(week.co2, 1)} kg CO₂e
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

<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ADMIN_ALERTS_KEY, kvGet } from '$lib/kv';
	import { pushEndpoint, remindersSupported, setAdminAlertsHere } from '$lib/reminders';
	import { onMount } from 'svelte';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';

	let { data } = $props();
	const catalog = useCatalog();

	let tab = $state<'feedback' | 'suggestions' | 'likes' | 'stats'>('feedback');
	let showDone = $state(false);

	const dateFormat = new Intl.DateTimeFormat('sk-SK', {
		day: 'numeric',
		month: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
	const when = (unix: number) => dateFormat.format(new Date(unix * 1000));
	const titleOf = (id: string) => catalog.recipesById.get(id)?.title ?? id;

	const newFeedback = $derived(data.feedback.filter((f) => f.status === 'new').length);
	const newSuggestions = $derived(data.suggestions.filter((s) => s.status === 'new').length);
	const feedback = $derived(
		showDone ? data.feedback : data.feedback.filter((f) => f.status === 'new')
	);
	const suggestions = $derived(
		showDone ? data.suggestions : data.suggestions.filter((s) => s.status === 'new')
	);
	// ── Outage alerts on this device ───────────────────────────
	let alertsHere = $state(false);
	let alertsBusy = $state(false);
	let alertsMessage = $state('');
	onMount(async () => {
		alertsHere = (await kvGet<boolean>(ADMIN_ALERTS_KEY).catch(() => false)) === true;
	});
	async function toggleAlerts() {
		alertsBusy = true;
		alertsMessage = '';
		try {
			const form = new FormData();
			form.set('endpoint', await pushEndpoint());
			form.set('on', alertsHere ? '0' : '1');
			const res = await fetch('?/alerts', {
				method: 'POST',
				body: form,
				headers: { 'x-sveltekit-action': 'true' }
			});
			if (!res.ok) throw new Error('Server zariadenie neprijal.');
			alertsHere = !alertsHere;
			await setAdminAlertsHere(alertsHere);
			await invalidateAll();
		} catch (err) {
			alertsMessage = err instanceof Error ? err.message : 'Nepodarilo sa.';
		} finally {
			alertsBusy = false;
		}
	}

	/** Recipes cooks had trouble with or rated low – the first to fix. */
	const toFix = $derived(
		data.perRecipe
			.filter((r) => r.problems > 0 || (r.rating !== null && r.rating < 3.5))
			.sort((a, b) => b.problems - a.problems || (a.rating ?? 5) - (b.rating ?? 5))
	);
	const dayOf = (unix: number) => new Date(unix * 1000).toLocaleDateString('sk-SK');

	/** Confirmed by a few cooks and not flagged: ready to be marked `tested`. */
	const readyToMark = $derived(
		data.perRecipe.filter(
			(r) => r.worked >= 2 && r.problems === 0 && !catalog.recipesById.get(r.recipe_id)?.tested
		)
	);
</script>

<svelte:head>
	<title>Admin · Receptio</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="wrap page">
	<header>
		<p class="eyebrow">Admin · {data.email}</p>
		<h1>Správa</h1>
	</header>

	<div class="tabs">
		<div class="segmented" role="group" aria-label="Sekcia">
			<button aria-pressed={tab === 'feedback'} onclick={() => (tab = 'feedback')}>
				Spätná väzba {#if newFeedback}<span class="count">{newFeedback}</span>{/if}
			</button>
			<button aria-pressed={tab === 'suggestions'} onclick={() => (tab = 'suggestions')}>
				Návrhy receptov {#if newSuggestions}<span class="count">{newSuggestions}</span>{/if}
			</button>
			<button aria-pressed={tab === 'likes'} onclick={() => (tab = 'likes')}> Lajky </button>
			<button aria-pressed={tab === 'stats'} onclick={() => (tab = 'stats')}>
				Štatistiky {#if toFix.length}<span class="count">{toFix.length}</span>{/if}
			</button>
		</div>
		{#if tab === 'feedback' || tab === 'suggestions'}
			<label class="check done-toggle">
				<input type="checkbox" bind:checked={showDone} /> ukázať aj vybavené
			</label>
		{/if}
	</div>

	{#if tab === 'feedback'}
		{#if readyToMark.length}
			<section class="card box ready">
				<h2 class="section-title"><Icon name="check" size={20} /> Pripravené na „Vyskúšané“</h2>
				<p class="muted small">
					Aspoň 2 potvrdenia a žiadna chyba. Napíš mi, ktoré označiť – doplním do receptu
					<code>tested</code>.
				</p>
				<ul>
					{#each readyToMark as r (r.recipe_id)}
						<li>
							<a href="/recepty/{r.recipe_id}">{titleOf(r.recipe_id)}</a> – {r.worked}× funguje
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if feedback.length === 0}
			<p class="empty">Nič nové.</p>
		{/if}
		<ul class="items">
			{#each feedback as f (f.id)}
				<li class="card item" class:done={f.status === 'done'}>
					<div class="row">
						<span class="badge {f.kind === 'worked' ? 'leaf' : 'turmeric'}">
							{f.kind === 'worked' ? 'Funguje' : 'Problém'}
						</span>
						<a href="/recepty/{f.recipe_id}"><strong>{titleOf(f.recipe_id)}</strong></a>
						<span class="muted small">{when(f.created_at)}</span>
					</div>
					{#if f.message}<p class="msg">{f.message}</p>{/if}
					<form method="POST" action="?/feedback" use:enhance>
						<input type="hidden" name="id" value={f.id} />
						<input type="hidden" name="status" value={f.status === 'new' ? 'done' : 'new'} />
						<button class="btn ghost small">
							{f.status === 'new' ? 'Vybavené' : 'Vrátiť medzi nové'}
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else if tab === 'suggestions'}
		{#if suggestions.length === 0}
			<p class="empty">Žiadne nové návrhy.</p>
		{/if}
		<ul class="items">
			{#each suggestions as s (s.id)}
				<li class="card item" class:done={s.status !== 'new'}>
					<details>
						<summary class="row">
							<strong>{s.title}</strong>
							{#if s.author}<span class="muted">od {s.author}</span>{/if}
							<span class="muted small">{when(s.created_at)}</span>
							{#if s.status !== 'new'}<span class="badge"
									>{s.status === 'added' ? 'pridaný' : 'zamietnutý'}</span
								>{/if}
						</summary>
						<h3>Suroviny</h3>
						<pre>{s.ingredients}</pre>
						<h3>Postup</h3>
						<pre>{s.steps}</pre>
						{#if s.note}<h3>Poznámka</h3>
							<pre>{s.note}</pre>{/if}
					</details>
					<form method="POST" action="?/suggestion" use:enhance class="actions">
						<input type="hidden" name="id" value={s.id} />
						{#if s.status === 'new'}
							<button class="btn leaf small" name="status" value="added">Pridaný</button>
							<button class="btn ghost small" name="status" value="rejected">Zamietnuť</button>
						{:else}
							<button class="btn ghost small" name="status" value="new">Vrátiť medzi nové</button>
						{/if}
					</form>
				</li>
			{/each}
		</ul>
		<p class="muted small">Recept z návrhu ti prepíšem do YAML – stačí napísať, ktorý.</p>
	{:else if tab === 'stats'}
		{#if data.status}
			<section class="card box health" class:down={!data.status.health.ok}>
				<h2 class="section-title">
					<Icon name={data.status.health.ok ? 'check' : 'alert'} size={20} />
					{data.status.health.ok ? 'API odpovedá' : 'API nefunguje'}
				</h2>
				<p class="small">
					{#if !data.status.health.ok && data.status.health.since}
						Od {when(data.status.health.since)}: {data.status.health.error}.
					{/if}
					{#if data.status.health.checkedAt}
						Posledná kontrola {when(data.status.health.checkedAt)} (cron každých 15 minút).
					{:else}
						Cron ešte nič nekontroloval.
					{/if}
				</p>
				{#if remindersSupported()}
					<button class="btn ghost small" disabled={alertsBusy} onclick={toggleAlerts}>
						<Icon name="bell" size={16} />
						{alertsHere
							? 'Vypnúť upozornenia na tomto zariadení'
							: 'Upozorniť ma pushom na výpadok'}
					</button>
				{/if}
				<p class="muted small">
					Upozornenia dostávajú {data.status.alertDevices}
					{data.status.alertDevices === 1 ? 'zariadenie' : 'zariadenia'}. Push príde raz za výpadok.
				</p>
				{#if alertsMessage}<p class="notice danger" role="alert">
						<Icon name="alert" size={18} />
						<span>{alertsMessage}</span>
					</p>{/if}
			</section>
		{/if}
		<dl class="stat-grid usage">
			<div class="stat">
				<dt>Synchronizácie a spoločné zoznamy</dt>
				<dd>{data.usage.sync}</dd>
			</div>
			<div class="stat">
				<dt>Pripomienky vody</dt>
				<dd>{data.usage.water}</dd>
			</div>
			<div class="stat">
				<dt>Pripomienky vitamínov</dt>
				<dd>{data.usage.supplements}</dd>
			</div>
			<div class="stat">
				<dt>Lajky</dt>
				<dd>{data.usage.likes} <small>z {data.usage.likers} zariadení</small></dd>
			</div>
			<div class="stat">
				<dt>Spätné väzby</dt>
				<dd>{data.usage.feedback}</dd>
			</div>
		</dl>

		<section class="card box">
			<h2 class="section-title"><Icon name="alert" size={20} /> Na opravu</h2>
			{#if toFix.length}
				<p class="muted small">Recepty s nahlásenou chybou alebo hodnotením pod 3,5 ★.</p>
				<table class="likes">
					<tbody>
						{#each toFix as r (r.recipe_id)}
							<tr>
								<td><a href="/recepty/{r.recipe_id}">{titleOf(r.recipe_id)}</a></td>
								<td class="n">{r.problems}× chyba</td>
								<td class="n"
									>{r.rating === null ? '–' : `${r.rating.toFixed(1)} ★ (${r.ratings})`}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="muted">Nič nahlásené.</p>
			{/if}
		</section>

		<section class="card box">
			<h2 class="section-title"><Icon name="star" size={20} /> Ako recepty vychádzajú</h2>
			<table class="likes">
				<thead
					><tr
						><th>Recept</th><th class="n">vyšlo</th><th class="n">chyba</th><th class="n">★</th></tr
					></thead
				>
				<tbody>
					{#each data.perRecipe as r (r.recipe_id)}
						<tr>
							<td><a href="/recepty/{r.recipe_id}">{titleOf(r.recipe_id)}</a></td>
							<td class="n">{r.worked}</td>
							<td class="n">{r.problems}</td>
							<td class="n">{r.rating === null ? '–' : `${r.rating.toFixed(1)} (${r.ratings})`}</td>
						</tr>
					{:else}
						<tr><td class="muted">Zatiaľ nikto nič nenahlásil.</td></tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="card box">
			<h2 class="section-title"><Icon name="search" size={20} /> Hľadali a nenašli</h2>
			<p class="muted small">
				Hľadania na Receptoch, ktoré nenašli žiadny recept ani bez filtrov. Kandidáti na nové
				recepty – stačí mi napísať, ktoré dopísať.
			</p>
			<table class="likes">
				<tbody>
					{#each data.misses as m (m.term)}
						<tr>
							<td><a href="/recepty?q={encodeURIComponent(m.term)}">{m.term}</a></td>
							<td class="n">{m.count}×</td>
							<td class="n muted">{dayOf(m.last_at)}</td>
						</tr>
					{:else}
						<tr><td class="muted">Zatiaľ nič.</td></tr>
					{/each}
				</tbody>
			</table>
		</section>
	{:else}
		<table class="likes">
			<tbody>
				{#each data.likes as l (l.recipe_id)}
					<tr>
						<td><a href="/recepty/{l.recipe_id}">{titleOf(l.recipe_id)}</a></td>
						<td class="n">{l.n}</td>
					</tr>
				{:else}
					<tr><td class="muted">Zatiaľ žiadne lajky.</td></tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.page {
		max-width: 900px;
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2) var(--sp-3);
		margin: var(--sp-2) 0 var(--sp-5);
	}
	.segmented {
		flex-wrap: wrap;
	}
	.count {
		display: inline-grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		margin-left: 2px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--alert-bg);
		color: var(--alert-ink);
		font-size: var(--fs-xs);
	}
	.done-toggle {
		margin-left: auto;
		font-size: var(--fs-sm);
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.item {
		padding: 14px 16px;
		display: grid;
		gap: 8px;
	}
	.item.done {
		opacity: 0.6;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.row a {
		color: var(--ink);
	}
	summary.row {
		cursor: pointer;
	}
	.msg {
		margin: 0;
		white-space: pre-line;
	}
	pre {
		white-space: pre-wrap;
		font: inherit;
		margin: 0 0 8px;
		padding: 10px;
		border-radius: var(--radius-xs);
		background: var(--paper);
	}
	h3 {
		font-size: var(--fs-md);
		margin: 10px 0 4px;
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.box {
		margin-bottom: var(--sp-4);
	}
	.section-title {
		font-size: var(--fs-lg);
	}
	.ready {
		background: var(--leaf-soft);
		border-color: transparent;
	}
	.likes {
		border-collapse: collapse;
		min-width: 320px;
	}
	.likes td {
		padding: 6px 12px 6px 0;
		border-bottom: 1px dashed var(--line);
	}
	.likes .n {
		text-align: right;
		font-weight: 700;
	}
	.usage {
		margin: 0 0 var(--sp-4);
	}
	.usage small {
		font-family: var(--font-body);
		font-size: var(--fs-xs);
		font-weight: 400;
		color: var(--muted);
	}
	.likes th {
		text-align: left;
		font-size: var(--fs-xs);
		color: var(--muted);
		font-weight: 600;
	}
	.health .section-title > :global(svg) {
		color: var(--leaf);
	}
	.health.down {
		border-color: var(--tomato);
	}
	.health.down .section-title > :global(svg) {
		color: var(--tomato);
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';

	let { data } = $props();
	const catalog = useCatalog();

	let tab = $state<'feedback' | 'suggestions' | 'likes'>('feedback');
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

	<div class="tabs" role="group" aria-label="Sekcia">
		<button class="chip" aria-pressed={tab === 'feedback'} onclick={() => (tab = 'feedback')}>
			Spätná väzba {#if newFeedback}<span class="count">{newFeedback}</span>{/if}
		</button>
		<button class="chip" aria-pressed={tab === 'suggestions'} onclick={() => (tab = 'suggestions')}>
			Návrhy receptov {#if newSuggestions}<span class="count">{newSuggestions}</span>{/if}
		</button>
		<button class="chip" aria-pressed={tab === 'likes'} onclick={() => (tab = 'likes')}>
			Lajky
		</button>
		{#if tab !== 'likes'}
			<label class="done-toggle">
				<input type="checkbox" bind:checked={showDone} /> ukázať aj vybavené
			</label>
		{/if}
	</div>

	{#if tab === 'feedback'}
		{#if readyToMark.length}
			<section class="card box ready">
				<h2><Icon name="check" size={20} /> Pripravené na „Vyskúšané“</h2>
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
			<p class="muted">Nič nové.</p>
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
			<p class="muted">Žiadne nové návrhy.</p>
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
		padding-top: 28px;
		max-width: 900px;
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 8px 0 20px;
	}
	.count {
		display: inline-grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--tomato);
		color: var(--paper);
		font-size: 0.75rem;
	}
	.done-toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
		font-size: 0.88rem;
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
		border-radius: 10px;
		background: var(--paper);
	}
	h3 {
		font-size: 0.95rem;
		margin: 10px 0 4px;
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.box {
		padding: 16px;
		margin-bottom: 16px;
	}
	.ready {
		background: var(--leaf-soft);
		border-color: transparent;
	}
	.ready h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.1rem;
		margin: 0 0 4px;
	}
	.small {
		font-size: 0.84rem;
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
</style>

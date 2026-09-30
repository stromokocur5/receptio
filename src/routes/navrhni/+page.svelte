<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { createChallenge } from '$lib/turnstile';
	import { SUGGESTION_LIMITS as L, suggestionProblem } from '$lib/suggestion';

	const DRAFT_KEY = 'receptio:suggestion-draft';

	let form = $state({ title: '', ingredients: '', steps: '', note: '', author: '', website: '' });
	let status = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
	let errorText = $state('');
	let needsClick = $state(false);
	let challengeBox: HTMLDivElement;
	let challenge: Promise<Awaited<ReturnType<typeof createChallenge>>> | null = null;

	/** Starts loading early; a failed load is retried on the next submit. */
	function loadChallenge() {
		challenge ??= createChallenge(challengeBox, 'suggest', {
			onInteractive: () => {
				needsClick = true;
				challengeBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
			},
			onInteractiveDone: () => (needsClick = false)
		}).catch((err) => {
			challenge = null;
			throw err;
		});
		return challenge;
	}

	onMount(() => {
		loadChallenge().catch(() => {
			// Retried on submit.
		});
		return () => {
			challenge?.then((c) => c.remove()).catch(() => {});
		};
	});

	onMount(() => {
		try {
			const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
			if (draft && typeof draft === 'object') {
				for (const key of ['title', 'ingredients', 'steps', 'note', 'author'] as const) {
					if (typeof draft[key] === 'string') form[key] = draft[key];
				}
			}
		} catch {
			// No draft to restore.
		}
	});

	function saveDraft() {
		try {
			const { website: _honeypot, ...draft } = form;
			localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
		} catch {
			// The form still works without a saved draft.
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const problem = suggestionProblem(form);
		if (problem) {
			errorText = problem;
			status = 'error';
			return;
		}
		status = 'sending';
		let turnstile: string;
		try {
			turnstile = await (await loadChallenge()).token();
		} catch {
			errorText = 'Nepodarilo sa overiť, že nie si robot. Návrh zostal uložený, skús to znova.';
			status = 'error';
			return;
		} finally {
			needsClick = false;
		}
		try {
			const res = await fetch('/api/suggestions', {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify({
					...form,
					note: form.note || undefined,
					author: form.author || undefined,
					website: form.website || undefined,
					turnstile
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				errorText = body?.message ?? 'Nepodarilo sa odoslať, skús to neskôr.';
				status = 'error';
				return;
			}
			status = 'sent';
			form = { title: '', ingredients: '', steps: '', note: '', author: '', website: '' };
			localStorage.removeItem(DRAFT_KEY);
		} catch {
			errorText = 'Si offline? Návrh zostal uložený, odošli ho neskôr.';
			status = 'error';
		}
	}
</script>

<Seo
	title="Navrhni recept"
	description="Máš recept, ktorý u vás mizne z taniera ako prvý? Pošli ho – skontrolujeme ho a dopočítame živiny aj cenu."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Komunita</p>
		<h1>Navrhni recept</h1>
		<p class="lede">
			Máš vegánsky recept, ktorý tu chýba? Pošli ho. Prečítam ho, vyskúšam, doplním suroviny do
			databázy a Receptio mu dopočíta živiny, cenu aj bezlepkovú verziu. Nič sa nezverejní
			automaticky.
		</p>
	</header>

	{#if status === 'sent'}
		<section class="card box sent">
			<Icon name="check" size={28} draw />
			<div>
				<h2>Ďakujem, návrh prišiel!</h2>
				<p>Keď recept pribudne, nájdeš ho medzi receptami.</p>
				<button class="btn ghost small" onclick={() => (status = 'idle')}>Poslať ďalší</button>
			</div>
		</section>
	{/if}
	<form
		class="card box"
		hidden={status === 'sent'}
		onsubmit={submit}
		oninput={saveDraft}
		novalidate
	>
		<label>
			<span>Názov receptu</span>
			<input
				bind:value={form.title}
				required
				minlength={L.title.min}
				maxlength={L.title.max}
				placeholder="Babkin lečo s tofu"
			/>
		</label>
		<label>
			<span>Suroviny <small>jedna na riadok, aj s množstvom</small></span>
			<textarea
				bind:value={form.ingredients}
				required
				minlength={L.ingredients.min}
				maxlength={L.ingredients.max}
				rows="7"
				placeholder={'400 g tofu\n2 cibule\n3 papriky\n1 PL sladkej papriky'}></textarea>
		</label>
		<label>
			<span>Postup</span>
			<textarea
				bind:value={form.steps}
				required
				minlength={L.steps.min}
				maxlength={L.steps.max}
				rows="8"
				placeholder={'1. Cibuľu nakrájaj a opeč dozlatista.\n2. …'}></textarea>
		</label>
		<label>
			<span>Poznámka <small>nepovinné – pre koľkých, ako dlho, odkiaľ recept je…</small></span>
			<textarea bind:value={form.note} maxlength={L.note.max} rows="3"></textarea>
		</label>
		<label>
			<span>Tvoje meno alebo prezývka <small>nepovinné, ak ťa máme pri recepte uviesť</small></span>
			<input bind:value={form.author} maxlength={L.author.max} autocomplete="nickname" />
		</label>
		<label class="hp" aria-hidden="true">
			Web
			<input bind:value={form.website} tabindex="-1" autocomplete="off" />
		</label>

		<div class="challenge" bind:this={challengeBox}></div>
		{#if needsClick}
			<p class="hint" role="status">Ešte klikni na overenie vyššie a návrh sa odošle.</p>
		{/if}
		{#if status === 'error'}
			<p class="err" role="alert"><Icon name="alert" size={18} /> {errorText}</p>
		{/if}
		<div class="submit">
			<button class="btn leaf" type="submit" disabled={status === 'sending'}>
				<Icon name="send" size={18} />
				{status === 'sending' ? 'Posielam…' : 'Poslať návrh'}
			</button>
			<p class="muted small">
				Rozpísaný návrh sa ukladá v tvojom prehliadači. Čo sa stane s odoslaným, nájdeš v
				<a href="/sukromie">ochrane súkromia</a>.
			</p>
		</div>
	</form>
</div>

<style>
	.page {
		padding-top: 28px;
		max-width: 820px;
	}
	.lede {
		color: var(--ink-2);
	}
	.box {
		padding: 22px;
	}
	form {
		display: grid;
		gap: 16px;
	}
	label {
		display: grid;
		gap: 6px;
		font-weight: 650;
	}
	label small {
		font-weight: 500;
		color: var(--muted);
	}
	input,
	textarea {
		width: 100%;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 10px 12px;
		font: inherit;
		font-weight: 400;
	}
	textarea {
		resize: vertical;
	}
	input:focus,
	textarea:focus {
		outline: none;
		border-color: var(--leaf-2);
	}
	.hp {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
	form[hidden] {
		display: none;
	}
	.challenge:empty {
		display: none;
	}
	.hint {
		margin: 0;
		color: var(--leaf);
		font-weight: 600;
	}
	.submit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.small {
		font-size: 0.84rem;
		margin: 0;
	}
	.err {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--tomato-soft);
	}
	.sent {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		color: var(--leaf);
	}
	.sent h2 {
		margin: 0 0 4px;
		color: var(--ink);
	}
	.sent p {
		color: var(--ink-2);
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { createChallenge } from '$lib/turnstile';
	import { SUGGESTION_LIMITS as L, suggestionProblem, type SuggestionField } from '$lib/suggestion';

	const DRAFT_KEY = 'receptio:suggestion-draft';

	let form = $state({ title: '', ingredients: '', steps: '', note: '', author: '', website: '' });
	let status = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
	let errorText = $state('');
	let needsClick = $state(false);
	/** What's wrong with each field, shown right under it after the first try to send. */
	let fieldErrors = $state<Partial<Record<SuggestionField, string>>>({});
	const REQUIRED = ['title', 'ingredients', 'steps'] as const;

	/** The shared check, one field at a time (the others filled with something valid). */
	function fieldProblem(field: SuggestionField): string | undefined {
		const valid = { title: 'xxx', ingredients: 'x'.repeat(10), steps: 'x'.repeat(10) };
		const problem = suggestionProblem({ ...valid, [field]: form[field] })?.replace(/^[^:]+: /, '');
		return problem && problem[0].toUpperCase() + problem.slice(1);
	}
	function checkFields(): boolean {
		const errors: typeof fieldErrors = {};
		for (const field of [...REQUIRED, 'note', 'author'] as const) {
			const problem = fieldProblem(field);
			if (problem) errors[field] = problem;
		}
		fieldErrors = errors;
		const first = Object.keys(errors)[0];
		if (first) document.getElementById(`s-${first}`)?.focus();
		return !first;
	}
	/** Once an error shows, it goes away as soon as the field is right. */
	function recheck(field: SuggestionField) {
		if (fieldErrors[field]) fieldErrors = { ...fieldErrors, [field]: fieldProblem(field) };
	}
	const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
	let challengeBox: HTMLDivElement;
	let challenge: Promise<Awaited<ReturnType<typeof createChallenge>>> | null = null;

	/** Starts loading early; a failed load is retried on the next submit. */
	function loadChallenge() {
		challenge ??= createChallenge(challengeBox, 'suggest', {
			onInteractive: () => {
				needsClick = true;
				challengeBox.scrollIntoView({
					block: 'center',
					behavior: reducedMotion() ? 'auto' : 'smooth'
				});
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
		if (!checkFields()) {
			status = 'idle';
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
	description="Máš recept, ktorý u vás mizne z taniera ako prvý? Pošli ho – skontrolujem ho a dopočítam živiny aj cenu."
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
		<p class="hint required-note">Polia s hviezdičkou (*) sú povinné.</p>
		{@render field('title', 'Názov receptu', '', 'Babkin lečo s tofu', 0)}
		{@render field(
			'ingredients',
			'Suroviny',
			'jedna na riadok, aj s množstvom',
			'400 g tofu\n2 cibule\n3 papriky\n1 PL sladkej papriky',
			7
		)}
		{@render field('steps', 'Postup', '', '1. Cibuľu nakrájaj a opeč dozlatista.\n2. …', 8)}
		{@render field(
			'note',
			'Poznámka',
			'nepovinné – pre koľkých, ako dlho, odkiaľ recept je…',
			'',
			3
		)}
		{@render field(
			'author',
			'Tvoje meno alebo prezývka',
			'nepovinné, ak ťa máme pri recepte uviesť',
			'',
			0
		)}
		<label class="hp" aria-hidden="true">
			Web
			<input bind:value={form.website} tabindex="-1" autocomplete="off" />
		</label>

		<div class="challenge" bind:this={challengeBox}></div>
		{#if needsClick}
			<p class="notice" role="status">
				<Icon name="info" size={18} /> Ešte klikni na overenie vyššie a návrh sa odošle.
			</p>
		{/if}
		{#if status === 'error'}
			<p class="notice danger" role="alert"><Icon name="alert" size={18} /> {errorText}</p>
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

{#snippet field(
	name: SuggestionField,
	label: string,
	note: string,
	placeholder: string,
	rows: number
)}
	{@const required = (REQUIRED as readonly string[]).includes(name)}
	<div class="row">
		<label for="s-{name}">
			{label}{#if required}<span class="req" aria-hidden="true"> *</span>{/if}
			{#if note}<small>{note}</small>{/if}
		</label>
		{#if rows}
			<textarea
				class="input"
				id="s-{name}"
				bind:value={form[name]}
				{required}
				aria-invalid={!!fieldErrors[name]}
				aria-describedby={fieldErrors[name] ? `s-${name}-err` : undefined}
				minlength={L[name].min || undefined}
				maxlength={L[name].max}
				{rows}
				{placeholder}
				oninput={() => recheck(name)}></textarea>
		{:else}
			<input
				class="input"
				id="s-{name}"
				bind:value={form[name]}
				{required}
				aria-invalid={!!fieldErrors[name]}
				aria-describedby={fieldErrors[name] ? `s-${name}-err` : undefined}
				minlength={L[name].min || undefined}
				maxlength={L[name].max}
				{placeholder}
				autocomplete={name === 'author' ? 'nickname' : 'off'}
				oninput={() => recheck(name)}
			/>
		{/if}
		{#if fieldErrors[name]}
			<p class="field-err" id="s-{name}-err">
				<Icon name="alert" size={16} />
				{fieldErrors[name]}
			</p>
		{/if}
	</div>
{/snippet}

<style>
	.page {
		max-width: 820px;
	}
	form {
		display: grid;
		gap: 16px;
	}
	.required-note {
		margin: 0;
	}
	.row {
		display: grid;
		gap: 6px;
	}
	label {
		font-weight: 650;
	}
	label small {
		display: block;
		font-weight: 500;
		font-size: var(--fs-sm);
		color: var(--muted);
	}
	.req {
		color: var(--tomato);
	}
	.input {
		width: 100%;
	}
	.input[aria-invalid='true'] {
		border-color: var(--tomato);
	}
	.field-err {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-size: var(--fs-sm);
		font-weight: 600;
		color: color-mix(in srgb, var(--tomato) 75%, var(--ink));
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
	.notice {
		margin: 0;
	}
	.submit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.submit .small {
		margin: 0;
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

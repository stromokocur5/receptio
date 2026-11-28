<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { createChallenge } from '$lib/turnstile';

	let {
		recipeId,
		taste
	}: {
		recipeId: string;
		/**
		 * Cooking mode already asked "Ako chutilo?" (1–3); then that answer goes along and the
		 * stars aren't shown, so nobody rates the same dinner twice.
		 */
		taste?: 1 | 2 | 3 | null;
	} = $props();
	/** Výborné / Dobré / Nabudúce inak on the shared five-star scale. */
	const TASTE_STARS = { 3: 5, 2: 4, 1: 2 } as const;

	const SENT_KEY = 'receptio:feedback-sent';

	let mode = $state<'idle' | 'problem' | 'sending' | 'sent' | 'error'>('idle');
	let sentKind = $state<'worked' | 'problem' | null>(null);
	let message = $state('');
	let rating = $state(0);
	let errorText = $state('');
	let challengeBox: HTMLDivElement;
	let challenge: Awaited<ReturnType<typeof createChallenge>> | null = null;

	function readSent(): Record<string, string> {
		try {
			return JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}') ?? {};
		} catch {
			return {};
		}
	}

	onMount(() => {
		const kind = readSent()[recipeId];
		if (kind === 'worked' || kind === 'problem') sentKind = kind;
		return () => challenge?.remove();
	});

	/** Turnstile loads only when someone actually sends feedback. */
	async function humanToken(): Promise<string> {
		challenge ??= await createChallenge(challengeBox, 'feedback');
		return challenge.token();
	}

	async function send(kind: 'worked' | 'problem') {
		mode = 'sending';
		let turnstile: string;
		try {
			turnstile = await humanToken();
		} catch {
			errorText = 'Nepodarilo sa overiť, že nie si robot. Skús to znova.';
			mode = 'error';
			return;
		}
		try {
			const res = await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify({
					recipeId,
					kind,
					message: message.trim() || undefined,
					rating: (taste === undefined ? rating : taste && TASTE_STARS[taste]) || undefined,
					turnstile
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				errorText = body?.message ?? 'Nepodarilo sa odoslať, skús to neskôr.';
				mode = 'error';
				return;
			}
			sentKind = kind;
			mode = 'sent';
			message = '';
			rating = 0;
			try {
				localStorage.setItem(SENT_KEY, JSON.stringify({ ...readSent(), [recipeId]: kind }));
			} catch {
				// Only hides the buttons next time; nothing else depends on it.
			}
		} catch {
			errorText = 'Si offline? Skús to znova, keď budeš online.';
			mode = 'error';
		}
	}
</script>

<div class="feedback" data-noprint>
	{#if mode === 'sent' || (sentKind && mode === 'idle')}
		<p class="done">
			<Icon name="check" size={18} />
			{sentKind === 'worked'
				? 'Ďakujem! Keď recept potvrdí viac ľudí, dostane odznak Vyskúšané.'
				: 'Ďakujem, chybu opravím.'}
			{#if mode === 'idle'}
				<button class="btn-link quiet" onclick={() => (sentKind = null)}>Poslať ďalšiu</button>
			{/if}
		</p>
	{:else}
		<p class="title">
			{taste === undefined ? 'Po uvarení: pomôž recept overiť' : 'Pomôž recept overiť'}
		</p>
		{#if taste === undefined}
			<div class="stars" role="radiogroup" aria-label="Ako chutilo (nepovinné)">
				<span class="muted small">Ako chutilo?</span>
				{#each [1, 2, 3, 4, 5] as star (star)}
					<button
						type="button"
						role="radio"
						class:on={star <= rating}
						aria-checked={star === rating}
						aria-label="{star} z 5"
						onclick={() => (rating = rating === star ? 0 : star)}
					>
						<Icon name="star" size={22} />
					</button>
				{/each}
			</div>
		{/if}
		<div class="buttons">
			<button class="btn ghost small" disabled={mode === 'sending'} onclick={() => send('worked')}>
				<Icon name="check" size={16} /> Funguje, ako je napísané
			</button>
			<button
				class="btn ghost small"
				aria-expanded={mode === 'problem'}
				onclick={() => (mode = mode === 'problem' ? 'idle' : 'problem')}
			>
				<Icon name="alert" size={16} /> Niečo nesedí
			</button>
		</div>
		{#if mode === 'problem' || (mode === 'error' && message)}
			<textarea
				class="input"
				aria-label="Čo nesedí"
				bind:value={message}
				rows="3"
				maxlength="2000"
				placeholder="Napr. „2. krok trval 20 minút, nie 8“ alebo „málo soli“."></textarea>
			<button
				class="btn leaf small"
				disabled={message.trim().length < 5}
				onclick={() => send('problem')}
			>
				<Icon name="send" size={16} /> Poslať
			</button>
		{/if}
		{#if mode === 'error'}
			<p class="notice danger" role="alert"><Icon name="alert" size={18} /> {errorText}</p>
		{/if}
	{/if}
	<div class="challenge" bind:this={challengeBox}></div>
</div>

<style>
	.feedback {
		display: grid;
		gap: 10px;
		padding: 14px 16px;
		border-radius: var(--radius-sm);
		border: 1.5px dashed var(--line);
	}
	.title {
		margin: 0;
		font-weight: 650;
	}
	.stars {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.stars .muted {
		margin-right: 6px;
	}
	.stars button {
		display: grid;
		place-items: center;
		width: 38px;
		height: var(--tap);
		border: 0;
		border-radius: 50%;
		background: none;
		color: color-mix(in srgb, var(--muted) 55%, transparent);
	}
	.stars button.on {
		color: var(--turmeric);
	}
	.stars button.on :global(svg) {
		fill: currentColor;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	textarea {
		width: 100%;
	}
	.feedback > .btn {
		justify-self: start;
	}
	.done {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: var(--leaf);
		font-weight: 600;
	}

	.challenge:empty {
		display: none;
	}
	.notice {
		margin: 0;
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import {
		connectSync,
		disableSync,
		enableSync,
		formatCode,
		isPersisted,
		pushNow,
		requestPersistence,
		syncState
	} from '$lib/sync.svelte';

	let codeInput = $state('');
	let connectError = $state('');
	let busy = $state(false);
	let copied = $state(false);
	let persisted = $state<boolean | null>(null);

	const time = new Intl.DateTimeFormat('sk-SK', {
		day: 'numeric',
		month: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	/** What Receptio keeps in this browser (plan, pantry, diary…), in kB. */
	let usedKb = $state<number | null>(null);

	onMount(() => {
		void isPersisted().then((p) => (persisted = p));
		try {
			let chars = 0;
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key?.startsWith('receptio:'))
					chars += key.length + (localStorage.getItem(key)?.length ?? 0);
			}
			usedKb = Math.max(1, Math.round(chars / 1024));
		} catch {
			usedKb = null;
		}
	});

	async function run(action: () => Promise<unknown>) {
		busy = true;
		try {
			await action();
		} finally {
			busy = false;
		}
	}

	async function connect() {
		await run(async () => {
			connectError = (await connectSync(codeInput)) ?? '';
			if (!connectError) codeInput = '';
		});
	}

	async function copy() {
		if (!syncState.code) return;
		try {
			await navigator.clipboard.writeText(formatCode(syncState.code));
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// The code is on screen to copy by hand.
		}
	}

	async function protect() {
		persisted = await requestPersistence();
	}
</script>

<section class="card box sync">
	<h2 class="section-title"><Icon name="shield" size={24} /> Synchronizácia bez účtu</h2>

	{#if !syncState.code}
		<p>
			Zapni synchronizáciu a dostaneš <strong>kód na obnovenie</strong>. Zmeny sa potom samy
			zálohujú a kódom si dáta otvoríš na inom telefóne alebo po vymazaní prehliadača. Nepotrebuješ
			e-mail ani heslo.
		</p>
		<p class="hint">
			Dáta sa zašifrujú priamo v tvojom prehliadači – na server ide len šifra, ktorú bez kódu nikto
			neprečíta, ani správca. <a href="/sukromie">Viac o súkromí</a>
		</p>
		<div class="actions">
			<button class="btn leaf" disabled={busy} onclick={() => run(enableSync)}>
				<Icon name="shield" size={18} /> Zapnúť a vytvoriť kód
			</button>
		</div>
		<!-- Enter in the field presses the button, which asks first: replacing data can't be undone. -->
		<form class="connect" onsubmit={(e) => e.preventDefault()}>
			<label for="sync-code">Máš už kód z iného zariadenia?</label>
			<div class="row">
				<input
					id="sync-code"
					class="input"
					bind:value={codeInput}
					placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
				/>
				<ConfirmButton
					confirm="Áno, nahradiť"
					why="Dáta v tomto prehliadači sa nahradia tými zo zálohy."
					disabled={busy || !codeInput.trim()}
					onconfirm={connect}>Pripojiť</ConfirmButton
				>
			</div>
			{#if connectError}<p class="notice danger" role="alert">
					<Icon name="alert" size={18} />
					{connectError}
				</p>{/if}
		</form>
	{:else}
		<p>Tvoj kód na obnovenie:</p>
		<div class="code-row">
			<code class="code">{formatCode(syncState.code)}</code>
			<button class="btn ghost small" onclick={copy}>
				<Icon name={copied ? 'check' : 'copy'} size={16} />
				{copied ? 'Skopírované' : 'Kopírovať'}
			</button>
		</div>
		<p class="hint">
			Ulož si ho do správcu hesiel alebo si ho odfoť. Bez neho sa k dátam nedostane nikto – ani ty,
			ani správca. Kto ho má, vidí tvoju špajzu, plán a poznámky.
		</p>

		<p class="status" role="status">
			{#if syncState.status === 'syncing'}
				<Icon name="timer" size={18} /> Synchronizujem…
			{:else if syncState.status === 'error'}
				<Icon name="alert" size={18} /> {syncState.message}
			{:else if syncState.syncedAt}
				<Icon name="check" size={18} /> Uložené {time.format(new Date(syncState.syncedAt * 1000))}
			{:else}
				<Icon name="info" size={18} /> Zatiaľ neuložené.
			{/if}
		</p>

		<div class="actions">
			<button class="btn ghost small" disabled={busy} onclick={() => run(pushNow)}>
				<Icon name="upload" size={16} /> Synchronizovať teraz
			</button>
			<button class="btn ghost small" disabled={busy} onclick={() => run(() => disableSync(false))}>
				Vypnúť na tomto zariadení
			</button>
			<ConfirmButton
				small
				icon="trash"
				confirm="Áno, zmazať"
				why="Záloha zo servera zmizne a kód prestane platiť. Dáta v tomto prehliadači ostanú."
				disabled={busy}
				onconfirm={() => void run(() => disableSync(true))}>Zmazať zo servera</ConfirmButton
			>
		</div>
	{/if}

	<p class="persist hint">
		{#if usedKb !== null}
			Tvoje dáta tu zaberajú {usedKb >= 1024
				? `${(usedKb / 1024).toFixed(1).replace('.', ',')} MB`
				: `${usedKb} kB`} z približne 5 MB.
		{/if}
		{#if persisted}
			Prehliadač ich sám nezmaže ani pri nedostatku miesta.
		{:else if persisted === false}
			Bez ochrany ich môže prehliadač pri nedostatku miesta upratať –
			<button class="btn-link" onclick={protect}>požiadať ho, aby ich nemazal</button>.
		{/if}
	</p>
</section>

<style>
	.sync {
		margin-top: var(--sp-5);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--sp-2);
		margin: var(--sp-3) 0;
	}
	.connect {
		display: grid;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}
	.connect label {
		font-weight: 650;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--sp-2);
	}
	.row .input {
		flex: 1 1 240px;
		min-width: 0;
		font-family: ui-monospace, monospace;
		letter-spacing: 0.05em;
	}
	.code-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.code {
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		background: var(--sunk);
		word-break: break-all;
	}
	.status {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin: var(--sp-3) 0 0;
	}
	.persist {
		margin-top: var(--sp-4);
	}
</style>

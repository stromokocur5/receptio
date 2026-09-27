<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import {
		connectSync,
		disableSync,
		enableSync,
		formatCode,
		isPersisted,
		pushNow,
		requestPersistence,
		resolveConflict,
		syncState
	} from '$lib/sync.svelte';

	let codeInput = $state('');
	let connectError = $state('');
	let confirmConnect = $state(false);
	let confirmDelete = $state(false);
	let busy = $state(false);
	let copied = $state(false);
	let persisted = $state<boolean | null>(null);

	const time = new Intl.DateTimeFormat('sk-SK', {
		day: 'numeric',
		month: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	onMount(() => {
		void isPersisted().then((p) => (persisted = p));
	});

	async function run(action: () => Promise<unknown>) {
		busy = true;
		try {
			await action();
		} finally {
			busy = false;
		}
	}

	async function connect(event: SubmitEvent) {
		event.preventDefault();
		if (!confirmConnect) {
			confirmConnect = true;
			return;
		}
		await run(async () => {
			connectError = (await connectSync(codeInput)) ?? '';
			if (!connectError) codeInput = '';
			confirmConnect = false;
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
	<h2><Icon name="shield" size={24} /> Synchronizácia bez účtu</h2>

	{#if !syncState.code}
		<p>
			Zapni synchronizáciu a dostaneš <strong>kód na obnovenie</strong>. Zmeny sa potom samy
			zálohujú a kódom si dáta otvoríš na inom telefóne alebo po vymazaní prehliadača. Nepotrebuješ
			e-mail ani heslo.
		</p>
		<p class="muted small">
			Dáta sa zašifrujú priamo v tvojom prehliadači – na server ide len šifra, ktorú bez kódu nikto
			neprečíta, ani my. <a href="/sukromie">Viac o súkromí</a>
		</p>
		<div class="actions">
			<button class="btn leaf" disabled={busy} onclick={() => run(enableSync)}>
				<Icon name="shield" size={18} /> Zapnúť a vytvoriť kód
			</button>
		</div>
		<form class="connect" onsubmit={connect}>
			<label for="sync-code">Máš už kód z iného zariadenia?</label>
			<div class="row">
				<input
					id="sync-code"
					bind:value={codeInput}
					placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					oninput={() => (confirmConnect = false)}
				/>
				<button class="btn ghost" type="submit" disabled={busy || !codeInput.trim()}>
					{confirmConnect ? 'Áno, nahradiť' : 'Pripojiť'}
				</button>
			</div>
			{#if confirmConnect}
				<p class="msg" role="alert">
					<Icon name="alert" size={18} /> Dáta v tomto prehliadači sa nahradia tými zo zálohy. Potvrď
					ešte raz.
				</p>
			{/if}
			{#if connectError}<p class="msg" role="alert">
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
		<p class="muted small">
			Ulož si ho do správcu hesiel alebo si ho odfoť. Bez neho sa k dátam nedostane nikto – ani ty,
			ani my. Kto ho má, vidí tvoju špajzu, plán a poznámky.
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

		{#if syncState.status === 'conflict'}
			<div class="conflict">
				<p>
					<strong>Na inom zariadení sú novšie zmeny</strong> a v tomto prehliadači si medzitým tiež niečo
					zmenil/a. Ktoré dáta chceš ponechať?
				</p>
				<div class="actions">
					<button
						class="btn leaf"
						disabled={busy}
						onclick={() => run(() => resolveConflict('remote'))}>Z iného zariadenia</button
					>
					<button
						class="btn ghost"
						disabled={busy}
						onclick={() => run(() => resolveConflict('local'))}>Tieto tu</button
					>
				</div>
			</div>
		{/if}

		<div class="actions">
			<button class="btn ghost small" disabled={busy} onclick={() => run(pushNow)}>
				<Icon name="upload" size={16} /> Synchronizovať teraz
			</button>
			<button class="btn ghost small" disabled={busy} onclick={() => run(() => disableSync(false))}>
				Vypnúť na tomto zariadení
			</button>
			<button
				class="btn ghost small danger"
				disabled={busy}
				onclick={() => {
					if (confirmDelete) void run(() => disableSync(true));
					confirmDelete = !confirmDelete;
				}}
			>
				<Icon name="trash" size={16} />
				{confirmDelete ? 'Naozaj zmazať zo servera?' : 'Zmazať zo servera'}
			</button>
		</div>
	{/if}

	<p class="persist small">
		{#if persisted}
			<Icon name="check" size={16} /> Prehliadač tieto dáta sám nezmaže ani pri nedostatku miesta.
		{:else if persisted === false}
			<button class="linkish" onclick={protect}>Požiadať prehliadač, aby dáta nemazal</button>
			<span class="muted"> – bez toho ich môže pri nedostatku miesta upratať.</span>
		{/if}
	</p>
</section>

<style>
	.sync {
		margin-top: 20px;
		padding: 22px;
	}
	.sync h2 {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin: 12px 0;
	}
	.connect {
		display: grid;
		gap: 8px;
		margin-top: 16px;
	}
	.connect label {
		font-weight: 650;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.row input {
		flex: 1 1 240px;
		min-width: 0;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 10px 12px;
		font: inherit;
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
		background: var(--paper-2);
		word-break: break-all;
	}
	.status,
	.persist {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
	}
	.conflict {
		padding: 14px;
		border-radius: var(--radius-sm);
		background: var(--turmeric-soft);
	}
	.msg {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--tomato-soft);
	}
	.linkish {
		border: 0;
		padding: 0;
		background: none;
		color: var(--leaf);
		font: inherit;
		font-weight: 650;
		text-decoration: underline;
		cursor: pointer;
	}
	.danger {
		color: var(--tomato);
	}
	.small {
		font-size: 0.86rem;
	}
</style>

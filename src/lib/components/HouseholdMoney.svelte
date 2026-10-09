<script lang="ts">
	import { formatEur } from '$lib/amounts';
	import Icon from '$lib/components/Icon.svelte';
	import { expensesOf, householdBalances, isAway, settleUp } from '$lib/household';
	import { localToday } from '$lib/journal';
	import {
		addExpense,
		household,
		members,
		moneyOn,
		removeExpense,
		setMoney
	} from '$lib/household.svelte';

	const SHOWN = 8;

	const list = $derived(members());
	/** Someone who left still shows by name, so their old payments and debts make sense. */
	const nameOf = (id: string) => {
		const m = household.doc?.members[id];
		return !m ? 'bývalý člen' : m.removed ? `${m.name} (už nie je v domácnosti)` : m.name;
	};
	const expenses = $derived(household.doc ? expensesOf(household.doc) : []);
	const owed = $derived(household.doc ? householdBalances(household.doc, list) : new Map());
	const summedUp = $derived(Object.keys(household.doc?.settled ?? {}).length);
	const paybacks = $derived(settleUp(owed));
	let showAll = $state(false);

	let by = $state(household.me ?? '');
	let amount = $state('');
	let note = $state('');
	/**
	 * Who shares this one; starts as whoever is home today and has their own phone (a child's
	 * profile is added by hand), or everyone at home when nobody has.
	 */
	const today = localToday();
	let shares = $state<string[] | null>(null);
	const home = $derived(list.filter((m) => !isAway(m, today)));
	const sharing = $derived(
		shares ?? (home.some((m) => m.owner) ? home.filter((m) => m.owner) : home).map((m) => m.id)
	);
	function toggleShare(id: string) {
		const now = sharing.includes(id) ? sharing.filter((x) => x !== id) : [...sharing, id];
		if (now.length) shares = now;
	}
	const sharedBy = (ids: string[] | undefined) =>
		!ids || list.every((m) => ids.includes(m.id)) ? '' : ids.map(nameOf).join(', ');
	const date = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric' });

	function add(event: SubmitEvent) {
		event.preventDefault();
		const value = Number(amount.replace(',', '.'));
		if (!by || !(value > 0) || value > 10_000) return;
		addExpense({ by, amount: value, note, for: sharing });
		amount = '';
		note = '';
		shares = null;
	}
</script>

{#if !moneyOn()}
	<p>
		Nepovinné. Kto chce, môže si tu zapisovať, kto koľko zaplatil za nákup, a Receptio spočíta, kto
		komu koľko dlží. Kým to nezapnete, nič sa nepočíta – ani nákupy z nákupného zoznamu.
	</p>
	<button class="btn ghost" onclick={() => setMoney(true)}>
		<Icon name="euro" size={18} /> Zapnúť počítanie výdavkov
	</button>
{:else if list.length < 2}
	<p class="muted">Keď vás bude viac, uvidíš tu, kto koľko zaplatil a kto komu dlží.</p>
{:else}
	{#if paybacks.length}
		<ul class="paybacks">
			{#each paybacks as p (p.from + p.to)}
				<li>
					<span><strong>{nameOf(p.from)}</strong> → <strong>{nameOf(p.to)}</strong></span>
					<strong class="sum">{formatEur(p.amount)}</strong>
					<button
						class="btn ghost small"
						onclick={() =>
							addExpense({ by: p.from, to: p.to, amount: p.amount, note: 'Vyrovnanie' })}
						>Vyrovnané</button
					>
				</li>
			{/each}
		</ul>
	{:else if expenses.length}
		<p><Icon name="check" size={18} /> Ste si kvit.</p>
	{/if}

	<form class="add" onsubmit={add}>
		<label>
			Kto platil
			<select bind:value={by} required>
				<option value="" disabled>Vyber</option>
				{#each list as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
			</select>
		</label>
		<label>
			Koľko €
			<input class="amount" bind:value={amount} inputmode="decimal" placeholder="0,00" required />
		</label>
		<label class="grow">
			Za čo
			<input bind:value={note} maxlength="60" placeholder="Napr. Lidl, olej a ryža" />
		</label>
		<fieldset class="grow shares">
			<legend>Za koho</legend>
			{#each list as m (m.id)}
				<label class="chip">
					<input
						type="checkbox"
						checked={sharing.includes(m.id)}
						onchange={() => toggleShare(m.id)}
					/>
					{m.name}
				</label>
			{/each}
		</fieldset>
		<button class="btn leaf" type="submit" disabled={!by || !amount.trim()}>
			<Icon name="plus" size={18} /> Zapísať
		</button>
	</form>
	<p class="hint">
		Delí sa rovnakým dielom medzi tých, za koho sa platilo – kto je preč, nákup v tom čase neplatí.
		Kto pri nákupe ťukne „Nakúpené → do špajze“ a vybral si, ktorý člen je, má nákup zapísaný sám.
	</p>

	{#if expenses.length}
		<ul class="expenses">
			{#each showAll ? expenses : expenses.slice(0, SHOWN) as e (e.id)}
				<li>
					<span class="when">{date.format(new Date(`${e.date}T12:00`))}</span>
					<span class="what">
						<strong>{nameOf(e.by)}</strong>
						{#if e.to}→ {nameOf(e.to)}{/if}
						{#if e.note}<span class="muted">· {e.note}</span>{/if}
						{#if sharedBy(e.for)}<span class="muted">· za {sharedBy(e.for)}</span>{/if}
					</span>
					<span class="sum">{formatEur(e.amount)}</span>
					<button
						class="remove"
						aria-label="Zmazať platbu {formatEur(e.amount)}"
						onclick={() => removeExpense(e.id)}
					>
						<Icon name="x" size={14} />
					</button>
				</li>
			{/each}
		</ul>
		{#if summedUp}
			<p class="hint">
				Výdavky staršie ako rok sú zhrnuté po mesiacoch – v súčtoch hore ostávajú, jednotlivo sa už
				neukazujú.
			</p>
		{/if}
		{#if expenses.length > SHOWN}
			<button class="btn ghost small" onclick={() => (showAll = !showAll)}>
				{showAll ? 'Menej' : `Všetky (${expenses.length})`}
			</button>
		{/if}
	{/if}
{/if}
{#if moneyOn()}
	<button class="off" onclick={() => setMoney(false)}>
		Vypnúť počítanie výdavkov (zapísané platby ostanú)
	</button>
{/if}

<style>
	.paybacks,
	.expenses {
		display: grid;
		gap: 6px;
		padding: 0;
		margin: 12px 0;
		list-style: none;
	}
	.paybacks li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--paper-2);
	}
	.paybacks span {
		flex: 1 1 160px;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 10px;
		margin-top: 12px;
	}
	.add label {
		display: grid;
		gap: 4px;
		font-weight: 650;
		font-size: 0.9rem;
	}
	.add .amount {
		width: 7em;
	}
	.grow {
		flex: 1 1 180px;
	}
	.shares {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		border: 0;
		margin: 0;
		padding: 0;
	}
	.shares legend {
		font-weight: 650;
		font-size: 0.9rem;
		margin-bottom: 4px;
	}
	.add .shares label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 500;
	}
	.shares input {
		padding: 0;
		accent-color: var(--leaf);
	}
	input,
	select {
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 9px 10px;
		font: inherit;
		min-width: 0;
	}
	.hint {
		margin: 8px 0 0;
		color: var(--muted);
		font-size: 0.86rem;
	}
	.expenses li {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: 10px;
		font-size: 0.92rem;
	}
	.when {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.what {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.sum {
		font-variant-numeric: tabular-nums;
	}
	.remove {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.off {
		display: block;
		margin-top: 14px;
		border: 0;
		padding: 0;
		background: none;
		color: var(--ink-2);
		font: inherit;
		font-size: 0.86rem;
		text-decoration: underline;
		cursor: pointer;
	}
	.remove:hover {
		background: var(--tomato-soft);
		color: var(--tomato);
	}
</style>

<script lang="ts">
	import { formatEur } from '$lib/amounts';
	import { toast } from '$lib/toast.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { expensesOf, householdBalances, isAway, settleUp } from '$lib/household';
	import { localToday } from '$lib/journal';
	import {
		addExpense,
		household,
		members,
		moneyOn,
		removeExpense,
		restoreExpense,
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
	function remove(id: string) {
		const gone = removeExpense(id);
		if (gone) toast(`Platba ${formatEur(gone.amount)} zmazaná`, () => restoreExpense(id, gone));
	}

	function toggleShare(id: string) {
		const now = sharing.includes(id) ? sharing.filter((x) => x !== id) : [...sharing, id];
		if (now.length) shares = now;
	}
	const sharedBy = (ids: string[] | undefined) =>
		// Names stay in the nominative ("delia sa: Ema, Jano"); "za Ema" would need declining them.
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
		Kto chce, môže si tu zapisovať, kto koľko zaplatil za nákup, a Receptio spočíta, kto komu koľko
		dlží. Kým to nezapnete, nič sa nepočíta – ani nákupy z nákupného zoznamu.
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
				<li class="sunk">
					<span class="who"
						><strong>{nameOf(p.from)}</strong> → <strong>{nameOf(p.to)}</strong></span
					>
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
		<p class="notice ok"><Icon name="check" size={18} /> Ste si kvit.</p>
	{/if}

	<form class="add" onsubmit={add}>
		<label>
			Kto platil
			<select class="input" bind:value={by} required>
				<option value="" disabled>Vyber</option>
				{#each list as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
			</select>
		</label>
		<label>
			Koľko €
			<input
				class="input amount"
				bind:value={amount}
				inputmode="decimal"
				placeholder="0,00"
				required
			/>
		</label>
		<label class="grow">
			Za čo
			<input class="input" bind:value={note} maxlength="60" placeholder="Napr. Lidl, olej a ryža" />
		</label>
		<fieldset class="shares">
			<legend>Za koho</legend>
			<div class="chips">
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
			</div>
		</fieldset>
		<button class="btn leaf" type="submit" disabled={!by || !amount.trim()}>
			<Icon name="plus" size={18} /> Zapísať
		</button>
	</form>
	<p class="hint">
		Delí sa rovnakým dielom medzi tých, za koho sa platilo – kto je preč, nákup v tom čase neplatí.
		Nákup odškrtnutý cez „Nakúpené → do špajze“ sa zapíše sám tomu, kto si v domácnosti vybral svoj
		profil.
	</p>

	{#if expenses.length}
		<ul class="expenses divided">
			{#each showAll ? expenses : expenses.slice(0, SHOWN) as e (e.id)}
				<li>
					<span class="when">{date.format(new Date(`${e.date}T12:00`))}</span>
					<span class="what">
						<strong>{nameOf(e.by)}</strong>
						{#if e.to}→ {nameOf(e.to)}{/if}
						{#if e.note}<span class="muted">· {e.note}</span>{/if}
						{#if sharedBy(e.for)}<span class="muted">· delia sa: {sharedBy(e.for)}</span>{/if}
					</span>
					<span class="sum">{formatEur(e.amount)}</span>
					<span class="remove">
						<button
							class="icon-btn plain"
							aria-label="Zmazať platbu {formatEur(e.amount)}"
							onclick={() => remove(e.id)}><Icon name="trash" size={16} /></button
						>
					</span>
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
	<p class="off">
		<button class="btn-link quiet" onclick={() => setMoney(false)}>
			Vypnúť počítanie výdavkov
		</button>
		<span class="muted">(zapísané platby ostanú)</span>
	</p>
{/if}

<style>
	.paybacks {
		display: grid;
		gap: var(--sp-2);
		padding: 0;
		margin: var(--sp-3) 0;
		list-style: none;
	}
	.paybacks li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2) var(--sp-3);
		padding: 10px var(--sp-3);
	}
	.paybacks .who {
		flex: 1 1 160px;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}
	.add > label {
		display: grid;
		gap: 4px;
		font-weight: 650;
		font-size: var(--fs-sm);
	}
	/* Labels are small; the boxes keep body size (smaller text zooms the page on iPhone). */
	.add .input {
		font-size: var(--fs-base);
	}
	.add .amount {
		width: 7em;
	}
	.grow {
		flex: 1 1 180px;
	}
	.grow .input {
		width: 100%;
	}
	.shares {
		flex: 1 1 100%;
		min-width: 0;
		border: 0;
		margin: 0;
		padding: 0;
	}
	.shares legend {
		padding: 0;
		margin-bottom: 4px;
		font-weight: 650;
		font-size: var(--fs-sm);
	}
	.shares .chip {
		cursor: pointer;
	}
	.expenses {
		margin: var(--sp-3) 0;
	}
	.expenses li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 10px;
		padding: 6px 0;
		font-size: var(--fs-md);
	}
	.when {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.what {
		flex: 1 1 10em;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.sum {
		font-variant-numeric: tabular-nums;
	}
	/* Asking "Zmazať?" needs room: then it wraps onto its own line. */
	.remove {
		margin-left: auto;
	}
	.off {
		margin: var(--sp-4) 0 0;
		font-size: var(--fs-sm);
	}
</style>

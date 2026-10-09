<script lang="ts">
	import { afterNavigate, replaceState } from '$app/navigation';
	import { shortName } from '$lib/avoid';
	import { useCatalog } from '$lib/catalog';
	import { formatNumber } from '$lib/amounts';
	import HouseholdLog from '$lib/components/HouseholdLog.svelte';
	import HouseholdMember from '$lib/components/HouseholdMember.svelte';
	import HouseholdMoney from '$lib/components/HouseholdMoney.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import {
		MAX_MEMBERS,
		PLAN_MEALS,
		householdFilter,
		hasNeeds,
		isAway,
		portionOf,
		wishesOf,
		type Member
	} from '$lib/household';
	import {
		HOUSEHOLD_PREFIX,
		addMember,
		changeLink,
		createHousehold,
		household,
		inviteLink,
		joinHousehold,
		leaveHousehold,
		members,
		myMember,
		renameHousehold,
		startSolo,
		stopSolo,
		tableNeeds
	} from '$lib/household.svelte';
	import { localToday } from '$lib/journal';
	import { ALLERGEN_LABELS } from '$lib/nutrition';
	import { plan, ui } from '$lib/state.svelte';

	const catalog = useCatalog();

	let householdName = $state('');
	let myName = $state('');
	let joinInput = $state('');
	/** From an invite link: asks before replacing this device's plan. */
	let invitedCode = $state<string | null>(null);
	let error = $state('');
	let busy = $state(false);
	let copied = $state(false);
	let newMember = $state('');
	let editing = $state<string | null>(null);
	let confirmLeave = $state(false);
	let confirmNewLink = $state(false);
	/** Someone was just removed: their old link still works until it's changed. */
	let removedSomeone = $state(false);
	let soloAway = $state(true);
	let soloUntil = $state('');

	const list = $derived(ui.loaded ? members() : []);
	const needs = $derived(household.doc ? tableNeeds() : null);
	const fitCount = $derived(
		needs && hasNeeds(needs)
			? catalog.recipes.filter(householdFilter(needs, catalog.ingredientsById)).length
			: catalog.recipes.length
	);
	const time = new Intl.DateTimeFormat('sk-SK', { hour: '2-digit', minute: '2-digit' });
	const shortDate = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric' });
	const today = localToday();

	/** The household's plan: this device's, or the shared one waiting while planning alone. */
	const sharedPlan = $derived(
		!ui.loaded || !household.doc ? [] : household.solo ? household.doc.plan[0] : plan.current
	);
	const cookOf = (id: string | undefined) => list.find((m) => m.id === id)?.name;
	const wishes = $derived(
		household.doc
			? [...wishesOf(household.doc, list)]
					.map(([id, who]) => ({ recipe: catalog.recipesById.get(id), who }))
					.filter((w) => w.recipe)
			: []
	);
	const me = $derived(ui.loaded ? myMember() : null);

	afterNavigate(() => {
		const fragment = location.hash.slice(1);
		if (fragment.startsWith(HOUSEHOLD_PREFIX)) {
			invitedCode = fragment.slice(HOUSEHOLD_PREFIX.length);
			// The code shouldn't linger in the address bar or the history. The router finishes
			// starting right after this first navigation.
			setTimeout(() => replaceState(location.pathname, {}));
		}
	});

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await action();
		} catch {
			error = 'Nepodarilo sa spojiť so serverom. Skús to o chvíľu.';
		} finally {
			busy = false;
		}
	}

	function create(event: SubmitEvent) {
		event.preventDefault();
		void run(() => createHousehold(householdName, myName));
	}

	function join(code: string) {
		void run(async () => {
			const message = await joinHousehold(code.replace(/^.*#?d=/, ''));
			if (message) error = message;
			else invitedCode = null;
		});
	}

	async function share() {
		if (!household.code) return;
		const url = inviteLink(household.code);
		const name = household.doc?.name[0] ?? 'domácnosť';
		try {
			if (navigator.share) {
				await navigator.share({ title: `Receptio – ${name}`, url });
				return;
			}
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Cancelled share sheet; the link can be copied by hand.
		}
	}

	function addNew(event: SubmitEvent) {
		event.preventDefault();
		const added = addMember(newMember);
		if (added) {
			newMember = '';
			editing = added.id;
		}
	}

	function newLink() {
		if (!confirmNewLink) {
			confirmNewLink = true;
			return;
		}
		confirmNewLink = false;
		void run(async () => {
			await changeLink();
			removedSomeone = false;
			await share();
		});
	}

	const MEAL_SHORT = { ranajky: 'raňajky', obed: 'obedy', vecera: 'večere' } as const;
	const dateText = (iso: string) => shortDate.format(new Date(`${iso}T12:00`));

	function summary(member: Member): string[] {
		const eats = PLAN_MEALS.filter((m) => member.meals[m]);
		const portion = portionOf(member);
		const away = member.away;
		return [
			...(away && (isAway(member, today) || away.from > today)
				? [
						away.from > today
							? `preč od ${dateText(away.from)}${away.to ? ` do ${dateText(away.to)}` : ''}`
							: `preč${away.to ? ` do ${dateText(away.to)}` : ''}`
					]
				: []),
			...(eats.length < PLAN_MEALS.length
				? [`doma: ${eats.map((m) => MEAL_SHORT[m]).join(', ')}`]
				: []),
			...(portion !== 1 ? [`porcia ${formatNumber(portion, 2)}×`] : []),
			...member.allergens.map((a) => `bez: ${ALLERGEN_LABELS[a]}`),
			...member.avoid.map(
				(id) => `bez: ${shortName(catalog.ingredientsById.get(id)?.name ?? id).toLowerCase()}`
			),
			...(member.mild ? ['nepálivo'] : []),
			...(member.glutenFree ? ['bezlepkovo'] : [])
		];
	}
</script>

<Seo
	title="Domácnosť"
	description="Spoločný plán, nákup a špajza pre všetkých, čo spolu varia a jedia – a recepty, ktoré môže jesť každý pri stole."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Varíme spolu</p>
		<h1>{household.doc ? household.doc.name[0] : 'Domácnosť'}</h1>
		<p class="lede">
			Jeden plán, jeden nákupný zoznam a jedna špajza pre všetkých, čo spolu varia. Každý napíše, čo
			nemôže alebo nechce jesť, a Receptio ponúkne jedlá pre celý stôl.
		</p>
	</header>

	{#if !ui.loaded}
		<p class="muted">Načítavam…</p>
	{:else if invitedCode && !household.code}
		<section class="card box">
			<h2><Icon name="users" size={24} /> Pozvánka do domácnosti</h2>
			<p>
				Po pripojení uvidíš spoločný plán a nákupný zoznam – <strong
					>tvoj doterajší plán a zoznam v tomto telefóne sa nahradia</strong
				>. Veci zo špajze, ktoré máš len ty, sa pridajú k spoločným.
			</p>
			<div class="actions">
				<button class="btn leaf" disabled={busy} onclick={() => join(invitedCode!)}>
					<Icon name="users" size={18} /> Pripojiť sa
				</button>
				<button class="btn ghost" onclick={() => (invitedCode = null)}>Teraz nie</button>
			</div>
			{#if error}<p class="msg" role="alert"><Icon name="alert" size={18} /> {error}</p>{/if}
		</section>
	{:else if !household.code}
		<section class="card box">
			<h2><Icon name="home" size={24} /> Založiť domácnosť</h2>
			<p>
				Tvoj súčasný plán, špajza a nákupný zoznam sa stanú spoločnými. Potom pošleš odkaz ostatným
				– kto ho otvorí, je doma s vami.
			</p>
			<form class="form" onsubmit={create}>
				<label>
					Ako sa voláte
					<input
						bind:value={householdName}
						maxlength="40"
						placeholder="Napr. Byt 4B, Spolubývajúci"
					/>
				</label>
				<label>
					Tvoje meno <span class="muted">(nepovinné)</span>
					<input bind:value={myName} maxlength="40" placeholder="Napr. Miška" />
				</label>
				<button class="btn leaf" type="submit" disabled={busy}>
					<Icon name="plus" size={18} /> Založiť
				</button>
			</form>
			{#if error}<p class="msg" role="alert"><Icon name="alert" size={18} /> {error}</p>{/if}
		</section>

		<section class="card box">
			<h2><Icon name="users" size={24} /> Máš pozvánku?</h2>
			<p class="muted">Otvor odkaz, ktorý ti poslali, alebo ho sem vlož.</p>
			<form
				class="row"
				onsubmit={(e) => {
					e.preventDefault();
					join(joinInput);
				}}
			>
				<input
					bind:value={joinInput}
					aria-label="Odkaz alebo kód domácnosti"
					placeholder="https://…/domacnost#d=…"
					autocomplete="off"
					spellcheck="false"
				/>
				<button class="btn ghost" type="submit" disabled={busy || !joinInput.trim()}
					>Pripojiť sa</button
				>
			</form>
		</section>

		<section class="how">
			<h2>Ako to funguje</h2>
			<ul>
				<li>
					<Icon name="basket" size={20} /> Kto je v obchode, odškrtáva – ostatní to hneď vidia. Kto uvarí,
					odpočíta suroviny zo spoločnej špajze.
				</li>
				<li>
					<Icon name="heart" size={20} /> Každý člen má svoje alergie, suroviny, ktoré neje, „nepálivo“
					pre deti a bezlepkovú stravu. Recepty a automatický plán to rešpektujú.
				</li>
				<li>
					<Icon name="shield" size={20} /> Bez účtov. Dáta sa šifrujú v telefóne, na server ide len šifra.
					Kľúč je v odkaze – posielaj ho len tým, s ktorými bývaš.
				</li>
			</ul>
		</section>
	{:else}
		<p class="status" data-status={household.status} role="status">
			<span class="dot" aria-hidden="true"></span>
			{#if household.status === 'live'}
				Spojené{household.syncedAt ? ` · ${time.format(household.syncedAt)}` : ''} – zmeny vidia všetci
			{:else if household.status === 'connecting'}
				Pripájam…
			{:else if household.status === 'missing'}
				Pod týmto odkazom už domácnosť nie je – buď ste ho vymenili, alebo zanikla.
			{:else}
				Offline – zmeny sa pošlú, keď bude internet
			{/if}
		</p>

		{#if household.status === 'missing'}
			<section class="card box">
				<h2><Icon name="users" size={24} /> Máš nový odkaz?</h2>
				<p>Popros niekoho z domácnosti o nový odkaz a vlož ho sem. Tvoj plán a zoznam ostanú.</p>
				<form
					class="row"
					onsubmit={(e) => {
						e.preventDefault();
						join(joinInput);
					}}
				>
					<input
						bind:value={joinInput}
						aria-label="Nový odkaz domácnosti"
						placeholder="https://…/domacnost#d=…"
						autocomplete="off"
						spellcheck="false"
					/>
					<button class="btn leaf" type="submit" disabled={busy || !joinInput.trim()}
						>Pripojiť sa</button
					>
				</form>
				{#if error}<p class="msg" role="alert"><Icon name="alert" size={18} /> {error}</p>{/if}
			</section>
		{/if}

		{#if household.solo}
			<section class="card box solo-on">
				<h2><Icon name="sun" size={24} /> Plánuješ sám</h2>
				<p>
					Máš vlastný plán a nákupný zoznam. Spoločný plán domácnosti na teba počká, špajza ostáva
					spoločná.{#if household.soloAway && me?.away}
						Ostatní vidia, že nie si doma{me.away.to ? ` do ${dateText(me.away.to)}` : ''}.{/if}
				</p>
				<button class="btn leaf" disabled={busy} onclick={() => void run(() => stopSolo())}>
					<Icon name="users" size={18} /> Späť k spoločnému plánu
				</button>
			</section>
		{/if}

		<section class="card box">
			<h2><Icon name="share" size={24} /> Pozvi ostatných</h2>
			<p>Pošli odkaz každému, s kým spolu varíte. Kto ho má, vidí a mení plán, zoznam aj špajzu.</p>
			<div class="actions">
				<button class="btn leaf" onclick={share}>
					<Icon name={copied ? 'check' : 'share'} size={18} />
					{copied ? 'Odkaz skopírovaný' : 'Poslať odkaz'}
				</button>
				<a class="btn ghost" href="/plan">Spoločný plán</a>
				<a class="btn ghost" href="/plan#nakup">Nákupný zoznam</a>
			</div>
			<label class="rename">
				Názov
				<input
					value={household.doc?.name[0] ?? ''}
					maxlength="40"
					onchange={(e) => renameHousehold(e.currentTarget.value)}
				/>
			</label>
			<div class="new-link" class:alert={removedSomeone}>
				<p>
					<Icon name="shield" size={18} />
					{#if removedSomeone}
						<strong>Kto odišiel, má stále starý odkaz.</strong> Vymeň ho, aby sa už nedostal dnu.
					{:else}
						Odsťahoval sa niekto alebo odkaz unikol? Vymeň ho – starý prestane fungovať.
					{/if}
				</p>
				<button class="btn ghost small" disabled={busy || !household.code} onclick={newLink}>
					{confirmNewLink ? 'Naozaj? Ostatným pošleš nový odkaz.' : 'Vymeniť odkaz'}
				</button>
				{#if error}<p class="msg" role="alert"><Icon name="alert" size={18} /> {error}</p>{/if}
			</div>
		</section>

		<section class="card box">
			<h2><Icon name="users" size={24} /> Kto je pri stole</h2>
			{#if list.length}
				<p class="muted">
					Plán varí pre {list.length}
					{list.length === 1 ? 'človeka' : 'ľudí'} – porcie podľa toho, kto je pri ktorom jedle doma a
					koľko zje.
					{#if needs && hasNeeds(needs)}
						Všetci môžu jesť <a href="/recepty?domacnost=1">{fitCount} receptov</a>.
					{/if}
				</p>
			{:else}
				<p class="muted">Pridaj ľudí, s ktorými ješ – aj deti, čo nemajú telefón.</p>
			{/if}

			<ul class="members">
				{#each list as member (member.id)}
					<li class="member">
						<div class="member-head">
							<strong>{member.name}</strong>
							{#if household.me === member.id}<span class="me">ty</span>{/if}
							<span class="chips">
								{#each summary(member) as chip (chip)}<span class="chip">{chip}</span>{:else}<span
										class="muted small">je všetko</span
									>{/each}
							</span>
							<button
								class="btn ghost small"
								aria-expanded={editing === member.id}
								onclick={() => (editing = editing === member.id ? null : member.id)}
							>
								<Icon name="pencil" size={16} />
								{editing === member.id ? 'Hotovo' : 'Upraviť'}
							</button>
						</div>
						{#if editing === member.id}
							<HouseholdMember
								{member}
								ondone={() => {
									editing = null;
									removedSomeone = true;
								}}
							/>
						{/if}
					</li>
				{/each}
			</ul>

			{#if list.length < MAX_MEMBERS}
				<form class="row" onsubmit={addNew}>
					<input
						bind:value={newMember}
						maxlength="40"
						aria-label="Meno nového člena"
						placeholder="Meno, napr. Ema"
					/>
					<button class="btn ghost" type="submit" disabled={!newMember.trim()}>
						<Icon name="plus" size={18} /> Pridať
					</button>
				</form>
			{/if}
		</section>

		<section class="card box">
			<h2><Icon name="pot" size={24} /> Kto varí a čo by ste chceli</h2>
			{#if sharedPlan.length}
				<ul class="cooking">
					{#each sharedPlan as e, i (i)}
						<li>
							<a href="/recepty/{e.recipeId}"
								>{catalog.recipesById.get(e.recipeId)?.title ?? e.recipeId}</a
							>
							<span class="muted"
								>{e.fromFreezer ? 'z mrazničky' : (cookOf(e.cook) ?? 'ktokoľvek')}</span
							>
						</li>
					{/each}
				</ul>
				<p class="hint">
					Kto varí, nastavíš pri jedle v <a href="/plan">pláne</a> – alebo tam ťukni „Rozdeliť varenie“.
				</p>
			{:else}
				<p class="muted">Plán je zatiaľ prázdny.</p>
			{/if}
			<h3>Želania</h3>
			{#if wishes.length}
				<ul class="cooking">
					{#each wishes as w (w.recipe!.id)}
						<li>
							<a href="/recepty/{w.recipe!.id}">{w.recipe!.title}</a>
							<span class="muted">{w.who.map((m) => m.name).join(', ')}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted">
					Pri recepte ťukni „Chcem to“ (keď si vyberieš, ktorý člen si) – automatický plán ho potom
					zaradí skôr.
				</p>
			{/if}
		</section>

		<section class="card box">
			<h2><Icon name="clock" size={24} /> Čo sa deje</h2>
			<HouseholdLog />
		</section>

		<section class="card box">
			<h2><Icon name="euro" size={24} /> Kto koľko zaplatil</h2>
			<HouseholdMoney />
		</section>

		{#if !household.solo}
			<section class="card box">
				<h2><Icon name="sun" size={24} /> Plánovať sám</h2>
				<p>
					Ideš na dovolenku, varíš si obedy do práce alebo chceš chvíľu vlastný plán? Dostaneš
					vlastný plán a nákupný zoznam, spoločný na teba počká. Špajza ostáva spoločná.
				</p>
				{#if me}
					<label class="check">
						<input type="checkbox" bind:checked={soloAway} />
						Medzitým nejem doma – nech domácnosť varí bezo mňa
					</label>
					{#if soloAway}
						<label class="until">
							do
							<input type="date" bind:value={soloUntil} min={today} />
							<span class="muted small">(nepovinné)</span>
						</label>
					{/if}
				{:else}
					<p class="hint">Vyber pri sebe „Toto som ja“, aby ostatní videli, že nie si doma.</p>
				{/if}
				<button
					class="btn ghost"
					disabled={busy}
					onclick={() => void run(() => startSolo(soloAway, soloUntil || null))}
				>
					<Icon name="sun" size={18} /> Plánovať sám
				</button>
			</section>
		{/if}

		<section class="leave">
			<button
				class="btn ghost small danger"
				disabled={busy}
				onclick={() => {
					if (confirmLeave) void run(leaveHousehold);
					confirmLeave = !confirmLeave;
				}}
			>
				{confirmLeave ? 'Naozaj odísť? Plán a zoznam ti tu ostanú.' : 'Odísť z domácnosti'}
			</button>
		</section>
	{/if}
</div>

<style>
	.lede {
		max-width: 62ch;
	}
	.box {
		margin-top: 20px;
		padding: 22px;
	}
	.box h2 {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.form {
		display: grid;
		gap: 12px;
		max-width: 420px;
	}
	.form label,
	.rename {
		display: grid;
		gap: 6px;
		font-weight: 650;
	}
	input {
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 10px 12px;
		font: inherit;
		min-width: 0;
	}
	.rename {
		margin-top: 12px;
		max-width: 420px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}
	.row input {
		flex: 1 1 220px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin: 12px 0;
	}
	.msg {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--tomato-soft);
	}
	.how {
		margin-top: 28px;
	}
	.how ul {
		display: grid;
		gap: 12px;
		padding: 0;
		list-style: none;
	}
	.how li {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		font-weight: 600;
	}
	.dot {
		width: 10px;
		height: 10px;
		flex: none;
		border-radius: 50%;
		background: var(--muted);
	}
	.status[data-status='live'] .dot {
		background: var(--leaf);
	}
	.status[data-status='offline'] .dot,
	.status[data-status='missing'] .dot {
		background: var(--tomato);
	}
	.members {
		display: grid;
		gap: 10px;
		padding: 0;
		margin: 14px 0 0;
		list-style: none;
	}
	.member {
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: var(--paper-2);
	}
	.member-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.member-head .chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		flex: 1 1 160px;
	}
	.chip {
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--paper);
		font-size: 0.86rem;
	}
	.me {
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--leaf);
		color: var(--paper);
		font-size: 0.78rem;
		font-weight: 700;
	}
	.leave {
		margin-top: 28px;
	}
	.new-link {
		margin-top: 16px;
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: var(--paper-2);
	}
	.new-link.alert {
		background: var(--tomato-soft);
	}
	.new-link p {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		margin: 0 0 10px;
	}
	.solo-on {
		border: 2px solid var(--leaf);
	}
	.cooking {
		display: grid;
		gap: 6px;
		padding: 0;
		margin: 10px 0;
		list-style: none;
	}
	.cooking li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 2px 12px;
	}
	.box h3 {
		margin: 18px 0 4px;
		font-size: 1.05rem;
	}
	.hint {
		color: var(--muted);
		font-size: 0.86rem;
	}
	.check,
	.until {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 10px 0;
		font-weight: 600;
	}
	.check input {
		flex: none;
	}
	.danger {
		color: var(--tomato);
	}
	.small {
		font-size: 0.86rem;
	}
</style>

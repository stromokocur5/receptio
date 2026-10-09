<script lang="ts">
	import { afterNavigate, replaceState } from '$app/navigation';
	import { shortName } from '$lib/avoid';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import IngredientExcluder from '$lib/components/IngredientExcluder.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { MAX_MEMBERS, householdFilter, hasNeeds, type Member } from '$lib/household';
	import {
		HOUSEHOLD_PREFIX,
		addMember,
		createHousehold,
		household,
		inviteLink,
		joinHousehold,
		leaveHousehold,
		members,
		removeMember,
		renameHousehold,
		setMe,
		tableNeeds,
		updateMember
	} from '$lib/household.svelte';
	import { ALLERGEN_LABELS } from '$lib/nutrition';
	import { ui } from '$lib/state.svelte';
	import { ALLERGENS } from '$lib/types';

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

	const list = $derived(ui.loaded ? members() : []);
	const needs = $derived(household.doc ? tableNeeds() : null);
	const fitCount = $derived(
		needs && hasNeeds(needs)
			? catalog.recipes.filter(householdFilter(needs, catalog.ingredientsById)).length
			: catalog.recipes.length
	);
	const time = new Intl.DateTimeFormat('sk-SK', { hour: '2-digit', minute: '2-digit' });

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

	function toggleAllergen(member: Member, allergen: (typeof ALLERGENS)[number]) {
		updateMember(member.id, {
			allergens: member.allergens.includes(allergen)
				? member.allergens.filter((a) => a !== allergen)
				: [...member.allergens, allergen]
		});
	}

	function summary(member: Member): string[] {
		return [
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
				Táto domácnosť na serveri už nie je. Môžeš z nej odísť a založiť novú.
			{:else}
				Offline – zmeny sa pošlú, keď bude internet
			{/if}
		</p>

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
		</section>

		<section class="card box">
			<h2><Icon name="users" size={24} /> Kto je pri stole</h2>
			{#if list.length}
				<p class="muted">
					Plán varí pre {list.length}
					{list.length === 1 ? 'človeka' : 'ľudí'}.
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
							<div class="edit">
								<label class="rename">
									Meno
									<input
										value={member.name}
										maxlength="40"
										onchange={(e) =>
											e.currentTarget.value.trim() &&
											updateMember(member.id, { name: e.currentTarget.value.trim() })}
									/>
								</label>
								<fieldset>
									<legend>Alergie</legend>
									<div class="toggles">
										{#each ALLERGENS as allergen (allergen)}
											<button
												class="toggle"
												aria-pressed={member.allergens.includes(allergen)}
												onclick={() => toggleAllergen(member, allergen)}
												>{ALLERGEN_LABELS[allergen]}</button
											>
										{/each}
									</div>
								</fieldset>
								<div class="toggles">
									<button
										class="toggle"
										aria-pressed={member.mild}
										onclick={() => updateMember(member.id, { mild: !member.mild })}
										><Icon name="chili" size={16} /> Nepálivo</button
									>
									<button
										class="toggle"
										aria-pressed={member.glutenFree}
										onclick={() => updateMember(member.id, { glutenFree: !member.glutenFree })}
										><Icon name="wheat" size={16} /> Bezlepkovo</button
									>
								</div>
								<IngredientExcluder
									selected={member.avoid}
									onchange={(ids) => updateMember(member.id, { avoid: ids })}
									fieldLabel={`Čo ${member.name} neje`}
									hint="Celá skupina: „cícer“ vylúči suchý aj sterilizovaný."
								/>
								<div class="actions">
									<button
										class="btn ghost small"
										onclick={() => setMe(household.me === member.id ? null : member.id)}
									>
										{household.me === member.id ? 'Toto nie som ja' : 'Toto som ja'}
									</button>
									<button
										class="btn ghost small danger"
										onclick={() => {
											removeMember(member.id);
											editing = null;
										}}><Icon name="trash" size={16} /> Odobrať</button
									>
								</div>
							</div>
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
	.edit {
		display: grid;
		gap: 12px;
		margin-top: 12px;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
	}
	legend {
		font-weight: 650;
		margin-bottom: 6px;
	}
	.toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.toggle[aria-pressed='true'] {
		border-color: var(--leaf);
		background: var(--leaf);
		color: var(--paper);
	}
	.leave {
		margin-top: 28px;
	}
	.danger {
		color: var(--tomato);
	}
	.small {
		font-size: 0.86rem;
	}
</style>

<script lang="ts">
	import { afterNavigate, replaceState } from '$app/navigation';
	import { shortName } from '$lib/avoid';
	import { useCatalog } from '$lib/catalog';
	import { formatNumber } from '$lib/amounts';
	import HouseholdLog from '$lib/components/HouseholdLog.svelte';
	import HouseholdMember from '$lib/components/HouseholdMember.svelte';
	import HouseholdMoney from '$lib/components/HouseholdMoney.svelte';
	import HouseholdToday from '$lib/components/HouseholdToday.svelte';
	import InviteQr from '$lib/components/InviteQr.svelte';
	import RecipeSwipe from '$lib/components/RecipeSwipe.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { almost, matches, swipers } from '$lib/swipe';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import {
		MAX_MEMBERS,
		PLAN_MEALS,
		householdFilter,
		hasNeeds,
		isAway,
		portionOf,
		viewOf,
		wishesOf,
		type Member
	} from '$lib/household';
	import {
		HOUSEHOLD_PREFIX,
		addMember,
		canEdit,
		changeLink,
		claimMember,
		createHousehold,
		followsLink,
		household,
		inviteLink,
		joinHousehold,
		leaveHousehold,
		members,
		myMember,
		renameHousehold,
		setHouseholdNews,
		startSolo,
		stopSolo,
		tableNeeds
	} from '$lib/household.svelte';
	import { localToday } from '$lib/journal';
	import { remindersSupported } from '$lib/reminders';
	import { ALLERGEN_LABELS } from '$lib/nutrition';
	import { addToPlan, plan, ui } from '$lib/state.svelte';

	const catalog = useCatalog();

	const pushSupported = $derived(ui.loaded && remindersSupported());
	let newsBusy = $state(false);
	let showQr = $state(false);
	let newsError = $state('');
	async function toggleNews(on: boolean) {
		newsBusy = true;
		newsError = '';
		try {
			await setHouseholdNews(on);
		} catch (err) {
			newsError = err instanceof Error ? err.message : 'Upozornenia sa nepodarilo zapnúť.';
		} finally {
			newsBusy = false;
		}
	}

	let householdName = $state('');
	let myName = $state('');
	let joinInput = $state('');
	/** From an invite link: asks before replacing this device's plan. */
	let invitedCode = $state<string | null>(null);
	let error = $state('');
	/** Which part of the page the error belongs to, so it shows once, next to what failed. */
	let errorAt = $state('');
	let busy = $state(false);
	let copied = $state(false);
	let newMember = $state('');
	let editing = $state<string | null>(null);
	/** Someone was just removed: their old link still works until it's changed. */
	let removedId = $state<string | null>(null);
	/** Renaming and changing the link are rare, so they wait folded away. */
	let settingsOpen = $state(false);
	let settingsBox = $state<HTMLDetailsElement>();
	let nameDraft = $state<string | null>(null);
	let renamed = $state(false);
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
		!ui.loaded || !household.doc ? [] : household.solo ? viewOf(household.doc).plan : plan.current
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
	let swiping = $state(false);
	const wishMap = $derived(household.doc ? wishesOf(household.doc, list) : new Map());
	const planned = $derived(new Set(sharedPlan.map((e) => e.recipeId)));
	/** Everyone wants it and it isn't in the plan yet. */
	const matched = $derived(
		matches(wishMap, swipers(list))
			.filter((id) => !planned.has(id))
			.flatMap((id) => catalog.recipesById.get(id) ?? [])
	);
	const nearly = $derived(
		almost(wishMap, swipers(list)).filter(
			(a) => !planned.has(a.id) && catalog.recipesById.has(a.id)
		)
	);

	afterNavigate(() => {
		const fragment = location.hash.slice(1);
		if (fragment.startsWith(HOUSEHOLD_PREFIX)) {
			invitedCode = fragment.slice(HOUSEHOLD_PREFIX.length);
			// The code shouldn't linger in the address bar or the history. The router finishes
			// starting right after this first navigation.
			setTimeout(() => replaceState(location.pathname, {}));
		}
	});

	async function run(at: string, action: () => Promise<unknown>) {
		busy = true;
		error = '';
		errorAt = at;
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
		void run('create', () => createHousehold(householdName, myName));
	}

	function join(code: string, at: string) {
		void run(at, async () => {
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

	let myNewName = $state('');
	/** Someone who came through the link and isn't among the profiles yet. */
	async function joinAsNew(event: SubmitEvent) {
		event.preventDefault();
		const added = addMember(myNewName);
		if (!added) return;
		myNewName = '';
		await claimMember(added.id);
		editing = added.id;
	}

	/** Who still needs the new link sent: profiles whose phone can't find it alone. */
	const sendTo = $derived(list.filter((m) => m.id !== household.me && !followsLink(m)));
	const newLinkWhy = $derived(
		'Starý odkaz prestane fungovať.' +
			(sendTo.length
				? ` Nový potom pošli ${sendTo.length === 1 ? 'tomuto členovi' : 'týmto členom'}, ak ${sendTo.length === 1 ? 'má' : 'majú'} telefón: ${sendTo.map((m) => m.name).join(', ')}.`
				: ' Kto tu má svoj profil, prepojí sa sám.')
	);

	function newLink() {
		void run('link', async () => {
			await changeLink();
			removedId = null;
			await share();
		});
	}

	function rename(event: SubmitEvent) {
		event.preventDefault();
		if (nameDraft === null) return;
		renameHousehold(nameDraft);
		nameDraft = null;
		renamed = true;
		setTimeout(() => (renamed = false), 2000);
	}

	/** After a removal: unfold the settings and bring the link change into view. */
	function showSettings() {
		settingsOpen = true;
		requestAnimationFrame(() =>
			settingsBox?.scrollIntoView({
				block: 'start',
				behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
			})
		);
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

{#snippet failed(at: string)}
	{#if error && errorAt === at}
		<p class="notice danger" role="alert"><Icon name="alert" size={18} /> {error}</p>
	{/if}
{/snippet}

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
			<h2 class="section-title"><Icon name="users" size={24} /> Pozvánka do domácnosti</h2>
			<p>
				Po pripojení uvidíš spoločný plán, nákupný zoznam a špajzu. Tvoje vlastné sa s nimi
				nemiešajú – odložia sa, ako sú, a kedykoľvek sa k nim prepneš cez <strong>Len môj</strong>
				v pláne alebo v špajzi. Keď z domácnosti odídeš, vrátia sa ti.
			</p>
			<div class="actions">
				<button class="btn leaf" disabled={busy} onclick={() => join(invitedCode!, 'invite')}>
					<Icon name="users" size={18} /> Pripojiť sa
				</button>
				<button class="btn ghost" onclick={() => (invitedCode = null)}>Teraz nie</button>
			</div>
			{@render failed('invite')}
		</section>
	{:else if !household.code}
		<section class="card box">
			<h2 class="section-title"><Icon name="home" size={24} /> Založiť domácnosť</h2>
			<p>
				Domácnosť dostane spoločný plán, nákupný zoznam a špajzu. Tvoje vlastné sa odložia – nič sa
				nezmaže a prepneš sa k nim cez <strong>Len môj</strong>. Potom pošleš odkaz ostatným.
			</p>
			<form class="form" onsubmit={create}>
				<label>
					Názov domácnosti
					<input
						class="input"
						bind:value={householdName}
						maxlength="40"
						placeholder="Napr. Byt 4B, Spolubývajúci"
					/>
				</label>
				<label>
					<span>Tvoje meno <span class="badge">nepovinné</span></span>
					<input class="input" bind:value={myName} maxlength="40" placeholder="Napr. Miška" />
				</label>
				<button class="btn leaf" type="submit" disabled={busy}>
					<Icon name="plus" size={18} /> Založiť
				</button>
			</form>
			{@render failed('create')}
		</section>

		<section class="card box">
			<h2 class="section-title"><Icon name="users" size={24} /> Máš pozvánku?</h2>
			<p class="muted">Otvor odkaz, ktorý ti poslali, alebo ho sem vlož.</p>
			<form
				class="row"
				onsubmit={(e) => {
					e.preventDefault();
					join(joinInput, 'join');
				}}
			>
				<input
					class="input"
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
			{@render failed('join')}
		</section>

		<section class="how">
			<h2 class="section-title">Ako to funguje</h2>
			<ul>
				<li>
					<Icon name="basket" size={20} /> Kto nakúpi alebo uvarí, odškrtne to – ostatní to hneď vidia.
				</li>
				<li>
					<Icon name="heart" size={20} /> Každý si zapíše alergie a čo neje. Recepty a plán sa podľa toho
					riadia.
				</li>
				<li>
					<Icon name="shield" size={20} /> Bez účtov, šifrované v telefóne. Kľúč je v odkaze – pošli ho
					len tým, s ktorými bývaš.
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
				<h2 class="section-title"><Icon name="users" size={24} /> Máš nový odkaz?</h2>
				<p>Popros niekoho z domácnosti o nový odkaz a vlož ho sem. Tvoj plán a zoznam ostanú.</p>
				<form
					class="row"
					onsubmit={(e) => {
						e.preventDefault();
						join(joinInput, 'missing');
					}}
				>
					<input
						class="input"
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
				{@render failed('missing')}
			</section>
		{/if}

		{#if household.doc && !household.me && !household.solo}
			<!-- Until they pick who they are, a newcomer sees only that question (and how to leave). -->
			<section class="card box">
				<h2 class="section-title"><Icon name="users" size={24} /> Kto z vás si ty?</h2>
				<p>
					Vyber svoj profil alebo si založ nový. Bude len tvoj – vyplníš si, čo neješ, koľko zješ a
					kedy si doma, a ostatní to uvidia, ale nezmenia.
				</p>
				{#if list.some((m) => !m.owner)}
					<div class="actions">
						{#each list.filter((m) => !m.owner) as m (m.id)}
							<button class="btn ghost" onclick={() => claimMember(m.id)}>Som {m.name}</button>
						{/each}
					</div>
				{/if}
				<form class="row" onsubmit={joinAsNew}>
					<input
						class="input"
						bind:value={myNewName}
						maxlength="40"
						aria-label="Tvoje meno"
						placeholder="Tvoje meno"
					/>
					<button class="btn leaf" type="submit" disabled={!myNewName.trim()}>
						<Icon name="plus" size={18} /> Som tu nový
					</button>
				</form>
			</section>
		{:else}
			{#if household.solo}
				<section class="card box solo-on">
					<h2 class="section-title"><Icon name="sun" size={24} /> Plánuješ pre seba</h2>
					<p>
						Máš svoj vlastný plán, nákupný zoznam a špajzu. Spoločné na teba počkajú, ako sú.{#if household.soloAway && me?.away}
							{' '}Ostatní vidia, že nie si doma{me.away.to
								? ` do ${dateText(me.away.to)}`
								: ''}.{/if}
					</p>
					<button
						class="btn leaf"
						disabled={busy}
						onclick={() => void run('solo', () => stopSolo())}
					>
						<Icon name="users" size={18} /> Späť k domácnosti
					</button>
					{@render failed('solo')}
				</section>
			{/if}

			{#if !household.solo && list.length}
				<section class="card box">
					<h2 class="section-title"><Icon name="pot" size={24} /> Dnes doma</h2>
					<HouseholdToday />
					<div class="actions">
						<a class="btn ghost small" href="/plan"
							><Icon name="calendar" size={16} /> Spoločný plán</a
						>
						<a class="btn ghost small" href="/plan#nakup"
							><Icon name="basket" size={16} /> Nákupný zoznam</a
						>
					</div>
				</section>
			{/if}

			<section class="card box">
				<h2 class="section-title"><Icon name="share" size={24} /> Pozvi ostatných</h2>
				<p>
					Pošli odkaz každému, s kým spolu varíte. Kto ho má, vidí a mení spoločný plán, zoznam aj
					špajzu; svoj profil si vyplní každý sám.
				</p>
				<div class="actions">
					<button class="btn leaf" onclick={share}>
						<Icon name={copied ? 'check' : 'share'} size={18} />
						{copied ? 'Odkaz skopírovaný' : 'Poslať odkaz'}
					</button>
					<button class="btn ghost" aria-expanded={showQr} onclick={() => (showQr = !showQr)}>
						<Icon name="qr" size={18} />
						{showQr ? 'Skryť QR kód' : 'QR kód'}
					</button>
				</div>
				{#if showQr && household.code}
					<InviteQr url={inviteLink(household.code)} />
					<p class="hint">Stačí ho namieriť fotoaparátom druhého telefónu.</p>
				{/if}
			</section>

			<section class="card box">
				<h2 class="section-title"><Icon name="users" size={24} /> Kto je pri stole</h2>
				{#if list.length}
					<p class="muted">
						Plán varí pre {list.length}
						{list.length === 1 ? 'človeka' : 'ľudí'} – porcie podľa toho, kto je pri ktorom jedle doma
						a koľko zje.
						{#if needs && hasNeeds(needs)}
							Všetci môžu jesť <a href="/recepty?domacnost=1">{fitCount} receptov</a>.
						{/if}
					</p>
				{:else}
					<p class="muted">Pridaj ľudí, s ktorými ješ – aj deti, čo nemajú telefón.</p>
				{/if}

				<ul class="members">
					{#each list as member (member.id)}
						{@const facts = summary(member)}
						{@const mine = canEdit(member)}
						<li class="member sunk">
							<div class="member-head">
								<p class="name-line">
									<strong>{member.name}</strong>
									{#if household.me === member.id}<span class="badge leaf">ty</span
										>{:else if !member.owner}<span class="muted small">upraví ktokoľvek</span>{/if}
								</p>
								<button
									class="btn ghost small"
									aria-expanded={editing === member.id}
									onclick={() => (editing = editing === member.id ? null : member.id)}
								>
									{#if editing === member.id}
										<Icon name={mine ? 'check' : 'x'} size={16} />
										{mine ? 'Hotovo' : 'Zavrieť'}
									{:else}
										<Icon name={mine ? 'pencil' : 'info'} size={16} />
										{mine ? 'Upraviť' : 'Pozrieť'}
									{/if}
								</button>
								{#if facts.length}
									<ul class="facts" aria-label="Čo platí pre {member.name}">
										{#each facts as fact (fact)}<li class="badge">{fact}</li>{/each}
									</ul>
								{:else}
									<p class="facts muted small">Je všetko, doma pri každom jedle.</p>
								{/if}
							</div>
							{#if editing === member.id}
								<HouseholdMember
									{member}
									onclose={() => (editing = null)}
									onremoved={() => {
										editing = null;
										removedId = member.id;
									}}
								/>
							{/if}
						</li>
					{/each}
				</ul>

				<!-- Gone again once the removal is undone. -->
				{#if removedId && !list.some((m) => m.id === removedId)}
					<div class="notice warn" role="status">
						<Icon name="shield" size={18} />
						<p>
							<strong>Kto odišiel, má stále starý odkaz.</strong>
							<button class="btn-link" onclick={showSettings}>Vymeň ho</button>, aby sa už nedostal
							dnu.
						</p>
					</div>
				{/if}

				{#if list.length < MAX_MEMBERS}
					<form class="row" onsubmit={addNew}>
						<input
							class="input"
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
				<h2 class="section-title"><Icon name="pot" size={24} /> Kto varí a čo by ste chceli</h2>
				{#if sharedPlan.length}
					<ul class="cooking divided">
						{#each sharedPlan as e, i (i)}
							<li>
								<a href="/recepty/{e.recipeId}"
									>{catalog.recipesById.get(e.recipeId)?.title ?? e.recipeId}</a
								>
								<span class="muted small"
									>{e.fromFreezer ? 'z mrazničky' : (cookOf(e.cook) ?? 'varí ktokoľvek')}</span
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
				<button class="btn swipe-btn" onclick={() => (swiping = true)}>
					<Icon name="heart" size={18} /> Čo budeme jesť? Poťahaj recepty
				</button>
				{#if matched.length}
					<ul class="cooking divided matches" aria-label="Zhody">
						{#each matched as recipe (recipe.id)}
							<li>
								<a href="/recepty/{recipe.id}"><strong>{recipe.title}</strong></a>
								<button class="btn small leaf" onclick={() => addToPlan(recipe.id, recipe.servings)}
									>Do plánu</button
								>
								<span class="muted small">chcete všetci</span>
							</li>
						{/each}
					</ul>
				{/if}
				{#if nearly.some((a) => a.missing.id === me?.id)}
					<p class="hint">
						Ostatní chcú {nearly
							.filter((a) => a.missing.id === me?.id)
							.slice(0, 3)
							.map((a) => catalog.recipesById.get(a.id)?.title)
							.join(', ')} – chýba už len tvoje áno.
					</p>
				{/if}
				{#if wishes.length}
					<ul class="cooking divided">
						{#each wishes as w (w.recipe!.id)}
							<li>
								<a href="/recepty/{w.recipe!.id}">{w.recipe!.title}</a>
								<span class="muted small">{w.who.map((m) => m.name).join(', ')}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="hint">
						Poťahaj recepty alebo pri recepte ťukni „Chcem to“ – čo chcete všetci, je zhoda, a
						automatický plán želania zaradí skôr.
					</p>
				{/if}
			</section>

			<section class="card box">
				<h2 class="section-title"><Icon name="clock" size={24} /> Čo sa deje</h2>
				<HouseholdLog />
				{#if pushSupported}
					<label class="check news">
						<input
							type="checkbox"
							checked={household.news}
							disabled={newsBusy}
							onchange={(e) => toggleNews(e.currentTarget.checked)}
						/>
						<span>
							Upozorniť ma, keď ostatní niečo pridajú do plánu, nakúpia alebo zaplatia
							<small
								>Aj keď je Receptio zavreté, najviac raz za 10 minút. Čo sa zmenilo, si telefón
								prečíta sám – server text nevidí.</small
							>
						</span>
					</label>
					{#if newsError}<p class="notice danger" role="alert">
							<Icon name="alert" size={18} />
							{newsError}
						</p>{/if}
				{/if}
			</section>

			<section class="card box">
				<h2 class="section-title">
					<Icon name="euro" size={24} /> Kto koľko zaplatil <span class="badge">nepovinné</span>
				</h2>
				<HouseholdMoney />
			</section>

			{#if !household.solo}
				<section class="card box">
					<h2 class="section-title"><Icon name="sun" size={24} /> Plánovať pre seba</h2>
					<p>
						Ideš na dovolenku, varíš si obedy do práce alebo chceš chvíľu vlastný plán? Prepneš sa
						na svoj vlastný plán, nákupný zoznam a špajzu – tie sa so spoločnými nikdy nemiešajú.
						Rovnako sa prepneš aj cez <strong>Len môj</strong> v pláne či v špajzi.
					</p>
					<p class="hint">
						Len občas niečo pre seba? Pri recepte ťukni <strong>Len pre mňa</strong> – nakúpi sa so spoločným
						zoznamom, ale nepočíta sa do spoločných jedál.
					</p>
					{#if me}
						<label class="check">
							<input type="checkbox" bind:checked={soloAway} />
							<span>Medzitým nejem doma – nech domácnosť varí bezo mňa</span>
						</label>
						{#if soloAway}
							<label class="until">
								do
								<input class="input" type="date" bind:value={soloUntil} min={today} />
								<span class="badge">nepovinné</span>
							</label>
						{/if}
					{:else}
						<p class="hint">
							Najprv si hore vyber svoj profil, aby ostatní videli, že nie si doma.
						</p>
					{/if}
					<div class="actions">
						<button
							class="btn ghost"
							disabled={busy}
							onclick={() => void run('solo', () => startSolo(soloAway, soloUntil || null))}
						>
							<Icon name="sun" size={18} /> Plánovať pre seba
						</button>
					</div>
					{@render failed('solo')}
				</section>
			{/if}

			<details
				class="card box settings disclosure"
				bind:open={settingsOpen}
				bind:this={settingsBox}
			>
				<summary>
					<h2 class="section-title"><Icon name="sliders" size={24} /> Nastavenia domácnosti</h2>
				</summary>
				<form class="row rename" onsubmit={rename}>
					<label>
						Názov domácnosti
						<input
							class="input"
							value={nameDraft ?? household.doc?.name[0] ?? ''}
							maxlength="40"
							oninput={(e) => (nameDraft = e.currentTarget.value)}
						/>
					</label>
					<button
						class="btn ghost"
						type="submit"
						disabled={!renamed && (nameDraft === null || !nameDraft.trim())}
					>
						<Icon name={renamed ? 'check' : 'pencil'} size={18} />
						{renamed ? 'Premenované' : 'Premenovať'}
					</button>
				</form>

				<h3>Vymeniť odkaz</h3>
				<p>
					Odsťahoval sa niekto alebo odkaz unikol? Odober ho zo stola a vymeň odkaz – starý prestane
					fungovať a kto tu má svoj profil, prepojí sa sám.
				</p>
				<ConfirmButton
					icon="shield"
					confirm="Áno, vymeniť"
					why={newLinkWhy}
					disabled={busy || !household.code}
					onconfirm={newLink}>Vymeniť odkaz</ConfirmButton
				>
				{@render failed('link')}
			</details>
		{/if}

		<section class="leave">
			<ConfirmButton
				small
				confirm="Áno, odísť"
				why="Vráti sa ti tvoj vlastný plán, zoznam a špajza. Späť do domácnosti sa dostaneš len cez odkaz od ostatných."
				disabled={busy}
				onconfirm={() => void run('leave', leaveHousehold)}>Odísť z domácnosti</ConfirmButton
			>
			{@render failed('leave')}
		</section>
	{/if}
</div>

{#if household.doc}<RecipeSwipe bind:open={swiping} />{/if}

<style>
	.box {
		margin-top: var(--sp-5);
	}
	.box h3 {
		margin: var(--sp-5) 0 var(--sp-2);
		font-size: var(--fs-lg);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin: var(--sp-3) 0 0;
	}
	.form {
		display: grid;
		gap: var(--sp-3);
		max-width: 420px;
	}
	.form label,
	.rename label {
		display: grid;
		gap: 6px;
		font-weight: 650;
	}
	.form .btn {
		justify-self: start;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}
	.row > .input,
	.row > label {
		flex: 1 1 220px;
		min-width: 0;
	}
	.how {
		margin-top: var(--sp-6);
	}
	.how ul {
		display: grid;
		gap: var(--sp-3);
		max-width: 62ch;
		padding: 0;
		margin: 0;
		list-style: none;
	}
	.how li {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}
	.how li :global(svg) {
		flex: none;
		margin-top: 3px;
		color: var(--leaf);
	}
	.status {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin: var(--sp-3) 0 0;
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
		gap: var(--sp-2);
		padding: 0;
		margin: var(--sp-3) 0 0;
		list-style: none;
	}
	.member {
		padding: var(--sp-3) 14px;
	}
	/* Name and button on one line, what applies to them underneath at full width. */
	.member-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 6px var(--sp-3);
	}
	.name-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px var(--sp-2);
		margin: 0;
	}
	.facts {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* On the sunk row a plain badge would melt in. */
	.facts .badge {
		background: var(--card);
		font-weight: 600;
	}
	.cooking {
		margin: var(--sp-2) 0;
	}
	.cooking li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: baseline;
		gap: 2px var(--sp-3);
		padding: var(--sp-2) 0;
	}
	.cooking li > :nth-child(2) {
		text-align: right;
	}
	/* The title keeps the width; "chcete všetci" sits under it, the button beside both. */
	.matches li {
		align-items: center;
	}
	.matches li > .btn {
		grid-row: span 2;
	}
	.matches li > .muted {
		grid-column: 1;
		text-align: left;
	}
	.swipe-btn {
		margin: var(--sp-1) 0 var(--sp-2);
	}
	.news {
		margin-top: var(--sp-3);
		padding-top: var(--sp-3);
		border-top: 1px dashed var(--line);
	}
	.until {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		margin: 0 0 var(--sp-2) 30px;
		font-weight: 600;
	}
	.solo-on {
		border: 2px solid var(--leaf);
	}
	.settings summary .section-title {
		margin: 0;
	}
	.settings[open] summary {
		margin-bottom: var(--sp-2);
	}
	.rename {
		margin-top: 0;
		max-width: 520px;
	}
	/* "nepovinné" next to a card title reads as a label, not as part of the title. */
	.section-title .badge {
		font-family: var(--font-body);
		letter-spacing: 0;
	}
	.leave {
		margin-top: var(--sp-6);
	}
</style>

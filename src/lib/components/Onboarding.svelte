<script lang="ts">
	import { fly } from 'svelte/transition';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { markOnboarded, onboarding } from '$lib/onboarding.svelte';
	import { avoid, journal, settings } from '$lib/state.svelte';
	import { connectSync, enableSync, formatCode, syncState } from '$lib/sync.svelte';

	const STEPS = ['vitaj', 'recepty', 'plan', 'viac', 'nastavenia', 'hotovo'] as const;
	type Step = (typeof STEPS)[number];

	let dialog: HTMLDialogElement;
	let stage: HTMLElement;
	let step = $state<Step>('vitaj');
	let direction = $state(1);
	const index = $derived(STEPS.indexOf(step));

	/** Sync was already on when the guide opened (reopened from Moje, or a second device). */
	let syncedBefore = $state(false);
	let syncChoice = $state<'new' | 'code' | null>(null);
	let codeInput = $state('');
	let syncError = $state('');
	let busy = $state(false);
	let copied = $state(false);
	let restored = $state(false);

	const reduceMotion =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	$effect(() => {
		if (onboarding.open && !dialog.open) {
			step = 'vitaj';
			syncedBefore = !!syncState.code;
			syncChoice = null;
			restored = false;
			dialog.showModal();
		} else if (!onboarding.open && dialog.open) dialog.close();
	});

	function go(to: Step) {
		direction = STEPS.indexOf(to) >= index ? 1 : -1;
		step = to;
		// Each step starts at its top, not where the previous one was scrolled to.
		stage.scrollTop = 0;
	}
	const next = () => go(STEPS[Math.min(index + 1, STEPS.length - 1)]);
	const back = () => go(STEPS[Math.max(index - 1, 0)]);

	function finish() {
		markOnboarded();
		onboarding.open = false;
	}

	async function createCode() {
		syncChoice = 'new';
		busy = true;
		syncError = '';
		try {
			await enableSync();
		} finally {
			busy = false;
		}
	}

	async function connect(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		try {
			syncError = (await connectSync(codeInput)) ?? '';
			if (!syncError) {
				restored = true;
				codeInput = '';
			}
		} finally {
			busy = false;
		}
	}

	async function copy() {
		if (!syncState.code) return;
		try {
			await navigator.clipboard.writeText(formatCode(syncState.code));
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// The code is on screen to write down.
		}
	}

	function setPeople(people: number) {
		settings.current = { ...settings.current, people: Math.min(12, Math.max(1, people)) };
	}

	const RECIPE_POINTS: { icon: IconName; title: string; text: string }[] = [
		{
			icon: 'sliders',
			title: 'Filtre, ktoré dávajú zmysel',
			text: 'Kategórie od raňajok po nápoje a snacky, kuchyňa sveta, čas, bezlepkovo, pálivosť – aj „čo uvariť zo zvyškov“.'
		},
		{
			icon: 'scale',
			title: 'Čísla sa počítajú, nie odhadujú',
			text: 'Bielkoviny, železo, vápnik aj cena porcie – všetko zo surovín receptu. Zmeň porcie a prepočíta sa to. B12 z jedla nezískaš – ten treba suplementovať.'
		},
		{
			icon: 'wheat-off',
			title: 'Lepok a alergény',
			text: 'Appka vie, v ktorej surovine je lepok, a ponúkne bezlepkovú verziu (napr. sójovka → tamari).'
		},
		{
			icon: 'chef',
			title: 'Režim varenia',
			text: 'Krok za krokom na celú obrazovku, časovače z textu, displej nezhasne a dá sa ovládať hlasom.'
		}
	];

	const FLOW: { icon: IconName; title: string; text: string; tone: string }[] = [
		{
			icon: 'calendar',
			title: 'Plán',
			text: 'Tlačidlom + pridáš recept do týždňa, alebo nechaj plán navrhnúť automaticky.',
			tone: 'var(--sky)'
		},
		{
			icon: 'basket',
			title: 'Nákupný zoznam',
			text: 'Spočíta suroviny zo všetkých receptov, vynechá, čo máš doma, a ukáže ceny. Pošleš ho odkazom.',
			tone: 'var(--turmeric)'
		},
		{
			icon: 'jar',
			title: 'Špajza',
			text: 'Zapíš, čo máš doma – recepty sa zoradia podľa toho, na čo už máš suroviny. Aj čo nejete alebo nemáš (huby, rúru) – také recepty sa neponúknu.',
			tone: 'var(--leaf-2)'
		},
		{
			icon: 'pot',
			title: 'Uvarené',
			text: 'Po uvarení sa suroviny odpočítajú zo špajze a recept pribudne do histórie.',
			tone: 'var(--tomato)'
		}
	];

	const MORE: { icon: IconName; title: string; text: string; href: string }[] = [
		{
			icon: 'tag',
			title: 'Ceny',
			text: 'Reálne ceny z obchodov za kilo. Kde cenu nemáme, je odhad – vždy označený.',
			href: '/ceny'
		},
		{
			icon: 'sprout',
			title: 'Pestuj si sám',
			text: 'Plánovač pre okno, balkón aj záhradu s kalendárom a zápisom úrody.',
			href: '/pestuj'
		},
		{
			icon: 'book',
			title: 'Wiki',
			text: 'Základy varenia, strukoviny, tofu, suplementy (B12, D, omega-3) a vybavenie.',
			href: '/wiki'
		},
		{
			icon: 'bookmark',
			title: 'Moje',
			text: 'Obľúbené, poznámky k receptom, história varenia, denník jedla a vody (ak si ho zapneš) a záloha dát.',
			href: '/moje'
		}
	];
</script>

<dialog
	class="guide"
	bind:this={dialog}
	oncancel={(e) => {
		e.preventDefault();
		finish();
	}}
	aria-label="Sprievodca Receptiom"
>
	<div class="top">
		<ol class="dots" aria-label="Krok {index + 1} z {STEPS.length}">
			{#each STEPS as s, i (s)}
				<li class:done={i < index} class:current={i === index}></li>
			{/each}
		</ol>
		<button class="skip" onclick={finish}>
			{step === 'hotovo' ? 'Zavrieť' : 'Preskočiť'}
			<Icon name="x" size={16} />
		</button>
	</div>

	<div class="stage" bind:this={stage}>
		{#key step}
			<div
				class="step"
				in:fly={{ x: 24 * direction, duration: reduceMotion ? 0 : 260, opacity: 0 }}
			>
				{#if step === 'vitaj'}
					<div class="welcome">
						<div class="hello"><Icon name="bowl" size={32} /></div>
						<div>
							<h2>Vitaj v Receptiu</h2>
							<p class="lede">Rastlinné recepty, plán, nákup a špajza. Zadarmo a bez reklám.</p>
						</div>
					</div>

					<section class="sync-box">
						<h3><Icon name="shield" size={20} /> Najprv si ulož dáta</h3>
						<p class="sync-text">
							Tvoje dáta sú len v tomto prehliadači. S <strong>kódom na obnovenie</strong> ich máš aj
							na ďalšom telefóne a neprídeš o ne. Bez e-mailu a hesla.
						</p>

						{#if syncedBefore}
							<p class="ok"><Icon name="check" size={18} /> Synchronizácia je už zapnutá.</p>
						{:else if restored}
							<p class="ok">
								<Icon name="check" size={18} /> Hotovo, dáta z tvojho kódu sú obnovené.
							</p>
						{:else if syncChoice === 'new' && syncState.code}
							<p>Tvoj kód – zapíš si ho alebo ulož do správcu hesiel:</p>
							<div class="code-row">
								<code>{formatCode(syncState.code)}</code>
								<button class="btn ghost small" onclick={copy}>
									<Icon name={copied ? 'check' : 'copy'} size={16} />
									{copied ? 'Skopírované' : 'Kopírovať'}
								</button>
							</div>
							<p class="muted small">
								Kód nájdeš aj neskôr na stránke Moje. Kto ho má, vidí tvoje dáta – nikomu ho
								neposielaj.
							</p>
						{:else if syncChoice === 'code'}
							<form class="connect" onsubmit={connect}>
								<input
									bind:value={codeInput}
									placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
									aria-label="Kód na obnovenie"
									autocomplete="off"
									autocapitalize="characters"
									spellcheck="false"
								/>
								<button class="btn leaf" type="submit" disabled={busy || !codeInput.trim()}>
									Pripojiť
								</button>
							</form>
							<p class="muted small">
								Dáta v tomto prehliadači sa nahradia tými zo zálohy.
								<button class="linkish" onclick={() => (syncChoice = null)}>Späť</button>
							</p>
						{:else}
							<div class="choices">
								<button class="choice" disabled={busy} onclick={createCode}>
									<Icon name="sparkle" size={22} />
									<strong>Som tu prvýkrát</strong>
									<small>Vytvoriť kód a zapnúť zálohu</small>
								</button>
								<button class="choice" onclick={() => (syncChoice = 'code')}>
									<Icon name="history" size={22} />
									<strong>Mám už kód</strong>
									<small>Obnoviť dáta z iného zariadenia</small>
								</button>
							</div>
						{/if}
						{#if syncError}
							<p class="err" role="alert"><Icon name="alert" size={18} /> {syncError}</p>
						{/if}
						{#if syncState.status === 'error' && syncState.message && !syncError}
							<p class="err" role="alert"><Icon name="alert" size={18} /> {syncState.message}</p>
						{/if}
						<p class="muted small">
							Dáta sa šifrujú priamo v prehliadači, na server ide len šifra, ktorú bez kódu nikto
							neprečíta – ani my. <a href="/sukromie" onclick={finish}>Ochrana súkromia</a>
						</p>
					</section>
				{:else if step === 'recepty'}
					<p class="kicker"><Icon name="bowl" size={18} /> 1 · Recepty</p>
					<h2>Nájdi, čo ti chutí</h2>
					<ul class="points">
						{#each RECIPE_POINTS as p, i (p.title)}
							<li style:--i={i}>
								<span class="ico"><Icon name={p.icon} size={22} /></span>
								<div>
									<strong>{p.title}</strong>
									<p>{p.text}</p>
								</div>
							</li>
						{/each}
					</ul>
					<p class="muted small">
						Srdiečkom si recept uložíš do obľúbených, poznámky k nemu nájdeš na stránke Moje.
					</p>
				{:else if step === 'plan'}
					<p class="kicker"><Icon name="calendar" size={18} /> 2 · Plán a nákup</p>
					<h2>Z receptov nákup, z nákupu obed</h2>
					<ol class="flow">
						{#each FLOW as f, i (f.title)}
							<li style:--i={i} style:--tone={f.tone}>
								<span class="node"><Icon name={f.icon} size={22} /></span>
								<div>
									<strong>{f.title}</strong>
									<p>{f.text}</p>
								</div>
							</li>
						{/each}
					</ol>
				{:else if step === 'viac'}
					<p class="kicker"><Icon name="sparkle" size={18} /> 3 · A ešte</p>
					<h2>Čo ďalej nájdeš</h2>
					<div class="more">
						{#each MORE as m, i (m.title)}
							<div class="tile" style:--i={i}>
								<span class="ico"><Icon name={m.icon} size={22} /></span>
								<strong>{m.title}</strong>
								<p>{m.text}</p>
							</div>
						{/each}
					</div>
					<p class="muted small">
						Appka funguje aj offline – otvorené recepty, plán a špajza sú v telefóne. Na úvodnú
						obrazovku si ju pridáš cez menu prehliadača („Pridať na plochu“).
					</p>
				{:else if step === 'nastavenia'}
					<p class="kicker"><Icon name="users" size={18} /> 4 · Pre koho varíš</p>
					<h2>Nastav si plán</h2>
					<p>Podľa toho sa prepočítajú porcie v pláne a množstvá v nákupnom zozname.</p>
					<div class="setting">
						<span>Koľko ľudí je pri stole</span>
						<div class="stepper">
							<button
								onclick={() => setPeople(settings.current.people - 1)}
								disabled={settings.current.people <= 1}
								aria-label="Menej"><Icon name="minus" size={18} /></button
							>
							{#key settings.current.people}
								<output class="num" in:fly={{ y: -10, duration: reduceMotion ? 0 : 200 }}
									>{settings.current.people}</output
								>
							{/key}
							<button
								onclick={() => setPeople(settings.current.people + 1)}
								disabled={settings.current.people >= 12}
								aria-label="Viac"><Icon name="plus" size={18} /></button
							>
						</div>
					</div>
					<div class="setting">
						<span>Čo varíš</span>
						<div class="chips">
							<button
								class="chip"
								aria-pressed={settings.current.mealsPerDay === 1}
								onclick={() => (settings.current = { ...settings.current, mealsPerDay: 1 })}
								>Jedno jedlo denne</button
							>
							<button
								class="chip"
								aria-pressed={settings.current.mealsPerDay === 2}
								onclick={() => (settings.current = { ...settings.current, mealsPerDay: 2 })}
								>Obed aj večeru</button
							>
						</div>
					</div>
					<div class="setting">
						<span>Čo ti mám ponúkať</span>
						<div class="chips">
							<button
								class="chip"
								aria-pressed={!avoid.current.treats}
								onclick={() => (avoid.current = { ...avoid.current, treats: false })}>Všetko</button
							>
							<button
								class="chip"
								aria-pressed={avoid.current.treats}
								onclick={() => (avoid.current = { ...avoid.current, treats: true })}
								>Bez fast foodu a jedál na občas</button
							>
						</div>
						<small class="muted">Skryje kebab, burgre, vyprážané a veľmi sladké.</small>
					</div>
					<div class="setting">
						<span>Denník jedla a vody</span>
						<div class="chips">
							<button
								class="chip"
								aria-pressed={!journal.current.enabled}
								onclick={() => (journal.current = { ...journal.current, enabled: false })}
								>Netreba</button
							>
							<button
								class="chip"
								aria-pressed={journal.current.enabled}
								onclick={() => (journal.current = { ...journal.current, enabled: true })}
								>Chcem si zapisovať</button
							>
						</div>
						<small class="muted"
							>Poháre vody, zjedené porcie a koľko máš za deň bielkovín, vlákniny či železa. Na
							stránke Moje si zapneš aj pripomienky piť. Kalórie len ak chceš.</small
						>
					</div>
					<p class="muted small">
						Zmeniť sa to dá kedykoľvek – porcie na stránke Plán, výber jedál v Špajzi, denník na
						stránke Moje.
					</p>
				{:else}
					<div class="hello done-art"><Icon name="check" size={40} /></div>
					<h2>Môžeš začať</h2>
					<p class="lede">Kde chceš začať?</p>
					<div class="ctas">
						<a class="cta" href="/recepty" onclick={finish}>
							<Icon name="bowl" size={24} />
							<span><strong>Prezrieť recepty</strong><small>Filtre, kuchyne sveta</small></span>
						</a>
						<a class="cta" href="/spajza" onclick={finish}>
							<Icon name="jar" size={24} />
							<span
								><strong>Zapísať, čo mám doma</strong><small>A uvidieť, čo z toho uvarím</small
								></span
							>
						</a>
						<a class="cta" href="/plan" onclick={finish}>
							<Icon name="calendar" size={24} />
							<span><strong>Naplánovať týždeň</strong><small>A dostať nákupný zoznam</small></span>
						</a>
					</div>
					<p class="muted small">Sprievodcu spustíš znova na stránke Moje.</p>
				{/if}
			</div>
		{/key}
	</div>

	<div class="nav">
		{#if index > 0}
			<button class="btn ghost" onclick={back}><Icon name="arrow-left" size={18} /> Späť</button>
		{:else}
			<span></span>
		{/if}
		{#if step === 'hotovo'}
			<button class="btn leaf" onclick={finish}>Hotovo</button>
		{:else}
			{@const skipping = step === 'vitaj' && !syncState.code && !restored}
			<button class="btn {skipping ? 'ghost' : 'leaf'}" onclick={next} disabled={busy}>
				{skipping ? 'Teraz nie' : 'Ďalej'}
				<Icon name="arrow-right" size={18} />
			</button>
		{/if}
	</div>
</dialog>

<style>
	.guide {
		width: min(560px, 100%);
		max-width: 100%;
		height: min(760px, 100dvh);
		max-height: 100dvh;
		margin: auto;
		padding: 0;
		border: 0;
		border-radius: var(--radius);
		background: var(--card);
		color: var(--ink);
		box-shadow: var(--shadow-lift);
		overflow: hidden;
	}
	.guide[open] {
		display: flex;
		flex-direction: column;
		animation: pop-in 0.4s var(--ease-spring);
	}
	.guide::backdrop {
		background: rgba(17, 26, 20, 0.55);
		backdrop-filter: blur(3px);
	}
	@media (max-width: 600px) {
		.guide {
			height: 100dvh;
			border-radius: 0;
		}
	}
	@keyframes pop-in {
		from {
			transform: scale(0.95) translateY(12px);
			opacity: 0;
		}
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px 0;
	}
	.dots {
		display: flex;
		gap: 6px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.dots li {
		width: 8px;
		height: 8px;
		border-radius: 4px;
		background: var(--line);
		transition:
			width 0.35s var(--ease-spring),
			background 0.3s;
	}
	.dots li.done {
		background: var(--leaf-2);
	}
	.dots li.current {
		width: 26px;
		background: var(--leaf);
	}
	.skip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		border: 0;
		background: none;
		color: var(--muted);
		font: inherit;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.stage {
		flex: 1;
		display: grid;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.step {
		grid-area: 1 / 1;
		display: grid;
		align-content: start;
		gap: 14px;
		padding: 18px 22px 22px;
	}
	.step h2 {
		margin: 0;
		font-size: 1.7rem;
		line-height: 1.15;
	}
	.step p {
		margin: 0;
	}
	.lede {
		color: var(--ink-2);
		font-size: 1.02rem;
	}
	.kicker {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--leaf);
	}
	.welcome {
		display: flex;
		gap: 14px;
		align-items: center;
	}
	.welcome .lede {
		margin-top: 4px;
	}
	.hello {
		flex: none;
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 20px;
		background: var(--leaf-soft);
		color: var(--leaf);
		animation: bob 3s ease-in-out infinite;
	}
	.done-art {
		border-radius: 50%;
		color: var(--leaf);
	}
	@keyframes bob {
		50% {
			transform: translateY(-4px) rotate(-3deg);
		}
	}
	.sync-box {
		display: grid;
		gap: 12px;
		padding: 16px;
		border-radius: var(--radius-sm);
		border: 2px solid var(--leaf-2);
		background: var(--paper);
	}
	.sync-box h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 1.1rem;
	}
	.choices {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	@media (max-width: 420px) {
		.choices {
			grid-template-columns: 1fr;
		}
	}
	.choice {
		display: grid;
		justify-items: start;
		gap: 4px;
		padding: 14px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--card);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			transform 0.25s var(--ease-spring),
			border-color 0.2s;
	}
	.choice:hover {
		transform: translateY(-2px);
		border-color: var(--leaf);
	}
	.choice :global(svg) {
		color: var(--leaf);
	}
	.choice small {
		color: var(--muted);
	}
	.code-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	code {
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--card);
		border: 1.5px dashed var(--leaf-2);
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		word-break: break-all;
	}
	.connect {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.connect input {
		flex: 1 1 220px;
		min-width: 0;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--card);
		color: var(--ink);
		padding: 10px 12px;
		font: inherit;
		font-family: ui-monospace, monospace;
	}
	.ok,
	.err {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 650;
	}
	.ok {
		color: var(--leaf);
	}
	.err {
		color: var(--tomato);
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
	.points,
	.flow {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.points li,
	.flow li {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		animation: rise 0.45s var(--ease-out) both;
		animation-delay: calc(var(--i) * 90ms + 120ms);
	}
	.points p,
	.flow p,
	.tile p {
		font-size: 0.92rem;
		color: var(--ink-2);
		margin-top: 2px;
	}
	.ico {
		display: grid;
		place-items: center;
		flex: none;
		width: 42px;
		height: 42px;
		border-radius: 14px;
		background: var(--leaf-soft);
		color: var(--leaf);
	}
	.flow li {
		position: relative;
		padding-bottom: 6px;
	}
	/* Dashed line that draws itself from one step to the next. */
	.flow li:not(:last-child)::before {
		content: '';
		position: absolute;
		left: 22px;
		top: 48px;
		bottom: -10px;
		width: 2px;
		background: repeating-linear-gradient(to bottom, var(--line) 0 5px, transparent 5px 10px);
		transform-origin: top;
		animation: draw 0.5s var(--ease-out) both;
		animation-delay: calc(var(--i) * 90ms + 400ms);
	}
	@keyframes draw {
		from {
			transform: scaleY(0);
		}
	}
	.node {
		display: grid;
		place-items: center;
		flex: none;
		width: 46px;
		height: 46px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--tone) 22%, var(--card));
		color: color-mix(in srgb, var(--tone) 70%, var(--ink));
		border: 2px solid var(--tone);
	}
	.more {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	@media (max-width: 420px) {
		.more {
			grid-template-columns: 1fr;
		}
	}
	.tile {
		display: grid;
		align-content: start;
		gap: 6px;
		padding: 14px;
		border-radius: var(--radius-sm);
		background: var(--paper);
		animation: rise 0.45s var(--ease-out) both;
		animation-delay: calc(var(--i) * 80ms + 120ms);
	}
	.setting {
		display: grid;
		gap: 8px;
		padding: 14px;
		border-radius: var(--radius-sm);
		background: var(--paper);
		font-weight: 650;
	}
	.setting small {
		font-weight: 400;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.stepper button {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 1.5px solid var(--line);
		background: var(--card);
		color: var(--ink);
		cursor: pointer;
	}
	.stepper button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.num {
		min-width: 2ch;
		text-align: center;
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 700;
		color: var(--leaf);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.ctas {
		display: grid;
		gap: 10px;
	}
	.cta {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 16px;
		border-radius: var(--radius-sm);
		border: 1.5px solid var(--line);
		background: var(--paper);
		color: var(--ink);
		text-decoration: none;
		transition:
			transform 0.25s var(--ease-spring),
			border-color 0.2s;
	}
	.cta:hover {
		transform: translateX(4px);
		border-color: var(--leaf);
	}
	.cta :global(svg) {
		color: var(--leaf);
		flex: none;
	}
	.cta span {
		display: grid;
	}
	.cta small {
		color: var(--muted);
	}
	.nav {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--line);
		background: var(--card);
	}
	.small {
		font-size: 0.85rem;
	}

	/* On a phone every step should fit one screen: tighter spacing and shorter lines. */
	@media (max-width: 600px) {
		.step {
			gap: 10px;
			padding: 12px 18px 16px;
		}
		.step h2 {
			font-size: 1.4rem;
		}
		.lede {
			font-size: 0.95rem;
		}
		.hello {
			width: 52px;
			height: 52px;
			border-radius: 16px;
		}
		.sync-box {
			gap: 10px;
			padding: 14px;
		}
		.sync-text {
			font-size: 0.92rem;
		}
		.choices {
			grid-template-columns: 1fr 1fr;
		}
		.choice {
			padding: 12px;
		}
		.points,
		.flow {
			gap: 8px;
		}
		.points p,
		.flow p,
		.tile p {
			font-size: 0.84rem;
		}
		.ico {
			width: 36px;
			height: 36px;
			border-radius: 12px;
		}
		.node {
			width: 38px;
			height: 38px;
		}
		.flow li:not(:last-child)::before {
			left: 18px;
			top: 40px;
		}
		.more {
			grid-template-columns: 1fr 1fr;
			gap: 8px;
		}
		.tile {
			padding: 10px;
		}
		.setting {
			padding: 12px;
		}
		.cta {
			padding: 12px 14px;
		}
	}
</style>

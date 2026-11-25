<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { formatEur, formatMinutes, formatNumber } from '$lib/amounts';
	import {
		BUILDER_MODES,
		BUILDER_SLOTS,
		MODE_LABELS,
		type BuilderMode,
		fits,
		plateName,
		plateStyles,
		surprise,
		verifiedDish,
		type BuilderSlot,
		type Candidate
	} from '$lib/builder';
	import { resolveComposed, useCatalog } from '$lib/catalog';
	import BuiltPlate from '$lib/components/BuiltPlate.svelte';
	import DishCard from '$lib/components/DishCard.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PartArt from '$lib/components/PartArt.svelte';
	import {
		buildFromParams,
		buildToParams,
		defaultChoice,
		matchDish,
		matchPart,
		pickMethod,
		rankDishes,
		STYLE_LABELS,
		TOOL_META,
		type Build,
		type Choice,
		type Part
	} from '$lib/dish';
	import { normalizeSearch } from '$lib/labels';
	import { pantryByGroup } from '$lib/pantry';
	import { SPOTS } from '$lib/plate-art';
	import { composePlate } from '$lib/plate';
	import { addToPlan, kitchen, myParts, pantry, plan, ui } from '$lib/state.svelte';
	import { toast } from '$lib/toast.svelte';

	const catalog = useCatalog();
	let mode = $state<BuilderMode>('slane');
	const dish = $derived(catalog().freeDishes[mode]);
	const slots = $derived(BUILDER_SLOTS[mode]);

	let choice = $state<Choice>({});
	let ready = $state(false);

	onMount(() => {
		const params = new URLSearchParams(location.search);
		if (params.get('typ') === 'sladke') mode = 'sladke';
		resolveComposed(catalog(), [...params.values(), ...myParts.current]);
		choice = buildFromParams(catalog().freeDishes[mode], params, catalog().partsById).choice;
		ready = true;
	});

	const build = $derived<Build>({ servings: dish.servings, choice, methods: {} });
	const query = $derived(buildToParams(dish, build).toString());
	$effect(() => {
		if (!ready) return;
		const all = [mode === 'sladke' ? 'typ=sladke' : '', query].filter(Boolean).join('&');
		const next = all ? `/?${all}` : '/';
		void tick().then(() => replaceState(next, page.state));
	});

	const plate = $derived(
		composePlate(dish, build, kitchen.current, catalog().partsById, catalog().ingredientsById)
	);
	const picked = $derived(plate.parts.map((p) => p.part));
	const filled = $derived(
		plate.parts.map((p) => ({ slot: p.slot.id, part: p.part, method: p.method }))
	);
	const empty = $derived(slots.filter((s) => !choice[s.id]).map((s) => s.id));
	const verified = $derived(verifiedDish(picked, catalog().dishes));
	const styles = $derived(plateStyles(picked));

	const groups = $derived(
		ui.loaded ? pantryByGroup(pantry.current, catalog().ingredientsById) : new Map()
	);
	const hasPantry = $derived(ui.loaded && Object.keys(pantry.current).length > 0);

	/** Every part of each spot with what it'd take to cook it here. */
	const candidates = $derived.by((): Record<string, Candidate[]> => {
		const { partsById, ingredientsById } = catalog();
		return Object.fromEntries(
			dish.slots.map((slot) => [
				slot.id,
				slot.options.map((id) => {
					const part = partsById.get(id)!;
					const method = pickMethod(part, kitchen.current);
					const m = method
						? matchPart(part, method, dish.servings, groups, ingredientsById)
						: undefined;
					return {
						part,
						missing: m ? m.missing.length + m.short.length : 99,
						cookable: !!method
					};
				})
			])
		);
	});

	function surpriseMe() {
		choice = surprise(candidates, slots);
	}

	function switchMode(next: BuilderMode) {
		if (next === mode) return;
		mode = next;
		choice = defaultChoice(catalog().freeDishes[next]);
	}

	function clear() {
		const before = choice;
		choice = defaultChoice(dish);
		toast('Tanier je prázdny', () => (choice = before));
	}

	function planIt() {
		if (addToPlan(dish.id, query)) {
			toast('Tanier je v týždni', () => (plan.current = plan.current.slice(0, -1)));
		}
	}

	let sheet = $state<HTMLDialogElement>();
	let open = $state<BuilderSlot | null>(null);
	let search = $state('');
	function openPicker(slot: BuilderSlot) {
		open = slot;
		search = '';
		sheet?.showModal();
	}
	function pick(id: string | null) {
		if (open) choice = { ...choice, [open.id]: id };
		sheet?.close();
	}

	/** The rest of the plate decides what fits; the spot being changed doesn't count. */
	const sections = $derived.by(() => {
		if (!open) return [];
		const slot = open;
		const st = plateStyles(plate.parts.filter((p) => p.slot.id !== slot.id).map((p) => p.part));
		const q = normalizeSearch(search.trim());
		const list = (candidates[slot.id] ?? []).filter(
			(c) => !q || normalizeSearch(c.part.name).includes(q)
		);
		const sort = (a: Candidate, b: Candidate) =>
			a.missing - b.missing || a.part.name.localeCompare(b.part.name, 'sk');
		const home = hasPantry
			? list.filter((c) => c.cookable && c.missing === 0 && fits(c.part, st))
			: [];
		const good = list.filter((c) => c.cookable && fits(c.part, st) && !home.includes(c)).sort(sort);
		const rest = list.filter((c) => !home.includes(c) && !good.includes(c)).sort(sort);
		const goodTitle = st.size
			? `Hodí sa – ${[...st].map((s) => STYLE_LABELS[s]).join(', ')}`
			: 'Všetko';
		const mine: Candidate[] = myParts.current
			.map((id) => catalog().partsById.get(id))
			.filter((p): p is Part => !!p && slot.kinds.includes(p.kind) && mode === 'slane')
			.filter((p) => !q || normalizeSearch(p.name).includes(q))
			.map((p) => {
				const method = pickMethod(p, kitchen.current);
				const m = method
					? matchPart(p, method, dish.servings, groups, catalog().ingredientsById)
					: undefined;
				return { part: p, missing: m ? m.missing.length + m.short.length : 99, cookable: !!method };
			});
		return [
			{ title: 'Moje recepty', items: mine },
			{ title: 'Máš doma', items: home },
			{ title: goodTitle, items: good },
			{ title: 'Ďalšie', items: rest }
		].filter((s) => s.items.length);
	});

	/** Composing from ingredients fits the savoury main and vegetable spots. */
	const composable = $derived(
		mode === 'slane' && (open?.id === 'hlavne' || open?.id === 'zelenina')
	);
	const composeHref = $derived(
		`/zloz?miesto=${open?.id ?? 'hlavne'}${query ? `&spat=${encodeURIComponent(query)}` : ''}`
	);

	function missingNames(part: Part): string {
		const method = pickMethod(part, kitchen.current);
		if (!method) return '';
		return matchPart(part, method, dish.servings, groups, catalog().ingredientsById)
			.missing.map((i) => i.name.toLowerCase())
			.slice(0, 3)
			.join(', ');
	}
	const minutesOf = (part: Part) =>
		(pickMethod(part, kitchen.current) ?? part.methods[0]).steps.reduce((s, x) => s + x.min, 0);

	/** Curated dishes as inspiration, cookable ones first. */
	const inspiration = $derived.by(() => {
		const { dishes, partsById, ingredientsById } = catalog();
		const sweet = (d: (typeof dishes)[number]) =>
			d.slots.some((sl) => partsById.get(sl.options[0])?.style.includes('sladke'));
		const ranked = rankDishes(
			dishes
				.filter((d) => sweet(d) === (mode === 'sladke'))
				.flatMap((d) => {
					const m = matchDish(
						d,
						ui.loaded ? pantry.current : {},
						partsById,
						ingredientsById,
						kitchen.current
					);
					return m ? [m] : [];
				})
		);
		return ranked.map((match) => {
			const b = { servings: match.dish.servings, choice: match.choice, methods: {} };
			const params = buildToParams(match.dish, b).toString();
			return {
				match,
				plate: composePlate(match.dish, b, kitchen.current, partsById, ingredientsById),
				href: `/jedlo/${match.dish.id}${params ? `?${params}` : ''}`
			};
		});
	});

	const kitchenSummary = $derived(
		[
			`${kitchen.current.burners} ${kitchen.current.burners === 1 ? 'platňa' : kitchen.current.burners < 5 ? 'platne' : 'platní'}`,
			...kitchen.current.tools.map((t) => TOOL_META[t].label.toLowerCase())
		].join(' · ')
	);
	const pct = (n: number) => `${(n / 300) * 100}%`;
</script>

<svelte:head>
	<title>Receptio – poskladaj si tanier</title>
	<meta
		name="description"
		content="Vegánske jedlo poskladané z toho, čo máš doma, a naplánované pre tvoju kuchyňu."
	/>
</svelte:head>

<div class="wrap page">
	<header class="hero">
		<h1>Poskladaj si {mode === 'sladke' ? 'misku' : 'tanier'}</h1>
		<div class="segmented mode" role="group" aria-label="Druh jedla">
			{#each BUILDER_MODES as m (m)}
				<button aria-pressed={mode === m} onclick={() => switchMode(m)}>{MODE_LABELS[m]}</button>
			{/each}
		</div>
		<a class="kitchen-strip" href="/kuchyna">
			<Icon name="jar" size={16} />
			{hasPantry ? `Špajza ${Object.keys(pantry.current).length}` : 'Prázdna špajza'} · {kitchenSummary}
		</a>
	</header>

	<section class="builder">
		<div class="stage" style:view-transition-name="plate">
			<BuiltPlate
				{filled}
				{empty}
				byId={catalog().ingredientsById}
				label={picked.length ? plateName(picked) : 'Prázdny tanier'}
			/>
			{#each slots as slot (slot.id)}
				{@const current = plate.parts.find((p) => p.slot.id === slot.id)}
				<button
					class="spot"
					class:filled={!!current}
					class:sauce={slot.id === 'omacka'}
					style:left={pct(SPOTS[slot.id].x)}
					style:top={pct(SPOTS[slot.id].y)}
					onclick={() => openPicker(slot)}
					aria-label="{slot.label}: {current ? current.part.name : 'vybrať'}"
				>
					{#if current}
						<span class="tag">{current.part.name}</span>
					{:else}
						<span class="plus"><Icon name="plus" size={18} stroke={2.4} /></span>
						<span class="tag empty-tag">{slot.label}</span>
					{/if}
				</button>
			{/each}
		</div>

		<div class="panel">
			<div class="actions">
				<button class="btn leaf surprise draw-host" onclick={surpriseMe}>
					<Icon name="sparkle" size={18} /> Prekvap ma
				</button>
				{#if picked.length}
					<button class="btn ghost small" onclick={clear}>
						<Icon name="undo" size={16} /> Odznova
					</button>
				{/if}
			</div>

			{#if picked.length}
				<div class="summary card">
					<p class="name">{plateName(picked)}</p>
					{#if verified}
						<a class="badge leaf" href="/jedlo/{verified.id}">
							<Icon name="check" size={13} stroke={2.6} /> Overené: {verified.name}
						</a>
					{:else}
						<span class="badge">
							Vlastná kombinácia{styles.size
								? ` · ${[...styles].map((s) => STYLE_LABELS[s]).join(', ')}`
								: ''}
						</span>
					{/if}
					<ul class="facts">
						<li><Icon name="clock" size={15} /> {formatMinutes(plate.timeline.total)}</li>
						<li>
							<Icon name="bean" size={15} />
							{formatNumber(plate.facts.perServing.protein, 0)} g
						</li>
						<li>
							<Icon name="flame" size={15} />
							{formatNumber(plate.facts.perServing.kcal, 0)} kcal
						</li>
						<li>
							<Icon name="euro" size={15} />
							{plate.facts.costIsEstimate ? '~' : ''}{formatEur(plate.facts.costPerServing)}
						</li>
					</ul>
					<div class="go">
						<a class="btn leaf" href="/jedlo/{dish.id}/varim?{query}">
							<Icon name="play" size={16} /> Variť
						</a>
						<a class="btn ghost" href="/jedlo/{dish.id}?{query}">Detail</a>
						<button class="icon-btn" onclick={planIt} aria-label="Do týždňa" title="Do týždňa">
							<Icon name="calendar" size={18} />
						</button>
					</div>
				</div>
			{:else}
				<p class="hint lead">
					Ťukni na miesto na tanieri a vyber, čo tam dáš. Navrchu uvidíš, čo máš doma a čo sa k tomu
					hodí.
				</p>
			{/if}
		</div>
	</section>

	<section class="inspiration">
		<h2>Overené kombinácie</h2>
		<div class="scroller cards">
			{#each inspiration as entry, i (entry.match.dish.id)}
				<div class="card-slot">
					<DishCard
						dish={entry.match.dish}
						plate={entry.plate}
						match={hasPantry ? entry.match : undefined}
						href={entry.href}
						index={i}
					/>
				</div>
			{/each}
		</div>
	</section>
</div>

<dialog
	class="sheet"
	bind:this={sheet}
	onclose={() => (open = null)}
	onclick={(e) => e.target === sheet && sheet?.close()}
>
	{#if open}
		{@const current = choice[open.id]}
		<div class="sheet-body">
			<header class="sheet-head">
				<span class="sheet-icon"><Icon name={open.icon} size={20} /></span>
				<h2>{open.label}</h2>
				<button class="icon-btn plain" onclick={() => sheet?.close()} aria-label="Zavrieť">
					<Icon name="x" size={20} />
				</button>
			</header>
			<label class="field">
				<Icon name="search" size={16} />
				<span class="sr-only">Hľadať</span>
				<input type="search" placeholder="Hľadať…" bind:value={search} />
			</label>
			{#if composable}
				<a class="compose draw-host" href={composeHref}>
					<span class="compose-icon"><Icon name="chef" size={22} /></span>
					<span>
						<strong>Zložiť zo surovín</strong>
						<small>Vyber spôsob a čo máš – recept sa poskladá sám</small>
					</span>
					<Icon name="arrow-right" size={18} />
				</a>
			{/if}
			{#if current}
				<button class="remove" onclick={() => pick(null)}>
					<Icon name="x" size={16} /> Nechať prázdne
				</button>
			{/if}
			{#each sections as section (section.title)}
				<h3>{section.title}</h3>
				<ul class="options">
					{#each section.items as c (c.part.id)}
						{@const method = pickMethod(c.part, kitchen.current) ?? c.part.methods[0]}
						<li>
							<button
								class="option"
								aria-pressed={current === c.part.id}
								disabled={!c.cookable}
								onclick={() => pick(c.part.id)}
							>
								<span class="opt-art">
									<PartArt part={c.part} {method} byId={catalog().ingredientsById} />
								</span>
								<span class="opt-text">
									<strong>{c.part.name}</strong>
									<span class="desc">{c.part.description}</span>
									<small>
										{#if !c.cookable}
											chýba spotrebič
										{:else if hasPantry && c.missing === 0}
											máš všetko · ~{formatMinutes(minutesOf(c.part))}
										{:else if hasPantry}
											kúpiť: {missingNames(c.part)}{c.missing > 3 ? '…' : ''}
										{:else}
											~{formatMinutes(minutesOf(c.part))}
										{/if}
									</small>
								</span>
								{#if current === c.part.id}<Icon name="check" size={18} stroke={2.4} />{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/each}
		</div>
	{/if}
</dialog>

<style>
	.hero {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--sp-2) var(--sp-4);
		margin-bottom: var(--sp-3);
	}
	.hero h1 {
		margin: 0;
		font-size: clamp(2rem, 6vw, 3rem);
	}
	.mode {
		order: 3;
		flex-basis: 100%;
		max-width: max-content;
	}
	.kitchen-strip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
		font-size: var(--fs-sm);
		text-decoration: none;
	}
	.kitchen-strip:hover {
		color: var(--ink);
	}
	.builder {
		display: grid;
		gap: var(--sp-4);
		align-items: center;
	}
	.stage {
		position: relative;
		width: min(100%, 460px);
		margin: 0 auto;
	}
	.spot {
		position: absolute;
		translate: -50% -50%;
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 4px;
		width: 30%;
		aspect-ratio: 1;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	.spot.sauce {
		width: 20%;
	}
	.spot:focus-visible {
		outline: 3px solid var(--leaf);
	}
	.plus {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--card);
		box-shadow: var(--shadow);
		color: var(--leaf);
		transition: transform 0.3s var(--ease-spring);
	}
	.spot:hover .plus {
		transform: scale(1.12) rotate(90deg);
	}
	.tag {
		max-width: 150%;
		padding: 2px 9px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--card) 90%, transparent);
		box-shadow: var(--shadow);
		font-size: var(--fs-xs);
		font-weight: 700;
		line-height: 1.3;
		text-align: center;
	}
	.filled .tag {
		translate: 0 80%;
		opacity: 0;
		transition: opacity 0.2s;
	}
	.filled:hover .tag,
	.filled:focus-visible .tag {
		opacity: 1;
	}
	.empty-tag {
		color: var(--ink-2);
	}
	.panel {
		display: grid;
		gap: var(--sp-3);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--sp-2);
	}
	.surprise {
		padding: 0.8em 1.4em;
	}
	.lead {
		margin: 0;
		text-align: center;
	}
	.summary {
		display: grid;
		gap: var(--sp-2);
		padding: var(--sp-4);
		animation: in 0.4s var(--ease-out);
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	.name {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--fs-lg);
		font-weight: 650;
		line-height: 1.25;
	}
	.summary .badge {
		justify-self: start;
		white-space: normal;
		text-decoration: none;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1) var(--sp-3);
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--ink-2);
		font-size: var(--fs-sm);
		font-weight: 650;
	}
	.facts li {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.go {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.go .btn.leaf {
		flex: 1;
		justify-content: center;
	}
	.inspiration {
		margin-top: var(--sp-6);
	}
	.inspiration h2 {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-xl);
	}
	.cards {
		padding-bottom: var(--sp-3);
	}
	.card-slot {
		display: grid;
		flex: none;
		width: min(72vw, 250px);
	}
	.sheet {
		width: min(560px, 100vw);
		max-width: 100vw;
		max-height: 88dvh;
		margin: auto auto 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius) var(--radius) 0 0;
		background: var(--paper);
		color: var(--ink);
		box-shadow: var(--shadow-lift);
	}
	.sheet[open] {
		animation: sheet-up 0.35s var(--ease-out);
	}
	@keyframes sheet-up {
		from {
			transform: translateY(40px);
			opacity: 0;
		}
	}
	.sheet::backdrop {
		background: var(--backdrop);
	}
	.sheet-body {
		display: grid;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--gutter) calc(var(--sp-5) + env(safe-area-inset-bottom));
	}
	.sheet-head {
		position: sticky;
		top: calc(-1 * var(--sp-3));
		z-index: 1;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) 0;
		background: var(--paper);
	}
	.sheet-head h2 {
		flex: 1;
		margin: 0;
	}
	.sheet-icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--leaf-soft);
		color: var(--leaf);
	}
	.sheet h3 {
		margin: var(--sp-3) 0 0;
		color: var(--muted);
		font-size: var(--fs-sm);
	}
	.compose {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3);
		border-radius: var(--radius-sm);
		background: linear-gradient(135deg, var(--leaf-soft), var(--card));
		border: 1.5px solid var(--leaf);
		color: var(--ink);
		text-decoration: none;
	}
	.compose span:nth-child(2) {
		display: grid;
	}
	.compose small {
		color: var(--ink-2);
	}
	.compose-icon {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--leaf);
		color: var(--paper);
	}
	.remove {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: 6px;
		border: 0;
		background: none;
		color: var(--tomato);
		font: inherit;
		font-weight: 650;
		cursor: pointer;
	}
	.options {
		display: grid;
		gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.option {
		display: grid;
		grid-template-columns: 56px 1fr auto;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		padding: var(--sp-2);
		border: 1.5px solid transparent;
		border-radius: var(--radius-sm);
		background: var(--card);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			border-color 0.2s,
			transform 0.2s var(--ease-spring);
	}
	.option:hover:not(:disabled) {
		border-color: var(--line);
		transform: translateX(3px);
	}
	.option[aria-pressed='true'] {
		border-color: var(--leaf);
		background: var(--leaf-soft);
	}
	.option:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.opt-art {
		align-self: start;
		width: 56px;
	}
	.opt-text {
		display: grid;
		min-width: 0;
	}
	.opt-text small {
		color: var(--muted);
	}
	.desc {
		color: var(--ink-2);
		font-size: var(--fs-sm);
		line-height: 1.35;
	}
	@media (min-width: 900px) {
		.builder {
			grid-template-columns: 1.1fr 1fr;
			gap: var(--sp-6);
		}
		.actions {
			justify-content: flex-start;
		}
		.lead {
			text-align: left;
		}
		.sheet {
			margin: auto;
			border-radius: var(--radius);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.summary,
		.sheet[open] {
			animation: none;
		}
	}
</style>

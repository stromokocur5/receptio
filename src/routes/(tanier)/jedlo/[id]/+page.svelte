<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { formatAmount, formatEur, formatMinutes, formatNumber } from '$lib/amounts';
	import { FREE_DISH_IDS } from '$lib/builder';
	import { findDish, resolveComposed, useDishCatalog } from '$lib/dish-catalog';
	import Icon from '$lib/components/Icon.svelte';
	import BuiltPlate from '$lib/components/BuiltPlate.svelte';
	import NutritionPanel from '$lib/components/NutritionPanel.svelte';
	import PartArt from '$lib/components/PartArt.svelte';
	import { placeParts } from '$lib/plate-art';
	import TimelineChart from '$lib/components/TimelineChart.svelte';
	import {
		buildFromParams,
		buildToParams,
		defaultChoice,
		MAX_SERVINGS,
		pickMethod,
		TOOL_META,
		usableMethods,
		type Build,
		type DishSlot,
		type Need,
		type Part,
		type PartMethod
	} from '$lib/dish';
	import { ALLERGEN_LABELS, treatText } from '$lib/nutrition';
	import { isAssumedAtHome, pantryByGroup } from '$lib/pantry';
	import { composePlate } from '$lib/plate';
	import { addPlate, kitchen, pantry, plates, ui } from '$lib/state.svelte';
	import { toast } from '$lib/toast.svelte';

	const catalog = useDishCatalog();
	const dish = $derived(findDish(catalog(), page.params.id!)!);

	let build = $state<Build>({ servings: 2, choice: {}, methods: {} });
	let ready = $state(false);

	$effect.pre(() => {
		// A new dish (navigating between dishes reuses this component) starts from its defaults.
		const d = dish;
		build = { servings: d.servings, choice: defaultChoice(d), methods: {} };
	});

	onMount(() => {
		const params = new URLSearchParams(location.search);
		resolveComposed(catalog(), params.values());
		build = buildFromParams(dish, params, catalog().partsById);
		ready = true;
	});

	const query = $derived(buildToParams(dish, build).toString());
	$effect(() => {
		if (!ready) return;
		const next = query ? `?${query}` : location.pathname;
		void tick().then(() => replaceState(next, page.state));
	});

	const plate = $derived(
		composePlate(dish, build, kitchen.current, catalog().partsById, catalog().ingredientsById)
	);
	const partOf = (id: string) => catalog().partsById.get(id)!;
	const picked = (slot: DishSlot) =>
		slot.id in build.choice ? build.choice[slot.id] : slot.options[0];
	const methodOf = (part: Part) => plate.parts.find((p) => p.part.id === part.id)?.method;

	function choose(slot: DishSlot, id: string | null) {
		build.choice = { ...build.choice, [slot.id]: id };
	}
	function chooseMethod(part: Part, method: PartMethod) {
		build.methods = { ...build.methods, [part.id]: method.label };
	}
	const minutesOf = (method: PartMethod) => method.steps.reduce((sum, s) => sum + s.min, 0);
	const needText = (need: Need) =>
		Array.isArray(need)
			? need.map((t) => TOOL_META[t].label.toLowerCase()).join(' alebo ')
			: TOOL_META[need].label.toLowerCase();
	function missingTools(method: PartMethod): string {
		const tools = new Set<string>(kitchen.current.tools);
		return method.needs
			.filter((n) => (Array.isArray(n) ? !n.some((t) => tools.has(t)) : !tools.has(n)))
			.map(needText)
			.join(', ');
	}

	const groups = $derived(
		ui.loaded ? pantryByGroup(pantry.current, catalog().ingredientsById) : new Map()
	);
	const lines = $derived(
		plate.lines
			.filter((l) => l.ingredientId !== 'voda')
			.map((l) => {
				const ingredient = catalog().ingredientsById.get(l.ingredientId)!;
				const home = groups.has(ingredient.group);
				return { line: l, ingredient, home, assumed: !home && isAssumedAtHome(ingredient) };
			})
	);
	const toBuy = $derived(lines.filter((l) => !l.home && !l.assumed));

	async function copyMissing() {
		const text = toBuy
			.map((l) => `${l.ingredient.name} – ${formatAmount(l.line.amount, l.line.unit)}`)
			.join('\n');
		try {
			await navigator.clipboard.writeText(text);
			toast('Zoznam na nákup je v schránke');
		} catch {
			toast('Kopírovanie nefunguje, prepíš si ho');
		}
	}

	const glutenLabel = $derived(
		plate.facts.gluten === 'free'
			? 'Bez lepku'
			: plate.facts.gluten === 'risk'
				? 'Lepok: kontroluj etiketu'
				: 'Obsahuje lepok'
	);
	const tips = $derived([...dish.tips, ...plate.parts.flatMap((p) => p.part.tips)]);
	const lanes = $derived([
		...plate.parts.map(({ part }) => ({ id: part.id, name: part.name })),
		...(dish.finish.length ? [{ id: null, name: 'Na tanier' }] : [])
	]);
	let justPlanned = $state(false);
	function planIt() {
		if (!addPlate(dish.id, query)) {
			toast('Týždeň je plný – niečo z neho najprv uvar alebo vyhoď');
			return;
		}
		justPlanned = true;
		setTimeout(() => (justPlanned = false), 1800);
		toast(`${plate.name} je v týždni`, () => (plates.current = plates.current.slice(0, -1)));
	}

	/** A free plate goes back to the builder it came from, sweet or savoury. */
	const backHref = $derived.by(() => {
		if (!dish.free) return '/tanier';
		const all = [dish.id === FREE_DISH_IDS.sladke ? 'typ=sladke' : '', query].filter(Boolean);
		return all.length ? `/tanier?${all.join('&')}` : '/tanier';
	});

	const cookHref = $derived(`/jedlo/${dish.id}/varim${query ? `?${query}` : ''}`);
</script>

<svelte:head>
	<title>{plate.name} – Receptio</title>
	<meta name="description" content={dish.description} />
</svelte:head>

<div class="wrap page">
	<a class="back" href={backHref}>
		<Icon name="arrow-left" size={16} />
		{dish.free ? 'Späť na tanier' : 'Poskladaj si tanier'}
	</a>

	<div class="layout">
		<header class="head">
			<h1>{plate.name}</h1>
			<p class="lede">{dish.description}</p>
			<div class="servings" role="group" aria-label="Počet porcií">
				<button
					class="icon-btn"
					onclick={() => (build.servings = Math.max(1, build.servings - 1))}
					disabled={build.servings <= 1}
					aria-label="Menej porcií"><Icon name="minus" size={18} /></button
				>
				<span aria-live="polite"
					><strong>{build.servings}</strong>
					{build.servings === 1 ? 'porcia' : build.servings < 5 ? 'porcie' : 'porcií'}</span
				>
				<button
					class="icon-btn"
					onclick={() => (build.servings = Math.min(MAX_SERVINGS, build.servings + 1))}
					disabled={build.servings >= MAX_SERVINGS}
					aria-label="Viac porcií"><Icon name="plus" size={18} /></button
				>
			</div>
		</header>
		<aside class="stage">
			<div class="plate-box">
				<div
					class="plate-pop"
					style:view-transition-name={dish.free ? 'plate' : `plate-${dish.id}`}
				>
					<BuiltPlate
						filled={placeParts(plate.parts)}
						byId={catalog().ingredientsById}
						label={plate.name}
					/>
				</div>
			</div>

			<dl class="facts">
				<div>
					<dt><Icon name="clock" size={16} /> Spolu</dt>
					<dd>{formatMinutes(plate.timeline.total)}</dd>
				</div>
				<div>
					<dt><Icon name="spoon" size={16} /> Z toho robíš</dt>
					<dd>{formatMinutes(plate.active)}</dd>
				</div>
				<div>
					<dt><Icon name="bean" size={16} /> Bielkoviny</dt>
					<dd>{formatNumber(plate.facts.perServing.protein, 0)} g</dd>
				</div>
				<div>
					<dt><Icon name="flame" size={16} /> Energia</dt>
					<dd>{formatNumber(plate.facts.perServing.kcal, 0)} kcal</dd>
				</div>
				<div>
					<dt><Icon name="euro" size={16} /> Porcia</dt>
					<dd>
						{plate.facts.costIsEstimate ? '~' : ''}{formatEur(plate.facts.costPerServing)}
					</dd>
				</div>
			</dl>
			<ul class="labels">
				<li class="badge" class:leaf={plate.facts.gluten === 'free'}>
					<Icon name={plate.facts.gluten === 'free' ? 'wheat-off' : 'wheat'} size={14} />
					{glutenLabel}
				</li>
				{#each plate.facts.allergens as a (a)}
					<li class="badge turmeric">{ALLERGEN_LABELS[a]}</li>
				{/each}
				{#if plate.facts.treat.length}
					<li class="badge tomato" title={treatText(plate.facts.treat)}>Na občas</li>
				{/if}
			</ul>
			<p class="hint">Na porciu. Ceny podľa obchodov, kde ich máme, inak odhad.</p>
		</aside>

		<div class="content">
			<section class="builder" aria-label="Zloženie jedla">
				{#each dish.free ? dish.slots.filter((sl) => picked(sl) !== null) : dish.slots as slot (slot.id)}
					{@const current = picked(slot)}
					<div class="slot card">
						<div class="slot-head">
							<h2>{slot.label}</h2>
							{#if slot.optional && !dish.free}
								<button
									class="toggle"
									role="switch"
									aria-checked={current !== null}
									aria-label="{slot.label}: {current === null ? 'vynechané' : 'pridané'}"
									onclick={() => choose(slot, current === null ? slot.options[0] : null)}
								>
									<span class="knob"></span>
								</button>
							{/if}
						</div>
						{#if current !== null}
							{#if slot.options.length > 1 && !dish.free}
								<div class="options" role="radiogroup" aria-label={slot.label}>
									{#each slot.options as id (id)}
										{@const option = partOf(id)}
										{@const can = usableMethods(option, kitchen.current).length > 0}
										<button
											class="option"
											role="radio"
											aria-checked={current === id}
											disabled={!can}
											title={can ? undefined : `Potrebuješ ${missingTools(option.methods[0])}`}
											onclick={() => choose(slot, id)}
										>
											<span class="mini">
												<PartArt
													part={option}
													method={option.methods[0]}
													byId={catalog().ingredientsById}
												/>
											</span>
											<span class="option-name">{option.name}</span>
										</button>
									{/each}
								</div>
							{:else}
								<p class="only">{partOf(current).name}</p>
							{/if}
							{@const part = partOf(current)}
							{@const method = methodOf(part)}
							<p class="part-desc">
								{#if slot.options.length > 1 && !dish.free}<strong>{part.name}:</strong>{/if}
								{part.description}
								{#if part.id.startsWith('x.')}
									<a
										href="/tanier/zloz?recept={encodeURIComponent(
											part.id
										)}&miesto={slot.id}&spat={encodeURIComponent(query)}">Upraviť recept</a
									>
								{/if}
							</p>
							{#if part.methods.length > 1}
								<div class="methods" role="radiogroup" aria-label="Ako pripraviť: {part.name}">
									{#each part.methods as m (m.label)}
										{@const missing = missingTools(m)}
										<button
											class="method"
											role="radio"
											aria-checked={method?.label === m.label}
											disabled={!!missing}
											onclick={() => chooseMethod(part, m)}
										>
											<span>{m.label}</span>
											<small
												>{missing ? `chýba ${missing}` : `~${formatMinutes(minutesOf(m))}`}</small
											>
										</button>
									{/each}
								</div>
							{/if}
							{#if !pickMethod(part, kitchen.current)}
								<p class="notice warn">
									<Icon name="alert" size={18} />
									<span
										>Toto v tvojej kuchyni nespravíš – potrebuješ {missingTools(
											part.methods[0]
										)}.</span
									>
								</p>
							{/if}
						{:else}
							<p class="hint">Vynechané.</p>
						{/if}
					</div>
				{/each}
			</section>

			{#if plate.ahead.length}
				<div class="notice warn">
					<Icon name="calendar" size={18} />
					<div>
						<strong>Deň vopred</strong>
						{#each plate.ahead as a (a.part)}<p>{a.part}: {a.text}</p>{/each}
					</div>
				</div>
			{/if}

			<section class="card box">
				<h2 class="section-title"><Icon name="leaf" size={20} /> Výživa na porciu</h2>
				<NutritionPanel values={plate.facts.perServing} />
			</section>

			<section class="card box plan">
				<h2 class="section-title"><Icon name="timer" size={20} /> Ako to pôjde</h2>
				<p class="hint">
					Naplánované pre {kitchen.current.burners}
					{kitchen.current.burners === 1 ? 'platňu' : 'platne'}{kitchen.current.tools.includes(
						'rura'
					)
						? ' a rúru'
						: ''}, aby všetko teplé bolo hotové naraz.
					<a href="/tanier/kuchyna#vybavenie">Zmeniť kuchyňu</a>
				</p>
				<TimelineChart timeline={plate.timeline} {lanes} />
			</section>

			<section class="card box">
				<h2 class="section-title">
					<Icon name="basket" size={20} /> Suroviny
					{#if ui.loaded && Object.keys(pantry.current).length}
						<span class="badge" class:leaf={!toBuy.length}
							>{toBuy.length ? `kúpiť ${toBuy.length}` : 'všetko máš'}</span
						>
					{/if}
				</h2>
				<ul class="ingredients">
					{#each lines as { line, ingredient, home, assumed } (`${line.ingredientId}${line.unit}${line.notEaten}`)}
						<li class:home class:assumed>
							<span class="swatch" style:--c={ingredient.color}></span>
							<span class="ing-name">
								{ingredient.name}
								{#if line.note}<small>{line.note}</small>{/if}
							</span>
							<span class="amount">{formatAmount(line.amount, line.unit)}</span>
							{#if home}<Icon name="check" size={16} label="máš doma" />{/if}
						</li>
					{/each}
				</ul>
				{#if ui.loaded && toBuy.length && Object.keys(pantry.current).length}
					<button class="btn ghost small" onclick={copyMissing}>
						<Icon name="copy" size={16} /> Skopírovať, čo kúpiť
					</button>
				{/if}
			</section>

			{#if tips.length}
				<section class="card box">
					<h2 class="section-title"><Icon name="sparkle" size={20} /> Dobré vedieť</h2>
					<ul class="tips">
						{#each tips as tip (tip)}<li>{tip}</li>{/each}
					</ul>
				</section>
			{/if}
		</div>
	</div>
</div>

<div class="cta-bar">
	<button class="btn ghost cta" onclick={planIt}>
		<Icon name={justPlanned ? 'check' : 'calendar'} size={18} />
		{justPlanned ? 'V týždni' : 'Do týždňa'}
	</button>
	<a class="btn leaf cta" href={cookHref}>
		<Icon name="play" size={18} /> Variť · {formatMinutes(plate.timeline.total)}
	</a>
</div>

<style>
	.layout {
		display: grid;
		grid-template-areas: 'head' 'stage' 'content';
		gap: var(--sp-5);
		margin-top: var(--sp-3);
	}
	.head {
		grid-area: head;
	}
	.stage {
		grid-area: stage;
	}
	.content {
		grid-area: content;
	}
	.stage {
		display: grid;
		gap: var(--sp-3);
		align-content: start;
	}
	.plate-box {
		display: grid;
		place-items: center;
	}
	.plate-pop {
		width: min(340px, 82vw);
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: var(--sp-2);
		margin: 0;
	}
	.facts div {
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		background: var(--card);
		border: 1px solid var(--line);
	}
	.facts dt {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--muted);
		font-size: var(--fs-xs);
		font-weight: 700;
	}
	.facts dd {
		margin: 2px 0 0;
		font-family: var(--font-display);
		font-size: var(--fs-lg);
		font-weight: 650;
	}
	.labels {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.stage .hint {
		margin: 0;
	}
	.content {
		display: grid;
		gap: var(--sp-4);
		min-width: 0;
	}
	.head h1 {
		margin: 0;
	}
	.head .lede {
		margin: var(--sp-2) 0 var(--sp-3);
	}
	.servings {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-3);
		padding: 4px;
		border-radius: 999px;
		background: var(--card);
		border: 1px solid var(--line);
	}
	.servings span {
		min-width: 6.5em;
		text-align: center;
	}
	.builder {
		display: grid;
		gap: var(--sp-3);
	}
	.slot {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
	}
	.slot-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}
	.slot h2 {
		margin: 0;
		font-size: var(--fs-lg);
	}
	.only {
		margin: 0;
		font-weight: 650;
	}
	.part-desc {
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-sm);
	}
	.slot .hint {
		margin: 0;
	}
	.toggle {
		position: relative;
		flex: none;
		width: 52px;
		height: 30px;
		border: 0;
		border-radius: 999px;
		background: var(--line);
		cursor: pointer;
		transition: background 0.25s;
	}
	.toggle[aria-checked='true'] {
		background: var(--leaf);
	}
	.knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--card);
		box-shadow: var(--shadow);
		transition: transform 0.3s var(--ease-spring);
	}
	.toggle[aria-checked='true'] .knob {
		transform: translateX(22px);
	}
	.options {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
		gap: var(--sp-2);
	}
	.option {
		display: grid;
		justify-items: center;
		gap: 4px;
		padding: var(--sp-2) var(--sp-2) var(--sp-3);
		border: 2px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--card);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
		transition:
			border-color 0.2s,
			transform 0.25s var(--ease-spring),
			background 0.2s;
	}
	.option:hover:not(:disabled) {
		transform: translateY(-2px);
		border-color: var(--ink-2);
	}
	.option[aria-checked='true'] {
		border-color: var(--leaf);
		background: var(--leaf-soft);
	}
	.option:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.mini {
		width: 64px;
		transition: transform 0.4s var(--ease-spring);
	}
	.option[aria-checked='true'] .mini {
		transform: rotate(-10deg) scale(1.06);
	}
	.option-name {
		font-size: var(--fs-sm);
		font-weight: 650;
		line-height: 1.2;
		text-align: center;
	}
	.methods {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.method {
		display: grid;
		gap: 1px;
		padding: var(--sp-2) var(--sp-3);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--ink);
		font: inherit;
		font-weight: 650;
		font-size: var(--fs-sm);
		text-align: left;
		cursor: pointer;
		transition:
			background 0.2s,
			border-color 0.2s;
	}
	.method small {
		color: var(--muted);
		font-weight: 600;
		font-size: var(--fs-xs);
	}
	.method[aria-checked='true'] {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--paper);
	}
	.method[aria-checked='true'] small {
		color: color-mix(in srgb, var(--paper) 75%, transparent);
	}
	.method:disabled {
		cursor: not-allowed;
		border-style: dashed;
		color: var(--muted);
	}
	.notice p {
		margin: var(--sp-1) 0 0;
	}
	.plan .hint {
		margin-top: 0;
	}
	.ingredients {
		display: grid;
		gap: 2px;
		margin: 0 0 var(--sp-3);
		padding: 0;
		list-style: none;
	}
	.ingredients li {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) 0;
		border-bottom: 1px dashed var(--line);
	}
	.ingredients li.home {
		color: var(--leaf);
	}
	.ingredients li.assumed .ing-name {
		color: var(--ink-2);
	}
	.ing-name small {
		display: block;
		color: var(--muted);
		font-size: var(--fs-xs);
	}
	.amount {
		font-weight: 650;
		white-space: nowrap;
	}
	.tips {
		margin: 0;
		padding-left: 1.2em;
		display: grid;
		gap: var(--sp-2);
	}
	.cta-bar {
		position: sticky;
		bottom: calc(84px + env(safe-area-inset-bottom));
		z-index: 30;
		display: flex;
		justify-content: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--gutter);
		pointer-events: none;
	}
	.cta {
		pointer-events: auto;
		padding: 0.9em 1.3em;
		font-size: var(--fs-base);
		box-shadow: var(--shadow-lift);
	}
	.cta.ghost {
		background: var(--card);
	}
	@media (min-width: 900px) {
		.layout {
			grid-template-columns: minmax(280px, 380px) 1fr;
			grid-template-areas: 'stage head' 'stage content';
			grid-template-rows: auto 1fr;
			align-items: start;
			gap: var(--sp-4) var(--sp-6);
		}
		.stage {
			position: sticky;
			top: calc(var(--header-h) + var(--sp-4));
		}
		.cta-bar {
			bottom: var(--sp-4);
		}
	}
	@media (prefers-reduced-motion: reduce) {
	}
</style>

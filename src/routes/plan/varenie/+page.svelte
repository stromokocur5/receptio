<script lang="ts">
	import { formatGrams } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import { scaleStep } from '$lib/cooking';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { asPlanned, formatMinutes, packingTips, prepList, prepSchedule } from '$lib/mealprep';
	import { approxPieces } from '$lib/shopping';
	import { markCooked, plan, ui, undoCooked, type CookUndo } from '$lib/state.svelte';

	const catalog = useCatalog();

	/** Plan entries with their recipe; unknown recipes (removed from the site) are skipped. */
	const entries = $derived(
		plan.current.flatMap((entry, index) => {
			const recipe = catalog.recipesById.get(entry.recipeId);
			// Freezer portions are already cooked.
			return recipe && !entry.fromFreezer
				? [{ entry, recipe: asPlanned(recipe, entry.variant), key: `${index}-${entry.recipeId}` }]
				: [];
		})
	);
	/** Dishes that don't keep (fridge 0) are cooked on the day, not ahead. */
	const keepsAhead = (r: (typeof entries)[number]['recipe']) => (r.keeps?.fridge ?? 2) > 0;

	let excluded = $state<string[]>([]);
	const chosen = $derived(entries.filter((e) => !excluded.includes(e.key) && keepsAhead(e.recipe)));
	const schedule = $derived(prepSchedule(chosen));
	const chopping = $derived(prepList(chosen, catalog.ingredientsById));
	const aheadNotes = $derived(chosen.filter((e) => e.recipe.ahead));
	const ovenCount = $derived(chosen.filter((e) => e.recipe.equipment.includes('rura')).length);

	/** When the session starts, so the plan reads in clock times. */
	let startAt = $state('14:00');
	/**
	 * Quarter hours through the day: a list instead of a time field, which shows AM/PM in
	 * browsers set to English.
	 */
	const START_TIMES = Array.from({ length: (22 - 6) * 4 + 1 }, (_, i) => {
		const minutes = 6 * 60 + i * 15;
		return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
	});
	const clock = (minutes: number) => {
		const [h, m] = startAt.split(':').map(Number);
		const total = (h || 0) * 60 + (m || 0) + Math.round(minutes);
		return `${Math.floor(total / 60) % 24}:${String(total % 60).padStart(2, '0')}`;
	};

	let doneMessage = $state('');
	let undos: CookUndo[] = [];
	/** All of it back, newest first, as if "all cooked" was never tapped. */
	function uncookAll() {
		for (const undo of undos.toReversed()) undoCooked(undo);
		undos = [];
		doneMessage = '';
	}
	/** Everything cooked: pantry, history and the freezer get it all at once. */
	function allCooked() {
		const titles = [];
		undos = [];
		// Cooking takes the entries off the plan, which changes `chosen` – go through a copy.
		for (const e of [...chosen]) {
			const original = catalog.recipesById.get(e.entry.recipeId)!;
			const variant = e.entry.variant
				? original.variants.find((v) => v.name === e.entry.variant)
				: undefined;
			const { undo } = markCooked(
				e.entry.recipeId,
				e.entry.variant,
				e.entry.servings,
				(variant ?? original).lines,
				original.servings,
				catalog.ingredientsById,
				original.title,
				// Cooked ahead: it's all eaten later, from the fridge.
				0
			);
			undos.push(undo);
			titles.push(original.title);
		}
		doneMessage = `Hotovo: ${titles.join(', ')}. Zo špajze ubudlo, čo sa minulo, a uvarené jedlo je v chladničke a porcie na zamrazenie v mrazničke.`;
	}

	function toggle(key: string) {
		excluded = excluded.includes(key) ? excluded.filter((k) => k !== key) : [...excluded, key];
	}

	/** Steps load when a recipe is opened; the catalog doesn't carry them. */
	type RecipeSteps = { steps: string[]; variants?: Record<string, string[]> };
	let steps = $state<Record<string, RecipeSteps | 'error'>>({});
	async function loadSteps(recipeId: string) {
		if (steps[recipeId]) return;
		try {
			const res = await fetch(`/recepty/${recipeId}/kroky.json`);
			if (!res.ok) throw new Error(String(res.status));
			steps[recipeId] = (await res.json()) as RecipeSteps;
		} catch {
			steps[recipeId] = 'error';
		}
	}

	/** The dish's own packing advice; the one that holds for everything is shown once below. */
	const tipsFor = (r: (typeof entries)[number]['recipe']) =>
		packingTips(r, catalog.ingredientsById).slice(0, -1);
	/**
	 * Each piece of advice once, with the dishes it's for: two saucy dishes would otherwise
	 * repeat the same two paragraphs under each of them.
	 */
	const packing = $derived.by(() => {
		const byTip = new Map<string, string[]>();
		for (const e of chosen) {
			for (const tip of tipsFor(e.recipe))
				byTip.set(tip, [...(byTip.get(tip) ?? []), e.recipe.title]);
		}
		return [...byTip].map(([tip, titles]) => ({
			tip,
			// Said of every dish, it needs no names.
			titles: chosen.length > 1 && titles.length === chosen.length ? [] : titles
		}));
	});
	const boxes = (n: number) => `${n} ${n === 1 ? 'krabička' : n < 5 ? 'krabičky' : 'krabičiek'}`;

	function keepsText(r: (typeof entries)[number]['recipe']): string {
		const fridge = r.keeps?.fridge ?? 2;
		const freezer = r.keeps?.freezer ?? 0;
		const days = fridge === 1 ? 'deň' : fridge < 5 ? 'dni' : 'dní';
		return `v chladničke ${fridge} ${days}${freezer ? `, v mrazničke ${freezer} mes.` : ''}`;
	}
</script>

<Seo
	title="Navar naraz"
	description="Uvar recepty z plánu v jeden deň: čo nakrájať naraz, v akom poradí variť a ako dlho čo vydrží."
/>

<div class="wrap page">
	<header class="rise">
		<a class="back" href="/plan"><Icon name="arrow-left" size={18} /> Plán a nákup</a>
		<p class="eyebrow">Meal prep</p>
		<h1>Navar naraz, jedz celý týždeň</h1>
		<p class="lede">
			Jedno popoludnie v kuchyni namiesto každodenného varenia. Cibuľu krájaš raz, dlhé veci sa
			varia samy, kým robíš ostatné, a do krabičiek to máš na päť dní.
		</p>
	</header>

	{#if !ui.loaded}
		<p class="muted">Načítavam…</p>
	{:else if entries.length === 0}
		<section class="card box">
			<div class="empty">
				<Icon name="pot" size={32} />
				<p>V pláne zatiaľ nič nie je. Pridaj recepty a potom sa sem vráť.</p>
				<a class="btn leaf" href="/plan#navrh"
					><Icon name="sparkle" size={18} /> Navrhni mi týždeň</a
				>
			</div>
		</section>
	{:else}
		<section class="card box">
			<h2 class="section-title"><Icon name="check" size={24} /> Čo navaríš</h2>
			<ul class="pick divided">
				{#each entries as e (e.key)}
					{@const ahead = keepsAhead(e.recipe)}
					<li>
						<label class="check" class:off={!ahead}>
							<input
								type="checkbox"
								checked={ahead && !excluded.includes(e.key)}
								disabled={!ahead}
								onchange={() => toggle(e.key)}
							/>
							<span>
								<strong>{e.recipe.title}</strong>
								<small>
									{e.entry.servings} porc. ·
									{ahead ? keepsText(e.recipe) : 'nevydrží, sprav ho v deň jedla'}
								</small>
							</span>
						</label>
					</li>
				{/each}
			</ul>
			{#if chosen.length > 1}
				<p class="notice ok saving">
					<Icon name="clock" size={20} />
					<span>
						Spolu asi <strong>{formatMinutes(schedule.total)}</strong>
						{#if schedule.oneByOne > schedule.total}
							namiesto {formatMinutes(schedule.oneByOne)} pri varení jedného po druhom.
						{/if}
					</span>
				</p>
			{/if}
		</section>

		{#if chosen.length}
			{#if aheadNotes.length}
				<section class="card box">
					<h2 class="section-title"><Icon name="moon" size={24} /> Deň vopred</h2>
					<ul class="notes divided">
						{#each aheadNotes as e (e.key)}
							<li><strong>{e.recipe.title}:</strong> {e.recipe.ahead}</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if chopping.length}
				<section class="card box">
					<h2 class="section-title">
						<Icon name="knife" size={24} /> Najprv všetko umy a nakrájaj
					</h2>
					<p class="hint lead">
						Rozlož si misky. Čo ide do viacerých jedál, krájaj naraz a rozdeľ.
					</p>
					<ul class="chop divided">
						{#each chopping as c (c.ingredient.id)}
							<li>
								<span class="swatch" style:--c={c.ingredient.color}></span>
								<span class="chop-name">
									<strong>{c.ingredient.name}</strong>
									<small>{c.usedIn.join(' · ')}</small>
								</span>
								<span class="amt">{formatGrams(c.grams)}{approxPieces(c.ingredient, c.grams)}</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="card box">
				<h2 class="section-title"><Icon name="pot" size={24} /> V tomto poradí</h2>
				<p class="hint lead">
					Najdlhšie veci idú prvé – kým sa dusia alebo pečú, pripravíš ďalšie.
					{#if ovenCount > 1}
						{ovenCount} jedlá idú do rúry: peč ich naraz, ak majú podobnú teplotu, alebo jedno po druhom
						bez vypínania.
					{/if}
				</p>
				<div class="start">
					<label>
						Začínam o
						<select class="input sm" bind:value={startAt}>
							{#each START_TIMES as time (time)}<option value={time}>{time}</option>{/each}
						</select>
					</label>
					<span class="muted">hotové okolo <strong>{clock(schedule.total)}</strong></span>
				</div>
				<div
					class="gantt"
					role="img"
					aria-label="Časová os: {schedule.slots
						.map((s) => `${s.recipe.title} od ${clock(s.start)} do ${clock(s.end)}`)
						.join(', ')}"
				>
					{#each schedule.slots as slot, i (slot.recipe.id + i)}
						<div class="gantt-row">
							<span class="gantt-name">{slot.recipe.title}</span>
							<span class="gantt-track">
								<span
									class="active"
									style:left="{(slot.start / schedule.total) * 100}%"
									style:width="{(slot.recipe.activeTime / schedule.total) * 100}%"
								></span>
								<span
									class="passive"
									style:left="{((slot.start + slot.recipe.activeTime) / schedule.total) * 100}%"
									style:width="{((slot.recipe.time - slot.recipe.activeTime) / schedule.total) *
										100}%"
								></span>
							</span>
							<span class="gantt-time">{clock(slot.start)}–{clock(slot.end)}</span>
						</div>
					{/each}
					<p class="legend small">
						<span><i class="active"></i> robíš ty</span>
						<span><i class="passive"></i> varí sa / pečie samo</span>
					</p>
				</div>
				<ol class="timeline divided">
					{#each schedule.slots as slot, i (slot.recipe.id + i)}
						{@const loaded = steps[slot.recipe.id]}
						{@const list =
							!loaded || loaded === 'error'
								? loaded
								: (slot.entry.variant && loaded.variants?.[slot.entry.variant]) || loaded.steps}
						<li>
							<span class="when">{clock(slot.start)}</span>
							<details
								class="disclosure"
								ontoggle={(ev) => {
									if ((ev.currentTarget as HTMLDetailsElement).open) void loadSteps(slot.recipe.id);
								}}
							>
								<summary>
									<span class="summary-text">
										<strong>{slot.recipe.title}</strong>
										<small>
											{slot.recipe.activeTime} min práce{#if slot.recipe.time > slot.recipe.activeTime},
												potom
												{slot.recipe.time - slot.recipe.activeTime} min samo{/if} · hotové o {clock(
												slot.end
											)}
										</small>
									</span>
								</summary>
								{#if list === 'error'}
									<p class="notice danger">
										<Icon name="alert" size={18} /> Kroky sa nenačítali.
										<a href="/recepty/{slot.recipe.id}">Otvor recept</a>.
									</p>
								{:else if list}
									<ol class="steps">
										{#each list as step, s (s)}
											<li>{scaleStep(step, slot.entry.servings / slot.recipe.servings)}</li>
										{/each}
									</ol>
									<a class="small" href="/recepty/{slot.recipe.id}">Celý recept a režim varenia</a>
								{:else}
									<p class="muted small loading">Načítavam kroky…</p>
								{/if}
							</details>
						</li>
					{/each}
				</ol>
			</section>

			<section class="card box">
				<h2 class="section-title"><Icon name="fridge" size={24} /> Do krabičiek</h2>
				<p class="hint lead">
					Nechaj vychladnúť najviac 2 hodiny a hneď do chladničky. Čo nezješ do troch dní, zamraz
					hneď, nie až keď sa minie čas.
				</p>
				<ul class="notes divided">
					{#each chosen as e (e.key)}
						<li>
							<strong>{e.recipe.title}:</strong>
							{boxes(Math.round(e.entry.servings))} · {keepsText(e.recipe)}{#if e.entry.freezeExtra}
								· <strong>{e.entry.freezeExtra} porc. hneď do mrazničky</strong>{/if}
						</li>
					{/each}
				</ul>
				{#if packing.length}
					<h3 class="pack-title">Ako zabaliť</h3>
					<ul class="pack">
						{#each packing as { tip, titles } (tip)}
							<li>
								{#if titles.length && chosen.length > 1}<strong>{titles.join(', ')}:</strong
									>{' '}{/if}{tip}
							</li>
						{/each}
					</ul>
				{/if}
				<p class="hint">
					Na každú krabičku papierovú pásku: čo to je a dátum. Do práce na dlhšiu cestu chladiacu
					tašku s vreckom ľadu. Viac v <a href="/wiki/meal-prep">návode na meal prep</a>.
				</p>
			</section>

			<section class="card box done">
				{#if doneMessage}
					<p class="notice ok" role="status"><Icon name="check" size={18} /> {doneMessage}</p>
					<div class="actions">
						<a class="btn leaf" href="/plan">Späť na plán</a>
						<button class="btn ghost" onclick={uncookAll}>Vrátiť – ešte nie je uvarené</button>
					</div>
				{:else}
					<h2 class="section-title"><Icon name="check" size={24} /> Všetko v krabičkách?</h2>
					<div class="actions">
						<button class="btn leaf" onclick={allCooked}>
							<Icon name="check" size={18} /> Všetko uvarené
						</button>
					</div>
					<p class="hint">
						Odpočíta suroviny zo špajze, zapíše varenie do histórie a porcie na zamrazenie pridá do
						mrazničky.
					</p>
				{/if}
			</section>
		{/if}
	{/if}
</div>

<style>
	.page {
		display: grid;
		gap: 20px;
		max-width: 820px;
	}
	.page > header > .back {
		margin-bottom: var(--sp-2);
	}
	ul,
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	small {
		color: var(--muted);
		font-size: var(--fs-sm);
	}
	.lead {
		margin: 0 0 var(--sp-3);
	}
	.check > span {
		display: flex;
		flex-direction: column;
	}
	.off {
		cursor: default;
	}
	.off strong {
		color: var(--ink-2);
	}
	.saving > :global(svg) {
		color: var(--leaf);
	}
	.notes li {
		padding: var(--sp-2) 0;
	}
	.chop li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
	}
	.chop-name {
		display: flex;
		flex-direction: column;
	}
	.amt {
		font-weight: 650;
		white-space: nowrap;
	}
	.start {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2) var(--sp-4);
		margin: var(--sp-2) 0 var(--sp-3);
	}
	.start label {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		font-weight: 600;
	}
	.gantt {
		display: grid;
		gap: 6px;
		margin-bottom: var(--sp-4);
	}
	.gantt-row {
		display: grid;
		grid-template-columns: minmax(90px, 30%) 1fr auto;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
	}
	.gantt-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.gantt-track {
		position: relative;
		height: 14px;
		border-radius: 999px;
		background: var(--paper-2);
	}
	.gantt-track span {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 999px;
	}
	.active {
		background: var(--leaf);
	}
	.passive {
		background: color-mix(in srgb, var(--leaf) 35%, var(--card));
	}
	.gantt-time {
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1) var(--sp-4);
		margin: var(--sp-1) 0 0;
		color: var(--ink-2);
	}
	.legend i {
		display: inline-block;
		width: 18px;
		height: 8px;
		border-radius: 999px;
		vertical-align: middle;
	}
	.timeline > li {
		display: grid;
		grid-template-columns: 4em minmax(0, 1fr);
		gap: var(--sp-3);
		padding: 6px 0;
	}
	.when {
		font-weight: 700;
		color: var(--leaf);
		font-size: var(--fs-md);
		font-variant-numeric: tabular-nums;
		padding-top: 10px;
	}
	/* A whole row to tap, with a chevron that says it opens. */
	summary {
		gap: var(--sp-3);
		padding: 4px 0;
	}
	.summary-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	summary:hover strong {
		text-decoration: underline;
		text-decoration-thickness: 1.5px;
		text-underline-offset: 3px;
	}
	.steps {
		list-style: decimal;
		padding-left: 1.3em;
		margin: 10px 0;
		display: grid;
		gap: 6px;
	}
	.loading {
		margin: var(--sp-2) 0;
	}
	.pack-title {
		margin: var(--sp-4) 0 var(--sp-1);
		font-size: var(--fs-base);
	}
	.pack {
		margin: 0;
		padding-left: 18px;
		list-style: disc;
		color: var(--ink-2);
		font-size: var(--fs-md);
	}
	.pack li {
		padding: 2px 0;
	}
	.pack strong {
		color: var(--ink);
		font-weight: 650;
	}
	.done .notice {
		margin: 0 0 var(--sp-3);
	}
	.done .hint {
		margin-top: var(--sp-3);
	}
	.done .actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
</style>

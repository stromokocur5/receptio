<script lang="ts">
	import { formatEur, formatGrams, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import GardenBeds from '$lib/components/GardenBeds.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import WeatherPanel from '$lib/components/WeatherPanel.svelte';
	import {
		bedPlants,
		encodeShared,
		harvestRecipes,
		harvestTotals,
		monthTasks,
		successors,
		type TaskKind
	} from '$lib/garden';
	import { bestPrice } from '$lib/pricing';
	import { IN_MONTH } from '$lib/season';
	import { garden, pantry, setPantryItem, settings } from '$lib/state.svelte';
	import type { GardenDiary } from '$lib/state.svelte';
	import type { GrowCombo, GrowGuide } from '$lib/types';

	let {
		diary,
		guides,
		combos,
		onplan,
		oncrop
	}: {
		diary: GardenDiary;
		guides: GrowGuide[];
		combos: GrowCombo[];
		/** Switches to the planner. */
		onplan: () => void;
		/** Opens a crop's guide. */
		oncrop: (ingredientId: string) => void;
	} = $props();

	const catalog = useCatalog();
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth() + 1;
	const nextMonth = (month % 12) + 1;
	const today = now.toISOString().slice(0, 10);

	const PLACE = { parapet: 'v byte', balkon: 'na balkóne', zahrada: 'v záhrade' } as const;
	const KIND_LABEL: Record<TaskKind, string> = {
		indoor: 'Predpestuj doma',
		sow: 'Zasej alebo vysaď von',
		harvest: 'Zbieraj'
	};

	const guideById = $derived(new Map(guides.map((g) => [g.ingredientId, g])));
	/** The planner's plants plus whatever is drawn in the beds. */
	const plants = $derived.by(() => {
		const counts = new Map(diary.plants.map((p) => [p.ingredientId, p.count]));
		for (const bed of diary.beds) {
			for (const p of bedPlants(bed, guides)) {
				counts.set(p.ingredientId, Math.max(counts.get(p.ingredientId) ?? 0, p.count || 1));
			}
		}
		return [...counts].map(([ingredientId, count]) => ({ ingredientId, count }));
	});
	const tasks = $derived(monthTasks(plants, guides, diary.done, year, month));
	const upcoming = $derived(
		monthTasks(plants, guides, diary.done, nextMonth === 1 ? year + 1 : year, nextMonth)
			.filter((t) => t.kind !== 'harvest')
			.map((t) => t.name)
	);
	const harvestNow = $derived(tasks.filter((t) => t.kind === 'harvest'));
	const doneCount = $derived(tasks.filter((t) => diary.done[t.key]).length);
	const QUICK_GRAMS = [100, 250, 500, 1000];
	const totals = $derived(harvestTotals(diary.harvests, year));
	const recipes = $derived(
		harvestRecipes(
			catalog.recipes,
			harvestNow.map((t) => t.ingredientId)
		)
	);

	const priceToday = new Date(catalog.builtAt);
	const perKg = (id: string) => {
		const ingredient = catalog.ingredientsById.get(id);
		return ingredient ? bestPrice(ingredient, catalog.prices, priceToday).perKg : 0;
	};
	const harvestValue = $derived(
		totals.reduce((sum, t) => sum + (t.grams / 1000) * perKg(t.ingredientId), 0)
	);

	/** Frost matters while tender crops are out, or about to go out. */
	const tender = (g: GrowGuide | undefined) => !!g && Math.min(...g.sow) >= 5;
	const outNow = $derived(
		plants.some((p) => {
			const g = guideById.get(p.ingredientId);
			return tender(g) && g!.harvest.some((m) => m >= month) && Math.min(...g!.sow) <= month;
		})
	);
	const plantingNow = $derived(
		plants.some(
			(p) =>
				tender(guideById.get(p.ingredientId)) && guideById.get(p.ingredientId)!.sow.includes(month)
		)
	);

	/** What can follow crops that finish this month or next, on the same spot. */
	const followUps = $derived(
		plants
			.map((p) => guideById.get(p.ingredientId))
			.filter((g): g is GrowGuide => !!g)
			.filter((g) => {
				const last = Math.max(...g.harvest.filter((m) => m <= 8));
				return last === month || last === nextMonth;
			})
			.map((g) => ({ guide: g, next: successors(g, guides, diary.place).slice(0, 4) }))
			.filter((f) => f.next.length)
	);

	let shareNote = $state('');
	async function share() {
		const url = `${location.origin}/pestuj#zahradka=${encodeShared({
			place: diary.place,
			area: diary.area,
			sun: diary.sun,
			level: diary.level,
			beds: diary.beds.map(({ name, width, depth, cells }) => ({ name, width, depth, cells }))
		})}`;
		try {
			if (navigator.share) await navigator.share({ title: 'Moja záhradka', url });
			else {
				await navigator.clipboard.writeText(url);
				shareNote = 'Odkaz je skopírovaný.';
			}
		} catch {
			// Share sheet closed.
		}
	}

	let harvestId = $state('');
	let harvestGrams = $state<number | null>(null);
	let harvestNote = $state('');
	let confirmDelete = $state(false);

	const plantName = (id: string) => guideById.get(id)?.name ?? id;

	function toggle(key: string) {
		const { [key]: was, ...rest } = diary.done;
		garden.current = { ...diary, done: was ? rest : { ...rest, [key]: today } };
	}

	function logHarvest(event: SubmitEvent) {
		event.preventDefault();
		const id = harvestId || harvestNow[0]?.ingredientId || plants[0]?.ingredientId;
		if (!id || !harvestGrams || harvestGrams <= 0) return;
		const grams = Math.round(harvestGrams);
		garden.current = {
			...diary,
			harvests: [...diary.harvests, { ingredientId: id, grams, date: today }]
		};
		const had = pantry.current[id];
		setPantryItem(id, (typeof had === 'number' ? had : 0) + grams);
		const tip = guideById.get(id)?.preserve;
		harvestNote = `${formatGrams(grams)} ${plantName(id).toLowerCase()} je v špajzi.${tip ? ` Čo s nadbytkom: ${tip}` : ''}`;
		harvestGrams = null;
	}
</script>

<section class="card diary">
	<header>
		<div>
			<p class="eyebrow"><Icon name="sprout" size={16} /> Moja záhradka</p>
			<h2>
				{formatNumber(diary.area)} m² {PLACE[diary.place]}, {plants.length}
				{plants.length === 1 ? 'druh' : plants.length < 5 ? 'druhy' : 'druhov'} rastlín
			</h2>
		</div>
		<div class="head-actions">
			<button class="btn ghost small" onclick={onplan}
				><Icon name="pencil" size={16} /> Upraviť plán</button
			>
			<button class="btn ghost small" onclick={share}
				><Icon name="share" size={16} /> Zdieľať</button
			>
			<button
				class="btn ghost small"
				onclick={() => {
					if (confirmDelete) garden.current = null;
					confirmDelete = !confirmDelete;
				}}
			>
				<Icon name="trash" size={16} />
				{confirmDelete ? 'Naozaj zmazať?' : 'Zmazať'}
			</button>
		</div>
	</header>
	{#if shareNote}<p class="note" role="status"><Icon name="check" size={16} /> {shareNote}</p>{/if}

	{#if settings.current.location}
		<WeatherPanel
			location={settings.current.location}
			tender={outNow}
			plantingTender={plantingNow}
		/>
	{/if}

	<div class="cols">
		<section>
			<h3>Úlohy {IN_MONTH[month - 1]}</h3>
			{#if tasks.length}
				<div class="progress" role="img" aria-label="Hotovo {doneCount} z {tasks.length}">
					<span class="bar"><span style:width="{(doneCount / tasks.length) * 100}%"></span></span>
					<small>
						{doneCount === tasks.length ? 'Všetko hotové' : `${doneCount} / ${tasks.length}`}
					</small>
				</div>
				{#each ['indoor', 'sow', 'harvest'] as const as kind (kind)}
					{@const list = tasks.filter((t) => t.kind === kind)}
					{#if list.length}
						<p class="kind k-{kind}">{KIND_LABEL[kind]}</p>
						<ul class="tasks">
							{#each list as t (t.key)}
								<li>
									<label class:done={diary.done[t.key]}>
										<input
											type="checkbox"
											checked={Boolean(diary.done[t.key])}
											onchange={() => toggle(t.key)}
										/>
										<span>{t.name}</span>
									</label>
									<button
										class="info"
										onclick={() => oncrop(t.ingredientId)}
										aria-label="Návod: {t.name}"><Icon name="info" size={16} /></button
									>
								</li>
							{/each}
						</ul>
					{/if}
				{/each}
			{:else}
				<p class="muted">Tento mesiac je v záhradke pokoj.</p>
			{/if}
			{#if upcoming.length}
				<p class="muted small">Budúci mesiac: {upcoming.join(', ')}.</p>
			{/if}
		</section>

		<section>
			<h3>Zapíš úrodu</h3>
			<form class="harvest" onsubmit={logHarvest}>
				<select bind:value={harvestId} aria-label="Plodina">
					{#each harvestNow.length ? harvestNow : plants.map( (p) => ({ ingredientId: p.ingredientId, name: plantName(p.ingredientId) }) ) as p (p.ingredientId)}
						<option value={p.ingredientId}>{p.name}</option>
					{/each}
				</select>
				<input
					type="number"
					min="1"
					step="any"
					placeholder="gramov"
					bind:value={harvestGrams}
					aria-label="Hmotnosť v gramoch"
				/>
				<button class="btn leaf small" type="submit" disabled={!harvestGrams}>
					<Icon name="plus" size={16} /> Zapísať
				</button>
			</form>
			<div class="quick" aria-label="Pridať k hmotnosti">
				{#each QUICK_GRAMS as grams (grams)}
					<button
						class="chip"
						type="button"
						onclick={() => (harvestGrams = (harvestGrams ?? 0) + grams)}
						>+ {formatGrams(grams)}</button
					>
				{/each}
			</div>
			{#if harvestNote}<p class="note" role="status">
					<Icon name="check" size={16} />
					{harvestNote}
				</p>{/if}
			{#if totals.length}
				<p class="kind">
					Úroda {year}
					{#if harvestValue >= 1}<span class="value"
							>· v obchode by stála asi {formatEur(harvestValue)}</span
						>{/if}
				</p>
				<ul class="totals">
					{#each totals as t (t.ingredientId)}
						<li style:--share="{(t.grams / totals[0].grams) * 100}%">
							<span>{plantName(t.ingredientId)}</span><strong>{formatGrams(t.grams)}</strong>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	{#if followUps.length}
		<section class="follow">
			<h3>Po zbere zasaď na to isté miesto</h3>
			<ul>
				{#each followUps as f (f.guide.ingredientId)}
					<li>
						<strong>{f.guide.name}:</strong>
						{#each f.next as g, i (g.ingredientId)}{i ? ', ' : ''}<button
								class="linkish"
								onclick={() => oncrop(g.ingredientId)}>{g.name}</button
							>{/each}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<GardenBeds {diary} {guides} {combos} {oncrop} />

	{#if recipes.length}
		<section class="cook">
			<h3>Uvar z toho, čo práve zbieraš</h3>
			<div class="grid">
				{#each recipes as recipe, i (recipe.id)}
					<RecipeCard {recipe} index={i} />
				{/each}
			</div>
		</section>
	{/if}
</section>

<style>
	.diary {
		padding: 22px;
		border: 2px solid var(--leaf-2);
	}
	@media (max-width: 520px) {
		.diary {
			padding: 16px;
		}
	}
	header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 12px;
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0;
	}
	h2 {
		margin: 4px 0 0;
	}
	.head-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: flex-start;
	}
	.cols {
		display: grid;
		gap: 20px;
		margin-top: 16px;
	}
	@media (min-width: 760px) {
		.cols {
			grid-template-columns: 1fr 1fr;
		}
	}
	h3 {
		margin: 0 0 8px;
	}
	.kind {
		margin: 12px 0 4px;
		font-weight: 700;
		font-size: 0.9rem;
	}
	.k-indoor {
		color: var(--sky);
	}
	.k-sow {
		color: var(--leaf);
	}
	.k-harvest {
		color: #a4741a;
	}
	.tasks,
	.totals {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.tasks li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tasks label {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border-radius: 10px;
		cursor: pointer;
		transition: background 0.2s;
	}
	.tasks label:hover {
		background: var(--paper);
	}
	.tasks input {
		width: 20px;
		height: 20px;
		accent-color: var(--leaf);
		flex: none;
	}
	.tasks input:checked {
		animation: tick 0.35s var(--ease-spring);
	}
	@keyframes tick {
		50% {
			transform: scale(1.3);
		}
	}
	.tasks label span {
		background: linear-gradient(currentColor, currentColor) no-repeat 0 55% / 0 1.5px;
		transition:
			background-size 0.3s var(--ease-out),
			color 0.3s;
	}
	.tasks .done span {
		color: var(--muted);
		background-size: 100% 1.5px;
	}
	.info {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.info:hover {
		background: var(--paper-2);
		color: var(--leaf);
	}
	.progress {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 4px;
	}
	.progress .bar {
		flex: 1;
		height: 8px;
		border-radius: 4px;
		background: var(--paper-2);
		overflow: hidden;
	}
	.progress .bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--leaf-2), var(--leaf));
		transition: width 0.5s var(--ease-spring);
	}
	.progress small {
		font-weight: 700;
		color: var(--leaf);
		font-variant-numeric: tabular-nums;
	}
	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}
	.linkish {
		border: 0;
		padding: 0;
		background: none;
		color: var(--leaf);
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.harvest {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.harvest select,
	.harvest input {
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 8px 10px;
		font: inherit;
	}
	.harvest select {
		flex: 1 1 140px;
	}
	.harvest input {
		width: 110px;
	}
	.note {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--leaf);
	}
	.totals li {
		display: flex;
		justify-content: space-between;
		padding: 5px 8px;
		border-radius: 8px;
		background: linear-gradient(
				to right,
				color-mix(in srgb, var(--turmeric) 28%, transparent) var(--share),
				transparent var(--share)
			)
			no-repeat;
		animation: grow-bar 0.6s var(--ease-out) both;
	}
	@keyframes grow-bar {
		from {
			background-size: 0 100%;
		}
		to {
			background-size: 100% 100%;
		}
	}
	.value {
		font-weight: 500;
		color: var(--muted);
	}
	.follow {
		margin-top: 18px;
	}
	.follow ul {
		margin: 0;
		padding-left: 1.2em;
	}
	.cook {
		margin-top: 20px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 14px;
	}
	.small {
		font-size: 0.86rem;
	}
</style>

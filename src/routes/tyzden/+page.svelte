<script lang="ts">
	import { formatEur, formatMinutes, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import PlateArt from '$lib/components/PlateArt.svelte';
	import { buildFromParams, buildToParams, MAX_SERVINGS, type Dish } from '$lib/dish';
	import { CATEGORY_LABELS } from '$lib/labels';
	import { composePlate, type Plate } from '$lib/plate';
	import { shoppingList } from '$lib/shopping';
	import {
		kitchen,
		pantry,
		plan,
		removeFromPlan,
		setPlanQuery,
		ticked,
		ui,
		type PlanItem
	} from '$lib/state.svelte';
	import { toast } from '$lib/toast.svelte';

	const catalog = useCatalog();

	interface Planned {
		item: PlanItem;
		dish: Dish;
		servings: number;
		plate: Plate;
	}

	const planned = $derived.by((): Planned[] => {
		if (!ui.loaded) return [];
		const { dishesById, partsById, ingredientsById } = catalog();
		return plan.current.flatMap((item) => {
			const dish = dishesById.get(item.dish);
			if (!dish) return [];
			const build = buildFromParams(dish, new URLSearchParams(item.query), partsById);
			return [
				{
					item,
					dish,
					servings: build.servings,
					plate: composePlate(dish, build, kitchen.current, partsById, ingredientsById)
				}
			];
		});
	});

	const servings = $derived(planned.reduce((sum, p) => sum + p.servings, 0));
	const cost = $derived(
		planned.reduce((sum, p) => sum + p.plate.facts.costPerServing * p.servings, 0)
	);
	const protein = $derived(
		servings
			? planned.reduce((sum, p) => sum + p.plate.facts.perServing.protein * p.servings, 0) /
					servings
			: 0
	);
	const minutes = $derived(planned.reduce((sum, p) => sum + p.plate.timeline.total, 0));

	function setServings(p: Planned, next: number) {
		const { partsById } = catalog();
		const build = buildFromParams(p.dish, new URLSearchParams(p.item.query), partsById);
		build.servings = Math.min(MAX_SERVINGS, Math.max(1, next));
		setPlanQuery(p.item.id, buildToParams(p.dish, build).toString());
	}

	function remove(p: Planned) {
		const before = plan.current;
		removeFromPlan(p.item.id);
		toast(`${p.dish.name} z týždňa preč`, () => (plan.current = before));
	}

	const hrefOf = (p: Planned, cook = false) =>
		`/jedlo/${p.dish.id}${cook ? '/varim' : ''}${p.item.query ? `?${p.item.query}` : ''}`;

	const list = $derived(
		shoppingList(
			planned.flatMap((p) => p.plate.lines),
			ui.loaded ? pantry.current : {},
			catalog().ingredientsById,
			catalog().prices
		)
	);
	const aisles = $derived(
		[...new Set(list.items.map((i) => i.ingredient.category))].map((category) => ({
			category,
			items: list.items.filter((i) => i.ingredient.category === category)
		}))
	);
	const tickedCount = $derived(list.items.filter((i) => ticked.current[i.ingredient.id]).length);

	function tick(id: string) {
		const { [id]: was, ...rest } = ticked.current;
		ticked.current = was ? rest : { ...rest, [id]: true };
	}

	/** Ticked items go to the pantry with the bought weight, so the next plan knows about them. */
	function stockPantry() {
		const before = { pantry: pantry.current, ticked: ticked.current };
		const count = tickedCount;
		const next = { ...pantry.current };
		for (const item of list.items) {
			if (!ticked.current[item.ingredient.id]) continue;
			const have = next[item.ingredient.id];
			next[item.ingredient.id] = have === null ? null : Math.round((have ?? 0) + item.grams);
		}
		pantry.current = next;
		ticked.current = {};
		toast(`${count} ${count === 1 ? 'vec je' : count < 5 ? 'veci sú' : 'vecí je'} v špajzi`, () => {
			pantry.current = before.pantry;
			ticked.current = before.ticked;
		});
	}

	async function copyList() {
		const text = list.items
			.filter((i) => !ticked.current[i.ingredient.id])
			.map((i) => `☐ ${i.ingredient.name} – ${i.amount}`)
			.join('\n');
		try {
			if (navigator.share) await navigator.share({ title: 'Nákup', text });
			else {
				await navigator.clipboard.writeText(text);
				toast('Zoznam je v schránke');
			}
		} catch {
			// Closing the share sheet isn't an error worth showing.
		}
	}
</script>

<svelte:head>
	<title>Týždeň a nákup – Receptio</title>
</svelte:head>

<div class="wrap page">
	<p class="eyebrow">Týždeň</p>
	<h1>Čo budeš variť</h1>

	{#if !ui.loaded}
		<p class="muted">Načítavam…</p>
	{:else if !planned.length}
		<div class="empty card box">
			<Icon name="calendar" size={36} draw />
			<p>
				Zatiaľ nič. Poskladaj si jedlo a daj ho <strong>Do týždňa</strong> – nákup sa spočíta sám, aj
				s tým, čo už máš doma.
			</p>
			<a class="btn leaf" href="/"><Icon name="pot" size={18} /> Vybrať jedlá</a>
		</div>
	{:else}
		<dl class="summary">
			<div>
				<dt>Porcií</dt>
				<dd>{servings}</dd>
			</div>
			<div>
				<dt>Bielkoviny na porciu</dt>
				<dd>{formatNumber(protein, 0)} g</dd>
			</div>
			<div>
				<dt>Varenie spolu</dt>
				<dd>{formatMinutes(minutes)}</dd>
			</div>
			<div>
				<dt>Na nákup</dt>
				<dd>{list.estimate ? '~' : ''}{formatEur(list.total)}</dd>
			</div>
		</dl>

		<ul class="plates">
			{#each planned as p (p.item.id)}
				<li class="plate card">
					<a class="art" href={hrefOf(p)} aria-hidden="true" tabindex="-1">
						<PlateArt
							seed={p.dish.id}
							lines={p.plate.lines}
							byId={catalog().ingredientsById}
							animate={false}
						/>
					</a>
					<div class="info">
						<a class="name" href={hrefOf(p)}>{p.dish.name}</a>
						{#if p.plate.parts.length > 1}
							<span class="with"
								>+ {p.plate.parts
									.slice(1)
									.map((x) => x.part.name.toLowerCase())
									.join(' · ')}</span
							>
						{/if}
						<span class="meta">
							<Icon name="clock" size={14} />
							{formatMinutes(p.plate.timeline.total)} ·
							{p.plate.facts.costIsEstimate ? '~' : ''}{formatEur(
								p.plate.facts.costPerServing * p.servings
							)}
						</span>
					</div>
					<div class="controls">
						<div class="stepper" role="group" aria-label="Porcie: {p.dish.name}">
							<button
								class="icon-btn plain"
								onclick={() => setServings(p, p.servings - 1)}
								disabled={p.servings <= 1}
								aria-label="Menej porcií"><Icon name="minus" size={16} /></button
							>
							<span>{p.servings}×</span>
							<button
								class="icon-btn plain"
								onclick={() => setServings(p, p.servings + 1)}
								disabled={p.servings >= MAX_SERVINGS}
								aria-label="Viac porcií"><Icon name="plus" size={16} /></button
							>
						</div>
						<a class="btn leaf small" href={hrefOf(p, true)}><Icon name="play" size={14} /> Variť</a
						>
						<button
							class="icon-btn plain"
							onclick={() => remove(p)}
							aria-label="Odobrať {p.dish.name}"><Icon name="trash" size={18} /></button
						>
					</div>
				</li>
			{/each}
		</ul>
		<a class="btn ghost small add" href="/"><Icon name="plus" size={16} /> Pridať jedlo</a>

		<section id="nakup" class="card box shop">
			<h2 class="section-title">
				<Icon name="basket" size={20} /> Nákup
				{#if list.items.length}<span class="badge">{list.items.length - tickedCount}</span>{/if}
			</h2>
			{#if !list.items.length}
				<p class="notice ok"><Icon name="check" size={18} /> Všetko potrebné máš v špajzi.</p>
			{:else}
				<p class="hint">
					Bez toho, čo máš v <a href="/kuchyna#spajza">špajzi</a>. Cena je za množstvo, ktoré jedlá
					spotrebujú, balenia vyjdú o niečo drahšie.
				</p>
				{#each aisles as aisle (aisle.category)}
					<h3>{CATEGORY_LABELS[aisle.category]}</h3>
					<ul class="items">
						{#each aisle.items as item (item.ingredient.id)}
							{@const done = !!ticked.current[item.ingredient.id]}
							<li>
								<label class="check-row" class:done>
									<input type="checkbox" checked={done} onchange={() => tick(item.ingredient.id)} />
									<span class="swatch" style:--c={item.ingredient.color}></span>
									<span class="what">
										{item.ingredient.name}
										{#if item.partly}<small>časť máš doma</small>{/if}
									</span>
									<span class="amount">{item.amount}</span>
								</label>
							</li>
						{/each}
					</ul>
				{/each}
				<div class="shop-actions">
					<button class="btn ghost small" onclick={copyList}
						><Icon name="share" size={16} /> Poslať zoznam</button
					>
					{#if tickedCount}
						<button class="btn leaf small" onclick={stockPantry}>
							<Icon name="jar" size={16} /> Kúpené ({tickedCount}) do špajze
						</button>
					{/if}
				</div>
			{/if}
			{#if list.check.length}
				<div class="check-home">
					<h3>Skontroluj doma</h3>
					<p class="hint">{list.check.map((i) => i.name).join(', ')}</p>
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.page > h1 {
		margin: var(--sp-1) 0 var(--sp-4);
	}
	.empty {
		display: grid;
		justify-items: center;
		gap: var(--sp-3);
		padding: var(--sp-6) var(--sp-4);
		text-align: center;
		color: var(--leaf);
	}
	.empty p {
		max-width: 46ch;
		color: var(--ink-2);
	}
	.summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: var(--sp-2);
		margin: 0 0 var(--sp-4);
	}
	.summary div {
		padding: var(--sp-3);
		border-radius: var(--radius-sm);
		background: var(--card);
		border: 1px solid var(--line);
	}
	.summary dt {
		color: var(--muted);
		font-size: var(--fs-xs);
		font-weight: 700;
	}
	.summary dd {
		margin: 2px 0 0;
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		font-weight: 650;
	}
	.plates {
		display: grid;
		gap: var(--sp-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.plate {
		display: grid;
		grid-template-columns: 64px 1fr;
		align-items: center;
		gap: var(--sp-2) var(--sp-3);
		padding: var(--sp-3);
	}
	.art {
		display: block;
		width: 64px;
	}
	.info {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.name {
		color: var(--ink);
		font-weight: 700;
		text-decoration: none;
	}
	.name:hover {
		text-decoration: underline;
	}
	.with {
		color: var(--ink-2);
		font-size: var(--fs-sm);
	}
	.meta {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--muted);
		font-size: var(--fs-sm);
	}
	.controls {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.controls .btn {
		margin-left: auto;
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		border: 1px solid var(--line);
		border-radius: 999px;
	}
	.stepper span {
		min-width: 2.2em;
		text-align: center;
		font-weight: 700;
	}
	.add {
		margin-top: var(--sp-3);
	}
	.shop {
		margin-top: var(--sp-5);
	}
	.shop h3 {
		margin: var(--sp-4) 0 var(--sp-1);
		color: var(--muted);
		font-size: var(--fs-sm);
	}
	.items {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.check-row {
		display: grid;
		grid-template-columns: auto auto 1fr auto;
		align-items: center;
		gap: var(--sp-2);
		min-height: var(--tap);
		border-bottom: 1px dashed var(--line);
		cursor: pointer;
	}
	.check-row input {
		width: 20px;
		height: 20px;
		accent-color: var(--leaf);
	}
	.check-row.done .what,
	.check-row.done .amount {
		color: var(--muted);
		text-decoration: line-through;
	}
	.what small {
		display: block;
		color: var(--muted);
		font-size: var(--fs-xs);
	}
	.amount {
		font-weight: 650;
		white-space: nowrap;
	}
	.shop-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}
	.check-home {
		margin-top: var(--sp-4);
		padding-top: var(--sp-2);
		border-top: 1px dashed var(--line);
	}
	.check-home .hint {
		margin: 0;
	}
	@media (min-width: 720px) {
		.plate {
			grid-template-columns: 72px 1fr auto;
		}
		.art {
			width: 72px;
		}
		.controls {
			grid-column: auto;
		}
	}
</style>

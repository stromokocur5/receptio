<script lang="ts">
	import { onMount } from 'svelte';
	import { formatEur, formatGrams, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import { localToday } from '$lib/journal';
	import { priceChanges, type PriceHistory } from '$lib/price-history';
	import { history, settings } from '$lib/state.svelte';
	import {
		RESTAURANT_MEAL_EUR,
		cookingStats,
		mealPortions,
		milestones,
		monthlyCooking,
		plantsThisWeek,
		saleSavings,
		streak,
		topIngredients,
		weeklyNutrition
	} from '$lib/stats';
	import type { Nutrients } from '$lib/types';

	let { targets }: { targets: Nutrients } = $props();

	const catalog = useCatalog();
	const today = localToday();
	const PLANT_GOAL = 30;

	/** Prices over time, for the savings and the dearer/cheaper list; the rest works without. */
	let prices = $state<PriceHistory | null>(null);
	onMount(async () => {
		try {
			const res = await fetch('/data/v1/historia-serie.json');
			if (res.ok) prices = await res.json();
		} catch (err) {
			console.error('insights: price history failed', err);
		}
	});

	const cooked = $derived(history.current);
	const shopIds = $derived(
		settings.current.myStores.length
			? settings.current.myStores
			: catalog.stores.filter((s) => !s.online).map((s) => s.id)
	);
	const months = $derived(monthlyCooking(cooked, catalog.recipesById, today));
	const maxMonthCost = $derived(Math.max(...months.map((m) => m.cost), 0.01));
	const meals = $derived(mealPortions(cooked, catalog.recipesById));
	const plants = $derived(
		plantsThisWeek(cooked, catalog.recipesById, catalog.ingredientsById, today)
	);
	const weeks = $derived(
		weeklyNutrition(cooked, catalog.recipesById, settings.current.people, today)
	);
	const top = $derived(topIngredients(cooked, catalog.recipesById));
	const cuisinesCooked = $derived(
		new Set(cooked.flatMap((h) => catalog.recipesById.get(h.recipeId)?.cuisine ?? []))
	);
	const cookedDays = $derived(new Set(cooked.map((h) => h.date)));
	const cookingStreak = $derived(streak((d) => cookedDays.has(d), today));
	const stats = $derived(cookingStats(cooked, catalog.recipesById, today));
	const goals = $derived(milestones(stats, catalog.cuisines.length, cookingStreak));
	const savings = $derived(
		prices ? saleSavings(cooked, catalog.recipesById, prices, shopIds) : null
	);
	/** Your own ingredients whose shelf price moved most since prices are collected. */
	const yourPrices = $derived.by(() => {
		if (!prices) return [];
		const yours = new Set(top.map((t) => t.ingredientId));
		const seen = new Set<string>();
		return priceChanges(prices, shopIds, null)
			.filter((c) => yours.has(c.ingredientId))
			.toSorted((a, b) => Math.abs(b.change) - Math.abs(a.change))
			.filter((c) => !seen.has(c.ingredientId) && seen.add(c.ingredientId))
			.slice(0, 5);
	});
	/** Recipes built on the user's most used ingredient they haven't cooked yet. */
	const tryNext = $derived.by(() => {
		const main = top[0]?.ingredientId;
		if (!main) return [];
		const done = new Set(cooked.map((h) => h.recipeId));
		return catalog.recipes
			.filter((r) => !done.has(r.id) && r.lines.some((l) => l.ingredientId === main))
			.slice(0, 3);
	});

	const monthName = new Intl.DateTimeFormat('sk', { month: 'short' });
	const fmtMonth = (m: string) => monthName.format(new Date(`${m}-15T00:00:00Z`));
	const dayMonth = new Intl.DateTimeFormat('sk', { day: 'numeric', month: 'numeric' });
	const fmtDay = (d: string) => dayMonth.format(new Date(`${d}T00:00:00Z`));
	const name = (id: string) => catalog.ingredientsById.get(id)?.name.split(' (')[0] ?? id;
	const percent = (n: number) => `${n > 0 ? '+' : '−'}${formatNumber(Math.abs(n) * 100, 0)} %`;
	const maxProtein = $derived(Math.max(targets.protein, ...weeks.map((w) => w.protein)));
	const maxFiber = $derived(Math.max(targets.fiber, ...weeks.map((w) => w.fiber)));
</script>

<section class="card box insights">
	<h2><Icon name="chart" size={24} /> Viac o mojom varení</h2>

	<dl class="tiles">
		<div>
			<dt>Doma vs. reštaurácia</dt>
			{#if meals.portions}
				<dd>{formatEur(meals.cost)}</dd>
				<dd class="sub">
					za {meals.portions}
					{meals.portions === 1
						? 'obed či večeru'
						: meals.portions < 5
							? 'obedy a večere'
							: 'obedov a večerí'}; v reštaurácii ~{formatEur(meals.portions * RESTAURANT_MEAL_EUR)}
					<span class="badge">odhad</span>
				</dd>
			{:else}
				<dd>–</dd>
				<dd class="sub">keď uvaríš obed alebo večeru</dd>
			{/if}
		</div>
		<div>
			<dt>Ušetrené na akciách</dt>
			<dd>{savings ? formatEur(savings.total) : '…'}</dd>
			<dd class="sub">
				{savings?.meals ? `pri ${savings.meals} jedlách, s nákupom v akcii` : 'keď uvaríš z akcií'}
				<span class="badge">odhad</span>
			</dd>
		</div>
		<div>
			<dt>Varenie po sebe</dt>
			<dd>{cookingStreak}</dd>
			<dd class="sub">
				{cookingStreak === 1 ? 'deň' : cookingStreak > 1 && cookingStreak < 5 ? 'dni' : 'dní'}
			</dd>
		</div>
	</dl>
	<p class="muted small">
		Reštaurácia: {formatEur(RESTAURANT_MEAL_EUR)} za porciu, približná cena vegánskeho obedového menu.
		Úspora z akcií: o koľko lacnejšie by vyšli suroviny uvarených jedál, kúpené v deň varenia v akcii
		{settings.current.myStores.length ? 'v tvojich obchodoch' : 'v kamenných obchodoch'}. Kde si
		naozaj nakupuješ, aplikácia nevie.
	</p>

	<div class="grid">
		<div class="panel">
			<h3>Po mesiacoch</h3>
			<table class="months">
				<thead>
					<tr><th scope="col">Mesiac</th><th scope="col">Uvarené</th><th scope="col">Minuté</th></tr
					>
				</thead>
				<tbody>
					{#each months as m (m.month)}
						<tr>
							<th scope="row">{fmtMonth(m.month)}</th>
							<td class="num">{m.cooked}×</td>
							<td class="bar-cell">
								<span class="track"
									><span class="bar" style:width="{(m.cost / maxMonthCost) * 100}%"></span></span
								>
								<span class="num">{formatEur(m.cost)}</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="panel">
			<h3>Rastliny tento týždeň</h3>
			<p class="big">
				<strong>{formatNumber(plants.score, plants.score % 1 ? 1 : 0)}</strong> / {PLANT_GOAL}
			</p>
			<div
				class="meter"
				role="img"
				aria-label="{formatNumber(plants.score, 1)} z {PLANT_GOAL} rastlín"
			>
				<span style:width="{Math.min(1, plants.score / PLANT_GOAL) * 100}%"></span>
			</div>
			<p class="muted small">
				Rôzne rastliny za 7 dní z uvarených receptov – zelenina, ovocie, strukoviny, obilniny,
				orechy a semienka. Korenie a bylinky sa rátajú ako ¼. Pestrosť živí črevné baktérie.
			</p>
			{#if plants.plants.length}
				<p class="small names">
					{plants.plants.slice(0, 12).map(name).join(', ')}{plants.plants.length > 12
						? ` a ${plants.plants.length - 12} ďalších`
						: ''}
				</p>
			{/if}
		</div>

		<div class="panel">
			<h3>Bielkoviny a vláknina po týždňoch</h3>
			<p class="muted small">Priemer na deň z uvarených jedál, posledných 8 týždňov.</p>
			{#each [{ key: 'protein', label: 'Bielkoviny', max: maxProtein, goal: targets.protein }, { key: 'fiber', label: 'Vláknina', max: maxFiber, goal: targets.fiber }] as const as row (row.key)}
				<div class="weekbars">
					<span class="wlabel"
						>{row.label} <small class="muted">cieľ {formatNumber(row.goal, 0)} g</small></span
					>
					<ol>
						{#each weeks as w (w.to)}
							<li
								title="{fmtDay(w.from)}–{fmtDay(w.to)}: {formatNumber(w[row.key], 0)} g"
								aria-label="{fmtDay(w.from)} až {fmtDay(w.to)}: {formatNumber(w[row.key], 0)} g"
							>
								<span style:height="{(w[row.key] / row.max) * 100}%"></span>
							</li>
						{/each}
						<span class="goal" style:bottom="{(row.goal / row.max) * 100}%" aria-hidden="true"
						></span>
					</ol>
					<span class="muted small">
						tento týždeň {formatNumber(weeks.at(-1)![row.key], 0)} g
					</span>
				</div>
			{/each}
		</div>

		<div class="panel">
			<h3>Kuchyne sveta</h3>
			<p class="muted small">{cuisinesCooked.size} z {catalog.cuisines.length}</p>
			<ul class="cuisines">
				{#each catalog.cuisines as c (c.id)}
					<li class:on={cuisinesCooked.has(c.id)}>
						<a href="/recepty?kuchyna={c.id}">
							{#if cuisinesCooked.has(c.id)}<Icon name="check" size={12} />{/if}
							{c.name}</a
						>
					</li>
				{/each}
			</ul>
		</div>

		{#if top.length}
			<div class="panel">
				<h3>Najčastejšie suroviny</h3>
				<ol class="top">
					{#each top as t (t.ingredientId)}
						<li>
							<a href="/suroviny/{t.ingredientId}">{name(t.ingredientId)}</a>
							<span class="muted num">{formatGrams(t.grams)}</span>
						</li>
					{/each}
				</ol>
				{#if tryNext.length}
					<p class="small">
						Ešte neuvarené ({name(top[0].ingredientId).toLowerCase()}):
						{#each tryNext as r, i (r.id)}{i ? ', ' : ''}<a href="/recepty/{r.id}">{r.title}</a
							>{/each}.
					</p>
				{/if}
			</div>
		{/if}

		{#if yourPrices.length}
			<div class="panel">
				<h3>Ceny tvojich surovín</h3>
				<p class="muted small">Ako sa zmenila cena rovnakého produktu, odkedy ceny zbierame.</p>
				<ol class="top">
					{#each yourPrices as c (`${c.storeId}|${c.product}`)}
						<li>
							<a href="/data?s={c.ingredientId}#vyvoj">{name(c.ingredientId)}</a>
							<span class="muted small">{catalog.storesById.get(c.storeId)?.name}</span>
							<strong class:up={c.change > 0} class:down={c.change < 0}>{percent(c.change)}</strong>
						</li>
					{/each}
				</ol>
			</div>
		{/if}
	</div>

	<h3>Míľniky</h3>
	<ul class="goals">
		{#each goals as g (g.label)}
			<li class:done={g.done}>
				<Icon name={g.done ? 'star' : 'clock'} size={16} />
				<span>{g.label}</span>
				{#if !g.done}<small class="muted">{g.progress} / {g.goal}</small>{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	.insights {
		margin-bottom: 20px;
		padding: 20px;
	}
	.insights h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.4rem;
		margin: 0 0 12px;
	}
	.insights h3 {
		font-size: 1rem;
		margin: 0 0 8px;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 10px;
		margin: 0 0 8px;
	}
	.tiles div {
		padding: 10px 12px;
		border-radius: 14px;
		background: var(--paper-2);
	}
	.tiles dt {
		font-size: 0.8rem;
		color: var(--ink-2);
	}
	.tiles dd {
		margin: 2px 0 0;
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.tiles .sub {
		margin: 2px 0 0;
		font-family: inherit;
		font-weight: 400;
		color: var(--muted);
		font-size: 0.8rem;
	}
	.small {
		font-size: 0.86rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 14px;
		margin: 16px 0;
	}
	.panel {
		padding: 14px;
		border-radius: 14px;
		border: 1px solid var(--line);
		min-width: 0;
	}
	.panel p {
		margin: 4px 0;
	}
	.months {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.86rem;
	}
	.months th,
	.months td {
		text-align: left;
		padding: 3px 4px;
	}
	.months thead th {
		font-size: 0.75rem;
		color: var(--muted);
		font-weight: 600;
	}
	.num {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.bar-cell {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 55%;
	}
	.track {
		flex: 1;
		min-width: 40px;
	}
	.bar {
		display: block;
		height: 10px;
		min-width: 2px;
		border-radius: 0 4px 4px 0;
		background: var(--leaf);
	}
	.big {
		font-size: 1.1rem;
	}
	.big strong {
		font-size: 1.8rem;
		font-variant-numeric: tabular-nums;
	}
	.meter {
		height: 10px;
		border-radius: 999px;
		background: var(--paper-2);
		overflow: hidden;
		margin: 4px 0 8px;
	}
	.meter span {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--leaf);
	}
	.names {
		color: var(--ink-2);
	}
	.weekbars {
		display: grid;
		gap: 4px;
		margin-top: 10px;
	}
	.wlabel {
		font-weight: 600;
		font-size: 0.86rem;
	}
	.weekbars ol {
		position: relative;
		list-style: none;
		margin: 0;
		padding: 0;
		height: 60px;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 2px;
		align-items: end;
		border-bottom: 1px solid var(--line);
	}
	.weekbars li {
		height: 100%;
		display: flex;
		align-items: flex-end;
	}
	.weekbars li span {
		display: block;
		width: 100%;
		min-height: 1px;
		border-radius: 4px 4px 0 0;
		background: var(--leaf);
	}
	.goal {
		position: absolute;
		left: 0;
		right: 0;
		height: 0;
		border-top: 1px solid var(--ink-2);
	}
	.cuisines {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.cuisines a {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid var(--line);
		font-size: 0.78rem;
		color: var(--ink-2);
		text-decoration: none;
	}
	.cuisines .on a {
		background: var(--leaf-soft);
		border-color: transparent;
		color: var(--leaf);
		font-weight: 700;
	}
	.top {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
		font-size: 0.9rem;
	}
	.top li {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.top li a {
		flex: 1;
		min-width: 0;
	}
	.up {
		color: color-mix(in srgb, var(--tomato) 70%, var(--ink));
	}
	.down {
		color: var(--leaf);
	}
	.goals {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.goals li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px dashed var(--line);
		font-size: 0.85rem;
		color: var(--ink-2);
	}
	.goals li.done {
		border-style: solid;
		border-color: transparent;
		background: var(--turmeric-soft);
		color: var(--ink);
		font-weight: 600;
	}
</style>

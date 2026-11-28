<script lang="ts">
	import { formatAmount, formatEur, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import { scaleStep } from '$lib/cooking';
	import { combineFacts, scaledLines, usableMethods, type PartFacts } from '$lib/dish';
	import Icon from '$lib/components/Icon.svelte';
	import {
		cuisineStyle,
		hasStarch,
		MAX_SIDES,
		resolveSides,
		SIDE_GROUPS,
		sideGroup,
		sidesFor,
		sideTiming,
		suits,
		type PlanSide,
		type SideGroupId
	} from '$lib/sides';
	import { kitchen } from '$lib/state.svelte';
	import type { RecipeLine } from '$lib/types';

	let {
		cuisine,
		minutes,
		lines,
		servings,
		facts,
		picked = $bindable()
	}: {
		cuisine: string;
		/** How long the recipe takes, to time the sides against it. */
		minutes: number;
		lines: RecipeLine[];
		servings: number;
		/** One serving of the recipe, to add the sides to. */
		facts: Pick<PartFacts, 'perServing' | 'costPerServing'>;
		picked: PlanSide[];
	} = $props();

	const catalog = useCatalog();
	const style = $derived(cuisineStyle(cuisine));
	const starchy = $derived(hasStarch(lines, catalog.ingredientsById));
	/** With rice or pasta already in, a starchy side comes last, not first. */
	const groups = $derived(
		[...SIDE_GROUPS].sort((a, b) =>
			starchy ? Number(a.id === 'priloha') - Number(b.id === 'priloha') : 0
		)
	);
	const SHOWN = 6;
	let expanded = $state<Partial<Record<SideGroupId, boolean>>>({});

	const chosen = $derived(resolveSides(picked, catalog.sidesById, kitchen.current));
	const total = $derived(
		chosen.length
			? combineFacts([
					{ ...facts, costIsEstimate: false, gluten: 'free', allergens: [], treat: [] },
					...chosen.map((s) => s.method)
				])
			: null
	);

	function pickedIn(group: SideGroupId) {
		return picked.find((s) => {
			const part = catalog.sidesById.get(s.part);
			return part && sideGroup(part) === group;
		});
	}

	function toggle(group: SideGroupId, partId: string) {
		const current = pickedIn(group);
		const rest = picked.filter((s) => s !== current);
		picked = current?.part === partId ? rest : [...rest, { part: partId }].slice(0, MAX_SIDES);
	}

	function setMethod(partId: string, label: string) {
		picked = picked.map((s) => (s.part === partId ? { part: partId, method: label } : s));
	}
</script>

<section class="sides card" aria-labelledby="sides-title" data-noprint>
	<h2 id="sides-title">K tomu</h2>
	<p class="muted lead">
		{starchy
			? 'Príloha už je v recepte. Pridaj zeleninu alebo dip – načasujeme to, nákup aj živiny sa zrátajú.'
			: 'Vyber prílohu – povieme, kedy ju začať, a pridá sa do nákupu aj živín.'}
	</p>

	{#each groups as group (group.id)}
		{@const options = sidesFor(catalog.sides, group.id, style)}
		{@const current = pickedIn(group.id)?.part}
		{#if options.length}
			<div class="group">
				<h3>{group.label}</h3>
				<div class="chips">
					{#each expanded[group.id] ? options : options.slice(0, SHOWN) as part (part.id)}
						<button
							class="chip"
							aria-pressed={current === part.id}
							onclick={() => toggle(group.id, part.id)}
						>
							{part.name}
							{#if suits(part, style) && style && part.style.length}<span
									class="fit"
									title="Hodí sa k tejto kuchyni"><Icon name="check" size={13} /></span
								>{/if}
						</button>
					{/each}
					{#if !expanded[group.id] && options.length > SHOWN}
						<button class="chip ghost" onclick={() => (expanded[group.id] = true)}>
							+{options.length - SHOWN} ďalšie
						</button>
					{/if}
				</div>
			</div>
		{/if}
	{/each}

	{#each chosen as { part, method } (part.id)}
		{@const methods = usableMethods(part, kitchen.current)}
		<article class="side">
			<header>
				<h3>{part.name}</h3>
				<p class="timing"><Icon name="timer" size={15} /> {sideTiming(part, method, minutes)}</p>
			</header>
			{#if methods.length > 1}
				<div class="chips methods" role="group" aria-label="Ako pripraviť {part.name}">
					{#each methods as m (m.label)}
						<button
							class="chip"
							aria-pressed={m.label === method.label}
							onclick={() => setMethod(part.id, m.label)}>{m.label}</button
						>
					{/each}
				</div>
			{/if}
			<ul class="lines">
				{#each scaledLines(part, servings, method) as line, i (i)}
					{@const ingredient = catalog.ingredientsById.get(line.ingredientId)}
					{#if ingredient}
						<li>
							<span>{ingredient.name}</span>
							<span class="amount">{formatAmount(line.amount, line.unit)}</span>
						</li>
					{/if}
				{/each}
			</ul>
			<ol class="steps">
				{#each method.steps as step, i (i)}
					<li>{scaleStep(step.text, servings / part.servings)}</li>
				{/each}
			</ol>
		</article>
	{/each}

	{#if total}
		<p class="total">
			<strong>S {chosen.length === 1 ? 'prílohou' : 'prílohami'} na porciu:</strong>
			{formatNumber(total.perServing.kcal, 0)} kcal · {formatNumber(total.perServing.protein, 0)} g bielkovín
			· {formatNumber(total.perServing.fiber, 0)} g vlákniny · {formatEur(total.costPerServing)}
		</p>
	{/if}
</section>

<style>
	.sides {
		display: grid;
		gap: 14px;
		margin-top: 36px;
		padding: 22px;
	}
	h2 {
		margin: 0;
	}
	.lead {
		margin: -6px 0 0;
	}
	.group h3,
	.side h3 {
		margin: 0 0 8px;
		font-size: 1rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip.ghost {
		border-style: dashed;
	}
	.fit {
		display: inline-flex;
		color: var(--leaf);
	}
	.chip[aria-pressed='true'] .fit {
		color: var(--leaf-soft);
	}
	.side {
		display: grid;
		gap: 10px;
		padding: 14px;
		border-radius: var(--radius-sm);
		background: var(--paper-2);
	}
	.side header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
	}
	.side header h3 {
		margin: 0;
	}
	.timing {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		color: var(--ink-2);
		font-size: 0.92rem;
	}
	.lines {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
		gap: 4px 20px;
	}
	.lines li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 4px 0;
		border-bottom: 1px dashed var(--line);
	}
	.amount {
		font-weight: 650;
		white-space: nowrap;
	}
	.steps {
		margin: 0;
		padding-left: 1.3em;
		display: grid;
		gap: 6px;
		line-height: 1.5;
	}
	.total {
		margin: 0;
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		background: var(--leaf-soft);
		color: var(--ink);
	}
</style>

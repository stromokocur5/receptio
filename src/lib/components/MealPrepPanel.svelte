<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { batchPlan } from '$lib/mealprep';
	import { addToPlan, plan, settings, ui } from '$lib/state.svelte';
	import type { RecipeSummary } from '$lib/types';

	let {
		recipe,
		variant,
		onservings
	}: {
		recipe: Pick<RecipeSummary, 'id' | 'title' | 'keeps' | 'meals'>;
		variant?: string;
		/** Rescales the recipe page to what the first cooking makes. */
		onservings: (servings: number) => void;
	} = $props();

	const DAY_CHOICES = [2, 3, 4, 5, 7];
	let days = $state(5);
	let perDay = $state(1);
	let added = $state(false);

	$effect(() => {
		if (ui.loaded) perDay = settings.current.people;
	});

	const prep = $derived(batchPlan(recipe.keeps, days, perDay));
	const weekday = new Intl.DateTimeFormat('sk-SK', { weekday: 'long' });
	const dayName = (offset: number) => {
		const date = new Date();
		date.setDate(date.getDate() + offset);
		return offset === 0 ? 'dnes' : offset === 1 ? 'zajtra' : weekday.format(date);
	};
	const portions = (n: number) => `${n} ${n === 1 ? 'porcia' : n < 5 ? 'porcie' : 'porcií'}`;
	const boxes = (n: number) => `${n} ${n === 1 ? 'krabička' : n < 5 ? 'krabičky' : 'krabičiek'}`;

	$effect(() => {
		if (prep) onservings(prep.batches[0]);
	});

	function toPlan() {
		if (!prep) return;
		const first = prep.batches[0];
		if (prep.batches.length === 1 && prep.freezer > 0 && prep.freezer < first) {
			plan.current = [
				...plan.current,
				{
					recipeId: recipe.id,
					servings: first,
					freezeExtra: prep.freezer,
					...(variant && { variant })
				}
			];
		} else {
			addToPlan(
				recipe.id,
				prep.batches.reduce((a, b) => a + b, 0),
				variant
			);
		}
		added = true;
		setTimeout(() => (added = false), 2500);
	}
</script>

<section class="card prep" aria-labelledby="meal-prep-title">
	<h3 id="meal-prep-title"><Icon name="package" size={20} /> Meal prep</h3>
	{#if !recipe.keeps}
		<p class="muted">Pri tomto recepte nevieme, ako dlho vydrží – navar radšej na 2 dni.</p>
	{:else if !prep}
		<p>Toto jedlo je najlepšie čerstvé – do krabičiek na viac dní sa nehodí.</p>
	{:else}
		<div class="choices">
			<div class="choice" role="group" aria-label="Na koľko dní">
				<span>Na</span>
				{#each DAY_CHOICES as d (d)}
					<button class="chip" aria-pressed={days === d} onclick={() => (days = d)}>{d}</button>
				{/each}
				<span>dní</span>
			</div>
			<label class="choice">
				<span>porcie na deň</span>
				<select bind:value={perDay}>
					{#each [1, 2, 3, 4, 5, 6] as n (n)}<option value={n}>{n}</option>{/each}
				</select>
			</label>
		</div>

		<p class="summary">
			{#if prep.batches.length === 1}
				Navar <strong>{portions(prep.batches[0])}</strong> naraz – recept sa prepočítal. Rozdeľ do
				<strong>{boxes(prep.batches[0])}</strong>{#if prep.freezer}: {prep.fridge} do chladničky,
					<strong>{prep.freezer} hneď do mrazničky</strong>{/if}.
			{:else}
				V chladničke vydrží len {recipe.keeps.fridge}
				{recipe.keeps.fridge === 1 ? 'deň' : recipe.keeps.fridge < 5 ? 'dni' : 'dní'} a mraziť sa nedá,
				preto variť {prep.batches.length}× – po {prep.batches.join(', ')} porcií. Recept je prepočítaný
				na prvé varenie.
			{/if}
		</p>

		<ol class="days">
			{#each prep.days as d (d.day)}
				<li class:frozen={d.from === 'freezer'}>
					<strong class="day">{dayName(d.day)}</strong>
					{#if d.cook && d.day > 0}
						<span><Icon name="pot" size={16} /> navar znova</span>
					{:else if d.from === 'freezer'}
						<span
							><Icon name="snowflake" size={16} /> z mrazničky – večer predtým prelož do chladničky</span
						>
					{:else}
						<span><Icon name="fridge" size={16} /> z chladničky</span>
					{/if}
				</li>
			{/each}
		</ol>

		<ul class="tips small">
			<li>
				Rozdeľ ešte teplé do plytkých krabičiek a do 2 hodín daj do chladničky – vo veľkom hrnci
				chladne celú noc.
			</li>
			{#if prep.freezer}<li>Na krabičky do mrazničky napíš názov a dátum.</li>{/if}
			{#if recipe.meals.includes('ranajky')}
				<li>Na raňajky si krabičku pripravíš už večer, ráno ju len vezmeš.</li>
			{/if}
		</ul>

		<button class="btn leaf" onclick={toPlan}>
			<Icon name={added ? 'check' : 'calendar'} size={18} />
			{added
				? 'V pláne'
				: prep.freezer
					? `Do plánu – ${portions(prep.batches[0])}, z toho ${prep.freezer} do mrazničky`
					: 'Do plánu'}
		</button>
	{/if}
</section>

<style>
	.prep {
		display: grid;
		gap: 12px;
		margin-top: 16px;
		padding: 18px;
	}
	.prep h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
	}
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 18px;
		align-items: center;
	}
	.choice {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.choice select {
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 6px 10px;
		font: inherit;
	}
	.summary {
		margin: 0;
	}
	.days {
		display: grid;
		gap: 6px;
		padding: 0;
		margin: 0;
		list-style: none;
	}
	.days li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		background: var(--paper-2);
	}
	.days li.frozen {
		background: var(--sky-soft);
	}
	.days .day {
		min-width: 90px;
		text-transform: capitalize;
	}
	.days span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.tips {
		margin: 0;
		padding-left: 18px;
	}
	.small {
		font-size: 0.88rem;
	}
	.btn {
		justify-self: start;
	}
</style>

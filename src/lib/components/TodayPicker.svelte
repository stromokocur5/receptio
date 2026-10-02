<script lang="ts">
	import { avoidFilter } from '$lib/avoid';
	import { useCatalog } from '$lib/catalog';
	import { avoid, history, pantry } from '$lib/state.svelte';
	import { TODAY_COUNT, pickToday, type TodayPick } from '$lib/today';
	import Icon from './Icon.svelte';
	import RecipeCard from './RecipeCard.svelte';

	const catalog = useCatalog();
	const RECENT_DAYS = 7;
	const TIMES = [
		{ value: 20, label: 'Do 20 min' },
		{ value: 45, label: 'Do 45 min' },
		{ value: 0, label: 'Mám čas' }
	];

	let maxTime = $state(45);
	let picks = $state<TodayPick[]>([]);
	let asked = $state(false);
	/** Everything offered since the page opened, so "Iné tri" really shows other ones. */
	let offered: string[] = [];
	let round = 0;

	function suggest(fresh: boolean) {
		if (fresh) offered = [];
		const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000)
			.toISOString()
			.slice(0, 10);
		const recent = history.current.filter((h) => h.date >= since).map((h) => h.recipeId);
		const now = new Date();
		const options = {
			pantry: pantry.current,
			month: now.getMonth() + 1,
			maxTime,
			// A new day brings new suggestions; "Iné tri" moves on within the day.
			seed: now.getFullYear() * 1000 + now.getMonth() * 40 + now.getDate() + round * 7919
		};
		const recipes = catalog.recipes.filter(avoidFilter(avoid.current, catalog.ingredientsById));
		let next = pickToday(recipes, catalog.ingredientsById, {
			...options,
			skip: new Set([...recent, ...offered])
		});
		if (next.length < TODAY_COUNT) {
			// Ran out of new ones: start over from the top.
			offered = [];
			next = pickToday(recipes, catalog.ingredientsById, { ...options, skip: new Set(recent) });
		}
		offered.push(...next.map((p) => p.recipe.id));
		picks = next;
		asked = true;
	}

	function another() {
		round++;
		suggest(false);
	}

	function setTime(value: number) {
		maxTime = value;
		suggest(true);
	}

	const hasPantry = $derived(Object.keys(pantry.current).length > 0);
</script>

<section class="wrap" id="co-dnes">
	<div class="today card">
		<div class="copy">
			<p class="eyebrow">Bez rozmýšľania</p>
			<h2>Čo dnes?</h2>
			<p>Tri bežné jedlá na dnes – podľa toho, čo máš v špajzi, čo je v sezóne a koľko máš času.</p>
		</div>
		<div class="controls">
			<div class="times" role="group" aria-label="Koľko máš času">
				{#each TIMES as t (t.value)}
					<button
						class="chip"
						aria-pressed={maxTime === t.value}
						onclick={() => (asked ? setTime(t.value) : (maxTime = t.value))}>{t.label}</button
					>
				{/each}
			</div>
			<button class="btn leaf" onclick={() => (asked ? another() : suggest(true))}>
				<Icon name="sparkle" size={18} />
				{asked ? 'Iné tri' : 'Navrhni mi tri jedlá'}
			</button>
		</div>
	</div>
	{#if asked}
		<div class="results" aria-live="polite">
			{#if picks.length}
				<div class="grid">
					{#each picks as pick, i (pick.recipe.id)}
						<RecipeCard recipe={pick.recipe} match={pick.match} index={i} />
					{/each}
				</div>
				{#if !hasPantry}
					<p class="muted small hint">
						Keď si naklikáš <a href="/spajza">špajzu</a>, návrhy budú z toho, čo máš naozaj doma.
					</p>
				{/if}
			{:else}
				<p class="muted">Na tento čas nič nemáme. Skús „Mám čas“.</p>
			{/if}
		</div>
	{/if}
</section>

<style>
	section {
		margin-top: 20px;
		scroll-margin-top: 84px;
	}
	.today {
		display: grid;
		gap: 16px;
		padding: 20px;
		background: color-mix(in srgb, var(--leaf-2) 12%, var(--card));
	}
	h2 {
		margin: 0 0 4px;
	}
	.copy p:last-child {
		margin: 0;
		color: var(--ink-2);
	}
	.controls {
		display: grid;
		gap: 12px;
		justify-items: start;
	}
	.times {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.results {
		margin-top: 18px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 18px;
	}
	.hint {
		margin: 12px 0 0;
	}
	@media (min-width: 800px) {
		.today {
			grid-template-columns: 1.2fr 1fr;
			align-items: center;
			padding: 24px 28px;
		}
	}
</style>

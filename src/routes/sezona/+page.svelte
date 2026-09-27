<script lang="ts">
	import { onMount } from 'svelte';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { IN_MONTH, MONTH_NAMES, recipeSeason } from '$lib/season';

	const catalog = useCatalog();
	let month = $state(new Date().getMonth() + 1);
	onMount(() => (month = new Date().getMonth() + 1));

	const produce = $derived(
		catalog.ingredients
			.filter((i) => i.season.length)
			.sort((a, b) => a.name.localeCompare(b.name, 'sk'))
	);
	const inSeasonNow = $derived(produce.filter((i) => i.season.includes(month)));
	const recipes = $derived(
		catalog.recipes.filter((r) => recipeSeason(r, catalog.ingredientsById, month).inSeason)
	);
</script>

<Seo
	title="Sezónny kalendár"
	description="Čo sa na Slovensku kedy zbiera a čo z toho uvariť – zelenina a ovocie po mesiacoch."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Wiki · Sezóna</p>
		<h1>Sezónny kalendár</h1>
		<p class="lede">
			Zelenina v sezóne je chutnejšia a lacnejšia. Kalendár ukazuje, kedy sa čo zbiera na Slovensku,
			aj s tým, čo vydrží v pivnici. Zelenina, ktorá je v obchode stále (cibuľa, zemiaky, cesnak),
			tu nie je. Chceš si ju dopestovať? <a href="/pestuj">Pestuj si sám</a>.
		</p>
	</header>

	<div class="months" role="group" aria-label="Mesiac">
		{#each MONTH_NAMES as name, i (i)}
			<button class="chip" aria-pressed={month === i + 1} onclick={() => (month = i + 1)}>
				{name.slice(0, 3)}
			</button>
		{/each}
	</div>

	<section class="now card">
		<h2>
			<Icon name="leaf" size={22} />
			{IN_MONTH[month - 1][0].toUpperCase() + IN_MONTH[month - 1].slice(1)} je v sezóne
		</h2>
		<div class="chips">
			{#each inSeasonNow as i (i.id)}
				<a class="chip" href="/suroviny/{i.id}" style:--c={i.color}
					><span class="dot"></span>{i.name}</a
				>
			{:else}
				<p class="muted">Tento mesiac nie je v sezóne nič z našich surovín.</p>
			{/each}
		</div>
	</section>

	<section class="table-wrap">
		<table>
			<thead>
				<tr>
					<th scope="col">Surovina</th>
					{#each MONTH_NAMES as name, i (i)}
						<th scope="col" class:current={month === i + 1} title={name}>{name[0].toUpperCase()}</th
						>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each produce as i (i.id)}
					<tr>
						<th scope="row"><a href="/suroviny/{i.id}">{i.name}</a></th>
						{#each MONTH_NAMES as name, m (m)}
							<td
								class:on={i.season.includes(m + 1)}
								class:current={month === m + 1}
								style:--c={i.color}
								title="{i.name} – {name}{i.season.includes(m + 1) ? ': v sezóne' : ''}"
							></td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section class="recipes">
		<h2>Čo uvariť {IN_MONTH[month - 1]}</h2>
		{#if recipes.length}
			<div class="grid">
				{#each recipes as recipe, i (recipe.id)}<RecipeCard {recipe} index={i} />{/each}
			</div>
		{:else}
			<p class="muted">
				Tento mesiac nie je v sezóne žiadny recept – zima patrí strukovinám, kapuste a zásobám.
				<a href="/recepty?rychlo=jeden-hrniec">Recepty z jedného hrnca</a>
			</p>
		{/if}
	</section>
</div>

<style>
	.page {
		padding-top: 28px;
	}
	.lede {
		color: var(--ink-2);
		max-width: 44em;
	}
	.months {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 10px 0 18px;
	}
	.now {
		padding: 18px;
	}
	.now h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.25rem;
		margin: 0 0 10px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chips .chip {
		text-decoration: none;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c);
	}
	.table-wrap {
		margin-top: 24px;
		overflow-x: auto;
	}
	table {
		border-collapse: separate;
		border-spacing: 2px;
		font-size: 0.85rem;
		min-width: 560px;
	}
	th[scope='row'] {
		text-align: left;
		font-weight: 600;
		padding-right: 10px;
		white-space: nowrap;
	}
	th[scope='row'] a {
		color: var(--ink);
		text-decoration: none;
	}
	thead th {
		color: var(--muted);
		font-weight: 700;
		width: 26px;
	}
	thead th.current {
		color: var(--ink);
	}
	td {
		width: 26px;
		height: 20px;
		border-radius: 5px;
		background: var(--paper-2);
	}
	td.on {
		background: color-mix(in srgb, var(--c) 75%, var(--paper));
	}
	td.current {
		outline: 2px solid var(--ink);
		outline-offset: -2px;
	}
	.recipes {
		margin-top: 32px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}
</style>

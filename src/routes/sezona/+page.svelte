<script lang="ts">
	import { avoidFilter } from '$lib/avoid';
	import { avoid } from '$lib/state.svelte';
	import { onMount } from 'svelte';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import JumpNav from '$lib/components/JumpNav.svelte';
	import RecipeGrid from '$lib/components/RecipeGrid.svelte';
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
		catalog.recipes
			.filter(avoidFilter(avoid.current, catalog.ingredientsById))
			.filter((r) => recipeSeason(r, catalog.ingredientsById, month).inSeason)
	);
</script>

<Seo
	title="Sezónny kalendár"
	description="Čo práve dozrieva na Slovensku a čo z toho uvariť – zelenina a ovocie mesiac po mesiaci."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Objavuj</p>
		<h1>Sezónny kalendár</h1>
		<p class="lede">
			Zelenina v sezóne je chutnejšia a lacnejšia. Kalendár ukazuje, kedy sa čo zbiera na Slovensku,
			aj s tým, čo vydrží v pivnici. Zelenina, ktorá je v obchode stále (cibuľa, zemiaky, cesnak),
			tu nie je. Chceš vlastnú? <a href="/pestuj">Ako si ju dopestovať</a>.
		</p>
	</header>

	<div class="chips months" role="group" aria-label="Mesiac">
		{#each MONTH_NAMES as name, i (i)}
			<button
				class="chip"
				aria-pressed={month === i + 1}
				aria-label={name}
				onclick={() => (month = i + 1)}
			>
				{name.slice(0, 3)}
			</button>
		{/each}
	</div>

	<JumpNav
		links={[
			{ id: 'teraz', label: 'Teraz v sezóne', icon: 'leaf', count: inSeasonNow.length },
			{ id: 'kalendar', label: 'Kalendár', icon: 'calendar' },
			{ id: 'uvar', label: 'Čo uvariť', icon: 'bowl', count: recipes.length }
		]}
	/>

	<section class="card box" id="teraz">
		<h2 class="section-title">
			<Icon name="leaf" size={22} />
			{IN_MONTH[month - 1][0].toUpperCase() + IN_MONTH[month - 1].slice(1)} je v sezóne
		</h2>
		{#if inSeasonNow.length}
			<div class="chips">
				{#each inSeasonNow as i (i.id)}
					<a class="chip" href="/suroviny/{i.id}"
						><span class="swatch" style:--c={i.color}></span>{i.name}</a
					>
				{/each}
			</div>
		{:else}
			<p class="muted">Tento mesiac nie je v sezóne nič z našich surovín.</p>
		{/if}
	</section>

	<section class="table-wrap" id="kalendar" aria-label="Kalendár po mesiacoch">
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

	<section class="recipes" id="uvar">
		<h2>Čo uvariť {IN_MONTH[month - 1]}</h2>
		{#if recipes.length}
			<!-- Another month is a new list: it starts folded again. -->
			{#key month}<RecipeGrid {recipes} />{/key}
		{:else}
			<p class="muted">
				Tento mesiac nie je v sezóne žiadny recept – zima patrí strukovinám, kapuste a zásobám.
				<a href="/recepty?rychlo=jeden-hrniec">Recepty z jedného hrnca</a>
			</p>
		{/if}
	</section>
</div>

<style>
	.months {
		margin: var(--sp-3) 0 0;
	}
	.table-wrap {
		margin-top: var(--sp-5);
		overflow-x: auto;
	}
	table {
		border-collapse: separate;
		border-spacing: 2px;
		font-size: var(--fs-sm);
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
	th[scope='row'] a:hover {
		text-decoration: underline;
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
		background: color-mix(in srgb, var(--line) 45%, transparent);
	}
	/*
	 * The produce's own colour, ringed: white cabbage on light paper and black chokeberry on
	 * dark paper would otherwise vanish into the empty months.
	 */
	td.on {
		background: var(--c);
		box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ink) 45%, transparent);
	}
	td.current {
		outline: 2px solid var(--ink);
		outline-offset: -2px;
	}
	/* On a phone all twelve months fit the screen; scrolling sideways hid the current one. */
	@media (max-width: 599px) {
		table {
			width: 100%;
			min-width: 0;
			table-layout: fixed;
			border-spacing: 1px;
			font-size: var(--fs-xs);
		}
		thead th:first-child {
			width: 38%;
		}
		thead th,
		td {
			width: auto;
		}
		th[scope='row'] {
			padding-right: 6px;
			white-space: normal;
			line-height: 1.2;
			overflow-wrap: anywhere;
		}
	}
	.recipes {
		margin-top: var(--sp-6);
	}
</style>

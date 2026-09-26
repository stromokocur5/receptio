<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { formatGrams } from '$lib/amounts';
	import { hashString } from '$lib/art';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { CATEGORY_LABELS } from '$lib/labels';
	import { decodeSharedPlan, type SharedPlan } from '$lib/share';
	import { approxPieces } from '$lib/shopping';
	import { plan, settings } from '$lib/state.svelte';
	import { INGREDIENT_CATEGORIES } from '$lib/types';

	const CHECKED_KEY = 'receptio:shared-checked';

	const catalog = useCatalog();

	let shared = $state<SharedPlan | null>(null);
	let status = $state<'loading' | 'ok' | 'empty' | 'invalid'>('loading');
	let listKey = '';
	let checked = $state<Record<string, boolean>>({});
	let confirmReplace = $state(false);

	const groups = $derived.by(() => {
		if (!shared) return [];
		const items = shared.buy
			.map(([id, grams]) => ({ ingredient: catalog.ingredientsById.get(id)!, grams }))
			.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'sk'));
		return INGREDIENT_CATEGORIES.map(
			(c) => [c, items.filter((i) => i.ingredient.category === c)] as const
		).filter(([, list]) => list.length);
	});
	const doneCount = $derived(shared ? shared.buy.filter(([id]) => checked[id]).length : 0);

	onMount(() => {
		const fragment = location.hash.slice(1);
		if (!fragment) {
			status = 'empty';
			return;
		}
		shared = decodeSharedPlan(
			fragment,
			new Set(catalog.recipesById.keys()),
			new Set(catalog.ingredientsById.keys())
		);
		status = shared ? 'ok' : 'invalid';
		// Ticks are kept for the most recent shared list only.
		listKey = String(hashString(fragment));
		try {
			const saved = JSON.parse(localStorage.getItem(CHECKED_KEY) ?? '{}');
			if (saved?.key === listKey && typeof saved.checked === 'object') checked = saved.checked;
		} catch {
			checked = {};
		}
	});

	function toggle(id: string) {
		checked = { ...checked, [id]: !checked[id] };
		try {
			localStorage.setItem(CHECKED_KEY, JSON.stringify({ key: listKey, checked }));
		} catch {
			// Ticks just won't survive a reload.
		}
	}

	async function adoptPlan() {
		if (!shared) return;
		if (plan.current.length && !confirmReplace) {
			confirmReplace = true;
			setTimeout(() => (confirmReplace = false), 3000);
			return;
		}
		plan.current = shared.plan;
		settings.current = { ...settings.current, people: shared.people, planDays: shared.days };
		await goto('/plan');
	}
</script>

<Seo
	title="Zdieľaný nákupný zoznam"
	description="Nákupný zoznam z Receptia, ktorý ti niekto poslal."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Zdieľaný zoznam</p>
		<h1>Nákup od kamaráta</h1>
	</header>

	{#if status === 'loading'}
		<p class="muted">Načítavam…</p>
	{:else if status !== 'ok' || !shared}
		<section class="card box">
			<p>
				{status === 'empty'
					? 'Tento odkaz neobsahuje žiadny zoznam.'
					: 'Odkaz je poškodený alebo neúplný. Popros o nový.'}
			</p>
			<a class="btn leaf" href="/plan"><Icon name="calendar" size={18} /> Môj plán</a>
		</section>
	{:else}
		<div class="layout">
			<section class="card box">
				<div class="box-head">
					<h2><Icon name="basket" size={24} /> Kúpiť</h2>
					<span class="muted">{doneCount}/{shared.buy.length}</span>
				</div>
				{#if shared.buy.length === 0}
					<p class="muted">Netreba nič kupovať.</p>
				{/if}
				{#each groups as [category, items] (category)}
					<div class="cat">
						<h3>{CATEGORY_LABELS[category]}</h3>
						<ul>
							{#each items as item (item.ingredient.id)}
								{@const on = !!checked[item.ingredient.id]}
								<li class:on>
									<label>
										<input
											type="checkbox"
											checked={on}
											onchange={() => toggle(item.ingredient.id)}
										/>
										<span class="box-ui" aria-hidden="true"
											><Icon name="check" size={14} stroke={3} /></span
										>
										<span class="nm">
											{item.ingredient.name}
											<small
												>{formatGrams(item.grams)}{approxPieces(item.ingredient, item.grams)}</small
											>
										</span>
									</label>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
				<p class="muted small">
					Zoznam už nezahŕňa to, čo má odosielateľ doma. Zaškrtnutie sa ukladá len v tvojom
					telefóne.
				</p>
			</section>

			<section class="card box">
				<h2><Icon name="calendar" size={24} /> Recepty v pláne</h2>
				<ul class="recipes">
					{#each shared.plan as entry (entry.recipeId + (entry.variant ?? ''))}
						<li>
							<a href="/recepty/{entry.recipeId}"
								>{catalog.recipesById.get(entry.recipeId)?.title}</a
							>
							<span class="muted">
								{entry.servings} porc.{#if entry.variant}
									· {entry.variant}{/if}
							</span>
						</li>
					{/each}
				</ul>
				<button class="btn ghost" onclick={adoptPlan}>
					<Icon name="download" size={18} />
					{confirmReplace ? 'Nahradiť môj plán?' : 'Prevziať plán ku mne'}
				</button>
			</section>
		</div>
	{/if}
</div>

<style>
	.page {
		padding-top: 28px;
	}
	.layout {
		display: grid;
		gap: 20px;
	}
	.box {
		padding: 20px;
	}
	.box-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.4rem;
		margin: 0 0 12px;
	}
	.box-head h2 {
		margin: 0;
	}
	.cat {
		margin-top: 16px;
	}
	.cat h3 {
		font-family: var(--font-body);
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
		margin-bottom: 4px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cat label {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 12px;
		padding: 9px 0;
		cursor: pointer;
	}
	.cat input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.box-ui {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 8px;
		border: 2px solid var(--line);
		color: transparent;
		transition:
			background 0.2s,
			transform 0.3s var(--ease-spring);
	}
	.cat input:focus-visible + .box-ui {
		outline: 3px solid var(--turmeric);
		outline-offset: 2px;
	}
	.on .box-ui {
		background: var(--leaf);
		border-color: var(--leaf);
		color: var(--paper);
		transform: rotate(-6deg);
	}
	.nm {
		display: flex;
		flex-direction: column;
	}
	.nm small {
		color: var(--muted);
	}
	.on .nm {
		opacity: 0.5;
		text-decoration: line-through;
	}
	.small {
		font-size: 0.84rem;
		margin: 16px 0 0;
	}
	.recipes {
		margin-bottom: 16px;
	}
	.recipes li {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
	}
	.recipes a {
		font-weight: 650;
		color: var(--ink);
	}
	@media (min-width: 900px) {
		.layout {
			grid-template-columns: 1.2fr 1fr;
			align-items: start;
		}
	}
</style>

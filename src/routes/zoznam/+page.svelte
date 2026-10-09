<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { formatGrams } from '$lib/amounts';
	import { hashString } from '$lib/art';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import ShoppingRow from '$lib/components/ShoppingRow.svelte';
	import { toast } from '$lib/toast.svelte';
	import { CATEGORY_LABELS } from '$lib/labels';
	import { decodeSharedPlan, type SharedPlan } from '$lib/share';
	import { LIVE_PREFIX, joinLiveList, leaveLiveList, live, tickLive } from '$lib/live-list.svelte';
	import { approxPieces } from '$lib/shopping';
	import { plan, settings, storeOrder, ui } from '$lib/state.svelte';
	import { noteTick, orderAisles } from '$lib/store-order';
	import { INGREDIENT_CATEGORIES } from '$lib/types';

	const CHECKED_KEY = 'receptio:shared-checked';

	const catalog = useCatalog();

	let snapshot = $state<SharedPlan | null>(null);
	let status = $state<'loading' | 'ok' | 'empty' | 'invalid'>('loading');
	let listKey = '';
	let localChecked = $state<Record<string, boolean>>({});
	/** Shopping together: the list and ticks come from the shared, encrypted record. */
	let isLive = $state(false);

	const decode = (fragment: string) =>
		decodeSharedPlan(
			fragment,
			new Set(catalog.recipesById.keys()),
			new Set(catalog.ingredientsById.keys())
		);
	const liveList = $derived(isLive && live.data ? decode(live.data.list) : null);
	const shared = $derived(isLive ? liveList : snapshot);
	const checked = $derived<Record<string, boolean>>(
		isLive
			? Object.fromEntries(Object.entries(live.data?.ticks ?? {}).map(([id, [done]]) => [id, done]))
			: localChecked
	);

	const groups = $derived.by(() => {
		if (!shared) return [];
		const items = shared.buy
			.map(([id, grams]) => ({ ingredient: catalog.ingredientsById.get(id)!, grams }))
			.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'sk'));
		const aisles = INGREDIENT_CATEGORIES.map(
			(c): [(typeof INGREDIENT_CATEGORIES)[number], typeof items] => [
				c,
				items.filter((i) => i.ingredient.category === c)
			]
		).filter(([, list]) => list.length);
		// The order this phone learned walking its own shop.
		const mine = settings.current.myStores;
		return orderAisles(aisles, storeOrder.current, mine.length === 1 ? mine[0] : '');
	});
	const doneCount = $derived(shared ? shared.buy.filter(([id]) => checked[id]).length : 0);
	const remaining = $derived(shared ? shared.buy.length - doneCount : 0);
	const things = (n: number) => `${n} ${n === 1 ? 'vec' : n > 1 && n < 5 ? 'veci' : 'vecí'}`;
	const title = $derived(
		isLive
			? 'Spoločný nákup'
			: status === 'ok' || status === 'loading'
				? 'Nákupný zoznam'
				: status === 'empty'
					? 'Tu nie je žiadny zoznam'
					: 'Odkaz nefunguje'
	);

	onMount(() => {
		const fragment = location.hash.slice(1);
		if (!fragment) {
			status = 'empty';
			return;
		}
		if (fragment.startsWith(LIVE_PREFIX)) {
			isLive = true;
			status = 'ok';
			void joinLiveList(fragment.slice(LIVE_PREFIX.length));
			return;
		}
		snapshot = decode(fragment);
		status = snapshot ? 'ok' : 'invalid';
		// Ticks are kept for the most recent shared list only.
		listKey = String(hashString(fragment));
		try {
			const saved = JSON.parse(localStorage.getItem(CHECKED_KEY) ?? '{}');
			if (saved?.key === listKey && typeof saved.checked === 'object') localChecked = saved.checked;
		} catch {
			localChecked = {};
		}
	});
	onDestroy(() => {
		if (isLive) leaveLiveList();
	});

	function toggle(id: string) {
		const category = catalog.ingredientsById.get(id)?.category;
		if (category) {
			const mine = settings.current.myStores;
			storeOrder.current = noteTick(
				storeOrder.current,
				mine.length === 1 ? mine[0] : '',
				id,
				category,
				!checked[id],
				Date.now()
			);
		}
		if (isLive) {
			tickLive(id, !checked[id]);
			return;
		}
		localChecked = { ...localChecked, [id]: !localChecked[id] };
		try {
			localStorage.setItem(CHECKED_KEY, JSON.stringify({ key: listKey, checked: localChecked }));
		} catch {
			// Ticks just won't survive a reload.
		}
	}

	/** Takes the plan over at once; the own plan can come back from the message on /plan. */
	async function adoptPlan() {
		if (!shared) return;
		const before = { plan: plan.current, settings: settings.current };
		plan.current = shared.plan;
		settings.current = { ...settings.current, people: shared.people, planDays: shared.days };
		if (before.plan.length)
			toast('Plán je prevzatý', () => {
				plan.current = before.plan;
				settings.current = before.settings;
			});
		await goto('/plan');
	}
</script>

<Seo
	title="Zdieľaný nákupný zoznam"
	description="Nákupný zoznam z Receptia, ktorý ti niekto poslal."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">{isLive ? 'Nakupujeme spolu' : 'Zdieľaný zoznam'}</p>
		<h1>{title}</h1>
		{#if isLive}
			<p class="live-status" data-status={live.status} role="status">
				<span class="dot" aria-hidden="true"></span>
				{live.status === 'live'
					? 'Naživo – čo odškrtne jeden, uvidí aj druhý'
					: live.status === 'offline'
						? 'Bez spojenia – zaškrtnutia sa pošlú, keď sa pripojíš'
						: 'Pripájam sa…'}
			</p>
		{/if}
	</header>

	{#if status === 'loading' || (isLive && live.status === 'connecting' && !live.data)}
		<p class="muted">Načítavam…</p>
	{:else if isLive && live.status === 'missing'}
		<section class="card box empty">
			<Icon name="basket" size={32} />
			<p>
				Tento spoločný zoznam už neexistuje alebo je odkaz neúplný. Popros o nový – v Pláne cez
				„Nakupovať spolu“.
			</p>
			<a class="btn leaf" href="/plan"><Icon name="calendar" size={18} /> Môj plán</a>
		</section>
	{:else if status !== 'ok' || !shared}
		<section class="card box empty">
			<Icon name="basket" size={32} />
			<p>
				{status === 'empty'
					? 'Sem sa dostaneš cez odkaz na nákupný zoznam, ktorý ti niekto pošle z Receptia. Svoj vlastný zoznam máš v Pláne.'
					: 'Odkaz je poškodený alebo neúplný. Popros o nový.'}
			</p>
			<a class="btn leaf" href="/plan"><Icon name="calendar" size={18} /> Môj plán</a>
		</section>
	{:else}
		<div class="layout">
			<section class="card box">
				<div class="box-head">
					<h2 class="section-title"><Icon name="basket" size={24} /> Kúpiť</h2>
					{#if shared.buy.length}
						<span class="muted"
							>{remaining ? `Ešte kúpiť ${things(remaining)}` : 'Všetko v košíku'}</span
						>
					{/if}
				</div>
				{#if shared.buy.length === 0}
					<p class="notice ok"><Icon name="check" size={18} /> Netreba nič kupovať.</p>
				{/if}
				{#each groups as [category, items] (category)}
					<div class="cat">
						<h3 class="eyebrow">{CATEGORY_LABELS[category]}</h3>
						<ul>
							{#each items as item (item.ingredient.id)}
								<ShoppingRow
									name={item.ingredient.name}
									checked={!!checked[item.ingredient.id]}
									ontoggle={() => toggle(item.ingredient.id)}
								>
									{#snippet note()}
										{formatGrams(item.grams)}{approxPieces(item.ingredient, item.grams)}
									{/snippet}
								</ShoppingRow>
							{/each}
						</ul>
					</div>
				{/each}
				<p class="hint footnote">
					Zoznam už nezahŕňa to, čo má odosielateľ doma.
					{isLive
						? 'Zaškrtnutia vidia všetci, ktorí majú tento odkaz. Server ich má len zašifrované.'
						: 'Zaškrtnutie sa ukladá len v tvojom telefóne.'}
				</p>
			</section>

			<section class="card box">
				<h2 class="section-title"><Icon name="calendar" size={24} /> Recepty v pláne</h2>
				<ul class="recipes divided">
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
					<Icon name="download" size={18} /> Prevziať plán ku mne
				</button>
				{#if ui.loaded && plan.current.length}
					<p class="hint">Nahradí tvoj terajší plán. Ak si to rozmyslíš, vrátiš ho späť.</p>
				{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	.layout {
		display: grid;
		gap: 20px;
	}
	.box-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-2);
	}
	.box-head .section-title {
		margin: 0;
	}
	.cat {
		margin-top: var(--sp-4);
	}
	.cat h3 {
		margin: 0;
		font-family: var(--font-body);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.footnote {
		margin-top: var(--sp-4);
	}
	.live-status {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-md);
		font-weight: 600;
		color: var(--ink-2);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--muted);
	}
	[data-status='live'] .dot {
		background: var(--leaf);
		animation: pulse 2s ease-in-out infinite;
	}
	[data-status='offline'] .dot {
		background: var(--turmeric);
	}
	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 6px color-mix(in srgb, var(--leaf) 25%, transparent);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		[data-status='live'] .dot {
			animation: none;
		}
	}
	.recipes {
		margin-bottom: var(--sp-4);
	}
	.recipes li {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: var(--sp-2) 0;
	}
	.recipes a {
		font-weight: 650;
		color: var(--ink);
	}
	.recipes .muted {
		white-space: nowrap;
	}
	.empty {
		color: var(--ink-2);
	}
	.empty > :global(svg) {
		color: var(--leaf);
	}
	@media (min-width: 900px) {
		.layout {
			grid-template-columns: 1.2fr 1fr;
			align-items: start;
		}
	}
</style>

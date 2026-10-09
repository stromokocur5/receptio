<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import InstallCard from '$lib/components/InstallCard.svelte';
	import { install } from '$lib/install.svelte';
	import { planCheck } from '$lib/plancheck';
	import PlanScope from '$lib/components/PlanScope.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { formatEur, formatGrams } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import AutoPlanner from '$lib/components/AutoPlanner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PlanNutrition from '$lib/components/PlanNutrition.svelte';
	import PlanSettings from '$lib/components/PlanSettings.svelte';
	import PlateArt from '$lib/components/PlateArt.svelte';
	import { vesselFor } from '$lib/categories';
	import RecipePicker from '$lib/components/RecipePicker.svelte';
	import SavedWeeks from '$lib/components/SavedWeeks.svelte';
	import ShoppingRow from '$lib/components/ShoppingRow.svelte';
	import { toast } from '$lib/toast.svelte';
	import { CATEGORY_LABELS } from '$lib/labels';
	import StorePicker from '$lib/components/StorePicker.svelte';
	import {
		activeSales,
		compareStores,
		shelfCost,
		type ShelfCost,
		type StorePlan
	} from '$lib/pricing';
	import { mealSchedule, type ScheduledMeal } from '$lib/schedule';
	import { useSoon } from '$lib/pantry';
	import { localToday, type DiaryMeal } from '$lib/journal';
	import { budgetStatus, spentThisWeek } from '$lib/budget';
	import { encodeSharedPlan } from '$lib/share';
	import {
		LIVE_PREFIX,
		createLiveList,
		joinLiveList,
		leaveLiveList,
		live,
		ownLiveCode,
		replaceLiveList,
		stopOwnLive,
		tickLive
	} from '$lib/live-list.svelte';
	import { shareCooking } from '$lib/household';
	import {
		claimItem,
		claims,
		household,
		isPersonal,
		members,
		noteCooked,
		notePurchase,
		planFromHousehold,
		planNeed,
		planSlots
	} from '$lib/household.svelte';
	import { noteTick, orderAisles, settleTrip } from '$lib/store-order';
	import {
		approxPieces,
		buildShoppingList,
		isBreakfastEntry,
		type ShoppingItem
	} from '$lib/shopping';
	import {
		addExtraItem,
		checkedItems,
		storeOrder,
		extraItems,
		type ExtraItem,
		journal,
		markCooked,
		undoCooked,
		type CookUndo,
		movePlanEntryUp,
		setPlanBreakfast,
		setPlanCook,
		addToPlan,
		pantryAdded,
		setPlanFreezeExtra,
		planFromFreezer,
		returnToFreezer,
		preserves,
		logPortion,
		purchases,
		recordPurchase,
		portionLogged,
		outOfStock,
		pantry,
		plan,
		setPantryItem,
		setPlanServings,
		settings,
		ui,
		mainMeals
	} from '$lib/state.svelte';

	const catalog = useCatalog();
	const today = $derived(new Date());

	let copied = $state(false);
	let shareState = $state<'idle' | 'copied' | 'failed'>('idle');
	let together = $state<{ status: 'idle' | 'creating' | 'failed'; url: string }>({
		status: 'idle',
		url: ''
	});
	let cookedMessage = $state('');
	let plannerOpen = $state(false);

	/** Adding recipes happens in a sheet; the full list inline made the page endless. */
	let pickerDialog = $state<HTMLDialogElement>();
	const openPicker = () => pickerDialog?.showModal();
	const closePicker = () => pickerDialog?.close();

	function startWithPlanner() {
		plannerOpen = true;
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		document
			.getElementById('navrh')
			?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
	}

	const entries = $derived(
		plan.current
			.map((e) => ({ ...e, recipe: catalog.recipesById.get(e.recipeId) }))
			.filter((e) => e.recipe !== undefined)
			.map((e) => {
				const recipe = e.recipe!;
				const variant = e.variant ? recipe.variants.find((v) => v.name === e.variant) : undefined;
				// `data` holds whatever differs between variants: lines, nutrition, cost.
				return {
					...e,
					recipe,
					data: variant ?? recipe,
					key: `${e.recipeId}|${e.variant ?? ''}|${e.fromFreezer ? `f${e.frozenOn}` : ''}`
				};
			})
	);
	const totalServings = $derived(entries.reduce((s, e) => s + e.servings, 0));
	const balance = $derived(
		planCheck(entries, catalog.ingredientsById, settings.current.planDays, settings.current.people)
	);

	const list = $derived(
		buildShoppingList(
			plan.current,
			catalog.recipesById,
			catalog.ingredientsById,
			pantry.current,
			catalog.prices,
			today,
			new Set(Object.keys(outOfStock.current).filter((id) => outOfStock.current[id]))
		)
	);
	const allItems = $derived(list.byCategory.flatMap(([, items]) => items));

	/**
	 * The shop the list is walked in: the one you shop in, or the one picked when there are more.
	 * Each learns its own order.
	 */
	const shopIn = $derived.by(() => {
		const mine = settings.current.myStores;
		if (mine.length === 1) return mine[0];
		return mine.includes(storeOrder.current.store) ? storeOrder.current.store : '';
	});
	const learnedTrips = $derived(storeOrder.current.trips[shopIn] ?? 0);
	const aisles = $derived(orderAisles(list.byCategory, storeOrder.current, shopIn));

	function pickShop(id: string) {
		storeOrder.current = { ...settleTrip(storeOrder.current, Date.now(), true), store: id };
	}
	function forgetOrder() {
		const before = storeOrder.current;
		const { [shopIn]: _, ...pairs } = before.pairs;
		const { [shopIn]: __, ...trips } = before.trips;
		storeOrder.current = { ...before, pairs, trips, trip: null };
		toast('Poradie obchodu je zabudnuté', () => (storeOrder.current = before));
	}

	/** Aisles (default) or one list per store where each item is cheapest. */
	let groupBy = $state<'aisle' | 'store'>('aisle');
	const hasRealPrices = $derived(allItems.some((i) => i.storeId));
	const groups = $derived.by((): [string, string, ShoppingItem[]][] => {
		if (groupBy === 'aisle') return aisles.map(([c, items]) => [c, CATEGORY_LABELS[c], items]);
		const byStore = new Map<string, ShoppingItem[]>();
		for (const item of allItems) {
			// Follow the recommended shops; anything they lack goes where it's cheapest.
			const key =
				comparison.recommended?.assignment.get(item.ingredient.id) ??
				item.shelf?.storeId ??
				item.storeId ??
				'';
			byStore.set(key, [...(byStore.get(key) ?? []), item]);
		}
		return [...byStore]
			.sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
			.map(([id, items]) => [
				id || 'any',
				id ? (catalog.storesById.get(id)?.name ?? id) : 'Kdekoľvek (reálnu cenu zatiaľ nepoznáme)',
				items
			]);
	});
	const checkedCount = $derived(
		allItems.filter((i) => checkedItems.current[i.ingredient.id]).length
	);

	const comparison = $derived(
		compareStores(
			allItems.map((i) => ({ ingredient: i.ingredient, grams: i.buyGrams })),
			catalog.stores.filter(
				(s) => !settings.current.myStores.length || settings.current.myStores.includes(s.id)
			),
			catalog.prices,
			today
		)
	);
	const storeName = (id: string) => catalog.storesById.get(id)?.name ?? id;
	const storeNames = (plan: StorePlan) => plan.storeIds.map(storeName).join(' a ');

	/**
	 * What each item costs at the till: whole packs in the recommended shop, or wherever it's
	 * cheapest if that shop lacks it; an estimate (by weight) when no real price is known.
	 */
	const pay = $derived(
		new Map(
			allItems.map((item): [string, { shelf: ShelfCost | null; cost: number }] => {
				const storeId = comparison.recommended?.assignment.get(item.ingredient.id);
				const shelf = storeId
					? shelfCost(item.ingredient, item.buyGrams, catalog.prices, today, storeId)
					: item.shelf;
				return [item.ingredient.id, { shelf, cost: shelf?.cost ?? item.cost }];
			})
		)
	);
	/** ingredientId|storeId → the day a sale there ends, to point it out on the list. */
	const saleUntil = $derived(
		new Map(
			activeSales(catalog.prices, today).map((d) => [
				`${d.entry.ingredientId}|${d.entry.storeId}`,
				d.entry.saleUntil!
			])
		)
	);
	/** What the unticked part of the list still costs. */
	const toBuy = $derived(
		allItems
			.filter((i) => !checkedItems.current[i.ingredient.id])
			.reduce((sum, i) => sum + (pay.get(i.ingredient.id)?.cost ?? 0), 0)
	);
	const budget = $derived(
		settings.current.weeklyBudget === null
			? null
			: budgetStatus(
					settings.current.weeklyBudget,
					spentThisWeek(purchases.current, localToday()),
					toBuy
				)
	);
	const payTotal = $derived([...pay.values()].reduce((sum, p) => sum + p.cost, 0));
	const payHasEstimates = $derived([...pay.values()].some((p) => !p.shelf));
	/** Shops that have every item with a known price – real one-stop options. */
	const completeShops = $derived(comparison.singles.filter((s) => s.missing === 0));
	const incompleteShops = $derived(comparison.singles.filter((s) => s.missing > 0));

	/**
	 * Days of one adult eating every planned meal: the plan's food divided by this is "per person
	 * a day". In a household, children's smaller portions and days away count less.
	 */
	const personDays = $derived.by(() => {
		const slots = planSlots(settings.current);
		const mealsADay = mainMeals(settings.current).length + (settings.current.breakfasts ? 1 : 0);
		if (!slots || !mealsADay) return settings.current.planDays * settings.current.people;
		return (slots.mainPortions + slots.morningPortions) / mealsADay;
	});
	/** Portions a lunch or dinner takes, on average over the plan. */
	const perMeal = $derived.by(() => {
		const slots = planSlots(settings.current);
		return slots?.main ? slots.mainPortions / slots.main : settings.current.people;
	});
	const cooks = $derived(ui.loaded && planFromHousehold() ? members() : []);
	const cookName = (id: string | undefined) => cooks.find((m) => m.id === id)?.name;
	/** Dishes one member makes just for themselves, outside the shared meals. */
	const personal = $derived(ui.loaded ? entries.filter((e) => isPersonal(e)) : []);
	const itemClaims = $derived(ui.loaded ? claims() : new Map());

	const schedule = $derived(
		mealSchedule(
			plan.current.filter((e) => !isPersonal(e)),
			settings.current.people,
			mainMeals(settings.current).length,
			settings.current.planDays,
			{
				keeps: (id) => catalog.recipesById.get(id)?.keeps,
				need: planNeed(settings.current),
				breakfasts: settings.current.breakfasts,
				isBreakfast: (e) => isBreakfastEntry(e, catalog.recipesById.get(e.recipeId))
			}
		)
	);
	const dayLabel = new Intl.DateTimeFormat('sk-SK', {
		weekday: 'short',
		day: 'numeric',
		month: 'numeric'
	});
	function dayName(offset: number) {
		if (offset === 0) return 'Dnes';
		if (offset === 1) return 'Zajtra';
		return dayLabel.format(new Date(today.getTime() + offset * 86_400_000));
	}
	const shortDay = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric' });
	const dateShort = (iso: string) => shortDay.format(new Date(`${iso}T12:00:00`));
	const titleOf = (recipeId: string) => catalog.recipesById.get(recipeId)?.title ?? recipeId;

	function cooked(e: (typeof entries)[number]) {
		const { used, undo } = markCooked(
			e.recipeId,
			e.variant,
			e.servings,
			e.data.lines,
			e.recipe.servings,
			catalog.ingredientsById,
			e.recipe.title
		);
		cookedMessage = used.length
			? `${e.recipe.title}: zapísané, zo špajze ubudlo ${used.map((u) => u.ingredient.name).join(', ')}.`
			: `${e.recipe.title}: zapísané do histórie.`;
		justCooked = { recipeId: e.recipeId, variant: e.variant };
		cookUndo = undo;
		noteCooked(e.recipeId);
	}
	/** The last "cooked", to take back a mis-tap. */
	let cookUndo = $state<CookUndo | null>(null);
	function uncook() {
		if (!cookUndo) return;
		undoCooked(cookUndo);
		cookUndo = null;
		justCooked = null;
		cookedMessage = 'Vrátené – recept je späť v pláne a suroviny v špajzi.';
	}
	/** The recipe just marked cooked, to log a portion of it right away if it's eaten now. */
	let justCooked = $state<{ recipeId: string; variant?: string } | null>(null);

	// Freezer portions were paid for when they were cooked.
	const planCost = $derived(
		entries.reduce((s, e) => s + (e.fromFreezer ? 0 : e.data.costPerServing * e.servings), 0)
	);
	/** Fresh food at home that should be used soon, each with recipes that use it up. */
	const useUp = $derived.by(() => {
		if (!ui.loaded) return [];
		const planned = new Set(plan.current.map((e) => e.recipeId));
		return useSoon(pantry.current, pantryAdded.current, catalog.ingredientsById, new Date())
			.slice(0, 3)
			.map((s) => ({
				...s,
				recipes: catalog.recipes
					.filter(
						(r) =>
							!planned.has(r.id) &&
							r.treat.length === 0 &&
							r.lines.some((l) => l.ingredientId === s.ingredient.id)
					)
					.sort((a, b) => a.costPerServing - b.costPerServing)
					.slice(0, 2)
			}))
			.filter((s) => s.recipes.length);
	});
	/** Cooked dishes waiting in the freezer that can go into the plan. */
	const frozenMeals = $derived(
		ui.loaded
			? preserves.current.filter(
					(p) => p.place === 'mraznicka' && p.recipeId && catalog.recipesById.has(p.recipeId)
				)
			: []
	);

	function setOutOfStock(id: string, missing: boolean) {
		const { [id]: _previous, ...rest } = outOfStock.current;
		outOfStock.current = missing ? { ...rest, [id]: true } : rest;
	}

	let extraText = $state('');
	const itemCount = $derived(allItems.length + extraItems.current.length);
	const boughtCount = $derived(checkedCount + extraItems.current.filter((x) => x.checked).length);
	/** One number for what's still to buy, the same in the jump bar and above the list. */
	const remaining = $derived(itemCount - boughtCount);

	function toggleExtra(id: string) {
		extraItems.current = extraItems.current.map((x) =>
			x.id === id ? { ...x, checked: !x.checked } : x
		);
	}
	function removeExtra(x: ExtraItem) {
		const before = extraItems.current;
		extraItems.current = before.filter((y) => y.id !== x.id);
		toast(`${x.text}: odstránené`, () => (extraItems.current = before));
	}
	/** Unticks everything; bought extras are done with and go away. */
	function clearChecked() {
		const before = {
			checked: checkedItems.current,
			extras: extraItems.current,
			order: storeOrder.current
		};
		const ticked = Object.keys(before.checked).filter((id) => before.checked[id]);
		if (following) for (const id of ticked) tickLive(id, false);
		checkedItems.current = {};
		extraItems.current = extraItems.current.filter((x) => !x.checked);
		endTrip();
		toast('Košík je prázdny', () => {
			checkedItems.current = before.checked;
			extraItems.current = before.extras;
			storeOrder.current = before.order;
			if (following) for (const id of ticked) tickLive(id, true);
		});
	}

	function toggleChecked(id: string) {
		const done = !checkedItems.current[id];
		checkedItems.current = { ...checkedItems.current, [id]: done };
		if (following) tickLive(id, done);
		const category = catalog.ingredientsById.get(id)?.category;
		if (category) {
			storeOrder.current = noteTick(storeOrder.current, shopIn, id, category, done, Date.now());
		}
	}
	/** The basket was emptied: the trip is over, learn from it now. */
	function endTrip() {
		if (storeOrder.current.trip)
			storeOrder.current = settleTrip(storeOrder.current, Date.now(), true);
	}

	/**
	 * Shopping together, from the side that shared the list: what the other one ticks shows here
	 * (and goes to the pantry with "bought"), what's ticked here shows there, and a changed plan
	 * updates their list.
	 */
	let following = $state(false);
	// A trip left unfinished (the basket never emptied) is learned once it's clearly over.
	let settled = false;
	$effect(() => {
		if (!ui.loaded || settled) return;
		settled = true;
		const next = settleTrip(storeOrder.current, Date.now());
		if (next !== storeOrder.current) storeOrder.current = next;
	});
	onMount(() => {
		const code = ownLiveCode();
		if (!code) return;
		following = true;
		together = { status: 'idle', url: `${location.origin}/zoznam#${LIVE_PREFIX}${code}` };
		void joinLiveList(code);
	});
	onDestroy(() => {
		if (following) leaveLiveList();
	});
	$effect(() => {
		if (!following || !live.data) return;
		const ticks = live.data.ticks;
		const ids = new Set(allItems.map((i) => i.ingredient.id));
		const changes = Object.entries(ticks).filter(
			([id, [done]]) => ids.has(id) && !!checkedItems.current[id] !== done
		);
		if (changes.length) {
			checkedItems.current = {
				...checkedItems.current,
				...Object.fromEntries(changes.map(([id, [done]]) => [id, done]))
			};
		}
	});
	$effect(() => {
		if (following && live.status === 'live') replaceLiveList(listFragment());
	});

	function endTogether() {
		following = false;
		together = { status: 'idle', url: '' };
		stopOwnLive();
	}

	const things = (n: number) => `${n} ${n === 1 ? 'vec' : n > 1 && n < 5 ? 'veci' : 'vecí'}`;
	const pieces = (item: ShoppingItem) => approxPieces(item.ingredient, item.buyGrams);

	async function copyList() {
		const lines = aisles.flatMap(([category, items]) => [
			`${CATEGORY_LABELS[category]}:`,
			...items.map((i) => `- ${i.ingredient.name}: ${formatGrams(i.buyGrams)}${pieces(i)}`),
			''
		]);
		const extras = extraItems.current.filter((x) => !x.checked);
		if (extras.length) lines.push('Navyše:', ...extras.map((x) => `- ${x.text}`));
		try {
			await navigator.clipboard.writeText(lines.join('\n').trim());
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			copied = false;
		}
	}

	/** Link with the plan and the still-to-buy list in the URL fragment (never sent to the server). */
	function listFragment() {
		return encodeSharedPlan({
			plan: plan.current,
			buy: allItems.map((i) => [i.ingredient.id, i.buyGrams]),
			people: settings.current.people,
			days: settings.current.planDays
		});
	}

	async function shareList() {
		const url = `${location.origin}/zoznam#${listFragment()}`;
		try {
			if (navigator.share) {
				await navigator.share({ title: 'Nákupný zoznam · Receptio', url });
				return;
			}
			await navigator.clipboard.writeText(url);
			shareState = 'copied';
		} catch (err) {
			// Closing the share sheet is not an error worth showing.
			if (err instanceof DOMException && err.name === 'AbortError') return;
			shareState = 'failed';
		}
		setTimeout(() => (shareState = 'idle'), 2200);
	}

	/** A list both people tick off together; the code stays in the link, the server sees ciphertext. */
	async function shopTogether() {
		together = { status: 'creating', url: '' };
		try {
			const code = await createLiveList(listFragment());
			following = true;
			void joinLiveList(code);
			const url = `${location.origin}/zoznam#${LIVE_PREFIX}${code}`;
			together = { status: 'idle', url };
			if (navigator.share) await navigator.share({ title: 'Nakupujeme spolu · Receptio', url });
			else await navigator.clipboard.writeText(url);
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (!together.url) together = { status: 'failed', url: '' };
		}
	}

	function boughtToPantry() {
		const paid = allItems
			.filter((i) => checkedItems.current[i.ingredient.id])
			.reduce((sum, i) => sum + (pay.get(i.ingredient.id)?.cost ?? 0), 0);
		recordPurchase(paid);
		notePurchase(paid);
		for (const item of allItems) {
			if (!checkedItems.current[item.ingredient.id]) continue;
			if (item.restock) setOutOfStock(item.ingredient.id, false);
			const current = pantry.current[item.ingredient.id];
			if (current === null) continue;
			// Whole packs go into the pantry – what the recipes don't use is still at home.
			const shelf = pay.get(item.ingredient.id)?.shelf;
			const bought =
				shelf && Number.isInteger(shelf.packs) ? shelf.packs * shelf.packGrams : item.buyGrams;
			setPantryItem(item.ingredient.id, Math.round((current ?? 0) + bought));
		}
		checkedItems.current = {};
		extraItems.current = extraItems.current.filter((x) => !x.checked);
		endTrip();
		// Bought and put away: the shopping trip is over.
		if (following) endTogether();
	}

	/** At once, with a way back: a whole week of picking is too much to lose to a mis-tap. */
	function clearPlan() {
		const before = { plan: plan.current, checked: checkedItems.current };
		plan.current = [];
		checkedItems.current = {};
		toast('Plán je prázdny', () => {
			plan.current = before.plan;
			checkedItems.current = before.checked;
		});
	}

	/** Phones stack everything; these tabs jump straight to the shopping list in the shop. */
	const PLAN_SECTIONS = [
		{ id: 'rozpis', label: 'Týždeň' },
		{ id: 'recepty-v-plane', label: 'Recepty' },
		{ id: 'ziviny', label: 'Živiny' },
		{ id: 'nakup', label: 'Nákup' }
	] as const;
	let currentSection = $state<string>('rozpis');
	$effect(() => {
		if (!entries.length) return;
		const observer = new IntersectionObserver(
			(seen) => {
				for (const entry of seen) if (entry.isIntersecting) currentSection = entry.target.id;
			},
			{ rootMargin: '-35% 0px -60% 0px' }
		);
		for (const s of PLAN_SECTIONS) {
			const el = document.getElementById(s.id);
			if (el) observer.observe(el);
		}
		return () => observer.disconnect();
	});
</script>

{#snippet cookedNote()}
	{#if cookedMessage}
		<div class="notice ok cooked-msg" role="status">
			<Icon name="check" size={18} />
			<p>
				{cookedMessage}
				<a href="/spajza">Špajza</a>
				{#if cookUndo}
					<button class="btn-link" onclick={uncook}>Späť – ešte nie je uvarené</button>
				{/if}
				{#if justCooked && journal.current.enabled}
					<button
						class="btn-link"
						onclick={() => {
							logPortion(justCooked!.recipeId, justCooked!.variant);
							justCooked = null;
						}}>Porciu jem hneď – zapísať do denníka</button
					>
				{/if}
			</p>
		</div>
	{/if}
{/snippet}

<Seo
	title="Plán a nákup"
	description="Naplánuj si jedlá na týždeň a dostaneš jeden nákupný zoznam – bez vecí, ktoré už máš doma."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Plán a nákup</p>
		<h1>Týždeň bez stresu</h1>
		<p class="lede">
			Pridaj recepty a počet porcií. Receptio z nich spraví jeden nákupný zoznam, odpočíta to, čo
			máš v špajzi, a ukáže, ako na tom si so živinami.
		</p>
		<PlanScope />
		{#if household.doc}
			<p class="household-note">
				<Icon name="users" size={18} />
				<span
					>{#if household.solo}Tvoj vlastný plán – spoločný plán domácnosti <a href="/domacnost"
							>{household.doc.name[0]}</a
						> na teba počká.{:else}Spoločný plán domácnosti <a href="/domacnost"
							>{household.doc.name[0]}</a
						>
						– zmeny vidia všetci{household.status === 'offline'
							? ' (teraz offline)'
							: ''}.{/if}</span
				>
				{#if cooks.length > 1 && entries.length}
					<button
						class="btn-link"
						onclick={() =>
							(plan.current = shareCooking(
								plan.current,
								cooks.filter((m) => m.meals.obed || m.meals.vecera).map((m) => m.id)
							))}>Rozdeliť varenie</button
					>
				{/if}
			</p>
		{/if}
	</header>

	{#if entries.length}
		<nav class="jump-bar" aria-label="Časti plánu" data-noprint>
			{#each PLAN_SECTIONS as s (s.id)}
				<a href="#{s.id}" class:active={currentSection === s.id}
					>{s.label}{#if s.id === 'nakup' && remaining > 0}<span class="n"
							><span class="sr-only">, ešte kúpiť </span>{remaining}</span
						>{/if}</a
				>
			{/each}
		</nav>
	{/if}

	<div class="layout">
		<div class="column">
			{#if ui.loaded && entries.length === 0}
				<section class="card box start">
					<h2 class="section-title"><Icon name="calendar" size={24} /> Ako chceš začať?</h2>
					<p class="muted">
						Plán je zatiaľ prázdny. Vyber si, čo ti sedí – všetko sa dá neskôr zmeniť.
					</p>
					<div class="start-grid">
						<button class="start-opt" onclick={startWithPlanner}>
							<span class="start-ico" style:--tone="var(--sky)"
								><Icon name="sparkle" size={22} /></span
							>
							<strong>Navrhni mi týždeň</strong>
							<small>Podľa rozpočtu, bielkovín a toho, čo máš doma.</small>
						</button>
						<button class="start-opt" onclick={openPicker}>
							<span class="start-ico" style:--tone="var(--tomato)"
								><Icon name="bowl" size={22} /></span
							>
							<strong>Vyberiem recepty</strong>
							<small>Nájdi recepty a pridaj ich jedným ťuknutím.</small>
						</button>
						<a class="start-opt" href="/spajza">
							<span class="start-ico" style:--tone="var(--turmeric)"
								><Icon name="jar" size={22} /></span
							>
							<strong>Z toho, čo mám doma</strong>
							<small>Naklikaj špajzu a uvidíš, čo z nej uvaríš.</small>
						</a>
					</div>
				</section>
			{/if}
			{#if !entries.length}{@render cookedNote()}{/if}
			{#if entries.length}
				<section class="card box" id="rozpis">
					<div class="box-head">
						<h2 class="section-title"><Icon name="calendar" size={24} /> Tvoj týždeň</h2>
						<button class="btn leaf small" onclick={openPicker}>
							<Icon name="plus" size={16} /> Pridať recept
						</button>
					</div>
					<PlanSettings />
					{#if useUp.length}
						<div class="notice warn use-up">
							<Icon name="alert" size={18} />
							<div>
								<p>
									<strong>Minúť čoskoro:</strong>
									{useUp
										.map(
											(s) =>
												`${s.ingredient.name.split(' (')[0].toLowerCase()} (${s.days} dní doma)`
										)
										.join(', ')}
								</p>
								<div class="chips">
									{#each useUp.flatMap((s) => s.recipes) as r (r.id)}
										<button class="chip" onclick={() => addToPlan(r.id, r.servings)}>
											<Icon name="plus" size={14} />
											{r.title}
										</button>
									{/each}
								</div>
							</div>
						</div>
					{/if}
					<ol class="days divided">
						{#each schedule.days as day, d (d)}
							<li class:today={d === 0}>
								<span class="day">{dayName(d)}</span>
								<span class="meals">
									{#if day.breakfast !== undefined}
										{@render slot(day.breakfast, d === 0 ? 'ranajky' : null, 'Raňajky')}
									{/if}
									{#each day.meals as meal, m (m)}
										{@render slot(meal, d === 0 ? mainMeals(settings.current)[m] : null)}
									{/each}
								</span>
							</li>
						{/each}
					</ol>
					{#if personal.length}
						<p class="small personal">
							<Icon name="users" size={16} /> Mimo spoločných jedál:
							{personal
								.map((e) => `${e.recipe.title} (${cookName(e.only) ?? ''}, ${e.servings} porc.)`)
								.join(' · ')}
						</p>
					{/if}
					<p class="coverage small">
						{#if schedule.unplannedMeals}
							Chýba ešte {schedule.unplannedMeals}
							{schedule.unplannedMeals === 1
								? 'jedlo'
								: schedule.unplannedMeals < 5
									? 'jedlá'
									: 'jedál'}
							– pridaj recept alebo porcie.
						{:else}
							<Icon name="check" size={16} /> Plán pokryje všetky jedlá.
						{/if}
						{#if schedule.unplannedBreakfasts}
							Raňajky chýbajú na {schedule.unplannedBreakfasts}
							{schedule.unplannedBreakfasts === 1
								? 'deň'
								: schedule.unplannedBreakfasts < 5
									? 'dni'
									: 'dní'}
							– pridaj raňajkový recept (kaša, palacinky, tofu praženica…).
						{/if}
						{#if schedule.extraServings}
							{schedule.extraServings === 1
								? 'Zvýši 1 porcia'
								: schedule.extraServings < 5
									? `Zvýšia ${schedule.extraServings} porcie`
									: `Zvýši ${schedule.extraServings} porcií`} navyše.
						{/if}
					</p>
					<p class="hint">
						Rozpis počíta s tým, koľko ktoré jedlo vydrží v chladničke a či sa dá zamraziť. Poradie
						zmeníš v receptoch tlačidlom „Skôr“. <a href="/wiki/meal-prep">Ako variť na viac dní</a>
					</p>
				</section>
				<section class="card box" id="recepty-v-plane">
					<div class="box-head">
						<h2 class="section-title"><Icon name="bowl" size={24} /> Recepty a porcie</h2>
						<button class="btn danger small" onclick={clearPlan}>
							<Icon name="trash" size={16} /> Vymazať plán
						</button>
					</div>
					{#if entries.length > 1}
						<a class="prep-link sunk" href="/plan/varenie">
							<Icon name="pot" size={20} />
							<span>
								<strong>Navar všetko naraz</strong>
								<small>Čo nakrájať spolu, v akom poradí variť a čo koľko vydrží</small>
							</span>
							<Icon name="arrow-right" size={18} />
						</a>
					{/if}

					<ul class="entries divided">
						{#each entries as e, i (e.key)}
							<li class:frozen={e.fromFreezer}>
								<div class="mini plate-host">
									<PlateArt
										seed={e.recipe.id}
										lines={e.data.lines}
										byId={catalog.ingredientsById}
										vessel={vesselFor(e.recipe.categories)}
										animate={false}
									/>
								</div>
								<div class="info">
									<a href="/recepty/{e.recipe.id}">{e.recipe.title}</a>
									<span class="muted">
										{#if isPersonal(e)}<span class="badge">iba {cookName(e.only)}</span>
										{/if}{#if e.fromFreezer}<span class="badge sky">z mrazničky</span>
										{/if}{#if e.variant}{e.variant} ·
										{/if}{e.fromFreezer
											? 'už zaplatené'
											: formatEur(e.data.costPerServing * e.servings)}
										{#if e.freezeExtra}· z toho {e.freezeExtra} porc. do mrazničky{/if}
										{#if !isPersonal(e) && (perMeal !== 1 || mainMeals(settings.current).length > 1)}
											· {Math.floor(e.servings / perMeal + 1e-9)}× jedlo
										{/if}
									</span>
									{#if cooks.length > 1 && !e.fromFreezer}
										<label class="cook-pick">
											<Icon name="pot" size={16} />
											<span class="sr-only">Kto varí {e.recipe.title}</span>
											<select
												class="input sm"
												value={e.cook ?? ''}
												onchange={(ev) => setPlanCook(i, ev.currentTarget.value || undefined)}
											>
												<option value="">Varí ktokoľvek</option>
												{#each cooks as m (m.id)}<option value={m.id}>Varí {m.name}</option>{/each}
											</select>
										</label>
									{/if}
								</div>
								{#if !e.fromFreezer}
									<div class="stepper" role="group" aria-label="Porcie pre {e.recipe.title}">
										<button
											class="icon-btn"
											aria-label={e.servings === 1 ? 'Odobrať z plánu' : 'Menej porcií'}
											onclick={() => setPlanServings(e.recipeId, e.variant, e.servings - 1, e.only)}
										>
											<Icon name={e.servings === 1 ? 'trash' : 'minus'} size={18} />
										</button>
										<span aria-live="polite">{e.servings}<span class="sr-only"> porcií</span></span>
										<button
											class="icon-btn"
											aria-label="Viac porcií"
											onclick={() => setPlanServings(e.recipeId, e.variant, e.servings + 1, e.only)}
										>
											<Icon name="plus" size={18} />
										</button>
									</div>
								{/if}
								<div class="entry-actions">
									{#if i > 0}
										<button class="chip" onclick={() => movePlanEntryUp(i)} title="Variť skôr">
											<Icon name="arrow-up" size={14} stroke={2.2} /> Skôr
										</button>
									{/if}
									{#if e.fromFreezer}
										<button
											class="chip"
											onclick={() => returnToFreezer(i, e.recipe.title)}
											title="Vrátiť porcie do mrazničky"
										>
											<Icon name="arrow-left" size={14} stroke={2.2} /> Späť do mrazničky
										</button>
									{:else}
										<button
											class="chip"
											onclick={() => cooked(e)}
											title="Uvarené – odpočítať zo špajze"
										>
											<Icon name="check" size={14} stroke={2.2} /> Uvarené
										</button>
										{#if (e.recipe.keeps?.freezer ?? 0) > 0}
											<button
												class="chip"
												aria-pressed={!!e.freezeExtra}
												onclick={() => setPlanFreezeExtra(i, !e.freezeExtra)}
												title="Vydrží {e.recipe.keeps?.fridge ?? 3} dni v chladničke a {e.recipe
													.keeps?.freezer} mes. v mrazničke"
											>
												<Icon name={e.freezeExtra ? 'check' : 'snowflake'} size={14} stroke={2.2} />
												2× a polovicu zamraziť
											</button>
										{/if}
									{/if}
									{#if settings.current.breakfasts}
										{@const morning = isBreakfastEntry(e, e.recipe)}
										<button
											class="chip"
											aria-pressed={morning}
											onclick={() => setPlanBreakfast(i, !morning)}
											title={morning ? 'Presunúť medzi hlavné jedlá' : 'Jesť na raňajky'}
										>
											<Icon name={morning ? 'check' : 'sun'} size={14} stroke={2.2} />
											Na raňajky
										</button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
					{#if frozenMeals.length}
						<div class="freezer">
							<h3><Icon name="snowflake" size={18} /> V mrazničke</h3>
							<ul class="divided">
								{#each frozenMeals as f (f.id)}
									<li>
										<span class="frozen-name">
											<a href="/recepty/{f.recipeId}">{f.name}</a>
											<small class="muted">{f.count} porc. · od {dateShort(f.made)}</small>
										</span>
										<button
											class="btn ghost small"
											onclick={() => planFromFreezer(f.id, settings.current.people)}
										>
											<Icon name="plus" size={16} /> Do plánu
										</button>
									</li>
								{/each}
							</ul>
							<p class="hint">
								Na jedlo z mrazničky sa nič nenakupuje. Deň vopred ho presuň do chladničky.
							</p>
						</div>
					{/if}
					{@render cookedNote()}
					<p class="summary">
						<strong>{totalServings}</strong>
						{totalServings === 1
							? 'porcia'
							: totalServings > 1 && totalServings < 5
								? 'porcie'
								: 'porcií'}
						· spolu <strong>{formatEur(planCost)}</strong>
						· <strong>{formatEur(totalServings ? planCost / totalServings : 0)}</strong> / porcia
					</p>
				</section>
				<PlanNutrition
					entries={entries.filter((e) => !isPersonal(e))}
					{personDays}
					{cooks}
					{balance}
				/>
			{/if}
			<AutoPlanner bind:open={plannerOpen} />
			<SavedWeeks />
		</div>

		<div class="column">
			<section class="card box shop" id="nakup">
				<div class="box-head">
					<h2 class="section-title"><Icon name="basket" size={24} /> Nákupný zoznam</h2>
					{#if allItems.length}
						<div class="head-actions">
							<button class="btn ghost small" onclick={copyList}>
								<Icon name={copied ? 'check' : 'copy'} size={16} />
								{copied ? 'Skopírované' : 'Text'}
							</button>
							<button class="btn leaf small" onclick={shareList}>
								<Icon name={shareState === 'copied' ? 'check' : 'share'} size={16} />
								{shareState === 'copied'
									? 'Odkaz skopírovaný'
									: shareState === 'failed'
										? 'Nepodarilo sa'
										: 'Zdieľať'}
							</button>
						</div>
					{/if}
				</div>

				{#if !ui.loaded}
					<p class="muted">Načítavam…</p>
				{:else if entries.length === 0}
					{#if extraItems.current.length}
						<p class="muted">Recepty v pláne zatiaľ nemáš – tu sú tvoje vlastné položky.</p>
					{:else}
						<div class="empty">
							<Icon name="basket" size={28} />
							<p>Tu sa objaví zoznam, keď pridáš recepty.</p>
						</div>
					{/if}
					{@render extrasOnly()}
				{:else if allItems.length === 0}
					<p class="notice ok"><Icon name="check" size={18} /> Na recepty máš všetko doma.</p>
					{@render extrasOnly()}
				{:else}
					<div class="progress-row">
						<div
							class="progress"
							role="progressbar"
							aria-label="Nakúpené"
							aria-valuemin="0"
							aria-valuemax={itemCount}
							aria-valuenow={boughtCount}
						>
							<span style:width="{itemCount ? (boughtCount / itemCount) * 100 : 0}%"></span>
						</div>
						<p>
							{#if remaining === 0}
								<strong>Všetko v košíku.</strong>
							{:else}
								Ešte kúpiť <strong>{things(remaining)}</strong>
							{/if}
							· zaplatíš {payHasEstimates ? 'asi' : ''} <strong>{formatEur(payTotal)}</strong>
						</p>
					</div>
					<div class="shop-tools">
						{#if hasRealPrices}
							<div class="segmented" role="group" aria-label="Zoradenie zoznamu">
								<button aria-pressed={groupBy === 'aisle'} onclick={() => (groupBy = 'aisle')}>
									Podľa uličiek
								</button>
								<button aria-pressed={groupBy === 'store'} onclick={() => (groupBy = 'store')}>
									Kde je najlacnejšie
								</button>
							</div>
						{/if}
						{#if groupBy === 'aisle'}
							{#if settings.current.myStores.length > 1}
								<div class="chips" role="group" aria-label="V ktorom obchode nakupuješ">
									{#each settings.current.myStores as id (id)}
										<button class="chip" aria-pressed={shopIn === id} onclick={() => pickShop(id)}>
											{catalog.storesById.get(id)?.name ?? id}
										</button>
									{/each}
								</div>
							{/if}
							<p class="hint learned">
								{#if learnedTrips}
									<Icon name="sparkle" size={16} />
									<span>
										Zoradené tak, ako chodíš po obchode – naučené z {learnedTrips}
										{learnedTrips === 1 ? 'nákupu' : 'nákupov'}.
										<button class="btn-link quiet" onclick={forgetOrder}>Zabudnúť</button>
									</span>
								{:else}
									Odškrtávaj v obchode postupne – zoznam sa naučí, kade chodíš, a nabudúce sa tak
									zoradí.
								{/if}
							</p>
						{/if}
					</div>
					{#each groups as [key, label, items] (key)}
						{@const toBuy = items.filter((i) => !checkedItems.current[i.ingredient.id])}
						{#if toBuy.length}
							<div class="cat">
								<h3 class="eyebrow">{label}</h3>
								<ul>
									{#each toBuy as item (item.ingredient.id)}
										{@render itemRow(item)}
									{/each}
								</ul>
							</div>
						{/if}
					{/each}

					{@render extrasBlock()}

					{#if boughtCount}
						<details class="cat in-cart" open>
							<summary><h3 class="eyebrow">V košíku ({boughtCount})</h3></summary>
							<ul>
								{#each allItems.filter((i) => checkedItems.current[i.ingredient.id]) as item (item.ingredient.id)}
									{@render itemRow(item)}
								{/each}
								{#each extraItems.current.filter((x) => x.checked) as x (x.id)}
									{@render extraRow(x)}
								{/each}
							</ul>
							<div class="cart-actions">
								{#if checkedCount}
									<button class="btn leaf" onclick={boughtToPantry}>
										<Icon name="jar" size={18} /> Nakúpené → do špajze
									</button>
								{/if}
								<button class="btn ghost small" onclick={clearChecked}>
									<Icon name="trash" size={16} /> Vyčistiť košík
								</button>
							</div>
						</details>
					{/if}

					{#if list.staples.length}
						<div class="staples sunk">
							<h3><Icon name="jar" size={18} /> Skontroluj doma</h3>
							<p class="hint">
								Korenie a oleje nerátame do nákupu. Ťukni na to, čo doma nemáš, a pridá sa do
								zoznamu.
							</p>
							<div class="chips">
								{#each list.staples as item (item.ingredient.id)}
									{#if item.ingredient.byproduct}
										<span class="chip byproduct" title="Nekupuje sa – zostane z inej suroviny">
											{item.ingredient.name}
										</span>
									{:else}
										<button
											class="chip"
											title="Nemám doma – pridať do nákupu"
											onclick={() => setOutOfStock(item.ingredient.id, true)}
										>
											<Icon name="plus" size={14} stroke={2.4} />
											{item.ingredient.name}
										</button>
									{/if}
								{/each}
							</div>
						</div>
					{/if}

					<div class="total">
						<span>Zaplatíš {payHasEstimates ? 'asi' : ''}</span>
						<strong>{formatEur(payTotal)}</strong>
					</div>
					{#if payHasEstimates}
						<p class="hint">* Cena odhadom – v obchodoch, ktoré poznáme, ju zatiaľ nemáme.</p>
					{/if}
					{#if budget}
						<div class="budget sunk" class:over={budget.left < 0}>
							<div class="budget-row">
								<span>Rozpočet na týždeň</span><strong>{formatEur(budget.budget)}</strong>
							</div>
							<div class="budget-bar" aria-hidden="true">
								<span
									class="spent"
									style:width="{Math.min(100, (budget.spent / budget.budget) * 100)}%"
								></span>
								<span
									class="tobuy"
									style:width="{Math.max(
										0,
										Math.min(
											100 - (budget.spent / budget.budget) * 100,
											(budget.toBuy / budget.budget) * 100
										)
									)}%"
								></span>
							</div>
							<p class="small">
								Minuté od pondelka <strong>{formatEur(budget.spent)}</strong> · ešte kúpiť
								<strong>{formatEur(budget.toBuy)}</strong> ·
								{#if budget.left >= 0}
									ostáva <strong>{formatEur(budget.left)}</strong>
								{:else}
									<strong>nad rozpočtom o {formatEur(-budget.left)}</strong> – skús
									<button class="btn-link" onclick={startWithPlanner}>lacnejší návrh</button>
								{/if}
							</p>
						</div>
					{/if}
					<p class="hint">
						Za celé balenia{comparison.recommended
							? ` v ${comparison.recommended.storeIds.length > 1 ? 'obchodoch' : 'obchode'} ${storeNames(comparison.recommended)}`
							: ''}. Na tieto recepty z nich spotrebuješ za {formatEur(list.total)}, zvyšok ti
						ostane.
					</p>

					<div class="together sunk">
						<p>
							<strong>Nakupujete dvaja?</strong> Pošli spoločný zoznam. Čo jeden odškrtne, druhý
							hneď vidí – aj keď ste každý v inej uličke.{#if planFromHousehold()}
								Domácnosť tento zoznam vidí aj tak; toto je pre niekoho mimo nej.{/if}
						</p>
						{#if together.url}
							<p class="small">
								Pošli tento odkaz tomu, s kým nakupuješ: <a href={together.url}>spoločný zoznam</a>.
								Čo odškrtne, uvidíš aj tu a pôjde do špajze s tvojím „Nakúpené“.
							</p>
							<button class="btn ghost small" onclick={endTogether}>Ukončiť spoločný nákup</button>
						{:else}
							<button
								class="btn ghost small"
								onclick={shopTogether}
								disabled={together.status === 'creating'}
							>
								<Icon name="users" size={16} />
								{together.status === 'creating'
									? 'Vytváram…'
									: together.status === 'failed'
										? 'Nepodarilo sa, skús znova'
										: 'Nakupovať spolu'}
							</button>
						{/if}
					</div>

					{#if comparison.recommended}
						{@const rec = comparison.recommended}
						{@const single = comparison.single!}
						{@const extra = comparison.unpricedCost}
						<div class="stores">
							<h3><Icon name="store" size={18} /> Kde nakúpiť</h3>
							<StorePicker label="Moje obchody" quiet />
							<p class="rec">
								{#if rec.storeIds.length > 1}
									Najlacnejšie vyjde nakúpiť v <strong>{storeNames(rec)}</strong> – ušetríš
									{formatEur(single.total - rec.total)} oproti nákupu len v {storeNames(single)}.
								{:else}
									Najlacnejšie je všetko kúpiť v <strong>{storeNames(rec)}</strong>.
									{#if comparison.pair && comparison.pair !== rec}
										Druhý obchod by ušetril len {formatEur(single.total - comparison.pair.total)},
										nevyplatí sa.
									{/if}
								{/if}
								{#if rec.missing}
									{things(rec.missing)} tam nemajú, kúp {rec.missing === 1 ? 'ju' : 'ich'} inde.
								{/if}
							</p>
							<ul class="store-list">
								{#each completeShops.slice(0, 4) as plan (plan.storeIds[0])}
									<li class:best={plan === rec}>
										<span class="swatch" style:--c={catalog.storesById.get(plan.storeIds[0])?.color}
										></span>
										<span>Všetko v {storeNames(plan)}</span>
										<strong>{formatEur(plan.total + extra)}</strong>
									</li>
								{/each}
								{#if comparison.pair && comparison.pair.missing <= single.missing}
									{@const [a, b] = comparison.pair.storeIds.map(
										(id) => catalog.storesById.get(id)?.color ?? 'var(--leaf)'
									)}
									<li class:best={comparison.pair === rec}>
										<span
											class="swatch"
											style:--c="linear-gradient(135deg, {a} 50%, {b ?? a} 50%)"
											aria-hidden="true"
										></span>
										<span>{storeNames(comparison.pair)}</span>
										<strong>{formatEur(comparison.pair.total + extra)}</strong>
									</li>
								{/if}
							</ul>
							{#if incompleteShops.length}
								<p class="hint">
									{incompleteShops.map((s) => storeName(s.storeIds[0])).join(', ')}
									{incompleteShops.length === 1 ? 'nemá' : 'nemajú'} všetko z nákupu, samé by nestačili.
								</p>
							{/if}
							{#if comparison.unpriced}
								<p class="hint">
									{things(comparison.unpriced)} z nákupu zatiaľ
									{comparison.unpriced > 1 && comparison.unpriced < 5 ? 'nemajú' : 'nemá'} cenu zo žiadneho
									obchodu, rátame {comparison.unpriced === 1 ? 'ju' : 'ich'} odhadom.
								</p>
							{/if}
						</div>
					{:else if settings.current.myStores.length}
						<div class="stores">
							<StorePicker label="Moje obchody" />
							<p class="hint">V týchto obchodoch nemáme ceny ničoho z nákupu.</p>
						</div>
					{:else}
						<p class="hint">
							Ceny sú zatiaľ odhady. Keď pribudnú reálne ceny z obchodov, tu uvidíš, kde je nákup
							najlacnejší.
						</p>
					{/if}
				{/if}
			</section>
			{#if allItems.length && install.offer}
				<!-- The moment it pays off: in the shop, with no signal. -->
				<InstallCard
					title="Nákupný zoznam aj bez signálu"
					why="zoznam sa v obchode otvorí aj bez internetu"
				/>
			{/if}
		</div>
	</div>
</div>

<!-- `today` is the diary meal for today's slots, so they can be ticked off as eaten. -->
{#snippet slot(meal: ScheduledMeal | null | false, today: DiaryMeal | null, label?: string)}
	{#if meal}
		<span class="meal" class:cook={meal.kind === 'cook'} class:old={meal.freeze || meal.spoils}>
			{#if meal.kind === 'cook'}
				{@const r = catalog.recipesById.get(meal.entry.recipeId)}
				{#if r}
					<span class="day-plate" aria-hidden="true"
						><PlateArt
							seed={r.id}
							lines={r.lines}
							byId={catalog.ingredientsById}
							vessel={vesselFor(r.categories)}
							animate={false}
						/></span
					>
				{/if}
			{:else}
				<span class="leftover-ico" aria-hidden="true"><Icon name="jar" size={16} /></span>
			{/if}
			<span class="meal-text">
				<span class="meal-kind"
					>{label ? `${label} · ` : ''}{meal.entry.fromFreezer
						? meal.kind === 'cook'
							? 'Z mrazničky'
							: 'Zvyšky z mrazničky'
						: meal.kind === 'cook'
							? 'Uvariť'
							: 'Zvyšky'}</span
				>
				<a href="/recepty/{meal.entry.recipeId}">{titleOf(meal.entry.recipeId)}</a>
				{#if meal.kind === 'cook' && cookName(meal.entry.cook)}<small
						>varí {cookName(meal.entry.cook)}</small
					>{/if}
				{#if meal.freeze}<small>tieto porcie hneď zamraz</small>
				{:else if meal.spoils}<small>nevydrží – uvar menej alebo neskôr</small>{/if}
			</span>
			{#if today && ui.loaded && journal.current.enabled}
				{@const done = portionLogged(meal.entry.recipeId, today)}
				<button
					class="chip eaten"
					class:done
					disabled={done}
					onclick={() => logPortion(meal.entry.recipeId, meal.entry.variant, today)}
					aria-label={done
						? `${titleOf(meal.entry.recipeId)} je v denníku`
						: `Zjedené: zapísať ${titleOf(meal.entry.recipeId)} do denníka`}
				>
					<Icon name={done ? 'check' : 'plus'} size={14} />
					{done ? 'V denníku' : 'Zjedené'}
				</button>
			{/if}
		</span>
	{:else if meal === false}
		<span class="meal empty-slot">{label ? `${label}: ` : ''}nikto nie je doma</span>
	{:else}
		<span class="meal empty-slot">{label ? `${label}: ` : ''}nič naplánované</span>
	{/if}
{/snippet}

{#snippet extrasBlock()}
	<div class="cat extra">
		<h3 class="eyebrow">Vlastné položky</h3>
		{#if !extraItems.current.length}
			<p class="hint">Čo kúpiš popri receptoch – drogériu, kávu, pečivo na raňajky.</p>
		{/if}
		{#if extraItems.current.length}
			<ul>
				{#each extraItems.current.filter((x) => !x.checked) as x (x.id)}
					{@render extraRow(x)}
				{/each}
			</ul>
		{/if}
		<form
			class="extra-add"
			onsubmit={(e) => {
				e.preventDefault();
				addExtraItem(extraText);
				extraText = '';
			}}
		>
			<label class="field extra-field">
				<Icon name="plus" size={18} />
				<span class="sr-only">Pridať vlastnú položku</span>
				<input
					id="extra-text"
					bind:value={extraText}
					maxlength="80"
					placeholder="Napíš, čo ešte kúpiť…"
				/>
			</label>
			<button class="btn small leaf" disabled={!extraText.trim()}>Pridať</button>
		</form>
	</div>
{/snippet}

<!-- Ran out in the pantry, or added by hand, with no recipes to shop for: still a list. -->
{#snippet extrasOnly()}
	{@render extrasBlock()}
	{#if extraItems.current.some((x) => x.checked)}
		<details class="cat in-cart" open>
			<summary
				><h3 class="eyebrow">
					V košíku ({extraItems.current.filter((x) => x.checked).length})
				</h3></summary
			>
			<ul>
				{#each extraItems.current.filter((x) => x.checked) as x (x.id)}
					{@render extraRow(x)}
				{/each}
			</ul>
			<div class="cart-actions">
				<button class="btn ghost small" onclick={clearChecked}>
					<Icon name="trash" size={16} /> Vyčistiť košík
				</button>
			</div>
		</details>
	{/if}
{/snippet}

{#snippet itemRow(item: ShoppingItem)}
	{@const checked = !!checkedItems.current[item.ingredient.id]}
	{@const itemPay = pay.get(item.ingredient.id)}
	<ShoppingRow
		name={item.ingredient.name}
		{checked}
		ontoggle={() => toggleChecked(item.ingredient.id)}
	>
		{#snippet note()}
			{formatGrams(item.buyGrams)}{pieces(item)}
			{#if item.buyGrams < item.needGrams - 0.5}· zvyšok máš doma{/if}
			{#if item.restock}· stačí najmenšie balenie{/if}
			{#if itemPay?.shelf}
				<span title={itemPay.shelf.product}
					>· {Number.isInteger(itemPay.shelf.packs)
						? `${itemPay.shelf.packs}× balenie`
						: 'na váhu'}{groupBy === 'aisle' ? `, ${storeName(itemPay.shelf.storeId)}` : ''}</span
				>
				{@const sale = saleUntil.get(`${item.ingredient.id}|${itemPay.shelf.storeId}`)}
				{#if sale}<span class="badge tomato">akcia do {dateShort(sale.slice(0, 10))}</span>{/if}
			{/if}
		{/snippet}
		{#snippet end()}
			<span class="price"
				>{formatEur(itemPay?.cost ?? item.cost)}{#if !itemPay?.shelf}<span
						class="est"
						title="Cena odhadom">*</span
					>{/if}</span
			>
		{/snippet}
		{#snippet after()}
			{@render claim(item.ingredient.id, item.ingredient.name, checked)}
			{#if item.restock}
				<button
					class="icon-btn plain"
					title="Predsa to mám doma"
					aria-label="Predsa mám doma: {item.ingredient.name}"
					onclick={() => setOutOfStock(item.ingredient.id, false)}
				>
					<Icon name="x" size={16} />
				</button>
			{/if}
		{/snippet}
	</ShoppingRow>
{/snippet}

<!-- In a household: who'll buy this, so two people don't bring the same thing. -->
{#snippet claim(id: string, name: string, checked: boolean)}
	{@const by = itemClaims.get(id)}
	{#if !checked && household.me && planFromHousehold()}
		<button
			class="chip claim"
			aria-pressed={by?.id === household.me}
			aria-label={by?.id === household.me
				? `Nekúpim: ${name}`
				: by
					? `Kúpim ja namiesto ${by.name}: ${name}`
					: `Kúpim ja: ${name}`}
			onclick={() => claimItem(id, by?.id !== household.me)}
		>
			{by ? (by.id === household.me ? 'beriem ja' : `berie ${by.name}`) : 'beriem'}
		</button>
	{:else if !checked && by}
		<span class="badge">berie {by.name}</span>
	{/if}
{/snippet}

{#snippet extraRow(x: ExtraItem)}
	<ShoppingRow name={x.text} checked={x.checked} ontoggle={() => toggleExtra(x.id)}>
		{#snippet after()}
			{@render claim(x.id, x.text, x.checked)}
			<button
				class="icon-btn plain"
				aria-label="Odstrániť: {x.text}"
				onclick={() => removeExtra(x)}
			>
				<Icon name="x" size={16} />
			</button>
		{/snippet}
	</ShoppingRow>
{/snippet}

<dialog
	class="sheet picker-sheet"
	bind:this={pickerDialog}
	onclick={(e) => e.target === pickerDialog && closePicker()}
	aria-labelledby="picker-title"
>
	<div class="sheet-inner">
		<header class="sheet-head">
			<h2 class="section-title" id="picker-title"><Icon name="plus" size={22} /> Pridať recept</h2>
			<button class="icon-btn" onclick={closePicker} aria-label="Zavrieť">
				<Icon name="x" size={20} />
			</button>
		</header>
		<RecipePicker />
	</div>
</dialog>

<style>
	.page {
		/* The sticky jump bar's height, for what scrolls or sticks below it. */
		--jump-h: 52px;
	}
	.household-note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		font-weight: 600;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 20px;
	}
	.column {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 20px;
		align-content: start;
	}
	.jump-bar {
		position: sticky;
		top: var(--header-h);
		z-index: 6;
		display: flex;
		gap: var(--sp-1);
		margin: 0 calc(-1 * var(--gutter)) var(--sp-3);
		padding: 6px var(--gutter);
		background: color-mix(in srgb, var(--paper) 90%, transparent);
		backdrop-filter: blur(10px);
	}
	.jump-bar a {
		flex: 1;
		display: inline-flex;
		justify-content: center;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 4px 8px;
		border-radius: 999px;
		color: var(--ink-2);
		font-weight: 650;
		font-size: var(--fs-sm);
		text-decoration: none;
		transition:
			background 0.2s,
			color 0.2s;
	}
	.jump-bar a.active {
		background: var(--ink);
		color: var(--paper);
	}
	.jump-bar .n {
		min-width: 20px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--alert-bg);
		color: var(--alert-ink);
		font-size: var(--fs-xs);
		text-align: center;
	}
	#recepty-v-plane,
	#rozpis,
	#nakup {
		scroll-margin-top: calc(var(--header-h) + var(--jump-h) + var(--sp-3));
	}
	.box-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}
	.box-head .section-title {
		margin: 0;
	}
	.head-actions {
		display: flex;
		gap: var(--sp-2);
	}

	/* ── The plan's recipes ── */
	.entries {
		margin-top: var(--sp-3);
	}
	.entries li {
		display: grid;
		grid-template-columns: 52px minmax(0, 1fr) auto;
		grid-template-areas:
			'plate info stepper'
			'plate actions actions';
		align-items: center;
		column-gap: var(--sp-3);
		row-gap: var(--sp-2);
		padding: var(--sp-3) 0;
		animation: rise 0.35s var(--ease-out);
	}
	.mini {
		grid-area: plate;
		align-self: start;
		width: 52px;
	}
	.info {
		grid-area: info;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.info a {
		color: var(--ink);
		font-weight: 650;
		line-height: 1.3;
		text-decoration: none;
	}
	.info a:hover {
		text-decoration: underline;
	}
	.info > .muted {
		font-size: var(--fs-sm);
	}
	.stepper {
		grid-area: stepper;
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.stepper > span {
		min-width: 1.6em;
		text-align: center;
	}
	.entry-actions {
		grid-area: actions;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	@media (pointer: coarse) {
		.entry-actions .chip {
			min-height: var(--tap);
		}
	}
	/* A phone has no room for the stepper beside the title: it gets a row of its own. */
	@media (max-width: 479px) {
		.entries li {
			grid-template-columns: 44px minmax(0, 1fr);
			grid-template-areas:
				'plate info'
				'plate stepper'
				'actions actions';
		}
		.mini {
			width: 44px;
		}
		.stepper {
			justify-self: start;
		}
	}
	.cook-pick {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		max-width: 100%;
		margin-top: 6px;
		font-size: var(--fs-sm);
	}
	.cook-pick select {
		min-width: 0;
		max-width: 100%;
	}
	.prep-link {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) 14px;
		color: var(--ink);
		text-decoration: none;
	}
	.prep-link span {
		display: flex;
		flex-direction: column;
	}
	.prep-link small {
		color: var(--muted);
		font-size: var(--fs-sm);
	}
	.freezer {
		margin-top: 14px;
		padding-top: var(--sp-3);
		border-top: 1px solid var(--line);
	}
	.freezer h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 6px;
		font-size: var(--fs-md);
	}
	.freezer li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-1) var(--sp-3);
		padding: var(--sp-2) 0;
	}
	.frozen-name {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.frozen-name a {
		color: var(--ink);
		font-weight: 650;
		text-decoration: none;
	}
	.frozen-name a:hover {
		text-decoration: underline;
	}
	.frozen-name small {
		font-size: var(--fs-sm);
	}
	.summary {
		margin: 14px 0 0;
		font-size: var(--fs-md);
		color: var(--ink-2);
	}

	/* ── The week, day by day ── */
	.use-up {
		margin: 0 0 var(--sp-3);
	}
	.use-up p {
		margin: 0 0 var(--sp-2);
	}
	.use-up .chip {
		white-space: normal;
	}
	.days {
		margin: var(--sp-2) 0 var(--sp-3);
	}
	.days li {
		display: grid;
		grid-template-columns: 5.5em minmax(0, 1fr);
		gap: 10px;
		align-items: center;
		padding: var(--sp-2) 0;
	}
	.days li.today {
		background: color-mix(in srgb, var(--leaf-2) 8%, transparent);
		border-radius: var(--radius-sm);
		padding-inline: var(--sp-2);
		margin-inline: calc(-1 * var(--sp-2));
	}
	/* The line under today's highlight would cut its rounded corners. */
	.days li.today + li {
		border-top-color: transparent;
	}
	.day {
		font-weight: 700;
		font-size: var(--fs-sm);
		text-transform: capitalize;
	}
	.meals {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}
	.meal {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: var(--fs-md);
		color: var(--ink-2);
	}
	.meal.cook {
		color: var(--ink);
		font-weight: 650;
	}
	.meal.old small {
		color: var(--tomato);
		font-weight: 650;
	}
	.meal.empty-slot {
		color: var(--muted);
		font-style: italic;
	}
	.day-plate {
		flex: none;
		display: block;
		width: 34px;
		height: 34px;
	}
	.leftover-ico {
		flex: none;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--paper-2);
		color: var(--muted);
	}
	.meal-text {
		display: grid;
		min-width: 0;
		line-height: 1.25;
	}
	.meal-text small {
		font-size: var(--fs-sm);
	}
	.meal-kind {
		font-size: var(--fs-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.meal-text a {
		color: inherit;
		text-decoration: none;
	}
	.meal-text a:hover {
		text-decoration: underline;
	}
	.eaten {
		margin-left: auto;
	}
	.eaten.done {
		border-color: transparent;
		background: var(--leaf-soft);
		color: var(--leaf);
		opacity: 1;
	}
	.coverage {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-1);
		margin: 0;
		color: var(--ink-2);
	}
	.coverage :global(svg) {
		color: var(--leaf);
	}
	.personal {
		display: flex;
		gap: 6px;
		align-items: flex-start;
	}

	/* ── Empty plan: three ways to start ── */
	.start {
		display: grid;
		gap: 10px;
	}
	.start .section-title,
	.start p {
		margin: 0;
	}
	.start-grid {
		display: grid;
		gap: 10px;
		margin-top: 6px;
	}
	.start-opt {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto;
		column-gap: var(--sp-3);
		align-items: center;
		padding: 14px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition:
			transform 0.25s var(--ease-spring),
			border-color 0.2s;
	}
	.start-opt:hover {
		transform: translateY(-2px);
		border-color: var(--leaf-2);
	}
	.start-opt small {
		grid-column: 2;
		color: var(--muted);
		font-size: var(--fs-sm);
	}
	.start-ico {
		grid-row: span 2;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--tone) 18%, transparent);
		color: color-mix(in srgb, var(--tone) 70%, var(--ink));
	}
	/* Three across only while the plan has the page's full width; beside the shopping list a
	   column is too narrow and the titles break word by word. */
	@media (min-width: 720px) and (max-width: 959px) {
		.start-grid {
			grid-template-columns: repeat(3, 1fr);
		}
		.start-opt {
			grid-template-columns: 1fr;
			row-gap: 6px;
			align-content: start;
		}
		.start-opt small {
			grid-column: 1;
		}
		.start-ico {
			grid-row: auto;
		}
	}
	.cooked-msg a {
		margin-right: var(--sp-2);
	}
	.cooked-msg .btn-link {
		margin-right: var(--sp-2);
	}

	/* ── The shopping list ── */
	.progress-row {
		position: sticky;
		top: calc(var(--header-h) + var(--jump-h));
		z-index: 2;
		display: grid;
		gap: 6px;
		margin: var(--sp-2) 0 var(--sp-3);
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		background: var(--sunk);
		/* Keeps the list scrolling under it out of the gap above. */
		box-shadow: 0 -8px 0 4px var(--card);
	}
	.progress-row p {
		margin: 0;
		font-size: var(--fs-md);
	}
	.progress {
		height: 8px;
		border-radius: 999px;
		background: var(--card);
		overflow: hidden;
	}
	.progress span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--leaf-2);
		transition: width 0.4s var(--ease-out);
	}
	.shop-tools {
		display: grid;
		justify-items: start;
		gap: var(--sp-2);
	}
	.learned {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin: 0;
	}
	.learned :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.cat {
		margin-top: var(--sp-4);
	}
	.cat h3 {
		margin: 0;
		font-family: var(--font-body);
	}
	.cat ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.price {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		font-size: var(--fs-md);
		white-space: nowrap;
	}
	.est {
		color: var(--muted);
	}
	.claim {
		flex: none;
	}
	.extra-add {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
	}
	.extra-field {
		flex: 1;
		min-width: 0;
	}
	.in-cart summary {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: var(--tap);
		cursor: pointer;
		list-style: none;
	}
	.in-cart summary::-webkit-details-marker {
		display: none;
	}
	/* A chevron that turns, the same as other disclosures. */
	.in-cart summary::after {
		content: '';
		width: 7px;
		height: 7px;
		margin-top: -3px;
		border-right: 2px solid var(--muted);
		border-bottom: 2px solid var(--muted);
		transform: rotate(45deg);
		transition: transform 0.2s var(--ease-out);
	}
	.in-cart:not([open]) summary::after {
		margin-top: 0;
		transform: rotate(-45deg);
	}
	.cart-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}
	.staples {
		margin-top: 18px;
		padding: 14px;
	}
	.staples h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-size: var(--fs-base);
	}
	.staples .hint {
		margin: var(--sp-1) 0 10px;
	}
	.byproduct {
		border-style: dashed;
		color: var(--muted);
	}
	.total {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-top: var(--sp-4);
		padding-top: 14px;
		border-top: 2px solid var(--ink);
		font-weight: 700;
	}
	.total strong {
		font-family: var(--font-display);
		font-size: 1.6rem;
	}
	.budget {
		margin: var(--sp-3) 0;
		padding: var(--sp-3) 14px;
	}
	.budget.over {
		background: var(--tomato-soft);
	}
	.budget-row {
		display: flex;
		justify-content: space-between;
		font-weight: 600;
	}
	.budget-bar {
		display: flex;
		height: 8px;
		margin: var(--sp-2) 0;
		border-radius: 999px;
		overflow: hidden;
		background: var(--card);
	}
	.budget-bar .spent {
		background: var(--leaf);
	}
	.budget-bar .tobuy {
		background: color-mix(in srgb, var(--leaf) 40%, var(--card));
	}
	.budget p {
		margin: 0;
	}
	.together {
		display: grid;
		gap: var(--sp-2);
		justify-items: start;
		margin-top: var(--sp-4);
		padding: 14px;
	}
	.together p {
		margin: 0;
		font-size: var(--fs-md);
	}
	.stores {
		margin-top: 18px;
	}
	.stores h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-base);
	}
	.rec {
		margin: var(--sp-3) 0 10px;
		font-size: var(--fs-md);
	}
	.store-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.store-list li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 10px;
		align-items: center;
		padding: 6px 10px;
		border-radius: var(--radius-xs);
	}
	.store-list li.best {
		background: var(--leaf-soft);
	}
	.store-list strong {
		font-variant-numeric: tabular-nums;
	}

	/* ── The "add a recipe" sheet ── */
	.sheet {
		width: min(640px, 100%);
		max-width: 100%;
		max-height: min(88dvh, 900px);
		margin: auto auto 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius) var(--radius) 0 0;
		background: var(--card);
		color: var(--ink);
		box-shadow: var(--shadow-lift);
	}
	.sheet[open] {
		animation: sheet-up 0.35s var(--ease-out);
	}
	.sheet::backdrop {
		background: var(--backdrop);
		backdrop-filter: blur(2px);
	}
	@keyframes sheet-up {
		from {
			transform: translateY(40%);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sheet[open] {
			animation: none;
		}
	}
	@media (min-width: 700px) {
		.sheet {
			margin: auto;
			border-radius: var(--radius);
		}
	}
	.sheet-inner {
		display: grid;
		gap: var(--sp-3);
		padding: 0 20px 22px;
		max-height: inherit;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.sheet-head {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 0 10px;
		background: var(--card);
	}
	.sheet-head .section-title {
		margin: 0;
	}

	@media (min-width: 960px) {
		.page {
			--jump-h: 0px;
		}
		.jump-bar {
			display: none;
		}
		.layout {
			grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
			align-items: start;
		}
	}
</style>

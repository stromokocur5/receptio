<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import { isAway, type Member, type PlanMeal } from '$lib/household';
	import {
		claims,
		eatersAt,
		household,
		isPersonal,
		members,
		planNeed
	} from '$lib/household.svelte';
	import { localToday } from '$lib/journal';
	import { MEAL_LABELS } from '$lib/labels';
	import { mealSchedule, type ScheduledMeal } from '$lib/schedule';
	import { isBreakfastEntry } from '$lib/shopping';
	import { mainMeals, plan, settings } from '$lib/state.svelte';

	/** Today at a glance: what's eaten at home, who cooks, who's away, what's yours to buy. */
	const catalog = useCatalog();
	const today = localToday();

	const list = $derived(members());
	const nameOf = (id: string | undefined) => list.find((m) => m.id === id)?.name;
	const away = $derived(list.filter((m) => isAway(m, today)));
	const toBuy = $derived([...claims().values()].filter((m) => m.id === household.me).length);

	const day = $derived.by(() => {
		const s = settings.current;
		const schedule = mealSchedule(
			plan.current.filter((e) => !isPersonal(e)),
			s.people,
			mainMeals(s).length,
			1,
			{
				keeps: (id) => catalog.recipesById.get(id)?.keeps,
				need: planNeed(s),
				breakfasts: s.breakfasts,
				isBreakfast: (e) => isBreakfastEntry(e, catalog.recipesById.get(e.recipeId))
			}
		).days[0];
		const meals: { meal: PlanMeal; slot: ScheduledMeal | null | false }[] = [];
		if (schedule?.breakfast !== undefined)
			meals.push({ meal: 'ranajky', slot: schedule.breakfast });
		mainMeals(s).forEach((meal, i) => meals.push({ meal, slot: schedule?.meals[i] ?? null }));
		return meals;
	});

	const names = (people: Member[]) => people.map((m) => m.name).join(', ');
</script>

<ul class="today">
	{#each day as { meal, slot } (meal)}
		{@const eaters = eatersAt(0, meal)}
		{@const recipe = slot ? catalog.recipesById.get(slot.entry.recipeId) : undefined}
		<li>
			<span class="meal">{MEAL_LABELS[meal]}</span>
			<span class="what">
				{#if slot === false || !eaters.length}
					<span class="muted">nikto nie je doma</span>
				{:else if recipe && slot}
					<a href="/recepty/{recipe.id}">{recipe.title}</a>
					<span class="muted small">
						{#if slot.kind === 'leftover'}
							zvyšky
						{:else if nameOf(slot.entry.cook)}
							varí {nameOf(slot.entry.cook)}
						{:else}
							treba uvariť
						{/if}
						· {names(eaters)}
					</span>
				{:else}
					<a href="/plan" class="muted">ešte nič – naplánovať</a>
				{/if}
			</span>
		</li>
	{/each}
</ul>
<p class="foot small">
	{#if away.length}
		<span><Icon name="sun" size={16} /> Preč: {names(away)}.</span>
	{/if}
	{#if toBuy}
		<a href="/plan#nakup"
			><Icon name="basket" size={16} /> Kupuješ {toBuy}
			{toBuy === 1 ? 'vec' : toBuy < 5 ? 'veci' : 'vecí'}</a
		>
	{/if}
</p>

<style>
	.today {
		display: grid;
		gap: 8px;
		padding: 0;
		margin: 0;
		list-style: none;
	}
	.today li {
		display: grid;
		grid-template-columns: 6.5em minmax(0, 1fr);
		gap: 10px;
		align-items: baseline;
	}
	.meal {
		font-weight: 650;
	}
	.what {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		align-items: baseline;
		min-width: 0;
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px var(--sp-4);
		margin: 10px 0 0;
	}
	.foot:empty {
		display: none;
	}
	.foot > * {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
</style>

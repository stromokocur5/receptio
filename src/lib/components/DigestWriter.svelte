<script lang="ts">
	import { budgetForDays, spentThisWeek, weekStart } from '$lib/budget';
	import { useCatalog } from '$lib/catalog';
	import { morningDigest, weeklyDigest, type DigestStore, type DigestText } from '$lib/digest';
	import { isPersonal, planNeed } from '$lib/household.svelte';
	import { localToday, shiftDate } from '$lib/journal';
	import { MEAL_LABELS } from '$lib/labels';
	import { dailyTargets } from '$lib/nutrition';
	import { rankByLeftovers, useSoon } from '$lib/pantry';
	import { avoidFilter } from '$lib/avoid';
	import { activeSales } from '$lib/pricing';
	import { rememberDigests } from '$lib/reminders';
	import { mealSchedule, type ScheduledMeal } from '$lib/schedule';
	import { isBreakfastEntry } from '$lib/shopping';
	import {
		avoid,
		digestReminder,
		history,
		journal,
		pantry,
		pantryAdded,
		plan,
		purchases,
		settings,
		mainMeals
	} from '$lib/state.svelte';
	import { plantsThisWeek, weeklyNutrition } from '$lib/stats';

	/**
	 * Keeps the texts of the weekly summary and the morning overviews up to date for the service
	 * worker, whenever the app is open. Renders nothing.
	 */
	const catalog = useCatalog();
	const PLANT_GOAL = 30;

	$effect(() => {
		const reminder = digestReminder.current;
		if (!reminder) return;
		const today = localToday();
		const titleOf = (id: string) => catalog.recipesById.get(id)?.title ?? id;

		// ── The week so far ──
		const monday = weekStart(today);
		const thisWeek = history.current.filter((h) => h.date >= monday && h.date <= today);
		const cost = thisWeek.reduce((sum, h) => {
			const r = catalog.recipesById.get(h.recipeId);
			return sum + (r ? r.costPerServing * h.servings : 0);
		}, 0);
		const targets = dailyTargets(settings.current.weightKg, journal.current.goals);
		const nutrition = weeklyNutrition(
			history.current,
			catalog.recipesById,
			settings.current.people,
			today,
			1
		)[0];
		const budget = settings.current.weeklyBudget;
		const week: DigestStore['week'] = {
			start: monday,
			text: weeklyDigest({
				cooked: thisWeek.length,
				cost,
				plants: plantsThisWeek(history.current, catalog.recipesById, catalog.ingredientsById, today)
					.score,
				plantGoal: PLANT_GOAL,
				proteinPerDay: nutrition.protein,
				proteinGoal: targets.protein,
				spent: budget === null ? null : spentThisWeek(purchases.current, today),
				budget: budget === null ? null : budgetForDays(budget, 7)
			})
		};

		// ── Each coming morning ──
		const schedule = mealSchedule(
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
		);
		const allowed = catalog.recipes.filter(avoidFilter(avoid.current, catalog.ingredientsById));
		/** What will need using up on the morning `d` days from now, and what to cook with it. */
		const soonOn = (d: number, plannedThatDay: string[]) => {
			const date = new Date();
			date.setDate(date.getDate() + d);
			const items = useSoon(
				pantry.current,
				pantryAdded.current,
				catalog.ingredientsById,
				date
			).slice(0, 3);
			if (!items.length) return { names: [], ids: [], cookIt: null };
			const ids = items.map((s) => s.ingredient.id);
			const groups = new Set(items.map((s) => s.ingredient.group));
			// A meal already planned that day that uses it is the best answer.
			const planned = plannedThatDay.find((id) =>
				catalog.recipesById
					.get(id)
					?.lines.some((l) => groups.has(catalog.ingredientsById.get(l.ingredientId)?.group ?? ''))
			);
			const best = planned ?? rankByLeftovers(allowed, ids, catalog.ingredientsById)[0]?.recipe.id;
			return {
				names: items.map((s) => s.ingredient.name.split(' (')[0].toLowerCase()),
				ids,
				cookIt: best ? titleOf(best) : null
			};
		};
		const planned = new Set(plan.current.map((e) => e.recipeId));
		const plannedIngredients = new Set(
			[...planned].flatMap(
				(id) => catalog.recipesById.get(id)?.lines.map((l) => l.ingredientId) ?? []
			)
		);
		const mine = settings.current.myStores;
		const sales = activeSales(catalog.prices, new Date()).filter(
			(d) =>
				plannedIngredients.has(d.entry.ingredientId) &&
				(!mine.length || mine.includes(d.entry.storeId))
		);
		const days: Record<string, DigestText> = {};
		schedule.days.forEach((day, d) => {
			const date = shiftDate(today, d);
			const slots = [
				...(day.breakfast ? [{ label: 'Raňajky', meal: day.breakfast }] : []),
				...day.meals.flatMap((meal, m) =>
					meal ? [{ label: MEAL_LABELS[mainMeals(settings.current)[m]], meal }] : []
				)
			];
			const meals = slots.map(
				({ label, meal }) =>
					`${label}: ${titleOf(meal.entry.recipeId)} (${
						meal.entry.inFridge
							? 'zvyšky'
							: meal.entry.fromFreezer
								? 'z mrazničky'
								: meal.kind === 'cook'
									? 'uvariť'
									: 'zvyšky'
					})`
			);
			const next = schedule.days[d + 1];
			const thaw = next
				? [next.breakfast, ...next.meals]
						.filter(
							(m): m is ScheduledMeal =>
								!!m && !!m.entry.fromFreezer && !m.entry.inFridge && m.kind === 'cook'
						)
						.map((m) => titleOf(m.entry.recipeId))
				: [];
			const soon =
				d < 3
					? soonOn(
							d,
							slots.map((s) => s.meal.entry.recipeId)
						)
					: { names: [], ids: [], cookIt: null };
			const text = morningDigest({
				meals,
				thaw,
				useSoon: soon.names,
				useSoonIds: soon.ids,
				cookIt: soon.cookIt,
				sales: sales
					.filter((s) => s.entry.saleUntil! >= date)
					.slice(0, 3)
					.map(
						(s) =>
							`${catalog.ingredientsById.get(s.entry.ingredientId)?.name.split(' (')[0].toLowerCase()} (${
								catalog.storesById.get(s.entry.storeId)?.name
							})`
					)
			});
			if (text) days[date] = text;
		});

		rememberDigests({ weekly: reminder.weekly, morning: reminder.morning, week, days });
	});
</script>

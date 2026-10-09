<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import { MAX_EATEN_DAYS } from '$lib/household';
	import { myMember, shareEaten } from '$lib/household.svelte';
	import { localToday, recentTotals } from '$lib/journal';
	import { journal } from '$lib/state.svelte';

	/** Keeps the own profile's "what I ate" up to date while it's shown to the household. */
	const catalog = useCatalog();

	$effect(() => {
		if (!myMember()?.eaten) return;
		const days = recentTotals(
			journal.current,
			localToday(),
			catalog.recipesById,
			catalog.ingredientsById,
			MAX_EATEN_DAYS
		).map(({ date, nutrients }) => ({
			date,
			kcal: Math.round(nutrients.kcal),
			protein: Math.round(nutrients.protein)
		}));
		shareEaten(days);
	});
</script>

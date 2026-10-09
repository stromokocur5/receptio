<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import { pluralRecipes } from '$lib/labels';
	import {
		MAX_SAVED_WEEKS,
		applySavedWeek,
		checkedItems,
		deleteSavedWeek,
		plan,
		saveWeek,
		savedWeeks,
		ui,
		type SavedWeek
	} from '$lib/state.svelte';
	import Icon from './Icon.svelte';
	import { toast } from '$lib/toast.svelte';

	const catalog = useCatalog();

	let name = $state('');
	let saving = $state(false);
	let applied = $state('');

	/** Recipes removed from the site since the week was saved are skipped. */
	const weeks = $derived(
		savedWeeks.current.map((week) => ({
			week,
			titles: week.entries.flatMap((e) => catalog.recipesById.get(e.recipeId)?.title ?? [])
		}))
	);
	const isFull = $derived(savedWeeks.current.length >= MAX_SAVED_WEEKS);
	const replaces = $derived(savedWeeks.current.some((w) => w.name === name.trim()));

	function save(event: SubmitEvent) {
		event.preventDefault();
		if (!name.trim()) return;
		saveWeek(name);
		name = '';
		saving = false;
	}

	/** Replaces the plan in progress at once; the message below can bring it back. */
	function apply(week: SavedWeek) {
		const before = { plan: plan.current, checked: checkedItems.current };
		applySavedWeek(week);
		applied = week.name;
		setTimeout(() => (applied = ''), 2000);
		if (before.plan.length)
			toast(`${week.name}: v pláne`, () => {
				plan.current = before.plan;
				checkedItems.current = before.checked;
			});
	}

	function remove(week: SavedWeek) {
		const before = savedWeeks.current;
		deleteSavedWeek(week.name);
		toast(`${week.name}: zmazané`, () => (savedWeeks.current = before));
	}
</script>

{#if ui.loaded && (weeks.length || plan.current.length)}
	<section class="card box weeks" id="tyzdne">
		<div class="box-head">
			<h2 class="section-title"><Icon name="star" size={24} /> Uložené týždne</h2>
			{#if plan.current.length && !saving}
				<button class="btn ghost small" onclick={() => (saving = true)}>
					<Icon name="plus" size={16} /> Uložiť tento týždeň
				</button>
			{/if}
		</div>
		{#if saving}
			<form class="save" onsubmit={save}>
				<label class="sr-only" for="week-name">Názov týždňa</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="input"
					id="week-name"
					bind:value={name}
					maxlength="40"
					placeholder="Napr. Lacný týždeň"
					autofocus
				/>
				<button class="btn leaf small" disabled={!name.trim()}>
					{replaces ? 'Prepísať' : 'Uložiť'}
				</button>
				<button type="button" class="btn ghost small" onclick={() => (saving = false)}
					>Zrušiť</button
				>
				{#if isFull && !replaces}
					<p class="hint note">
						Zmestí sa {MAX_SAVED_WEEKS} týždňov – uložením nového zmizne najstarší.
					</p>
				{/if}
			</form>
		{/if}
		{#if weeks.length}
			<ul>
				{#each weeks as { week, titles } (week.name)}
					<li class="sunk">
						<div class="info">
							<strong>{week.name}</strong>
							<small class="muted">
								{titles.length}
								{pluralRecipes(titles.length)}: {titles.slice(0, 4).join(', ')}{titles.length > 4
									? '…'
									: ''}
							</small>
						</div>
						<button class="btn leaf small" onclick={() => apply(week)}>
							{#if applied === week.name}
								<Icon name="check" size={16} /> V pláne
							{:else}
								Nasadiť
							{/if}
						</button>
						<button
							class="icon-btn plain"
							aria-label="Zmazať uložený týždeň {week.name}"
							onclick={() => remove(week)}
						>
							<Icon name="x" size={18} />
						</button>
					</li>
				{/each}
			</ul>
		{:else if !saving}
			<p class="hint">
				Väčšina z nás točí pár overených jedál. Ulož si týždeň, ktorý sa osvedčil, a nabudúce ho
				nasadíš jedným ťuknutím – aj s nákupným zoznamom.
			</p>
		{/if}
	</section>
{/if}

<style>
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
	.save {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		margin-bottom: var(--sp-3);
	}
	.save input {
		flex: 1 1 200px;
		min-width: 0;
	}
	.note {
		flex-basis: 100%;
		margin: 0;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 10px 6px 10px 14px;
	}
	.info {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.info small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--fs-sm);
	}
	.icon-btn {
		color: var(--muted);
	}
	.icon-btn:hover {
		color: var(--tomato);
	}
	.hint {
		margin: 0;
	}
</style>

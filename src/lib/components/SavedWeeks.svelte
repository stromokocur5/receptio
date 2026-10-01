<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import { pluralRecipes } from '$lib/labels';
	import {
		MAX_SAVED_WEEKS,
		applySavedWeek,
		deleteSavedWeek,
		plan,
		saveWeek,
		savedWeeks,
		ui,
		type SavedWeek
	} from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	const catalog = useCatalog();

	let name = $state('');
	let saving = $state(false);
	/** Putting a week back replaces a plan in progress, so that takes a second tap. */
	let confirming = $state('');
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

	function apply(week: SavedWeek) {
		if (plan.current.length && confirming !== week.name) {
			confirming = week.name;
			setTimeout(() => (confirming = ''), 3000);
			return;
		}
		applySavedWeek(week);
		confirming = '';
		applied = week.name;
		setTimeout(() => (applied = ''), 2500);
	}
</script>

{#if ui.loaded && (weeks.length || plan.current.length)}
	<section class="card box weeks" id="tyzdne">
		<div class="box-head">
			<h2><Icon name="star" size={24} /> Uložené týždne</h2>
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
					id="week-name"
					bind:value={name}
					maxlength="40"
					placeholder="Napr. Bežný týždeň, Lacný týždeň…"
					autofocus
				/>
				<button class="btn leaf small" disabled={!name.trim()}>
					{replaces ? 'Prepísať' : 'Uložiť'}
				</button>
				<button type="button" class="btn ghost small" onclick={() => (saving = false)}
					>Zrušiť</button
				>
				{#if isFull && !replaces}
					<p class="muted small note">
						Zmestí sa {MAX_SAVED_WEEKS} týždňov – uložením nového zmizne najstarší.
					</p>
				{/if}
			</form>
		{/if}
		{#if weeks.length}
			<ul>
				{#each weeks as { week, titles } (week.name)}
					<li>
						<div class="info">
							<strong>{week.name}</strong>
							<small class="muted">
								{titles.length}
								{pluralRecipes(titles.length)}: {titles.slice(0, 4).join(', ')}{titles.length > 4
									? '…'
									: ''}
							</small>
						</div>
						<button
							class="btn small"
							class:leaf={applied !== week.name}
							onclick={() => apply(week)}
						>
							{#if applied === week.name}
								<Icon name="check" size={16} /> V pláne
							{:else if confirming === week.name}
								Nahradiť plán?
							{:else}
								Nasadiť
							{/if}
						</button>
						<button
							class="remove"
							aria-label="Zmazať uložený týždeň {week.name}"
							onclick={() => deleteSavedWeek(week.name)}
						>
							<Icon name="x" size={16} />
						</button>
					</li>
				{/each}
			</ul>
		{:else if !saving}
			<p class="muted small">
				Väčšina z nás točí pár overených jedál. Ulož si týždeň, ktorý sa osvedčil, a nabudúce ho
				nasadíš jedným ťuknutím – aj s nákupným zoznamom.
			</p>
		{/if}
	</section>
{/if}

<style>
	.weeks {
		padding: 20px;
	}
	.box-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 12px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.4rem;
		margin: 0;
	}
	.save {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin-bottom: 12px;
	}
	.save input {
		flex: 1 1 200px;
		min-width: 0;
		border: 1.5px solid var(--line);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		padding: 8px 12px;
		font: inherit;
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
		gap: 8px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-radius: 14px;
		background: var(--paper-2);
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
	}
	.remove {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		flex: none;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--muted);
	}
	.remove:hover {
		color: var(--tomato);
	}
	p {
		margin: 0;
	}
</style>

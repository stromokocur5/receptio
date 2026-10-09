<script lang="ts">
	import { household, members } from '$lib/household.svelte';
	import { chosenMeals, MEAL_SETTINGS, settings, type Settings } from '$lib/state.svelte';

	/** In a household the plan cooks for everyone in it. */
	const fromHousehold = $derived(!!household.doc && members().length > 0);

	function update(patch: Partial<Settings>) {
		settings.current = { ...settings.current, ...patch };
	}
</script>

<div class="settings">
	<label>
		Plán na
		<select
			value={settings.current.planDays}
			onchange={(e) => update({ planDays: Number(e.currentTarget.value) })}
		>
			{#each [1, 2, 3, 4, 5, 6, 7, 10, 14] as d (d)}<option value={d}>{d}</option>{/each}
		</select>
		{settings.current.planDays === 1 ? 'deň' : settings.current.planDays < 5 ? 'dni' : 'dní'}
	</label>
	<label>
		Varím pre
		<select
			value={settings.current.people}
			disabled={fromHousehold}
			onchange={(e) => update({ people: Number(e.currentTarget.value) })}
		>
			{#each Array.from({ length: 12 }, (_, i) => i + 1) as p (p)}<option value={p}>{p}</option
				>{/each}
		</select>
		{settings.current.people === 1 ? 'osobu' : settings.current.people < 5 ? 'osoby' : 'osôb'}
		{#if fromHousehold}<a class="from-household" href="/domacnost">podľa domácnosti</a>{/if}
	</label>
	<fieldset class="meals">
		<legend>Varím</legend>
		{#each MEAL_SETTINGS as { key, label } (key)}
			{@const on = settings.current[key]}
			<label class="check">
				<input
					type="checkbox"
					checked={on}
					disabled={on && chosenMeals(settings.current) === 1}
					onchange={(e) => update({ [key]: e.currentTarget.checked })}
				/>
				{label}
			</label>
		{/each}
	</fieldset>
	<label>
		Rozpočet
		<input
			class="budget"
			type="number"
			min="1"
			max="1000"
			step="any"
			placeholder="–"
			value={settings.current.weeklyBudget ?? ''}
			onchange={(e) => {
				const v = Number(e.currentTarget.value);
				update({ weeklyBudget: e.currentTarget.value && v >= 1 && v <= 1000 ? v : null });
			}}
		/>
		€ / týždeň
	</label>
</div>

<style>
	.from-household {
		font-size: 0.86rem;
	}
	.settings {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-bottom: 8px;
		font-weight: 600;
		font-size: 0.92rem;
	}
	.meals {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		border: 0;
		padding: 0;
		margin: 0;
	}
	.meals legend {
		float: left;
		padding: 0;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.budget {
		width: 5em;
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--paper);
		color: var(--ink);
		padding: 4px 8px;
		margin: 0 4px;
		font: inherit;
	}
	select {
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--paper);
		color: var(--ink);
		padding: 4px 8px;
		margin: 0 4px;
		font: inherit;
	}
</style>

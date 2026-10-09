<script lang="ts">
	import { household, members } from '$lib/household.svelte';
	import { settings, type Settings } from '$lib/state.svelte';

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
	<label>
		Jedál denne
		<select
			value={settings.current.mealsPerDay}
			onchange={(e) => update({ mealsPerDay: e.currentTarget.value === '2' ? 2 : 1 })}
		>
			<option value={1}>1 (obed)</option>
			<option value={2}>2 (obed a večera)</option>
		</select>
	</label>
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
	<label class="check">
		<input
			type="checkbox"
			checked={settings.current.breakfasts}
			onchange={(e) => update({ breakfasts: e.currentTarget.checked })}
		/>
		Aj raňajky
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

<script lang="ts">
	import { settings, type Settings } from '$lib/state.svelte';

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
			onchange={(e) => update({ people: Number(e.currentTarget.value) })}
		>
			{#each [1, 2, 3, 4, 5, 6, 8] as p (p)}<option value={p}>{p}</option>{/each}
		</select>
		{settings.current.people === 1 ? 'osobu' : settings.current.people < 5 ? 'osoby' : 'osôb'}
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
</div>

<style>
	.settings {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-bottom: 8px;
		font-weight: 600;
		font-size: 0.92rem;
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

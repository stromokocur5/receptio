<script lang="ts">
	import { planFromHousehold } from '$lib/household.svelte';
	import { chosenMeals, MEAL_SETTINGS, settings, ui, type Settings } from '$lib/state.svelte';

	/** The plan page shows these twice (the week, the planner): ids must differ. */
	const uid = $props.id();
	/** In a household the plan cooks for everyone in it. */
	const fromHousehold = $derived(planFromHousehold());

	function update(patch: Partial<Settings>) {
		settings.current = { ...settings.current, ...patch };
	}
</script>

<!-- Saved settings only: the defaults would flash first otherwise. -->
{#if ui.loaded}
	<div class="settings">
		<label>
			Plán na
			<select
				class="input sm"
				value={settings.current.planDays}
				onchange={(e) => update({ planDays: Number(e.currentTarget.value) })}
			>
				{#each [1, 2, 3, 4, 5, 6, 7, 10, 14] as d (d)}<option value={d}>{d}</option>{/each}
			</select>
			{settings.current.planDays === 1 ? 'deň' : settings.current.planDays < 5 ? 'dni' : 'dní'}
		</label>
		{#if fromHousehold}
			<p class="household">
				Varím pre <a href="/domacnost">domácnosť</a> – porcie podľa toho, kto je pri ktorom jedle doma
				a koľko zje
			</p>
		{:else}
			<label>
				Varím pre
				<select
					class="input sm"
					value={settings.current.people}
					onchange={(e) => update({ people: Number(e.currentTarget.value) })}
				>
					{#each Array.from({ length: 12 }, (_, i) => i + 1) as p (p)}<option value={p}>{p}</option
						>{/each}
				</select>
				{settings.current.people === 1 ? 'osobu' : settings.current.people < 5 ? 'osoby' : 'osôb'}
			</label>
		{/if}
		<label>
			Rozpočet
			<input
				class="input sm budget"
				type="number"
				min="1"
				max="1000"
				step="any"
				inputmode="decimal"
				placeholder="–"
				value={settings.current.weeklyBudget ?? ''}
				onchange={(e) => {
					const v = Number(e.currentTarget.value);
					update({ weeklyBudget: e.currentTarget.value && v >= 1 && v <= 1000 ? v : null });
				}}
			/>
			€ / týždeň
		</label>
		<fieldset class="meals">
			<legend>Varím</legend>
			{#each MEAL_SETTINGS as { key, label } (key)}
				{@const on = settings.current[key]}
				{@const last = on && chosenMeals(settings.current) === 1}
				<label class="check" title={last ? 'Aspoň jedno jedlo ostane' : undefined}>
					<input
						type="checkbox"
						checked={on}
						aria-describedby={last ? `${uid}-last` : undefined}
						onchange={(e) => {
							// The last meal stays on; a greyed-out box looked broken rather than required.
							if (last) e.currentTarget.checked = true;
							else update({ [key]: e.currentTarget.checked });
						}}
					/>
					{label}
				</label>
			{/each}
			<span id="{uid}-last" class="sr-only">Aspoň jedno jedlo ostane zapnuté.</span>
		</fieldset>
	</div>
{/if}

<style>
	.settings {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2) var(--sp-5);
		margin-bottom: var(--sp-2);
		font-weight: 600;
		font-size: var(--fs-md);
	}
	.settings > label {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.household {
		margin: 0;
	}
	.budget {
		width: 5.5em;
	}
	.meals {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--sp-4);
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.meals legend {
		float: left;
		margin-right: var(--sp-4);
		padding: 0;
	}
	.check {
		align-items: center;
		padding: 0;
	}
	.check > input {
		margin: 0;
	}
</style>

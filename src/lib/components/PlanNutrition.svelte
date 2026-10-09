<script lang="ts">
	import { formatNumber } from '$lib/amounts';
	import Icon from '$lib/components/Icon.svelte';
	import NutrientBars from '$lib/components/NutrientBars.svelte';
	import { memberTargets, portionOf, type Member, type PlanMeal } from '$lib/household';
	import { ACTIVITY_PROTEIN, dailyTargets, emptyNutrients, scaleNutrients } from '$lib/nutrition';
	import type { planCheck } from '$lib/plancheck';
	import { journal, mainMeals, settings, type Settings } from '$lib/state.svelte';
	import type { Nutrients } from '$lib/types';

	/** The plan's nutrients per person and day, with a word on balance; part of the plan page. */
	let {
		entries,
		personDays,
		cooks,
		balance
	}: {
		/** The shared meals (not the ones a member cooks just for themselves). */
		entries: { servings: number; data: { perServing: Nutrients } }[];
		/** Days of one adult eating every planned meal. */
		personDays: number;
		/** The household at the table, for a line per member. */
		cooks: Member[];
		balance: ReturnType<typeof planCheck>;
	} = $props();

	const perDay = $derived.by(() => {
		const total = emptyNutrients();
		for (const e of entries) {
			const n = e.data.perServing;
			for (const key of Object.keys(total) as (keyof typeof total)[]) {
				total[key] += n[key] * e.servings;
			}
		}
		return scaleNutrients(total, 1 / Math.max(personDays, 1));
	});

	/** What each member gets from the plan a day, by their portion and the meals they eat at home. */
	const perMember = $derived.by(() => {
		const planned: PlanMeal[] = [
			...(settings.current.breakfasts ? (['ranajky'] as const) : []),
			...mainMeals(settings.current)
		];
		if (!planned.length) return [];
		return cooks.map((m) => {
			const share =
				(portionOf(m) * planned.filter((meal) => m.meals[meal]).length) / planned.length;
			return {
				member: m,
				kcal: perDay.kcal * share,
				protein: perDay.protein * share,
				goal: memberTargets(m.body)
			};
		});
	});

	const targets = $derived(dailyTargets(settings.current.weightKg, journal.current.goals));

	function updateSettings(patch: Partial<Settings>) {
		settings.current = { ...settings.current, ...patch };
	}
</script>

<section class="card box" id="ziviny">
	<h2><Icon name="bean" size={24} /> Živiny na deň</h2>
	<div class="settings">
		<label>
			Moja váha
			<input
				inputmode="numeric"
				placeholder="—"
				value={settings.current.weightKg ?? ''}
				onchange={(e) => {
					const w = Number(e.currentTarget.value);
					updateSettings({ weightKg: w >= 20 && w <= 250 ? w : null });
				}}
			/>
			kg
		</label>
	</div>
	<p class="muted small">
		Priemer na osobu a deň len z naplánovaných jedál (raňajky a snacky mimo plánu sa nepočítajú).
		{journal.current.goals.custom.protein
			? `Cieľ bielkovín: ${formatNumber(targets.protein, 0)} g (vlastný).`
			: settings.current.weightKg
				? `Cieľ bielkovín: ${formatNumber(targets.protein, 0)} g (${formatNumber(ACTIVITY_PROTEIN[journal.current.goals.activity], 1)} g/kg).`
				: ''}
	</p>
	<NutrientBars
		values={perDay}
		{targets}
		keys={['kcal', 'protein', 'fiber', 'iron', 'calcium', 'zinc', 'ala', 'salt']}
	/>
	{#if perMember.length > 1}
		<h3 class="per-member-title">Pre každého v domácnosti</h3>
		<ul class="per-member">
			{#each perMember as p (p.member.id)}
				<li>
					<strong>{p.member.name}</strong>
					<span>
						{formatNumber(p.kcal, 0)}{p.goal.kcal ? ` z ${formatNumber(p.goal.kcal, 0)}` : ''} kcal ·
						{formatNumber(p.protein, 0)}{p.goal.protein
							? ` z ${formatNumber(p.goal.protein, 0)}`
							: ''} g bielkovín
					</span>
				</li>
			{/each}
		</ul>
		<p class="muted small">
			Podľa porcie a jedál, ktoré je doma. Ciele z výšky, váhy a veku nastavíš v <a
				href="/domacnost">domácnosti</a
			>.
		</p>
	{/if}
	{#if balance.length}
		<ul class="balance">
			{#each balance as tip (tip.text)}
				<li class:tip={tip.level === 'tip'}>
					<Icon name={tip.level === 'ok' ? 'check' : 'info'} size={16} />
					<span>{tip.text}</span>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="b12">
		<Icon name="pill" size={18} /> B12 a vitamín D pokryje len suplement.
		<a href="/wiki/b12">Viac</a>
	</p>
</section>

<style>
	/* The plan page's cards: same padding and heading as its other sections. */
	.box {
		padding: 20px;
	}
	.box h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.4rem;
		margin: 0 0 12px;
	}
	#ziviny {
		scroll-margin-top: 120px;
	}
	.per-member-title {
		margin: 18px 0 6px;
		font-size: 1rem;
	}
	.per-member {
		display: grid;
		gap: 4px;
		padding: 0;
		margin: 0 0 6px;
		list-style: none;
	}
	.per-member li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 12px;
	}
	.settings {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-bottom: 8px;
		font-weight: 600;
		font-size: 0.92rem;
	}
	.settings input {
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--paper);
		padding: 4px 8px;
		margin: 0 4px;
		width: 4.5em;
	}
	.b12 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 16px 0 0;
		font-size: 0.88rem;
		color: var(--sky);
	}
	.balance {
		list-style: none;
		margin: 14px 0 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.balance li {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		font-size: 0.9rem;
		color: var(--ink-2);
	}
	.balance li :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--leaf);
	}
	.balance li.tip :global(svg) {
		color: var(--turmeric);
	}
	.small {
		font-size: 0.84rem;
	}
</style>

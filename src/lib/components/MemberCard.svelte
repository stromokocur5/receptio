<script lang="ts">
	import { formatNumber } from '$lib/amounts';
	import { BODY_GOAL_LABELS, memberTargets, portionOf, type Member } from '$lib/household';
	import { localToday, shiftDate } from '$lib/journal';

	let { member }: { member: Member } = $props();

	const targets = $derived(memberTargets(member.body));
	const body = $derived(
		[
			member.body.heightCm && `${member.body.heightCm} cm`,
			member.body.weightKg && `${member.body.weightKg} kg`,
			member.body.age && `${member.body.age} r.`
		].filter(Boolean)
	);
	const today = localToday();
	const dayName = (date: string) =>
		date === today
			? 'dnes'
			: date === shiftDate(today, -1)
				? 'včera'
				: new Intl.DateTimeFormat('sk', {
						weekday: 'short',
						day: 'numeric',
						month: 'numeric'
					}).format(new Date(`${date}T12:00`));
	const average = (key: 'kcal' | 'protein') => {
		const days = member.eaten?.filter((d) => d.date !== today) ?? [];
		return days.length ? days.reduce((sum, d) => sum + d[key], 0) / days.length : null;
	};
</script>

<dl class="card-facts">
	{#if body.length}
		<dt>Telo</dt>
		<dd>
			{body.join(' · ')}{member.body.goal !== 'udrzat'
				? ` · ${BODY_GOAL_LABELS[member.body.goal].toLowerCase()}`
				: ''}
		</dd>
	{/if}
	{#if targets.kcal || targets.protein}
		<dt>Denne asi</dt>
		<dd>
			{#if targets.kcal}{formatNumber(targets.kcal, 0)} kcal{/if}{#if targets.kcal && targets.protein}{' · '}{/if}{#if targets.protein}{formatNumber(
					targets.protein,
					0
				)} g bielkovín{/if}
		</dd>
	{/if}
	<dt>Porcia</dt>
	<dd>{formatNumber(portionOf(member), 2)}×</dd>
	{#if member.eaten}
		<dt>Zjedené</dt>
		<dd>
			{#if member.eaten.length}
				<ul class="eaten">
					{#each member.eaten as day (day.date)}
						<li>
							<span>{dayName(day.date)}</span>
							<span
								>{formatNumber(day.kcal, 0)} kcal · {formatNumber(day.protein, 0)} g bielkovín</span
							>
						</li>
					{/each}
				</ul>
				{#if average('kcal') !== null}
					<small class="muted"
						>Priemer bez dneška: {formatNumber(average('kcal')!, 0)} kcal · {formatNumber(
							average('protein')!,
							0
						)} g bielkovín{targets.kcal
							? ` (cieľ ${formatNumber(targets.kcal, 0)} kcal)`
							: ''}</small
					>
				{/if}
			{:else}
				<span class="muted">Zatiaľ nič zapísané v denníku.</span>
			{/if}
		</dd>
	{/if}
</dl>

<style>
	.card-facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 14px;
		margin: 0;
		font-size: 0.92rem;
	}
	dt {
		font-weight: 650;
		color: var(--muted);
	}
	dd {
		margin: 0;
		min-width: 0;
	}
	.eaten {
		list-style: none;
		margin: 0 0 4px;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	.eaten li {
		display: flex;
		flex-wrap: wrap;
		gap: 0 10px;
	}
	.eaten li span:first-child {
		min-width: 5.5em;
		color: var(--muted);
	}
</style>

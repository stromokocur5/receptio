<script lang="ts">
	import { MONTH_NAMES } from '$lib/season';

	let {
		indoor = [],
		sow,
		harvest,
		legend = false
	}: { indoor?: number[]; sow: number[]; harvest: number[]; legend?: boolean } = $props();

	const month = new Date().getMonth() + 1;

	function label(m: number): string {
		const parts = [
			indoor.includes(m) && 'predpestovanie',
			sow.includes(m) && 'výsev / výsadba',
			harvest.includes(m) && 'zber'
		].filter(Boolean);
		return `${MONTH_NAMES[m - 1]}: ${parts.length ? parts.join(', ') : 'nič'}`;
	}
</script>

<div class="grow-months">
	<ol aria-label="Kalendár pestovania">
		{#each MONTH_NAMES as name, i (i)}
			{@const m = i + 1}
			<li class:now={m === month} title={label(m)} aria-label={label(m)}>
				<span class="m">{name.slice(0, 1)}</span>
				<span class="bar indoor" class:on={indoor.includes(m)}></span>
				<span class="bar sow" class:on={sow.includes(m)}></span>
				<span class="bar harvest" class:on={harvest.includes(m)}></span>
			</li>
		{/each}
	</ol>
	{#if legend}
		<p class="legend">
			<span><i class="indoor"></i> predpestovanie doma</span>
			<span><i class="sow"></i> výsev / výsadba</span>
			<span><i class="harvest"></i> zber</span>
		</p>
	{/if}
</div>

<style>
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(12, 1fr);
		gap: 3px;
	}
	li {
		display: grid;
		gap: 2px;
		text-align: center;
		border-radius: 6px;
		padding: 2px 0 3px;
	}
	li.now {
		background: var(--paper-2);
		outline: 1.5px solid var(--line);
	}
	.m {
		font-size: 0.68rem;
		font-weight: 700;
		color: var(--muted);
	}
	.bar {
		height: 5px;
		border-radius: 3px;
		margin: 0 2px;
		background: color-mix(in srgb, var(--line) 45%, transparent);
	}
	.indoor.on,
	i.indoor {
		background: var(--sky);
	}
	.sow.on,
	i.sow {
		background: var(--leaf-2);
	}
	.harvest.on,
	i.harvest {
		background: var(--turmeric);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin: 8px 0 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.legend i {
		display: inline-block;
		width: 14px;
		height: 5px;
		border-radius: 3px;
		vertical-align: middle;
		margin-right: 4px;
	}
</style>

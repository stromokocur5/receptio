<script lang="ts">
	import { formatEur } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { logOf, type LogEvent } from '$lib/household';
	import { household, members } from '$lib/household.svelte';

	const SHOWN = 12;
	const catalog = useCatalog();

	const events = $derived(household.doc ? logOf(household.doc).slice(0, SHOWN) : []);
	const names = $derived(new Map(members().map((m) => [m.id, m.name])));

	const ICON: Record<LogEvent['kind'], IconName> = {
		'plan-add': 'plus',
		'plan-remove': 'minus',
		cooked: 'pot',
		bought: 'basket',
		pantry: 'jar',
		expense: 'euro'
	};

	const items = (n: number) => (n === 1 ? 'vec' : n < 5 ? 'veci' : 'vecí');
	const title = (id: string | undefined) => (id && catalog.recipesById.get(id)?.title) ?? 'recept';

	function text(e: LogEvent): string {
		const n = e.n ?? 0;
		switch (e.kind) {
			case 'plan-add':
				return `do plánu: ${title(e.ref)}`;
			case 'plan-remove':
				return `z plánu preč: ${title(e.ref)}`;
			case 'cooked':
				return `uvarené: ${title(e.ref)}`;
			case 'bought':
				return `v košíku ${n} ${items(n)}`;
			case 'pantry':
				return `do špajze ${n} ${items(n)}`;
			case 'expense':
				return `zaplatené ${formatEur(n)}`;
		}
	}

	const time = new Intl.DateTimeFormat('sk-SK', { hour: '2-digit', minute: '2-digit' });
	const day = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric' });
	function when(at: number): string {
		const date = new Date(at);
		const today = new Date();
		const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
		if (date.toDateString() === today.toDateString()) return time.format(date);
		if (date.toDateString() === yesterday.toDateString()) return `včera ${time.format(date)}`;
		return day.format(date);
	}
</script>

{#if events.length}
	<ul class="log">
		{#each events as e (e.id)}
			<li>
				<Icon name={ICON[e.kind]} size={16} />
				<span
					><strong>{(e.who && names.get(e.who)) || 'Niekto'}</strong>
					<span class="what">{text(e)}</span></span
				>
				<time datetime={new Date(e.at).toISOString()}>{when(e.at)}</time>
			</li>
		{/each}
	</ul>
{:else}
	<p class="muted">Zatiaľ ticho. Keď niekto zmení plán, nakúpi alebo zaplatí, uvidíš to tu.</p>
{/if}

<style>
	.log {
		display: grid;
		gap: 8px;
		padding: 0;
		margin: 12px 0 0;
		list-style: none;
	}
	.log li {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 10px;
		font-size: 0.92rem;
	}
	.what {
		overflow-wrap: anywhere;
	}
	time {
		color: var(--muted);
		font-size: 0.84rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>

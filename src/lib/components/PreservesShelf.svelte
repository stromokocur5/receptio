<script lang="ts">
	import Icon from './Icon.svelte';
	import {
		PRESERVE_PLACES,
		PRESERVE_PLACE_LABELS,
		preserveAge,
		sortPreserves,
		type PreservePlace
	} from '$lib/preserves';
	import { preserves, ui } from '$lib/state.svelte';

	const today = new Date().toISOString().slice(0, 10);
	let name = $state('');
	let count = $state(1);
	let place = $state<PreservePlace>('pivnica');
	let made = $state(today);

	const list = $derived(sortPreserves(preserves.current));
	const old = $derived(list.filter((p) => preserveAge(p, today) === 'old').length);

	const AGE_LABELS = { fresh: '', soon: 'spotrebuj čoskoro', old: 'staré – skontroluj' } as const;
	const monthYear = (iso: string) => {
		const [y, m] = iso.split('-');
		return `${Number(m)}/${y}`;
	};

	function add(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed || !(count >= 1)) return;
		preserves.current = [
			...preserves.current,
			{
				id: crypto.randomUUID().slice(0, 8),
				name: trimmed.slice(0, 80),
				count: Math.min(999, Math.round(count)),
				made: /^\d{4}-\d{2}-\d{2}$/.test(made) ? made : today,
				place
			}
		];
		name = '';
		count = 1;
	}

	/** Takes one jar out; the entry goes away with the last one. */
	function useOne(id: string) {
		preserves.current = preserves.current.flatMap((p) =>
			p.id !== id ? [p] : p.count > 1 ? [{ ...p, count: p.count - 1 }] : []
		);
	}

	function addOne(id: string) {
		preserves.current = preserves.current.map((p) =>
			p.id === id ? { ...p, count: Math.min(999, p.count + 1) } : p
		);
	}
</script>

<section class="card shelf" aria-labelledby="shelf-title">
	<h2 id="shelf-title"><Icon name="snowflake" size={22} /> Zaváraniny a mraznička</h2>
	<p class="muted small">
		Čo máš zavarené a zamrazené a odkedy. Najstaršie je hore – to zjedz ako prvé.
		{#if old}<strong class="warn">{old} {old === 1 ? 'položka je' : 'položky sú'} po čase.</strong
			>{/if}
	</p>

	{#if ui.loaded && list.length}
		{#each PRESERVE_PLACES as where (where)}
			{@const items = list.filter((p) => p.place === where)}
			{#if items.length}
				<h3>{PRESERVE_PLACE_LABELS[where]}</h3>
				<ul>
					{#each items as p (p.id)}
						{@const age = preserveAge(p, today)}
						<li class={age}>
							<span class="nm">
								{#if p.recipeId}<a href="/recepty/{p.recipeId}">{p.name}</a>{:else}{p.name}{/if}
								<small>
									{monthYear(p.made)}{#if AGE_LABELS[age]}
										· {AGE_LABELS[age]}{/if}
								</small>
							</span>
							<span class="count"
								><span aria-hidden="true">{p.count}×</span><span class="sr-only"
									>{p.count} kusov</span
								></span
							>
							<button class="step" aria-label="Pridať kus: {p.name}" onclick={() => addOne(p.id)}>
								<Icon name="plus" size={16} />
							</button>
							<button class="step" aria-label="Zobrať kus: {p.name}" onclick={() => useOne(p.id)}>
								<Icon name="minus" size={16} />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{/each}
	{/if}

	<form class="add" onsubmit={add}>
		<label class="field grow">
			<span class="sr-only">Čo</span>
			<input bind:value={name} maxlength="80" placeholder="Lečo, lekvár, fazuľky…" required />
		</label>
		<label class="field num">
			<span class="sr-only">Koľko kusov</span>
			<input type="number" bind:value={count} min="1" max="999" step="1" />
		</label>
		<label class="field">
			<span class="sr-only">Kde</span>
			<select bind:value={place}>
				{#each PRESERVE_PLACES as where (where)}
					<option value={where}>{PRESERVE_PLACE_LABELS[where]}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span class="sr-only">Kedy</span>
			<input type="date" bind:value={made} max={today} />
		</label>
		<button class="btn small"><Icon name="plus" size={16} /> Pridať</button>
	</form>
	<p class="muted small">
		Ako zavárať a mraziť: <a href="/wiki/zavaranie">Zaváranie</a> ·
		<a href="/wiki/mrazenie-urody">Mrazenie úrody</a> ·
		<a href="/wiki/kalendar-konzervovania">Kalendár</a>
	</p>
</section>

<style>
	.shelf {
		padding: 18px;
		margin-top: 18px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.3rem;
		margin: 0 0 6px;
	}
	h3 {
		font-size: 0.9rem;
		margin: 14px 0 6px;
		color: var(--muted);
	}
	.small {
		font-size: 0.85rem;
		margin: 0;
	}
	.warn {
		color: var(--tomato);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	li {
		display: grid;
		grid-template-columns: 1fr auto auto auto;
		align-items: center;
		gap: 6px;
		padding: 8px 10px;
		border-radius: 12px;
		background: var(--paper-2);
		animation: rise 0.3s var(--ease-out);
	}
	li.soon {
		background: color-mix(in srgb, var(--turmeric) 16%, var(--paper-2));
	}
	li.old {
		background: color-mix(in srgb, var(--tomato) 16%, var(--paper-2));
	}
	.nm {
		display: grid;
		min-width: 0;
		font-weight: 600;
	}
	.nm small {
		font-weight: 500;
		color: var(--muted);
		font-size: 0.78rem;
	}
	.count {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.step {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 1.5px solid var(--line);
		border-radius: 50%;
		background: var(--card);
		color: var(--ink);
		cursor: pointer;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 14px 0 10px;
	}
	.grow {
		flex: 1 1 180px;
	}
	.num {
		flex: 0 0 76px;
	}
</style>

<script lang="ts">
	import Icon from './Icon.svelte';
	import { useCatalog } from '$lib/catalog';
	import { localToday } from '$lib/journal';
	import {
		PRESERVE_PLACES,
		PRESERVE_PLACE_LABELS,
		PRESERVE_SUGGESTIONS,
		bestBefore,
		daysLeft,
		preserveAge,
		sortPreserves,
		type Preserve,
		type PreservePlace
	} from '$lib/preserves';
	import { planFromFreezer, preserves, settings, ui } from '$lib/state.svelte';
	import { toast } from '$lib/toast.svelte';

	const catalog = useCatalog();
	const today = localToday();
	let name = $state('');
	let count = $state(1);
	let place = $state<PreservePlace>('pivnica');
	let made = $state(today);
	let editing = $state<string | null>(null);
	let planned = $state<string | null>(null);

	const keepsOf = (p: Preserve) =>
		p.recipeId ? catalog.recipesById.get(p.recipeId)?.keeps : undefined;
	const list = $derived(sortPreserves(preserves.current, keepsOf));
	const ageOf = (p: Preserve) => preserveAge(p, today, keepsOf(p));
	const old = $derived(list.filter((p) => ageOf(p) === 'old').length);
	const soon = $derived(list.filter((p) => ageOf(p) === 'soon').length);
	const totals = $derived(
		PRESERVE_PLACES.map(
			(where) =>
				[where, list.filter((p) => p.place === where).reduce((n, p) => n + p.count, 0)] as const
		).filter(([, n]) => n > 0)
	);

	/** Recipes for things that go on the shelf, so a picked name links to its recipe. */
	const shelfRecipes = catalog.recipes.filter((r) =>
		r.categories.some((c) => c === 'domace/zavarane' || c === 'domace/kvasene')
	);
	const recipeByTitle = new Map(shelfRecipes.map((r) => [r.title.toLocaleLowerCase('sk'), r]));
	const suggestions = [...new Set([...PRESERVE_SUGGESTIONS, ...shelfRecipes.map((r) => r.title)])];

	const monthYear = (iso: string) => `${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`;
	const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

	function untilText(p: Preserve): string {
		const left = daysLeft(p, today, keepsOf(p));
		if (left < 0) return 'po čase – pred jedlom skontroluj';
		if (left === 0) return 'zjedz dnes';
		if (left === 1) return 'zjedz do zajtra';
		if (left < 31) return `zjedz do ${dayMonth(bestBefore(p, keepsOf(p)))}`;
		return `najlepšie do ${monthYear(bestBefore(p, keepsOf(p)))}`;
	}

	function add(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed || !(count >= 1)) return;
		const recipe = recipeByTitle.get(trimmed.toLocaleLowerCase('sk'));
		preserves.current = [
			...preserves.current,
			{
				id: crypto.randomUUID().slice(0, 8),
				name: trimmed.slice(0, 80),
				count: Math.min(999, Math.round(count)),
				made: /^\d{4}-\d{2}-\d{2}$/.test(made) && made <= today ? made : today,
				place,
				...(recipe && { recipeId: recipe.id })
			}
		];
		name = '';
		count = 1;
	}

	function update(id: string, change: Partial<Preserve>) {
		preserves.current = preserves.current.map((p) => (p.id === id ? { ...p, ...change } : p));
	}

	function remove(item: Preserve) {
		const before = preserves.current;
		preserves.current = before.filter((p) => p.id !== item.id);
		editing = null;
		toast(`${item.name}: odstránené`, () => (preserves.current = before));
	}

	/** Takes one jar out; the entry goes away with the last one. */
	function useOne(id: string) {
		preserves.current = preserves.current.flatMap((p) =>
			p.id !== id ? [p] : p.count > 1 ? [{ ...p, count: p.count - 1 }] : []
		);
	}

	function addOne(id: string) {
		update(id, {
			count: Math.min(999, (preserves.current.find((p) => p.id === id)?.count ?? 0) + 1)
		});
	}

	/** One piece goes from the freezer to the fridge to thaw; it keeps a day or two there. */
	function thawOne(p: Preserve) {
		const thawed = preserves.current.find(
			(q) => q.place === 'chladnicka' && q.thawed === today && q.name === p.name
		);
		useOne(p.id);
		preserves.current = thawed
			? preserves.current.map((q) => (q === thawed ? { ...q, count: q.count + 1 } : q))
			: [
					...preserves.current,
					{
						id: crypto.randomUUID().slice(0, 8),
						name: p.name,
						count: 1,
						made: p.made,
						place: 'chladnicka',
						thawed: today,
						...(p.recipeId && { recipeId: p.recipeId })
					}
				];
	}

	function plan(p: Preserve) {
		planFromFreezer(p.id, settings.current.people);
		planned = p.name;
		setTimeout(() => (planned = null), 2500);
	}
</script>

<section class="card box shelf" id="zavaraniny" aria-labelledby="shelf-title">
	<h2 class="section-title" id="shelf-title">
		<Icon name="snowflake" size={24} /> Zaváraniny a mraznička
	</h2>
	<p class="hint intro">
		Čo máš zavarené, zamrazené a rozmrazené. Hore je to, čo treba zjesť skôr – podľa druhu (lekvár
		vydrží dlhšie ako lečo, chlieb v mrazničke kratšie ako fazuľky).
	</p>
	{#if ui.loaded && totals.length}
		<p class="summary">
			{totals.map(([where, n]) => `${PRESERVE_PLACE_LABELS[where]}: ${n}`).join(' · ')}
			{#if old}<strong class="old-text">· {old} po čase</strong>{/if}
			{#if soon}<strong class="soon-text">· {soon} zjesť čoskoro</strong>{/if}
		</p>
	{/if}
	{#if planned}<p class="notice ok" role="status">
			<Icon name="check" size={18} />
			<span>{planned} je v <a href="/plan">pláne</a>.</span>
		</p>{/if}

	{#if ui.loaded && list.length}
		{#each PRESERVE_PLACES as where (where)}
			{@const items = list.filter((p) => p.place === where)}
			{#if items.length}
				<h3 class="eyebrow">{PRESERVE_PLACE_LABELS[where]}</h3>
				<ul class="items">
					{#each items as p (p.id)}
						{@const age = ageOf(p)}
						<li class="sunk {age}">
							<div class="row">
								<span class="nm">
									{#if p.recipeId}<a href="/recepty/{p.recipeId}">{p.name}</a>{:else}{p.name}{/if}
									<small>
										{p.thawed ? `rozmrazené ${dayMonth(p.thawed)}` : `z ${monthYear(p.made)}`} ·
										{untilText(p)}
									</small>
								</span>
								<span class="count"
									><span aria-hidden="true">{p.count}×</span><span class="sr-only"
										>{p.count} kusov</span
									></span
								>
								<button
									class="icon-btn step"
									aria-label="Pridať kus: {p.name}"
									onclick={() => addOne(p.id)}
								>
									<Icon name="plus" size={16} />
								</button>
								<button
									class="icon-btn step"
									aria-label="Zobrať kus: {p.name}"
									onclick={() => useOne(p.id)}
								>
									<Icon name="minus" size={16} />
								</button>
								<button
									class="icon-btn step"
									aria-label="Upraviť: {p.name}"
									aria-expanded={editing === p.id}
									onclick={() => (editing = editing === p.id ? null : p.id)}
								>
									<Icon name="pencil" size={15} />
								</button>
							</div>
							{#if p.place === 'mraznicka'}
								<div class="acts">
									{#if p.recipeId && catalog.recipesById.has(p.recipeId)}
										<button class="btn ghost small" onclick={() => plan(p)}
											><Icon name="calendar" size={16} /> Do plánu</button
										>
									{/if}
									<button class="btn ghost small" onclick={() => thawOne(p)}
										><Icon name="fridge" size={16} /> Rozmraziť 1 do chladničky</button
									>
								</div>
							{/if}
							{#if editing === p.id}
								<div class="edit">
									<label>
										Čo
										<input
											class="input"
											value={p.name}
											maxlength="80"
											onchange={(e) =>
												e.currentTarget.value.trim() &&
												update(p.id, { name: e.currentTarget.value.trim() })}
										/>
									</label>
									<label>
										Kde
										<select
											class="input"
											value={p.place}
											onchange={(e) => {
												const to = e.currentTarget.value as PreservePlace;
												const { thawed: _thawed, ...rest } = p;
												preserves.current = preserves.current.map((q) =>
													q.id === p.id ? { ...rest, place: to } : q
												);
											}}
										>
											{#each PRESERVE_PLACES as option (option)}
												<option value={option}>{PRESERVE_PLACE_LABELS[option]}</option>
											{/each}
										</select>
									</label>
									<label>
										Kedy zavarené / zamrazené
										<input
											class="input"
											type="date"
											value={p.made}
											max={today}
											onchange={(e) =>
												/^\d{4}-\d{2}-\d{2}$/.test(e.currentTarget.value) &&
												update(p.id, { made: e.currentTarget.value })}
										/>
									</label>
									<button class="btn danger small" onclick={() => remove(p)}
										><Icon name="trash" size={16} /> Odstrániť všetky</button
									>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/each}
	{:else if ui.loaded}
		<p class="hint empty-note">
			Zatiaľ nič. Pri receptoch na zaváranie ťukni „Zapísať do zásob“ a poháre sa sem pridajú samy.
			Zvyšné porcie, ktoré v pláne navaríš navyše na zamrazenie, sa sem po uvarení zapíšu samy.
		</p>
	{/if}

	<form class="add" onsubmit={add}>
		<label class="grow">
			Čo
			<input
				class="input"
				bind:value={name}
				list="preserve-names"
				maxlength="80"
				placeholder="Lečo, lekvár, fazuľky…"
				required
			/>
		</label>
		<datalist id="preserve-names">
			{#each suggestions as suggestion (suggestion)}<option value={suggestion}></option>{/each}
		</datalist>
		<label class="num">
			Koľko
			<input class="input" type="number" bind:value={count} min="1" max="999" step="1" />
		</label>
		<label class="where">
			Kde
			<select class="input" bind:value={place}>
				{#each PRESERVE_PLACES as where (where)}
					<option value={where}>{PRESERVE_PLACE_LABELS[where]}</option>
				{/each}
			</select>
		</label>
		<label class="when">
			Kedy
			<input class="input" type="date" bind:value={made} max={today} />
		</label>
		<button class="btn leaf add-btn"><Icon name="plus" size={18} /> Pridať</button>
	</form>
	<p class="hint">
		Ako zavárať a mraziť: <a href="/wiki/zavaranie">Zaváranie</a> ·
		<a href="/wiki/mrazenie-urody">Mrazenie úrody</a> ·
		<a href="/wiki/mrazenie">Chladnička a mraznička</a> ·
		<a href="/wiki/kalendar-konzervovania">Kalendár</a>
	</p>
</section>

<style>
	.intro {
		margin: 0;
	}
	h3 {
		margin: var(--sp-4) 0 6px;
		font-family: var(--font-body);
	}
	.summary {
		margin: 10px 0 0;
		font-size: var(--fs-md);
	}
	.old-text {
		color: color-mix(in srgb, var(--tomato) 80%, var(--ink));
	}
	.soon-text {
		color: color-mix(in srgb, var(--turmeric) 40%, var(--ink));
	}
	.empty-note {
		margin-top: var(--sp-3);
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.items li {
		display: grid;
		gap: var(--sp-2);
		padding: var(--sp-2) 6px var(--sp-2) var(--sp-3);
		animation: rise 0.3s var(--ease-out);
	}
	.items li.soon {
		background: color-mix(in srgb, var(--turmeric) 16%, var(--sunk));
	}
	.items li.old {
		background: color-mix(in srgb, var(--tomato) 16%, var(--sunk));
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto auto auto;
		align-items: center;
		gap: var(--sp-1);
	}
	.nm {
		display: grid;
		min-width: 0;
		font-weight: 600;
	}
	.nm small {
		font-weight: 500;
		color: var(--muted);
		font-size: var(--fs-sm);
	}
	.count {
		padding: 0 var(--sp-1);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.step {
		background: var(--card);
	}
	.step[aria-expanded='true'] {
		box-shadow: inset 0 0 0 2px var(--leaf);
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.edit {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		align-items: end;
		gap: var(--sp-2);
		padding-right: 6px;
	}
	.edit label,
	.add label {
		display: grid;
		gap: var(--sp-1);
		font-size: var(--fs-sm);
		font-weight: 650;
		color: var(--muted);
	}
	.edit .input,
	.add .input {
		min-width: 0;
		width: 100%;
	}
	/* What and how many, then where and when: every field lines up with the card's edges. */
	.add {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 88px;
		align-items: end;
		gap: var(--sp-2);
		margin: var(--sp-4) 0 10px;
	}
	.grow {
		grid-column: span 2;
	}
	.when {
		grid-column: span 2;
	}
	.add-btn {
		justify-self: start;
	}
	@media (prefers-reduced-motion: reduce) {
		.items li {
			animation: none;
		}
	}
</style>

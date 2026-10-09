<script lang="ts">
	import { shortName } from '$lib/avoid';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import { ingredientSearchText, normalizeSearch } from '$lib/labels';

	let {
		selected,
		onchange,
		prefix = 'bez',
		placeholder = 'Napr. huby, koriander…',
		fieldLabel = 'Surovina, ktorú nechceš alebo nemáš',
		hint
	}: {
		/** Ingredient ids. */
		selected: string[];
		onchange: (ids: string[]) => void;
		/** Word before each chosen name: "bez: huby"; empty for just the name. */
		prefix?: string;
		placeholder?: string;
		/** For screen readers; the placeholder isn't a label. */
		fieldLabel?: string;
		hint: string;
	} = $props();

	const catalog = useCatalog();
	let query = $state('');

	const nameOf = (id: string) => shortName(catalog.ingredientsById.get(id)?.name ?? id);
	const label = (id: string) => (prefix ? `${prefix}: ${nameOf(id)}` : nameOf(id));
	const selectedGroups = $derived(
		selected.map((id) => catalog.ingredientsById.get(id)?.group ?? id)
	);
	/** Ingredients some recipe uses, one per group (dry and canned chickpeas are one choice). */
	const choosable = $derived.by(() => {
		const used = new Set(catalog.recipes.flatMap((r) => r.lines.map((l) => l.ingredientId)));
		const seen = new Set<string>();
		return catalog.ingredients.filter((i) => {
			if (!used.has(i.id) || i.id === 'voda' || seen.has(i.group)) return false;
			seen.add(i.group);
			return true;
		});
	});
	const suggestions = $derived.by(() => {
		const q = normalizeSearch(query.trim());
		if (!q) return [];
		const found = choosable
			.filter((i) => !selectedGroups.includes(i.group))
			.map((i) => ({ i, name: normalizeSearch(i.name), text: ingredientSearchText(i) }))
			.filter(({ text }) => text.includes(q));
		// Own name first, and names starting with the query before the rest: "mrk" → mrkva
		// before "sušená mrkva"; "huby" → šampiňóny before everything in their category.
		const rank = ({ name }: { name: string }) =>
			name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
		found.sort((a, b) => rank(a) - rank(b));
		return found.slice(0, 8).map(({ i }) => i);
	});

	function add(id: string) {
		onchange([...selected, id]);
		query = '';
	}
</script>

<div class="excluder">
	{#if selected.length}
		<div class="chips">
			{#each selected as id (id)}
				<button
					class="chip"
					aria-pressed="true"
					aria-label="Zrušiť: {label(id)}"
					onclick={() => onchange(selected.filter((x) => x !== id))}
				>
					{label(id)}
					<Icon name="x" size={14} />
				</button>
			{/each}
		</div>
	{/if}
	<label class="field small-field">
		<Icon name="search" size={16} />
		<span class="sr-only">{fieldLabel}</span>
		<input
			type="search"
			bind:value={query}
			{placeholder}
			autocomplete="off"
			onkeydown={(e) => {
				if (e.key === 'Enter' && suggestions[0]) {
					e.preventDefault();
					add(suggestions[0].id);
				}
			}}
		/>
	</label>
	{#if suggestions.length}
		<div class="chips" role="group" aria-label="Návrhy surovín">
			{#each suggestions as i (i.id)}
				<button class="chip" aria-label="Pridať: {label(i.id)}" onclick={() => add(i.id)}>
					<Icon name="plus" size={13} />
					{nameOf(i.id)}
				</button>
			{/each}
		</div>
	{:else if query.trim()}
		<p class="hint">Takú surovinu v receptoch nemáme.</p>
	{:else}
		<p class="hint">{hint}</p>
	{/if}
</div>

<style>
	.excluder {
		display: grid;
		gap: 10px;
	}
	/* Long names wrap instead of pushing out of the card. */
	.chip {
		max-width: 100%;
		white-space: normal;
		text-align: left;
	}
	.hint {
		margin: 0;
	}
</style>

<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import {
		collections,
		createCollection,
		MAX_COLLECTION_NAME,
		MAX_COLLECTIONS,
		toggleInCollection
	} from '$lib/state.svelte';

	let { recipeId }: { recipeId: string } = $props();

	let adding = $state(false);
	let name = $state('');

	function add(event: SubmitEvent) {
		event.preventDefault();
		if (createCollection(name, recipeId)) {
			name = '';
			adding = false;
		}
	}
</script>

<div class="collections" role="group" aria-label="Kolekcie">
	<span class="label"><Icon name="bookmark" size={15} /> Do kolekcie:</span>
	{#each collections.current as c (c.id)}
		{@const inside = c.recipeIds.includes(recipeId)}
		<button class="chip" aria-pressed={inside} onclick={() => toggleInCollection(c.id, recipeId)}>
			{#if inside}<Icon name="check" size={13} />{/if}
			{c.name}
		</button>
	{/each}
	{#if adding}
		<form onsubmit={add}>
			<label class="field small-field">
				<span class="sr-only">Názov kolekcie</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					bind:value={name}
					maxlength={MAX_COLLECTION_NAME}
					placeholder="Napr. Desiata, Na návštevu"
					autofocus
					required
				/>
			</label>
			<button class="btn leaf small" type="submit">Pridať</button>
			<button class="btn ghost small" type="button" onclick={() => (adding = false)}>Zrušiť</button>
		</form>
	{:else if collections.current.length < MAX_COLLECTIONS}
		<button class="chip" onclick={() => (adding = true)}>
			<Icon name="plus" size={13} /> Nová kolekcia
		</button>
	{/if}
</div>

<style>
	.collections {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 12px;
	}
	.label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--ink-2);
	}
	form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	form .field {
		min-width: 0;
		flex: 1 1 12em;
	}
	form input {
		min-width: 0;
		width: 100%;
	}
</style>

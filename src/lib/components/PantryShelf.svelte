<script lang="ts">
	import { CATEGORY_LABELS } from '$lib/labels';
	import { INGREDIENT_CATEGORIES, type IngredientCategory, type IngredientLite } from '$lib/types';

	let {
		items,
		onremove
	}: {
		items: IngredientLite[];
		onremove: (ingredient: IngredientLite) => void;
	} = $props();

	type Vessel = 'jar' | 'crate' | 'pack' | 'bottle' | 'carton' | 'sack';
	const VESSEL: Record<IngredientCategory, Vessel> = {
		zelenina: 'crate',
		ovocie: 'crate',
		strukoviny: 'jar',
		bielkoviny: 'pack',
		obilniny: 'sack',
		'orechy-semienka': 'jar',
		'rastlinne-mlieka': 'carton',
		'omacky-pasty': 'bottle',
		koreniny: 'jar',
		oleje: 'bottle',
		nahrady: 'pack',
		ine: 'jar'
	};

	const shelves = $derived(
		INGREDIENT_CATEGORIES.map((category) => ({
			category,
			items: items
				.filter((i) => i.category === category)
				.sort((a, b) => a.name.localeCompare(b.name, 'sk'))
		})).filter((s) => s.items.length)
	);
	/** "Cícer sterilizovaný (scedený)" → "Cícer sterilizovaný" fits under a jar. */
	const short = (name: string) => name.replace(/\s*\(.*\)$/, '');
</script>

<div class="shelves">
	{#each shelves as shelf (shelf.category)}
		<section class="shelf">
			<h3>{CATEGORY_LABELS[shelf.category]}</h3>
			<ul>
				{#each shelf.items as item, i (item.id)}
					<li style:--c={item.color} style:--i={i}>
						<button onclick={() => onremove(item)} aria-label="Odobrať {item.name}" title="Odobrať">
							<svg viewBox="0 0 48 56" aria-hidden="true">
								{#if VESSEL[shelf.category] === 'jar'}
									<rect x="14" y="4" width="20" height="7" rx="2" class="lid" />
									<path
										d="M12 12h24a4 4 0 0 1 4 4v32a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V16a4 4 0 0 1 4-4Z"
										class="glass"
									/>
									<path d="M10 26h28v22a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4Z" class="fill" />
									<rect x="13" y="30" width="22" height="9" rx="2" class="tag" />
								{:else if VESSEL[shelf.category] === 'crate'}
									<circle cx="17" cy="26" r="9" class="fill" />
									<circle cx="31" cy="24" r="9" class="fill" />
									<circle cx="24" cy="30" r="9" class="fill alt" />
									<path d="M4 30h40l-4 22H8Z" class="crate" />
									<path d="M10 38h28M11 45h26" class="slats" />
								{:else if VESSEL[shelf.category] === 'pack'}
									<rect x="6" y="18" width="36" height="32" rx="5" class="box" />
									<rect x="10" y="22" width="28" height="24" rx="3" class="fill" />
									<path d="M6 26h36" class="slats" />
								{:else if VESSEL[shelf.category] === 'bottle'}
									<rect x="20" y="2" width="8" height="8" rx="2" class="lid" />
									<path
										d="M19 10h10v6l6 8v26a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4V24l6-8Z"
										class="fill"
									/>
									<rect x="16" y="30" width="16" height="12" rx="2" class="tag" />
								{:else if VESSEL[shelf.category] === 'carton'}
									<path d="M12 14l6-10h12l6 10v38H12Z" class="box" />
									<rect x="12" y="24" width="24" height="18" class="fill" />
								{:else}
									<path
										d="M10 18c0-8 6-10 14-10s14 2 14 10v30a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4Z"
										class="sack"
									/>
									<path d="M15 10c3 4 15 4 18 0" class="slats" />
									<ellipse cx="24" cy="34" rx="10" ry="9" class="fill" />
								{/if}
							</svg>
							<span class="name">{short(item.name)}</span>
							<span class="x" aria-hidden="true">×</span>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
	.shelves {
		display: grid;
		gap: var(--sp-4);
	}
	.shelf h3 {
		margin: 0 0 var(--sp-1);
		color: var(--muted);
		font-size: var(--fs-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	ul {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--sp-2) var(--sp-1);
		margin: 0;
		padding: 0 var(--sp-2) 10px;
		list-style: none;
		/* The plank under the jars. */
		background: linear-gradient(to top, #8a5a32 0 7px, #a8713f 7px 10px, transparent 10px);
		border-radius: 0 0 4px 4px;
	}
	li {
		animation: shelve 0.45s var(--ease-spring) both;
		animation-delay: calc(var(--i) * 30ms);
	}
	@keyframes shelve {
		from {
			opacity: 0;
			transform: translateY(-14px);
		}
	}
	button {
		position: relative;
		display: grid;
		justify-items: center;
		width: 74px;
		padding: 0 0 4px;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	svg {
		width: 46px;
		height: 54px;
		transition: transform 0.25s var(--ease-spring);
	}
	button:hover svg {
		transform: translateY(-4px) rotate(-4deg);
	}
	.name {
		max-width: 100%;
		overflow: hidden;
		font-size: 11px;
		font-weight: 650;
		line-height: 1.2;
		text-align: center;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.x {
		position: absolute;
		top: -4px;
		right: 8px;
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--tomato);
		color: var(--paper);
		font-size: 13px;
		font-weight: 800;
		line-height: 1;
		opacity: 0;
		transform: scale(0.6);
		transition:
			opacity 0.2s,
			transform 0.2s var(--ease-spring);
	}
	button:hover .x,
	button:focus-visible .x {
		opacity: 1;
		transform: none;
	}
	.lid {
		fill: #b9873f;
	}
	.glass {
		fill: color-mix(in srgb, var(--card) 70%, transparent);
		stroke: color-mix(in srgb, var(--ink) 25%, transparent);
		stroke-width: 1.5;
	}
	.fill {
		fill: var(--c);
	}
	.fill.alt {
		fill: color-mix(in srgb, var(--c) 75%, #000);
	}
	.tag {
		fill: #fdf6e6;
		opacity: 0.9;
	}
	.crate {
		fill: #b98450;
	}
	.box {
		fill: #f1ead8;
		stroke: color-mix(in srgb, var(--ink) 20%, transparent);
		stroke-width: 1.5;
	}
	.sack {
		fill: #d8c29a;
	}
	.slats {
		fill: none;
		stroke: color-mix(in srgb, #000 30%, transparent);
		stroke-width: 1.5;
	}
	@media (prefers-reduced-motion: reduce) {
		li {
			animation: none;
		}
	}
</style>

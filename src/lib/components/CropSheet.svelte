<script lang="ts">
	import { formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import GrowMonths from '$lib/components/GrowMonths.svelte';
	import PlantGlyph from '$lib/components/PlantGlyph.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import {
		FORM_LABELS,
		LEVEL_LABELS,
		PLACE_LABELS,
		SUN_LABELS,
		successors,
		yearsPhrase
	} from '$lib/garden';
	import type { GrowGuide, GrowPlace } from '$lib/types';

	let {
		guide,
		guides,
		place,
		onpick,
		onclose
	}: {
		guide: GrowGuide | null;
		guides: GrowGuide[];
		/** Where successors should fit. */
		place: GrowPlace;
		/** Opens another crop (a neighbour or successor) in the same sheet. */
		onpick: (ingredientId: string) => void;
		onclose: () => void;
	} = $props();

	const catalog = useCatalog();
	const byId = $derived(new Map(guides.map((g) => [g.ingredientId, g])));
	const next = $derived(guide ? successors(guide, guides, place).slice(0, 6) : []);
	const color = (id: string) => catalog.ingredientsById.get(id)?.color ?? '#6fa35a';
	const nameOf = (id: string) => byId.get(id)?.name ?? catalog.ingredientsById.get(id)?.name ?? id;

	let dialog: HTMLDialogElement;
	let body = $state<HTMLElement>();

	$effect(() => {
		if (guide && !dialog.open) dialog.showModal();
		else if (!guide && dialog.open) dialog.close();
	});
	$effect(() => {
		// A neighbour opened from inside the sheet starts at its top.
		if (guide) body?.scrollTo({ top: 0 });
	});

	function spacing(g: GrowGuide): string {
		if (!g.spacing) return 'sieje sa nahusto';
		return g.spacing >= 100
			? `${formatNumber(g.spacing / 100)} m od seba`
			: `${g.spacing} cm od seba`;
	}
</script>

<dialog
	class="sheet"
	bind:this={dialog}
	{onclose}
	oncancel={(e) => {
		e.preventDefault();
		onclose();
	}}
	onclick={(e) => e.target === dialog && onclose()}
	aria-labelledby="crop-sheet-title"
>
	{#if guide}
		<div class="inner" bind:this={body}>
			<header style:--crop={color(guide.ingredientId)}>
				<span class="grip" aria-hidden="true"></span>
				<div class="title">
					<svg class="glyph" viewBox="-11 -11 22 22" aria-hidden="true"
						><PlantGlyph
							family={guide.family}
							form={guide.form}
							color={color(guide.ingredientId)}
						/></svg
					>
					<h2 id="crop-sheet-title">{guide.name}</h2>
					<button class="close" onclick={onclose} aria-label="Zavrieť">
						<Icon name="x" size={20} />
					</button>
				</div>
				<p class="tags">
					<span class="badge leaf">{LEVEL_LABELS[guide.level]}</span>
					<span class="badge sky">{guide.where.map((w) => PLACE_LABELS[w]).join(' · ')}</span>
					<span class="badge turmeric">{guide.sun.map((s) => SUN_LABELS[s]).join(' · ')}</span>
					{#if guide.form}<span class="badge plum">{FORM_LABELS[guide.form]}</span>{/if}
					{#if guide.perennial && !guide.form}<span class="badge">trvalka</span>{/if}
				</p>
			</header>

			<GrowMonths indoor={guide.indoor} sow={guide.sow} harvest={guide.harvest} legend />

			<p class="how">{guide.how}</p>
			{#if guide.tip}
				<p class="tip"><Icon name="sparkle" size={16} /> <span>{guide.tip}</span></p>
			{/if}

			<dl class="facts">
				<div>
					<dt>Rozostup</dt>
					<dd>{spacing(guide)}</dd>
				</div>
				<div>
					<dt>Úroda</dt>
					<dd>asi {formatNumber(guide.yieldKg)} kg z rastliny</dd>
				</div>
				<div>
					<dt>Čeľaď</dt>
					<dd>{guide.family}</dd>
				</div>
				{#if guide.heightM}
					<div>
						<dt>Výška</dt>
						<dd>do {formatNumber(guide.heightM)} m</dd>
					</div>
				{/if}
				{#if guide.yearsToHarvest !== undefined}
					<div>
						<dt>Prvá úroda</dt>
						<dd>
							{guide.yearsToHarvest === 0 ? 'v prvom roku' : yearsPhrase(guide.yearsToHarvest)}
						</dd>
					</div>
				{/if}
			</dl>
			{#if guide.pollination}
				<p class="tip pollination">
					<Icon name="bee" size={16} /> <span>{guide.pollination}</span>
				</p>
			{/if}

			{#if guide.friends.length || guide.avoid.length}
				<section>
					{#if guide.friends.length}
						<h3>Dobrí susedia</h3>
						<div class="chips">
							{#each guide.friends as id (id)}
								{#if byId.has(id)}
									<button class="chip" onclick={() => onpick(id)}
										><i style:background={color(id)}></i>{nameOf(id)}</button
									>
								{:else}
									<span class="chip static"><i style:background={color(id)}></i>{nameOf(id)}</span>
								{/if}
							{/each}
						</div>
					{/if}
					{#if guide.avoid.length}
						<h3>Nesaď vedľa</h3>
						<div class="chips">
							{#each guide.avoid as id (id)}
								{#if byId.has(id)}
									<button class="chip avoid" onclick={() => onpick(id)}>{nameOf(id)}</button>
								{:else}
									<span class="chip avoid static">{nameOf(id)}</span>
								{/if}
							{/each}
						</div>
					{/if}
				</section>
			{/if}

			{#if next.length}
				<section>
					<h3>Po zbere zasaď na to isté miesto</h3>
					<div class="chips">
						{#each next as g (g.ingredientId)}
							<button class="chip" onclick={() => onpick(g.ingredientId)}
								><i style:background={color(g.ingredientId)}></i>{g.name}</button
							>
						{/each}
					</div>
				</section>
			{/if}

			{#if guide.problems.length}
				<details>
					<summary>Problémy a čo s nimi</summary>
					<ul>
						{#each guide.problems as problem, i (i)}<li>{problem}</li>{/each}
					</ul>
				</details>
			{/if}
			<details>
				<summary>Vlastné semená</summary>
				<p>{guide.seeds}</p>
			</details>
			<details>
				<summary>Čo s úrodou</summary>
				<p>{guide.preserve}</p>
			</details>

			<a class="btn ghost small more" href="/suroviny/{guide.ingredientId}">
				Všetko o surovine {guide.name.toLowerCase()}
				<Icon name="arrow-right" size={16} />
			</a>
		</div>
	{/if}
</dialog>

<style>
	.sheet {
		width: min(640px, 100%);
		max-width: 100%;
		max-height: min(88dvh, 900px);
		margin: auto auto 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius) var(--radius) 0 0;
		background: var(--card);
		color: var(--ink);
		box-shadow: var(--shadow-lift);
	}
	.sheet[open] {
		animation: slide-up 0.35s var(--ease-out);
	}
	.sheet::backdrop {
		background: rgba(17, 26, 20, 0.45);
		backdrop-filter: blur(2px);
	}
	@media (min-width: 700px) {
		.sheet {
			margin: auto;
			border-radius: var(--radius);
		}
		.sheet[open] {
			animation: pop-in 0.3s var(--ease-spring);
		}
		.grip {
			display: none !important;
		}
	}
	@keyframes slide-up {
		from {
			transform: translateY(40%);
			opacity: 0;
		}
	}
	@keyframes pop-in {
		from {
			transform: scale(0.94);
			opacity: 0;
		}
	}
	.inner {
		display: grid;
		gap: 14px;
		padding: 0 20px 24px;
		max-height: inherit;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	header {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 10px 0 10px;
		background: var(--card);
		border-bottom: 1px solid var(--line);
	}
	.grip {
		display: block;
		width: 44px;
		height: 5px;
		margin: 0 auto 8px;
		border-radius: 3px;
		background: var(--line);
	}
	.title {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.title h2 {
		flex: 1;
		margin: 0;
		font-size: 1.6rem;
	}
	.glyph {
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: #6b4a33;
		animation: grow 0.5s var(--ease-spring) both;
	}
	.pollination {
		background: var(--sky-soft);
	}
	:global(.badge.plum) {
		background: color-mix(in srgb, var(--plum) 16%, transparent);
		color: var(--plum);
	}
	@keyframes grow {
		from {
			transform: scale(0);
		}
	}
	.close {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 50%;
		background: var(--paper-2);
		color: var(--ink);
		cursor: pointer;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 8px 0 0;
	}
	.how {
		margin: 0;
		font-size: 1.02rem;
		line-height: 1.55;
	}
	.tip {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		margin: 0;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--turmeric-soft);
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 8px;
		margin: 0;
	}
	.facts div {
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--paper);
	}
	.facts dt {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.facts dd {
		margin: 2px 0 0;
		font-weight: 600;
	}
	h3 {
		margin: 10px 0 6px;
		font-size: 0.95rem;
	}
	section h3:first-child {
		margin-top: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		margin-right: 5px;
		vertical-align: -1px;
	}
	.chip.avoid {
		border-color: color-mix(in srgb, var(--tomato) 45%, var(--line));
		color: var(--tomato);
	}
	.chip.static {
		cursor: default;
	}
	details {
		border-top: 1px dashed var(--line);
		padding-top: 10px;
	}
	summary {
		cursor: pointer;
		font-weight: 650;
		color: var(--leaf);
	}
	details p,
	details ul {
		margin: 8px 0 0;
	}
	details ul {
		padding-left: 1.2em;
	}
	.more {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
</style>

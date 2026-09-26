<script lang="ts">
	import { formatAmount, formatEur, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import GlutenBadge from '$lib/components/GlutenBadge.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LikeButton from '$lib/components/LikeButton.svelte';
	import NutrientBars from '$lib/components/NutrientBars.svelte';
	import PlateArt from '$lib/components/PlateArt.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import {
		ALLERGEN_LABELS,
		COMPUTED_TAG_LABELS,
		DAILY_REFERENCE,
		VEGAN_PROTEIN_G_PER_KG,
		computedTags,
		scaleNutrients
	} from '$lib/nutrition';
	import { isAssumedAtHome, matchRecipe, pantryByGroup } from '$lib/pantry';
	import { addToPlan, pantry, servingsInPlan, settings, ui } from '$lib/state.svelte';

	let { data } = $props();
	const catalog = useCatalog();

	const base = $derived(data.recipe);

	let variantName = $state<string | null>(null);
	const variant = $derived(
		variantName ? base.variants.find((v) => v.name === variantName) : undefined
	);
	/** The recipe as currently shown: variant data (lines, nutrition, cost…) over the base recipe. */
	const recipe = $derived.by(() => {
		if (!variant) return base;
		const { name: _name, description: _description, ...computed } = variant;
		return { ...base, ...computed };
	});
	$effect.pre(() => {
		void base.id;
		variantName = null;
	});
	const cuisine = $derived(catalog.cuisinesById.get(recipe.cuisine));

	let servings = $state(0);
	$effect.pre(() => {
		// Reset the scaler when navigating between recipes.
		servings = recipe.servings;
	});
	const factor = $derived(servings / recipe.servings);

	let doneSteps = $state<number[]>([]);
	$effect.pre(() => {
		void recipe.id;
		doneSteps = [];
	});

	const groups = $derived(pantryByGroup(pantry.current, catalog.ingredientsById));
	const match = $derived(matchRecipe(recipe, groups, catalog.ingredientsById));
	const hasPantry = $derived(ui.loaded && Object.keys(pantry.current).length > 0);
	const inPlan = $derived(ui.loaded ? servingsInPlan(recipe.id) : 0);
	let justAdded = $state(false);

	const targets = $derived({
		...DAILY_REFERENCE,
		protein: settings.current.weightKg
			? settings.current.weightKg * VEGAN_PROTEIN_G_PER_KG
			: DAILY_REFERENCE.protein
	});
	const tags = $derived(computedTags(recipe));

	const similar = $derived.by(() => {
		const mine = new Set(
			recipe.lines.map((l) => catalog.ingredientsById.get(l.ingredientId)!.group)
		);
		return catalog.recipes
			.filter((r) => r.id !== recipe.id)
			.map((r) => {
				const shared = new Set(
					r.lines
						.map((l) => catalog.ingredientsById.get(l.ingredientId)!)
						.filter((i) => !i.staple && i.category !== 'koreniny' && mine.has(i.group))
						.map((i) => i.group)
				).size;
				return { r, score: shared + (r.cuisine === recipe.cuisine ? 2 : 0) };
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, 3)
			.map((x) => x.r);
	});

	function isHome(ingredientId: string) {
		const ingredient = catalog.ingredientsById.get(ingredientId)!;
		return isAssumedAtHome(ingredient) || groups.has(ingredient.group);
	}

	function toggleStep(i: number) {
		doneSteps = doneSteps.includes(i) ? doneSteps.filter((s) => s !== i) : [...doneSteps, i];
	}

	function plan() {
		addToPlan(recipe.id, servings, variantName ?? undefined);
		justAdded = true;
		setTimeout(() => (justAdded = false), 1600);
	}
</script>

<svelte:head>
	<title>{recipe.title} · Receptio</title>
	<meta name="description" content={recipe.description} />
</svelte:head>

<article class="wrap page">
	<a class="back" href="/recepty"><Icon name="arrow-left" size={18} /> Recepty</a>

	<header class="hero" style:--accent={cuisine?.color}>
		<div class="art plate-host">
			<div class="halo"></div>
			<PlateArt
				seed={recipe.id}
				lines={recipe.lines}
				byId={catalog.ingredientsById}
				detail
				steam={!recipe.meals.includes('dezert')}
				label="Ilustrácia jedla {recipe.title}"
			/>
		</div>
		<div class="intro rise">
			{#if cuisine}
				<a class="cuisine" href="/kuchyne/{cuisine.id}"><span class="sw"></span>{cuisine.name}</a>
			{/if}
			<h1>{recipe.title}</h1>
			<p class="lede">{recipe.description}</p>

			<dl class="facts">
				<div>
					<dt><Icon name="clock" size={18} /> Čas</dt>
					<dd>{recipe.time} min <small>({recipe.activeTime} aktívne)</small></dd>
				</div>
				<div>
					<dt><Icon name="chef" size={18} /> Náročnosť</dt>
					<dd>{['', 'Jednoduché', 'Stredné', 'Náročnejšie'][recipe.difficulty]}</dd>
				</div>
				<div>
					<dt><Icon name="euro" size={18} /> Porcia</dt>
					<dd>
						{formatEur(recipe.costPerServing)}
						{#if recipe.costIsEstimate}<small title="Časť cien je odhad">odhad</small>{/if}
					</dd>
				</div>
				{#if recipe.showNutrition}
					<div>
						<dt><Icon name="bean" size={18} /> Bielkoviny</dt>
						<dd>{formatNumber(recipe.perServing.protein, 0)} g <small>/ porcia</small></dd>
					</div>
				{:else if recipe.yields}
					<div>
						<dt><Icon name="package" size={18} /> Výťažok</dt>
						<dd class="yields">{recipe.yields}</dd>
					</div>
				{/if}
			</dl>

			<div class="badges">
				<GlutenBadge {recipe} />
				{#each tags.filter((t) => t !== 'bezlepkove') as t (t)}
					<span class="badge leaf">{COMPUTED_TAG_LABELS[t]}</span>
				{/each}
				{#each recipe.allergens as a (a)}
					<span class="badge turmeric">{ALLERGEN_LABELS[a]}</span>
				{/each}
			</div>

			{#if base.variants.length}
				<div class="variants" role="group" aria-label="Verzia receptu">
					<span class="v-label">Verzia</span>
					<button
						class="chip"
						aria-pressed={variantName === null}
						onclick={() => (variantName = null)}
					>
						Pôvodná
					</button>
					{#each base.variants as v (v.name)}
						<button
							class="chip"
							aria-pressed={variantName === v.name}
							onclick={() => (variantName = v.name)}
						>
							{v.name}
						</button>
					{/each}
				</div>
				{#if variant}
					<p class="variant-desc"><Icon name="sparkle" size={16} /> {variant.description}</p>
				{/if}
			{/if}

			{#if base.ahead}
				<p class="ahead"><Icon name="clock" size={18} /> <strong>Vopred:</strong> {base.ahead}</p>
			{/if}

			<div class="actions">
				<button class="btn leaf" onclick={plan}>
					{#if justAdded}
						<Icon name="check" size={18} draw /> Pridané
					{:else}
						<Icon name="calendar" size={18} /> Do plánu ({servings}
						{servings === 1 ? 'porcia' : servings < 5 ? 'porcie' : 'porcií'})
					{/if}
				</button>
				<LikeButton recipeId={recipe.id} />
				{#if inPlan}<a class="in-plan" href="/plan">V pláne: {inPlan} porc.</a>{/if}
			</div>
			{#if hasPantry}
				<p class="pantry-line">
					<Icon name="jar" size={18} />
					{#if match.missing.length === 0 && match.short.length === 0}
						Máš doma všetko potrebné.
					{:else}
						Máš {match.have - match.short.length}/{match.needed}.
						{#if match.missing.length}Chýba: {match.missing.map((i) => i.name).join(', ')}.{/if}
						{#if match.short.length}Málo: {match.short.map((i) => i.name).join(', ')}.{/if}
					{/if}
				</p>
			{/if}
		</div>
	</header>

	{#if recipe.warnings.length}
		<section class="warnings" aria-label="Upozornenia">
			{#each recipe.warnings as w, i (i)}
				<div class="warning {w.level}">
					<Icon name={w.level === 'info' ? 'info' : 'alert'} size={20} />
					<span>{w.text}</span>
				</div>
			{/each}
		</section>
	{/if}

	<div class="main">
		<section class="ingredients card">
			<div class="ing-head">
				<h2>Suroviny</h2>
				<div class="stepper" role="group" aria-label="Počet porcií">
					<button
						class="icon-btn"
						aria-label="Menej porcií"
						disabled={servings <= 1}
						onclick={() => servings--}
					>
						<Icon name="minus" size={18} />
					</button>
					<span class="servings"><Icon name="users" size={18} /> {servings}</span>
					<button
						class="icon-btn"
						aria-label="Viac porcií"
						disabled={servings >= 40}
						onclick={() => servings++}
					>
						<Icon name="plus" size={18} />
					</button>
				</div>
			</div>
			<ul>
				{#each recipe.lines as line, i (i)}
					{@const ingredient = catalog.ingredientsById.get(line.ingredientId)!}
					{@const home = hasPantry && isHome(line.ingredientId)}
					<li class:home>
						<span class="amount"
							>{formatAmount(line.amount === null ? null : line.amount * factor, line.unit)}</span
						>
						<span class="name" class:not-eaten={line.notEaten}>
							{ingredient.name}
							{#if line.notEaten}<small
									title="Použije sa pri varení, ale nezje sa – nepočíta sa do živín."
								>
									(nezje sa)</small
								>{/if}
							{#if ingredient.gluten !== 'free'}
								{@const alt = ingredient.gfAlternative
									? catalog.ingredientsById.get(ingredient.gfAlternative)
									: undefined}
								<span
									class="gluten {ingredient.gluten}"
									title={ingredient.gluten === 'contains'
										? `Obsahuje lepok${alt ? ` – nahraď: ${alt.name}` : ''}`
										: `Môže obsahovať lepok${ingredient.note ? ` – ${ingredient.note}` : ''}`}
								>
									<Icon name="wheat" size={14} stroke={2} />
									{#if alt}<span class="swap">→ {alt.name.split(' (')[0]}</span>{/if}
								</span>
							{/if}
							{#if line.note}<span class="note">{line.note}</span>{/if}
						</span>
						{#if home}<span class="home-dot" title="Máš doma"
								><Icon name="check" size={14} stroke={2.6} /></span
							>{/if}
					</li>
				{/each}
			</ul>
			<a class="units-link" href="/wiki/jednotky"
				><Icon name="spoon" size={16} /> Čo znamená PL, ČL, hrnček?</a
			>
		</section>

		<section class="steps">
			<h2>Postup</h2>
			<ol>
				{#each recipe.steps as step, i (i)}
					<li>
						<button
							class="step"
							class:done={doneSteps.includes(i)}
							onclick={() => toggleStep(i)}
							aria-pressed={doneSteps.includes(i)}
						>
							<span class="num">{i + 1}</span>
							<span class="text">{step}</span>
						</button>
					</li>
				{/each}
			</ol>
			<p class="muted tap-hint">Ťukni na krok, keď ho máš hotový.</p>

			{#if recipe.tips.length}
				<div class="tips">
					<h3><Icon name="sparkle" size={20} /> Tipy</h3>
					<ul>
						{#each recipe.tips as tip, i (i)}<li>{tip}</li>{/each}
					</ul>
				</div>
			{/if}

			{#if recipe.howto.length}
				<div class="howto">
					<h3>Ako na to</h3>
					<div class="howto-list">
						{#each recipe.howto as h (h.slug)}
							<a class="howto-link draw-host" href="/wiki/{h.slug}">
								<Icon name="book" size={18} />
								{h.title}
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	</div>

	{#if base.related.length}
		<section class="related-links">
			<h2>Súvisiace</h2>
			<div class="howto-list">
				{#each base.related as rel (rel.id)}
					<a class="howto-link draw-host" href="/recepty/{rel.id}">
						<Icon name="bowl" size={18} />
						{rel.title}
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if recipe.showNutrition}
		<section class="nutrition card">
			<div class="nut-head">
				<h2>Živiny na porciu</h2>
				<p class="muted">
					{formatNumber(recipe.perServing.kcal, 0)} kcal · % z denného cieľa{settings.current
						.weightKg
						? ` (bielkoviny pre ${settings.current.weightKg} kg)`
						: ''}. <a href="/wiki/o-receptiu">Odkiaľ sú čísla?</a>
				</p>
			</div>
			<div class="nut-grid">
				<NutrientBars
					values={scaleNutrients(recipe.perServing, 1)}
					{targets}
					keys={['kcal', 'protein', 'carbs', 'fat', 'fiber', 'salt']}
				/>
				<NutrientBars
					values={recipe.perServing}
					{targets}
					keys={['iron', 'calcium', 'zinc', 'ala', 'b12']}
				/>
			</div>
			{#if recipe.perServing.b12 < 0.5}
				<p class="b12-note">
					<Icon name="pill" size={18} /> B12 z jedla nezískaš,
					<a href="/wiki/b12">suplementuj ho</a>.
				</p>
			{/if}
		</section>
	{/if}

	{#if similar.length}
		<section class="similar">
			<h2>Podobné recepty</h2>
			<div class="grid">
				{#each similar as r, i (r.id)}<RecipeCard recipe={r} index={i} />{/each}
			</div>
		</section>
	{/if}
</article>

<style>
	.page {
		padding-top: 18px;
		overflow-x: clip;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--ink-2);
		text-decoration: none;
		font-weight: 600;
		margin-bottom: 8px;
	}
	.back:hover {
		color: var(--ink);
	}

	.hero {
		display: grid;
		gap: 18px;
		align-items: center;
	}
	.art {
		position: relative;
		width: min(100%, 380px);
		justify-self: center;
		padding: 6%;
	}
	.art :global(.plate) {
		position: relative;
	}
	.halo {
		position: absolute;
		inset: 0;
		border-radius: 46% 54% 52% 48% / 50% 44% 56% 50%;
		background: radial-gradient(
			circle at 35% 30%,
			color-mix(in srgb, var(--accent, var(--leaf-2)) 30%, transparent),
			color-mix(in srgb, var(--accent, var(--leaf-2)) 10%, transparent)
		);
		animation: spin 30s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.cuisine {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
		font-size: 0.85rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		text-decoration: none;
		margin-bottom: 8px;
	}
	.sw {
		width: 14px;
		height: 14px;
		border-radius: 45% 55% 50% 50%;
		background: var(--accent);
	}
	.lede {
		font-size: 1.12rem;
		color: var(--ink-2);
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
		margin: 18px 0;
	}
	.facts div {
		background: var(--card);
		border-radius: var(--radius-sm);
		padding: 10px 14px;
		border: 1px solid var(--line);
	}
	dt {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	dd {
		margin: 2px 0 0;
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 600;
	}
	dd small {
		font-family: var(--font-body);
		font-size: 0.78rem;
		color: var(--muted);
		font-weight: 500;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.variants {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 16px;
	}
	.v-label {
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		margin-right: 4px;
	}
	.variant-desc {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin: 10px 0 0;
		font-size: 0.92rem;
		color: var(--plum);
		animation: rise 0.3s var(--ease-out);
	}
	.ahead {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 14px 0 0;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--turmeric-soft);
		font-size: 0.92rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		margin-top: 18px;
	}
	.in-plan {
		font-size: 0.88rem;
		font-weight: 600;
	}
	.pantry-line {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 14px 0 0;
		font-size: 0.92rem;
		color: var(--ink-2);
	}

	.warnings {
		display: grid;
		gap: 8px;
		margin: 28px 0 0;
	}
	.warning {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 12px 16px;
		border-radius: var(--radius-sm);
		font-size: 0.95rem;
	}
	.warning.danger {
		background: var(--tomato-soft);
		color: color-mix(in srgb, var(--tomato) 70%, var(--ink));
	}
	.warning.warn {
		background: var(--turmeric-soft);
		color: color-mix(in srgb, var(--turmeric) 45%, var(--ink));
	}
	.warning.info {
		background: var(--sky-soft);
		color: color-mix(in srgb, var(--sky) 60%, var(--ink));
	}
	.warning :global(.icon) {
		margin-top: 2px;
	}

	.main {
		display: grid;
		gap: 28px;
		margin-top: 28px;
	}
	.ingredients {
		padding: 22px;
		align-self: start;
	}
	.ing-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
	}
	.ing-head h2 {
		margin: 0;
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.stepper .icon-btn {
		width: 32px;
		height: 32px;
	}
	.stepper .icon-btn:disabled {
		opacity: 0.4;
	}
	.servings {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 52px;
		justify-content: center;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.ingredients ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.ingredients li {
		display: grid;
		grid-template-columns: 5.2em 1fr auto;
		gap: 10px;
		padding: 9px 0;
		border-bottom: 1px dashed var(--line);
		align-items: baseline;
	}
	.ingredients li:last-child {
		border-bottom: 0;
	}
	.amount {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--leaf);
		white-space: nowrap;
	}
	.note {
		display: block;
		font-size: 0.82rem;
		color: var(--muted);
	}
	.gluten {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 0.75rem;
		font-weight: 700;
		vertical-align: middle;
		padding: 1px 6px;
		border-radius: 6px;
		margin-left: 4px;
	}
	.gluten.contains {
		background: var(--tomato-soft);
		color: var(--tomato);
	}
	.gluten.risk {
		background: var(--turmeric-soft);
		color: color-mix(in srgb, var(--turmeric) 60%, var(--ink));
	}
	.home .name {
		color: var(--ink-2);
	}
	.home-dot {
		display: inline-grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--leaf-soft);
		color: var(--leaf);
	}
	.units-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 14px;
		font-size: 0.88rem;
		font-weight: 600;
	}

	.steps ol {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 10px;
	}
	.step {
		display: grid;
		grid-template-columns: 44px 1fr;
		gap: 14px;
		width: 100%;
		text-align: left;
		background: transparent;
		border: 0;
		padding: 12px 12px 12px 0;
		border-radius: var(--radius-sm);
		transition: background 0.2s;
	}
	.step:hover {
		background: color-mix(in srgb, var(--card) 70%, transparent);
	}
	.num {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 46% 54% 50% 50%;
		background: var(--turmeric-soft);
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.3rem;
		color: color-mix(in srgb, var(--turmeric) 50%, var(--ink));
		transition:
			background 0.3s,
			transform 0.4s var(--ease-spring);
	}
	.text {
		font-size: 1.04rem;
		padding-top: 8px;
		transition:
			color 0.3s,
			opacity 0.3s;
	}
	.done .num {
		background: var(--leaf);
		color: var(--paper);
		transform: rotate(-8deg) scale(0.92);
	}
	.done .text {
		opacity: 0.5;
		text-decoration: line-through;
		text-decoration-color: var(--leaf-2);
	}
	.tap-hint {
		font-size: 0.82rem;
		margin: 6px 0 0 58px;
	}
	.tips,
	.howto {
		margin-top: 26px;
	}
	.tips h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--plum);
	}
	.tips ul {
		padding-left: 1.2em;
		margin: 0;
	}
	.tips li {
		margin: 6px 0;
	}
	.howto-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.howto-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--leaf-soft);
		color: var(--leaf);
		font-weight: 600;
		font-size: 0.9rem;
		text-decoration: none;
		transition: transform 0.25s var(--ease-spring);
	}
	.howto-link:hover {
		transform: translateY(-2px);
	}

	.nutrition {
		margin-top: 36px;
		padding: 22px;
	}
	.nut-head p {
		margin: 0 0 18px;
		font-size: 0.9rem;
	}
	.nut-grid {
		display: grid;
		gap: 12px 40px;
	}
	.b12-note {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 18px 0 0;
		font-size: 0.9rem;
		color: var(--sky);
	}

	.similar,
	.related-links {
		margin-top: 48px;
	}
	.yields {
		font-size: 1rem;
	}
	.not-eaten small {
		color: var(--muted);
		font-size: 0.78rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}

	@media (min-width: 720px) {
		.facts {
			grid-template-columns: repeat(4, 1fr);
		}
		.nut-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (min-width: 900px) {
		.hero {
			grid-template-columns: minmax(300px, 0.8fr) 1.2fr;
			gap: 40px;
		}
		.main {
			grid-template-columns: minmax(320px, 0.85fr) 1.15fr;
			gap: 40px;
		}
		.ingredients {
			position: sticky;
			top: 84px;
		}
	}
</style>

<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { courseDone, history, ui } from '$lib/state.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const course = $derived(data.course);

	const cooked = $derived(
		ui.loaded ? new Set(history.current.map((h) => h.recipeId)) : new Set<string>()
	);
	const isDone = (recipeId: string) =>
		ui.loaded && (cooked.has(recipeId) || courseDone.current[recipeId] === true);
	const doneCount = $derived(course.lessons.filter((l) => isDone(l.recipeId)).length);
	/** The first lesson not done yet: where to carry on. */
	const next = $derived(course.lessons.find((l) => !isDone(l.recipeId)));

	function toggle(recipeId: string) {
		const { [recipeId]: was, ...rest } = courseDone.current;
		courseDone.current = was ? rest : { ...rest, [recipeId]: true };
	}
</script>

<Seo
	title="Kurz varenia pre začiatočníkov"
	description="14 vegánskych receptov v poradí, v ktorom sa naučíš variť: od prvej praženice po kysnuté cesto. Každý pridá jednu techniku."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Kurz varenia</p>
		<h1>Naučiť sa variť za {course.lessons.length} jedál</h1>
		<p class="lede">
			Recepty v poradí, v ktorom na seba nadväzujú. Každý ťa naučí jednu vec navyše a pri každom sú
			návody, ktoré ti ju vysvetlia. Lekcia sa odškrtne sama, keď recept označíš ako uvarený, alebo
			si ju odškrtni ručne.
		</p>
	</header>

	<section class="progress card" aria-live="polite">
		<div class="bar" style:--w="{(doneCount / course.lessons.length) * 100}%"></div>
		<p>
			<strong>{doneCount} z {course.lessons.length}</strong>
			{#if next}
				· ďalej: <a href="#lekcia-{next.recipeId}">{next.title}</a>
			{:else}
				· hotovo, vieš variť. Skús <a href="/kuchyne">kuchyne sveta</a>.
			{/if}
		</p>
	</section>

	<section class="intro">
		<h2>Než začneš</h2>
		<div class="links">
			{#each course.intro as g (g.slug)}
				<a class="chip" href="/wiki/{g.slug}"><Icon name="book" size={14} /> {g.title}</a>
			{/each}
		</div>
	</section>

	<ol class="lessons">
		{#each course.lessons as lesson, i (lesson.recipeId)}
			{@const done = isDone(lesson.recipeId)}
			<li class="lesson card" class:done id="lekcia-{lesson.recipeId}">
				<div class="num" aria-hidden="true">
					{#if done}<Icon name="check" size={20} stroke={2.4} />{:else}{i + 1}{/if}
				</div>
				<div class="body">
					<h2>{lesson.title}</h2>
					<p class="learn">{lesson.learn}</p>
					<a class="recipe" href="/recepty/{lesson.recipeId}">
						<Icon name="bowl" size={18} />
						<span>{lesson.recipeTitle}</span>
						<small><Icon name="clock" size={14} /> {lesson.time} min</small>
					</a>
					{#if lesson.guides.length}
						<div class="links">
							{#each lesson.guides as g (g.slug)}
								<a class="chip" href="/wiki/{g.slug}"><Icon name="book" size={14} /> {g.title}</a>
							{/each}
						</div>
					{/if}
					<label class="check">
						<input
							type="checkbox"
							checked={done}
							disabled={cooked.has(lesson.recipeId)}
							onchange={() => toggle(lesson.recipeId)}
						/>
						{cooked.has(lesson.recipeId) ? 'Uvarené' : 'Mám to za sebou'}
					</label>
				</div>
			</li>
		{/each}
	</ol>
</div>

<style>
	.progress {
		position: relative;
		overflow: hidden;
		padding: 14px 18px;
		margin: var(--sp-4) 0;
	}
	.progress p {
		position: relative;
		margin: 0;
	}
	.bar {
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--w);
		background: var(--leaf-soft);
		transition: width 0.6s var(--ease-out);
	}
	.intro h2 {
		font-size: var(--fs-lg);
		margin: 0 0 8px;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.links .chip {
		max-width: 100%;
		white-space: normal;
		text-align: left;
	}
	.lessons {
		list-style: none;
		padding: 0;
		margin: 24px 0 0;
		display: grid;
		gap: 14px;
	}
	.lesson {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr);
		gap: 14px;
		padding: 16px;
	}
	.num {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--sunk);
		font-weight: 700;
	}
	.done .num {
		background: var(--leaf);
		color: var(--card);
	}
	.lesson h2 {
		font-size: var(--fs-lg);
		margin: 6px 0 4px;
	}
	.learn {
		margin: 0 0 10px;
	}
	/* Icon beside the title, the time under it: a long title wraps on its own line. */
	.recipe {
		display: inline-grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
		gap: 2px 8px;
		margin-bottom: 10px;
		font-weight: 650;
		text-decoration: none;
	}
	.recipe > :global(svg) {
		margin-top: 3px;
	}
	.recipe span {
		text-decoration: underline;
		text-decoration-thickness: 1.5px;
		text-underline-offset: 3px;
	}
	.recipe small {
		grid-column: 2;
		display: inline-flex;
		align-items: center;
		gap: 3px;
		color: var(--muted);
		font-weight: 400;
	}
	.check {
		margin-top: var(--sp-1);
		font-size: var(--fs-md);
	}
	@media (prefers-reduced-motion: reduce) {
		.bar {
			transition: none;
		}
	}
</style>

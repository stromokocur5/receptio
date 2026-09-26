<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { hashString, blobPath, seededRandom } from '$lib/art';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import { pluralRecipes } from '$lib/labels';

	const catalog = useCatalog();

	const regions = $derived.by(() => {
		const byRegion = new Map<string, typeof catalog.cuisines>();
		for (const c of catalog.cuisines)
			byRegion.set(c.region, [...(byRegion.get(c.region) ?? []), c]);
		return [...byRegion];
	});
	const counts = $derived(
		new Map(
			catalog.cuisines.map((c) => [c.id, catalog.recipes.filter((r) => r.cuisine === c.id).length])
		)
	);

	function blob(id: string) {
		return blobPath(50, 50, 38, seededRandom(hashString(id)), 0.2, 7);
	}
</script>

<Seo
	title="Kuchyne sveta"
	description="Rastlinné jedlá z kuchýň celého sveta a na čo si v nich dať pozor."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Kuchyne sveta</p>
		<h1>Kde je rastlinné jedlo doma</h1>
		<p class="lede">
			Mnohé kuchyne sú prirodzene vegánske a bezlepkové, lebo stoja na ryži, kukurici, strukovinách
			a kokose. Pri každej je napísané, na čo si dať pozor.
		</p>
	</header>

	{#each regions as [region, cuisines] (region)}
		<section class="region">
			<h2>{region}</h2>
			<div class="grid">
				{#each cuisines as c, i (c.id)}
					<a
						class="cuisine card draw-host rise"
						href="/kuchyne/{c.id}"
						style:--c={c.color}
						style:--i={i}
					>
						<svg class="blob" viewBox="0 0 100 100" aria-hidden="true">
							<path d={blob(c.id)} fill={c.color} />
						</svg>
						<div class="text">
							<h3>{c.name}</h3>
							<p>{c.tagline}</p>
							<span class="meta">
								{counts.get(c.id)
									? `${counts.get(c.id)} ${pluralRecipes(counts.get(c.id)!)}`
									: 'recepty čoskoro'}
								<Icon name="arrow-right" size={16} />
							</span>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.page {
		padding-top: 28px;
	}
	.lede {
		max-width: 40em;
		color: var(--ink-2);
		font-size: 1.08rem;
	}
	.region {
		margin-top: 36px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 16px;
	}
	.cuisine {
		position: relative;
		display: flex;
		gap: 14px;
		padding: 18px;
		overflow: hidden;
		color: inherit;
		text-decoration: none;
		transition:
			transform 0.3s var(--ease-spring),
			box-shadow 0.3s;
		animation-delay: calc(var(--i) * 60ms);
	}
	.cuisine:hover {
		transform: translateY(-4px);
		box-shadow: var(--shadow-lift);
	}
	.blob {
		flex: none;
		width: 62px;
		height: 62px;
		transition: transform 0.8s var(--ease-spring);
	}
	.cuisine:hover .blob {
		transform: rotate(40deg) scale(1.1);
	}
	h3 {
		margin: 2px 0 4px;
	}
	p {
		margin: 0 0 10px;
		font-size: 0.92rem;
		color: var(--ink-2);
	}
	.meta {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.82rem;
		font-weight: 700;
		color: color-mix(in srgb, var(--c) 60%, var(--ink));
	}
</style>

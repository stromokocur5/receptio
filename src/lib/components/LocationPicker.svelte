<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { frostDates, seasonDelayWeeks, type GrowLocation } from '$lib/garden';
	import { settings } from '$lib/state.svelte';
	import { elevationAt, searchPlaces } from '$lib/weather';

	const QUICK: GrowLocation[] = [
		{ name: 'Bratislava', lat: 48.15, lon: 17.11, elevation: 140 },
		{ name: 'Košice', lat: 48.72, lon: 21.26, elevation: 210 },
		{ name: 'Banská Bystrica', lat: 48.74, lon: 19.15, elevation: 360 },
		{ name: 'Žilina', lat: 49.22, lon: 18.74, elevation: 350 },
		{ name: 'Poprad', lat: 49.06, lon: 20.3, elevation: 672 }
	];

	let editing = $state(false);
	let query = $state('');
	let results = $state<GrowLocation[]>([]);
	let error = $state('');
	let busy = $state(false);

	const location = $derived(settings.current.location);
	const dayMonth = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'long' });
	const frost = $derived(
		location ? frostDates(location.elevation, new Date().getFullYear()) : null
	);
	const delay = $derived(location ? seasonDelayWeeks(location.elevation) : 0);

	function choose(loc: GrowLocation) {
		settings.current = { ...settings.current, location: loc };
		editing = false;
		results = [];
		query = '';
		error = '';
	}

	async function search(event: SubmitEvent) {
		event.preventDefault();
		if (query.trim().length < 2) return;
		busy = true;
		error = '';
		try {
			results = await searchPlaces(query.trim());
			if (!results.length) error = 'Takú obec nepoznám – skús iný názov alebo blízke mesto.';
		} catch {
			error = 'Vyhľadávanie teraz nefunguje. Vyber mesto nižšie.';
		} finally {
			busy = false;
		}
	}

	function locate() {
		if (!('geolocation' in navigator)) {
			error = 'Tento prehliadač polohu nevie.';
			return;
		}
		busy = true;
		error = '';
		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				// About a kilometre is plenty for weather; no need to keep the exact spot.
				const lat = Math.round(pos.coords.latitude * 100) / 100;
				const lon = Math.round(pos.coords.longitude * 100) / 100;
				try {
					choose({ name: 'Moja poloha', lat, lon, elevation: await elevationAt(lat, lon) });
				} catch {
					error = 'Nepodarilo sa zistiť nadmorskú výšku. Vyhľadaj obec.';
				} finally {
					busy = false;
				}
			},
			() => {
				busy = false;
				error = 'Polohu sa nepodarilo zistiť. Vyhľadaj obec.';
			},
			{ timeout: 10_000, maximumAge: 24 * 60 * 60 * 1000 }
		);
	}
</script>

<section class="card loc">
	<h2><Icon name="globe" size={22} /> Kde pestuješ</h2>
	{#if location && !editing}
		<p>
			<strong>{location.name}</strong>, {location.elevation} m n. m.
			<button class="linkish" onclick={() => (editing = true)}>Zmeniť</button>
		</p>
		{#if frost}
			<p class="muted">
				Posledný jarný mráz býva okolo <strong>{dayMonth.format(frost.lastSpring)}</strong>, prvý
				jesenný okolo <strong>{dayMonth.format(frost.firstAutumn)}</strong>.
				{delay >= 2
					? `Termíny v kalendároch sú posunuté o ${delay} ${delay >= 5 ? 'týždňov' : 'týždne'} oproti nížinám.`
					: 'Termíny platia tak, ako sú napísané.'}
			</p>
		{/if}
	{:else}
		<p class="muted">
			Na Orave príde jar o mesiac neskôr ako v Komárne. Nastav miesto a kalendáre sa posunú, plus
			uvidíš upozornenia na mráz a sucho. Poloha ostáva len v tvojom prehliadači, počasie dodáva
			Open-Meteo.
		</p>
		<form class="search" onsubmit={search}>
			<input
				bind:value={query}
				placeholder="Obec alebo mesto"
				aria-label="Obec alebo mesto"
				autocomplete="address-level2"
			/>
			<button class="btn leaf small" type="submit" disabled={busy}>
				<Icon name="search" size={16} /> Hľadať
			</button>
			<button class="btn ghost small" type="button" onclick={locate} disabled={busy}>
				Podľa polohy
			</button>
		</form>
		{#if results.length}
			<ul class="results">
				{#each results as r (`${r.lat},${r.lon}`)}
					<li>
						<button class="chip" onclick={() => choose(r)}>{r.name} · {r.elevation} m</button>
					</li>
				{/each}
			</ul>
		{/if}
		<div class="chips">
			{#each QUICK as q (q.name)}
				<button class="chip" onclick={() => choose(q)}>{q.name}</button>
			{/each}
			{#if location}
				<button class="chip" onclick={() => (editing = false)}>Nechať {location.name}</button>
			{/if}
		</div>
		{#if error}<p class="err" role="alert">{error}</p>{/if}
	{/if}
</section>

<style>
	.loc {
		padding: 20px;
		margin-top: 24px;
	}
	.loc h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 8px;
	}
	.search {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 10px;
	}
	.search input {
		flex: 1 1 200px;
		min-width: 0;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 8px 12px;
		font: inherit;
	}
	.results {
		list-style: none;
		padding: 0;
		margin: 0 0 10px;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.err {
		color: var(--tomato);
	}
	.linkish {
		border: 0;
		padding: 0;
		background: none;
		color: var(--leaf);
		font: inherit;
		font-weight: 650;
		text-decoration: underline;
		cursor: pointer;
		margin-left: 6px;
	}
</style>

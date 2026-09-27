<script lang="ts">
	import { onMount } from 'svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import type { GrowLocation } from '$lib/garden';
	import { FROST_SYNC_TAG, FROST_WATCH_KEY, kvSet } from '$lib/kv';
	import { fetchForecast, weatherAlerts, type Forecast, type WeatherAlert } from '$lib/weather';

	let {
		location,
		tender,
		plantingTender,
		compact = false
	}: {
		location: GrowLocation;
		/** Frost-sensitive crops are outside now. */
		tender: boolean;
		/** Frost-sensitive crops are due to go out this month. */
		plantingTender: boolean;
		compact?: boolean;
	} = $props();

	let forecast = $state<Forecast | null>(null);
	let failed = $state(false);
	let watchState = $state<'off' | 'on' | 'unsupported' | 'denied'>('off');
	const month = new Date().getMonth() + 1;

	const alerts = $derived(
		forecast ? weatherAlerts(forecast, { month, tender, plantingTender }) : []
	);
	const ICONS: Record<WeatherAlert['kind'], IconName> = {
		frost: 'snowflake',
		heat: 'sun',
		dry: 'drop',
		rain: 'drop',
		plant: 'sprout'
	};
	const day = new Intl.DateTimeFormat('sk-SK', { weekday: 'short' });

	onMount(() => {
		fetchForecast(location)
			.then((f) => (forecast = f))
			.catch(() => (failed = true));
		try {
			if (localStorage.getItem('receptio:frost-watch') === '1') watchState = 'on';
		} catch {
			// Off.
		}
	});

	$effect(() => {
		// With permission, a frost night also pops up as a notification – once per day.
		const frost = alerts.find((a) => a.kind === 'frost');
		if (!frost || !('Notification' in window) || Notification.permission !== 'granted') return;
		const key = `receptio:frost-shown:${new Date().toISOString().slice(0, 10)}`;
		try {
			if (localStorage.getItem(key)) return;
			localStorage.setItem(key, '1');
		} catch {
			return;
		}
		void navigator.serviceWorker?.getRegistration().then((reg) =>
			reg?.showNotification(frost.title, {
				body: frost.text,
				tag: 'frost',
				icon: '/icon-192.png'
			})
		);
	});

	/** Background frost checks: Chrome/Edge wake an installed app about twice a day. */
	async function watchFrost() {
		if (!('Notification' in window)) {
			watchState = 'unsupported';
			return;
		}
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') {
			watchState = 'denied';
			return;
		}
		await kvSet(FROST_WATCH_KEY, { lat: location.lat, lon: location.lon, name: location.name });
		try {
			localStorage.setItem('receptio:frost-watch', '1');
		} catch {
			// Still works for this session.
		}
		const reg = (await navigator.serviceWorker?.ready) as
			| (ServiceWorkerRegistration & {
					periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void> };
			  })
			| undefined;
		try {
			await reg?.periodicSync?.register(FROST_SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
			watchState = reg?.periodicSync ? 'on' : 'unsupported';
		} catch {
			watchState = 'unsupported';
		}
	}
</script>

<section class="weather" class:compact>
	{#if forecast}
		{#if alerts.length}
			<ul class="alerts">
				{#each alerts as a (a.kind)}
					<li class="alert {a.level}">
						<Icon name={ICONS[a.kind]} size={22} />
						<div>
							<strong>{a.title}</strong>
							{#if !compact}<p>{a.text}</p>{/if}
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="calm"><Icon name="check" size={18} /> Najbližšie dni v záhradke nič neohrozuje.</p>
		{/if}
		{#if !compact}
			<ol class="days" aria-label="Predpoveď na týždeň">
				{#each forecast.dates.slice(forecast.today) as d, i (d)}
					{@const j = forecast.today + i}
					<li class:frost={forecast.min[j] <= 1}>
						<span>{i === 0 ? 'dnes' : day.format(new Date(d))}</span>
						<strong>{Math.round(forecast.max[j])}°</strong>
						<small>{Math.round(forecast.min[j])}°</small>
						{#if forecast.rain[j] >= 1}<small class="rain">{Math.round(forecast.rain[j])} mm</small
							>{/if}
					</li>
				{/each}
			</ol>
			<p class="watch small">
				{#if watchState === 'on'}
					<Icon name="bell" size={16} /> Na mráz ťa upozorním, aj keď Receptio nebudeš mať otvorené.
				{:else if watchState === 'unsupported'}
					<Icon name="info" size={16} /> Tento prehliadač nevie kontrolovať počasie na pozadí – upozornenie
					uvidíš pri otvorení Receptia. Najlepšie to funguje v Chrome s appkou pridanou na plochu.
				{:else if watchState === 'denied'}
					<Icon name="info" size={16} /> Notifikácie sú zakázané – povoľ ich v nastaveniach prehliadača.
				{:else}
					<button class="linkish" onclick={watchFrost}>Upozorniť ma na mráz notifikáciou</button>
				{/if}
			</p>
			<p class="muted small">Počasie: Open-Meteo.com</p>
		{/if}
	{:else if failed}
		<p class="muted small">Počasie sa teraz nepodarilo načítať.</p>
	{/if}
</section>

<style>
	.weather {
		margin-top: 12px;
	}
	.alerts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.alert {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 10px;
		align-items: start;
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: var(--sky-soft);
	}
	.alert.warn {
		background: var(--turmeric-soft);
	}
	.alert.danger {
		background: var(--tomato-soft);
	}
	.alert p {
		margin: 4px 0 0;
		font-size: 0.92rem;
	}
	.calm {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--leaf);
	}
	.days {
		list-style: none;
		padding: 0;
		margin: 12px 0 0;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 4px;
		text-align: center;
		font-size: 0.8rem;
	}
	.days li {
		display: grid;
		gap: 1px;
		padding: 6px 2px;
		border-radius: 10px;
		background: var(--paper-2);
	}
	.days li.frost {
		background: var(--sky-soft);
	}
	.days small {
		color: var(--muted);
	}
	.days .rain {
		color: var(--sky);
	}
	.watch {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 10px;
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
	}
	.small {
		font-size: 0.85rem;
	}
</style>

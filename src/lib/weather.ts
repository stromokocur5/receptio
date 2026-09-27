/**
 * Weather from Open-Meteo (free, no key, no account). Only coordinates leave the browser.
 */
import type { GrowLocation } from './garden';

export interface Forecast {
	/** ISO dates, the last few days first (past_days), then the coming week. */
	dates: string[];
	min: number[];
	max: number[];
	rain: number[];
	/** Index of today in the arrays. */
	today: number;
	fetchedAt: number;
}

const PAST_DAYS = 3;
const CACHE_KEY = 'receptio:forecast';
const CACHE_MS = 3 * 60 * 60 * 1000;

export async function fetchForecast(
	loc: GrowLocation,
	fetcher: typeof fetch = fetch
): Promise<Forecast> {
	try {
		const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
		if (
			cached &&
			cached.lat === loc.lat &&
			cached.lon === loc.lon &&
			Date.now() - cached.forecast.fetchedAt < CACHE_MS
		) {
			return cached.forecast as Forecast;
		}
	} catch {
		// Fetch fresh.
	}
	const params = new URLSearchParams({
		latitude: String(loc.lat),
		longitude: String(loc.lon),
		daily: 'temperature_2m_min,temperature_2m_max,precipitation_sum',
		timezone: 'Europe/Bratislava',
		past_days: String(PAST_DAYS),
		forecast_days: '7'
	});
	const res = await fetcher(`https://api.open-meteo.com/v1/forecast?${params}`);
	if (!res.ok) throw new Error(`forecast: ${res.status}`);
	const body = (await res.json()) as {
		daily: {
			time: string[];
			temperature_2m_min: number[];
			temperature_2m_max: number[];
			precipitation_sum: number[];
		};
	};
	const forecast: Forecast = {
		dates: body.daily.time,
		min: body.daily.temperature_2m_min,
		max: body.daily.temperature_2m_max,
		rain: body.daily.precipitation_sum.map((r) => r ?? 0),
		today: PAST_DAYS,
		fetchedAt: Date.now()
	};
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({ lat: loc.lat, lon: loc.lon, forecast }));
	} catch {
		// Works without the cache.
	}
	return forecast;
}

export interface WeatherAlert {
	kind: 'frost' | 'heat' | 'dry' | 'rain' | 'plant';
	level: 'danger' | 'warn' | 'info';
	title: string;
	text: string;
}

const dayName = new Intl.DateTimeFormat('sk-SK', { weekday: 'long' });

/**
 * Turns the forecast into garden advice. `tender` says whether frost-sensitive crops are outside
 * this month; `plantingTender` whether they're due to go out.
 */
export function weatherAlerts(
	f: Forecast,
	opts: { month: number; tender: boolean; plantingTender: boolean }
): WeatherAlert[] {
	const alerts: WeatherAlert[] = [];
	const next = (n: number) =>
		Array.from({ length: n }, (_, i) => f.today + i).filter((i) => i < f.dates.length);
	const coming3 = next(3);
	const week = next(7);
	const label = (i: number) =>
		i === f.today ? 'dnes' : i === f.today + 1 ? 'zajtra' : dayName.format(new Date(f.dates[i]));

	const frostDay = coming3.find((i) => f.min[i] <= 1);
	if (frostDay !== undefined && opts.month >= 3 && opts.month <= 10) {
		alerts.push({
			kind: 'frost',
			level: opts.tender ? 'danger' : 'warn',
			title: `Mráz ${label(frostDay)} v noci (${Math.round(f.min[frostDay])} °C)`,
			text: opts.tender
				? 'Prikry priesady a mladé rastliny netkanou textíliou, rastliny v nádobách daj k stene alebo dnu. Paradajky, papriky, cukety a bazalka mráz neprežijú.'
				: 'Mladé výsevy prikry netkanou textíliou alebo starou záclonou.'
		});
	}

	const heatDay = coming3.find((i) => f.max[i] >= 32);
	if (heatDay !== undefined) {
		alerts.push({
			kind: 'heat',
			level: 'warn',
			title: `Horúčava ${label(heatDay)} (${Math.round(f.max[heatDay])} °C)`,
			text: 'Zalievaj skoro ráno ku koreňom, nádoby presuň do tieňa a záhon namulčuj. Šalát a špenát zatieni.'
		});
	}

	const rainPast = f.rain.slice(0, f.today).reduce((a, b) => a + b, 0);
	const rainSoon = coming3.reduce((a, i) => a + f.rain[i], 0);
	const warm = coming3.some((i) => f.max[i] >= 20);
	if (rainPast + rainSoon < 2 && warm && opts.month >= 4 && opts.month <= 9) {
		alerts.push({
			kind: 'dry',
			level: 'info',
			title: 'Sucho – treba zalievať',
			text: `Posledné dni ani najbližšie ${coming3.length} dni takmer nepršalo. Zalej poriadne (10–20 l na m²) radšej raz za pár dní než trochu každý deň.`
		});
	}

	const bigRain = coming3.find((i) => f.rain[i] >= 15);
	if (bigRain !== undefined) {
		alerts.push({
			kind: 'rain',
			level: 'info',
			title: `Výdatný dážď ${label(bigRain)} (${Math.round(f.rain[bigRain])} mm)`,
			text: 'Zalievať netreba. Po daždi večer pozbieraj slimáky a skontroluj, či nádoby odtekajú.'
		});
	}

	if (opts.plantingTender && frostDay === undefined && week.every((i) => f.min[i] >= 6)) {
		alerts.push({
			kind: 'plant',
			level: 'info',
			title: 'Celý týždeň bez mrazu',
			text: 'Dobrý čas vysadiť teplomilné priesady von – paradajky, papriky, cukety, bazalku.'
		});
	}
	return alerts;
}

/** Place search through Open-Meteo's geocoder, Slovak places first. */
export async function searchPlaces(
	query: string,
	fetcher: typeof fetch = fetch
): Promise<GrowLocation[]> {
	const params = new URLSearchParams({ name: query, count: '6', language: 'sk', format: 'json' });
	const res = await fetcher(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
	if (!res.ok) throw new Error(`geocoding: ${res.status}`);
	const body = (await res.json()) as {
		results?: {
			name: string;
			latitude: number;
			longitude: number;
			elevation?: number;
			admin1?: string;
			country_code?: string;
		}[];
	};
	return (body.results ?? [])
		.sort((a, b) => Number(b.country_code === 'SK') - Number(a.country_code === 'SK'))
		.map((r) => ({
			name: r.admin1 ? `${r.name} (${r.admin1})` : r.name,
			lat: r.latitude,
			lon: r.longitude,
			elevation: Math.round(r.elevation ?? 200)
		}));
}

export async function elevationAt(
	lat: number,
	lon: number,
	fetcher: typeof fetch = fetch
): Promise<number> {
	const res = await fetcher(
		`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`
	);
	if (!res.ok) throw new Error(`elevation: ${res.status}`);
	const body = (await res.json()) as { elevation: number[] };
	return Math.round(body.elevation[0]);
}

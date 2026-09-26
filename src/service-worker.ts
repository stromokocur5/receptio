/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL_CACHE = `shell-${version}`;
/** Pages and data visited while online, so they open offline too. */
const PAGES_CACHE = `pages-${version}`;

/** Pages that must work offline even if never visited: the shopping list above all. */
const OFFLINE_PAGES = ['/', '/plan', '/spajza', '/recepty'];
const offlinePages = OFFLINE_PAGES.flatMap((p) => [
	p,
	p === '/' ? '/__data.json' : `${p}/__data.json`
]);

const shell = [...build, ...files.filter((f) => !f.endsWith('.png') || f.includes('icon'))];
const immutable = new Set(shell);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			await (await caches.open(SHELL_CACHE)).addAll(shell);
			const pages = await caches.open(PAGES_CACHE);
			await pages.addAll(offlinePages.filter((p) => prerendered.includes(p)));
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Old pages reference old hashed JS, so they go together with the old shell.
			for (const key of await caches.keys()) {
				if (key !== SHELL_CACHE && key !== PAGES_CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

/** Every page embeds the whole catalog (~0.4 MB), so keep only the most recent visits. */
const MAX_CACHED_PAGES = 60;
/** On a weak signal in a shop, fall back to the saved copy instead of waiting. */
const SLOW_NETWORK_MS = 4000;

async function trimPages(cache: Cache) {
	const keys = await cache.keys();
	const removable = keys.filter((k) => !offlinePages.includes(new URL(k.url).pathname));
	for (const key of removable.slice(0, Math.max(0, keys.length - MAX_CACHED_PAGES))) {
		await cache.delete(key);
	}
}

async function networkFirst(request: Request, url: URL): Promise<Response> {
	const cache = await caches.open(PAGES_CACHE);
	// SvelteKit adds ?x-sveltekit-invalidated=… to data requests; prerendered data ignores it.
	const key = url.pathname;
	const cached = await cache.match(key);
	const network = fetch(request).then(async (response) => {
		if (response.ok && response.type === 'basic') {
			await cache.delete(key);
			await cache.put(key, response.clone());
			await trimPages(cache);
		}
		return response;
	});
	try {
		if (!cached) return await network;
		const timeout = new Promise<Response>((resolve) =>
			setTimeout(() => resolve(cached), SLOW_NETWORK_MS)
		);
		return await Promise.race([network, timeout]);
	} catch (err) {
		if (cached) return cached;
		if (request.mode === 'navigate') {
			return new Response(
				'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Offline · Receptio</title><body style="font-family:system-ui;padding:2rem;background:#f6efe2;color:#1d2e24"><h1>Si offline</h1><p>Táto stránka ešte nie je uložená. Plán, nákupný zoznam, špajza a už otvorené recepty fungujú aj bez internetu.</p><p><a href="/plan">Otvoriť nákupný zoznam</a></p>',
				{ status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } }
			);
		}
		throw err;
	}
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	// Private or live data: never serve it from the offline cache.
	if (
		url.origin !== sw.location.origin ||
		url.pathname.startsWith('/api/') ||
		url.pathname.startsWith('/admin')
	) {
		return;
	}
	// Link-preview images are for other sites, not worth caching.
	if (url.pathname.startsWith('/og/')) return;

	if (immutable.has(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((cached) => cached ?? fetch(request)));
		return;
	}
	event.respondWith(networkFirst(request, url));
});

// Tapping a timer notification brings the cooking tab back.
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(
		(async () => {
			const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const client = windows[0];
			if (client) await client.focus();
			else await sw.clients.openWindow('/');
		})()
	);
});

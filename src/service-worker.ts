/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL_CACHE = `shell-${version}`;
/** Pages visited while online, so they open offline too. */
const PAGES_CACHE = `pages-${version}`;
const MAX_PAGES = 60;

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(SHELL_CACHE)
			.then((cache) => cache.addAll([...build, ...files, ...prerendered]))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((k) => k !== SHELL_CACHE && k !== PAGES_CACHE).map((k) => caches.delete(k))
				)
			)
			.then(() => sw.clients.claim())
	);
});

async function trim(cache: Cache) {
	const keys = await cache.keys();
	await Promise.all(
		keys.slice(0, Math.max(0, keys.length - MAX_PAGES)).map((k) => cache.delete(k))
	);
}

/** Network first, so a deploy shows up at once; the cache only when offline. */
sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (event.request.method !== 'GET' || url.origin !== sw.location.origin) return;
	if (url.pathname.startsWith('/api/')) return;
	event.respondWith(
		(async () => {
			try {
				const response = await fetch(event.request);
				if (response.ok && response.type === 'basic') {
					const cache = await caches.open(PAGES_CACHE);
					await cache.put(event.request, response.clone());
					await trim(cache);
				}
				return response;
			} catch (err) {
				const cached = await caches.match(event.request);
				if (cached) return cached;
				throw err;
			}
		})()
	);
});

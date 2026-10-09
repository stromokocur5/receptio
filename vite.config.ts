/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

/** CSP hash of the inline theme script in app.html, so it can run without 'unsafe-inline'. */
function appHtmlScriptHashes(): `sha256-${string}`[] {
	const html = readFileSync('src/app.html', 'utf8');
	return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
		([, body]) => `sha256-${createHash('sha256').update(body).digest('base64')}` as const
	);
}

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// The deployed worker is /worker.js (adds the reminder cron), see wrangler.adapter.jsonc.
			adapter: adapter({ config: 'wrangler.adapter.jsonc' }),
			// Tabs stay open for days (shopping list, cook mode); notice deploys so they reload onto new code.
			version: { pollInterval: 5 * 60_000 },
			// Prerendered pages get this as a <meta> tag; header-only directives (frame-ancestors)
			// are set in /_headers and src/hooks.server.ts.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					// Turnstile (bot check on the suggestion and feedback forms) runs from challenges.cloudflare.com.
					'script-src': ['self', 'https://challenges.cloudflare.com', ...appHtmlScriptHashes()],
					'frame-src': ['https://challenges.cloudflare.com'],
					// Svelte renders style="" attributes (plate colors, animation delays).
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:'],
					'font-src': ['self'],
					// Weather, place search and elevation for the garden come from Open-Meteo (no key, no cookies).
					// The live rooms (households, shopping together) are WebSockets to this site; older
					// Safari doesn't count wss: as 'self', so the hosts are named too.
					'connect-src': [
						'self',
						'wss://receptio.kohut.xyz',
						'wss://*.gabrielkohut3.workers.dev',
						'https://api.open-meteo.com',
						'https://geocoding-api.open-meteo.com'
					],
					'manifest-src': ['self'],
					'worker-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self']
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});

// Worker entry: SvelteKit's generated app for requests, plus the cron that sends reminders and
// checks the API still answers. The adapter writes its worker to the `main` of
// wrangler.adapter.jsonc, this file wraps it.
import app from './.svelte-kit/cloudflare/_worker.js';
import { checkHealth } from './src/lib/server/health.ts';
import { sendReminders } from './src/lib/server/push.ts';

export default {
	fetch: app.fetch,
	/** @param {ScheduledController} _controller @param {Env & { VAPID_PRIVATE_JWK?: string }} env @param {ExecutionContext} ctx */
	scheduled(_controller, env, ctx) {
		ctx.waitUntil(
			Promise.all([
				sendReminders(env.DB, env.VAPID_PRIVATE_JWK),
				checkHealth(env.DB, (request) => app.fetch(request, env, ctx), env.VAPID_PRIVATE_JWK)
			])
		);
	}
};

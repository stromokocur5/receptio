// Worker entry: SvelteKit's generated app for requests, plus the cron that sends reminders.
// The adapter writes its worker to the `main` of wrangler.adapter.jsonc, this file wraps it.
import app from './.svelte-kit/cloudflare/_worker.js';
import { sendReminders } from './src/lib/server/push.ts';

export default {
	fetch: app.fetch,
	/** @param {ScheduledController} _controller @param {Env & { VAPID_PRIVATE_JWK?: string }} env @param {ExecutionContext} ctx */
	scheduled(_controller, env, ctx) {
		ctx.waitUntil(sendReminders(env.DB, env.VAPID_PRIVATE_JWK));
	}
};

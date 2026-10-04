// Worker entry: SvelteKit's generated app for requests, plus the cron that sends water reminders.
// The adapter writes its worker to the `main` of wrangler.adapter.jsonc, this file wraps it.
import app from './.svelte-kit/cloudflare/_worker.js';
import { sendWaterReminders } from './src/lib/server/push.ts';

export default {
	fetch: app.fetch,
	/** @param {ScheduledController} _controller @param {Env & { VAPID_PRIVATE_JWK?: string }} env @param {ExecutionContext} ctx */
	scheduled(_controller, env, ctx) {
		ctx.waitUntil(sendWaterReminders(env.DB, env.VAPID_PRIVATE_JWK));
	}
};

// Worker entry: SvelteKit's generated app for requests, the households' live rooms (Durable
// Objects), plus the cron that sends reminders and checks the API still answers. The adapter
// writes its worker to the `main` of wrangler.adapter.jsonc, this file wraps it.
import app from './.svelte-kit/cloudflare/_worker.js';
import { checkHealth } from './src/lib/server/health.ts';
import { liveSocket } from './src/lib/server/household-room.ts';
import { sendReminders } from './src/lib/server/push.ts';

export { HouseholdRoom } from './src/lib/server/household-room-object.ts';

export default {
	/** @param {Request} request @param {Env} env @param {ExecutionContext} ctx */
	async fetch(request, env, ctx) {
		// Household WebSockets go straight to their room, the rest is the SvelteKit app.
		return (await liveSocket(request, env)) ?? app.fetch(request, env, ctx);
	},
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

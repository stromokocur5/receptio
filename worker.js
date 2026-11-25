// Worker entry: SvelteKit's generated app, plus the Durable Object class the deployed bindings
// still name (households). The adapter writes its worker to the `main` of
// wrangler.adapter.jsonc, this file wraps it.
import app from './.svelte-kit/cloudflare/_worker.js';

export { HouseholdRoom } from './src/lib/server/household-room-object.ts';

export default {
	/** @param {Request} request @param {Env} env @param {ExecutionContext} ctx */
	fetch(request, env, ctx) {
		return app.fetch(request, env, ctx);
	}
};

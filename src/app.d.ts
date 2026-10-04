// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			/** Worker secrets (.dev.vars locally) aren't in the generated Env. */
			env: Env & { TURNSTILE_SECRET?: string; VAPID_PRIVATE_JWK?: string };
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** Cooking mode is open over the recipe (shallow route, so Back closes it). */
			cooking?: boolean;
		}
	}
}

export {};

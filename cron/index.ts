/**
 * Rebuilds Receptio every morning, so the build (`pnpm build:ci`) pulls today's prices from
 * cenyslovensko.sk – the chains report them by 6:00. The build is started through a Workers
 * Builds Deploy Hook, whose URL is the secret DEPLOY_HOOK_URL.
 */
interface Env {
	DEPLOY_HOOK_URL?: string;
}

export default {
	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		if (!env.DEPLOY_HOOK_URL) {
			console.error('DEPLOY_HOOK_URL nie je nastavený, ceny sa neobnovia.');
			return;
		}
		ctx.waitUntil(
			fetch(env.DEPLOY_HOOK_URL, { method: 'POST' }).then((res) => {
				if (!res.ok) console.error(`Deploy hook vrátil ${res.status}`);
			})
		);
	}
};

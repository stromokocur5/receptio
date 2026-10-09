/**
 * Helpers around the households' live rooms (household-room-object.ts, which only the Worker
 * entry imports – the prerender runs in Node, where `cloudflare:workers` doesn't exist).
 */

/** A household has at most a dozen people, a few devices each; more sockets aren't theirs. */
export const MAX_SOCKETS = 40;

/** `/api/live/<sync id>`: a phone's WebSocket for its household's room. */
export const LIVE_PATH = /^\/api\/live\/([0-9a-f]{64})$/;

/** Opens the room's WebSocket, or null when this isn't such a request. */
export async function liveSocket(request: Request, env: Env): Promise<Response | null> {
	const match = LIVE_PATH.exec(new URL(request.url).pathname);
	if (!match) return null;
	if (request.headers.get('upgrade') !== 'websocket') {
		return new Response('Expected a WebSocket', { status: 426 });
	}
	const ip = request.headers.get('cf-connecting-ip') ?? '';
	const limit = await env.SYNC_LIMITER?.limit({ key: ip });
	if (limit && !limit.success) return new Response('Too many requests', { status: 429 });
	const room = env.HOUSEHOLD_ROOM.get(env.HOUSEHOLD_ROOM.idFromName(match[1]));
	return room.fetch(request);
}

/** Tells the phones in the room that `version` is saved; best effort. */
export async function announce(env: Env | undefined, id: string, version: number): Promise<void> {
	const rooms = env?.HOUSEHOLD_ROOM;
	if (!rooms) return;
	try {
		await rooms.get(rooms.idFromName(id)).fetch(`https://room/notify?v=${version}`, {
			method: 'POST'
		});
	} catch (err) {
		console.error('household room: announce failed', err);
	}
}

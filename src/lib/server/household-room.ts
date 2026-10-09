import { sha256Hex } from './sync';

/**
 * Helpers around the households' live rooms (household-room-object.ts, which only the Worker
 * entry imports – the prerender runs in Node, where `cloudflare:workers` doesn't exist).
 */

/** A household has at most a dozen people, a few devices each; more sockets aren't theirs. */
export const MAX_SOCKETS = 40;
/** A phone gets household news at most this often. */
export const NEWS_EVERY_MS = 10 * 60 * 1000;
/** A phone's id within its household (household.svelte.ts). */
export const PHONE_RE = /^[a-z0-9]{1,16}$/;

/** `/api/live/<sync id>`: a WebSocket; `/api/live/<sync id>/push`: news by push, on or off. */
const LIVE_PATH = /^\/api\/live\/([0-9a-f]{64})(\/push)?$/;

/** Answers a room request, or null when this isn't one. */
export async function liveSocket(request: Request, env: Env): Promise<Response | null> {
	const match = LIVE_PATH.exec(new URL(request.url).pathname);
	if (!match) return null;
	const ip = request.headers.get('cf-connecting-ip') ?? '';
	const limit = await env.SYNC_LIMITER?.limit({ key: ip });
	if (limit && !limit.success) return new Response('Too many requests', { status: 429 });
	const room = env.HOUSEHOLD_ROOM.get(env.HOUSEHOLD_ROOM.idFromName(match[1]));
	if (!match[2]) {
		if (request.headers.get('upgrade') !== 'websocket') {
			return new Response('Expected a WebSocket', { status: 426 });
		}
		return room.fetch(request);
	}
	return pushSettings(request, env, match[1], room);
}

/**
 * Turning news on or off: only someone with the household's write token (from its code) may,
 * so nobody else can add their own browser to it.
 */
async function pushSettings(
	request: Request,
	env: Env,
	id: string,
	room: DurableObjectStub
): Promise<Response> {
	if (request.method !== 'POST' && request.method !== 'DELETE') {
		return new Response(null, { status: 405 });
	}
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return new Response(null, { status: 400 });
	}
	if (typeof body.token !== 'string' || !/^[0-9a-f]{64}$/.test(body.token)) {
		return new Response(null, { status: 400 });
	}
	const row = await env.DB.prepare('SELECT write_hash FROM sync WHERE id = ?')
		.bind(id)
		.first<{ write_hash: string }>();
	if (!row || row.write_hash !== (await sha256Hex(body.token))) {
		return new Response(null, { status: 403 });
	}
	const { token: _token, ...rest } = body;
	return room.fetch(`https://room/${request.method === 'POST' ? 'subscribe' : 'unsubscribe'}`, {
		method: 'POST',
		body: JSON.stringify(rest)
	});
}

/**
 * Tells the phones in the room that `version` is saved; with `news`, the ones not looking get a
 * push (except `from`, the phone that saved). Best effort.
 */
export async function announce(
	env: Env | undefined,
	id: string,
	version: number,
	from?: string,
	news = false
): Promise<void> {
	const rooms = env?.HOUSEHOLD_ROOM;
	if (!rooms) return;
	const query = new URLSearchParams({ v: String(version) });
	if (from && PHONE_RE.test(from)) query.set('from', from);
	if (news) query.set('news', '1');
	try {
		await rooms.get(rooms.idFromName(id)).fetch(`https://room/notify?${query}`, { method: 'POST' });
	} catch (err) {
		console.error('household room: announce failed', err);
	}
}

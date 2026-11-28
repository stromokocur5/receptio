import { DurableObject } from 'cloudflare:workers';
import { MAX_SOCKETS, NEWS_EVERY_MS, PHONE_RE } from './household-room';
import { sendPayload } from './webpush';

/**
 * One room per household (per sync id): the phones that have the household open keep a
 * WebSocket here, and a saved change tells them at once to fetch it. Only the version number
 * passes through – the data stays encrypted in D1. Sockets hibernate between messages, so an
 * open phone costs nothing while nothing happens.
 *
 * Phones that asked for it also get a push when someone else saved news (a meal planned, a
 * shopping trip, a payment…) while they don't have the household open – at most one every few
 * minutes. The push says only "household"; the phone reads and decrypts what changed itself.
 */
export class HouseholdRoom extends DurableObject<Env & { VAPID_PRIVATE_JWK?: string }> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// Keep-alive pings are answered without waking the room.
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
		ctx.storage.sql.exec(
			'CREATE TABLE IF NOT EXISTS phones (phone TEXT PRIMARY KEY, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, pushed_at INTEGER NOT NULL DEFAULT 0)'
		);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (request.headers.get('upgrade') === 'websocket') {
			if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
				return new Response('Too many', { status: 429 });
			}
			const phone = url.searchParams.get('phone');
			const [client, server] = Object.values(new WebSocketPair());
			// Tagged with the phone, so it isn't sent a push while it's looking anyway.
			this.ctx.acceptWebSocket(server, phone && PHONE_RE.test(phone) ? [phone] : []);
			return new Response(null, { status: 101, webSocket: client });
		}
		if (request.method !== 'POST') return new Response(null, { status: 405 });
		switch (url.pathname) {
			case '/notify':
				return this.notify(url);
			case '/subscribe':
				return this.subscribe(await request.json());
			case '/unsubscribe':
				return this.unsubscribe(await request.json());
		}
		return new Response(null, { status: 404 });
	}

	private async notify(url: URL) {
		const version = Number(url.searchParams.get('v'));
		if (!Number.isInteger(version) || version < 0) return new Response(null, { status: 400 });
		const message = JSON.stringify({ v: version });
		const looking = new Set<string>();
		for (const socket of this.ctx.getWebSockets()) {
			for (const tag of this.ctx.getTags(socket)) looking.add(tag);
			try {
				socket.send(message);
			} catch {
				// Gone; the runtime closes it.
			}
		}
		const from = url.searchParams.get('from');
		if (url.searchParams.get('news') === '1') await this.pushNews(from, looking);
		return new Response(null, { status: 204 });
	}

	private async pushNews(from: string | null, looking: Set<string>) {
		const key = this.env.VAPID_PRIVATE_JWK;
		if (!key) return;
		const now = Date.now();
		const phones = this.ctx.storage.sql
			.exec<{ phone: string; endpoint: string; p256dh: string; auth: string; pushed_at: number }>(
				'SELECT phone, endpoint, p256dh, auth, pushed_at FROM phones'
			)
			.toArray()
			.filter(
				(p) => p.phone !== from && !looking.has(p.phone) && now - p.pushed_at > NEWS_EVERY_MS
			);
		const jwk = JSON.parse(key) as JsonWebKey;
		await Promise.all(
			phones.map(async (p) => {
				const status = await sendPayload(p, JSON.stringify({ t: 'household' }), jwk, now);
				if (status === 404 || status === 410) {
					this.ctx.storage.sql.exec('DELETE FROM phones WHERE phone = ?', p.phone);
				} else {
					this.ctx.storage.sql.exec(
						'UPDATE phones SET pushed_at = ? WHERE phone = ?',
						now,
						p.phone
					);
				}
			})
		);
	}

	private subscribe(body: unknown) {
		const b = body as Record<string, unknown>;
		const ok =
			typeof b?.phone === 'string' &&
			PHONE_RE.test(b.phone) &&
			typeof b.endpoint === 'string' &&
			/^https:\/\/[^\s]{10,500}$/.test(b.endpoint) &&
			typeof b.p256dh === 'string' &&
			/^[A-Za-z0-9_-]{80,100}$/.test(b.p256dh) &&
			typeof b.auth === 'string' &&
			/^[A-Za-z0-9_-]{16,30}$/.test(b.auth);
		if (!ok) return new Response(null, { status: 400 });
		const count = this.ctx.storage.sql
			.exec<{ n: number }>('SELECT COUNT(*) AS n FROM phones')
			.one().n;
		if (count >= MAX_SOCKETS) return new Response(null, { status: 429 });
		this.ctx.storage.sql.exec(
			'INSERT INTO phones (phone, endpoint, p256dh, auth) VALUES (?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth',
			b.phone,
			b.endpoint,
			b.p256dh,
			b.auth
		);
		return new Response(null, { status: 204 });
	}

	private unsubscribe(body: unknown) {
		const phone = (body as Record<string, unknown>)?.phone;
		if (typeof phone !== 'string' || !PHONE_RE.test(phone))
			return new Response(null, { status: 400 });
		this.ctx.storage.sql.exec('DELETE FROM phones WHERE phone = ?', phone);
		return new Response(null, { status: 204 });
	}

	/** Phones only listen. */
	webSocketMessage() {}

	webSocketClose(socket: WebSocket, code: number) {
		try {
			socket.close(code === 1005 ? 1000 : code, 'bye');
		} catch {
			// Already closed.
		}
	}
}

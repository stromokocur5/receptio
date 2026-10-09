import { DurableObject } from 'cloudflare:workers';
import { MAX_SOCKETS } from './household-room';

/**
 * One room per household (per sync id): the phones that have the household open keep a
 * WebSocket here, and a saved change tells them at once to fetch it. Only the version number
 * passes through – the data stays encrypted in D1. Sockets hibernate between messages, so an
 * open phone costs nothing while nothing happens.
 */
export class HouseholdRoom extends DurableObject {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// Keep-alive pings are answered without waking the room.
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('upgrade') === 'websocket') {
			if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
				return new Response('Too many', { status: 429 });
			}
			const [client, server] = Object.values(new WebSocketPair());
			this.ctx.acceptWebSocket(server);
			return new Response(null, { status: 101, webSocket: client });
		}
		if (request.method === 'POST') {
			const version = Number(new URL(request.url).searchParams.get('v'));
			if (!Number.isInteger(version) || version < 0) return new Response(null, { status: 400 });
			const message = JSON.stringify({ v: version });
			for (const socket of this.ctx.getWebSockets()) {
				try {
					socket.send(message);
				} catch {
					// Gone; the runtime closes it.
				}
			}
			return new Response(null, { status: 204 });
		}
		return new Response(null, { status: 405 });
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

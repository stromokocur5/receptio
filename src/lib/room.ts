/**
 * A WebSocket to the live room of a household or a shared shopping list (household-room.ts on
 * the server): when someone saves, the room says which version is new, and the page fetches it.
 * Without a room (dev server, old browser, blocked socket) it gives up after a few tries and the
 * page keeps polling.
 */

/** The server is quiet between saves; this keeps the connection from timing out. */
const KEEP_ALIVE_MS = 45_000;
const MAX_FAILURES = 3;

export interface Room {
	/** Connected right now: the page can poll rarely. */
	readonly open: boolean;
	/** Tries again after a failure (the tab came back, the network did). */
	retry(): void;
	close(): void;
}

/**
 * `onOpen`: connected – fetch what was saved while not listening. `onVersion`: someone saved
 * this version.
 */
export function joinRoom(
	id: string,
	onVersion: (version: number) => void,
	onOpen = () => {},
	/** This household phone, so the room doesn't push it news while it's looking. */
	phone?: string
): Room {
	let socket: WebSocket | null = null;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let keepAlive: ReturnType<typeof setInterval> | undefined;
	let failures = 0;
	let closed = false;

	function connect() {
		if (closed || socket || failures >= MAX_FAILURES || typeof WebSocket === 'undefined') return;
		if (document.visibilityState !== 'visible') return;
		const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
		const query = phone ? `?phone=${phone}` : '';
		const ws = new WebSocket(`${scheme}://${location.host}/api/live/${id}${query}`);
		let opened = false;
		socket = ws;
		ws.onopen = () => {
			opened = true;
			failures = 0;
			keepAlive = setInterval(() => ws.send('ping'), KEEP_ALIVE_MS);
			onOpen();
		};
		ws.onmessage = (event) => {
			if (event.data === 'pong') return;
			try {
				const { v } = JSON.parse(event.data as string) as { v: unknown };
				if (typeof v === 'number') onVersion(v);
			} catch {
				// Not ours.
			}
		};
		ws.onclose = () => {
			clearInterval(keepAlive);
			if (socket !== ws) return;
			socket = null;
			if (!opened) failures++;
			if (!closed && document.visibilityState === 'visible') {
				retryTimer = setTimeout(connect, Math.min(2000 * 2 ** failures, 60_000));
			}
		};
	}

	connect();
	return {
		get open() {
			return socket?.readyState === WebSocket.OPEN;
		},
		retry() {
			failures = 0;
			clearTimeout(retryTimer);
			connect();
		},
		close() {
			closed = true;
			clearTimeout(retryTimer);
			clearInterval(keepAlive);
			const ws = socket;
			socket = null;
			ws?.close();
		}
	};
}

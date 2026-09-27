/** Public site key of the "Receptio formuláre" widget. */
const SITEKEY = '0x4AAAAAAFEkAXbT7TVC_OTR';
/** Cloudflare's always-pass test key, paired with the test secret in .dev.vars. */
const TEST_SITEKEY = '1x00000000000000000000AA';
const SCRIPT =
	'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=receptioTurnstileReady&render=explicit';

interface RenderOptions {
	sitekey: string;
	action: string;
	appearance?: 'always' | 'execute' | 'interaction-only';
	execution?: 'render' | 'execute';
	language?: string;
	theme?: 'auto' | 'light' | 'dark';
	retry?: 'auto' | 'never';
	callback?: (token: string) => void;
	'error-callback'?: () => void;
	'expired-callback'?: () => void;
	'timeout-callback'?: () => void;
	'unsupported-callback'?: () => void;
	'before-interactive-callback'?: () => void;
	'after-interactive-callback'?: () => void;
}

export interface TurnstileApi {
	render(container: HTMLElement, options: RenderOptions): string;
	execute(widgetId: string): void;
	reset(widgetId: string): void;
	remove(widgetId: string): void;
}

declare global {
	interface Window {
		turnstile?: TurnstileApi;
		receptioTurnstileReady?: () => void;
	}
}

let loading: Promise<TurnstileApi> | null = null;

/** Loads the Turnstile script once, only when a form actually needs it. */
export function loadTurnstile(): Promise<TurnstileApi> {
	if (window.turnstile) return Promise.resolve(window.turnstile);
	loading ??= new Promise((resolve, reject) => {
		window.receptioTurnstileReady = () => {
			delete window.receptioTurnstileReady;
			resolve(window.turnstile!);
		};
		const script = document.createElement('script');
		script.src = SCRIPT;
		script.async = true;
		script.onerror = () => {
			loading = null;
			reject(new Error('turnstile script failed'));
		};
		document.head.appendChild(script);
	});
	return loading;
}

export function sitekey(): string {
	return ['localhost', '127.0.0.1'].includes(location.hostname) ? TEST_SITEKEY : SITEKEY;
}

/** A token that hasn't arrived by then won't; better to tell the person than spin forever. */
const TOKEN_TIMEOUT_MS = 60_000;

export interface ChallengeOptions {
	/** Turnstile needs a click (checkbox shown); the page should bring the widget into view. */
	onInteractive?: () => void;
	onInteractiveDone?: () => void;
}

/**
 * An invisible widget in `container` that produces a fresh token on demand. Tokens are
 * single-use, so every `token()` call runs a new challenge.
 */
export async function createChallenge(
	container: HTMLElement,
	action: string,
	options: ChallengeOptions = {}
) {
	const api = await loadTurnstile();
	let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
	const fail = (reason: string) => () => {
		pending?.reject(new Error(reason));
		pending = null;
	};
	const id = api.render(container, {
		sitekey: sitekey(),
		action,
		appearance: 'interaction-only',
		execution: 'execute',
		language: 'sk',
		theme: 'auto',
		retry: 'auto',
		callback: (t) => {
			pending?.resolve(t);
			pending = null;
		},
		'error-callback': fail('turnstile error'),
		'timeout-callback': fail('turnstile interaction timeout'),
		'unsupported-callback': fail('turnstile unsupported browser'),
		'expired-callback': () => api.reset(id),
		'before-interactive-callback': () => options.onInteractive?.(),
		'after-interactive-callback': () => options.onInteractiveDone?.()
	});
	return {
		token(): Promise<string> {
			pending?.reject(new Error('turnstile superseded'));
			return new Promise<string>((resolve, reject) => {
				const timer = setTimeout(() => {
					if (pending === entry) pending = null;
					reject(new Error('turnstile timeout'));
				}, TOKEN_TIMEOUT_MS);
				const entry = {
					resolve: (t: string) => {
						clearTimeout(timer);
						resolve(t);
					},
					reject: (e: Error) => {
						clearTimeout(timer);
						reject(e);
					}
				};
				pending = entry;
				api.reset(id);
				api.execute(id);
			});
		},
		remove() {
			fail('turnstile removed')();
			api.remove(id);
		}
	};
}

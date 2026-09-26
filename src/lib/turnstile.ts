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
	callback?: (token: string) => void;
	'error-callback'?: () => void;
	'expired-callback'?: () => void;
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

/**
 * An invisible widget in `container` that produces a fresh token on demand. Tokens are
 * single-use, so every `token()` call runs a new challenge.
 */
export async function createChallenge(container: HTMLElement, action: string) {
	const api = await loadTurnstile();
	let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
	const id = api.render(container, {
		sitekey: sitekey(),
		action,
		appearance: 'interaction-only',
		execution: 'execute',
		language: 'sk',
		theme: 'auto',
		callback: (t) => {
			pending?.resolve(t);
			pending = null;
		},
		'error-callback': () => {
			pending?.reject(new Error('turnstile error'));
			pending = null;
		},
		'expired-callback': () => api.reset(id)
	});
	return {
		token(): Promise<string> {
			return new Promise((resolve, reject) => {
				pending = { resolve, reject };
				api.reset(id);
				api.execute(id);
			});
		},
		remove() {
			api.remove(id);
		}
	};
}

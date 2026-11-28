/** Chrome's install event; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
	interface Window {
		/** Caught by the inline script in app.html, since Chrome can fire it before hydration. */
		__installPrompt?: BeforeInstallPromptEvent;
	}
}

const DISMISSED_KEY = 'receptio:install-dismissed';
/** "Nie, ďakujem" hides the home card for a while, not forever. */
const SNOOZE_DAYS = 14;

export const install = $state<{
	/** Chrome/Edge/Samsung can install with one tap. */
	prompt: BeforeInstallPromptEvent | null;
	/** Browsers that can't be prompted but can add to the home screen by hand. */
	hint: 'ios' | 'android' | null;
	/** Show the card on the home page. */
	offer: boolean;
}>({ prompt: null, hint: null, offer: false });

function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Asked again next time; harmless.
	}
}

function snoozed(): boolean {
	const since = Date.parse(read(DISMISSED_KEY) ?? '');
	return Number.isFinite(since) && Date.now() - since < SNOOZE_DAYS * 86_400_000;
}

function takePrompt(event: BeforeInstallPromptEvent, showCard: boolean) {
	install.prompt = event;
	install.offer = showCard;
}

/** Listens for the browser's install offer and decides whether to show the card. Call once on mount. */
export function initInstall() {
	if (matchMedia('(display-mode: standalone)').matches) return;
	const showCard = !snoozed();

	const ua = navigator.userAgent;
	install.hint = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : null;
	install.offer = showCard && install.hint !== null;

	if (window.__installPrompt) takePrompt(window.__installPrompt, showCard);
	addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		takePrompt(event as BeforeInstallPromptEvent, showCard);
	});
	addEventListener('appinstalled', () => {
		install.prompt = null;
		install.hint = null;
		install.offer = false;
	});
}

export async function acceptInstall() {
	if (!install.prompt) return;
	await install.prompt.prompt();
	await install.prompt.userChoice;
	install.prompt = null;
	install.offer = false;
}

export function dismissInstall() {
	write(DISMISSED_KEY, new Date().toISOString().slice(0, 10));
	install.offer = false;
}

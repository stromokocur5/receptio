/** Chrome's install event; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const VISITS_KEY = 'receptio:visits';
const DISMISSED_KEY = 'receptio:install-dismissed';
/** Only people who come back get asked; a first visit shouldn't be nagged. */
const MIN_VISITS = 2;

export const install = $state<{
	/** Chrome/Android can install with one tap. */
	prompt: BeforeInstallPromptEvent | null;
	/** Safari on iPhone can't be prompted; show how to do it by hand. */
	iosHint: boolean;
	offer: boolean;
}>({ prompt: null, iosHint: false, offer: false });

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

/** Counts a visit per day and listens for the browser's install offer. Call once on mount. */
export function initInstall() {
	const standalone = matchMedia('(display-mode: standalone)').matches;
	if (standalone || read(DISMISSED_KEY)) return;

	const today = new Date().toISOString().slice(0, 10);
	let visits: { count: number; last: string } = { count: 0, last: '' };
	try {
		visits = { ...visits, ...JSON.parse(read(VISITS_KEY) ?? '{}') };
	} catch {
		// Starts counting again.
	}
	if (visits.last !== today) {
		visits = { count: visits.count + 1, last: today };
		write(VISITS_KEY, JSON.stringify(visits));
	}
	const returning = visits.count >= MIN_VISITS;

	install.iosHint = returning && /iPhone|iPad|iPod/.test(navigator.userAgent);
	install.offer = install.iosHint;
	addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		install.prompt = event as BeforeInstallPromptEvent;
		install.offer = returning;
	});
	addEventListener('appinstalled', () => {
		install.prompt = null;
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

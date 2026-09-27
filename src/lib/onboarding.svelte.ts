const SEEN_KEY = 'receptio:onboarded';

/** Whether the welcome guide is on screen; the guide can be reopened from Moje. */
export const onboarding = $state({ open: false });

/**
 * First visit on this device, except for people who arrived through someone's shared link –
 * they came to see a shopping list or a garden, not a tour.
 */
export function shouldOnboard(url: URL): boolean {
	if (url.pathname.startsWith('/zoznam') || url.pathname.startsWith('/admin')) return false;
	if (url.hash.startsWith('#zahradka=')) return false;
	try {
		return localStorage.getItem(SEEN_KEY) === null;
	} catch {
		// Without storage the guide would come back on every page.
		return false;
	}
}

export function markOnboarded() {
	try {
		localStorage.setItem(SEEN_KEY, new Date().toISOString().slice(0, 10));
	} catch {
		// Shown again next time; harmless.
	}
}

import type { Page } from '@playwright/test';

export async function visit(page: Page, path: string) {
	await page.goto(path);
	// Stored state loads on mount; wait until the app is interactive.
	await page.waitForLoadState('networkidle');
	await waitReady(page);
}

/** The app has hydrated: clicks now reach its handlers instead of the bare HTML. */
export async function waitReady(page: Page) {
	await page.locator('html[data-ready]').waitFor({ state: 'attached' });
}

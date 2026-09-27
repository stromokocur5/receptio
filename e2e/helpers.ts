import type { Page } from '@playwright/test';

/** Opens a page as a returning visitor, so the first-visit guide stays closed. */
export async function visit(page: Page, path: string) {
	await page.addInitScript(() => localStorage.setItem('receptio:onboarded', 'test'));
	await page.goto(path);
	// Stored state loads on mount; wait until the app is interactive.
	await page.waitForLoadState('networkidle');
}

import { expect, test } from '@playwright/test';
import { visit } from './helpers';

test('a recipe goes to the plan and its ingredients into the shopping list', async ({ page }) => {
	await visit(page, '/recepty/falafel');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/falafel/i);
	await page
		.getByRole('button', { name: /^Do plánu/ })
		.first()
		.click();
	await expect(page.getByRole('button', { name: /Pridané/ }).first()).toBeVisible();

	await page.goto('/plan');
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('heading', { name: 'Tvoj týždeň' })).toBeVisible();
	await expect(page.getByText(/falafel/i).first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Nákupný zoznam' })).toBeVisible();
	await expect(page.getByText(/Cícer/).first()).toBeVisible();
});

test('ingredients can be ticked off while cooking', async ({ page }) => {
	await visit(page, '/recepty/falafel');
	const first = page.locator('#suroviny li').first();
	await first.getByRole('button', { pressed: false }).first().click();
	await expect(first).toHaveClass(/ready/);
});

test('the floating cook bar steps aside for the footer', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'the bar exists only on phones');
	await visit(page, '/recepty/falafel');
	const bar = page.locator('.quick-bar');
	// Scroll like a thumb does; a jump straight to an element skips the observer's frames.
	for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 500);
	await expect(bar).toHaveClass(/shown/);
	for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 800);
	await expect(bar).not.toHaveClass(/shown/);
});

test('a mis-tapped "cooked" can be taken back', async ({ page }) => {
	await visit(page, '/recepty/falafel');
	await page
		.getByRole('button', { name: /^Do plánu/ })
		.first()
		.click();
	await page.goto('/plan');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Uvarené' }).first().click();
	await expect(page.getByRole('status').filter({ hasText: 'zapísané' })).toBeVisible();
	await page.getByRole('button', { name: 'Späť – ešte nie je uvarené' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Vrátené' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Uvarené' }).first()).toBeVisible();
	const history = await page.evaluate(() => localStorage.getItem('receptio:history'));
	expect(JSON.parse(history ?? '[]')).toEqual([]);
});

test('clearing the plan goes at once and can be taken back', async ({ page }) => {
	await visit(page, '/recepty/falafel');
	await page
		.getByRole('button', { name: /^Do plánu/ })
		.first()
		.click();
	await page.goto('/plan');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Vymazať plán' }).click();
	await expect(page.getByRole('heading', { name: 'Ako chceš začať?' })).toBeVisible();
	await page.getByRole('button', { name: 'Vrátiť' }).click();
	await expect(page.getByRole('heading', { name: 'Tvoj týždeň' })).toBeVisible();
	await expect(page.getByText(/falafel/i).first()).toBeVisible();
});

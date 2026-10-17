import { expect, test } from '@playwright/test';
import { visit } from './helpers';

test('wiki search narrows the articles', async ({ page }) => {
	await visit(page, '/wiki');
	await expect(page.getByRole('heading', { name: 'Začni tu' })).toBeVisible();
	await page.getByLabel('Hľadať v návodoch').fill('kompost');
	await expect(page.getByRole('heading', { name: /Nájdené: \d+/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Kompost a vermikompost/ })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Začni tu' })).toBeHidden();
});

test('the "Viac" menu reaches pages outside the main areas', async ({ page }) => {
	await visit(page, '/');
	await page.getByRole('button', { name: 'Viac' }).first().click();
	await page.getByRole('link', { name: /O projekte/ }).click();
	await expect(page.getByRole('heading', { name: 'Prečo Receptio vzniklo' })).toBeVisible();
});

test('the season page shows a dozen recipes and the rest on request', async ({ page }) => {
	await visit(page, '/sezona');
	const recipes = page.locator('#uvar article');
	const all = page.getByRole('button', { name: /^Všetky \(\d+\)$/ });
	if (!(await all.isVisible())) return; // A month with few seasonal recipes has nothing to fold.
	await expect(recipes).toHaveCount(12);
	const total = Number((await all.textContent())!.match(/\d+/)![0]);
	await all.click();
	await expect(recipes).toHaveCount(total);
	await expect(recipes.nth(12).getByRole('link').first()).toBeFocused();
});

test('the bar switches between Kuchyňa and Domov and comes back to the same page', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await visit(page, '/recepty');
	const nav = page.getByRole('navigation', { name: 'Hlavná navigácia' });
	await expect(nav.getByRole('link', { name: 'Recepty' })).toBeVisible();
	await expect(nav.getByRole('link', { name: 'Špajza' })).toBeHidden();
	await nav.getByRole('link', { name: 'Domov' }).click();
	await expect(page).toHaveURL(/\/spajza$/);
	await nav.getByRole('link', { name: 'Ceny' }).click();
	await expect(page).toHaveURL(/\/ceny$/);
	await nav.getByRole('link', { name: 'Kuchyňa' }).click();
	await expect(page).toHaveURL(/\/recepty$/);
	await nav.getByRole('link', { name: 'Domov' }).click();
	await expect(page).toHaveURL(/\/ceny$/);
	// Pages outside both halves keep the half last used.
	await visit(page, '/wiki');
	await expect(nav.getByRole('link', { name: 'Pestuj' })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { visit } from './helpers';

test('categories and subcategories narrow the recipe list and stay in the URL', async ({
	page
}) => {
	await visit(page, '/recepty');
	await page.getByRole('button', { name: /Nápoje/ }).click();
	await expect(page).toHaveURL(/kategoria=napoje/);
	await page.getByRole('button', { name: /Fermentované/ }).click();
	await expect(page).toHaveURL(/pod=fermentovane/);
	await expect(page.getByRole('link', { name: /Zázvorové pivo/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Masala chai/ })).toBeHidden();
});

test('growing techniques open from the garden page with their drawings', async ({ page }) => {
	await visit(page, '/pestuj#techniky');
	await page.getByRole('link', { name: /Vyvýšené záhony a hügelkultúra/ }).click();
	await expect(page.getByRole('heading', { name: 'Vyvýšené záhony a hügelkultúra' })).toBeVisible();
	await expect(page.locator('figure.tech-art')).toHaveCount(2);
});

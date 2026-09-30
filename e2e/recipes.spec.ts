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

test('a preserve goes from its recipe to the shelf in Špajza', async ({ page }) => {
	await visit(page, '/recepty/leco-do-poharov');
	await page.getByRole('button', { name: 'Zapísať do zásob' }).click();
	await page.getByRole('link', { name: 'V zásobách' }).click();
	await expect(page.getByRole('link', { name: 'Lečo do zásoby' })).toBeVisible();
	await expect(page.getByText('8×')).toBeVisible();
	await page.getByRole('button', { name: 'Zobrať kus: Lečo do zásoby' }).click();
	await expect(page.getByText('7×')).toBeVisible();
});

test('filters survive opening a recipe and going back', async ({ page }) => {
	await visit(page, '/recepty?chut=sladke&cas=30');
	await page.getByRole('button', { name: /Zobraziť ďalšie/ }).click();
	await expect(page.locator('.grid > article')).toHaveCount(48);

	await page.locator('.grid a.stretched').nth(30).click();
	await expect(page).toHaveURL(/\/recepty\/[a-z0-9-]+$/);
	await page.locator('a.back').click();

	await expect(page).toHaveURL(/chut=sladke/);
	await expect(page).toHaveURL(/cas=30/);
	await expect(page.locator('.grid > article')).toHaveCount(48);
});

test('excluding an ingredient hides recipes with any form of it', async ({ page }) => {
	await visit(page, '/recepty?q=hummus');
	await expect(page.getByRole('link', { name: 'Krémový hummus' })).toBeVisible();
	const filters = page.locator('#filters');
	if (!(await filters.isVisible())) await page.getByRole('button', { name: /Filtre/ }).click();
	await filters.getByText('Strava a alergie').click();
	await filters.getByPlaceholder('Napr. huby, koriander…').fill('cícer');
	await filters
		.getByRole('button', { name: /Pridať: bez Cícer/ })
		.first()
		.click();
	await expect(page).toHaveURL(/bez=cicer/);
	await expect(page.getByRole('link', { name: 'Krémový hummus' })).toBeHidden();
});

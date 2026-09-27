import { expect, test } from '@playwright/test';
import { visit } from './helpers';

test('garden tabs follow the URL and a crop opens in a sheet', async ({ page }) => {
	await visit(page, '/pestuj#p-mrkva');
	const sheet = page.getByRole('dialog', { name: 'Mrkva' });
	await expect(sheet).toBeVisible();
	await sheet.getByRole('button', { name: 'Zavrieť' }).click();
	await expect(sheet).toBeHidden();
	await expect(page).toHaveURL(/#plodiny$/);

	await page.getByRole('tab', { name: 'Plánovač' }).click();
	await expect(page).toHaveURL(/#planovac$/);
	await expect(page.getByRole('heading', { name: 'Plánovač' })).toBeVisible();
});

test('a saved garden gets a bed that can be painted', async ({ page }) => {
	await visit(page, '/pestuj#planovac');
	await page.getByRole('button', { name: 'Uložiť ako moju záhradku' }).click();
	await expect(page.getByRole('tab', { name: 'Moja záhradka' })).toHaveAttribute(
		'aria-selected',
		'true'
	);

	await page.getByPlaceholder('šírka').fill('1.2');
	await page.getByPlaceholder('hĺbka').fill('0.6');
	await page.getByRole('button', { name: 'Pridať záhon' }).click();

	const palette = page.getByRole('group', { name: 'Čo sadíš' });
	await palette.getByRole('button').nth(1).click();
	const grid = page.getByRole('group', { name: /^Záhon / });
	const cells = grid.getByRole('button');
	await cells.first().click();
	await expect(cells.first()).not.toHaveAttribute('aria-label', /prázdne/);

	await page.getByRole('button', { name: 'Späť', exact: true }).click();
	await expect(cells.first()).toHaveAttribute('aria-label', /prázdne/);
});

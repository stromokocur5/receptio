import { expect, test } from '@playwright/test';
import { visit } from './helpers';

test('pantry ranks dishes, a side and method swap, cooking runs step by step', async ({ page }) => {
	await visit(page, '/kuchyna');
	await page.getByRole('button', { name: /Airfryer/ }).click();
	await page.getByPlaceholder('Pridať surovinu…').fill('tofu nat');
	await page.getByRole('button', { name: /Tofu natural/ }).click();
	await page.getByPlaceholder('Pridať surovinu…').fill('jazmín');
	await page.getByRole('button', { name: /Ryža jazmínová/ }).click();

	await page.getByRole('link', { name: 'Čo z toho uvarím' }).click();
	await expect(page.getByRole('heading', { name: 'Poskladaj si tanier' })).toBeVisible();
	await page.getByRole('link', { name: 'Misa s tofu a arašidovou omáčkou' }).click();

	await page.getByRole('radio', { name: 'Quinoa' }).click();
	await expect(page).toHaveURL(/zaklad=quinoa/);
	await page
		.getByRole('radio', { name: /V airfryeri/ })
		.first()
		.click();
	await expect(page).toHaveURL(/ako-chrumkave-tofu=V\+airfryeri/);

	await page.getByRole('link', { name: /Variť/ }).click();
	await page.getByRole('button', { name: 'Začať variť' }).click();
	const first = page.locator('.step-text');
	const before = await first.textContent();
	await page
		.getByRole('button', { name: /Hotovo|a ďalej/ })
		.first()
		.click();
	await expect(first).not.toHaveText(before ?? '');
	await page.getByRole('button', { name: 'Vrátiť posledný krok' }).click();
	await expect(first).toHaveText(before ?? '');
});

test('a kitchen without an oven or gadgets disables what it cannot cook', async ({ page }) => {
	await visit(page, '/kuchyna');
	await page.getByRole('button', { name: /Rúra/ }).click();
	await visit(page, '/jedlo/vyprazane-sampinony');
	await expect(page.getByRole('radio', { name: /V rúre/ }).first()).toBeDisabled();
	await expect(page.getByRole('radio', { name: 'Chrumkavé hranolky' })).toBeDisabled();
});

test('the plate builder fills spots, suggests what fits and opens cooking', async ({ page }) => {
	await visit(page, '/');
	await page.getByRole('button', { name: 'Hlavná časť: vybrať' }).click();
	await page.getByRole('button', { name: /Chrumkavé tofu/ }).click();
	await expect(page).toHaveURL(/hlavne=chrumkave-tofu/);
	await page.getByRole('button', { name: 'Základ: vybrať' }).click();
	await page.getByRole('button', { name: /Jazmínová ryža/ }).click();
	await page.getByRole('button', { name: 'Omáčka: vybrať' }).click();
	await expect(page.getByRole('heading', { name: /Hodí sa/ })).toBeVisible();
	await page.getByRole('button', { name: /Arašidová omáčka/ }).click();
	await expect(page.getByText(/Overené: Misa s tofu/)).toBeVisible();

	await page.getByRole('link', { name: 'Variť' }).click();
	await expect(page).toHaveURL(/\/jedlo\/vlastne\/varim\?/);
	await expect(page.getByText('Chrumkavé tofu · jazmínová ryža · arašidová omáčka')).toBeVisible();
});

test('Prekvap ma puts something on the plate', async ({ page }) => {
	await visit(page, '/');
	await page.getByRole('button', { name: 'Prekvap ma' }).click();
	await expect(page.getByRole('link', { name: 'Variť' })).toBeVisible();
});

test('sweet and savoury plates never mix', async ({ page }) => {
	await visit(page, '/');
	await page.getByRole('button', { name: 'Sladké' }).click();
	await expect(page.getByRole('heading', { name: 'Poskladaj si misku' })).toBeVisible();
	await page.getByRole('button', { name: 'Základ: vybrať' }).click();
	await expect(page.getByRole('button', { name: /Palacinky/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /Chrumkavé tofu/ })).toHaveCount(0);
	await page.getByRole('button', { name: /Palacinky/ }).click();
	await expect(page).toHaveURL(/typ=sladke/);
	await page.getByRole('button', { name: 'Slané' }).click();
	await page.getByRole('button', { name: 'Hlavná časť: vybrať' }).click();
	await expect(page.getByRole('button', { name: /Ovsená kaša/ })).toHaveCount(0);
});

test('a recipe composed from ingredients goes on the plate and cooks', async ({ page }) => {
	await visit(page, '/');
	await page.getByRole('button', { name: 'Hlavná časť: vybrať' }).click();
	await page.getByRole('link', { name: /Zložiť zo surovín/ }).click();
	await page.getByRole('button', { name: /Wok/ }).click();
	for (const name of ['Tofu', 'Mrkva', 'Brokolica', 'Cesnak']) {
		await page
			.getByRole('button', { name: new RegExp(`^${name}`) })
			.first()
			.click();
	}
	await expect(page.getByRole('heading', { name: /Wok: tofu, mrkva a brokolica/ })).toBeVisible();
	await page.getByRole('button', { name: 'Na tanier' }).click();
	await expect(page).toHaveURL(/hlavne=x\.wok\./);
	await page.getByRole('link', { name: 'Variť' }).click();
	await page.getByRole('button', { name: 'Začať variť' }).click();
	await expect(page.locator('.step-text')).toContainText('Priprav suroviny');

	await visit(page, '/');
	await page.getByRole('button', { name: 'Hlavná časť: vybrať' }).click();
	await expect(page.getByRole('heading', { name: 'Moje recepty' })).toBeVisible();
});

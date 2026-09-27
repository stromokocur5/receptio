import { expect, test } from '@playwright/test';
import { visit } from './helpers';

test('a recovery code moves favourites to another browser', async ({ browser }) => {
	const first = await browser.newContext();
	const phone = await first.newPage();
	await visit(phone, '/recepty/falafel');
	await phone.getByRole('button', { name: 'Uložiť medzi obľúbené' }).click();

	await phone.goto('/moje');
	await phone.waitForLoadState('networkidle');
	await phone.getByRole('button', { name: 'Zapnúť a vytvoriť kód' }).click();
	const code = (await phone.locator('code').first().textContent())?.trim() ?? '';
	expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/);
	await expect(phone.getByText(/Uložené/)).toBeVisible();

	const second = await browser.newContext();
	const laptop = await second.newPage();
	await visit(laptop, '/moje');
	await laptop.locator('#sync-code').fill(code);
	await laptop.getByRole('button', { name: 'Pripojiť' }).click();
	await laptop.getByRole('button', { name: 'Áno, nahradiť' }).click();
	await expect(laptop.getByText(/falafel/i).first()).toBeVisible();

	await first.close();
	await second.close();
});

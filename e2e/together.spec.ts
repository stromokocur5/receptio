import { expect, test } from '@playwright/test';
import { visit } from './helpers';

test.skip(({ isMobile }) => isMobile, 'the sync is the same on every screen');

test('shopping together: ticks go both ways between the shared list and the own one', async ({
	browser
}) => {
	const me = await (await browser.newContext()).newPage();
	await visit(me, '/recepty/falafel');
	await me
		.getByRole('button', { name: /^Do plánu/ })
		.first()
		.click();
	await me.goto('/plan#nakup');
	await me.waitForLoadState('networkidle');
	await me.getByRole('button', { name: 'Nakupovať spolu' }).click();
	const link = me.getByRole('link', { name: 'spoločný zoznam' });
	await expect(link).toBeVisible();
	const url = (await link.getAttribute('href'))!;

	const friend = await (await browser.newContext()).newPage();
	await visit(friend, url);
	await expect(friend.getByRole('status')).toContainText('Naživo');
	// The friend picks up the chickpeas: the own list shows them bought.
	await friend.locator('label', { hasText: /Cícer/ }).first().click();
	const mine = me.getByRole('checkbox', { name: /Cícer/ }).first();
	await expect(mine).toBeChecked({ timeout: 20_000 });
	// And back: ticked here, ticked there.
	const other = me.locator('#nakup label:has(input[type=checkbox]:not(:checked))').first();
	const name = (await other.locator('.nm').innerText()).split('\n')[0].trim();
	await other.click();
	await expect(
		friend.getByRole('checkbox', { name: new RegExp(name.split(' (')[0]) }).first()
	).toBeChecked({ timeout: 20_000 });
});

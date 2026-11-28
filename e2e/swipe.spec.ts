import { expect, test, type Page } from '@playwright/test';
import { visit } from './helpers';

test.skip(({ isMobile }) => !isMobile, 'swiping is for phones; one screen size is enough');
test.describe.configure({ mode: 'serial' });

const SHOTS = process.env.SHOTS;

async function swipeRight(page: Page) {
	const card = page.locator('.card-face:not(.back)');
	const box = (await card.boundingBox())!;
	const y = box.y + box.height / 3;
	await page.mouse.move(box.x + box.width / 2, y);
	await page.mouse.down();
	for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + i * 25, y);
	await page.mouse.up();
}

test('two people swiping right on the same recipe get a match, one tap from the plan', async ({
	browser
}) => {
	test.setTimeout(120_000);
	const phone = { viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true };
	const ema = await (await browser.newContext(phone)).newPage();
	await visit(ema, '/domacnost');
	await ema.getByLabel('Názov domácnosti').fill('Byt 4B');
	await ema.getByLabel(/Tvoje meno/).fill('Ema');
	await ema.getByRole('button', { name: 'Založiť' }).click();
	await expect(ema.getByRole('status').filter({ hasText: 'Spojené' })).toBeVisible();
	const code = await ema.evaluate(
		() => JSON.parse(localStorage.getItem('receptio:household') ?? '{}').code as string
	);

	const jano = await (await browser.newContext(phone)).newPage();
	await visit(jano, `/domacnost#d=${code}`);
	await jano.getByRole('button', { name: 'Pripojiť sa' }).click();
	await expect(jano.getByRole('status').filter({ hasText: 'Spojené' })).toBeVisible();
	await jano.getByLabel('Tvoje meno').fill('Jano');
	await jano.getByRole('button', { name: 'Som tu nový' }).click();

	// Jano swipes the first card right.
	await jano.getByRole('button', { name: /Poťahaj recepty/ }).click();
	const dialog = jano.getByRole('dialog', { name: 'Čo budeme jesť?' });
	await expect(dialog).toBeVisible();
	if (SHOTS) await jano.screenshot({ path: `${SHOTS}/swipe-card.png` });
	const title = await dialog.locator('.card-face:not(.back) h3').textContent();
	await swipeRight(jano);
	await expect(dialog.locator('.card-face:not(.back) h3')).not.toHaveText(title!);
	await dialog.getByRole('button', { name: 'Teraz nie' }).click();
	await jano.keyboard.press('Escape');

	// Ema gets Jano's wish first, says yes too: a match.
	await expect(async () => {
		await ema.reload();
		await ema.waitForLoadState('networkidle');
		await expect(ema.getByText(title!).first()).toBeVisible({ timeout: 2000 });
	}).toPass({ timeout: 40_000 });
	await ema.getByRole('button', { name: /Poťahaj recepty/ }).click();
	const hers = ema.getByRole('dialog', { name: 'Čo budeme jesť?' });
	await expect(hers.locator('.card-face:not(.back) h3')).toHaveText(title!);
	await expect(hers.getByText('Chce to aj Jano')).toBeVisible();
	await hers.getByRole('button', { name: 'Chcem', exact: true }).click();
	await expect(hers.getByText('Zhoda!')).toBeVisible();
	// The match covers the cards, so focus moves onto it.
	await expect(hers.getByRole('button', { name: 'Do plánu' })).toBeFocused();
	if (SHOTS) await ema.screenshot({ path: `${SHOTS}/swipe-match.png` });
	await hers.getByRole('button', { name: 'Do plánu' }).click();
	await ema.keyboard.press('Escape');
	const plan = await ema.evaluate(() => localStorage.getItem('receptio:plan') ?? '');
	expect(plan).toContain('recipeId');
});

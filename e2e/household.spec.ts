import { expect, test, type Page } from '@playwright/test';
import { visit } from './helpers';

test.skip(({ isMobile }) => isMobile, 'the sync is the same on every screen');
// The phones share one address and so the sync's rate limit.
test.describe.configure({ mode: 'serial' });

async function createHousehold(page: Page, me: string) {
	await visit(page, '/domacnost');
	await page.getByLabel('Ako sa voláte').fill('Byt 4B');
	await page.getByLabel(/Tvoje meno/).fill(me);
	await page.getByRole('button', { name: 'Založiť' }).click();
	await expect(page.getByRole('status')).toContainText('Spojené');
}

const householdCode = (page: Page) =>
	page.evaluate(
		() => JSON.parse(localStorage.getItem('receptio:household') ?? '{}').code as string
	);

async function addFalafel(page: Page) {
	await visit(page, '/recepty/falafel');
	await page
		.getByRole('button', { name: /^Do plánu/ })
		.first()
		.click();
	await expect(page.getByRole('button', { name: /Pridané/ }).first()).toBeVisible();
}

/** The other phone sees a change with its next sync (every 15 s while visible). */
const SYNCED = { timeout: 25_000 };

test('two phones share the plan, who buys what, the log and the money', async ({ browser }) => {
	// Two phones waiting on each other's sync.
	test.setTimeout(120_000);
	const first = await browser.newContext();
	const ema = await first.newPage();
	await createHousehold(ema, 'Ema');
	const code = await householdCode(ema);

	const second = await browser.newContext();
	const jano = await second.newPage();
	await visit(jano, `/domacnost#d=${code}`);
	await jano.getByRole('button', { name: 'Pripojiť sa' }).click();
	await expect(jano.getByRole('status')).toContainText('Spojené');
	await jano.getByLabel('Tvoje meno').fill('Jano');
	await jano.getByRole('button', { name: 'Som tu nový' }).click();
	await expect(jano.locator('.member', { hasText: 'Jano' })).toContainText('ty');
	// Ema's profile is hers: Jano sees it but can't change or remove it.
	await jano
		.locator('.member', { hasText: 'Ema' })
		.getByRole('button', { name: 'Pozrieť' })
		.click();
	await expect(jano.getByText('Svoj profil si Ema vypĺňa sám')).toBeVisible();
	await expect(jano.getByRole('button', { name: 'Odobrať' })).toHaveCount(0);

	await addFalafel(ema);
	await ema.goto('/plan');
	await ema.waitForLoadState('networkidle');
	await ema
		.getByRole('button', { name: /^Kúpim ja: Cícer/ })
		.first()
		.click();
	await expect(ema.getByText('beriem ja').first()).toBeVisible();

	await jano.goto('/plan');
	await expect(jano.getByText('berie Ema').first()).toBeVisible(SYNCED);

	await jano.goto('/domacnost');
	await expect(jano.getByText(/do plánu: .*falafel/i)).toBeVisible(SYNCED);
	await jano.getByRole('button', { name: 'Zapnúť počítanie výdavkov' }).click();
	await jano.getByLabel('Koľko €').fill('12');
	await jano.getByRole('button', { name: 'Zapísať' }).click();
	await expect(jano.locator('.paybacks')).toContainText(/Ema → Jano\s*6,00/);

	// A new link locks the old one out. One phone at a time: both share the sync's rate limit.
	await jano.close();
	await ema.goto('/domacnost');
	await ema.waitForLoadState('networkidle');
	await ema.getByRole('button', { name: 'Vymeniť odkaz' }).click();
	await ema.getByRole('button', { name: /Naozaj\?/ }).click();
	await expect(ema.locator('.new-link .msg')).toHaveCount(0);
	await expect.poll(() => householdCode(ema), SYNCED).not.toBe(code);
	await ema.close();
	const janoAgain = await second.newPage();
	await visit(janoAgain, '/domacnost');
	await expect(janoAgain.getByRole('status')).toContainText(
		'Pod týmto odkazom už domácnosť nie je',
		SYNCED
	);

	await first.close();
	await second.close();
});

test('the own plan and pantry stay apart from the household', async ({ page }) => {
	await visit(page, '/spajza');
	await page.getByRole('button', { name: /Raňajky/ }).click();
	await expect(page.locator('#moja-spajza')).toContainText('Chia');
	await createHousehold(page, 'Ema');
	await page.goto('/spajza');
	await page.waitForLoadState('networkidle');
	await expect(page.locator('#moja-spajza')).toContainText('Zatiaľ prázdne');
	await page.getByRole('button', { name: 'Len môj' }).click();
	await expect(page.locator('#moja-spajza')).toContainText('Chia');
	await page.getByRole('button', { name: 'Byt 4B' }).click();
	await expect(page.locator('#moja-spajza')).toContainText('Zatiaľ prázdne');
	await page.goto('/domacnost');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Odísť z domácnosti' }).click();
	await page.getByRole('button', { name: /Naozaj odísť/ }).click();
	await page.goto('/spajza');
	await expect(page.locator('#moja-spajza')).toContainText('Chia');
});

test('planning alone keeps an own plan and goes back to the shared one', async ({ page }) => {
	await createHousehold(page, 'Ema');
	await page.getByLabel('Meno nového člena').fill('Jano');
	await page.getByRole('button', { name: 'Pridať', exact: true }).click();
	await addFalafel(page);

	// Now and then something just for one person, without leaving the shared plan.
	await visit(page, '/recepty/dal-makhani');
	await page.getByRole('button', { name: 'Len pre mňa' }).click();
	await page.goto('/plan');
	await page.waitForLoadState('networkidle');
	await expect(page.locator('.personal')).toContainText('Dal makhani (Ema, 1 porc.)');

	await page.goto('/domacnost');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Plánovať pre seba' }).click();
	await expect(page.getByRole('heading', { name: 'Plánuješ pre seba' })).toBeVisible();
	await expect(page.locator('.member').first()).toContainText('preč');

	await page.goto('/plan');
	await page.waitForLoadState('networkidle');
	await expect(page.getByText(/Tvoj vlastný plán/)).toBeVisible();
	await expect(page.getByText(/falafel/i)).toHaveCount(0);

	await page.goto('/domacnost');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Späť k domácnosti' }).click();
	await expect(page.locator('.member').first()).not.toContainText('preč');
	await page.goto('/plan');
	await page.waitForLoadState('networkidle');
	await expect(page.getByText(/falafel/i).first()).toBeVisible();
});

test('a garden is grown together: the other phone gets it', async ({ browser }) => {
	test.setTimeout(90_000);
	const first = await browser.newContext();
	const ema = await first.newPage();
	await ema.addInitScript(() => {
		if (localStorage.getItem('receptio:gardens')) return;
		localStorage.setItem(
			'receptio:gardens',
			JSON.stringify([
				{
					id: 'balkon1',
					name: 'Balkón u nás',
					place: 'balkon',
					area: 4,
					sun: 'slnko',
					level: 1,
					combos: [],
					plants: [{ ingredientId: 'paradajky', count: 3 }],
					done: {},
					harvests: [],
					beds: [],
					savedAt: '2026-05-01'
				}
			])
		);
	});
	await createHousehold(ema, 'Ema');
	await ema.goto('/pestuj');
	await ema.waitForLoadState('networkidle');
	await ema.getByRole('button', { name: 'Pestovať spolu' }).click();
	await expect(ema.getByText('Pestujete spolu')).toBeVisible();
	const code = await householdCode(ema);
	await ema.waitForTimeout(2500);

	const second = await browser.newContext();
	const jano = await second.newPage();
	await visit(jano, `/domacnost#d=${code}`);
	await jano.getByRole('button', { name: 'Pripojiť sa' }).click();
	await expect(jano.getByRole('status')).toContainText('Spojené');
	await jano.goto('/pestuj');
	await jano.waitForLoadState('networkidle');
	await expect(jano.getByText('Balkón u nás').first()).toBeVisible();
	await expect(jano.getByText('Pestujete spolu')).toBeVisible();

	await first.close();
	await second.close();
});

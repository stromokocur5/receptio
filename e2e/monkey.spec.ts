import { expect, test, type Page } from '@playwright/test';
import { visit } from './helpers';

/**
 * An impatient visitor: taps whatever is on screen, several times over and without
 * waiting, types junk into every field and agrees to every question. The app must
 * neither throw nor end up blank.
 */

test.skip(({ isMobile }) => isMobile, 'one screen size is enough to shake the handlers');

const PAGES = [
	'/',
	'/recepty',
	'/recepty/falafel',
	'/plan',
	'/spajza',
	'/zoznam',
	'/moje',
	'/zvysky',
	'/domacnost',
	'/pestuj',
	'/sezona',
	'/suroviny',
	'/kuchyne',
	'/ceny',
	'/data',
	'/navrhni'
];

const JUNK = ['', ' ', '-5', '0', '1e999', '9'.repeat(40), '🥕🥕', '<b>x</b>', 'a'.repeat(300)];

/** Small deterministic random numbers, so a failure can be replayed. */
function random(seed: number) {
	return () => {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return seed / 0x7fffffff;
	};
}

function watch(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (e) => {
		// The test's own start-up script, run on the blank page that "back" can reach.
		if (/localStorage.*Access is denied/.test(e.message) && !page.url().startsWith('http')) return;
		errors.push(`${e.message}\n${e.stack ?? ''}`);
	});
	page.on('console', (m) => {
		if (m.type() !== 'error') return;
		const text = m.text();
		// Offline backends and refused permissions are expected in the test browser.
		if (/Failed to load resource|net::|camera|NotAllowedError|Permission/i.test(text)) return;
		errors.push(text);
	});
	page.on('dialog', (d) => d.accept().catch(() => {}));
	return errors;
}

async function shake(page: Page, path: string, seed: number, moves = 60) {
	const next = random(seed);
	const until = Date.now() + 45_000;
	for (let i = 0; i < moves && Date.now() < until; i++) {
		// A tap may have led somewhere else; the monkey stays on its page.
		if (new URL(page.url()).pathname !== path) {
			await page.goto(path);
			await page.waitForLoadState('domcontentloaded');
		}
		const targets = page.locator(
			'main button:visible, main input:visible:not([type=file]), main select:visible, main textarea:visible, main [role=switch]:visible'
		);
		const count = await targets.count();
		if (!count) break;
		const target = targets.nth(Math.floor(next() * count));
		const tag = await target
			.evaluate((el) => el.tagName + ':' + ((el as HTMLInputElement).type ?? ''))
			.catch(() => '');
		try {
			if (
				tag.startsWith('INPUT:checkbox') ||
				tag.startsWith('INPUT:radio') ||
				tag.startsWith('BUTTON')
			) {
				// Twice or three times in a row, as an unsure thumb does.
				const taps = 1 + Math.floor(next() * 3);
				for (let t = 0; t < taps; t++)
					await target.click({ timeout: 500, force: t > 0, noWaitAfter: true });
			} else if (tag.startsWith('SELECT')) {
				const options = await target.locator('option').count();
				if (options)
					await target.selectOption({ index: Math.floor(next() * options) }, { timeout: 500 });
			} else if (!/INPUT:(range|color|date|time)/.test(tag)) {
				await target.fill(JUNK[Math.floor(next() * JUNK.length)], { timeout: 500 });
				if (next() < 0.5) await target.press('Enter', { timeout: 500 });
			}
		} catch {
			// Covered, disabled or gone while we aimed: like a real tap on a moving page.
		}
	}
}

for (const [n, path] of PAGES.entries()) {
	test(`tapping around ${path} breaks nothing`, async ({ page }) => {
		test.setTimeout(90_000);
		const errors = watch(page);
		await visit(page, path);
		await shake(page, path, n + 1);
		// Still a page with something on it, and still answering.
		await expect(page.locator('#main')).not.toBeEmpty();
		await page.reload();
		await page.waitForLoadState('domcontentloaded');
		await expect(page.locator('#main')).not.toBeEmpty();
		expect(errors, errors.join('\n\n')).toEqual([]);
	});
}

test('jumping back and forth while pages load breaks nothing', async ({ page }) => {
	const errors = watch(page);
	await visit(page, '/');
	for (const path of PAGES.slice(0, 8)) {
		page.goto(path).catch(() => {});
		await page.waitForTimeout(80);
	}
	for (let i = 0; i < 5; i++) {
		page.goBack().catch(() => {});
		await page.waitForTimeout(60);
	}
	await page.goto('/plan');
	await page.waitForLoadState('networkidle');
	await expect(page.locator('#main')).not.toBeEmpty();
	expect(errors, errors.join('\n\n')).toEqual([]);
});

test('a recipe added many times at once is in the plan once per tap that meant it', async ({
	page
}) => {
	const errors = watch(page);
	await visit(page, '/recepty/falafel');
	const add = page.getByRole('button', { name: /^Do plánu/ }).first();
	// Five fast taps toggle five times: the plan ends up agreeing with the button.
	for (let i = 0; i < 5; i++) await add.click({ force: true, noWaitAfter: true });
	const added = await page
		.getByRole('button', { name: /Pridané/ })
		.first()
		.isVisible();
	const plan = await page.evaluate(
		() => JSON.parse(localStorage.getItem('receptio:plan') ?? '[]') as unknown[]
	);
	expect(plan.length).toBe(added ? 1 : 0);
	expect(errors, errors.join('\n\n')).toEqual([]);
});

test('two tabs editing the pantry at the same moment keep both changes', async ({ context }) => {
	const a = await context.newPage();
	const b = await context.newPage();
	const errors = [...watch(a), ...watch(b)];
	await visit(a, '/spajza');
	await visit(b, '/spajza');
	const add = async (page: Page, name: string) => {
		await page.locator('#pantry-q').fill(name);
		await page.locator('button.pick', { hasText: name }).first().click();
	};
	await Promise.all([add(a, 'Cícer'), add(b, 'Ryža')]);
	await a.waitForTimeout(500);
	await a.reload();
	await a.waitForLoadState('networkidle');
	const stored = await a.evaluate(() => localStorage.getItem('receptio:pantry') ?? '');
	expect(stored).toMatch(/cicer|cícer/i);
	expect(stored).toMatch(/ryza|ryža/i);
	expect(errors, errors.join('\n\n')).toEqual([]);
});

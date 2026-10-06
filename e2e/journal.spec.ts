import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { visit } from './helpers';

const day = (back: number) => {
	const d = new Date();
	d.setDate(d.getDate() - back);
	return d.toISOString().slice(0, 10);
};

test.beforeEach(async ({ page }) => {
	await page.addInitScript(
		([today, yesterday, before]) => {
			if (localStorage.getItem('receptio:journal')) return;
			localStorage.setItem(
				'receptio:journal',
				JSON.stringify({
					enabled: true,
					days: {
						[today]: {
							waterMl: 500,
							items: [{ id: 'a', kind: 'recipe', recipeId: 'kokosovy-dal', portions: 1 }]
						},
						[yesterday]: {
							waterMl: 0,
							items: [{ id: 'b', kind: 'recipe', recipeId: 'hummus', portions: 1 }]
						},
						[before]: {
							waterMl: 0,
							items: [{ id: 'c', kind: 'ingredient', ingredientId: 'jablko', grams: 300 }]
						}
					},
					summaries: {}
				})
			);
		},
		[day(0), day(1), day(2)]
	);
});

test('the diary shows the week, what is short and lets vitamins be ticked off', async ({
	page
}) => {
	await visit(page, '/moje');
	await expect(page.getByRole('heading', { name: 'Týždeň v denníku' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Čo ti chýba' })).toBeVisible();

	await page.getByRole('button', { name: /Vitamín B12/ }).click();
	const b12 = page.getByRole('checkbox', { name: 'Vitamín B12' });
	await b12.check();
	await expect(b12).toBeChecked();
	await page.reload();
	await expect(page.getByRole('checkbox', { name: 'Vitamín B12' })).toBeChecked();
});

test('own goals change the bars', async ({ page }) => {
	await visit(page, '/moje');
	await page.getByText('Nastavenia denníka').click();
	await page.getByRole('spinbutton', { name: 'Vláknina (g)' }).fill('60');
	await page.getByRole('spinbutton', { name: 'Vláknina (g)' }).blur();
	await expect(page.getByText(/Vláknina \(g\)/)).toBeVisible();
	const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('receptio:journal')!));
	expect(stored.goals.custom.fiber).toBe(60);
});

test('the diary has no accessibility violations and fits the screen', async ({ page }) => {
	await visit(page, '/moje');
	await page.getByText('Nastavenia denníka').click();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	const { violations } = await new AxeBuilder({ page })
		.include('#dennik')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(
		violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
	).toEqual([]);
});

test('own food from a label is logged per 100 g and kept for next time', async ({ page }) => {
	await visit(page, '/moje');
	await page.getByRole('button', { name: 'Raňajky', exact: true }).click();
	await page.getByRole('button', { name: /Vlastné jedlo/ }).click();
	await page.getByPlaceholder('Napr. sezamová tyčinka').fill('Kváskový chlieb');
	await page.getByRole('button', { name: 'Na 100 g' }).click();
	await page.getByRole('spinbutton', { name: 'Zjedené g' }).fill('150');
	await page.getByRole('spinbutton', { name: 'Bielkoviny g' }).fill('8');
	await page.getByRole('spinbutton', { name: 'Vláknina g' }).fill('6');
	await page.getByText('Ďalšie z obalu').click();
	await page.getByRole('spinbutton', { name: 'Železo mg' }).fill('2');
	await page.getByRole('button', { name: 'Zapísať' }).click();

	await expect(page.getByText('Kváskový chlieb · 150 g')).toBeVisible();
	await expect(page.getByText(/bielk\. 12 g · vlákn\. 9 g/)).toBeVisible();
	await expect(page.getByRole('heading', { name: /^Raňajky/ })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Kváskový chlieb', exact: true })).toBeVisible();
	const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('receptio:journal')!));
	expect(stored.foods[0]).toMatchObject({ name: 'Kváskový chlieb', per100g: true, iron: 2 });
});

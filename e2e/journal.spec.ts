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

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { visit } from './helpers';

const PAGES = [
	'/',
	'/recepty',
	'/recepty/hummus',
	'/plan',
	'/spajza',
	'/pestuj',
	'/wiki',
	'/wiki/ryza',
	'/moje',
	'/suroviny/cicer-suchy',
	'/vybavenie',
	'/kuchyne',
	'/navrhni'
];

for (const path of PAGES) {
	test(`${path} has no accessibility violations`, async ({ page }) => {
		// Long pages full of SVG drawings take axe a while.
		test.setTimeout(120_000);
		await visit(page, path);
		// Cards fade in; mid-animation text would fail the contrast check.
		await page.evaluate(() =>
			Promise.race([
				Promise.all(
					document
						.getAnimations()
						.filter((a) => a.effect?.getTiming().iterations !== Infinity)
						.map((a) => a.finished.catch(() => undefined))
				),
				// Paused or offscreen animations may never finish.
				new Promise((resolve) => setTimeout(resolve, 3000))
			])
		);
		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const summary = violations.map(
			(v) =>
				`${v.id} (${v.impact}): ${v.nodes
					.map((n) => n.target.join(' '))
					.slice(0, 5)
					.join(' | ')}`
		);
		expect(summary).toEqual([]);
	});
}

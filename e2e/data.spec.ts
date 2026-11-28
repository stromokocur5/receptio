import { expect, test } from '@playwright/test';
import { visit } from './helpers';

test('the data page charts a price over time and filters every price', async ({ page }) => {
	await visit(page, '/data?s=mrkva');
	const chart = page.getByRole('slider', { name: /Mrkva.*cena za kg/ });
	await expect(chart).toBeVisible();
	await chart.focus();
	await page.keyboard.press('ArrowLeft');
	await expect(chart).toHaveAttribute('aria-valuetext', /\d+\. \d+\.:/);

	await page
		.getByRole('figure', { name: /Mrkva/ })
		.getByRole('button', { name: 'Tabuľka' })
		.click();
	await expect(page.getByRole('columnheader', { name: 'Deň' })).toBeVisible();

	await page.getByLabel('Hľadať surovinu alebo produkt').fill('sójový nápoj');
	const rows = page.locator('#vsetky tbody tr');
	await expect(rows.first()).toContainText('/l');
});

test('open data is published with its schema', async ({ request }) => {
	const openapi = await (await request.get('/data/v1/openapi.json')).json();
	expect(openapi.openapi).toBe('3.1.0');
	expect(Object.keys(openapi.paths)).toContain('/ceny.json');

	const pack = await (await request.get('/data/v1/datapackage.json')).json();
	const names = pack.resources.map((r: { name: string }) => r.name);
	expect(names).toEqual(expect.arrayContaining(['ceny', 'historia-cien', 'recepty', 'suroviny']));

	const csv = await (await request.get('/data/v1/ceny.csv')).text();
	expect(csv.split('\n')[0]).toBe(
		'ingredient_id,store_id,product,pack,pack_grams,price_eur,unit_price_eur,unit,date,sale_until,online,url'
	);
	const prices = await (await request.get('/data/v1/ceny.json')).json();
	expect(prices.count).toBe(prices.data.length);
});

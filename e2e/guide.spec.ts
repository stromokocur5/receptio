import { expect, test } from '@playwright/test';

test('first visit shows the guide once', async ({ page }) => {
	await page.goto('/');
	const guide = page.getByRole('dialog', { name: 'Sprievodca Receptiom' });
	await expect(guide).toBeVisible();
	await expect(guide.getByRole('heading', { name: 'Vitaj v Receptiu' })).toBeVisible();

	await guide.getByRole('button', { name: 'Teraz nie' }).click();
	await expect(guide.getByRole('heading', { name: 'Nájdi, čo ti chutí' })).toBeVisible();
	await guide.getByRole('button', { name: 'Preskočiť' }).click();
	await expect(guide).toBeHidden();

	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(guide).toBeHidden();
});

test('guide is skipped for someone opening a shared shopping list', async ({ page }) => {
	await page.goto('/zoznam');
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('dialog', { name: 'Sprievodca Receptiom' })).toBeHidden();
});

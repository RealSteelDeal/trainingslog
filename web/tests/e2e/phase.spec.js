import { test, expect } from '@playwright/test';
import { mockApi, login } from '../helpers/mock-api.js';

const monday = () => {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('Phasenwechsel liegt am Konto: zweites Gerät sieht ihn, alte Wochen behalten ihr Soll', async ({ page, browser }) => {
	const db = await mockApi(page);
	await login(page);
	await page.getByRole('radio', { name: /Ab Woche 3/ }).click();
	await expect.poll(() => db.user.phase_log).toEqual([{ phase: 'b', from: monday() }]);

	await page.getByRole('link', { name: 'Auswertungen' }).click();
	await expect(page.locator('.now')).toContainText('/ 40 min');
	const soll = await page.locator('tbody tr td:nth-child(4)').allTextContents();
	expect(soll[0]).toMatch(/\/40$/);
	expect(soll.slice(1).every((t) => t.endsWith('/56'))).toBe(true);

	const other = await browser.newPage();
	await mockApi(other, { db });
	await login(other);
	await expect(other.getByRole('radio', { name: /Ab Woche 3/ })).toHaveAttribute('aria-checked', 'true');
	await other.close();
});

test('Offline gewählte Phase wird später ans Konto übertragen', async ({ page }) => {
	let failWrites = true;
	const db = await mockApi(page, { failWrites: () => failWrites });
	await login(page);
	await page.getByRole('radio', { name: /Ab Woche 3/ }).click();
	await expect(page.getByRole('radio', { name: /Ab Woche 3/ })).toHaveAttribute('aria-checked', 'true');
	expect(db.user.phase_log).toEqual([]);
	failWrites = false;
	await page.reload();
	await expect.poll(() => db.user.phase_log).toEqual([{ phase: 'b', from: monday() }]);
	await expect(page.getByRole('radio', { name: /Ab Woche 3/ })).toHaveAttribute('aria-checked', 'true');
});

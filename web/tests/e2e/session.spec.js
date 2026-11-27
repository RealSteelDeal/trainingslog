import { test, expect } from '@playwright/test';
import { mockApi, login } from '../helpers/mock-api.js';

const item = (page, name) => page.locator('.it').filter({ has: page.locator('h3', { hasText: name }) });

test('Einheit erfassen, neu laden, speichern und hochladen', async ({ page }) => {
	const db = await mockApi(page);
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await login(page);

	await page.locator('.tpl').first().locator('button.primary').click();
	await expect(page).toHaveURL(/\/einheit$/);

	await page.fill('[aria-label="Gewicht Beinpresse"]', '60');
	await page.fill('[aria-label="Gewicht Latzug, enger neutraler Griff"]', '35');
	await page.fill('[aria-label="Wiederholungen Latzug, enger neutraler Griff"]', '13');
	await item(page, 'Beinpresse').locator('[aria-label="Satz 1"]').click();
	await item(page, 'Latzug').locator('[aria-label="Satz 1"]').click();
	await expect(page.locator('.rest.show')).toBeVisible(); // Supersatz-Pause
	await item(page, 'Kabel-Außenrotation').locator('[aria-label="Erledigt"]').click();

	await page.reload();
	await expect(page.locator('[aria-label="Gewicht Beinpresse"]')).toHaveValue('60');
	await expect(item(page, 'Latzug').locator('[aria-label="Satz 1"]')).toHaveAttribute('aria-pressed', 'true');

	await page.fill('textarea', 'Test-Notiz');
	await page.locator('input[type=range]').fill('3');
	await page.click('text=Einheit speichern');
	await expect(page).toHaveURL(/\/$/);
	await expect.poll(() => db.set_logs.length).toBe(2);

	const s = db.sessions[0];
	expect(s).toMatchObject({ kind: 'kraft', phase: 'a', volume_kg: 60 * 15 + 35 * 13, shoulder: 3, note: 'Test-Notiz', user: 'u1' });
	expect(s.prep_done).toEqual(['ar']);
	expect(db.set_logs.map((x) => [x.set_no, x.kg, x.reps])).toEqual([[1, 60, 15], [1, 35, 13]]);
	await expect(page.locator('.recent li')).toHaveCount(1);
	expect(errors).toEqual([]);
});

test('Offline gespeichert, später automatisch hochgeladen', async ({ page, context }) => {
	let offline = false;
	const db = await mockApi(page, { offline: () => offline });
	await login(page);
	await page.locator('.tpl').nth(1).locator('button.primary').click(); // Mittwoch
	offline = true;
	await context.setOffline(true);
	await page.click('text=Einheit speichern');
	await expect(page.getByText('1 Einheit wartet auf Upload')).toBeVisible();
	expect(db.sessions.length).toBe(0);

	offline = false;
	await context.setOffline(false);
	await expect.poll(() => db.sessions.length).toBe(1);
	await expect(page.getByText('wartet auf Upload')).toHaveCount(0);
	expect(db.sessions[0].kind).toBe('ausdauer');
});

test('Vorwerte der letzten Einheit werden angezeigt und vorbelegt', async ({ page }) => {
	const db = await mockApi(page);
	// Neueste zuerst, wie die API mit sort=-created liefert (Mock dreht die Liste um).
	for (const [set_no, reps] of [[1, 15], [2, 14]]) {
		db.set_logs.push({ id: `old${set_no}`, session: 's_alt', set_no, kg: 62.5, reps, expand: { exercise: { key: 'bp' }, session: { id: 's_alt' } } });
	}
	await login(page);
	await page.locator('.tpl').first().locator('button.primary').click();
	await expect(item(page, 'Beinpresse').locator('.last')).toHaveText('Letztes Mal: 62.5 kg × 15 · 62.5 kg × 14');
	await expect(page.locator('[aria-label="Gewicht Beinpresse"]')).toHaveValue('62.5');
});

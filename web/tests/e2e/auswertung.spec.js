import { test, expect, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockApi, login, endTraining } from '../helpers/mock-api.js';
import { loadSeed } from '../helpers/seed.js';

// iPhone 12 (Viewport, Touch) – im vorinstallierten Chromium statt WebKit.
const { defaultBrowserType, ...iphone12 } = devices['iPhone 12'];
test.use({ ...iphone12, timezoneId: 'Europe/Vienna', locale: 'de-AT' });

const seed = loadSeed();
const exId = (key) => seed.exercises.find((e) => e.key === key).id;
const gk = seed.templates.find((t) => t.key === 'gk');
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

const preset = {
	sessions: [
		{ id: 's1', template: gk.id, kind: 'kraft', phase: 'a', started: daysAgo(15), shoulder: 2, client_id: 'c1' },
		{ id: 's2', template: gk.id, kind: 'kraft', phase: 'a', started: daysAgo(8), shoulder: 1, client_id: 'c2' }
	],
	set_logs: [
		{ id: 'l1', session: 's1', exercise: exId('bp'), set_no: 1, kg: 60, reps: 15 },
		{ id: 'l2', session: 's1', exercise: exId('bp'), set_no: 2, kg: 60, reps: 14 },
		{ id: 'l3', session: 's2', exercise: exId('bp'), set_no: 1, kg: 62.5, reps: 15 },
		{ id: 'l4', session: 's2', exercise: exId('bp'), set_no: 2, kg: 62.5, reps: 15 }
	],
	cardio_logs: [
		{ id: 'k1', session: 's1', phase: 'aufwaermen', minutes: 10 },
		{ id: 'k2', session: 's1', phase: 'ausdauer', device: 'rad', minutes: 28 },
		{ id: 'k3', session: 's2', phase: 'ausdauer', device: 'rad', minutes: 28 }
	]
};

test('Verlauf, Wochenübersicht, Schulter und CSV mit Server-Daten', async ({ page }) => {
	await mockApi(page, { preset });
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await login(page);
	await page.getByRole('link', { name: 'Auswertungen' }).click();
	await expect(page).toHaveURL(/\/auswertung/);

	await expect(page.locator('.now')).toContainText('Krafttage');
	await expect(page.locator('.now')).toContainText('/ 56 min');
	await expect(page.getByRole('img', { name: /Ausdauer-Minuten/ })).toBeVisible();
	await expect(page.locator('tbody tr')).toHaveCount(8);

	await page.getByRole('tab', { name: 'Übungen' }).click();
	await expect(page).toHaveURL(/tab=uebung&u=bp/);
	await expect(page.getByRole('img', { name: 'Beinpresse: Gewicht über 2 Einheiten' })).toBeVisible();
	await expect(page.locator('.facts')).toContainText('62,5 kg');
	await page.getByRole('radio', { name: 'Volumen' }).click();
	await expect(page.locator('.facts')).toContainText(/1\s?\.?875 kg/);
	const svg = page.getByRole('img', { name: /Beinpresse/ });
	const box = await svg.boundingBox();
	await page.touchscreen.tap(box.x + box.width - 20, box.y + box.height / 2);
	await expect(page.locator('.tip')).toContainText(/1\s?\.?875 kg/);

	await page.reload();
	await expect(page.getByRole('tab', { name: 'Übungen' })).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('tab', { name: 'Schulter' }).click();
	await expect(page.getByRole('img', { name: /Schulterwert über 2 Einheiten/ })).toBeVisible();

	await page.getByRole('tab', { name: 'Export' }).click();
	const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV herunterladen' }).click()]);
	expect(dl.suggestedFilename()).toMatch(/^trainingslog-\d{4}-\d{2}-\d{2}\.csv$/);
	const csv = readFileSync(await dl.path(), 'utf8');
	expect(csv.charCodeAt(0)).toBe(0xfeff);
	const lines = csv.slice(1).trim().split('\r\n');
	expect(lines[0]).toBe('Datum;Einheit;Phase;Typ;Übung / Gerät;Satz;kg;Wdh;Minuten;Schulter;Status');
	expect(lines.filter((l) => /^[^;]*;[^;]*;[^;]*;Satz;/.test(l))).toHaveLength(4);
	expect(lines.filter((l) => l.includes(';Aufwärmen;'))).toHaveLength(1);
	expect(lines.some((l) => l.includes(';Beinpresse;1;62,5;15;'))).toBe(true);

	for (const t of ['Woche', 'Übungen', 'Schulter', 'Export']) {
		await page.getByRole('tab', { name: t }).click();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	}
	expect(errors).toEqual([]);
});

test('Wartende Outbox-Einheit fließt in alle Auswertungen ein', async ({ page }) => {
	let failWrites = false;
	const db = await mockApi(page, { preset, failWrites: () => failWrites });
	await login(page);
	await page.locator('.tpl').first().locator('button.primary').click();
	await page.fill('[aria-label="Gewicht Beinpresse"]', '70');
	await page.locator('.it').filter({ has: page.locator('h3', { hasText: 'Beinpresse' }) }).locator('[aria-label="Satz 1"]').click();
	await endTraining(page);
	await page.locator('input[type=range]').fill('5');
	await page.getByLabel('Ausdauer-Minuten').fill('30');
	failWrites = true;
	await page.click('text=Einheit speichern');
	await expect(page.getByText('1 Einheit wartet auf Upload')).toBeVisible();
	expect(db.sessions).toHaveLength(2);

	await page.getByRole('link', { name: 'Auswertungen' }).click();
	await expect(page.locator('.pend-note')).toHaveText('1 Einheit noch nicht hochgeladen – bereits eingerechnet');
	await expect(page.locator('.now')).toContainText('30 / 56 min');
	await expect(page.locator('tbody tr').first()).toHaveClass(/pending/);

	await page.getByRole('tab', { name: 'Übungen' }).click();
	await expect(page.getByRole('img', { name: 'Beinpresse: Gewicht über 3 Einheiten' })).toBeVisible();
	await expect(page.locator('.dot.pending')).toHaveCount(1);
	await expect(page.locator('.facts')).toContainText('70 kg');

	await page.getByRole('tab', { name: 'Schulter' }).click();
	await expect(page.locator('.facts')).toContainText('5');

	await page.getByRole('tab', { name: 'Export' }).click();
	const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV herunterladen' }).click()]);
	const csv = readFileSync(await dl.path(), 'utf8');
	expect(csv).toContain(';Satz;Beinpresse;1;70;15;;5;nicht hochgeladen');
	expect(csv).toContain(';Ausdauer;;;;;30;5;nicht hochgeladen');
});

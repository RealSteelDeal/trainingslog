import { test, expect, devices } from '@playwright/test';
import { mockApi, login, endTraining } from '../helpers/mock-api.js';

const { defaultBrowserType, ...iphone12 } = devices['iPhone 12'];
test.use({ ...iphone12, timezoneId: 'Europe/Vienna' });

// Simuliert ein installiertes iPhone mit Push-Unterstützung (im Test läuft kein Service Worker).
async function fakeInstalledPush(page, { permission = 'default' } = {}) {
	await page.addInitScript((perm) => {
		let state = perm;
		Object.defineProperty(Notification, 'permission', { get: () => state, configurable: true });
		Notification.requestPermission = async () => (state = state === 'denied' ? 'denied' : 'granted');
		const real = window.matchMedia.bind(window);
		window.matchMedia = (q) => (q.includes('standalone') ? { matches: true, addEventListener() {}, removeEventListener() {} } : real(q));
		let current = null;
		const sub = {
			endpoint: 'https://push.example/geraet-1',
			options: {},
			toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p', auth: 'a' } }; },
			async unsubscribe() { current = null; return true; }
		};
		const reg = { pushManager: { getSubscription: async () => current, subscribe: async () => (current = sub) } };
		Object.defineProperty(navigator, 'serviceWorker', {
			value: { ready: Promise.resolve(reg), getRegistration: async () => reg, register: async () => reg, addEventListener() {}, controller: null },
			configurable: true
		});
	}, permission);
}

const item = (page, name) => page.locator('.it').filter({ has: page.locator('h3', { hasText: name }) });

test('iPhone im Safari-Tab: Hinweis zum Installieren statt Aktivieren', async ({ page }) => {
	await mockApi(page);
	await login(page);
	await page.getByRole('link', { name: /Einstellungen/ }).click();
	await expect(page.getByText('Erst installieren.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Benachrichtigungen aktivieren' })).toHaveCount(0);
});

test('Aktivieren, Test senden, Ausschalten', async ({ page }) => {
	await fakeInstalledPush(page);
	const db = await mockApi(page);
	await login(page);
	await page.goto('/einstellungen');
	await page.getByRole('button', { name: 'Benachrichtigungen aktivieren' }).click();
	await expect(page.getByText('Aktiv auf diesem Gerät')).toBeVisible();
	expect(db.push[0]).toMatchObject({ path: 'subscribe', body: { endpoint: 'https://push.example/geraet-1', keys: { p256dh: 'p', auth: 'a' }, origin: 'http://127.0.0.1:4173' } });

	await page.getByRole('button', { name: 'Test senden' }).click();
	await expect(page.getByRole('status')).toHaveText('Gesendet an 1 Gerät.');

	await page.getByRole('button', { name: 'Ausschalten' }).click();
	await expect(page.getByRole('button', { name: 'Benachrichtigungen aktivieren' })).toBeVisible();
	expect(db.push.at(-1)).toEqual({ path: 'unsubscribe', body: { endpoint: 'https://push.example/geraet-1' } });
});

test('Blockierte Erlaubnis wird erklärt', async ({ page }) => {
	await fakeInstalledPush(page, { permission: 'denied' });
	await mockApi(page);
	await login(page);
	await page.goto('/einstellungen');
	await expect(page.getByText(/Blockiert\./)).toBeVisible();
});

test('Trainingsplan: Standard, ändern, hinzufügen, entfernen – wird am Konto gespeichert', async ({ page }) => {
	const db = await mockApi(page);
	await login(page);
	await page.goto('/einstellungen');
	await expect(page.locator('.plan-row')).toHaveCount(3);
	await expect(page.getByLabel('Wochentag 1')).toHaveValue('1');
	await expect(page.getByLabel('Uhrzeit 1')).toHaveValue('16:00');
	await expect(page.getByLabel('Wochentag 2')).toHaveValue('3');
	await expect(page.getByLabel('Uhrzeit 2')).toHaveValue('08:00');
	await expect(page.getByRole('radiogroup', { name: 'Art 2' }).getByRole('radio', { name: 'Ausdauertag' })).toHaveAttribute('aria-checked', 'true');

	await page.getByLabel('Uhrzeit 1').fill('17:30');
	await page.getByLabel('Uhrzeit 1').blur();
	await page.getByRole('button', { name: '+ Trainingstag hinzufügen' }).click();
	await page.getByRole('button', { name: 'Freitag entfernen' }).click();
	await page.getByRole('switch', { name: /Wochenrückblick/ }).uncheck();
	await expect(page.getByText('✓ Gespeichert')).toBeVisible();
	await expect.poll(() => db.user.notify?.plan).toEqual([
		{ day: 1, time: '17:30', kind: 'kraft' },
		{ day: 2, time: '16:00', kind: 'kraft' },
		{ day: 3, time: '08:00', kind: 'ausdauer' }
	]);
	expect(db.user.notify).toMatchObject({ weekly: false, rest: true, reminder: true, upload: true, tz: 'Europe/Vienna' });

	await page.reload();
	await expect(page.locator('.plan-row')).toHaveCount(3);
	await expect(page.getByLabel('Uhrzeit 1')).toHaveValue('17:30');
	await expect(page.getByRole('switch', { name: /Wochenrückblick/ })).not.toBeChecked();
});

test('Einheit plant Pausen-, Timer- und Upload-Meldungen und storniert sie wieder', async ({ page }) => {
	const db = await mockApi(page);
	await login(page);
	await page.evaluate(() => localStorage.setItem('tl-push-device', 'https://push.example/geraet-1'));
	await page.locator('.tpl').first().locator('button.primary').click();
	const startedAt = await page.evaluate(() => JSON.parse(localStorage.getItem('tl-live')).startedAt);
	const kinds = () => db.push.map((p) => `${p.path}:${p.body.kind ?? ''}:${p.body.ref}`);
	await expect.poll(kinds).toEqual([`schedule:upload:upload|${startedAt}`]);

	await item(page, 'Crosstrainer, Rad').getByRole('button', { name: 'Start' }).click();
	await item(page, 'Crosstrainer, Rad').getByRole('button', { name: 'Pause' }).click();
	await item(page, 'Beinpresse').locator('[aria-label="Satz 1"]').click();
	await item(page, 'Latzug').locator('[aria-label="Satz 1"]').click();
	await page.locator('.rest button').click();
	const timerRef = `${startedAt}|timer|warm-warm-0`;
	await expect.poll(kinds).toEqual([
		`schedule:upload:upload|${startedAt}`,
		`schedule:timer:${timerRef}`,
		`cancel::${timerRef}`,
		`schedule:rest:${startedAt}|rest`,
		`cancel::${startedAt}|rest`
	]);
	const rest = db.push.find((p) => p.body.kind === 'rest').body;
	expect(rest).toMatchObject({ title: 'Pause vorbei', body: 'Weiter mit Beinpresse.', url: '/einheit' });
	const timer = db.push.find((p) => p.body.kind === 'timer').body;
	expect(timer.title).toBe('Aufwärmen: Zeit ist um');

	db.push.length = 0;
	await endTraining(page);
	await page.click('text=Einheit speichern');
	await expect(page).toHaveURL(/\/$/);
	await expect.poll(kinds).toEqual([`cancel::${startedAt}|`, `schedule:upload:upload|${startedAt}`]);
	expect(db.push[0].body.prefix).toBe(true);
});

test('Ohne angemeldetes Gerät wird nichts geplant', async ({ page }) => {
	const db = await mockApi(page);
	await login(page);
	await page.locator('.tpl').first().locator('button.primary').click();
	await item(page, 'Beinpresse').locator('[aria-label="Satz 1"]').click();
	await item(page, 'Latzug').locator('[aria-label="Satz 1"]').click();
	await expect(page.locator('.rest.show')).toBeVisible();
	expect(db.push).toEqual([]);
});

for (const width of [390, 360]) {
	test(`Einstellungen: kein horizontaler Scroll und Touch-Ziele ≥ 44 px bei ${width} px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 844 });
		await fakeInstalledPush(page);
		await mockApi(page);
		await login(page);
		await page.goto('/einstellungen');
		await page.locator('.plan-row').first().waitFor();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		const small = await page.evaluate(() =>
			[...document.querySelectorAll('main button, main select, main input:not([type=checkbox]), main a, main label')]
				.filter((el) => el.offsetParent)
				.map((el) => { const r = el.getBoundingClientRect(); return { l: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; })
				.filter((r) => r.w < 44 || r.h < 44)
		);
		expect(small).toEqual([]);
	});
}

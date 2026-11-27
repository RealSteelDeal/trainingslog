import { test, expect, devices } from '@playwright/test';
import { mockApi, login } from '../helpers/mock-api.js';

const { defaultBrowserType, ...iphone12 } = devices['iPhone 12'];
test.use({ ...iphone12 });

const item = (page, name) => page.locator('.it').filter({ has: page.locator('h3', { hasText: name }) });

async function startKraft(page) {
	await mockApi(page);
	await login(page);
	await page.locator('.tpl').first().locator('button.primary').click();
	await expect(page).toHaveURL(/\/einheit$/);
}

test('Hilfe-Sheet zeigt Gerät, Ausführung und Schulter-Hinweis', async ({ page }) => {
	await startKraft(page);
	await item(page, 'Hyperextension').getByRole('button', { name: 'Hilfe zu Hyperextension' }).click();
	const sheet = page.getByRole('dialog', { name: 'Hyperextension' });
	await expect(sheet).toBeVisible();
	await expect(sheet).toContainText('Hyperextension-Bank');
	await expect(sheet).toContainText('So geht');
	await expect(sheet).toContainText('Arme vor der Brust verschränken');
	await expect(sheet).toContainText('Alternativen');
	await sheet.getByRole('button', { name: 'Hilfe schließen' }).click();
	await expect(sheet).toBeHidden();

	await item(page, 'Face Pulls').getByRole('button', { name: /Hilfe zu/ }).click();
	await expect(page.getByRole('dialog', { name: 'Face Pulls am Kabel' })).toContainText('Schulterhöhe');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toBeHidden();
});

test('Stepper, Satz-Anzeige und „Jetzt“-Markierung', async ({ page }) => {
	await startKraft(page);
	await expect(page.locator('.it.now')).toHaveCount(1);
	await expect(item(page, 'Crosstrainer, Rad')).toHaveClass(/now/);
	await item(page, 'Crosstrainer, Rad').getByRole('button', { name: 'Erledigt' }).click();
	await expect(item(page, 'Kabel-Außenrotation')).toHaveClass(/now/);
	for (const n of ['Kabel-Außenrotation', 'Pull-Aparts', 'Face Pulls']) await item(page, n).getByRole('button', { name: 'Erledigt' }).click();
	// Supersatz A: beide Übungen sind gleichzeitig dran
	await expect(item(page, 'Beinpresse')).toHaveClass(/now/);
	await expect(item(page, 'Latzug')).toHaveClass(/now/);
	await expect(item(page, 'Beinpresse').locator('.plan')).toHaveText('2 × 12–15 Wdh · dann direkt Latzug');
	await expect(item(page, 'Latzug').locator('.plan')).toHaveText('2 × 12–15 Wdh · danach 75 s Pause');

	const bp = item(page, 'Beinpresse');
	await page.fill('[aria-label="Gewicht Beinpresse"]', '60');
	await bp.getByRole('button', { name: 'Gewicht Beinpresse mehr' }).click();
	await bp.getByRole('button', { name: 'Gewicht Beinpresse mehr' }).click();
	await expect(page.locator('[aria-label="Gewicht Beinpresse"]')).toHaveValue('65');
	await bp.getByRole('button', { name: 'Gewicht Beinpresse weniger' }).click();
	await bp.getByRole('button', { name: 'Wiederholungen Beinpresse weniger' }).click();
	await expect(page.locator('[aria-label="Wiederholungen Beinpresse"]')).toHaveValue('14');
	await bp.locator('[aria-label="Satz 1"]').click();
	await expect(bp.locator('[aria-label="Satz 1"]')).toContainText('62.5 kg × 14');

	await page.reload();
	await expect(page.locator('[aria-label="Gewicht Beinpresse"]')).toHaveValue('62.5');
});

test('Phase wird sofort gemerkt und ändert die Satzzahl', async ({ page }) => {
	await mockApi(page);
	await login(page);
	await page.getByRole('radio', { name: /Ab Woche 3/ }).click();
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tl-phase-log')).log[0].phase)).toBe('b');
	await page.locator('.tpl').first().locator('button.primary').click();
	await expect(item(page, 'Beinpresse').locator('.set')).toHaveCount(3);
});

for (const width of [390, 360]) {
	test(`Kein horizontaler Scroll und Touch-Ziele ≥ 44 px bei ${width} px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 844 });
		await startKraft(page);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		const small = await page.evaluate(() =>
			[...document.querySelectorAll('main button, main input:not([type=range]), main select, main a, header a, header button')]
				.filter((el) => el.offsetParent)
				.map((el) => { const r = el.getBoundingClientRect(); return { l: el.getAttribute('aria-label') || el.textContent.trim(), w: r.width, h: r.height }; })
				.filter((r) => r.w < 44 || r.h < 44)
		);
		expect(small).toEqual([]);
		await page.goto('/');
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		await page.goto('/auswertung');
		await expect(page.getByRole('tab', { name: 'Woche' })).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
	});
}

test('Kopfzeile verkleinert sich beim Scrollen und bleibt oben', async ({ page }) => {
	await startKraft(page);
	const bar = page.locator('header.bar');
	const tall = (await bar.boundingBox()).height;
	await page.mouse.wheel(0, 1500);
	await expect(bar).toHaveClass(/compact/);
	const box = await bar.boundingBox();
	expect(box.y).toBe(0);
	expect(box.height).toBeLessThan(tall);
	await expect(page.getByRole('button', { name: /Steuerung öffnen/ })).toBeVisible();
});

test('Steuerung: Pause, Beenden mit Sicherheitsfrage, Abschlussfragen erst danach', async ({ page }) => {
	await startKraft(page);
	await expect(page.getByRole('heading', { name: 'Einheit abschließen' })).toHaveCount(0);
	await expect(page.getByText('Einheit speichern')).toHaveCount(0);

	await page.getByRole('button', { name: /Steuerung öffnen/ }).click();
	const sheet = page.getByRole('dialog', { name: 'Training' });
	await sheet.getByRole('button', { name: 'Zeit pausieren' }).click();
	await expect(sheet).toContainText('pausiert');
	await sheet.getByRole('button', { name: 'Training beenden' }).click();
	const confirm = page.getByRole('dialog', { name: 'Training beenden?' });
	await expect(confirm).toContainText('Noch 12 Übungen offen');
	await confirm.getByRole('button', { name: 'Abbrechen' }).click();
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(page.locator('.it').first()).toBeVisible();

	await page.getByRole('button', { name: /Steuerung öffnen/ }).click();
	await page.getByRole('dialog', { name: 'Training' }).getByRole('button', { name: 'Training beenden' }).click();
	await page.getByRole('button', { name: 'Ja, beenden' }).click();
	await expect(page.getByRole('heading', { name: 'Einheit abschließen' })).toBeVisible();
	await expect(page.locator('.it')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Zeit pausieren' })).toHaveCount(0);

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Einheit abschließen' })).toBeVisible();
	await page.getByRole('button', { name: 'Zurück zum Training' }).click();
	await expect(page.locator('.it').first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Zeit pausieren' })).toBeVisible();
});

test('Verwerfen nur nach Sicherheitsfrage', async ({ page }) => {
	await startKraft(page);
	await page.getByRole('button', { name: /Steuerung öffnen/ }).click();
	await page.getByRole('button', { name: 'Einheit verwerfen' }).click();
	const confirm = page.getByRole('dialog', { name: 'Einheit verwerfen?' });
	await confirm.getByRole('button', { name: 'Abbrechen' }).click();
	await expect(page).toHaveURL(/\/einheit$/);
	await page.getByRole('button', { name: /Steuerung öffnen/ }).click();
	await page.getByRole('button', { name: 'Einheit verwerfen' }).click();
	await page.getByRole('button', { name: 'Ja, verwerfen' }).click();
	await expect(page).toHaveURL(/\/$/);
	expect(await page.evaluate(() => localStorage.getItem('tl-live'))).toBeNull();
});

test('Kopfzeile flackert nicht an der Umschaltschwelle', async ({ page }) => {
	await startKraft(page);
	for (const y of [30, 40, 50, 64, 70]) {
		await page.evaluate((v) => scrollTo(0, v), y);
		const states = await page.evaluate(() => new Promise((res) => {
			const out = [];
			const f = () => { out.push(document.querySelector('header.bar').classList.contains('compact')); out.length < 10 ? requestAnimationFrame(f) : res(out); };
			f();
		}));
		expect(new Set(states.slice(3)).size, `scrollY ${y}`).toBe(1);
	}
});

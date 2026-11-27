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
	expect(await page.evaluate(() => localStorage.getItem('tl-phase'))).toBe('b');
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

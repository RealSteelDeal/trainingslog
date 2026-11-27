// Simuliert die PocketBase-API im Browser-Test. Gibt das In-Memory-„db“ zurück.
import { loadSeed } from './seed.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id: 'u1', type: 'auth', collectionId: '_pb_users_auth_', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;
const user = { id: 'u1', email: 'test@example.at', collectionId: '_pb_users_auth_', collectionName: 'users' };

// `db` aus einem früheren Aufruf übergeben, um ein zweites Gerät mit demselben Konto zu simulieren.
export async function mockApi(page, { offline = () => false, failWrites = () => false, preset = {}, db: shared = null } = {}) {
	const seed = loadSeed();
	const db = shared || { sessions: [], set_logs: [], cardio_logs: [], user: { ...user, phase_log: [] }, patches: [], ...structuredClone(preset) };
	const list = (items) => ({ page: 1, perPage: 500, totalItems: items.length, totalPages: 1, items });
	await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
	await page.route(/\/api\//, async (route) => {
		if (offline()) return route.abort('internetdisconnected');
		const req = route.request();
		const url = req.url();
		if (/auth-with-password|auth-refresh/.test(url)) return route.fulfill({ json: { token, record: db.user } });
		const c = /\/collections\/([a-z_]+)\/records/.exec(url)?.[1];
		if (!c) return route.fulfill({ status: 404, json: {} });
		if (c === 'users') {
			if (req.method() === 'PATCH') {
				if (failWrites()) return route.fulfill({ status: 503, json: { message: 'Wartung' } });
				const d = JSON.parse(req.postData());
				db.patches.push(d);
				Object.assign(db.user, d);
			}
			return route.fulfill({ json: db.user });
		}
		if (req.method() === 'POST') {
			if (failWrites()) return route.fulfill({ status: 503, json: { message: 'Wartung' } });
			const d = { ...JSON.parse(req.postData()), id: `${c}_${db[c].length}`, created: new Date().toISOString() };
			db[c].push(d);
			return route.fulfill({ json: d });
		}
		if (c in seed) return route.fulfill({ json: list(seed[c]) });
		return route.fulfill({ json: list([...(db[c] || [])].reverse()) });
	});
	return db;
}

export async function login(page) {
	await page.goto('/');
	await page.fill('input[type=email]', 'test@example.at');
	await page.fill('input[type=password]', 'x');
	await page.click('button:has-text("Anmelden")');
	await page.waitForSelector('text=Ganzkörper · Krafttag');
}

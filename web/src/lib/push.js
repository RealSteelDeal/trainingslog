import { pb } from './pb.js';
import { readNotify } from './notify.js';

// Web Push: Gerät an- und abmelden, Pausen-/Timer-/Upload-Meldungen beim Server planen.
// Geplant wird nur, wenn dieses Gerät angemeldet ist; Fehler (z. B. kein Netz) werden
// still ignoriert – die App zeigt Pausen und Timer ohnehin selbst an.

const DEVICE = 'tl-push-device';

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** 'ok' | 'install' (iOS: erst zum Home-Bildschirm) | 'none' */
export function pushSupport() {
	if (typeof window === 'undefined') return 'none';
	if (isIos() && !isStandalone()) return 'install';
	if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'none';
	return 'ok';
}

export const permission = () => (typeof Notification === 'undefined' ? 'default' : Notification.permission);

export function deviceEnabled() {
	try { return !!localStorage.getItem(DEVICE); } catch { return false; }
}

function keyBytes(b64) {
	const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
	return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function sameKey(sub, key) {
	const k = sub.options?.applicationServerKey;
	if (!k) return true;
	const a = new Uint8Array(k);
	const b = keyBytes(key);
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function register(sub) {
	const j = sub.toJSON();
	await pb.send('/api/push/subscribe', {
		method: 'POST',
		body: { endpoint: j.endpoint, keys: j.keys, origin: location.origin, ua: navigator.userAgent.slice(0, 300) }
	});
	localStorage.setItem(DEVICE, j.endpoint);
}

/** Muss aus einem Tipp heraus aufgerufen werden (iOS fragt sonst nicht nach). */
export async function enablePush() {
	const perm = await Notification.requestPermission();
	if (perm !== 'granted') throw new Error(perm === 'denied' ? 'denied' : 'dismissed');
	const [reg, { publicKey }] = await Promise.all([navigator.serviceWorker.ready, pb.send('/api/push/key', {})]);
	let sub = await reg.pushManager.getSubscription();
	if (sub && !sameKey(sub, publicKey)) {
		await sub.unsubscribe();
		sub = null;
	}
	sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
	await register(sub);
}

export async function disablePush() {
	const reg = await navigator.serviceWorker?.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	const endpoint = sub?.endpoint || localStorage.getItem(DEVICE);
	try { if (endpoint) await pb.send('/api/push/unsubscribe', { method: 'POST', body: { endpoint } }); } catch { /* offline: Server räumt beim nächsten 410 auf */ }
	try { await sub?.unsubscribe(); } catch { /* bereits weg */ }
	localStorage.removeItem(DEVICE);
}

/** Beim Start: Abo des Geräts mit dem Server abgleichen (z. B. nach Erneuerung durch den Browser). */
export async function refreshPush() {
	if (!deviceEnabled() || pushSupport() !== 'ok' || permission() !== 'granted' || !pb.authStore.isValid) return;
	try {
		const reg = await navigator.serviceWorker.getRegistration();
		const sub = await reg?.pushManager.getSubscription();
		if (!sub) { localStorage.removeItem(DEVICE); return; }
		if (sub.endpoint !== localStorage.getItem(DEVICE)) await register(sub);
	} catch { /* nächster Versuch beim nächsten Start */ }
}

export const sendTest = () => pb.send('/api/push/test', { method: 'POST' });

// keepalive: Die Anfrage überlebt auch, wenn iOS die App direkt danach in den Hintergrund schickt.
const keepalive = (url, opts) => fetch(url, { ...opts, keepalive: true });

function post(path, body) {
	return pb.send(path, { method: 'POST', body, requestKey: null, fetch: keepalive }).catch(() => {});
}

/** kind: 'rest' | 'timer' | 'upload'; gleiche ref ersetzt einen offenen Job. */
export function schedulePush(kind, ref, fireAt, { title, body = '', url = '/' }) {
	if (!deviceEnabled() || !pb.authStore.isValid) return;
	const n = readNotify();
	if ((kind === 'upload' && !n.upload) || (kind !== 'upload' && !n.rest)) return;
	return post('/api/push/schedule', { kind, ref, fireAt: new Date(fireAt).toISOString(), title, body, url });
}

export function cancelPush(ref, prefix = false) {
	if (!deviceEnabled() || !pb.authStore.isValid) return;
	return post('/api/push/cancel', { ref, prefix });
}

const HOUR = 3600 * 1000;
export const uploadRef = (startedAt) => `upload|${startedAt}`;

/** Erinnerung, falls die Einheit nach 12 Stunden noch nicht am Server ist. */
export function scheduleUploadCheck(startedAt, now = Date.now()) {
	const at = Math.max(new Date(startedAt).getTime() + 12 * HOUR, now + 3 * HOUR);
	return schedulePush('upload', uploadRef(startedAt), at, {
		title: 'Einheit noch nicht hochgeladen',
		body: 'Öffne den Trainingslog kurz mit Netz, dann wird sie übertragen. Verworfen? Dann ignorieren.',
		url: '/'
	});
}

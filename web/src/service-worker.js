/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

// App-Shell offline verfügbar machen. API-Aufrufe (/api) gehen immer ans Netz;
// Schreibzugriffe ohne Netz übernimmt die Outbox der App (lib/outbox.js).
const CACHE = `shell-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (e) => {
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (e) => {
	const url = new URL(e.request.url);
	if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/_')) return;
	e.respondWith(
		caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('/index.html')))
	);
});

// Push: Ab iOS 18.4 zeigt Safari Declarative-Web-Push-Nachrichten selbst an; ältere
// Browser landen hier. Jede Nachricht muss sichtbar angezeigt werden, sonst entzieht
// Safari die Erlaubnis.
self.addEventListener('push', (e) => {
	let data = {};
	try { data = e.data?.json() ?? {}; } catch { /* kein JSON */ }
	const n = data.notification || {};
	e.waitUntil(
		self.registration.showNotification(n.title || 'Trainingslog', {
			body: n.body || '',
			tag: n.tag,
			lang: 'de-AT',
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			data: { url: n.navigate || '/' }
		})
	);
});

self.addEventListener('notificationclick', (e) => {
	e.notification.close();
	const url = e.notification.data?.url || '/';
	e.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
			const win = list.find((c) => new URL(c.url).origin === location.origin);
			if (!win) return self.clients.openWindow(url);
			return win.focus().then((w) => w.navigate?.(url)).catch(() => {});
		})
	);
});

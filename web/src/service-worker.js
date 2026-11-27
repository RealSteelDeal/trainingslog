/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

// App-Shell offline verfügbar machen. API-Aufrufe (/api) gehen immer ans Netz;
// die Offline-Warteschlange für Einheiten kommt im MVP.
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

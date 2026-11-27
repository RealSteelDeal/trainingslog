import { pb } from './pb.js';
import { cachedCatalog } from './data.js';

// Gespeicherte Einheiten landen zuerst hier (localStorage) und werden
// hochgeladen, sobald Netz und gültige Anmeldung da sind. Jeder Schritt wird
// gemerkt, damit ein Abbruch mittendrin nichts doppelt anlegt.

const KEY = 'tl-outbox';
const listeners = new Set();

export const readOutbox = () => {
	try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
};
const writeOutbox = (items) => {
	localStorage.setItem(KEY, JSON.stringify(items));
	listeners.forEach((f) => f(items));
};
export const onOutbox = (f) => { listeners.add(f); return () => listeners.delete(f); };

export function enqueue(entry) {
	const items = readOutbox();
	items.push({ ...entry, sessionId: null, doneSets: 0, doneCardio: 0, error: '' });
	writeOutbox(items);
}

let running = null;
export function flush() {
	if (!running) running = doFlush().finally(() => (running = null));
	return running;
}

async function findSession(clientId) {
	const safe = clientId.replace(/[^0-9A-Za-z-]/g, '');
	try { return (await pb.collection('sessions').getFirstListItem(`client_id="${safe}"`)).id; } catch { return null; }
}

async function doFlush() {
	if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
	if (!pb.authStore.isValid) return;
	const { exercises, templates } = cachedCatalog();
	const exId = Object.fromEntries(exercises.map((e) => [e.key, e.id]));
	const tplId = Object.fromEntries(templates.map((t) => [t.key, t.id]));
	const uid = pb.authStore.record?.id;

	let items = readOutbox();
	while (items.length) {
		const it = items[0];
		const save = () => { items[0] = it; writeOutbox(items); };
		try {
			if (!it.sessionId) {
				try {
					const rec = await pb.collection('sessions').create({ ...it.session, user: uid, template: tplId[it.tplKey] || '', client_id: it.client_id });
					it.sessionId = rec.id;
				} catch (e) {
					const existing = e?.status === 400 ? await findSession(it.client_id) : null;
					if (!existing) throw e;
					it.sessionId = existing;
				}
				save();
			}
			while (it.doneSets < it.sets.length) {
				const s = it.sets[it.doneSets];
				if (exId[s.key]) await pb.collection('set_logs').create({ session: it.sessionId, exercise: exId[s.key], set_no: s.set_no, kg: s.kg, reps: s.reps });
				it.doneSets++;
				save();
			}
			while (it.doneCardio < it.cardio.length) {
				await pb.collection('cardio_logs').create({ session: it.sessionId, ...it.cardio[it.doneCardio] });
				it.doneCardio++;
				save();
			}
			items = readOutbox().slice(1);
			writeOutbox(items);
		} catch (e) {
			// Netz weg oder Server-Fehler: Stand bleibt erhalten, nächster Versuch später.
			it.error = e?.status === 0 || e?.isAbort ? '' : String(e?.message || e).slice(0, 200);
			save();
			return;
		}
	}
}

if (typeof window !== 'undefined') {
	window.addEventListener('online', () => flush());
}

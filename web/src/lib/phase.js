import { pb } from './pb.js';
import { weekStart } from './stats.js';

// Phasenwechsel liegen am Benutzerkonto (users.phase_log) und lokal als Cache.
// Ein Wechsel gilt ab dem Montag der Woche, in der er eingestellt wurde.
// Offline geänderte Werte bleiben als "dirty" markiert und werden später hochgeladen.

const KEY = 'tl-phase-log';
const LEGACY = 'tl-phase';
export const DEFAULT_PHASE = 'a';
const listeners = new Set();

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sorted = (log) => [...log].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
const valid = (log) => (Array.isArray(log) ? log.filter((e) => e && typeof e.phase === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.from)) : []);

function read() {
	try {
		const st = JSON.parse(localStorage.getItem(KEY));
		if (st) return { log: valid(st.log), dirty: !!st.dirty, known: true };
	} catch { /* leer oder kaputt */ }
	return { log: [], dirty: false, known: false };
}
function write(log, dirty) {
	try { localStorage.setItem(KEY, JSON.stringify({ log, dirty })); } catch { /* voll oder gesperrt */ }
	listeners.forEach((f) => f(log));
}

export const cachedPhaseLog = () => read().log;
export const onPhaseLog = (f) => { listeners.add(f); return () => listeners.delete(f); };

/** Phase, die in der Woche von `date` gilt. Vor dem ersten Eintrag gilt die Startphase. */
export function phaseAt(log, date, fallback = DEFAULT_PHASE) {
	const k = dayKey(weekStart(date));
	let phase = fallback;
	for (const e of sorted(log)) if (e.from <= k) phase = e.phase;
	return phase;
}

/** Neues Log mit `phase` ab der Woche von `now`; ein Wechsel in derselben Woche ersetzt den vorigen. */
export function withPhase(log, phase, now = new Date()) {
	const from = dayKey(weekStart(now));
	const before = sorted(log).filter((e) => e.from < from);
	return phaseAt(before, now) === phase ? before : [...before, { phase, from }];
}

export function setPhase(phase, now = new Date()) {
	const log = withPhase(read().log, phase, now);
	write(log, true);
	syncPhaseLog();
	return log;
}

let running = null;
export function syncPhaseLog() {
	if (!running) running = doSync().finally(() => (running = null));
	return running;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function doSync() {
	if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
	const uid = pb.authStore.isValid ? pb.authStore.record?.id : null;
	if (!uid) return;
	const st = read();
	try {
		if (st.dirty) {
			await pb.collection('users').update(uid, { phase_log: st.log });
			if (same(read().log, st.log)) write(st.log, false);
			return;
		}
		const rec = await pb.collection('users').getOne(uid, { fields: 'phase_log' });
		if (read().dirty) return; // während der Abfrage lokal geändert
		const server = sorted(valid(rec.phase_log));
		let legacy = null;
		try { legacy = localStorage.getItem(LEGACY); localStorage.removeItem(LEGACY); } catch { /* gesperrt */ }
		// Einmalige Übernahme der früheren, nur lokal gespeicherten Auswahl.
		if (!server.length && !st.known && legacy && legacy !== DEFAULT_PHASE) {
			write(withPhase([], legacy), true);
			return doSync();
		}
		if (!same(server, st.log) || !st.known) write(server, false);
	} catch { /* offline oder Server-Fehler: nächster Versuch beim nächsten Laden */ }
}

if (typeof window !== 'undefined') {
	window.addEventListener('online', () => syncPhaseLog());
}

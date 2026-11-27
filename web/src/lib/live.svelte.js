// Laufende Einheit. Liegt im localStorage, damit Neuladen, Bildschirmsperre
// oder ein Funkloch nichts kaputt machen. Zeiten werden aus Zeitstempeln
// berechnet, nicht hochgezählt – so laufen sie auch im Hintergrund weiter.

const KEY = 'tl-live';

const load = () => {
	try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
};

export const live = $state({ s: typeof localStorage !== 'undefined' ? load() : null });

export function persist() {
	try {
		if (live.s) localStorage.setItem(KEY, JSON.stringify(live.s));
		else localStorage.removeItem(KEY);
	} catch { /* voll oder gesperrt */ }
}

export function startSession(tplKey, phaseKey) {
	live.s = {
		tplKey,
		phaseKey,
		startedAt: new Date().toISOString(),
		clock: { acc: 0, since: Date.now() },
		inputs: {},
		sets: {},
		checks: {},
		timers: {},
		rest: null,
		fin: { shoulder: 0, note: '', cardio: '', device: '' }
	};
	persist();
}

export function discardSession() {
	live.s = null;
	persist();
}

export const elapsedSec = (clock, now) => Math.round(clock.acc + (clock.since ? (now - clock.since) / 1000 : 0));
export const timerLeft = (t, now) => Math.max(0, t.left - (t.since ? (now - t.since) / 1000 : 0));

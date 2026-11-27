import { pb } from './pb.js';

const KEY = 'tl-stats';
const DAY = 86400000;
const EMPTY = { at: null, sessions: [], sets: [], cardio: [] };

export const WHO_MINUTES = 150;
export const KRAFT_SOLL = 2;

/** Rohdaten vom Server; offline der zuletzt geladene Stand. */
export async function loadStatsData() {
	try {
		const [sessions, sets, cardio] = await Promise.all([
			pb.collection('sessions').getFullList({ fields: 'id,template,kind,phase,started,duration_min,shoulder,client_id' }),
			pb.collection('set_logs').getFullList({ fields: 'session,exercise,set_no,kg,reps' }),
			pb.collection('cardio_logs').getFullList({ fields: 'session,phase,device,minutes' })
		]);
		const data = { at: new Date().toISOString(), sessions, sets, cardio };
		try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* voll oder gesperrt */ }
		return { ...data, offline: false };
	} catch {
		let cached = null;
		try { cached = JSON.parse(localStorage.getItem(KEY)); } catch { /* leer */ }
		return { ...(cached || EMPTY), offline: true };
	}
}

/**
 * Server-Einheiten und wartende Outbox-Einträge zu einer Liste zusammenführen.
 * Ein Outbox-Eintrag gewinnt gegen die Server-Einheit mit gleicher client_id,
 * weil deren Kind-Datensätze nach einem Abbruch noch unvollständig sein können.
 */
export function buildEntries(data, outbox, catalog) {
	const exKey = Object.fromEntries(catalog.exercises.map((e) => [e.id, e.key]));
	const tplById = Object.fromEntries(catalog.templates.map((t) => [t.id, t]));
	const tplByKey = Object.fromEntries(catalog.templates.map((t) => [t.key, t]));
	const pendingIds = new Set(outbox.map((o) => o.client_id));

	const setsBy = {};
	for (const l of data.sets) {
		if (!exKey[l.exercise]) continue;
		if (!setsBy[l.session]) setsBy[l.session] = [];
		setsBy[l.session].push({ key: exKey[l.exercise], set_no: l.set_no, kg: Number(l.kg) || 0, reps: Number(l.reps) || 0 });
	}
	const cardioBy = {};
	for (const c of data.cardio) {
		if (!cardioBy[c.session]) cardioBy[c.session] = [];
		cardioBy[c.session].push({ phase: c.phase, device: c.device || '', minutes: Number(c.minutes) || 0 });
	}

	const server = data.sessions
		.filter((s) => !s.client_id || !pendingIds.has(s.client_id))
		.map((s) => ({
			id: s.id,
			started: s.started,
			name: tplById[s.template]?.name || (s.kind === 'kraft' ? 'Krafttag' : 'Ausdauertag'),
			kind: s.kind,
			phase: s.phase || '',
			shoulder: Number(s.shoulder) || 0,
			pending: false,
			sets: (setsBy[s.id] || []).sort((a, b) => a.set_no - b.set_no),
			cardio: cardioBy[s.id] || []
		}));
	const pending = outbox.map((o) => ({
		id: o.client_id,
		started: o.session.started,
		name: tplByKey[o.tplKey]?.name || o.tplKey,
		kind: o.session.kind,
		phase: o.session.phase || '',
		shoulder: Number(o.session.shoulder) || 0,
		pending: true,
		sets: o.sets.map((x) => ({ key: x.key, set_no: x.set_no, kg: Number(x.kg) || 0, reps: Number(x.reps) || 0 })),
		cardio: o.cardio.map((c) => ({ phase: c.phase, device: c.device || '', minutes: Number(c.minutes) || 0 }))
	}));
	return [...server, ...pending]
		.filter((e) => !Number.isNaN(new Date(e.started).getTime()))
		.sort((a, b) => new Date(a.started) - new Date(b.started));
}

/** Pro Einheit: schwerstes Gewicht, Ø Wiederholungen je Satz, Volumen (Σ kg × Wdh). */
export function exerciseSeries(entries, key) {
	const out = [];
	for (const e of entries) {
		const sets = e.sets.filter((s) => s.key === key);
		if (!sets.length) continue;
		const reps = sets.reduce((a, s) => a + s.reps, 0);
		out.push({
			date: new Date(e.started),
			kg: Math.max(...sets.map((s) => s.kg)),
			reps: Math.round((reps / sets.length) * 10) / 10,
			volume: Math.round(sets.reduce((a, s) => a + s.kg * s.reps, 0)),
			sets: sets.length,
			pending: e.pending
		});
	}
	return out;
}

export const shoulderSeries = (entries) => entries.map((e) => ({ date: new Date(e.started), value: e.shoulder, pending: e.pending }));

/** Montag 0:00 Ortszeit der Woche, in der d liegt. */
export function weekStart(d) {
	const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
	return m;
}

/** ISO-Kalenderwoche (Woche mit dem Donnerstag zählt). */
export function isoWeek(d) {
	const th = weekStart(d);
	th.setDate(th.getDate() + 3);
	const jan1 = new Date(th.getFullYear(), 0, 1);
	return { year: th.getFullYear(), week: 1 + Math.floor(Math.round((th - jan1) / DAY) / 7) };
}

/** Ausdauer-Soll pro Woche: 2 × cardio_min der gewählten Phase des Krafttags. */
export function cardioSoll(templates, phaseKey) {
	const kraft = templates.find((t) => t.kind === 'kraft' && t.phases?.length);
	const phase = kraft?.phases.find((p) => p.key === phaseKey) || kraft?.phases[0];
	return phase ? KRAFT_SOLL * Number(phase.cardio_min) : 0;
}

/** Die letzten `weeks` Wochen bis einschließlich der aktuellen, älteste zuerst. `soll`: Zahl oder (Wochenstart) => Zahl. */
export function weekSummary(entries, { soll, now = new Date(), weeks = 8 }) {
	const out = [];
	const current = weekStart(now);
	for (let i = weeks - 1; i >= 0; i--) {
		const start = new Date(current);
		start.setDate(start.getDate() - i * 7);
		const end = new Date(start);
		end.setDate(end.getDate() + 7);
		const inWeek = entries.filter((e) => { const d = new Date(e.started); return d >= start && d < end; });
		const minutes = (phase) => inWeek.reduce((a, e) => a + e.cardio.filter((c) => c.phase === phase).reduce((b, c) => b + c.minutes, 0), 0);
		const zone2 = minutes('ausdauer');
		const warm = minutes('aufwaermen');
		const { year, week } = isoWeek(start);
		out.push({
			key: `${year}-W${String(week).padStart(2, '0')}`,
			week,
			start,
			kraft: inWeek.filter((e) => e.kind === 'kraft').length,
			kraftSoll: KRAFT_SOLL,
			bonus: inWeek.filter((e) => e.kind !== 'kraft').length,
			zone2,
			warm,
			total: zone2 + warm,
			soll: typeof soll === 'function' ? soll(start) : soll,
			pending: inWeek.some((e) => e.pending)
		});
	}
	return out;
}

const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const dec = (n) => (n === '' || n == null ? '' : String(n).replace('.', ','));
const cell = (v) => {
	const s = String(v ?? '');
	return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_HEADER = ['Datum', 'Einheit', 'Phase', 'Typ', 'Übung / Gerät', 'Satz', 'kg', 'Wdh', 'Minuten', 'Schulter', 'Status'];

/** Langformat für Excel (AT): Semikolon, Dezimalkomma, CRLF. Eine Zeile pro Satz bzw. Cardio-Eintrag. */
export function toCsv(entries, exercises) {
	const name = Object.fromEntries(exercises.map((e) => [e.key, e.name]));
	const rows = [CSV_HEADER];
	for (const e of entries) {
		const base = [fmtDate(new Date(e.started)), e.name, e.phase];
		const tail = [dec(e.shoulder), e.pending ? 'nicht hochgeladen' : ''];
		for (const s of e.sets) rows.push([...base, 'Satz', name[s.key] || s.key, s.set_no, dec(s.kg), s.reps, '', ...tail]);
		for (const c of e.cardio) rows.push([...base, c.phase === 'aufwaermen' ? 'Aufwärmen' : 'Ausdauer', c.device, '', '', '', dec(c.minutes), ...tail]);
	}
	return rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

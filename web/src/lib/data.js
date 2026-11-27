import { pb } from './pb.js';

const CAT_KEY = 'tl-catalog';
const LAST_KEY = 'tl-last';

const read = (k, d) => {
	try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
};
const write = (k, v) => {
	try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* voll oder gesperrt */ }
};

/** Übungen und Vorlagen – online frisch, offline aus dem Cache. */
export async function loadCatalog() {
	try {
		const [exercises, templates] = await Promise.all([
			pb.collection('exercises').getFullList({ sort: 'name' }),
			pb.collection('templates').getFullList({ sort: 'sort' })
		]);
		const cat = {
			exercises: exercises.map(({ id, key, name, kind, hint }) => ({ id, key, name, kind, hint })),
			templates: templates.map(({ id, key, name, kind, phases, blocks }) => ({ id, key, name, kind, phases, blocks }))
		};
		write(CAT_KEY, cat);
		return cat;
	} catch {
		return read(CAT_KEY, { exercises: [], templates: [] });
	}
}

export const cachedCatalog = () => read(CAT_KEY, { exercises: [], templates: [] });

/** Werte wie "phase.sets" oder "phase.cardio_min*60" aus der gewählten Phase auflösen. */
export function resolveValue(v, phase) {
	if (typeof v !== 'string' || !v.startsWith('phase.')) return v;
	const m = /^phase\.([a-z_]+)(?:\*(\d+(?:\.\d+)?))?$/.exec(v);
	if (!m || !phase || !(m[1] in phase)) return null;
	return Number(phase[m[1]]) * (m[2] ? Number(m[2]) : 1);
}

/** Vorlage für eine Phase in konkrete Blöcke und Items übersetzen. */
export function resolveTemplate(tpl, phaseKey, exercises) {
	const phase = (tpl.phases || []).find((p) => p.key === phaseKey) || (tpl.phases || [])[0] || null;
	const byKey = Object.fromEntries(exercises.map((e) => [e.key, e]));
	const blocks = tpl.blocks.map((b) => ({
		id: b.id,
		name: b.name,
		hint: b.hint || '',
		minutes: resolveValue(b.minutes, phase) ?? 0,
		items: b.items.map((it, i) => {
			const ex = byKey[it.exercise] || { key: it.exercise, name: it.exercise, kind: 'kraft', hint: '' };
			const seconds = resolveValue(it.seconds, phase);
			const sets = resolveValue(it.sets, phase);
			const type = seconds ? 'timer' : ex.kind === 'kraft' ? 'sets' : 'check';
			return {
				id: `${b.id}-${it.exercise}-${i}`,
				block: b.id,
				key: ex.key,
				name: ex.name,
				hint: ex.hint || '',
				type,
				group: it.group || '',
				sets: sets || 1,
				reps: it.reps || '',
				rest: it.rest || 0,
				seconds: seconds || 0
			};
		})
	}));
	return { phase, blocks, totalMin: blocks.reduce((a, b) => a + (Number(b.minutes) || 0), 0) };
}

export const defaultReps = (reps) => Number(String(reps).split(/[–-]/).pop()) || 0;

/** Sätze der letzten Einheit pro Übung (für Vorwerte). */
export async function loadLastValues() {
	try {
		const logs = await pb.collection('set_logs').getList(1, 400, { sort: '-created', expand: 'session,exercise' });
		const last = {};
		const sessionOf = {};
		for (const l of logs.items) {
			const key = l.expand?.exercise?.key;
			if (!key) continue;
			if (!sessionOf[key]) sessionOf[key] = l.session;
			if (sessionOf[key] !== l.session) continue;
			(last[key] ||= []).push({ set_no: l.set_no, kg: l.kg, reps: l.reps });
		}
		for (const k in last) last[k].sort((a, b) => a.set_no - b.set_no);
		write(LAST_KEY, last);
		return last;
	} catch {
		return read(LAST_KEY, {});
	}
}

export const cachedLastValues = () => read(LAST_KEY, {});

/** Nach dem Speichern sofort als Vorwerte übernehmen, auch offline. */
export function rememberLastValues(sets) {
	const last = cachedLastValues();
	const byKey = {};
	for (const s of sets) (byKey[s.key] ||= []).push({ set_no: s.set_no, kg: s.kg, reps: s.reps });
	write(LAST_KEY, { ...last, ...byKey });
}

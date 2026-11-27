import { pb } from './pb.js';

// Einstellungen für Benachrichtigungen und Trainingsplan (users.notify).
// Gleiche Standardwerte wie DefaultSettings im Go-Backend (backend/push/settings.go).

export const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const KINDS = { kraft: 'Krafttag', ausdauer: 'Ausdauertag' };

export const DEFAULT_NOTIFY = Object.freeze({
	rest: true,
	reminder: true,
	upload: true,
	weekly: true,
	plan: [
		{ day: 1, time: '16:00', kind: 'kraft' },
		{ day: 3, time: '08:00', kind: 'ausdauer' },
		{ day: 5, time: '16:00', kind: 'kraft' }
	]
});

const validDay = (d) => Number.isInteger(d.day) && d.day >= 0 && d.day <= 6 && /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time) && d.kind in KINDS;
// Montag zuerst, wie im Wochenplan üblich.
const order = (d) => ((d.day + 6) % 7) * 1440 + Number(d.time.slice(0, 2)) * 60 + Number(d.time.slice(3));
export const sortPlan = (plan) => [...plan].sort((a, b) => order(a) - order(b));

/** Gespeicherte Einstellungen, fehlende Werte aus den Standardwerten. */
export function readNotify(raw = pb.authStore.record?.notify) {
	const n = raw && typeof raw === 'object' ? raw : {};
	const flag = (k) => (typeof n[k] === 'boolean' ? n[k] : DEFAULT_NOTIFY[k]);
	return {
		rest: flag('rest'),
		reminder: flag('reminder'),
		upload: flag('upload'),
		weekly: flag('weekly'),
		plan: sortPlan(Array.isArray(n.plan) ? n.plan.filter(validDay) : DEFAULT_NOTIFY.plan)
	};
}

export async function saveNotify(n) {
	const uid = pb.authStore.record?.id;
	if (!uid) throw new Error('Nicht angemeldet');
	const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Vienna';
	const notify = { tz, rest: n.rest, reminder: n.reminder, upload: n.upload, weekly: n.weekly, plan: sortPlan(n.plan.filter(validDay)) };
	await pb.collection('users').update(uid, { notify });
	return notify;
}

/** Nächster freier Wochentag für einen neuen Planeintrag. */
export function nextFreeDay(plan) {
	const used = new Set(plan.map((d) => d.day));
	return [1, 2, 3, 4, 5, 6, 0].find((d) => !used.has(d)) ?? 1;
}

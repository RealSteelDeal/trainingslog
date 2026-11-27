import '../helpers/tz.js';
import '../helpers/env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEntries, exerciseSeries, shoulderSeries, weekSummary, weekStart, isoWeek, cardioSoll, toCsv, CSV_HEADER } from '../../src/lib/stats.js';
import { loadSeed } from '../helpers/seed.js';

const catalog = loadSeed();
const exId = (key) => catalog.exercises.find((e) => e.key === key).id;
const gk = catalog.templates.find((t) => t.key === 'gk');

const data = {
	sessions: [
		{ id: 's1', template: gk.id, kind: 'kraft', phase: 'a', started: '2026-11-16T17:00:00Z', shoulder: 2, client_id: 'c1' },
		{ id: 's2', template: gk.id, kind: 'kraft', phase: 'a', started: '2026-11-19T17:00:00Z', shoulder: 1, client_id: 'c2' },
		{ id: 's3', template: gk.id, kind: 'kraft', phase: 'a', started: '2026-11-23T17:00:00Z', shoulder: 3, client_id: 'c3' }
	],
	sets: [
		{ session: 's1', exercise: exId('bp'), set_no: 2, kg: 60, reps: 13 },
		{ session: 's1', exercise: exId('bp'), set_no: 1, kg: 60, reps: 15 },
		{ session: 's2', exercise: exId('bp'), set_no: 1, kg: 62.5, reps: 15 },
		{ session: 's2', exercise: exId('bp'), set_no: 2, kg: 65, reps: 12 },
		{ session: 's3', exercise: exId('bp'), set_no: 1, kg: 1, reps: 1 }
	],
	cardio: [
		{ session: 's1', phase: 'aufwaermen', minutes: 10 },
		{ session: 's1', phase: 'ausdauer', device: 'rad', minutes: 28 },
		{ session: 's2', phase: 'ausdauer', device: 'rad', minutes: 25 },
		{ session: 's3', phase: 'ausdauer', device: 'rad', minutes: 5 }
	]
};
// c3 ist auf dem Server nur teilweise angekommen; die Outbox hat die vollständige Fassung.
const outbox = [
	{ client_id: 'c3', tplKey: 'gk', session: { kind: 'kraft', phase: 'a', started: '2026-11-23T17:00:00Z', shoulder: 4 },
		sets: [{ key: 'bp', set_no: 1, kg: 67.5, reps: 14 }], cardio: [{ phase: 'aufwaermen', minutes: 10 }, { phase: 'ausdauer', device: 'rad', minutes: 28 }] },
	{ client_id: 'c4', tplKey: 'mi', session: { kind: 'ausdauer', phase: '', started: '2026-11-25T08:00:00Z', shoulder: 0 },
		sets: [], cardio: [{ phase: 'aufwaermen', minutes: 10 }, { phase: 'ausdauer', device: 'crosstrainer', minutes: 45 }] }
];
const entries = buildEntries(data, outbox, catalog);

test('Outbox-Einträge fließen ein und ersetzen unvollständige Server-Einheiten', () => {
	assert.deepEqual(entries.map((e) => [e.id, e.pending]), [['s1', false], ['s2', false], ['c3', true], ['c4', true]]);
	assert.equal(entries[2].shoulder, 4);
	assert.deepEqual(entries[2].sets, [{ key: 'bp', set_no: 1, kg: 67.5, reps: 14 }]);
	assert.equal(entries[0].name, 'Ganzkörper · Krafttag');
	assert.equal(entries[3].name, 'Mittwoch · Ausdauer');
	assert.deepEqual(entries[0].sets.map((s) => s.set_no), [1, 2]);
});

test('Verlauf pro Übung: schwerster Satz, Ø Wdh, Volumen', () => {
	const s = exerciseSeries(entries, 'bp');
	assert.deepEqual(s.map(({ kg, reps, volume, sets, pending }) => ({ kg, reps, volume, sets, pending })), [
		{ kg: 60, reps: 14, volume: 60 * 15 + 60 * 13, sets: 2, pending: false },
		{ kg: 65, reps: 13.5, volume: Math.round(62.5 * 15 + 65 * 12), sets: 2, pending: false },
		{ kg: 67.5, reps: 14, volume: 945, sets: 1, pending: true }
	]);
	assert.deepEqual(exerciseSeries(entries, 'lz'), []);
});

test('Schulterwert pro Einheit', () => {
	assert.deepEqual(shoulderSeries(entries).map((p) => p.value), [2, 1, 4, 0]);
});

test('Ausdauer-Soll aus der gewählten Phase, nicht aus absolvierten Einheiten', () => {
	assert.equal(cardioSoll(catalog.templates, 'a'), 56);
	assert.equal(cardioSoll(catalog.templates, 'b'), 40);
	assert.equal(cardioSoll(catalog.templates, 'x'), 56);
});

test('Wochenübersicht: Soll/Ist, Bonus-Ausdauertag, Zone 2 und Aufwärmen getrennt', () => {
	const w = weekSummary(entries, { soll: 56, now: new Date('2026-11-27T12:00:00Z'), weeks: 3 });
	assert.deepEqual(w.map((k) => k.key), ['2026-W46', '2026-W47', '2026-W48']);
	assert.deepEqual(w.map(({ kraft, bonus, zone2, warm, total, soll, pending }) => ({ kraft, bonus, zone2, warm, total, soll, pending })), [
		{ kraft: 0, bonus: 0, zone2: 0, warm: 0, total: 0, soll: 56, pending: false },
		{ kraft: 2, bonus: 0, zone2: 53, warm: 10, total: 63, soll: 56, pending: false },
		{ kraft: 1, bonus: 1, zone2: 73, warm: 20, total: 93, soll: 56, pending: true }
	]);
});

test('Wochengrenze nach Ortszeit, auch bei der Zeitumstellung', () => {
	// 25.10.2026: Ende der Sommerzeit. Sonntag 23:30 gehört noch zur alten Woche.
	const sun = new Date(2026, 9, 25, 23, 30);
	const mon = new Date(2026, 9, 26, 0, 30);
	assert.equal(weekStart(sun).getDate(), 19);
	assert.equal(weekStart(mon).getDate(), 26);
	assert.equal(weekStart(mon).getHours(), 0);
	assert.deepEqual(isoWeek(sun), { year: 2026, week: 43 });
	assert.deepEqual(isoWeek(mon), { year: 2026, week: 44 });
	assert.deepEqual(isoWeek(new Date(2027, 0, 1)), { year: 2026, week: 53 });
	assert.deepEqual(isoWeek(new Date(2026, 0, 1)), { year: 2026, week: 1 });
});

test('CSV: Langformat, Semikolon, Dezimalkomma, Escaping', () => {
	const e = [...entries.slice(1, 3), { ...entries[3], name: 'Mittwoch; "lang"' }];
	const lines = toCsv(e, catalog.exercises).split('\r\n');
	assert.equal(lines[0], CSV_HEADER.join(';'));
	assert.equal(lines[1], '19.11.2026;Ganzkörper · Krafttag;a;Satz;Beinpresse;1;62,5;15;;1;');
	assert.equal(lines[3], '19.11.2026;Ganzkörper · Krafttag;a;Ausdauer;rad;;;;25;1;');
	assert.equal(lines[4], '23.11.2026;Ganzkörper · Krafttag;a;Satz;Beinpresse;1;67,5;14;;4;nicht hochgeladen');
	assert.equal(lines[5], '23.11.2026;Ganzkörper · Krafttag;a;Aufwärmen;;;;;10;4;nicht hochgeladen');
	assert.equal(lines[7], '25.11.2026;"Mittwoch; ""lang""";;Aufwärmen;;;;;10;0;nicht hochgeladen');
	assert.equal(lines.length, 10); // Kopf + 8 Zeilen + abschließendes CRLF
});

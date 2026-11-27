import '../helpers/env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTemplate, resolveValue, defaultReps } from '../../src/lib/data.js';
import { loadSeed } from '../helpers/seed.js';

const { exercises, templates } = loadSeed();
const gk = templates.find((t) => t.key === 'gk');
const mi = templates.find((t) => t.key === 'mi');

test('Startdaten: 12 Übungen, 2 Vorlagen', () => {
	assert.equal(exercises.length, 12);
	assert.deepEqual(templates.map((t) => t.key), ['gk', 'mi']);
});

for (const [phase, sets, cardioSec] of [['a', 2, 1680], ['b', 3, 1200]]) {
	test(`Krafttag Phase ${phase}: 64 min, ${sets} Sätze, Ausdauer ${cardioSec / 60} min`, () => {
		const r = resolveTemplate(gk, phase, exercises);
		assert.equal(r.totalMin, 64);
		const kraft = r.blocks.find((b) => b.id === 'kraft');
		assert.equal(kraft.items.length, 7);
		assert.ok(kraft.items.every((i) => i.type === 'sets' && i.sets === sets));
		const cardio = r.blocks.find((b) => b.id === 'cardio').items[0];
		assert.equal(cardio.type, 'timer');
		assert.equal(cardio.seconds, cardioSec);
	});
}

test('Mittwoch: 59 min, Schulter-Vorbereitung als Abhak-Items', () => {
	const r = resolveTemplate(mi, '', exercises);
	assert.equal(r.totalMin, 59);
	assert.ok(r.blocks.find((b) => b.id === 'prep').items.every((i) => i.type === 'check'));
});

test('Item-IDs sind pro Vorlage eindeutig', () => {
	const ids = resolveTemplate(gk, 'a', exercises).blocks.flatMap((b) => b.items.map((i) => i.id));
	assert.equal(new Set(ids).size, ids.length);
});

test('Supersatz-Pausen nur nach der zweiten Übung', () => {
	const kraft = resolveTemplate(gk, 'a', exercises).blocks.find((b) => b.id === 'kraft').items;
	assert.deepEqual(kraft.map((i) => [i.group, i.rest]), [['A', 0], ['A', 75], ['B', 0], ['B', 75], ['C', 0], ['C', 60], ['D', 60]]);
});

test('Phasen-Ausdrücke und Wdh-Standard', () => {
	assert.equal(resolveValue('phase.cardio_min*60', { cardio_min: 28 }), 1680);
	assert.equal(resolveValue('phase.sets', { sets: 3 }), 3);
	assert.equal(resolveValue('phase.unbekannt', { sets: 3 }), null);
	assert.equal(resolveValue(45, null), 45);
	assert.equal(defaultReps('12–15'), 15);
	assert.equal(defaultReps('12'), 12);
});

test('Hilfetexte: jede Übung hat Gerät, Ausführung und Schulter-Hinweis', () => {
	for (const e of exercises) {
		assert.ok(e.help, `${e.key} ohne Hilfe`);
		assert.ok(e.help.geraet && e.help.schulter, e.key);
		assert.ok(e.help.ausfuehrung.length >= 3, e.key);
		assert.ok(Array.isArray(e.help.alternativen) && Array.isArray(e.help.fehler), e.key);
	}
	assert.match(exercises.find((e) => e.key === 'hy').help.geraet, /Hyperextension-Bank/);
});

test('Steigerungsvorschlag nur, wenn alle Sätze die obere Grenze erreicht haben', async () => {
	const { progressionHint } = await import('../../src/lib/data.js');
	assert.deepEqual(progressionHint([{ kg: 60, reps: 15 }, { kg: 60, reps: 15 }], '12–15'), { from: 60, kg: 62.5, reps: 12, top: 15 });
	assert.equal(progressionHint([{ kg: 60, reps: 15 }, { kg: 60, reps: 14 }], '12–15'), null);
	assert.deepEqual(progressionHint([{ kg: 20, reps: 12 }], '12'), { from: 20, kg: 22.5, reps: 12, top: 12 });
	assert.deepEqual(progressionHint([{ kg: 57.5, reps: 16 }, { kg: 60, reps: 15 }], '12-15'), { from: 60, kg: 62.5, reps: 12, top: 15 });
	assert.equal(progressionHint([{ kg: 0, reps: 15 }], '12–15'), null); // ohne Gewicht kein Vorschlag
	assert.equal(progressionHint([], '12–15'), null);
	assert.equal(progressionHint(undefined, '12–15'), null);
	assert.equal(progressionHint([{ kg: 60, reps: 15 }], ''), null);
});

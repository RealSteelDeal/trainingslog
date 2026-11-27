import '../helpers/tz.js';
import '../helpers/env.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pb } from '../../src/lib/pb.js';
import { phaseAt, withPhase, setPhase, syncPhaseLog, cachedPhaseLog, dayKey } from '../../src/lib/phase.js';
import { weekSummary, cardioSoll } from '../../src/lib/stats.js';
import { loadSeed } from '../helpers/seed.js';

const { templates } = loadSeed();
let server, fail, calls;

beforeEach(() => {
	localStorage.clear();
	pb.authStore.save('token', { id: 'u1', collectionId: '_pb_users_auth_', collectionName: 'users' });
	Object.defineProperty(pb.authStore, 'isValid', { get: () => true, configurable: true });
	server = { phase_log: [] };
	fail = false;
	calls = [];
	pb.collection = () => ({
		getOne: async () => { calls.push('get'); if (fail) throw new Error('offline'); return structuredClone(server); },
		update: async (_id, d) => { calls.push('update'); if (fail) throw new Error('offline'); Object.assign(server, structuredClone(d)); return server; }
	});
});

const log = [{ phase: 'b', from: '2026-11-23' }];

test('Phase pro Woche: vor dem ersten Wechsel gilt a, ab dem Montag der Wechselwoche b', () => {
	assert.equal(phaseAt([], new Date(2026, 10, 27)), 'a');
	assert.equal(phaseAt(log, new Date(2026, 10, 22, 23, 59)), 'a');
	assert.equal(phaseAt(log, new Date(2026, 10, 23, 0, 0)), 'b');
	assert.equal(phaseAt(log, new Date(2026, 10, 26)), 'b'); // Wechsel am Donnerstag gilt für die ganze Woche
	assert.equal(phaseAt([{ phase: 'a', from: '2026-12-07' }, ...log], new Date(2026, 11, 8)), 'a');
});

test('Wechsel in derselben Woche ersetzt, Zurückwechseln entfernt den Eintrag', () => {
	const thu = new Date(2026, 10, 26);
	assert.deepEqual(withPhase([], 'b', thu), log);
	assert.deepEqual(withPhase(log, 'b', thu), log);
	assert.deepEqual(withPhase(log, 'a', thu), []);
	assert.deepEqual(withPhase(log, 'a', new Date(2026, 11, 2)), [...log, { phase: 'a', from: '2026-11-30' }]);
	assert.deepEqual(withPhase([], 'a', thu), []);
	assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('Vergangene Wochen behalten ihr Soll nach einem Wechsel auf b', () => {
	const w = weekSummary([], { soll: (start) => cardioSoll(templates, phaseAt(log, start)), now: new Date(2026, 10, 27), weeks: 3 });
	assert.deepEqual(w.map((k) => [k.key, k.soll]), [['2026-W46', 56], ['2026-W47', 56], ['2026-W48', 40]]);
});

test('Wechsel wird ans Konto hochgeladen; offline bleibt er gemerkt und folgt später', async () => {
	fail = true;
	setPhase('b', new Date(2026, 10, 26));
	await syncPhaseLog();
	assert.deepEqual(cachedPhaseLog(), log);
	assert.deepEqual(server.phase_log, []);
	fail = false;
	await syncPhaseLog();
	assert.deepEqual(server.phase_log, log);
	calls = [];
	await syncPhaseLog();
	assert.deepEqual(calls, ['get']); // nicht mehr "dirty": nur noch lesen
});

test('Anderes Gerät: Stand vom Konto wird übernommen', async () => {
	server.phase_log = log;
	await syncPhaseLog();
	assert.deepEqual(cachedPhaseLog(), log);
});

test('Frühere lokale Auswahl "b" wird einmalig ans Konto übernommen', async () => {
	localStorage.setItem('tl-phase', 'b');
	await syncPhaseLog();
	assert.equal(server.phase_log.length, 1);
	assert.equal(server.phase_log[0].phase, 'b');
	assert.equal(localStorage.getItem('tl-phase'), null);
});

test('Frühere lokale Auswahl überschreibt kein vorhandenes Konto-Log', async () => {
	localStorage.setItem('tl-phase', 'b');
	server.phase_log = [{ phase: 'b', from: '2026-11-09' }];
	await syncPhaseLog();
	assert.deepEqual(cachedPhaseLog(), [{ phase: 'b', from: '2026-11-09' }]);
	assert.deepEqual(calls, ['get']);
});

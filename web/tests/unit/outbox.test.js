import '../helpers/env.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pb } from '../../src/lib/pb.js';
import { enqueue, flush, readOutbox } from '../../src/lib/outbox.js';
import { loadSeed } from '../helpers/seed.js';

const seed = loadSeed();
let db, failAt, calls;

function mockApi() {
	pb.collection = (name) => ({
		create: async (d) => {
			calls++;
			if (calls === failAt) { const e = new Error('Netz weg'); e.status = 0; throw e; }
			if (name === 'sessions' && db.sessions.some((s) => s.client_id === d.client_id)) { const e = new Error('unique'); e.status = 400; throw e; }
			const r = { id: `${name}_${db[name].length}`, ...d };
			db[name].push(r);
			return r;
		},
		getFirstListItem: async (filter) => {
			const id = /client_id="(.+)"/.exec(filter)[1];
			const r = db.sessions.find((s) => s.client_id === id);
			if (!r) throw new Error('404');
			return r;
		}
	});
}

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('tl-catalog', JSON.stringify(seed));
	pb.authStore.save('token', { id: 'u1', collectionId: '_pb_users_auth_', collectionName: 'users' });
	Object.defineProperty(pb.authStore, 'isValid', { get: () => true, configurable: true });
	db = { sessions: [], set_logs: [], cardio_logs: [] };
	failAt = -1;
	calls = 0;
	mockApi();
});

const entry = (id) => ({
	client_id: id,
	tplKey: 'gk',
	session: { kind: 'kraft', started: '2026-11-27T18:00:00Z' },
	sets: [
		{ key: 'bp', set_no: 1, kg: 60, reps: 15 },
		{ key: 'bp', set_no: 2, kg: 60, reps: 14 },
		{ key: 'lz', set_no: 1, kg: 35, reps: 13 }
	],
	cardio: [{ phase: 'ausdauer', minutes: 28 }]
});

test('Abbruch mittendrin: Stand bleibt, zweiter Versuch ohne Duplikate', async () => {
	failAt = 3;
	enqueue(entry('a1'));
	await flush();
	assert.equal(readOutbox().length, 1);
	assert.equal(readOutbox()[0].doneSets, 1);
	failAt = -1;
	await flush();
	assert.equal(readOutbox().length, 0);
	assert.equal(db.sessions.length, 1);
	assert.equal(db.set_logs.length, 3);
	assert.equal(db.cardio_logs.length, 1);
});

test('Verknüpft User, Vorlage und Übungen über ihre IDs', async () => {
	enqueue(entry('a2'));
	await flush();
	const s = db.sessions[0];
	assert.equal(s.user, 'u1');
	assert.equal(s.template, seed.templates.find((t) => t.key === 'gk').id);
	assert.equal(db.set_logs[2].exercise, seed.exercises.find((e) => e.key === 'lz').id);
});

test('Schon angelegte Einheit wird über client_id wiederverwendet', async () => {
	db.sessions.push({ id: 'vorhanden', client_id: 'a3' });
	enqueue({ ...entry('a3'), sets: [], cardio: [{ phase: 'ausdauer', minutes: 45 }] });
	await flush();
	assert.equal(db.sessions.length, 1);
	assert.equal(db.cardio_logs[0].session, 'vorhanden');
});

test('Ohne gültige Anmeldung wird nichts hochgeladen', async () => {
	Object.defineProperty(pb.authStore, 'isValid', { get: () => false, configurable: true });
	enqueue(entry('a4'));
	await flush();
	assert.equal(readOutbox().length, 1);
	assert.equal(db.sessions.length, 0);
});

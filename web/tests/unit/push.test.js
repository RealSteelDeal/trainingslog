import '../helpers/env.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pb } from '../../src/lib/pb.js';
import { readNotify, sortPlan, nextFreeDay, DEFAULT_NOTIFY } from '../../src/lib/notify.js';
import { schedulePush, cancelPush, scheduleUploadCheck } from '../../src/lib/push.js';

let calls;
beforeEach(() => {
	localStorage.clear();
	calls = [];
	pb.send = async (path, opts) => { calls.push({ path, body: opts.body }); return {}; };
	pb.authStore.save('token', { id: 'u1', collectionId: '_pb_users_auth_', collectionName: 'users', notify: null });
	Object.defineProperty(pb.authStore, 'isValid', { get: () => true, configurable: true });
});

test('Einstellungen: Standard Mo 16:00 Kraft, Mi 08:00 Ausdauer, Fr 16:00 Kraft', () => {
	const n = readNotify(null);
	assert.deepEqual(n.plan, DEFAULT_NOTIFY.plan);
	assert.equal(n.rest && n.reminder && n.upload && n.weekly, true);
});

test('Einstellungen: gespeicherte Werte, ungültige Einträge verworfen, Montag zuerst sortiert', () => {
	const n = readNotify({ weekly: false, plan: [
		{ day: 0, time: '10:00', kind: 'ausdauer' },
		{ day: 2, time: '18:30', kind: 'kraft' },
		{ day: 2, time: '07:00', kind: 'kraft' },
		{ day: 8, time: '10:00', kind: 'kraft' },
		{ day: 4, time: '9:00', kind: 'kraft' },
		{ day: 5, time: '10:00', kind: 'yoga' }
	] });
	assert.equal(n.weekly, false);
	assert.equal(n.rest, true);
	assert.deepEqual(n.plan.map((d) => `${d.day} ${d.time}`), ['2 07:00', '2 18:30', '0 10:00']);
	assert.deepEqual(readNotify({ plan: [] }).plan, []);
	assert.deepEqual(sortPlan([{ day: 0, time: '08:00', kind: 'kraft' }, { day: 1, time: '08:00', kind: 'kraft' }]).map((d) => d.day), [1, 0]);
	assert.equal(nextFreeDay(DEFAULT_NOTIFY.plan), 2);
	assert.equal(nextFreeDay([1, 2, 3, 4, 5, 6].map((day) => ({ day }))), 0);
});

test('Planen nur, wenn dieses Gerät angemeldet ist und die Art eingeschaltet ist', async () => {
	await schedulePush('rest', 'r', Date.now(), { title: 'Pause vorbei' });
	assert.equal(calls.length, 0);
	localStorage.setItem('tl-push-device', 'https://push.example/a');
	await schedulePush('rest', 'r', Date.UTC(2026, 10, 30, 16), { title: 'Pause vorbei', url: '/einheit' });
	await cancelPush('S|', true);
	assert.deepEqual(calls, [
		{ path: '/api/push/schedule', body: { kind: 'rest', ref: 'r', fireAt: '2026-11-30T16:00:00.000Z', title: 'Pause vorbei', body: '', url: '/einheit' } },
		{ path: '/api/push/cancel', body: { ref: 'S|', prefix: true } }
	]);
	calls = [];
	pb.authStore.save('token', { id: 'u1', collectionId: '_pb_users_auth_', collectionName: 'users', notify: { rest: false } });
	await schedulePush('timer', 't', Date.now(), { title: 'x' });
	await scheduleUploadCheck('2026-11-30T16:00:00.000Z', Date.UTC(2026, 10, 30, 17));
	assert.deepEqual(calls.map((c) => c.body.kind), ['upload']);
});

test('Upload-Hinweis: 12 h nach Start, mindestens 3 h nach jetzt', async () => {
	localStorage.setItem('tl-push-device', 'x');
	await scheduleUploadCheck('2026-11-30T16:00:00.000Z', Date.UTC(2026, 10, 30, 17));
	await scheduleUploadCheck('2026-11-30T16:00:00.000Z', Date.UTC(2026, 11, 1, 3));
	assert.deepEqual(calls.map((c) => [c.body.ref, c.body.fireAt]), [
		['upload|2026-11-30T16:00:00.000Z', '2026-12-01T04:00:00.000Z'],
		['upload|2026-11-30T16:00:00.000Z', '2026-12-01T06:00:00.000Z']
	]);
});

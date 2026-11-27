#!/usr/bin/env node
// Importiert den JSON-Export aus dem Artefakt („Daten kopieren (JSON)“) in PocketBase.
// Aufruf:
//   PB_URL=https://training.example.at PB_EMAIL=… PB_PASSWORD=… node tools/import-artifact.mjs export.json
//   node tools/import-artifact.mjs export.json --dry-run      (nur prüfen, nichts schreiben)
// Bereits importierte Einheiten werden über client_id erkannt und übersprungen.

import { readFileSync } from 'node:fs';

const file = process.argv[2];
const dry = process.argv.includes('--dry-run');
if (!file) { console.error('Datei fehlt: node tools/import-artifact.mjs export.json [--dry-run]'); process.exit(1); }

const KIND = { gk: 'kraft', mi: 'ausdauer' };
const DEVICE = { Crosstrainer: 'crosstrainer', Rad: 'rad', Laufband: 'laufband', Gemischt: 'gemischt' };

export function mapSession(s) {
  if (!s || s.kind !== 'session' || !KIND[s.type] || !s.date) throw new Error('Kein gültiger Einheiten-Eintrag');
  return {
    session: {
      kind: KIND[s.type], templateKey: s.type, phase: s.phase || '', started: s.date,
      duration_min: Number(s.durationMin) || 0, volume_kg: Number(s.volume) || 0,
      shoulder: Math.max(0, Math.min(10, Math.round(Number(s.shoulder) || 0))),
      note: String(s.note || '').slice(0, 1000), prep_done: Array.isArray(s.prepDone) ? s.prepDone : [],
      client_id: String(s.id || s.date).slice(0, 60),
    },
    sets: (s.exercises || []).flatMap((e) => (e.sets || []).map((x, i) => ({ key: e.id, set_no: i + 1, kg: Number(x.kg) || 0, reps: Math.round(Number(x.reps) || 0) }))),
    cardio: Number(s.cardioMin) > 0 ? [{ phase: 'ausdauer', device: DEVICE[s.device] || '', minutes: Number(s.cardioMin) }] : [],
  };
}

const data = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(data)) { console.error('Erwartet wird ein JSON-Array von Einheiten.'); process.exit(1); }
const mapped = data.map(mapSession);
console.log(`${mapped.length} Einheiten, ${mapped.reduce((a, m) => a + m.sets.length, 0)} Sätze, ${mapped.reduce((a, m) => a + m.cardio.length, 0)} Cardio-Einträge gelesen.`);
if (dry) process.exit(0);

const { PB_URL, PB_EMAIL, PB_PASSWORD } = process.env;
if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) { console.error('PB_URL, PB_EMAIL und PB_PASSWORD setzen.'); process.exit(1); }
const base = PB_URL.replace(/\/$/, '');
let token = '';
async function api(path, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: token }) }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`${r.status} ${path}: ${JSON.stringify(j)}`); e.status = r.status; e.body = j; throw e; }
  return j;
}

const auth = await api('/api/collections/users/auth-with-password', { identity: PB_EMAIL, password: PB_PASSWORD });
token = auth.token;
const uid = auth.record.id;
const ex = Object.fromEntries((await api('/api/collections/exercises/records?perPage=500')).items.map((r) => [r.key, r.id]));
const tpl = Object.fromEntries((await api('/api/collections/templates/records?perPage=100')).items.map((r) => [r.key, r.id]));

let done = 0, skipped = 0;
for (const m of mapped) {
  const { templateKey, ...s } = m.session;
  const exists = await api(`/api/collections/sessions/records?perPage=1&filter=${encodeURIComponent(`client_id="${s.client_id.replace(/"/g, '')}"`)}`);
  if (exists.totalItems) { skipped++; continue; }
  const rec = await api('/api/collections/sessions/records', { ...s, user: uid, template: tpl[templateKey] || '' });
  for (const x of m.sets) {
    if (!ex[x.key]) { console.warn(`Übung ${x.key} unbekannt, Satz übersprungen`); continue; }
    await api('/api/collections/set_logs/records', { session: rec.id, exercise: ex[x.key], set_no: x.set_no, kg: x.kg, reps: x.reps });
  }
  for (const c of m.cardio) await api('/api/collections/cardio_logs/records', { session: rec.id, ...c });
  done++;
}
console.log(`Fertig: ${done} importiert, ${skipped} schon vorhanden.`);

// Liest Übungen und Vorlagen direkt aus den Daten-Migrationen, damit Tests
// immer gegen den echten Plan laufen.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../../../backend/pb_migrations/', import.meta.url);
const FILES = ['1764230500_seed_plan.js', '1795795200_exercise_help.js'];

export function loadSeed() {
	const out = { exercises: [], templates: [] };
	class Record {
		constructor(c) { this.c = c.name ?? c; this.d = {}; }
		set(k, v) { this.d[k] = v; }
	}
	const app = {
		findCollectionByNameOrId: (n) => ({ name: n, fields: { add() {}, removeByName() {} } }),
		findFirstRecordByData: (c, k, v) => {
			const row = out[c].find((r) => r[k] === v);
			if (!row) throw new Error('not found');
			return { set: (f, val) => (row[f] = val) };
		},
		save: (r) => { if (r instanceof Record) out[r.c].push({ id: `${r.c}_${out[r.c].length}`, ...r.d }); }
	};
	for (const f of FILES) {
		let up;
		new Function('migrate', 'Record', 'JSONField', readFileSync(fileURLToPath(new URL(f, dir)), 'utf8'))((u) => (up = u), Record, class {});
		up(app);
	}
	return out;
}

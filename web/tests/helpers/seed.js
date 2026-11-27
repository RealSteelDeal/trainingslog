// Liest Übungen und Vorlagen direkt aus der Seed-Migration, damit Tests
// immer gegen den echten Plan laufen.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../../../backend/pb_migrations/1764230500_seed_plan.js', import.meta.url));

export function loadSeed() {
	const out = { exercises: [], templates: [] };
	class Record {
		constructor(c) { this.c = c; this.d = {}; }
		set(k, v) { this.d[k] = v; }
	}
	let up;
	new Function('migrate', 'Record', readFileSync(file, 'utf8'))((u) => (up = u), Record);
	up({
		findCollectionByNameOrId: (n) => n,
		save: (r) => out[r.c].push({ id: `${r.c}_${out[r.c].length}`, ...r.d })
	});
	return out;
}

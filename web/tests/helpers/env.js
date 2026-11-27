// Browser-Umgebung für Node-Tests: localStorage im Speicher.
const mem = new Map();
globalThis.localStorage = {
	getItem: (k) => (mem.has(k) ? mem.get(k) : null),
	setItem: (k, v) => mem.set(k, String(v)),
	removeItem: (k) => mem.delete(k),
	clear: () => mem.clear()
};

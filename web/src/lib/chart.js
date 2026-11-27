/** Runde Achsenwerte (1/2/5 × 10^n), etwa `count` Schritte von lo bis hi. */
export function niceTicks(lo, hi, count = 4) {
	if (!(hi > lo)) hi = lo + 1;
	const raw = (hi - lo) / count;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw);
	const start = Math.floor(lo / step) * step;
	const ticks = [];
	for (let v = start; v < hi + step * 0.999; v += step) ticks.push(Math.round(v * 1000) / 1000);
	return ticks;
}

/** Rechteck mit 4px-Rundung oben, gerade an der Grundlinie. */
export function topRounded(x, y, w, h, r = 4) {
	r = Math.min(r, h, w / 2);
	return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export const fmtNum = (n, digits = 1) => Number(n).toLocaleString('de-AT', { maximumFractionDigits: digits });
export const fmtShort = (d) => d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });

<script>
	import { niceTicks, fmtShort } from './chart.js';

	/** points: [{ date: Date, value: number, pending?: boolean }] */
	let { points, label, unit = '', fmt = (v) => String(v), yMin = null, yMax = null } = $props();

	let w = $state(340);
	let active = $state(null);
	const H = 210;
	const P = { l: 40, r: 16, t: 14, b: 28 };

	const lo = $derived(yMin ?? Math.min(0, ...points.map((p) => p.value)));
	const hi = $derived(yMax ?? Math.max(1, ...points.map((p) => p.value)));
	const ticks = $derived(yMax != null ? niceTicks(lo, hi, 5).filter((t) => t <= hi) : niceTicks(lo, hi));
	const top = $derived(ticks[ticks.length - 1]);
	const t0 = $derived(points.length ? points[0].date.getTime() : 0);
	const t1 = $derived(points.length ? points[points.length - 1].date.getTime() : 1);
	const x = (p) => (t1 === t0 ? (P.l + w - P.r) / 2 : P.l + ((p.date.getTime() - t0) / (t1 - t0)) * (w - P.l - P.r));
	const y = (v) => P.t + (1 - (v - lo) / (top - lo || 1)) * (H - P.t - P.b);
	const path = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.value).toFixed(1)}`).join(''));
	const xLabels = $derived(points.length > 1 ? [points[0], points[points.length - 1]] : points);

	function pick(e) {
		if (!points.length) return;
		const r = e.currentTarget.getBoundingClientRect();
		const px = e.clientX - r.left;
		let best = 0;
		points.forEach((p, i) => { if (Math.abs(x(p) - px) < Math.abs(x(points[best]) - px)) best = i; });
		active = best;
	}
	function key(e) {
		if (!points.length) return;
		if (e.key === 'ArrowRight') active = Math.min(points.length - 1, (active ?? -1) + 1);
		else if (e.key === 'ArrowLeft') active = Math.max(0, (active ?? points.length) - 1);
		else if (e.key === 'Escape') active = null;
		else return;
		e.preventDefault();
	}
	const tipLeft = $derived(active == null ? 0 : Math.min(Math.max(x(points[active]) - 70, 0), w - 140));
</script>

<div class="chart" bind:clientWidth={w}>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<svg
		width={w}
		height={H}
		role="img"
		aria-label={label}
		tabindex="0"
		onpointerdown={pick}
		onpointermove={pick}
		onpointerleave={(e) => e.pointerType === 'mouse' && (active = null)}
		onkeydown={key}
		onblur={() => (active = null)}
	>
		{#each ticks as t (t)}
			<line class="grid" x1={P.l} x2={w - P.r} y1={y(t)} y2={y(t)} />
			<text class="ax" x={P.l - 6} y={y(t) + 4} text-anchor="end">{fmt(t)}</text>
		{/each}
		{#each xLabels as p, i (i)}
			<text class="ax" x={x(p)} y={H - 8} text-anchor={points.length > 1 ? (i ? 'end' : 'start') : 'middle'}>{fmtShort(p.date)}</text>
		{/each}
		{#if active != null}
			<line class="cross" x1={x(points[active])} x2={x(points[active])} y1={P.t} y2={H - P.b} />
		{/if}
		<path class="line" d={path} />
		{#each points as p, i (i)}
			<circle class="dot" class:pending={p.pending} class:on={i === active} cx={x(p)} cy={y(p.value)} r={i === active ? 6 : 4} />
		{/each}
		{#if points.length}
			{@const last = points[points.length - 1]}
			<text class="end" x={Math.min(x(last), w - P.r)} y={y(last.value) - 12} text-anchor="end">{fmt(last.value)}{unit ? ` ${unit}` : ''}</text>
		{/if}
	</svg>
	{#if active != null}
		{@const p = points[active]}
		<div class="tip" style="left:{tipLeft}px" role="status">
			<b>{fmt(p.value)}{unit ? ` ${unit}` : ''}</b>
			<span>{p.date.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
			{#if p.pending}<span class="pend">noch nicht hochgeladen</span>{/if}
		</div>
	{/if}
</div>

<style>
	.chart { position: relative; width: 100%; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
	svg { display: block; overflow: visible; outline-offset: 4px; border-radius: 6px; }
	svg:focus-visible { outline-width: 2px; }
	.grid { stroke: var(--line); stroke-width: 1; }
	.ax { fill: var(--mute); font: 12px Inter, sans-serif; font-variant-numeric: tabular-nums; }
	.end { fill: var(--ink); font: 600 13px Inter, sans-serif; }
	.line { fill: none; stroke: var(--c-line); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
	.dot { fill: var(--c-line); stroke: var(--card); stroke-width: 2; }
	.dot.pending { fill: var(--card); stroke: var(--c-line); }
	.cross { stroke: var(--mute); stroke-width: 1; }
	.tip {
		position: absolute; top: -8px; width: 140px; transform: translateY(-100%); pointer-events: none;
		background: var(--ink); color: var(--bg); border-radius: 10px; padding: 6px 10px; font-size: 13px; line-height: 1.35;
		display: grid; box-shadow: 0 4px 14px rgb(0 0 0 / .25);
	}
	.tip b { font-size: 16px; }
	.pend { opacity: .8; }
</style>

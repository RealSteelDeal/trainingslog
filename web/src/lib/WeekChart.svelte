<script>
	import { niceTicks, topRounded, fmtShort } from './chart.js';
	import { WHO_MINUTES } from './stats.js';

	/** weeks: Ergebnis von weekSummary(), älteste zuerst */
	let { weeks } = $props();

	let w = $state(340);
	let active = $state(null);
	const H = 220;
	const P = { l: 40, r: 12, t: 14, b: 28 };
	const GAP = 2;

	const lastSoll = $derived(weeks[weeks.length - 1]?.soll || 0);
	const ticks = $derived(niceTicks(0, Math.max(WHO_MINUTES, ...weeks.map((k) => Math.max(k.total, k.soll))) * 1.05));
	const top = $derived(ticks[ticks.length - 1]);
	const band = $derived((w - P.l - P.r) / Math.max(1, weeks.length));
	const bw = $derived(Math.min(24, band * 0.55));
	const cx = (i) => P.l + band * (i + 0.5);
	const y = (v) => P.t + (1 - v / top) * (H - P.t - P.b);
	const hgt = (v) => (v / top) * (H - P.t - P.b);
	// Soll als Stufenlinie: jede Woche hat ihr eigenes Soll (Phasenwechsel).
	const sollPath = $derived(weeks.map((k, i) => `${i ? 'L' : 'M'}${i ? cx(i) - band / 2 : P.l},${y(k.soll)}H${i === weeks.length - 1 ? w - P.r : cx(i) + band / 2}`).join(''));

	function pick(e) {
		const r = e.currentTarget.getBoundingClientRect();
		const i = Math.floor((e.clientX - r.left - P.l) / band);
		active = i >= 0 && i < weeks.length ? i : null;
	}
	function key(e) {
		if (e.key === 'ArrowRight') active = Math.min(weeks.length - 1, (active ?? -1) + 1);
		else if (e.key === 'ArrowLeft') active = Math.max(0, (active ?? weeks.length) - 1);
		else if (e.key === 'Escape') active = null;
		else return;
		e.preventDefault();
	}
	const tipLeft = $derived(active == null ? 0 : Math.min(Math.max(cx(active) - 80, 0), w - 160));
</script>

<ul class="legend" aria-hidden="true">
	<li><i class="sw z2"></i>Zone 2</li>
	<li><i class="sw warm"></i>Aufwärmen</li>
	<li><i class="ln"></i>Soll Zone 2</li>
	<li><i class="ln who"></i>WHO 150 (gesamt)</li>
</ul>
<div class="chart" bind:clientWidth={w}>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<svg
		width={w}
		height={H}
		role="img"
		aria-label="Ausdauer-Minuten der letzten {weeks.length} Wochen, Zone 2 und Aufwärmen gestapelt"
		tabindex="0"
		onpointerdown={pick}
		onpointermove={pick}
		onpointerleave={(e) => e.pointerType === 'mouse' && (active = null)}
		onkeydown={key}
		onblur={() => (active = null)}
	>
		{#each ticks as t (t)}
			<line class="grid" x1={P.l} x2={w - P.r} y1={y(t)} y2={y(t)} />
			<text class="ax" x={P.l - 6} y={y(t) + 4} text-anchor="end">{t}</text>
		{/each}
		{#each weeks as k, i (k.key)}
			{@const z = hgt(k.zone2)}
			{@const m = hgt(k.warm)}
			{#if active === i}<rect class="hl" x={cx(i) - band / 2 + 2} y={P.t} width={band - 4} height={H - P.t - P.b} rx="6" />{/if}
			{#if k.zone2 > 0}
				{#if k.warm > 0}
					<rect class="z2" class:pending={k.pending} x={cx(i) - bw / 2} y={y(k.zone2)} width={bw} height={z} />
				{:else}
					<path class="z2" class:pending={k.pending} d={topRounded(cx(i) - bw / 2, y(k.zone2), bw, z)} />
				{/if}
			{/if}
			{#if k.warm > 0}
				<path class="warm" class:pending={k.pending} d={topRounded(cx(i) - bw / 2, y(k.zone2) - m, bw, Math.max(0, m - (k.zone2 > 0 ? GAP : 0)))} />
			{/if}
			{#if weeks.length <= 5 || (weeks.length - 1 - i) % 2 === 0}
				<text class="ax" x={cx(i)} y={H - 8} text-anchor="middle">KW {k.week}</text>
			{/if}
		{/each}
		{#if lastSoll}
			<path class="ref step" d={sollPath} />
			<text class="rl" x={w - P.r} y={y(lastSoll) - 5} text-anchor="end">Soll {lastSoll}</text>
		{/if}
		<line class="ref who" x1={P.l} x2={w - P.r} y1={y(WHO_MINUTES)} y2={y(WHO_MINUTES)} />
		<text class="rl" x={w - P.r} y={y(WHO_MINUTES) - 5} text-anchor="end">WHO {WHO_MINUTES}</text>
	</svg>
	{#if active != null}
		{@const k = weeks[active]}
		<div class="tip" style="left:{tipLeft}px" role="status">
			<b>KW {k.week} · ab {fmtShort(k.start)}</b>
			<span>Zone 2: {k.zone2} von {k.soll} min</span>
			<span>Aufwärmen: {k.warm} min</span>
			<span>Summe: {k.total} min</span>
			{#if k.pending}<span class="pend">inkl. noch nicht hochgeladen</span>{/if}
		</div>
	{/if}
</div>

<style>
	.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; list-style: none; padding: 0; margin: 0 0 10px; font-size: 13px; color: var(--mute); }
	.legend li { display: flex; align-items: center; gap: 6px; }
	.sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
	.sw.z2 { background: var(--c-z2); }
	.sw.warm { background: var(--c-warm); }
	.ln { width: 16px; border-top: 2px solid var(--ink); display: inline-block; }
	.ln.who { border-top: 1px solid var(--mute); }
	.chart { position: relative; width: 100%; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
	svg { display: block; overflow: visible; outline-offset: 4px; border-radius: 6px; }
	svg:focus-visible { outline-width: 2px; }
	.grid { stroke: var(--line); stroke-width: 1; }
	.ax { fill: var(--mute); font: 12px Inter, sans-serif; font-variant-numeric: tabular-nums; }
	.rl { fill: var(--ink); font: 600 12px Inter, sans-serif; paint-order: stroke; stroke: var(--card); stroke-width: 3px; }
	.z2 { fill: var(--c-z2); }
	.warm { fill: var(--c-warm); }
	.pending { opacity: .55; }
	.hl { fill: var(--soft); }
	.ref { stroke: var(--ink); stroke-width: 1.5; }
	.ref.who { stroke: var(--mute); stroke-width: 1; }
	.step { fill: none; stroke-linejoin: round; }
	.tip {
		position: absolute; top: -8px; width: 160px; transform: translateY(-100%); pointer-events: none;
		background: var(--ink); color: var(--bg); border-radius: 10px; padding: 6px 10px; font-size: 13px; line-height: 1.4;
		display: grid; box-shadow: 0 4px 14px rgb(0 0 0 / .25);
	}
	.pend { opacity: .8; }
</style>

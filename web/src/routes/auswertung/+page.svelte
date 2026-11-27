<script>
	import { onMount } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { loadCatalog, cachedCatalog } from '$lib/data';
	import { readOutbox, onOutbox } from '$lib/outbox';
	import { loadStatsData, buildEntries, exerciseSeries, shoulderSeries, weekSummary, cardioSoll, toCsv, fmtDate, WHO_MINUTES } from '$lib/stats';
	import { fmtNum } from '$lib/chart';
	import LineChart from '$lib/LineChart.svelte';
	import WeekChart from '$lib/WeekChart.svelte';

	const TABS = [['woche', 'Woche'], ['uebung', 'Übungen'], ['schulter', 'Schulter'], ['export', 'Export']];
	const METRICS = [['kg', 'Gewicht', 'kg'], ['reps', 'Wdh', 'Wdh'], ['volume', 'Volumen', 'kg']];

	let tab = $state('woche');
	let exKey = $state('bp');
	let metric = $state('kg');
	let data = $state(null);
	let catalog = $state(cachedCatalog());
	let outbox = $state(readOutbox());
	const phaseKey = localStorage.getItem('tl-phase') || 'a';

	const entries = $derived(data ? buildEntries(data, outbox, catalog) : []);
	const kraftTpl = $derived(catalog.templates.find((t) => t.kind === 'kraft' && t.phases?.length));
	const phase = $derived(kraftTpl?.phases.find((p) => p.key === phaseKey) || kraftTpl?.phases[0]);
	const soll = $derived(cardioSoll(catalog.templates, phaseKey));
	const weeks = $derived(weekSummary(entries, { soll }));
	const now = $derived(weeks[weeks.length - 1]);
	const kraftEx = $derived(catalog.exercises.filter((e) => e.kind === 'kraft'));
	const series = $derived(exerciseSeries(entries, exKey));
	const metricDef = $derived(METRICS.find((m) => m[0] === metric));
	const shoulder = $derived(shoulderSeries(entries));
	const pendingCount = $derived(entries.filter((e) => e.pending).length);
	const csvRows = $derived(entries.reduce((a, e) => a + e.sets.length + e.cardio.length, 0));

	function syncUrl() {
		const u = new URL(location.href);
		u.searchParams.set('tab', tab);
		if (tab === 'uebung') u.searchParams.set('u', exKey); else u.searchParams.delete('u');
		replaceState(u, {});
	}
	function setTab(t) { tab = t; syncUrl(); }

	async function load() {
		catalog = await loadCatalog();
		data = await loadStatsData();
	}

	function download() {
		const blob = new Blob(['﻿' + toCsv(entries, catalog.exercises)], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `trainingslog-${new Date().toISOString().slice(0, 10)}.csv`;
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 2000);
	}

	const fmtWhen = (iso) => new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
	const fmtDay = (d) => d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' });

	onMount(() => {
		if (!pb.authStore.isValid) { goto('/'); return; }
		const q = new URLSearchParams(location.search);
		if (TABS.some((t) => t[0] === q.get('tab'))) tab = q.get('tab');
		if (q.get('u')) exKey = q.get('u');
		load();
		return onOutbox((items) => { outbox = items; if (!items.length) load(); });
	});
</script>

<main>
	<header>
		<a class="back" href="/" aria-label="Zurück zur Startseite">‹</a>
		<h1>Auswertungen</h1>
	</header>

	<nav class="tabs" role="tablist" aria-label="Bereich">
		{#each TABS as [id, label] (id)}
			<button role="tab" id="tab-{id}" aria-selected={tab === id} aria-controls="panel" onclick={() => setTab(id)}>{label}</button>
		{/each}
	</nav>

	{#if !data}
		<p class="mute status">Daten werden geladen …</p>
	{:else}
		{#if data.offline || pendingCount}
			<p class="mute status">
				{#if data.offline}Offline · {data.at ? `Stand vom ${fmtWhen(data.at)}` : 'noch keine Daten geladen'}{/if}
				{#if data.offline && pendingCount} · {/if}
				{#if pendingCount}<span class="pend-note">{pendingCount} {pendingCount === 1 ? 'Einheit' : 'Einheiten'} noch nicht hochgeladen – bereits eingerechnet</span>{/if}
			</p>
		{/if}

		<div id="panel" role="tabpanel" aria-labelledby="tab-{tab}">
			{#if tab === 'woche'}
				<section class="card now">
					<h2>Diese Woche <span class="sub">KW {now.week}</span></h2>
					<div class="kpis">
						<div class="kpi">
							<span class="k">Krafttage</span>
							<span class="v">{now.kraft}<small>{' / '}{now.kraftSoll}</small></span>
							<span class="dots" aria-hidden="true">{#each Array(Math.max(now.kraftSoll, now.kraft)) as _, i}<i class:on={i < now.kraft}></i>{/each}</span>
						</div>
						<div class="kpi">
							<span class="k">Zone 2</span>
							<span class="v">{fmtNum(now.zone2, 0)}<small>{' / '}{soll} min</small></span>
							<span class="mute">Aufwärmen {fmtNum(now.warm, 0)} min</span>
						</div>
						<div class="kpi">
							<span class="k">Summe</span>
							<span class="v">{fmtNum(now.total, 0)}<small>{' min'}</small></span>
							<span class="mute">WHO-Richtwert {WHO_MINUTES} min</span>
						</div>
						<div class="kpi">
							<span class="k">Ausdauertag</span>
							<span class="v">{now.bonus ? '✓' : '–'}</span>
							<span class="mute">Bonus, nicht im Soll</span>
						</div>
					</div>
				</section>

				<section>
					<h3>Ausdauer-Minuten pro Woche</h3>
					<WeekChart {weeks} />
					<p class="mute small">
						Soll Zone 2: 2 × {phase?.cardio_min ?? 0} min ({phase?.label ?? '–'}, Phase auf der Startseite gewählt).
						WHO 150 bezieht sich auf die Summe aus Zone 2 und Aufwärmen.
					</p>
				</section>

				<section>
					<h3>Wochen im Detail</h3>
					<div class="tablewrap">
						<table>
							<thead><tr><th>KW</th><th>Kraft</th><th>Bonus</th><th>Zone 2</th><th>Aufw.</th><th>Summe</th></tr></thead>
							<tbody>
								{#each [...weeks].reverse() as k (k.key)}
									<tr class:pending={k.pending}>
										<td>{k.week}</td>
										<td>{k.kraft}/{k.kraftSoll}</td>
										<td>{k.bonus ? '✓' : '–'}</td>
										<td>{fmtNum(k.zone2, 0)}/{k.soll}</td>
										<td>{fmtNum(k.warm, 0)}</td>
										<td>{fmtNum(k.total, 0)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{:else if tab === 'uebung'}
				<section class="ctl">
					<label class="field">Übung
						<select bind:value={exKey} onchange={syncUrl}>
							{#each kraftEx as e (e.key)}<option value={e.key}>{e.name}</option>{/each}
						</select>
					</label>
					<div class="seg" role="radiogroup" aria-label="Kennzahl">
						{#each METRICS as [id, label] (id)}
							<button role="radio" aria-checked={metric === id} aria-pressed={metric === id} onclick={() => (metric = id)}>{label}</button>
						{/each}
					</div>
				</section>
				{#if series.length}
					<section>
						<h3>{metric === 'kg' ? 'Schwerster Satz' : metric === 'reps' ? 'Ø Wiederholungen pro Satz' : 'Volumen (kg × Wdh)'}</h3>
						<LineChart
							points={series.map((p) => ({ date: p.date, value: p[metric], pending: p.pending }))}
							label="{kraftEx.find((e) => e.key === exKey)?.name}: {metricDef[1]} über {series.length} Einheiten"
							unit={metricDef[2]}
							fmt={(v) => fmtNum(v)}
						/>
						<div class="facts">
							<div><span class="k">Zuletzt</span><b>{fmtNum(series[series.length - 1][metric])} {metricDef[2]}</b></div>
							<div><span class="k">Bestwert</span><b>{fmtNum(Math.max(...series.map((p) => p[metric])))} {metricDef[2]}</b></div>
							<div><span class="k">Einheiten</span><b>{series.length}</b></div>
						</div>
					</section>
					<details>
						<summary>Werte als Tabelle</summary>
						<div class="tablewrap">
							<table>
								<thead><tr><th>Datum</th><th>Sätze</th><th>kg</th><th>Ø Wdh</th><th>Volumen</th></tr></thead>
								<tbody>
									{#each [...series].reverse() as p, i (i)}
										<tr class:pending={p.pending}><td>{fmtDay(p.date)}</td><td>{p.sets}</td><td>{fmtNum(p.kg)}</td><td>{fmtNum(p.reps)}</td><td>{fmtNum(p.volume, 0)}</td></tr>
									{/each}
								</tbody>
							</table>
						</div>
					</details>
				{:else}
					<p class="mute empty">Für diese Übung gibt es noch keine erfassten Sätze.</p>
				{/if}
			{:else if tab === 'schulter'}
				{#if shoulder.length}
					<section>
						<h3>Schulterwert pro Einheit <span class="sub">0 = keine Beschwerden</span></h3>
						<LineChart
							points={shoulder}
							label="Schulterwert über {shoulder.length} Einheiten, Skala 0 bis 10"
							yMin={0}
							yMax={10}
						/>
						<div class="facts">
							<div><span class="k">Zuletzt</span><b>{shoulder[shoulder.length - 1].value}</b></div>
							<div><span class="k">Ø letzte 5</span><b>{fmtNum(shoulder.slice(-5).reduce((a, p) => a + p.value, 0) / Math.min(5, shoulder.length))}</b></div>
							<div><span class="k">Einheiten</span><b>{shoulder.length}</b></div>
						</div>
					</section>
					<details>
						<summary>Werte als Tabelle</summary>
						<div class="tablewrap">
							<table>
								<thead><tr><th>Datum</th><th>Einheit</th><th>Schulter</th></tr></thead>
								<tbody>
									{#each [...entries].reverse() as e (e.id)}
										<tr class:pending={e.pending}><td>{fmtDay(new Date(e.started))}</td><td>{e.name}</td><td>{e.shoulder}</td></tr>
									{/each}
								</tbody>
							</table>
						</div>
					</details>
				{:else}
					<p class="mute empty">Noch keine Einheit erfasst.</p>
				{/if}
			{:else}
				<section class="card export">
					<h2>CSV-Export</h2>
					<p>Alle Einheiten in einer Datei: eine Zeile pro Satz, Ausdauer- und Aufwärm-Eintrag, mit Datum und Einheit in jeder Zeile. Format für Excel: Semikolon und Dezimalkomma.</p>
					<p class="mute">{entries.length} Einheiten · {csvRows} Zeilen{#if entries.length}{' · '}{fmtDate(new Date(entries[0].started))} bis {fmtDate(new Date(entries[entries.length - 1].started))}{/if}</p>
					{#if pendingCount}<p class="mute">Noch nicht hochgeladene Einheiten sind enthalten und in der Spalte „Status“ markiert.</p>{/if}
					<button class="primary" disabled={!csvRows} onclick={download}>CSV herunterladen</button>
				</section>
			{/if}
		</div>
	{/if}
</main>

<style>
	header { display: flex; align-items: center; gap: 12px; }
	.back { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border-radius: 50%; background: var(--soft); color: var(--ink); text-decoration: none; font-size: 26px; line-height: 1; padding-bottom: 3px; }
	.tabs {
		position: sticky; top: env(safe-area-inset-top); z-index: 2; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
		margin: 16px 0 4px; padding: 4px; background: var(--soft); border-radius: 12px;
	}
	.tabs button { border: 0; background: transparent; padding: 0 4px; font-size: 15px; }
	.tabs button[aria-selected='true'] { background: var(--card); color: var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / .15); }
	.status { margin: 10px 0 0; }
	.pend-note::before { content: '○ '; }
	section { margin-top: 20px; }
	h2 .sub, h3 .sub { font: 500 14px Inter, sans-serif; color: var(--mute); }
	h3 { font-size: 17px; margin: 0 0 10px; }
	.now h2 { font-size: 24px; }
	.kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 12px; margin-top: 12px; }
	.kpi { display: grid; gap: 2px; align-content: start; }
	.k { font-size: 13px; color: var(--mute); }
	.v { font: 700 30px/1.1 var(--disp); }
	.v small { font: 500 15px Inter, sans-serif; color: var(--mute); }
	.kpi .mute { font-size: 13px; }
	.dots { display: flex; gap: 6px; margin-top: 2px; }
	.dots i { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--ink); }
	.dots i.on { background: var(--ink); }
	.small { font-size: 13px; margin: 8px 0 0; }
	.ctl { display: grid; gap: 12px; }
	.field { display: grid; gap: 4px; font-size: 14px; color: var(--mute); }
	.field select { width: 100%; color: var(--ink); }
	.seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 4px; background: var(--soft); border-radius: 12px; }
	.seg button { border: 0; background: transparent; }
	.seg button[aria-pressed='true'] { background: var(--card); color: var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / .15); }
	.facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
	.facts div { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; display: grid; }
	.facts b { font-size: 17px; }
	details { margin-top: 16px; }
	summary { min-height: 44px; display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; list-style: none; }
	summary::-webkit-details-marker { display: none; }
	summary::before { content: '›'; font-size: 22px; line-height: 1; transition: transform .2s; }
	details[open] summary::before { transform: rotate(90deg); }
	.tablewrap { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
	th { text-align: left; font-weight: 600; color: var(--mute); font-size: 13px; padding: 6px 6px 6px 0; border-bottom: 1px solid var(--line); }
	td { padding: 9px 6px 9px 0; border-bottom: 1px solid var(--line); white-space: nowrap; }
	tr.pending td:first-child::after { content: ' ○'; color: var(--mute); }
	.empty { margin-top: 24px; }
	.export { display: grid; gap: 10px; margin-top: 20px; }
	.export p { margin: 0; }
	.export button { font-size: 17px; }
</style>

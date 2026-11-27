<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { cachedCatalog, cachedLastValues, resolveTemplate, defaultReps, rememberLastValues, progressionHint } from '$lib/data';
	import { enqueue, flush } from '$lib/outbox';
	import { live, persist, discardSession, elapsedSec, timerLeft } from '$lib/live.svelte.js';
	import ExerciseHelp from '$lib/ExerciseHelp.svelte';

	const catalog = cachedCatalog();
	const last = cachedLastValues();
	let now = $state(Date.now());
	let compact = $state(false);
	let menu = $state(null); // null | 'menu' | 'end' | 'discard'
	let menuDlg = $state();
	let saving = $state(false);
	let helpEx = $state(null);
	const exByKey = Object.fromEntries(catalog.exercises.map((e) => [e.key, e]));

	const s = $derived(live.s);
	const tpl = $derived(s ? catalog.templates.find((t) => t.key === s.tplKey) : null);
	const plan = $derived(tpl ? resolveTemplate(tpl, s.phaseKey, catalog.exercises) : null);
	const items = $derived(plan ? plan.blocks.flatMap((b) => b.items) : []);

	const fmt = (sec) => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
	const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

	// Eingabefelder einmalig beim Laden vorbelegen (nicht während des Renderns).
	function initInputs() {
		for (const it of items) {
			if (it.type !== 'sets' || s.inputs[it.key]) continue;
			const L = last[it.key];
			s.inputs[it.key] = { kg: L?.length ? String(L[L.length - 1].kg) : '', reps: String(defaultReps(it.reps) || '') };
		}
	}
	if (s && plan) initInputs();
	const input = (it) => s.inputs[it.key] || { kg: '', reps: '' };
	const setsOf = (it) => s.sets[it.id] || [];
	const timer = (it) => s.timers[it.id] || { left: it.seconds, since: null };
	const isDone = (it) =>
		it.type === 'sets' ? setsOf(it).length >= it.sets : it.type === 'check' ? !!s.checks[it.id] : !!s.checks[it.id] || timerLeft(timer(it), now) <= 0;
	const done = $derived(s ? items.filter(isDone).length : 0);
	// Was gerade dran ist: die erste offene Übung, bei Supersätzen die ganze Gruppe.
	const nowItem = $derived(s ? items.find((it) => !isDone(it)) : null);
	const isNow = (it) => !!nowItem && !isDone(it) && (it === nowItem || (!!it.group && it.block === nowItem.block && it.group === nowItem.group));
	const nextInGroup = (it) => {
		const g = items.filter((x) => x.block === it.block && x.group && x.group === it.group);
		return g[g.indexOf(it) + 1] || null;
	};
	const STEP = { kg: 2.5, reps: 1 };
	const fmtKg = (v) => String(v).replace('.', ',');
	const hintFor = (it) => (it.type === 'sets' ? progressionHint(last[it.key], it.reps) : null);
	function applyHint(it, h) {
		s.inputs[it.key].kg = String(h.kg);
		s.inputs[it.key].reps = String(h.reps);
		persist();
	}
	function step(it, field, dir) {
		const v = Math.max(0, num(s.inputs[it.key][field]) + dir * STEP[field]);
		s.inputs[it.key][field] = String(Math.round(v * 100) / 100);
		persist();
	}
	const elapsed = $derived(s ? elapsedSec(s.clock, now) : 0);
	const restLeft = $derived(s?.rest ? Math.max(0, (s.rest.until - now) / 1000) : 0);

	function toggleClock() {
		const c = s.clock;
		if (c.since) { c.acc += (Date.now() - c.since) / 1000; c.since = null; } else c.since = Date.now();
		persist();
	}

	$effect(() => {
		if (!menuDlg) return;
		if (menu && !menuDlg.open) menuDlg.showModal();
		else if (!menu && menuDlg.open) menuDlg.close();
	});

	function endTraining() {
		if (s.clock.since) toggleClock();
		for (const t of Object.values(s.timers)) if (t.since) { t.left = timerLeft(t, Date.now()); t.since = null; }
		s.rest = null;
		s.ended = new Date().toISOString();
		persist();
		menu = null;
		scrollTo({ top: 0 });
	}

	function resumeTraining() {
		s.ended = null;
		if (!s.clock.since) toggleClock();
		persist();
		menu = null;
	}

	function discard() {
		menu = null;
		discardSession();
		goto('/');
	}

	function tapSet(it, i) {
		if (!s.sets[it.id]) s.sets[it.id] = [];
		const list = s.sets[it.id]; // erst nach der Zuweisung lesen, sonst rohes Array statt Proxy
		if (i < list.length) list.length = i;
		else {
			const v = input(it);
			while (list.length <= i) list.push({ kg: num(v.kg), reps: Math.round(num(v.reps)) });
			if (it.rest && list.length < it.sets) s.rest = { until: Date.now() + it.rest * 1000, total: it.rest };
		}
		persist();
	}

	function toggleTimer(it) {
		if (!s.timers[it.id]) s.timers[it.id] = { left: it.seconds, since: null };
		const t = s.timers[it.id];
		if (t.since) { t.left = timerLeft(t, Date.now()); t.since = null; }
		else { if (t.left <= 0) t.left = it.seconds; t.since = Date.now(); }
		persist();
	}

	function toggleCheck(it) { s.checks[it.id] = !s.checks[it.id]; persist(); }

	function minutesIn(blockId) {
		let sec = 0;
		for (const it of items.filter((x) => x.block === blockId && x.type === 'timer')) {
			const t = s.timers[it.id];
			sec += t ? it.seconds - timerLeft(t, now) : s.checks[it.id] ? it.seconds : 0;
		}
		return Math.round(sec / 60);
	}
	const cardioAuto = $derived(s && plan ? plan.blocks.filter((b) => b.id === 'cardio').reduce((a, b) => a + minutesIn(b.id), 0) : 0);
	const warmAuto = $derived(s && plan ? plan.blocks.filter((b) => b.id === 'warm').reduce((a, b) => a + minutesIn(b.id), 0) : 0);
	const loggedSets = $derived(s ? Object.values(s.sets).reduce((a, l) => a + l.length, 0) : 0);

	async function finish() {
		saving = true;
		const sets = items.filter((it) => it.type === 'sets').flatMap((it) => setsOf(it).map((x, i) => ({ key: it.key, set_no: i + 1, kg: x.kg, reps: x.reps })));
		const volume = sets.reduce((a, x) => a + x.kg * x.reps, 0);
		const cardioMin = s.fin.cardio !== '' ? num(s.fin.cardio) : cardioAuto;
		const cardio = [];
		if (warmAuto > 0) cardio.push({ phase: 'aufwaermen', minutes: warmAuto });
		if (cardioMin > 0) cardio.push({ phase: 'ausdauer', device: s.fin.device, minutes: cardioMin });
		const clientId = s.startedAt.replace(/[^0-9]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 6);
		enqueue({
			client_id: clientId,
			tplKey: s.tplKey,
			session: {
				kind: tpl.kind,
				phase: s.phaseKey,
				started: s.startedAt,
				ended: s.ended || new Date().toISOString(),
				duration_min: Math.round(elapsed / 60),
				volume_kg: Math.round(volume),
				shoulder: Math.round(num(s.fin.shoulder)),
				note: String(s.fin.note).slice(0, 1000),
				prep_done: items.filter((it) => it.type === 'check' && s.checks[it.id]).map((it) => it.key)
			},
			sets,
			cardio
		});
		rememberLastValues(sets);
		discardSession();
		flush();
		goto('/');
	}

	onMount(() => {
		if (!live.s || !tpl) { goto('/'); return; }
		const iv = setInterval(() => {
			now = Date.now();
			if (s?.rest && now >= s.rest.until) { s.rest = null; persist(); try { navigator.vibrate?.(300); } catch {} }
			for (const it of items) {
				const t = s?.timers[it.id];
				if (t?.since && timerLeft(t, now) <= 0) { t.left = 0; t.since = null; persist(); try { navigator.vibrate?.([200, 100, 200]); } catch {} }
			}
		}, 500);
		// Hysterese: Die Kopfzeile ändert beim Umschalten ihre Höhe und damit scrollY; eine einzige Schwelle würde flackern.
		const onScroll = () => { if (!compact && scrollY > 64) compact = true; else if (compact && scrollY < 8) compact = false; };
		addEventListener('scroll', onScroll, { passive: true });
		let wake = null;
		navigator.wakeLock?.request('screen').then((w) => (wake = w)).catch(() => {});
		return () => { clearInterval(iv); removeEventListener('scroll', onScroll); wake?.release?.(); };
	});
</script>

{#if s && plan}
	<header class="bar" class:compact>
		<a class="icon" href="/" aria-label="Zur Startseite, die Einheit läuft weiter">‹</a>
		<div class="ttl">
			<b>{tpl.name}</b>
			<span>{done}/{items.length} erledigt{plan.phase ? ` · ${plan.phase.label}` : ''}</span>
		</div>
		{#if !s.ended}
			<button class="pp" class:paused={!s.clock.since} onclick={toggleClock} aria-label={s.clock.since ? 'Zeit pausieren' : 'Zeit fortsetzen'}>{s.clock.since ? '❚❚' : '▶'}</button>
		{/if}
		<button class="clock" class:paused={!s.clock.since && !s.ended} onclick={() => (menu = 'menu')} aria-haspopup="dialog" aria-label="Steuerung öffnen, Zeit {fmt(elapsed)}">
			<span class="num">{fmt(elapsed)}</span>
			<span class="ic" aria-hidden="true">•••</span>
		</button>
		<div class="prog" aria-hidden="true"><span style="width:{(done / items.length) * 100}%"></span></div>
	</header>

	<main>
		{#if !s.ended}
		{#each plan.blocks as b (b.id)}
			<section class="block">
				<h2>{b.name} <em>{b.minutes} min</em></h2>
				{#if b.hint}<p class="bhint">{b.hint}</p>{/if}
				{#each b.items as it (it.id)}
					{@const ex = exByKey[it.key]}
					{@const next = nextInGroup(it)}
					<article class="it" class:ok={isDone(it)} class:now={isNow(it)} data-g={it.group} data-type={it.type}>
						<div class="head">
							{#if it.group}<span class="tag" aria-label="Supersatz {it.group}">{it.group}</span>{/if}
							<div class="ttl2">
								{#if isNow(it)}<span class="badge">Jetzt</span>{/if}
								<h3>{it.name}</h3>
								{#if it.type === 'sets'}
									<p class="plan">{it.sets} × {it.reps} Wdh{#if next}{' · '}dann direkt {next.name.split(',')[0]}{:else if it.rest}{' · '}danach {it.rest} s Pause{/if}</p>
								{/if}
							</div>
							<button class="info" aria-label="Hilfe zu {it.name}" onclick={() => (helpEx = ex || { name: it.name, hint: it.hint })}>i</button>
							{#if it.type === 'check'}
								<button class="box chk" aria-pressed={!!s.checks[it.id]} aria-label="Erledigt" onclick={() => toggleCheck(it)}>✓</button>
							{/if}
						</div>
						{#if !isDone(it)}
							{#if it.hint}<p class="hint">{it.hint}</p>{/if}
							{#if it.type === 'sets' && last[it.key]?.length}
								<p class="last">Letztes Mal: {last[it.key].map((x) => `${x.kg} kg × ${x.reps}`).join(' · ')}</p>
							{/if}
							{@const h = hintFor(it)}
							{#if h}
								{@const taken = s.inputs[it.key]?.kg !== '' && Number(String(s.inputs[it.key].kg).replace(',', '.')) >= h.kg}
								<div class="prog-hint" class:taken>
									<span><b>↑ Steigern auf {fmtKg(h.kg)} kg</b><small>Letztes Mal alle Sätze mit {h.top} Wdh geschafft</small></span>
									{#if taken}
										<span class="ok-mark">✓ übernommen</span>
									{:else}
										<button onclick={() => applyHint(it, h)} aria-label="Steigerung für {it.name} übernehmen: {fmtKg(h.kg)} kg">Übernehmen</button>
									{/if}
								</div>
							{/if}
						{/if}
						{#if it.type === 'sets'}
							{#if !isDone(it)}
								<div class="steppers">
									<div class="stepper">
										<span class="lbl">Gewicht (kg)</span>
										<div class="row">
											<button class="st" aria-label="Gewicht {it.name} weniger" onclick={() => step(it, 'kg', -1)}>−</button>
											<input inputmode="decimal" placeholder="kg" bind:value={s.inputs[it.key].kg} onchange={persist} aria-label="Gewicht {it.name}" />
											<button class="st" aria-label="Gewicht {it.name} mehr" onclick={() => step(it, 'kg', 1)}>+</button>
										</div>
									</div>
									<div class="stepper">
										<span class="lbl">Wiederholungen</span>
										<div class="row">
											<button class="st" aria-label="Wiederholungen {it.name} weniger" onclick={() => step(it, 'reps', -1)}>−</button>
											<input inputmode="numeric" bind:value={s.inputs[it.key].reps} onchange={persist} aria-label="Wiederholungen {it.name}" />
											<button class="st" aria-label="Wiederholungen {it.name} mehr" onclick={() => step(it, 'reps', 1)}>+</button>
										</div>
									</div>
								</div>
								<p class="lbl tap">Satz geschafft? Antippen.</p>
							{/if}
							<div class="sets" style="--n:{it.sets}">
								{#each Array(it.sets) as _, i}
									{@const x = setsOf(it)[i]}
									<button class="set" aria-pressed={!!x} aria-label="Satz {i + 1}" onclick={() => tapSet(it, i)}>
										<span>{x ? '✓ ' : ''}Satz {i + 1}</span>
										{#if x}<small>{x.kg} kg × {x.reps}</small>{/if}
									</button>
								{/each}
							</div>
						{:else if it.type === 'timer'}
							<div class="timer">
								<span class="tm">{fmt(timerLeft(timer(it), now))}</span>
								<button class="primary go" onclick={() => toggleTimer(it)}>{timer(it).since ? 'Pause' : timerLeft(timer(it), now) < it.seconds ? 'Weiter' : 'Start'}</button>
								<button class="box" aria-pressed={!!s.checks[it.id]} aria-label="Erledigt" onclick={() => toggleCheck(it)}>✓</button>
							</div>
						{/if}
					</article>
				{/each}
			</section>
		{/each}

		<section class="endzone">
			<p class="mute">{done} von {items.length} erledigt</p>
			<button class="primary endbtn" onclick={() => (menu = 'end')}>Training beenden</button>
		</section>
		{:else}
		<section class="card fin">
			<h2>Einheit abschließen</h2>
			<p class="mute">{loggedSets} {loggedSets === 1 ? 'Satz' : 'Sätze'} erfasst · Dauer {fmt(elapsed)}</p>
			<label class="shoulder">
				<span class="row2"><span>Schulter heute</span><b class="sv">{s.fin.shoulder}<small>{' / 10'}</small></b></span>
				<input type="range" min="0" max="10" step="1" bind:value={s.fin.shoulder} onchange={persist} />
				<span class="scale"><span>0 keine Beschwerden</span><span>10 stark</span></span>
			</label>
			<div class="two">
				<label>Ausdauer-Minuten <input type="number" inputmode="numeric" min="0" max="300" placeholder={String(cardioAuto)} bind:value={s.fin.cardio} onchange={persist} /></label>
				<label>Gerät
					<select bind:value={s.fin.device} onchange={persist}>
						<option value="">–</option><option value="crosstrainer">Crosstrainer</option><option value="rad">Rad</option><option value="laufband">Laufband</option><option value="gemischt">Gemischt</option>
					</select>
				</label>
			</div>
			<label>Notiz <textarea rows="2" maxlength="1000" bind:value={s.fin.note} onchange={persist} placeholder="z. B. Brustpresse links leichtes Ziehen"></textarea></label>
			<button class="primary save" disabled={saving} onclick={finish}>Einheit speichern</button>
			<button class="discard" onclick={resumeTraining}>Zurück zum Training</button>
		</section>
		{/if}
	</main>

	<div class="rest" class:show={restLeft > 0} aria-live="polite">
		<span class="num">Pause {fmt(restLeft)}</span>
		<div class="rb"><span style="width:{s.rest ? (restLeft / s.rest.total) * 100 : 0}%"></span></div>
		<button onclick={() => { s.rest = null; persist(); }}>Weiter</button>
	</div>

	<ExerciseHelp ex={helpEx} onclose={() => (helpEx = null)} />

	<dialog bind:this={menuDlg} class="sheet ctlsheet" aria-labelledby="ctl-title" onclose={() => (menu = null)} onclick={(e) => e.target === menuDlg && menuDlg.close()}>
		<div class="inner">
			<div class="grip" aria-hidden="true"></div>
			{#if menu === 'end'}
				<h2 id="ctl-title">Training beenden?</h2>
				<p>Die Zeit wird bei <b>{fmt(elapsed)}</b> angehalten. Danach kommen die Abschlussfragen.{#if done < items.length}{' '}Noch {items.length - done} {items.length - done === 1 ? 'Übung' : 'Übungen'} offen.{/if}</p>
				<button class="primary" onclick={endTraining}>Ja, beenden</button>
				<button onclick={() => (menu = null)}>Abbrechen</button>
			{:else if menu === 'discard'}
				<h2 id="ctl-title">Einheit verwerfen?</h2>
				<p>Alle Eingaben dieser Einheit gehen verloren. Das lässt sich nicht rückgängig machen.</p>
				<button class="danger" onclick={discard}>Ja, verwerfen</button>
				<button onclick={() => (menu = null)}>Abbrechen</button>
			{:else}
				<h2 id="ctl-title">Training</h2>
				<p class="big"><span class="num">{fmt(elapsed)}</span><span class="mute">{s.ended ? 'beendet' : s.clock.since ? 'läuft' : 'pausiert'} · {done}/{items.length} erledigt</span></p>
				{#if s.ended}
					<button class="primary" onclick={resumeTraining}>Zurück zum Training</button>
				{:else}
					<button onclick={toggleClock}>{s.clock.since ? 'Zeit pausieren' : 'Zeit fortsetzen'}</button>
					<button class="primary" onclick={() => (menu = 'end')}>Training beenden</button>
				{/if}
				<button class="danger-out" onclick={() => (menu = 'discard')}>Einheit verwerfen</button>
				<button onclick={() => (menu = null)}>Schließen</button>
			{/if}
		</div>
	</dialog>
{/if}

<style>
	.bar {
		position: sticky; top: 0; z-index: 5; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto auto; gap: 8px; align-items: center;
		padding: calc(8px + env(safe-area-inset-top)) 16px 10px; margin-top: calc(-1 * env(safe-area-inset-top));
		background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--line);
	}
	.icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: var(--soft); color: var(--ink); text-decoration: none; font-size: 26px; line-height: 1; padding-bottom: 3px; }
	.ttl { display: grid; line-height: 1.25; }
	.ttl b { font: 700 19px/1.1 var(--disp); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.ttl span { font-size: 13px; color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.pp { width: 44px; padding: 0; border-radius: 50%; font-size: 13px; color: var(--acc); background: var(--soft); border: 1px solid var(--line); }
	.pp.paused { background: var(--acc); border-color: var(--acc); color: #fff; }
	.bar.compact { padding-top: calc(4px + env(safe-area-inset-top)); padding-bottom: 6px; }
	.bar.compact .ttl b { font-size: 16px; -webkit-line-clamp: 1; line-clamp: 1; }
	.bar.compact .ttl span { display: none; }
	.bar.compact .clock { min-height: 44px; }
	.bar.compact .clock .num { font-size: 22px; }
	.clock { gap: 8px; padding: 0 12px; background: var(--soft); color: var(--ink); border: 1px solid var(--line); min-height: 48px; border-radius: 14px; }
	.clock .num { font: 700 28px/1 var(--disp); font-variant-numeric: tabular-nums; }
	.clock .ic { font-size: 10px; letter-spacing: 1px; color: var(--mute); }
	.clock.paused { background: var(--acc); border-color: var(--acc); color: #fff; }
	.clock.paused .ic { color: #fff; }
	.endzone { margin-top: 32px; display: grid; gap: 8px; text-align: center; }
	.endzone p { margin: 0; }
	.endbtn { min-height: 56px; font-size: 17px; }
	.prog { grid-column: 1 / -1; height: 4px; background: var(--soft); border-radius: 2px; overflow: hidden; }
	.prog span { display: block; height: 100%; background: var(--acc); transition: width .3s; }

	.block { margin-top: 26px; }
	.block:first-child { margin-top: 6px; }
	h2 em { font: 500 16px Inter, sans-serif; color: var(--mute); font-style: normal; }
	.bhint { margin: 4px 0 10px; font-size: 14px; color: var(--mute); }

	.it, .fin, .block { scroll-margin-top: 96px; }
	.it { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 14px; margin-top: 10px; transition: border-color .2s, opacity .2s; }
	.it.now { border: 2px solid var(--acc); padding: 13px; box-shadow: 0 4px 18px color-mix(in srgb, var(--acc) 18%, transparent); }
	.it.ok { background: var(--soft); border-color: transparent; }
	.it.ok h3 { color: var(--mute); }
	.head { display: flex; align-items: flex-start; gap: 12px; }
	.ttl2 { flex: 1; }
	.badge { display: inline-block; font: 700 11px Inter, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--acc); }
	.it h3 { font-size: 17px; line-height: 1.3; margin: 0; }
	.plan { margin: 2px 0 0; font-size: 14px; color: var(--mute); }
	.tag { width: 40px; height: 40px; flex: none; border-radius: 12px; display: grid; place-items: center; font: 700 22px var(--disp); background: var(--soft); }
	[data-g='A'] .tag { background: #f4a259; color: #2a1600; }
	[data-g='B'] .tag { background: var(--sup); color: light-dark(#fff, #0b1736); }
	[data-g='C'] .tag { background: #2f9e8f; color: #fff; }
	[data-g='D'] .tag { background: var(--ink); color: var(--bg); }
	.info {
		width: 44px; height: 44px; flex: none; padding: 0; border-radius: 50%; font: italic 700 19px Georgia, serif;
		background: transparent; border: 2px solid var(--line); color: var(--sup);
	}
	.hint { margin: 10px 0 0; font-size: 14px; color: var(--mute); }
	.last { margin: 6px 0 0; color: var(--sup); font-size: 14px; font-weight: 500; }
	.prog-hint {
		display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; padding: 8px 8px 8px 12px;
		border-radius: 12px; background: color-mix(in srgb, #2f9e8f 14%, var(--card)); border: 1px solid color-mix(in srgb, #2f9e8f 45%, transparent);
	}
	.prog-hint b { display: block; font-size: 15px; }
	.prog-hint small { font-size: 13px; color: var(--mute); }
	.prog-hint button { flex: none; background: #1f7a6e; border: 0; color: #fff; }
	.ok-mark { flex: none; font-size: 14px; font-weight: 600; color: light-dark(#1f6f64, #5fd3c2); padding-right: 6px; }

	.steppers { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
	.stepper { display: grid; gap: 4px; }
	.lbl { font-size: 12px; color: var(--mute); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
	.row { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg); }
	.row input { border: 0; border-radius: 0; text-align: center; font: 700 20px Inter, sans-serif; padding: 0 2px; width: 100%; min-height: 48px; background: transparent; }
	.st { border: 0; border-radius: 0; min-height: 48px; padding: 0; font-size: 24px; background: var(--soft); }
	.tap { margin: 12px 0 0; }
	.sets { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 8px; margin-top: 6px; }
	.set { min-height: 56px; flex-direction: column; gap: 0; padding: 4px; font-size: 16px; border-width: 2px; }
	.set small { font: 500 12px Inter, sans-serif; opacity: .9; }
	.set[aria-pressed='true'] { background: var(--acc); border-color: var(--acc); color: #fff; }
	.it.ok .sets { margin-top: 10px; }

	.timer { display: grid; grid-template-columns: minmax(0, 1fr) auto 52px; gap: 10px; align-items: center; margin-top: 12px; }
	.tm { font: 700 40px/1 var(--disp); font-variant-numeric: tabular-nums; }
	.go { min-height: 52px; min-width: 104px; font-size: 17px; }
	.box { width: 52px; height: 52px; padding: 0; font: 700 22px var(--disp); border-width: 2px; }
	.box.chk { width: 44px; height: 44px; flex: none; }
	.box[aria-pressed='true'] { background: var(--acc); border-color: var(--acc); color: #fff; }

	.fin { margin-top: 16px; border: 2px solid var(--ink); display: grid; gap: 14px; }
	.fin label { display: grid; gap: 6px; font-size: 15px; }
	.fin p { margin: 0; }
	.row2 { display: flex; justify-content: space-between; align-items: baseline; }
	.sv { font: 700 34px/1 var(--disp); }
	.sv small { font: 500 15px Inter, sans-serif; color: var(--mute); }
	.shoulder input[type='range'] { accent-color: var(--acc); padding: 0; width: 100%; height: 44px; border: 0; background: transparent; }
	.scale { display: flex; justify-content: space-between; font-size: 12px; color: var(--mute); }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.two input, .two select { width: 100%; }
	.save { font-size: 17px; min-height: 52px; }
	.discard { background: transparent; color: var(--mute); }

	.sheet {
		margin: auto 0 0; width: 100%; max-width: 100%; max-height: 88dvh; padding: 0; border: 0; border-radius: 22px 22px 0 0;
		background: var(--card); color: var(--ink); box-shadow: 0 -8px 30px rgb(0 0 0 / .3); overflow-y: auto;
	}
	.sheet[open] { animation: up .22s ease-out; }
	.sheet::backdrop { background: rgb(0 0 0 / .45); }
	@keyframes up { from { transform: translateY(40px); opacity: .4; } }
	@media (min-width: 700px) { .sheet { margin: auto; max-width: 480px; border-radius: 22px; } }
	.inner { padding: 8px 20px calc(20px + env(safe-area-inset-bottom)); display: grid; gap: 10px; }
	.grip { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 0 auto 4px; }
	.ctlsheet h2 { font-size: 26px; }
	.ctlsheet p { margin: 0 0 6px; }
	.ctlsheet button { min-height: 52px; font-size: 17px; }
	.big { display: grid; }
	.big .num { font: 700 48px/1 var(--disp); font-variant-numeric: tabular-nums; }
	.danger { background: light-dark(#b42318, #e5484d); border: 0; color: #fff; }
	.danger-out { color: light-dark(#b42318, #ff8a7a); background: transparent; }

	.rest {
		position: fixed; inset: auto 0 0 0; z-index: 6; background: var(--ink); color: var(--bg);
		padding: 14px 16px calc(14px + env(safe-area-inset-bottom)); display: flex; gap: 14px; align-items: center;
		transform: translateY(110%); transition: transform .25s; border-radius: 20px 20px 0 0;
	}
	.rest.show { transform: none; }
	.rest .num { font: 700 32px/1 var(--disp); white-space: nowrap; font-variant-numeric: tabular-nums; }
	.rb { flex: 1; height: 8px; background: rgba(127, 127, 127, .35); border-radius: 4px; overflow: hidden; }
	.rb span { display: block; height: 100%; background: var(--acc); }
	.rest button { background: transparent; color: var(--bg); border-color: currentColor; min-height: 48px; }
	@media (prefers-reduced-motion: reduce) { .rest, .prog span, .it { transition: none; } .sheet[open] { animation: none; } }
</style>

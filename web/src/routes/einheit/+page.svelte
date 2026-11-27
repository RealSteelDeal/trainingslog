<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { cachedCatalog, cachedLastValues, resolveTemplate, defaultReps, rememberLastValues } from '$lib/data';
	import { enqueue, flush } from '$lib/outbox';
	import { live, persist, discardSession, elapsedSec, timerLeft } from '$lib/live.svelte.js';

	const catalog = cachedCatalog();
	const last = cachedLastValues();
	let now = $state(Date.now());
	let confirmDiscard = $state(false);
	let saving = $state(false);

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
	const elapsed = $derived(s ? elapsedSec(s.clock, now) : 0);
	const restLeft = $derived(s?.rest ? Math.max(0, (s.rest.until - now) / 1000) : 0);

	function toggleClock() {
		const c = s.clock;
		if (c.since) { c.acc += (Date.now() - c.since) / 1000; c.since = null; } else c.since = Date.now();
		persist();
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
				ended: new Date().toISOString(),
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
		let wake = null;
		navigator.wakeLock?.request('screen').then((w) => (wake = w)).catch(() => {});
		return () => { clearInterval(iv); wake?.release?.(); };
	});
</script>

{#if s && plan}
	<main>
		<header>
			<div>
				<h1>{tpl.name}</h1>
				<p class="mute">{plan.phase ? `${plan.phase.label} · ${plan.phase.sets} Sätze · ` : ''}{plan.totalMin} Minuten geplant</p>
			</div>
			<div class="board">
				<span class="num">{fmt(elapsed)}</span>
				<button onclick={toggleClock}>{s.clock.since ? 'Pause' : 'Weiter'}</button>
			</div>
		</header>
		<div class="prog" aria-label="Fortschritt"><span style="width:{(done / items.length) * 100}%"></span></div>

		{#each plan.blocks as b (b.id)}
			<section>
				<h2>{b.name} <em>{b.minutes} min</em></h2>
				{#if b.hint}<p class="mute">{b.hint}</p>{/if}
				{#each b.items as it (it.id)}
					<div class="it" class:ok={isDone(it)} class:chk={it.type === 'check'} data-g={it.group}>
						<div class="tag">{it.group || (it.type === 'timer' ? '⏱' : '·')}</div>
						<div>
							<h3>{it.name}</h3>
							{#if it.hint}<p class="mute">{it.hint}</p>{/if}
							{#if it.type === 'sets' && last[it.key]?.length}
								<p class="last">Letztes Mal: {last[it.key].map((x) => `${x.kg} kg × ${x.reps}`).join(' · ')}</p>
							{/if}
						</div>
						<div class="ctl">
							{#if it.type === 'sets'}
								<span class="mute">{it.sets} × {it.reps}</span>
								<label class="unit"><input inputmode="decimal" bind:value={s.inputs[it.key].kg} onchange={persist} aria-label="Gewicht {it.name}" />kg</label>
								<label class="unit"><input inputmode="numeric" bind:value={s.inputs[it.key].reps} onchange={persist} aria-label="Wiederholungen {it.name}" />Wdh</label>
								{#each Array(it.sets) as _, i}
									<button class="box" aria-pressed={i < setsOf(it).length} aria-label="Satz {i + 1}" onclick={() => tapSet(it, i)}>{i + 1}</button>
								{/each}
							{:else if it.type === 'timer'}
								<span class="tm">{fmt(timerLeft(timer(it), now))}</span>
								<button onclick={() => toggleTimer(it)}>{timer(it).since ? 'Pause' : 'Start'}</button>
								<button class="box" aria-pressed={!!s.checks[it.id]} aria-label="Erledigt" onclick={() => toggleCheck(it)}>✓</button>
							{:else}
								<button class="box" aria-pressed={!!s.checks[it.id]} aria-label="Erledigt" onclick={() => toggleCheck(it)}>✓</button>
							{/if}
						</div>
					</div>
				{/each}
			</section>
		{/each}

		<section class="card fin">
			<h2>Einheit abschließen</h2>
			<p class="mute">{loggedSets} Sätze erfasst · Dauer {fmt(elapsed)}</p>
			<label>Schulter heute: <b>{s.fin.shoulder}</b> von 10 (0 = keine Beschwerden)
				<input type="range" min="0" max="10" step="1" bind:value={s.fin.shoulder} onchange={persist} />
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
			<button class="discard" onclick={() => { if (confirmDiscard) { discardSession(); goto('/'); } else { confirmDiscard = true; setTimeout(() => (confirmDiscard = false), 3000); } }}>
				{confirmDiscard ? 'Wirklich verwerfen?' : 'Einheit verwerfen'}
			</button>
		</section>
	</main>

	<div class="rest" class:show={restLeft > 0} aria-live="polite">
		<span class="num">Pause {fmt(restLeft)}</span>
		<div class="rb"><span style="width:{s.rest ? (restLeft / s.rest.total) * 100 : 0}%"></span></div>
		<button onclick={() => { s.rest = null; persist(); }}>Weiter</button>
	</div>
{/if}

<style>
	header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: end; }
	header p { margin: 4px 0 0; }
	.board { background: var(--ink); color: var(--bg); border-radius: 14px; padding: 10px 14px; display: flex; gap: 12px; align-items: center; }
	.board button { background: var(--acc); color: #fff; border: 0; }
	.num { font: 700 40px/1 var(--disp); white-space: nowrap; }
	.prog { height: 6px; background: var(--soft); border-radius: 3px; overflow: hidden; margin-top: 16px; }
	.prog span { display: block; height: 100%; background: var(--ink); transition: width .3s; }
	section { margin-top: 28px; }
	h2 em { font: 500 17px Inter, sans-serif; color: var(--mute); font-style: normal; }
	section > .mute { margin: 4px 0 8px; }
	.it { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 12px; align-items: center; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px; margin-top: 8px; }
	.it.ok { background: var(--soft); }
	.it.ok h3 { text-decoration: line-through; text-decoration-color: var(--mute); }
	.it h3 { font-size: 16px; margin: 0; }
	.it p { margin: 2px 0 0; }
	.last { color: var(--sup); font-size: 14px; }
	.tag { width: 44px; height: 44px; border-radius: 10px; display: grid; place-items: center; font: 700 20px var(--disp); background: var(--soft); }
	[data-g='A'] .tag { background: #f4a259; color: #2a1600; }
	[data-g='B'] .tag { background: var(--sup); color: #fff; }
	[data-g='C'] .tag { background: #2f9e8f; color: #fff; }
	[data-g='D'] .tag { background: var(--ink); color: var(--bg); }
	.ctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
	.unit { display: flex; align-items: center; gap: 4px; font-size: 14px; color: var(--mute); }
	.unit input { width: 62px; text-align: right; }
	.box { width: 44px; padding: 0; font: 700 20px var(--disp); }
	.box[aria-pressed='true'] { background: var(--acc); border-color: var(--acc); color: #fff; }
	.tm { font: 700 26px var(--disp); min-width: 62px; text-align: right; }
	.fin { border: 2px solid var(--ink); display: grid; gap: 12px; }
	.fin label { display: grid; gap: 6px; font-size: 15px; }
	.fin input[type='range'] { accent-color: var(--acc); padding: 0; }
	.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
	.save { font-size: 17px; }
	.discard { background: transparent; }
	.rest { position: fixed; inset: auto 0 0 0; background: var(--ink); color: var(--bg); padding: 12px max(4vw, 14px) calc(12px + env(safe-area-inset-bottom)); display: flex; gap: 14px; align-items: center; transform: translateY(110%); transition: transform .25s; }
	.rest.show { transform: none; }
	.rest .num { font-size: 30px; }
	.rb { flex: 1; height: 8px; background: rgba(127, 127, 127, .35); border-radius: 4px; overflow: hidden; }
	.rb span { display: block; height: 100%; background: var(--acc); }
	.rest button { background: transparent; color: var(--bg); border-color: currentColor; }
	@media (max-width: 600px) {
		header { grid-template-columns: minmax(0, 1fr); }
		.board { justify-content: space-between; }
		.it { grid-template-columns: 44px minmax(0, 1fr); }
		.ctl { grid-column: 1 / -1; justify-content: flex-start; }
		.it.chk { grid-template-columns: 44px minmax(0, 1fr) auto; }
		.it.chk .ctl { grid-column: auto; }
	}
	@media (prefers-reduced-motion: reduce) { .rest, .prog span { transition: none; } }
</style>

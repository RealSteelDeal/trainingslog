<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { readNotify, saveNotify, sortPlan, nextFreeDay, WEEKDAYS, KINDS } from '$lib/notify';
	import { pushSupport, permission, deviceEnabled, enablePush, disablePush, sendTest } from '$lib/push';

	const TOGGLES = [
		['rest', 'Pausen- und Timer-Ende', 'Meldet sich, wenn die Satzpause, das Aufwärmen oder Zone 2 vorbei ist – auch bei gesperrtem Bildschirm.'],
		['reminder', 'Trainingserinnerung', 'Zur Uhrzeit im Trainingsplan, wenn an dem Tag noch keine Einheit erfasst ist.'],
		['upload', 'Upload-Hinweis', 'Wenn eine Einheit 12 Stunden nach dem Start noch nicht am Server ist.'],
		['weekly', 'Wochenrückblick', 'Sonntag um 19:00: Krafttage, Zone 2 und Schulter der Woche.']
	];

	let n = $state(readNotify());
	let support = $state('ok');
	let perm = $state('default');
	let enabled = $state(false);
	let busy = $state(false);
	let msg = $state('');
	let saveState = $state('');
	let timer;

	function refreshStatus() {
		support = pushSupport();
		perm = permission();
		enabled = deviceEnabled();
	}

	async function persist() {
		saveState = 'speichert';
		try {
			await saveNotify($state.snapshot(n));
			saveState = 'gespeichert';
		} catch {
			saveState = 'fehler';
		}
	}
	function changed() {
		clearTimeout(timer);
		saveState = 'speichert';
		timer = setTimeout(persist, 500);
	}

	function addDay() {
		n.plan = sortPlan([...n.plan, { day: nextFreeDay(n.plan), time: '16:00', kind: 'kraft' }]);
		changed();
	}
	function removeDay(i) {
		n.plan = n.plan.filter((_, j) => j !== i);
		changed();
	}
	function resort() {
		n.plan = sortPlan(n.plan);
		changed();
	}

	async function run(fn, ok) {
		busy = true;
		msg = '';
		try {
			const r = await fn();
			msg = ok(r);
		} catch (e) {
			const m = e?.message || '';
			msg = m === 'denied' ? 'Benachrichtigungen wurden abgelehnt.' : m === 'dismissed' ? 'Keine Erlaubnis erteilt.' : `Hat nicht geklappt: ${e?.response?.message || m || 'kein Netz?'}`;
		}
		busy = false;
		refreshStatus();
	}
	const enable = () => run(enablePush, () => 'Aktiviert. Sende dir zum Prüfen eine Test-Meldung.');
	const disable = () => run(disablePush, () => 'Auf diesem Gerät ausgeschaltet.');
	const test = () => run(sendTest, (r) => `Gesendet an ${r.sent} ${r.sent === 1 ? 'Gerät' : 'Geräte'}.`);

	onMount(() => {
		if (!pb.authStore.isValid) { goto('/'); return; }
		refreshStatus();
		const un = pb.authStore.onChange(() => { if (saveState !== 'speichert') n = readNotify(); });
		pb.collection('users').authRefresh().then(() => { if (saveState !== 'speichert') n = readNotify(); }).catch(() => {});
		return () => { un(); clearTimeout(timer); };
	});
</script>

<main>
	<header>
		<a class="back" href="/" aria-label="Zurück zur Startseite">‹</a>
		<h1>Einstellungen</h1>
	</header>

	<section>
		<h2 class="sec">Benachrichtigungen auf diesem Gerät</h2>
		<div class="card device">
			{#if support === 'install'}
				<p><b>Erst installieren.</b> Auf dem iPhone kommen Benachrichtigungen nur bei der installierten App an:</p>
				<ol>
					<li>In Safari unten auf <b>Teilen</b> tippen.</li>
					<li><b>Zum Home-Bildschirm</b> wählen.</li>
					<li>Die App vom Home-Bildschirm öffnen und hier aktivieren.</li>
				</ol>
			{:else if support === 'none'}
				<p>Dieser Browser unterstützt keine Push-Benachrichtigungen.</p>
			{:else if perm === 'denied'}
				<p><b>Blockiert.</b> Erlauben unter iOS-Einstellungen → Mitteilungen → Trainingslog, dann hier erneut aktivieren.</p>
			{:else if enabled}
				<p class="on"><span class="dot" aria-hidden="true"></span>Aktiv auf diesem Gerät</p>
				<div class="row-btns">
					<button class="primary" disabled={busy} onclick={test}>Test senden</button>
					<button disabled={busy} onclick={disable}>Ausschalten</button>
				</div>
			{:else}
				<p>Pausen-Ende, Erinnerungen und Wochenrückblick als Mitteilung aufs Handy.</p>
				<button class="primary wide" disabled={busy} onclick={enable}>Benachrichtigungen aktivieren</button>
			{/if}
			{#if msg}<p class="msg" role="status">{msg}</p>{/if}
		</div>
	</section>

	<section>
		<h2 class="sec">Was soll sich melden?</h2>
		<div class="card list">
			{#each TOGGLES as [key, label, hint] (key)}
				<label class="toggle">
					<span><b>{label}</b><small>{hint}</small></span>
					<input type="checkbox" role="switch" bind:checked={n[key]} onchange={changed} />
				</label>
			{/each}
		</div>
	</section>

	<section>
		<h2 class="sec">Trainingsplan</h2>
		<p class="mute intro">An diesen Tagen erinnert dich die App zur angegebenen Uhrzeit, falls noch keine Einheit erfasst ist.</p>
		<div class="card list">
			{#each n.plan as d, i (i)}
				<div class="plan-row">
					<select aria-label="Wochentag {i + 1}" bind:value={d.day} onchange={resort}>
						{#each [1, 2, 3, 4, 5, 6, 0] as w (w)}<option value={w}>{WEEKDAYS[w]}</option>{/each}
					</select>
					<input type="time" aria-label="Uhrzeit {i + 1}" bind:value={d.time} onchange={resort} required />
					<button class="rm" aria-label="{WEEKDAYS[d.day]} entfernen" onclick={() => removeDay(i)}>✕</button>
					<div class="kind" role="radiogroup" aria-label="Art {i + 1}">
						{#each Object.entries(KINDS) as [k, l] (k)}
							<button role="radio" aria-checked={d.kind === k} aria-pressed={d.kind === k} onclick={() => { d.kind = k; changed(); }}>{l}</button>
						{/each}
					</div>
				</div>
			{:else}
				<p class="mute empty">Keine Trainingstage geplant – keine Erinnerungen.</p>
			{/each}
			<button class="add" onclick={addDay} disabled={n.plan.length >= 7}>+ Trainingstag hinzufügen</button>
		</div>
		<p class="save" class:err={saveState === 'fehler'} aria-live="polite">
			{saveState === 'speichert' ? 'Speichert …' : saveState === 'gespeichert' ? '✓ Gespeichert' : saveState === 'fehler' ? 'Nicht gespeichert – kein Netz? Änderung später wiederholen.' : ''}
		</p>
	</section>
</main>

<style>
	header { display: flex; align-items: center; gap: 12px; }
	.back { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border-radius: 50%; background: var(--soft); color: var(--ink); text-decoration: none; font-size: 26px; line-height: 1; padding-bottom: 3px; }
	section { margin-top: 24px; }
	.sec { font: 600 13px Inter, sans-serif; text-transform: uppercase; letter-spacing: .07em; color: var(--mute); margin: 0 0 8px; }
	.device { display: grid; gap: 10px; }
	.device p, .device ol { margin: 0; }
	.device ol { padding-left: 22px; display: grid; gap: 4px; }
	.on { display: flex; align-items: center; gap: 8px; font-weight: 600; }
	.dot { width: 10px; height: 10px; border-radius: 50%; background: #2f9e8f; }
	.row-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
	.wide { width: 100%; min-height: 52px; font-size: 17px; }
	.msg { font-size: 14px; color: var(--mute); }
	.list { padding: 4px 14px; }
	.toggle { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0; min-height: 56px; cursor: pointer; }
	.toggle + .toggle { border-top: 1px solid var(--line); }
	.toggle b { display: block; font-size: 16px; }
	.toggle small { display: block; font-size: 13px; color: var(--mute); line-height: 1.4; }
	.toggle input {
		appearance: none; -webkit-appearance: none; flex: none; width: 52px; height: 32px; min-height: 32px; padding: 0; border-radius: 16px;
		background: var(--line); border: 0; position: relative; cursor: pointer; transition: background .2s;
	}
	.toggle input::after { content: ''; position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / .3); transition: transform .2s; }
	.toggle input:checked { background: #1f7a6e; }
	.toggle input:checked::after { transform: translateX(20px); }
	.intro { margin: 0 0 8px; }
	.plan-row { display: grid; grid-template-columns: minmax(0, 1fr) 112px 44px; gap: 8px; padding: 12px 0; align-items: center; }
	.kind { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 3px; background: var(--soft); border-radius: 12px; }
	.kind button { border: 0; background: transparent; min-height: 44px; font-size: 15px; }
	.kind button[aria-pressed='true'] { background: var(--card); color: var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / .15); }
	.plan-row + .plan-row { border-top: 1px solid var(--line); }
	.plan-row select, .plan-row input { width: 100%; padding: 0 6px; }
	.rm { width: 44px; padding: 0; background: transparent; color: var(--mute); }
	.empty { margin: 12px 0; }
	.add { width: 100%; margin: 8px 0 10px; background: transparent; border-style: dashed; }
	.save { min-height: 22px; margin: 8px 2px 0; font-size: 14px; color: var(--mute); }
	.save.err { color: light-dark(#b42318, #ff8a7a); }
	@media (prefers-reduced-motion: reduce) { .toggle input, .toggle input::after { transition: none; } }
</style>

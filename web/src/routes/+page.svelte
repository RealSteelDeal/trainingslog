<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { loadCatalog, cachedCatalog, loadLastValues, resolveTemplate } from '$lib/data';
	import { readOutbox, onOutbox, flush } from '$lib/outbox';
	import { live, startSession } from '$lib/live.svelte.js';
	import { scheduleUploadCheck } from '$lib/push';
	import { cachedPhaseLog, onPhaseLog, phaseAt, setPhase, syncPhaseLog } from '$lib/phase';

	let user = $state(pb.authStore.isValid ? pb.authStore.record : null);
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let catalog = $state(cachedCatalog());
	let recent = $state([]);
	let outbox = $state(readOutbox());
	let online = $state(true);
	let phaseLog = $state(cachedPhaseLog());
	const phaseKey = $derived(phaseAt(phaseLog, new Date()));

	pb.authStore.onChange(() => (user = pb.authStore.isValid ? pb.authStore.record : null));

	async function load() {
		if (!pb.authStore.isValid) return;
		catalog = await loadCatalog();
		loadLastValues();
		try {
			recent = (await pb.collection('sessions').getList(1, 10, { sort: '-started' })).items;
		} catch { /* offline */ }
		flush();
		syncPhaseLog();
	}

	async function login(e) {
		e.preventDefault();
		error = '';
		try {
			await pb.collection('users').authWithPassword(email, password);
			password = '';
			await load();
		} catch {
			error = 'Anmeldung fehlgeschlagen. E-Mail und Passwort prüfen.';
		}
	}

	function start(t) {
		startSession(t.key, t.phases?.length ? phaseKey : '');
		scheduleUploadCheck(live.s.startedAt);
		goto('/einheit');
	}

	function pickPhase(k) {
		phaseLog = setPhase(k);
	}

	const kraftTpl = $derived(catalog.templates.find((t) => t.phases?.length));
	const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' });

	onMount(() => {
		online = navigator.onLine;
		const on = () => { online = true; load(); };
		const off = () => (online = false);
		addEventListener('online', on);
		addEventListener('offline', off);
		const un = onOutbox((items) => { outbox = items; if (!items.length) load(); });
		const unPhase = onPhaseLog((log) => (phaseLog = log));
		load();
		return () => { removeEventListener('online', on); removeEventListener('offline', off); un(); unPhase(); };
	});
</script>

<main>
	{#if !user}
		<div class="login-wrap">
			<h1>Trainingslog</h1>
			<p class="mute">Melde dich an, um Einheiten zu erfassen.</p>
			<form class="card login" onsubmit={login}>
				<label>E-Mail <input type="email" bind:value={email} autocomplete="username" required /></label>
				<label>Passwort <input type="password" bind:value={password} autocomplete="current-password" required /></label>
				<button class="primary">Anmelden</button>
				{#if error}<p role="alert" class="err">{error}</p>{/if}
			</form>
		</div>
	{:else}
		<header class="top">
			<h1>Trainingslog</h1>
			<p class="sync" class:off={!online} class:wait={outbox.length}>
				<i aria-hidden="true"></i>
				{online ? 'Online' : 'Offline – Einheiten werden später hochgeladen'}
				{#if outbox.length} · {outbox.length} {outbox.length === 1 ? 'Einheit wartet' : 'Einheiten warten'} auf Upload{/if}
				{#if outbox[0]?.error} · Fehler: {outbox[0].error}{/if}
			</p>
		</header>

		{#if live.s}
			<a class="btn primary resume" href="/einheit"><span>{live.s.ended ? 'Einheit abschließen' : 'Laufende Einheit fortsetzen'}</span><span aria-hidden="true">›</span></a>
		{/if}

		{#if kraftTpl}
			<section>
				<h2 class="sec">Trainingsphase</h2>
				<div class="seg" role="radiogroup" aria-label="Trainingsphase">
					{#each kraftTpl.phases as p (p.key)}
						<button role="radio" aria-checked={phaseKey === p.key} aria-pressed={phaseKey === p.key} onclick={() => pickPhase(p.key)}>
							<b>{p.label}</b><small>{p.sets} Sätze · {p.cardio_min} min Zone 2</small>
						</button>
					{/each}
				</div>
			</section>
		{/if}

		<section>
			<h2 class="sec">Einheit starten</h2>
			{#if !catalog.templates.length}
				<p class="mute">Vorlagen werden geladen …</p>
			{/if}
			{#each catalog.templates as t (t.id)}
				{@const r = resolveTemplate(t, phaseKey, catalog.exercises)}
				<div class="card tpl">
					<div class="tpl-head">
						<h3>{t.name}</h3>
						<span class="dur">{r.totalMin} min</span>
					</div>
					<ol class="flow">{#each r.blocks as b (b.id)}<li>{b.name}</li>{/each}</ol>
					<button class="primary" disabled={!!live.s} onclick={() => start(t)}>{live.s ? 'Andere Einheit läuft' : 'Starten'}</button>
				</div>
			{/each}
		</section>

		<a class="card statlink" href="/auswertung">
			<span><b>Auswertungen</b><small>Woche, Verlauf, Schulter, Export</small></span>
			<span aria-hidden="true">›</span>
		</a>

		<a class="card statlink" href="/einstellungen">
			<span><b>Einstellungen</b><small>Benachrichtigungen und Trainingsplan</small></span>
			<span aria-hidden="true">›</span>
		</a>

		<section>
			<h2 class="sec">Letzte Einheiten</h2>
			{#if recent.length}
				<ul class="recent">
					{#each recent as s (s.id)}
						<li>
							<b>{fmtDate(s.started)}</b>
							<span>{s.kind === 'kraft' ? 'Kraft' : 'Ausdauer'} · {s.duration_min} min{s.volume_kg ? ` · ${Math.round(s.volume_kg).toLocaleString('de-AT')} kg` : ''}</span>
							<span class="sh">Schulter {s.shoulder}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mute">Noch keine Einheit hochgeladen.</p>
			{/if}
		</section>

		<button class="logout" onclick={() => pb.authStore.clear()}>Abmelden</button>
	{/if}
</main>

<style>
	.login-wrap { min-height: 70dvh; display: grid; align-content: center; gap: 8px; max-width: 420px; margin: 0 auto; }
	.login { display: grid; gap: 14px; margin-top: 12px; }
	.login input { width: 100%; }
	.login button { min-height: 52px; font-size: 17px; }
	.err { color: light-dark(#b42318, #ff8a7a); margin: 0; font-size: 14px; }
	label { display: grid; gap: 4px; font-size: 15px; }
	.top h1 { font-size: 40px; }
	.sync { margin: 6px 0 0; font-size: 14px; color: var(--mute); display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
	.sync i { width: 8px; height: 8px; border-radius: 50%; background: #2f9e8f; margin-right: 4px; }
	.sync.off i { background: var(--mute); }
	.sync.wait i { background: #f4a259; }
	section { margin-top: 26px; }
	.sec { font: 600 13px Inter, sans-serif; text-transform: uppercase; letter-spacing: .07em; color: var(--mute); margin: 0 0 8px; }
	.resume { width: 100%; margin-top: 18px; min-height: 56px; font-size: 17px; justify-content: space-between; padding: 0 18px; }
	.resume span:last-child { font-size: 26px; }
	.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--soft); border-radius: 14px; }
	.seg button { border: 0; background: transparent; min-height: 56px; flex-direction: column; gap: 0; line-height: 1.25; padding: 6px; }
	.seg button small { font: 500 12px Inter, sans-serif; color: var(--mute); }
	.seg button[aria-pressed='true'] { background: var(--card); color: var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / .15); }
	.tpl { display: grid; gap: 10px; margin-top: 10px; }
	.tpl-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
	.tpl h3 { margin: 0; font: 700 24px/1.1 var(--disp); }
	.dur { font-weight: 600; color: var(--mute); white-space: nowrap; }
	.flow { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 6px; font-size: 14px; color: var(--mute); }
	.flow li + li::before { content: '→ '; }
	.tpl button { min-height: 52px; font-size: 17px; }
	.tpl button:disabled { background: var(--soft); color: var(--mute); opacity: 1; }
	.statlink + .statlink { margin-top: 10px; }
	.statlink { display: flex; justify-content: space-between; align-items: center; margin-top: 26px; text-decoration: none; color: var(--ink); min-height: 64px; }
	.statlink b { display: block; font-size: 17px; }
	.statlink small { color: var(--mute); font-size: 14px; }
	.statlink > span:last-child { font-size: 26px; color: var(--mute); }
	.recent { list-style: none; padding: 0; margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 14px; }
	.recent li { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; padding: 12px 14px; font-size: 15px; }
	.recent li + li { border-top: 1px solid var(--line); }
	.recent li span:nth-child(2) { color: var(--ink); }
	.recent .sh { grid-column: 2; color: var(--mute); font-size: 14px; }
	.logout { margin-top: 28px; background: transparent; color: var(--mute); width: 100%; }
</style>

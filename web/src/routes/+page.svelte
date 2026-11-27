<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { loadCatalog, cachedCatalog, loadLastValues, resolveTemplate } from '$lib/data';
	import { readOutbox, onOutbox, flush } from '$lib/outbox';
	import { live, startSession } from '$lib/live.svelte.js';

	let user = $state(pb.authStore.isValid ? pb.authStore.record : null);
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let catalog = $state(cachedCatalog());
	let recent = $state([]);
	let outbox = $state(readOutbox());
	let online = $state(true);
	let phaseKey = $state(localStorage.getItem('tl-phase') || 'a');

	pb.authStore.onChange(() => (user = pb.authStore.isValid ? pb.authStore.record : null));

	async function load() {
		if (!pb.authStore.isValid) return;
		catalog = await loadCatalog();
		loadLastValues();
		try {
			recent = (await pb.collection('sessions').getList(1, 10, { sort: '-started' })).items;
		} catch { /* offline */ }
		flush();
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
		localStorage.setItem('tl-phase', phaseKey);
		startSession(t.key, t.phases?.length ? phaseKey : '');
		goto('/einheit');
	}

	const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' });

	onMount(() => {
		online = navigator.onLine;
		const on = () => { online = true; load(); };
		const off = () => (online = false);
		addEventListener('online', on);
		addEventListener('offline', off);
		const un = onOutbox((items) => { outbox = items; if (!items.length) load(); });
		load();
		return () => { removeEventListener('online', on); removeEventListener('offline', off); un(); };
	});
</script>

<main>
	<h1>Trainingslog</h1>

	{#if !user}
		<form class="card login" onsubmit={login}>
			<label>E-Mail <input type="email" bind:value={email} autocomplete="username" required /></label>
			<label>Passwort <input type="password" bind:value={password} autocomplete="current-password" required /></label>
			<button class="primary">Anmelden</button>
			{#if error}<p role="alert" class="mute">{error}</p>{/if}
		</form>
	{:else}
		<p class="mute">
			{online ? 'Online' : 'Offline – Einheiten werden später hochgeladen'}
			{#if outbox.length} · {outbox.length} {outbox.length === 1 ? 'Einheit wartet' : 'Einheiten warten'} auf Upload{/if}
			{#if outbox[0]?.error} · Fehler: {outbox[0].error}{/if}
		</p>

		{#if live.s}
			<a class="btn primary resume" href="/einheit">Laufende Einheit fortsetzen</a>
		{/if}

		<section>
			<h2>Einheit starten</h2>
			{#if !catalog.templates.length}
				<p class="mute">Vorlagen werden geladen …</p>
			{/if}
			{#each catalog.templates as t (t.id)}
				{@const r = resolveTemplate(t, phaseKey, catalog.exercises)}
				<div class="card tpl">
					<div>
						<h3>{t.name}</h3>
						<p class="mute">{r.totalMin} Minuten · {r.blocks.map((b) => b.name).join(' → ')}</p>
						{#if t.phases?.length}
							<div class="seg">
								{#each t.phases as p (p.key)}
									<button aria-pressed={phaseKey === p.key} onclick={() => (phaseKey = p.key)}>{p.label} · {p.sets} Sätze</button>
								{/each}
							</div>
						{/if}
					</div>
					<button class="primary" disabled={!!live.s} onclick={() => start(t)}>Starten</button>
				</div>
			{/each}
		</section>

		<a class="btn stats" href="/auswertung">Auswertungen</a>

		<section>
			<h2>Letzte Einheiten</h2>
			{#if recent.length}
				<ul class="recent">
					{#each recent as s (s.id)}
						<li><span>{fmtDate(s.started)}</span><span>{s.kind === 'kraft' ? 'Kraft' : 'Ausdauer'}</span><span>{s.duration_min} min</span><span>{s.volume_kg ? Math.round(s.volume_kg).toLocaleString('de-AT') + ' kg' : ''}</span><span>Schulter {s.shoulder}</span></li>
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
	.login { display: grid; gap: 12px; margin-top: 20px; max-width: 420px; }
	label { display: grid; gap: 4px; font-size: 15px; }
	section { margin-top: 28px; }
	.resume { width: 100%; margin-top: 16px; font-size: 17px; }
	.tpl { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; margin-top: 10px; }
	.tpl h3 { margin: 0; font-size: 18px; }
	.tpl p { margin: 2px 0 8px; }
	.seg { display: flex; flex-wrap: wrap; gap: 6px; }
	.recent { list-style: none; padding: 0; margin: 10px 0 0; }
	.recent li { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 15px; }
	.recent li span:first-child { font-weight: 600; min-width: 6.5em; }
	.logout { margin-top: 28px; }
	.stats { width: 100%; margin-top: 16px; }
	@media (max-width: 560px) { .tpl { grid-template-columns: minmax(0, 1fr); } }
</style>

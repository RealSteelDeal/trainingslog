<script>
	import { onMount } from 'svelte';
	import { flush } from '$lib/outbox';
	import { pb } from '$lib/pb';

	let { children } = $props();

	onMount(async () => {
		if (pb.authStore.isValid && navigator.onLine) {
			try { await pb.collection('users').authRefresh(); } catch (e) { if (e?.status === 401) pb.authStore.clear(); }
		}
		flush();
	});
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		color-scheme: light dark;
		--bg: light-dark(#f3f1ec, #16181b);
		--card: light-dark(#fff, #212429);
		--ink: light-dark(#1b1d20, #eceae5);
		--mute: light-dark(#5b5f66, #a4a8ae);
		--line: light-dark(#dcd8cf, #343840);
		--soft: light-dark(#ebe8e1, #2a2e34);
		--acc: #ff5a1f;
		--sup: light-dark(#1d4ed8, #86a5ff);
		--disp: 'Barlow Condensed', Inter, sans-serif;
		--c-line: light-dark(#1d4ed8, #6f8ff0);
		--c-z2: light-dark(#1d4ed8, #6f8ff0);
		--c-warm: light-dark(#e08a3c, #d9853a);
	}
	:global(*) { box-sizing: border-box; min-width: 0; }
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--ink);
		font: 16px/1.55 Inter, system-ui, sans-serif;
		overflow-x: clip;
		padding: env(safe-area-inset-top) 0 calc(96px + env(safe-area-inset-bottom));
	}
	:global(main) { max-width: 760px; margin: 0 auto; padding: 16px max(4vw, 16px); }
	:global(h1), :global(h2) { font-family: var(--disp); font-weight: 700; line-height: 1.05; margin: 0; text-wrap: balance; }
	:global(h1) { font-size: clamp(32px, 7vw, 46px); }
	:global(html) { -webkit-text-size-adjust: 100%; -webkit-tap-highlight-color: transparent; }
	:global(button) { touch-action: manipulation; }
	:global(h2) { font-size: 28px; }
	:global(.mute) { color: var(--mute); font-size: 14px; }
	:global(button), :global(.btn) {
		font: 600 15px Inter, sans-serif; min-height: 44px; border-radius: 10px; border: 1px solid var(--line);
		background: var(--card); color: var(--ink); padding: 0 14px; cursor: pointer; text-decoration: none;
		display: inline-flex; align-items: center; justify-content: center;
	}
	:global(button:disabled) { opacity: .5; }
	:global(.primary) { background: var(--acc); color: #fff; border: 0; }
	:global(input), :global(select), :global(textarea) {
		font: 16px Inter, sans-serif; min-height: 44px; border: 1px solid var(--line); border-radius: 10px;
		background: var(--bg); color: var(--ink); padding: 0 10px;
	}
	:global(textarea) { padding: 8px 10px; width: 100%; }
	:global(:focus-visible) { outline: 3px solid var(--sup); outline-offset: 2px; }
	:global(.card) { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
	:global([aria-pressed='true']) { background: var(--ink); color: var(--bg); border-color: var(--ink); }
</style>

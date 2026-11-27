<script>
	/** ex: Übung aus dem Katalog ({ name, hint, help }) oder null (geschlossen) */
	let { ex = null, onclose } = $props();
	let dlg;

	$effect(() => {
		if (!dlg) return;
		if (ex && !dlg.open) dlg.showModal();
		else if (!ex && dlg.open) dlg.close();
	});
</script>

<dialog
	bind:this={dlg}
	class="sheet"
	aria-labelledby="help-title"
	onclose={() => onclose?.()}
	onclick={(e) => e.target === dlg && dlg.close()}
>
	{#if ex}
		<div class="inner">
			<div class="grip" aria-hidden="true"></div>
			<header>
				<h2 id="help-title">{ex.name}</h2>
				<button class="close" aria-label="Hilfe schließen" onclick={() => dlg.close()}>✕</button>
			</header>
			{#if ex.help}
				<div class="body">
					<section>
						<h3>Gerät</h3>
						<p>{ex.help.geraet}</p>
					</section>
					<section>
						<h3>So geht's</h3>
						<ol>{#each ex.help.ausfuehrung as step, i (i)}<li>{step}</li>{/each}</ol>
					</section>
					{#if ex.help.schulter}
						<section class="shoulder">
							<h3>Schulter</h3>
							<p>{ex.help.schulter}</p>
						</section>
					{/if}
					{#if ex.help.fehler?.length}
						<section>
							<h3>Typische Fehler</h3>
							<ul>{#each ex.help.fehler as f, i (i)}<li>{f}</li>{/each}</ul>
						</section>
					{/if}
					{#if ex.help.alternativen?.length}
						<section>
							<h3>Gerät besetzt? Alternativen</h3>
							<ul>{#each ex.help.alternativen as a, i (i)}<li>{a}</li>{/each}</ul>
						</section>
					{/if}
					<p class="note">Allgemeine Hinweise, nicht fachlich geprüft. Im Zweifel mit Physio oder Trainer abstimmen.</p>
				</div>
			{:else}
				<div class="body">
					{#if ex.hint}<p>{ex.hint}</p>{/if}
					<p class="note">Zu dieser Übung gibt es noch keine ausführliche Hilfe. Online neu laden, dann wird sie nachgeladen.</p>
				</div>
			{/if}
		</div>
	{/if}
</dialog>

<style>
	.sheet {
		margin: auto 0 0; width: 100%; max-width: 100%; max-height: min(88dvh, 760px);
		padding: 0; border: 0; border-radius: 22px 22px 0 0; background: var(--card); color: var(--ink);
		box-shadow: 0 -8px 30px rgb(0 0 0 / .3); overflow-y: auto; overscroll-behavior: contain;
	}
	.sheet[open] { animation: up .22s ease-out; }
	.sheet::backdrop { background: rgb(0 0 0 / .45); }
	@keyframes up { from { transform: translateY(40px); opacity: .4; } }
	@media (min-width: 700px) { .sheet { margin: auto; max-width: 560px; border-radius: 22px; } }
	.inner { padding: 8px 20px calc(20px + env(safe-area-inset-bottom)); }
	.grip { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 0 auto 8px; }
	header { display: flex; align-items: flex-start; gap: 12px; position: sticky; top: 0; background: var(--card); padding: 4px 0 8px; }
	header h2 { flex: 1; font-size: 26px; padding-top: 6px; }
	.close { width: 44px; flex: none; padding: 0; border-radius: 50%; background: var(--soft); border: 0; font-size: 18px; }
	section { margin-top: 16px; }
	h3 { font: 600 13px Inter, sans-serif; text-transform: uppercase; letter-spacing: .06em; color: var(--mute); margin: 0 0 6px; }
	p { margin: 0; }
	ol, ul { margin: 0; padding-left: 22px; display: grid; gap: 6px; }
	.shoulder { background: var(--soft); border-left: 4px solid var(--acc); border-radius: 10px; padding: 10px 12px; }
	.shoulder h3 { color: var(--ink); }
	.note { margin-top: 18px; font-size: 13px; color: var(--mute); }
	@media (prefers-reduced-motion: reduce) { .sheet[open] { animation: none; } }
</style>

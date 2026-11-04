<script lang="ts">
  import type { Workspace } from '../lib/workspace.svelte';
  import Terminal from './Terminal.svelte';
  import CapturePanel from './CapturePanel.svelte';
  import RulesPanel from './RulesPanel.svelte';
  import DisplayOptions from './settings/DisplayOptions.svelte';
  import AppSettings from './settings/AppSettings.svelte';

  let { workspace }: { workspace: Workspace } = $props();
  const monitor = $derived(workspace.monitor);
  let terminal: Terminal | undefined = $state();
  /** The Monitor's own settings drawer: its view, its capture, and the app-wide settings. */
  let drawer = $state<'terminal' | 'capture' | 'app' | null>(null);
  const SECTIONS = [['terminal', 'Terminal'], ['capture', 'Capture'], ['app', 'App']] as const;

  export function handleKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      monitor.clear();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      terminal?.openFind();
    } else if (e.key === 'Escape') drawer = null;
  }
</script>

<header>
  {#each workspace.sessions as s (s.id)}
    {@const tag = monitor.sources[s.id]}
    <span class="legend" title={s.open ? 'Connected' : 'Not connected'}>
      <b style:color={tag?.color}>{s.letter}›</b> {s.portLabel()}{#if !s.open}<span class="off"> (closed)</span>{/if}
    </span>
  {/each}
  <span class="spacer"></span>
  {#if monitor.errors}<span class="err" title={monitor.lastError}>⚠ {monitor.lastError}</span>{/if}
  <button class="toggle" class:on={drawer === 'capture'} class:rec={monitor.capture.info?.state === 'running'} onclick={() => (drawer = 'capture')} title="Capture the merged timeline">Capture</button>
  <button class="toggle gear" class:on={!!drawer} onclick={() => (drawer = drawer ? null : 'terminal')} title="Monitor settings" aria-label="Monitor settings">⚙</button>
</header>
<main>
  <div class="slot"><Terminal bind:this={terminal} source={monitor} onsettings={() => (drawer = 'terminal')} /></div>
  {#if drawer}
    <aside>
      <div class="head"><strong>Monitor settings</strong><button class="close" onclick={() => (drawer = null)} title="Close (Esc)">✕</button></div>
      <div class="tabs" role="tablist" aria-label="Monitor settings">
        {#each SECTIONS as [id, label]}<button role="tab" aria-selected={drawer === id} class:on={drawer === id} onclick={() => (drawer = id)}>{label}</button>{/each}
      </div>
      {#if drawer === 'terminal'}
        <div class="list"><DisplayOptions source={monitor} /></div>
        <h4>Colour rules <span>all tabs</span></h4>
        <RulesPanel />
      {:else if drawer === 'capture'}
        <CapturePanel ctl={monitor.capture} fixed />
      {:else}
        <AppSettings />
      {/if}
    </aside>
  {/if}
</main>

<style>
  .legend { font: 12px var(--mono); white-space: nowrap; }
  .off { color: var(--muted); }
  .err { color: var(--err); font-size: 12px; max-width: 30ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rec::before { content: '● '; color: var(--err); }
  main { flex: 1; min-height: 0; display: flex; position: relative; }
  .slot { display: flex; flex: 1; min-width: 0; min-height: 0; }
  aside {
    position: absolute; top: 0; right: 0; bottom: 0; width: min(420px, 100%); z-index: 5; overflow: auto;
    padding: 10px 12px; background: var(--panel); border-left: 1px solid var(--line); box-shadow: -8px 0 24px rgb(0 0 0 / .12);
  }
  aside .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .close { border: 0; background: none; color: var(--muted); }
  @media (max-width: 700px) { aside { width: 100%; border-left: 0; } }
  .gear { width: 30px; padding: 0; font-size: 15px; }
  .tabs { display: flex; border-bottom: 1px solid var(--line); margin: 0 -12px 10px; padding: 0 8px; }
  .tabs button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none; height: 28px; padding: 0 6px; font-size: 12px; color: var(--muted); }
  .tabs button.on { color: var(--fg); border-bottom-color: var(--accent); }
  .list { display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
  h4 { margin: 16px 0 8px; font-size: 12px; font-weight: 600; }
  h4 span { font-weight: 400; color: var(--muted); margin-left: 6px; }
</style>

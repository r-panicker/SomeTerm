<script lang="ts">
  import type { Workspace } from '../lib/workspace.svelte';
  import Terminal from './Terminal.svelte';
  import CapturePanel from './CapturePanel.svelte';

  let { workspace }: { workspace: Workspace } = $props();
  const monitor = $derived(workspace.monitor);
  let terminal: Terminal | undefined = $state();
  let drawer = $state(false);

  export function handleKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      monitor.clear();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      terminal?.openFind();
    } else if (e.key === 'Escape') drawer = false;
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
  <button class="toggle" class:on={drawer} class:rec={monitor.capture.info?.state === 'running'} onclick={() => (drawer = !drawer)} title="Capture the merged timeline">Capture</button>
</header>
<main>
  <div class="slot"><Terminal bind:this={terminal} source={monitor} /></div>
  {#if drawer}
    <aside>
      <div class="head"><strong>Capture merged timeline</strong><button class="close" onclick={() => (drawer = false)} title="Close (Esc)">✕</button></div>
      <CapturePanel ctl={monitor.capture} fixed />
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
    position: absolute; top: 0; right: 0; bottom: 0; width: min(340px, 100%); z-index: 5; overflow: auto;
    padding: 10px 12px; background: var(--panel); border-left: 1px solid var(--line); box-shadow: -8px 0 24px rgb(0 0 0 / .12);
  }
  aside .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .close { border: 0; background: none; color: var(--muted); }
</style>

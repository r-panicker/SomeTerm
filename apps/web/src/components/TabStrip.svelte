<script lang="ts">
  import type { Workspace } from '../lib/workspace.svelte';
  import { PORT_COLORS } from '../lib/monitor.svelte';

  let { workspace }: { workspace: Workspace } = $props();
  const color = (letter: string) => PORT_COLORS[(letter.charCodeAt(0) - 65) % PORT_COLORS.length];
</script>

<div class="strip" role="tablist" aria-label="Ports">
  {#each workspace.sessions as s (s.id)}
    <div class="tab" class:on={workspace.active === s.letter} role="tab" aria-selected={workspace.active === s.letter}>
      <button class="pick" onclick={() => (workspace.active = s.letter)} title={s.open ? 'Connected' : 'Not connected'}>
        <span class="dot" class:open={s.open}></span>
        <b style:color={color(s.letter)}>{s.letter}</b>
        <span class="name">{s.portLabel()}</span>
        {#if s.capture.info?.state === 'running'}<span class="rec" title="Capturing">●</span>{/if}
        {#if s.forwardTo}<span class="fwd" title="Forwarding received data to {s.forwardTo.letter}">→{s.forwardTo.letter}</span>{/if}
      </button>
      <button class="close" onclick={() => workspace.close(s)} title={s.open ? 'Disconnect and close' : 'Close'}>×</button>
    </div>
  {/each}
  <div class="tab" class:on={workspace.active === 'monitor'} role="tab" aria-selected={workspace.active === 'monitor'}>
    <button class="pick" onclick={() => (workspace.active = 'monitor')} title="All ports on one timeline">Monitor</button>
  </div>
  <button class="add" onclick={() => workspace.add()} title="Open another port in a new tab">+</button>
</div>

<style>
  .strip { display: flex; gap: 2px; padding: 4px 6px 0; background: var(--bg); border-bottom: 1px solid var(--line); overflow-x: auto; overflow-y: hidden; }
  .tab { display: flex; align-items: center; border: 1px solid transparent; border-bottom: 0; border-radius: 6px 6px 0 0; max-width: 260px; }
  .tab.on { background: var(--panel); border-color: var(--line); margin-bottom: -1px; }
  .tab button { border: 0; background: none; height: 26px; }
  .pick { display: flex; align-items: center; gap: 5px; min-width: 0; padding: 0 4px 0 8px; font-size: 12px; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .tab.on .name { color: var(--fg); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--line); flex: none; }
  .dot.open { background: var(--ok); }
  .rec { color: var(--err); font-size: 10px; }
  .fwd { color: var(--muted); font: 11px var(--mono); }
  .close { color: var(--muted); padding: 0 6px; font-size: 14px; }
  .close:hover { color: var(--fg); }
  .add { border: 0; background: none; height: 26px; color: var(--muted); font-size: 15px; padding: 0 8px; }
  .add:hover { color: var(--fg); }
</style>

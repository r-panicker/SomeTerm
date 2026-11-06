<script lang="ts">
  import type { Workspace } from '../lib/workspace.svelte';
  import { MONITOR_TABS, monitorPanel, type MonitorTab } from '../lib/panel.svelte';
  import Terminal from './Terminal.svelte';
  import CapturePanel from './CapturePanel.svelte';
  import TabbedPanel from './TabbedPanel.svelte';
  import DisplayTab from './tabs/DisplayTab.svelte';
  import AutomationTab from './tabs/AutomationTab.svelte';
  import AppTab from './tabs/AppTab.svelte';

  let { workspace }: { workspace: Workspace } = $props();
  const monitor = $derived(workspace.monitor);
  let terminal: Terminal | undefined = $state();
  const TABS: [MonitorTab, string][] = [['display', 'Display'], ['capture', 'Capture'], ['automation', 'Colour rules'], ['app', 'App']];

  export function handleKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && /^Digit[1-4]$/.test(e.code)) {
      e.preventDefault();
      monitorPanel.click(MONITOR_TABS[Number(e.code.slice(5)) - 1]!);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      monitor.clear();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      terminal?.openFind();
    } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      monitorPanel.click(monitorPanel.tab);
    }
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
  {#if monitor.capture.info?.state === 'running'}<button class="rec" onclick={() => monitorPanel.show('capture')} title="Capturing the merged timeline">● REC</button>{/if}
</header>
<main>
  <div class="slot"><Terminal bind:this={terminal} source={monitor} onshow={() => monitorPanel.show('automation')} /></div>
</main>
<TabbedPanel tabs={TABS} state={monitorPanel}>
  {#snippet children(tab: MonitorTab)}
    {#if tab === 'display'}<DisplayTab source={monitor} />
    {:else if tab === 'capture'}<CapturePanel ctl={monitor.capture} fixed />
    {:else if tab === 'automation'}<AutomationTab />
    {:else}<AppTab />{/if}
  {/snippet}
</TabbedPanel>

<style>
  .legend { font: 12px var(--mono); white-space: nowrap; }
  .off { color: var(--muted); }
  .err { color: var(--err); font-size: 12px; max-width: 30ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rec { color: var(--err); border-color: var(--err); }
  main { flex: 1; min-height: 0; display: flex; position: relative; }
  .slot { display: flex; flex: 1; min-width: 0; min-height: 0; }
</style>

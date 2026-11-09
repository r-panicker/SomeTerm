<script lang="ts">
  import { fullscreen } from './lib/fullscreen.svelte';
  import { onMount } from 'svelte';
  import { native } from './lib/session.svelte';
  import { Workspace } from './lib/workspace.svelte';
  import { portPanel, monitorPanel } from './lib/panel.svelte';
  import PortWorkspace from './components/PortWorkspace.svelte';
  import MonitorWorkspace from './components/MonitorWorkspace.svelte';
  import TabStrip from './components/TabStrip.svelte';

  const workspace = new Workspace();
  if (import.meta.env.DEV) {
    Object.assign(window, { workspace, panel: portPanel, monitorPanel });
    Object.defineProperty(window, 'session', { get: () => workspace.current, configurable: true });
  }
  let ready = $state(false);
  let narrow = $state(false);
  const views: Record<string, { handleKey(e: KeyboardEvent): void; focusInput?(e?: KeyboardEvent): void } | undefined> = $state({});

  /** A key that would do nothing: focus is on the page itself or on a button (Space and Enter press buttons). */
  function lost(e: KeyboardEvent): boolean {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return false;
    const t = e.target;
    if (t === document.body || t === document.documentElement) return [...e.key].length === 1 || e.key === 'Enter' || e.key === 'Backspace';
    return t instanceof HTMLButtonElement && [...e.key].length === 1 && e.key !== ' ';
  }

  onMount(() => {
    void workspace.restore().then(() => (ready = true));
    const serial = 'serial' in navigator ? navigator.serial : null;
    const refresh = () => workspace.current?.refreshPorts();
    serial?.addEventListener('connect', refresh);
    serial?.addEventListener('disconnect', refresh);
    // Node has no hot-plug event, so poll the port list while idle in the desktop app.
    const poll = native ? setInterval(() => { if (workspace.current && !workspace.current.open) refresh(); }, 2000) : undefined;
    const mq = matchMedia('(max-width: 700px)');
    const onMq = () => (narrow = mq.matches);
    onMq();
    mq.addEventListener('change', onMq);
    return () => {
      serial?.removeEventListener('connect', refresh);
      serial?.removeEventListener('disconnect', refresh);
      mq.removeEventListener('change', onMq);
      clearInterval(poll);
    };
  });

  // Saved whenever any restorable setting changes.
  $effect(() => {
    if (!ready) return;
    void workspace.snapshot();
    workspace.save();
  });

  $effect(() => {
    void workspace.active;
    workspace.current?.refreshPorts();
  });

  function key(e: KeyboardEvent) {
    if (e.altKey && e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      e.preventDefault();
      fullscreen.toggle();
      return;
    }
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      workspace.cycle(e.shiftKey ? -1 : 1);
      return;
    }
    if (lost(e)) { views[workspace.active]?.focusInput?.(e); return; }
    views[workspace.active]?.handleKey(e);
  }
</script>

<svelte:window onkeydown={key} />

{#if ready}
  <TabStrip {workspace} />
  {#each workspace.sessions as s (s.id)}
    <!-- Inactive tabs stay mounted so their scroll, find and view state survive switching. -->
    <div class="ws" hidden={workspace.active !== s.letter}>
      <PortWorkspace bind:this={views[s.letter]} session={s} {workspace} {narrow} active={workspace.active === s.letter} />
    </div>
  {/each}
  {#if workspace.sessions.length > 1}
    <div class="ws" hidden={workspace.active !== 'monitor'}>
      <MonitorWorkspace bind:this={views.monitor} {workspace} />
    </div>
  {/if}
{/if}

<style>
  .ws { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .ws[hidden] { display: none; }
</style>

<script lang="ts">
  import type { Session } from '../lib/session.svelte';
  import type { Workspace } from '../lib/workspace.svelte';
  import TopBar from './TopBar.svelte';
  import Terminal from './Terminal.svelte';
  import Plot from './Plot.svelte';
  import SendBar from './SendBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import CapturePanel from './CapturePanel.svelte';
  import ProfilesPanel from './ProfilesPanel.svelte';
  import RulesPanel from './RulesPanel.svelte';
  import AutoReplyPanel from './AutoReplyPanel.svelte';
  import SettingsPanel, { showSettingsTab } from './SettingsPanel.svelte';
  import QuickSendStrip from './QuickSendStrip.svelte';

  let { session, workspace, narrow }: { session: Session; workspace: Workspace; narrow: boolean } = $props();
  let terminal: Terminal | undefined = $state();
  let sendBar: SendBar;
  let main: HTMLElement;
  let split = $state(0.5);
  let drawer = $state<'capture' | 'profiles' | 'rules' | 'replies' | 'settings' | null>(null);
  const DRAWER_TITLES = { capture: 'Capture', profiles: 'Profiles', rules: 'Colour rules', replies: 'Auto-replies', settings: 'Settings' };

  /** Shortcuts that act on this tab; the app routes keys to the active tab. */
  export function handleKey(e: KeyboardEvent) {
    // In the Screen view keys belong to the device (Esc for vi, Ctrl+L to redraw); Ctrl+Shift keeps app shortcuts.
    if (e.target instanceof Element && e.target.closest('.xterm') && !(e.ctrlKey && e.shiftKey)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      session.clear();
    } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      drawer = drawer === 'settings' ? null : 'settings';
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (session.view === 'plot') session.chooseView('split');
      queueMicrotask(() => terminal?.openFind());
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
      // e.code, not e.key: Alt+digit types a symbol on some layouts (macOS).
      const q = session.quickSends[Number(e.code.slice(5)) - 1];
      if (q) { e.preventDefault(); void session.sendQuick(q); }
    } else if (e.key === 'Escape' && !(e.target instanceof HTMLSelectElement)) {
      if (drawer) drawer = null;
      else sendBar.focus();
    }
  }

  function drag(e: PointerEvent) {
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const r = main.getBoundingClientRect();
    const moveTo = (ev: PointerEvent) => {
      const f = narrow ? (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width;
      split = Math.min(0.85, Math.max(0.15, f));
    };
    handle.onpointermove = moveTo;
    handle.onpointerup = () => { handle.onpointermove = null; handle.onpointerup = null; };
  }

  const showTerm = $derived(session.view !== 'plot');
  const showPlot = $derived(session.view !== 'terminal');
</script>


<TopBar {session} {workspace} bind:drawer />
<main bind:this={main} class:narrow>
  {#if showTerm}
    <div class="slot" style:flex={showPlot ? `${split} 1 0` : '1 1 0'}><Terminal bind:this={terminal} source={session} onrules={() => (drawer = 'rules')} onautoreply={() => (drawer = 'replies')} /></div>
  {/if}
  {#if showTerm && showPlot}
    <div class="handle" role="separator" aria-orientation={narrow ? 'horizontal' : 'vertical'} onpointerdown={drag}></div>
  {/if}
  {#if showPlot}
    <div class="slot" style:flex={showTerm ? `${1 - split} 1 0` : '1 1 0'}>
      <Plot {session} onpick={(off) => { if (session.view === 'plot') session.chooseView('split'); queueMicrotask(() => terminal?.jumpToOffset(off)); }} />
    </div>
  {/if}
  {#if drawer}
    <aside class:wide={drawer === 'settings'}>
      <div class="head"><strong>{DRAWER_TITLES[drawer]}</strong><button class="close" onclick={() => (drawer = null)} title="Close (Esc)">✕</button></div>
      {#if drawer === 'capture'}<CapturePanel ctl={session.capture} newline={session.newline} meta={() => ({ port: session.portLabel(), options: $state.snapshot(session.options) })} onstart={() => session.recordSignals()} />{:else if drawer === 'profiles'}<ProfilesPanel {session} />{:else if drawer === 'replies'}<AutoReplyPanel {session} />{:else if drawer === 'settings'}<SettingsPanel {session} {workspace} />{:else}<RulesPanel />{/if}
    </aside>
  {/if}
</main>
{#if session.quickSends.length}<QuickSendStrip {session} onedit={() => { showSettingsTab('send'); drawer = 'settings'; }} />{/if}
<SendBar bind:this={sendBar} {session} />
<StatusBar {session} onCapture={() => (drawer = 'capture')} />

<style>
  main { flex: 1; min-height: 0; display: flex; position: relative; }
  aside {
    position: absolute; top: 0; right: 0; bottom: 0; width: min(340px, 100%); z-index: 5; overflow: auto;
    padding: 10px 12px; background: var(--panel); border-left: 1px solid var(--line); box-shadow: -8px 0 24px rgb(0 0 0 / .12);
  }
  aside.wide { width: min(420px, 100%); }
  aside .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .close { border: 0; background: none; color: var(--muted); }
  main.narrow { flex-direction: column; }
  .slot { display: flex; min-width: 0; min-height: 0; }
  .handle { flex: 0 0 5px; cursor: col-resize; background: var(--line); }
  .handle:hover { background: var(--accent); }
  main.narrow .handle { cursor: row-resize; }
</style>

<script lang="ts">
  import { untrack } from 'svelte';
  import type { Session } from '../lib/session.svelte';
  import type { Workspace } from '../lib/workspace.svelte';
  import { PORT_TABS, portPanel, type PortTab } from '../lib/panel.svelte';
  import type { View } from '../lib/session.svelte';
  import TopBar from './TopBar.svelte';
  import Terminal from './Terminal.svelte';
  import Plot from './Plot.svelte';
  import SendBar from './SendBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import ControlPanel from './ControlPanel.svelte';
  import QuickSendStrip from './QuickSendStrip.svelte';

  let { session, workspace, narrow, active }: { session: Session; workspace: Workspace; narrow: boolean; active: boolean } = $props();
  let terminal: Terminal | undefined = $state();
  let sendBar: SendBar | undefined = $state();
  let main: HTMLElement;
  let split = $state(0.5);
  /** Shortcuts elsewhere on screen (the status-bar summary, REC, ✎, + Rule) bring their tab of the panel forward. */
  const show = (tab: PortTab) => portPanel.show(tab);

  /**
   * Keyboard to where typing goes: the device in terminal mode or xterm, else the
   * send bar. With `e`, a key that landed nowhere is delivered there too.
   */
  export function focusInput(e?: KeyboardEvent) {
    if (terminal?.takeKeys(e)) return;
    sendBar?.focus();
    if (e && [...e.key].length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); sendBar?.insert(e.key); }
  }

  // Switching to this connection, or connecting it, leaves the keyboard ready to type.
  // Not on touch screens, where focusing a field pops up the on-screen keyboard.
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  $effect(() => {
    if (!active || touch) return;
    void session.open;
    queueMicrotask(() => untrack(() => focusInput()));
  });

  /** Shortcuts that act on this connection; the app routes keys to the active one. */
  export function handleKey(e: KeyboardEvent) {
    // In the xterm view keys belong to the device (Esc for vi, Ctrl+L to redraw); Ctrl+Shift keeps app shortcuts.
    if (e.target instanceof Element && e.target.closest('.xterm') && !(e.ctrlKey && e.shiftKey)) return;
    const ctrlShift = (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey;
    if (ctrlShift && e.key === 'Enter') {
      e.preventDefault();
      if (session.open) void session.disconnect();
      else if (!session.busy && !workspace.holder(session.choice, session)) void session.connect();
    } else if (ctrlShift && /^Digit[1-8]$/.test(e.code)) {
      e.preventDefault();
      portPanel.click(PORT_TABS[Number(e.code.slice(5)) - 1]!);
    } else if (ctrlShift && e.code === 'Space') {
      e.preventDefault();
      const views: View[] = ['terminal', 'split', 'plot'];
      session.chooseView(views[(views.indexOf(session.view) + 1) % views.length]!);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      session.clear();
    } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      portPanel.click(portPanel.tab);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (session.view === 'plot') session.chooseView('split');
      queueMicrotask(() => terminal?.openFind());
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
      // e.code, not e.key: Alt+digit types a symbol on some layouts (macOS).
      const q = session.quickSends[Number(e.code.slice(5)) - 1];
      if (q) { e.preventDefault(); void session.sendQuick(q); }
    } else if (e.key === 'Escape' && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLInputElement && e.target.closest('.panel'))) {
      sendBar?.focus();
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
  const xtermShown = $derived(showTerm && session.display.format === 'screen');
  const showPlot = $derived(session.view !== 'terminal');
</script>

<TopBar {session} {workspace} onshow={show} />
<main bind:this={main} class:narrow>
  {#if showTerm}
    <div class="slot" style:flex={showPlot ? `${split} 1 0` : '1 1 0'}><Terminal bind:this={terminal} source={session} onshow={(t) => show(t === 'terminal' ? 'display' : 'automation')} /></div>
  {/if}
  {#if showTerm && showPlot}
    <div class="handle" role="separator" aria-orientation={narrow ? 'horizontal' : 'vertical'} onpointerdown={drag}></div>
  {/if}
  {#if showPlot}
    <div class="slot" style:flex={showTerm ? `${1 - split} 1 0` : '1 1 0'}>
      <Plot {session} onpick={(off) => { if (session.view === 'plot') session.chooseView('split'); queueMicrotask(() => terminal?.jumpToOffset(off)); }} />
    </div>
  {/if}
</main>
<!-- In xterm keys go straight to the device, so the send bar and quick sends step aside. -->
{#if !xtermShown}
  {#if session.quickSends.length}<QuickSendStrip {session} onedit={() => show('automation')} />{/if}
  <SendBar bind:this={sendBar} {session} />
{/if}
<ControlPanel {session} {workspace} />
<StatusBar {session} onCapture={() => show('capture')} onport={() => show('port')} />

<style>
  main { flex: 1; min-height: 0; display: flex; position: relative; }
  main.narrow { flex-direction: column; }
  .slot { display: flex; min-width: 0; min-height: 0; }
  .handle { flex: 0 0 5px; cursor: col-resize; background: var(--line); }
  .handle:hover { background: var(--accent); }
  main.narrow .handle { cursor: row-resize; }
</style>

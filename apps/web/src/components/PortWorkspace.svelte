<script lang="ts">
  import type { Session } from '../lib/session.svelte';
  import type { Workspace } from '../lib/workspace.svelte';
  import { portPanel, type PortTab } from '../lib/panel.svelte';
  import TopBar from './TopBar.svelte';
  import Terminal from './Terminal.svelte';
  import Plot from './Plot.svelte';
  import SendBar from './SendBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import ControlPanel from './ControlPanel.svelte';
  import QuickSendStrip from './QuickSendStrip.svelte';

  let { session, workspace, narrow }: { session: Session; workspace: Workspace; narrow: boolean } = $props();
  let terminal: Terminal | undefined = $state();
  let sendBar: SendBar;
  let main: HTMLElement;
  let split = $state(0.5);
  /** Shortcuts elsewhere on screen (the status-bar summary, REC, ✎, + Rule) bring their tab of the panel forward. */
  const show = (tab: PortTab) => portPanel.show(tab);

  /** Shortcuts that act on this connection; the app routes keys to the active one. */
  export function handleKey(e: KeyboardEvent) {
    // In the Screen view keys belong to the device (Esc for vi, Ctrl+L to redraw); Ctrl+Shift keeps app shortcuts.
    if (e.target instanceof Element && e.target.closest('.xterm') && !(e.ctrlKey && e.shiftKey)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
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
      sendBar.focus();
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
{#if session.quickSends.length}<QuickSendStrip {session} onedit={() => show('automation')} />{/if}
<SendBar bind:this={sendBar} {session} />
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

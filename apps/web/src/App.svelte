<script lang="ts">
  import { onMount } from 'svelte';
  import { Session, native } from './lib/session.svelte';
  import TopBar from './components/TopBar.svelte';
  import Terminal from './components/Terminal.svelte';
  import Plot from './components/Plot.svelte';
  import SendBar from './components/SendBar.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import CapturePanel from './components/CapturePanel.svelte';

  const session = new Session();
  if (import.meta.env.DEV) (window as unknown as { session: Session }).session = session;
  let terminal: Terminal | undefined = $state();
  let sendBar: SendBar;
  let main: HTMLElement;
  let split = $state(0.5);
  let narrow = $state(false);
  let drawer = $state<'capture' | null>(null);

  onMount(() => {
    session.refreshPorts();
    const serial = 'serial' in navigator ? navigator.serial : null;
    const refresh = () => session.refreshPorts();
    serial?.addEventListener('connect', refresh);
    serial?.addEventListener('disconnect', refresh);
    // Node has no hot-plug event, so poll the port list while idle in the desktop app.
    const poll = native ? setInterval(() => { if (!session.open) session.refreshPorts(); }, 2000) : undefined;
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

  function key(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      session.clear();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (session.view === 'plot') session.chooseView('split');
      queueMicrotask(() => terminal?.openFind());
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

<svelte:window onkeydown={key} />

<TopBar {session} bind:drawer />
<main bind:this={main} class:narrow>
  {#if showTerm}
    <div class="slot" style:flex={showPlot ? `${split} 1 0` : '1 1 0'}><Terminal bind:this={terminal} {session} /></div>
  {/if}
  {#if showTerm && showPlot}
    <div class="handle" role="separator" aria-orientation={narrow ? 'horizontal' : 'vertical'} onpointerdown={drag}></div>
  {/if}
  {#if showPlot}
    <div class="slot" style:flex={showTerm ? `${1 - split} 1 0` : '1 1 0'}>
      <Plot {session} onpick={(off) => { if (session.view === 'plot') session.chooseView('split'); queueMicrotask(() => terminal?.jumpToOffset(off)); }} />
    </div>
  {/if}
  {#if drawer === 'capture'}
    <aside>
      <div class="head"><strong>Capture</strong><button class="close" onclick={() => (drawer = null)} title="Close (Esc)">✕</button></div>
      <CapturePanel {session} />
    </aside>
  {/if}
</main>
<SendBar bind:this={sendBar} {session} />
<StatusBar {session} onCapture={() => (drawer = 'capture')} />

<style>
  main { flex: 1; min-height: 0; display: flex; position: relative; }
  aside {
    position: absolute; top: 0; right: 0; bottom: 0; width: min(340px, 100%); z-index: 5; overflow: auto;
    padding: 10px 12px; background: var(--panel); border-left: 1px solid var(--line); box-shadow: -8px 0 24px rgb(0 0 0 / .12);
  }
  aside .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .close { border: 0; background: none; color: var(--muted); }
  main.narrow { flex-direction: column; }
  .slot { display: flex; min-width: 0; min-height: 0; }
  .handle { flex: 0 0 5px; cursor: col-resize; background: var(--line); }
  .handle:hover { background: var(--accent); }
  main.narrow .handle { cursor: row-resize; }
</style>

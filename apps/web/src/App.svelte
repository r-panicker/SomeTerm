<script lang="ts">
  import { onMount } from 'svelte';
  import { Session } from './lib/session.svelte';
  import TopBar from './components/TopBar.svelte';
  import Terminal from './components/Terminal.svelte';
  import Plot from './components/Plot.svelte';
  import SendBar from './components/SendBar.svelte';
  import StatusBar from './components/StatusBar.svelte';

  const session = new Session();
  if (import.meta.env.DEV) (window as unknown as { session: Session }).session = session;
  let terminal: Terminal | undefined = $state();
  let sendBar: SendBar;
  let main: HTMLElement;
  let split = $state(0.5);
  let narrow = $state(false);

  onMount(() => {
    session.refreshPorts();
    const serial = 'serial' in navigator ? navigator.serial : null;
    const refresh = () => session.refreshPorts();
    serial?.addEventListener('connect', refresh);
    serial?.addEventListener('disconnect', refresh);
    const mq = matchMedia('(max-width: 700px)');
    const onMq = () => (narrow = mq.matches);
    onMq();
    mq.addEventListener('change', onMq);
    return () => {
      serial?.removeEventListener('connect', refresh);
      serial?.removeEventListener('disconnect', refresh);
      mq.removeEventListener('change', onMq);
    };
  });

  function key(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      session.clear();
    } else if (e.key === 'Escape' && !(e.target instanceof HTMLSelectElement)) {
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

<svelte:window onkeydown={key} />

<TopBar {session} />
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
</main>
<SendBar bind:this={sendBar} {session} />
<StatusBar {session} />

<style>
  main { flex: 1; min-height: 0; display: flex; }
  main.narrow { flex-direction: column; }
  .slot { display: flex; min-width: 0; min-height: 0; }
  .handle { flex: 0 0 5px; cursor: col-resize; background: var(--line); }
  .handle:hover { background: var(--accent); }
  main.narrow .handle { cursor: row-resize; }
</style>

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

  let { session, workspace, narrow }: { session: Session; workspace: Workspace; narrow: boolean } = $props();
  let terminal: Terminal | undefined = $state();
  let sendBar: SendBar;
  let main: HTMLElement;
  let split = $state(0.5);
  let drawer = $state<'capture' | 'profiles' | null>(null);

  /** Shortcuts that act on this tab; the app routes keys to the active tab. */
  export function handleKey(e: KeyboardEvent) {
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


<TopBar {session} {workspace} bind:drawer />
<main bind:this={main} class:narrow>
  {#if showTerm}
    <div class="slot" style:flex={showPlot ? `${split} 1 0` : '1 1 0'}><Terminal bind:this={terminal} source={session} /></div>
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
    <aside>
      <div class="head"><strong>{drawer === 'capture' ? 'Capture' : 'Profiles'}</strong><button class="close" onclick={() => (drawer = null)} title="Close (Esc)">✕</button></div>
      {#if drawer === 'capture'}<CapturePanel ctl={session.capture} newline={session.newline} />{:else}<ProfilesPanel {session} />{/if}
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

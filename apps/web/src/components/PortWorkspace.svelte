<script lang="ts">
  import type { Session } from '../lib/session.svelte';
  import type { Workspace } from '../lib/workspace.svelte';
  import TopBar from './TopBar.svelte';
  import Terminal from './Terminal.svelte';
  import Plot from './Plot.svelte';
  import SendBar from './SendBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import SettingsPanel, { showSettingsTab, type SettingsSection } from './SettingsPanel.svelte';
  import { resetSettings } from '../lib/profiles.svelte';
  import QuickSendStrip from './QuickSendStrip.svelte';

  let { session, workspace, narrow }: { session: Session; workspace: Workspace; narrow: boolean } = $props();
  let terminal: Terminal | undefined = $state();
  let sendBar: SendBar;
  let main: HTMLElement;
  let split = $state(0.5);
  /** Settings is the only drawer; every shortcut (chip, ⋯, ƒx, Capture, ✎) opens it at its section. */
  let settingsOpen = $state(false);
  function openSettings(section?: SettingsSection) {
    if (section) showSettingsTab(section);
    settingsOpen = true;
  }

  let resetAll = $state(false);

  function reset() {
    const kept = [
      ...(session.open ? ['port settings (while connected)'] : []),
      'profiles',
      ...(resetAll ? [] : ['colour rules', 'auto-replies', 'quick-send buttons', 'text size and scrollback']),
    ];
    if (!confirm(`Reset ${resetAll ? 'everything' : "this tab's settings"} to defaults?\n\nKept: ${kept.join(', ')}.`)) return;
    resetSettings(session, resetAll);
    resetAll = false;
  }

  /** Shortcuts that act on this tab; the app routes keys to the active tab. */
  export function handleKey(e: KeyboardEvent) {
    // In the Screen view keys belong to the device (Esc for vi, Ctrl+L to redraw); Ctrl+Shift keeps app shortcuts.
    if (e.target instanceof Element && e.target.closest('.xterm') && !(e.ctrlKey && e.shiftKey)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      session.clear();
    } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      settingsOpen = !settingsOpen;
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (session.view === 'plot') session.chooseView('split');
      queueMicrotask(() => terminal?.openFind());
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
      // e.code, not e.key: Alt+digit types a symbol on some layouts (macOS).
      const q = session.quickSends[Number(e.code.slice(5)) - 1];
      if (q) { e.preventDefault(); void session.sendQuick(q); }
    } else if (e.key === 'Escape' && !(e.target instanceof HTMLSelectElement)) {
      if (settingsOpen) settingsOpen = false;
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


<TopBar {session} {workspace} {settingsOpen} onsettings={(s) => (s || !settingsOpen ? openSettings(s) : (settingsOpen = false))} />
<main bind:this={main} class:narrow>
  {#if showTerm}
    <div class="slot" style:flex={showPlot ? `${split} 1 0` : '1 1 0'}><Terminal bind:this={terminal} source={session} onsettings={openSettings} /></div>
  {/if}
  {#if showTerm && showPlot}
    <div class="handle" role="separator" aria-orientation={narrow ? 'horizontal' : 'vertical'} onpointerdown={drag}></div>
  {/if}
  {#if showPlot}
    <div class="slot" style:flex={showTerm ? `${1 - split} 1 0` : '1 1 0'}>
      <Plot {session} onsettings={() => openSettings('plot')} onpick={(off) => { if (session.view === 'plot') session.chooseView('split'); queueMicrotask(() => terminal?.jumpToOffset(off)); }} />
    </div>
  {/if}
  {#if settingsOpen}
    <aside>
      <div class="head">
        <strong>Settings</strong>
        <span class="tools">
          <label class="all" title="Also reset what Reset normally keeps: colour rules, auto-replies, quick-send buttons, text size and scrollback. Profiles are never deleted here, and port settings stay while connected"><input type="checkbox" bind:checked={resetAll} /> All</label>
          <button class="reset" onclick={reset} title="This tab's settings back to their defaults; profiles, colour rules, auto-replies and quick-send buttons are kept unless All is ticked">Reset</button>
          <button class="close" onclick={() => (settingsOpen = false)} title="Close (Esc)">✕</button>
        </span>
      </div>
      <SettingsPanel {session} {workspace} />
    </aside>
  {/if}
</main>
{#if session.quickSends.length}<QuickSendStrip {session} onedit={() => openSettings('send')} />{/if}
<SendBar bind:this={sendBar} {session} onsettings={() => openSettings('send')} />
<StatusBar {session} onCapture={() => openSettings('capture')} />

<style>
  main { flex: 1; min-height: 0; display: flex; position: relative; }
  aside {
    position: absolute; top: 0; right: 0; bottom: 0; width: min(420px, 100%); z-index: 5; overflow: auto;
    padding: 10px 12px; background: var(--panel); border-left: 1px solid var(--line); box-shadow: -8px 0 24px rgb(0 0 0 / .12);
  }
  /* On a phone the drawer covers the workspace rather than squeezing it. */
  @media (max-width: 700px) { aside { width: 100%; border-left: 0; } }
  aside .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .tools { display: flex; align-items: center; gap: 8px; }
  .all { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); cursor: pointer; }
  .reset { height: 24px; font-size: 12px; padding: 0 8px; }
  .close { border: 0; background: none; color: var(--muted); }
  main.narrow { flex-direction: column; }
  .slot { display: flex; min-width: 0; min-height: 0; }
  .handle { flex: 0 0 5px; cursor: col-resize; background: var(--line); }
  .handle:hover { background: var(--accent); }
  main.narrow .handle { cursor: row-resize; }
</style>

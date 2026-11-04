<script lang="ts" module>
  export type SettingsSection = 'connection' | 'terminal' | 'send' | 'plot' | 'capture' | 'app';

  // Reopening Settings returns to the section used last, across port tabs.
  let section = $state<SettingsSection>('connection');

  /** Opens on a given section next time; the chip, ⋯, ƒx and Capture buttons use it. */
  export function showSettingsTab(id: SettingsSection): void {
    section = id;
  }

  export function settingsTab(): SettingsSection {
    return section;
  }
</script>

<script lang="ts">
  import type { Session } from '../lib/session.svelte';
  import type { Workspace } from '../lib/workspace.svelte';
  import PortSettings from './settings/PortSettings.svelte';
  import ProfilePicker from './settings/ProfilePicker.svelte';
  import SendOptions from './settings/SendOptions.svelte';
  import DisplayOptions from './settings/DisplayOptions.svelte';
  import PlotTransforms from './settings/PlotTransforms.svelte';
  import AppSettings from './settings/AppSettings.svelte';
  import CapturePanel from './CapturePanel.svelte';
  import RulesPanel from './RulesPanel.svelte';
  import AutoReplyPanel from './AutoReplyPanel.svelte';
  import ProfilesPanel from './ProfilesPanel.svelte';
  import QuickSendPanel from './QuickSendPanel.svelte';

  /**
   * The one place a port tab's settings are edited. Controls used while working
   * (format buttons, plot window and axis, the send bar's Text/Hex and line ending)
   * stay on their toolbars instead; nothing appears in both.
   */
  let { session, workspace }: { session: Session; workspace: Workspace } = $props();

  const SECTIONS: [SettingsSection, string][] = [['connection', 'Connection'], ['terminal', 'Terminal'], ['send', 'Send'], ['plot', 'Plot'], ['capture', 'Capture'], ['app', 'App']];
  const PALETTE = ['#2f7ed8', '#e8590c', '#2b9348', '#c2255c', '#7048e8', '#0c8599', '#b08900', '#5c7cfa'];
  const disp = $derived(session.display);
  let fileInput: HTMLInputElement | undefined = $state();
</script>

<div class="tabs" role="tablist" aria-label="Settings">
  {#each SECTIONS as [id, label]}
    <button role="tab" aria-selected={section === id} class:on={section === id} onclick={() => (section = id)}>{label}</button>
  {/each}
</div>

<div class="body" role="tabpanel">
  {#if section === 'connection'}
    <div class="form">
      <ProfilePicker {session} />
      <hr />
      <PortSettings {session} {workspace} />
    </div>
    <h4>Saved profiles</h4>
    <ProfilesPanel {session} />
  {:else if section === 'terminal'}
    <div class="list"><DisplayOptions source={session} /></div>
    <div class="form">
      <label>Bytes per row
        <select bind:value={disp.perRow} title="In the Hex, Dec and Num views; Bin shows half as many">{#each [8, 16, 32] as n}<option value={n}>{n}</option>{/each}</select>
      </label>
    </div>
    <h4>Colour rules <span>all tabs</span></h4>
    <RulesPanel />
  {:else if section === 'send'}
    <div class="form">
      <SendOptions {session} onfile={() => fileInput?.click()} />
      <label>Backspace key
        <select bind:value={session.sendOptions.backspace} title="What Backspace sends when typing to the device; many Linux consoles expect DEL">
          <option value="bs">BS (0x08)</option><option value="del">DEL (0x7F)</option>
        </select>
      </label>
    </div>
    <h4>Quick-send buttons <span>Alt+1…9</span></h4>
    <QuickSendPanel {session} />
    <h4>Auto-replies</h4>
    <AutoReplyPanel {session} />
    <input bind:this={fileInput} type="file" hidden onchange={() => { const f = fileInput?.files?.[0]; if (fileInput) fileInput.value = ''; if (f) session.sendFile(f); }} />
  {:else if section === 'plot'}
    <h4>Conversions</h4>
    <PlotTransforms {session} colors={PALETTE} />
  {:else if section === 'capture'}
    <CapturePanel ctl={session.capture} newline={session.newline} meta={() => ({ port: session.portLabel(), options: $state.snapshot(session.options) })} onstart={() => session.recordSignals()} />
  {:else}
    <AppSettings />
  {/if}
</div>

<style>
  .tabs { display: flex; flex-wrap: wrap; gap: 0; border-bottom: 1px solid var(--line); margin: 0 -12px 10px; padding: 0 8px; }
  .tabs button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none; height: 28px; padding: 0 6px; font-size: 12px; color: var(--muted); }
  .tabs button.on { color: var(--fg); border-bottom-color: var(--accent); }
  .tabs button:hover { color: var(--fg); }
  .list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; font-size: 12px; }
  h4 { margin: 16px 0 8px; font-size: 12px; font-weight: 600; }
  h4 span { font-weight: 400; color: var(--muted); margin-left: 6px; }
</style>

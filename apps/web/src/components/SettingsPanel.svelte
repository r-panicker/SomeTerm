<script lang="ts" module>
  // Reopening Settings returns to the tab used last, across port tabs.
  let lastTab = $state<string>('port');
</script>

<script lang="ts">
  import { NUM_TYPES, numInfo } from '@superserial/core';
  import type { Session } from '../lib/session.svelte';
  import type { Workspace } from '../lib/workspace.svelte';
  import PortSettings from './settings/PortSettings.svelte';
  import SendOptions from './settings/SendOptions.svelte';
  import DisplayOptions from './settings/DisplayOptions.svelte';
  import PlotTransforms from './settings/PlotTransforms.svelte';
  import CapturePanel from './CapturePanel.svelte';
  import RulesPanel from './RulesPanel.svelte';
  import AutoReplyPanel from './AutoReplyPanel.svelte';
  import ProfilesPanel from './ProfilesPanel.svelte';
  import { resetSettings } from '../lib/profiles.svelte';
  import { prefs, SCROLLBACK, TEXT_SIZES } from '../lib/prefs.svelte';

  let { session, workspace }: { session: Session; workspace: Workspace } = $props();

  const TABS = [['port', 'Port'], ['display', 'Display'], ['send', 'Send'], ['capture', 'Capture'], ['plot', 'Plot'], ['automation', 'Automation'], ['profiles', 'Profiles']] as const;
  const PALETTE = ['#2f7ed8', '#e8590c', '#2b9348', '#c2255c', '#7048e8', '#0c8599', '#b08900', '#5c7cfa'];
  const WINDOWS = [[5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min'], [300, '5 min'], [0, 'All']] as const;
  const disp = $derived(session.display);
  const size = $derived(numInfo(disp.numType).size);
  const seriesNames = $derived.by(() => (void session.version, [...session.series.names]));
  let fileInput: HTMLInputElement | undefined = $state();

  function reset() {
    const kept = session.open ? 'Port settings are kept while connected. ' : '';
    if (confirm(`Reset this tab's settings to defaults? ${kept}Profiles, colour rules and auto-replies are kept.`)) resetSettings(session);
  }

  function axisChange(v: string) {
    session.plotFft = v === '\u0001fft';
    session.plotX = session.plotFft || !v ? null : v;
  }
</script>

<div class="tabs" role="tablist" aria-label="Settings">
  {#each TABS as [id, label]}
    <button role="tab" aria-selected={lastTab === id} class:on={lastTab === id} onclick={() => (lastTab = id)}>{label}</button>
  {/each}
</div>

<div class="body" role="tabpanel">
  {#if lastTab === 'port'}
    <div class="form"><PortSettings {session} {workspace} /></div>
  {:else if lastTab === 'display'}
    <div class="form">
      <label>Text size
        <select value={prefs.textSize} onchange={(e) => prefs.setTextSize(Number(e.currentTarget.value))} title="Terminal text in every tab; Ctrl+wheel over the terminal changes it too. Ctrl+= and Ctrl+- zoom the whole window">
          {#each TEXT_SIZES as v, i}<option value={v}>{i === 0 ? 'Normal' : `${Math.round((v / TEXT_SIZES[0]) * 100)}%`}</option>{/each}
        </select>
      </label>
      <label>Format
        <select bind:value={disp.format}>
          <option value="ascii">ASCII</option><option value="hex">Hex</option><option value="dec">Dec</option><option value="bin">Bin</option><option value="num">Num</option>
        </select>
      </label>
      {#if disp.format !== 'ascii'}
        <label>Bytes per row
          <select bind:value={disp.perRow} title="Bin shows half as many">{#each [8, 16, 32] as n}<option value={n}>{n}</option>{/each}</select>
        </label>
      {/if}
      {#if disp.format === 'num'}
        <label>Value type
          <select bind:value={disp.numType}>{#each NUM_TYPES as n}<option value={n.type}>{n.type}</option>{/each}</select>
        </label>
        {#if size > 1}
          <label>Byte order
            <select bind:value={disp.littleEndian}><option value={true}>Little endian</option><option value={false}>Big endian</option></select>
          </label>
          <label>Skip
            <select bind:value={disp.align}>{#each Array.from({ length: size }, (_, i) => i) as a}<option value={a}>{a} bytes</option>{/each}</select>
          </label>
        {/if}
      {/if}
    </div>
    <div class="list"><DisplayOptions source={session} /></div>
    <div class="form">
      <label>Scrollback
        <select value={prefs.scrollback} onchange={(e) => prefs.setScrollback(Number(e.currentTarget.value))} title="Lines kept per terminal, in every tab; older lines are dropped from the view (captures are unaffected)">
          {#each SCROLLBACK as n}<option value={n}>{n.toLocaleString()} lines</option>{/each}
        </select>
      </label>
    </div>
  {:else if lastTab === 'send'}
    <div class="form">
      <label>Line ending
        <select bind:value={session.sendOptions.eol} title="Appended to each text send, after any checksum; Enter sends it in Type mode">
          <option value={'\\r\\n'}>CRLF</option><option value={'\\n'}>LF</option><option value={'\\r'}>CR</option><option value="">none</option>
        </select>
      </label>
      <SendOptions {session} onfile={() => fileInput?.click()} />
      <label>Backspace key
        <select bind:value={session.sendOptions.backspace} title="What Backspace sends when typing to the device; many Linux consoles expect DEL">
          <option value="bs">BS (0x08)</option><option value="del">DEL (0x7F)</option>
        </select>
      </label>
    </div>
    <input bind:this={fileInput} type="file" hidden onchange={() => { const f = fileInput?.files?.[0]; if (fileInput) fileInput.value = ''; if (f) session.sendFile(f); }} />
  {:else if lastTab === 'capture'}
    <CapturePanel ctl={session.capture} newline={session.newline} meta={() => ({ port: session.portLabel(), options: $state.snapshot(session.options) })} onstart={() => session.recordSignals()} />
  {:else if lastTab === 'plot'}
    <div class="form">
      <label>Window
        <select bind:value={session.plotWindow}>{#each WINDOWS as [v, l]}<option value={v}>{l}</option>{/each}</select>
      </label>
      <label>Horizontal axis
        <select value={session.plotFft ? '\u0001fft' : (session.plotX ?? '')} onchange={(e) => axisChange(e.currentTarget.value)}>
          <option value="">Time</option>
          {#each seriesNames as n (n)}<option value={n}>Series {n} (XY)</option>{/each}
          <option value={'\u0001fft'}>Frequency (spectrum)</option>
        </select>
      </label>
      {#if session.plotFft}
        <label>Sample rate
          <input inputmode="decimal" value={session.plotFs ?? ''} placeholder="estimated" onchange={(e) => { const v = Number(e.currentTarget.value); session.plotFs = e.currentTarget.value.trim() && v > 0 ? v : null; }} title="Hz; empty estimates it from arrival times" />
        </label>
      {/if}
    </div>
    <h4>Conversions</h4>
    <PlotTransforms {session} colors={PALETTE} />
  {:else if lastTab === 'automation'}
    <h4>Colour rules <span>all tabs</span></h4>
    <RulesPanel />
    <h4>Auto-replies <span>this tab</span></h4>
    <AutoReplyPanel {session} />
  {:else}
    <ProfilesPanel {session} />
  {/if}
</div>


<div class="foot">
  <button onclick={reset} title="Every setting of this tab back to its default; profiles, colour rules and auto-replies are kept">Reset to defaults</button>
</div>

<style>
  .tabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid var(--line); margin: 0 -12px 10px; padding: 0 8px; }
  .tabs button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none; height: 28px; padding: 0 7px; font-size: 12px; color: var(--muted); }
  .tabs button.on { color: var(--fg); border-bottom-color: var(--accent); }
  .tabs button:hover { color: var(--fg); }
  .list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; font-size: 12px; }
  .foot { margin-top: 18px; padding-top: 10px; border-top: 1px solid var(--line); }
  h4 { margin: 14px 0 8px; font-size: 12px; font-weight: 600; }
  h4:first-child { margin-top: 0; }
  h4 span { font-weight: 400; color: var(--muted); margin-left: 6px; }
</style>

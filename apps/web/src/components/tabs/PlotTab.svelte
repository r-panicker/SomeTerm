<script lang="ts">
  import type { Session } from '../../lib/session.svelte';
  import PlotTransforms from '../settings/PlotTransforms.svelte';

  let { session }: { session: Session } = $props();
  const PALETTE = ['#2f7ed8', '#e8590c', '#2b9348', '#c2255c', '#7048e8', '#0c8599', '#b08900', '#5c7cfa'];
  const WINDOWS = [[5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min'], [300, '5 min'], [0, 'All']] as const;
  const off = $derived(session.view === 'terminal' ? `Not available in ${session.display.format === 'screen' ? 'xterm' : 'Terminal'} view; Plot or Split shows the plot` : '');
  const seriesNames = $derived.by(() => (void session.version, [...session.series.names]));

  function axisChange(v: string) {
    session.plotFft = v === '\u0001fft';
    session.plotX = session.plotFft || !v ? null : v;
  }
</script>

<div class="groups">
  <fieldset disabled={!!off} title={off || undefined}>
    <legend>View</legend>
    <div class="form">
      <label>Window
        <select bind:value={session.plotWindow} title="How much of the newest data is plotted">{#each WINDOWS as [v, l]}<option value={v}>{l}</option>{/each}</select>
      </label>
      <label>Horizontal axis
        <select value={session.plotFft ? '\u0001fft' : (session.plotX ?? '')} onchange={(e) => axisChange(e.currentTarget.value)} title="Time; one series against another (XY, e.g. Lissajous or I–V); or the spectrum">
          <option value="">Time</option>
          {#each seriesNames as n (n)}<option value={n}>Series {n} (XY)</option>{/each}
          <option value={'\u0001fft'}>Frequency (spectrum)</option>
        </select>
      </label>
      {#if session.plotFft}
        <label>Sample rate
          <input class="fs" inputmode="decimal" value={session.plotFs ?? ''} placeholder="estimated" onchange={(e) => { const v = Number(e.currentTarget.value); session.plotFs = e.currentTarget.value.trim() && v > 0 ? v : null; }} title="Hz; empty estimates it from arrival times" />
        </label>
      {/if}
    </div>
    {#if !seriesNames.length}<p class="note">Lines of numbers such as <code>12,34</code> or <code>temp:21.5</code> are plotted as they arrive.</p>{/if}
  </fieldset>
  <fieldset class="grow" disabled={!!off} title={off || undefined}>
    <legend>Conversions</legend>
    <PlotTransforms {session} colors={PALETTE} />
  </fieldset>
</div>

<style>
  .grow { flex: 1 1 360px; }
  .note { margin: 8px 0 0; font-size: 12px; color: var(--muted); max-width: 22em; }
  code { font-family: var(--mono); }
</style>

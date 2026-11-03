<script lang="ts">
  import { onMount } from 'svelte';
  import uPlot from 'uplot';
  import { decimateMinMax } from '@superserial/core';
  import 'uplot/dist/uPlot.min.css';
  import type { Session } from '../lib/session.svelte';

  let { session, onpick }: { session: Session; onpick: (offset: number) => void } = $props();

  const PALETTE = ['#2f7ed8', '#e8590c', '#2b9348', '#c2255c', '#7048e8', '#0c8599', '#b08900', '#5c7cfa'];
  const WINDOWS = [[5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min'], [300, '5 min'], [0, 'All']] as const;

  let host: HTMLDivElement;
  let plot: uPlot | null = null;
  let names = '';
  const hasData = $derived.by(() => (void session.version, session.series.length > 0));
  let paused = $state(false);
  let shownRows: number[] = [];

  function css(n: string) {
    return getComputedStyle(host).getPropertyValue(n).trim();
  }

  function build() {
    plot?.destroy();
    const s = session.series;
    names = s.names.join('\u0000');
    const axis = { stroke: css('--muted'), grid: { stroke: css('--line'), width: 1 }, ticks: { stroke: css('--line') } };
    plot = new uPlot(
      {
        width: host.clientWidth,
        height: Math.max(80, host.clientHeight - legendHeight()),
        scales: { x: { time: false } },
        axes: [{ ...axis, label: 's', labelSize: 14, size: 34 }, { ...axis, size: 50 }],
        series: [
          { label: 't', value: (_u, v) => (v == null ? '' : v.toFixed(3)) },
          ...s.names.map((n, i) => ({ label: n, stroke: PALETTE[i % PALETTE.length], width: 1.5, spanGaps: false, points: { show: false } })),
        ],
        cursor: { drag: { x: true, y: false }, points: { size: 6 } },
        legend: { live: true },
      },
      [[]],
      host,
    );
    plot.over.addEventListener('click', () => {
      const idx = plot?.cursor.idx;
      const row = idx == null ? undefined : shownRows[idx];
      if (row !== undefined) onpick(session.series.offsets[row]!);
    });
    update(true);
  }

  function legendHeight() {
    return (host.querySelector('.u-legend') as HTMLElement | null)?.offsetHeight ?? 28;
  }

  const MIN_REDRAW_MS = 33;
  let lastDraw = 0;
  let pending = false;

  function update(force = false) {
    if (!plot || (paused && !force)) return;
    const wait = lastDraw + MIN_REDRAW_MS - performance.now();
    if (wait > 0 && !force) {
      if (!pending) { pending = true; setTimeout(() => { pending = false; update(); }, wait); }
      return;
    }
    lastDraw = performance.now();
    const s = session.series;
    if (!s.length) { plot.setData([[]] as unknown as uPlot.AlignedData); return; }
    const last = s.times[s.length - 1]!;
    const from = session.plotWindow ? s.lowerBound(last - session.plotWindow) : 0;
    const d = decimateMinMax(s.times, s.columns, from, s.length, Math.max(100, Math.round(plot.bbox.width / devicePixelRatio)));
    shownRows = d.rows;
    plot.setData(d.data as uPlot.AlignedData);
  }

  $effect(() => {
    void session.version;
    if (!host) return;
    if (session.series.names.join('\u0000') !== names || !plot) build();
    else update();
  });

  $effect(() => {
    void session.plotWindow;
    update(true);
  });

  onMount(() => {
    const ro = new ResizeObserver(() => plot?.setSize({ width: host.clientWidth, height: Math.max(80, host.clientHeight - legendHeight()) }));
    ro.observe(host);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => build();
    mq.addEventListener('change', onTheme);
    return () => { ro.disconnect(); mq.removeEventListener('change', onTheme); plot?.destroy(); };
  });

  function exportCsv() {
    const s = session.series;
    const rows = [['t', ...s.names].join(',')];
    for (let i = 0; i < s.length; i++) rows.push([s.times[i], ...s.columns.map((c) => c[i] ?? '')].join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n') + '\n'], { type: 'text/csv' }));
    a.download = 'superserial-plot.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
</script>

<section class="pane">
  <div class="toolbar">
    <select bind:value={session.plotWindow} title="Time window">
      {#each WINDOWS as [v, l]}<option value={v}>{l}</option>{/each}
    </select>
    <button class="toggle" class:on={paused} onclick={() => { paused = !paused; update(true); }} title="Pause plot (data keeps arriving)">❚❚</button>
    <span class="spacer"></span>
    <button onclick={exportCsv} disabled={!hasData} title="Export all plotted data as CSV">CSV</button>
  </div>
  <div class="plot" bind:this={host}></div>
  {#if !hasData}<p class="idle">No numeric lines yet</p>{/if}
</section>

<style>
  .plot { flex: 1; min-height: 0; overflow: hidden; padding: 4px 4px 0; }
  .plot :global(.u-legend) { font: 12px ui-monospace, Menlo, Consolas, monospace; color: var(--fg); text-align: left; padding: 0 4px; }
  .plot :global(.u-legend .u-series:first-child) { display: none; }
  .plot :global(.u-legend th) { font-weight: 500; }
  .plot :global(.u-over) { cursor: pointer; }
</style>

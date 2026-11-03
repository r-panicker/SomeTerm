<script lang="ts">
  import { onMount } from 'svelte';
  import uPlot from 'uplot';
  import { compileExpr, decimateMinMax, type Fn } from '@superserial/core';
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
  let fxOpen = $state(false);
  let fxPopover: HTMLDivElement | undefined = $state();
  let fxButton: HTMLButtonElement | undefined = $state();

  /** Compiled transforms; an invalid expression is reported and leaves its series raw. */
  const compiled = $derived.by(() => {
    const out: Record<string, { fn: Fn | null; error: string }> = {};
    for (const [name, t] of Object.entries(session.plotTransforms)) {
      if (!t.expr.trim()) { out[name] = { fn: null, error: '' }; continue; }
      try { out[name] = { fn: compileExpr(t.expr), error: '' }; } catch (e) { out[name] = { fn: null, error: (e as Error).message }; }
    }
    return out;
  });
  const maps = () => session.series.names.map((n) => compiled[n]?.fn ?? null);
  const label = (n: string) => (session.plotTransforms[n]?.unit ? `${n} [${session.plotTransforms[n]!.unit}]` : n);
  const fxActive = $derived(Object.values(compiled).some((c) => c.fn) || Object.values(session.plotTransforms).some((t) => t.unit));

  function setTransform(name: string, patch: Partial<{ expr: string; unit: string }>) {
    const t = { expr: '', unit: '', ...session.plotTransforms[name], ...patch };
    if (!t.expr.trim() && !t.unit.trim()) delete session.plotTransforms[name];
    else session.plotTransforms[name] = t;
  }

  function outsideFx(e: MouseEvent) {
    if (fxOpen && !fxPopover?.contains(e.target as Node) && !fxButton?.contains(e.target as Node)) fxOpen = false;
  }

  function css(n: string) {
    return getComputedStyle(host).getPropertyValue(n).trim();
  }

  function build() {
    plot?.destroy();
    const s = session.series;
    names = s.names.map(label).join('\u0000');
    const axis = { stroke: css('--muted'), grid: { stroke: css('--line'), width: 1 }, ticks: { stroke: css('--line') } };
    plot = new uPlot(
      {
        width: host.clientWidth,
        height: Math.max(80, host.clientHeight - legendHeight()),
        scales: { x: { time: false } },
        axes: [{ ...axis, label: 's', labelSize: 14, size: 34 }, { ...axis, size: 50 }],
        series: [
          { label: 't', value: (_u, v) => (v == null ? '' : v.toFixed(3)) },
          ...s.names.map((n, i) => ({ label: label(n), stroke: PALETTE[i % PALETTE.length], width: 1.5, spanGaps: false, points: { show: false } })),
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
    const d = decimateMinMax(s.times, s.columns, from, s.length, Math.max(100, Math.round(plot.bbox.width / devicePixelRatio)), maps());
    shownRows = d.rows;
    plot.setData(d.data as uPlot.AlignedData);
  }

  $effect(() => {
    void session.version;
    if (!host) return;
    if (session.series.names.map(label).join('\u0000') !== names || !plot) build();
    else update();
  });

  // A unit change relabels the series (rebuild); an expression change only redraws.
  $effect(() => {
    void compiled;
    if (!plot) return;
    if (session.series.names.map(label).join('\u0000') !== names) build();
    else update(true);
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
    // Exports what the plot shows: transformed values, with units in the header.
    const fns = maps();
    const rows = [['t', ...s.names.map(label)].join(',')];
    for (let i = 0; i < s.length; i++) {
      rows.push([Number(s.times[i]!.toFixed(6)), ...s.columns.map((c, k) => { const v = c[i]; return v == null ? '' : fns[k] ? fns[k]!(v) : v; })].join(','));
    }
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
    <div class="anchor">
      <button bind:this={fxButton} class="fx" class:active={fxActive} onclick={() => (fxOpen = !fxOpen)} title="Scale or convert series (e.g. ADC counts to volts)">ƒx</button>
      {#if fxOpen}
        <div class="popover" bind:this={fxPopover}>
          {#each session.series.names as n, i (n)}
            {@const err = compiled[n]?.error}
            <span class="sname" style:color={PALETTE[i % PALETTE.length]}>{n}</span>
            <input
              class="expr"
              class:bad={!!err}
              value={session.plotTransforms[n]?.expr ?? ''}
              oninput={(e) => setTransform(n, { expr: e.currentTarget.value })}
              placeholder="x"
              title={err || 'Expression in x, e.g. x*3.3/4095 or (x-500)/10. Functions: abs sqrt exp ln log sin cos tan min max pow round'}
              spellcheck="false"
            />
            <input class="unit" value={session.plotTransforms[n]?.unit ?? ''} oninput={(e) => setTransform(n, { unit: e.currentTarget.value })} placeholder="unit" maxlength="16" />
          {:else}
            <span class="none">No series yet</span>
          {/each}
        </div>
      {/if}
    </div>
    <span class="spacer"></span>
    <button onclick={exportCsv} disabled={!hasData} title="Export all plotted data as CSV">CSV</button>
  </div>
  <div class="plot" bind:this={host}></div>
  {#if !hasData}<p class="idle">No numeric lines yet</p>{/if}
</section>

<svelte:window onmousedown={outsideFx} onkeydown={(e) => e.key === 'Escape' && (fxOpen = false)} />

<style>
  .anchor { position: relative; }
  .fx { font-style: italic; }
  .fx.active { color: var(--accent); border-color: var(--accent); }
  .popover {
    position: absolute; top: calc(100% + 4px); left: 0; z-index: 10; display: grid; grid-template-columns: auto 1fr 5em;
    gap: 6px 8px; align-items: center; padding: 10px; min-width: 300px; background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; box-shadow: 0 6px 24px rgb(0 0 0 / .18);
  }
  .sname { font: 600 12px var(--mono); max-width: 12ch; overflow: hidden; text-overflow: ellipsis; }
  .popover input { height: 24px; font: 12px var(--mono); min-width: 0; }
  .expr.bad { border-color: var(--err); }
  .none { grid-column: 1 / -1; color: var(--muted); font-size: 12px; }
  .plot { flex: 1; min-height: 0; overflow: hidden; padding: 4px 4px 0; }
  .plot :global(.u-legend) { font: 12px ui-monospace, Menlo, Consolas, monospace; color: var(--fg); text-align: left; padding: 0 4px; }
  .plot :global(.u-legend .u-series:first-child) { display: none; }
  .plot :global(.u-legend th) { font-weight: 500; }
  .plot :global(.u-over) { cursor: pointer; }
</style>

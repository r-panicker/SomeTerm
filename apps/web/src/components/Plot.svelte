<script lang="ts">
  import { prefs } from '../lib/prefs.svelte';
  import { onMount, untrack } from 'svelte';
  import uPlot from 'uplot';
  import { compileExpr, decimateMinMax, estimateRate, largestPow2, nearestIndex, peakFrequency, rangeStats, spectrum, type Fn, type Stats } from '@superserial/core';
  import 'uplot/dist/uPlot.min.css';
  import type { Session } from '../lib/session.svelte';
  import PlotTransforms from './settings/PlotTransforms.svelte';

  let { session, onpick }: { session: Session; onpick: (offset: number) => void } = $props();

  const PALETTE = ['#2f7ed8', '#e8590c', '#2b9348', '#c2255c', '#7048e8', '#0c8599', '#b08900', '#5c7cfa'];
  const WINDOWS = [[5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min'], [300, '5 min'], [0, 'All']] as const;

  let host: HTMLDivElement;
  let plot: uPlot | null = null;
  let names = '';
  const hasData = $derived.by(() => (void session.version, session.series.length > 0));
  // Series names are plain data; the version tick makes the list reactive.
  const seriesNames = $derived.by(() => (void session.version, [...session.series.names]));
  let paused = $state(false);
  let shownRows: number[] = [];
  /** XY mode: for each drawn series, the source row of each point. */
  let shownXY: { col: number; rows: number[] }[] = [];
  const XY_MAX_POINTS = 20_000;

  const xIndex = () => (!session.plotFft && session.plotX ? session.series.names.indexOf(session.plotX) : -1);
  /** Changes whenever the plot must be rebuilt rather than just redrawn. */
  const layoutKey = () => `${session.plotFft ? 'fft' : xIndex() >= 0 ? `xy:${session.plotX}` : 't'}|${session.series.names.map(label).join('\u0000')}`;

  const FFT_MAX = 16_384;
  const FFT_MIN = 32;
  /** Spectrum readouts for the toolbar; reactive so they update as data arrives. */
  let fftInfo = $state<{ fs: number; n: number; peaks: { name: string; hz: number; color: string }[] } | null>(null);
  const hz = (f: number) => (f >= 1000 ? `${(f / 1000).toPrecision(4)} kHz` : `${f.toPrecision(4)} Hz`);
  let statsOn = $state(false);
  let cursorsOn = $state(false);
  /** Cursor x positions (seconds, or Hz on the spectrum); A then B. */
  let cursorX = $state<[number | null, number | null]>([null, null]);
  let nextCursor = 0;
  let statsRows = $state<{ name: string; color: string; s: Stats }[]>([]);
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


  function outsideFx(e: MouseEvent) {
    if (fxOpen && !fxPopover?.contains(e.target as Node) && !fxButton?.contains(e.target as Node)) fxOpen = false;
  }

  function css(n: string) {
    return getComputedStyle(host).getPropertyValue(n).trim();
  }

  function build() {
    plot?.destroy();
    const s = session.series;
    names = layoutKey();
    const axis = { stroke: css('--muted'), grid: { stroke: css('--line'), width: 1 }, ticks: { stroke: css('--line') } };
    if (session.plotFft) {
      plot = new uPlot(
        {
          width: host.clientWidth,
          height: Math.max(80, host.clientHeight - legendHeight()),
          scales: { x: { time: false } },
          axes: [{ ...axis, label: 'Hz', labelSize: 14, size: 34 }, { ...axis, label: 'dB', labelSize: 14, size: 56 }],
          series: [
            { label: 'f', value: (_u, v) => (v == null ? '' : hz(v)) },
            ...s.names.map((n, i) => ({ label: label(n), stroke: PALETTE[i % PALETTE.length], width: 1.25, points: { show: false }, value: (_u: uPlot, v: number | null) => (v == null ? '' : `${v.toFixed(1)} dB`) })),
          ],
          cursor: { drag: { x: true, y: false }, points: { size: 5 } },
          legend: { live: true },
          hooks: { draw: [drawCursors] },
        },
        [[]],
        host,
      );
      plot.over.addEventListener('click', () => placeCursor());
      update(true);
      return;
    }
    const xi = xIndex();
    if (xi >= 0) {
      const facets = [{ scale: 'x', auto: true }, { scale: 'y', auto: true }];
      plot = new uPlot(
        {
          mode: 2,
          width: host.clientWidth,
          height: Math.max(80, host.clientHeight - legendHeight()),
          scales: { x: { time: false, auto: true }, y: { auto: true } },
          axes: [{ ...axis, label: label(s.names[xi]!), labelSize: 14, size: 34 }, { ...axis, size: 50 }],
          series: [
            {},
            ...s.names.flatMap((n, i) => (i === xi ? [] : [{ label: label(n), stroke: PALETTE[i % PALETTE.length], width: 1.5, points: { show: false }, facets }])),
          ],
          cursor: { drag: { x: false, y: false }, points: { show: false } },
          legend: { live: false },
        } as unknown as uPlot.Options,
        [null, ...s.names.flatMap((_, i) => (i === xi ? [] : [[[], []]]))] as unknown as uPlot.AlignedData,
        host,
      );
      plot.over.addEventListener('click', (e) => pickXY(e));
      update(true);
      return;
    }
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
        hooks: { draw: [drawCursors], setScale: [(_u, key) => { if (key === 'x') computeStats(); }] },
      },
      [[]],
      host,
    );
    plot.over.addEventListener('click', () => {
      if (placeCursor()) return;
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
    if (session.plotFft) {
      plot.setData(fftData(from) as unknown as uPlot.AlignedData);
      return;
    }
    const xi = xIndex();
    if (xi >= 0) {
      plot.setData(xyData(from, xi) as unknown as uPlot.AlignedData);
      return;
    }
    const d = decimateMinMax(s.times, s.columns, from, s.length, Math.max(100, Math.round(plot.bbox.width / devicePixelRatio)), maps());
    shownRows = d.rows;
    plot.setData(d.data as uPlot.AlignedData);
    computeStats();
  }

  /** Statistics of what is visible: the window, or the zoomed range when paused and zoomed. */
  function computeStats() {
    if (!statsOn || !plot || session.plotFft || xIndex() >= 0) { if (statsRows.length) statsRows = []; return; }
    const s = session.series;
    const { min, max } = plot.scales.x ?? {};
    if (min == null || max == null) return;
    const from = s.lowerBound(min);
    const to = s.lowerBound(max + 1e-9);
    const fns = maps();
    statsRows = s.names.flatMap((name, k) => {
      const st = rangeStats(s.columns[k]!, from, to, fns[k]);
      return st ? [{ name: label(name), color: PALETTE[k % PALETTE.length]!, s: st }] : [];
    });
  }

  /** In cursor mode a click places A, then B, alternately. Returns whether it did. */
  function placeCursor(): boolean {
    const u = plot;
    if (!cursorsOn || !u || u.cursor.left == null || u.cursor.left < 0) return false;
    // Nothing drawn yet (e.g. too few samples for a spectrum): there is no axis to place on.
    if (!(u.data[0] as unknown[] | undefined)?.length) return true;
    cursorX[nextCursor] = u.posToVal(u.cursor.left, 'x');
    nextCursor = 1 - nextCursor;
    u.redraw(false);
    return true;
  }

  function drawCursors(u: uPlot) {
    if (!cursorsOn) return;
    const ctx = u.ctx;
    const { top, height } = u.bbox;
    ctx.save();
    ctx.font = `${11 * devicePixelRatio}px ui-monospace, Menlo, Consolas, monospace`;
    cursorX.forEach((x, i) => {
      if (x == null) return;
      const px = Math.round(u.valToPos(x, 'x', true)) + 0.5;
      ctx.strokeStyle = ctx.fillStyle = css('--fg');
      ctx.setLineDash([4 * devicePixelRatio, 3 * devicePixelRatio]);
      ctx.lineWidth = devicePixelRatio;
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + height); ctx.stroke();
      ctx.fillText(i ? 'B' : 'A', px + 3 * devicePixelRatio, top + 12 * devicePixelRatio);
    });
    ctx.restore();
  }

  /** Each series' value at a cursor: nearest sample in time, or nearest bin on the spectrum. */
  function valuesAt(x: number): (number | null)[] {
    const u = plot;
    if (!u) return [];
    if (session.plotFft) {
      const xs = (u.data[0] ?? []) as number[];
      const i = nearestIndex(xs, x);
      return session.series.names.map((_, k) => (i < 0 ? null : ((u.data[k + 1] as (number | null)[] | undefined)?.[i] ?? null)));
    }
    const s = session.series;
    const i = nearestIndex(s.times, x);
    const fns = maps();
    return s.columns.map((c, k) => { const v = i < 0 ? null : c[i]; return v == null ? null : fns[k] ? fns[k]!(v) : v; });
  }

  const num = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '–' : Number(v.toPrecision(5)).toString());
  const xUnit = () => (session.plotFft ? 'Hz' : 's');

  const cursorReadout = $derived.by(() => {
    void session.version;
    const [a, b] = cursorX;
    if (!cursorsOn || (a == null && b == null) || xIndex() >= 0) return null;
    const va = a == null ? [] : valuesAt(a);
    const vb = b == null ? [] : valuesAt(b);
    const dx = a != null && b != null ? b - a : null;
    return {
      head: `A ${num(a)} ${xUnit()}   B ${num(b)} ${xUnit()}${dx != null ? `   Δ ${num(dx)} ${xUnit()}${!session.plotFft && dx !== 0 ? ` (${num(1 / Math.abs(dx))} Hz)` : ''}` : ''}`,
      rows: session.series.names.map((n, k) => ({
        name: session.plotFft ? `${label(n)} [dB]` : label(n),
        color: PALETTE[k % PALETTE.length]!,
        a: va[k] ?? null,
        b: vb[k] ?? null,
      })),
    };
  });

  function toggleCursors() {
    cursorsOn = !cursorsOn;
    cursorX = [null, null];
    nextCursor = 0;
    plot?.redraw(false);
  }

  /**
   * Pairs each series with the X series row by row. Time buckets mean nothing on
   * an XY trace, so a long window is thinned by an even stride, which keeps its shape.
   */
  function xyData(from: number, xi: number) {
    const s = session.series;
    const fns = maps();
    const tf = (k: number, v: number) => (fns[k] ? fns[k]!(v) : v);
    const stride = Math.max(1, Math.ceil((s.length - from) / XY_MAX_POINTS));
    const xcol = s.columns[xi]!;
    shownXY = [];
    const data: (null | number[][])[] = [null];
    s.columns.forEach((col, k) => {
      if (k === xi) return;
      const xs: number[] = [], ys: number[] = [], rows: number[] = [];
      for (let r = from; r < s.length; r += stride) {
        const x = xcol[r], y = col[r];
        if (x == null || y == null) continue;
        xs.push(tf(xi, x)); ys.push(tf(k, y)); rows.push(r);
      }
      data.push([xs, ys]);
      shownXY.push({ col: k, rows });
    });
    return data;
  }

  /**
   * Spectrum of the newest power-of-two block of rows in the window. Rows where a
   * series has no value repeat its previous one, so every series uses the same
   * rows and one frequency axis.
   */
  function fftData(from: number) {
    const s = session.series;
    const n = largestPow2(Math.min(s.length - from, FFT_MAX));
    if (n < FFT_MIN) {
      fftInfo = null;
      return [[]];
    }
    const start = s.length - n;
    const fs = session.plotFs ?? estimateRate(s.times.slice(start));
    if (!(fs > 0)) {
      fftInfo = null;
      return [[]];
    }
    const fns = maps();
    let freqs: number[] = [];
    const dbs: (number | null)[][] = [];
    const peaks: { name: string; hz: number; color: string }[] = [];
    s.columns.forEach((col, k) => {
      const first = col.slice(start).find((v) => v != null);
      if (first == null) { dbs.push([]); return; }
      let held: number = first;
      const xs = new Array<number>(n);
      for (let i = 0; i < n; i++) {
        const v = col[start + i];
        if (v != null) held = v;
        xs[i] = fns[k] ? fns[k]!(held) : held;
      }
      const sp = spectrum(xs, fs);
      freqs = sp.freqs;
      dbs.push(sp.db);
      peaks.push({ name: s.names[k]!, hz: peakFrequency(sp), color: PALETTE[k % PALETTE.length]! });
    });
    fftInfo = { fs, n, peaks };
    return [freqs, ...dbs.map((d) => (d.length ? d : freqs.map(() => null)))];
  }

  /** Nearest drawn point within a few pixels of the click, across all XY series. */
  function pickXY(e: MouseEvent) {
    const u = plot;
    if (!u) return;
    const rect = u.over.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    let best = 64; // squared pixels
    let row = -1;
    const data = u.data as unknown as (null | number[][])[];
    shownXY.forEach((sx, si) => {
      const [xs, ys] = data[si + 1]!;
      for (let j = 0; j < xs!.length; j++) {
        const dx = u.valToPos(xs![j]!, 'x') - cx, dy = u.valToPos(ys![j]!, 'y') - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; row = sx.rows[j]!; }
      }
    });
    if (row >= 0) onpick(session.series.offsets[row]!);
  }

  $effect(() => {
    void session.version;
    if (!host) return;
    if (layoutKey() !== names || !plot) build();
    else update();
  });

  // A unit change relabels the series (rebuild); an expression change only redraws.
  $effect(() => {
    void compiled;
    if (!plot) return;
    void session.plotX;
    void session.plotFft;
    void session.plotFs;
    if (layoutKey() !== names) { cursorX = [null, null]; nextCursor = 0; build(); }
    else update(true);
  });

  $effect(() => {
    void session.plotWindow;
    update(true);
  });

  onMount(() => {
    const ro = new ResizeObserver(() => plot?.setSize({ width: host.clientWidth, height: Math.max(80, host.clientHeight - legendHeight()) }));
    ro.observe(host);
    return () => { ro.disconnect(); plot?.destroy(); };
  });

  // Colours are read from CSS when the plot is built, so a theme change rebuilds it.
  let builtDark = prefs.dark;
  $effect(() => {
    const d = prefs.dark;
    if (d !== builtDark) { builtDark = d; untrack(() => build()); }
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
    {#if hasData}
      <select
        value={session.plotFft ? '\u0001fft' : (session.plotX ?? '')}
        onchange={(e) => {
          const v = e.currentTarget.value;
          session.plotFft = v === '\u0001fft';
          session.plotX = session.plotFft || !v ? null : v;
        }}
        title="Horizontal axis: time, another series (XY), or frequency (spectrum)"
      >
        <option value="">vs time</option>
        {#if seriesNames.length > 1}{#each seriesNames as n (n)}<option value={n}>vs {n}</option>{/each}{/if}
        <option value={'\u0001fft'}>Spectrum</option>
      </select>
    {/if}
    {#if session.plotFft}
      <input
        class="fs"
        inputmode="decimal"
        value={session.plotFs ?? ''}
        placeholder={fftInfo ? `${fftInfo.fs.toPrecision(4)} Hz` : 'Hz'}
        onchange={(e) => { const v = Number(e.currentTarget.value); session.plotFs = e.currentTarget.value.trim() && v > 0 ? v : null; }}
        title="Sample rate in Hz. Empty: estimated from arrival times{fftInfo ? ` (${fftInfo.n} samples, ${(fftInfo.fs / fftInfo.n).toPrecision(3)} Hz per bin)` : ''}"
      />
      {#if fftInfo?.peaks.length}
        <span class="peaks" title={fftInfo.peaks.map((p) => `${p.name}: ${hz(p.hz)}`).join('\n')}>
          peak {#each fftInfo.peaks.slice(0, 2) as pk}<b style:color={pk.color}>{hz(pk.hz)}</b>{/each}
        </span>
      {/if}
    {/if}
    <div class="anchor">
      <button bind:this={fxButton} class="fx" class:active={fxActive} onclick={() => (fxOpen = !fxOpen)} title="Scale or convert series (e.g. ADC counts to volts)">ƒx</button>
      {#if fxOpen}
        <div class="popover" bind:this={fxPopover}>
          <PlotTransforms {session} colors={PALETTE} />
        </div>
      {/if}
    </div>
    <span class="spacer"></span>
    {#if hasData && !session.plotFft && !(session.plotX && seriesNames.includes(session.plotX))}
      <button class="toggle" class:on={statsOn} onclick={() => { statsOn = !statsOn; computeStats(); }} title="Min, max, mean and standard deviation of what is visible">Σ</button>
    {/if}
    {#if hasData && !(session.plotX && !session.plotFft && seriesNames.includes(session.plotX))}
      <button class="toggle" class:on={cursorsOn} onclick={toggleCursors} title="Cursors: click the plot to place A, then B">A|B</button>
    {/if}
    <button onclick={exportCsv} disabled={!hasData} title="Export all plotted data as CSV">CSV</button>
  </div>
  <div class="plot" bind:this={host}></div>
  {#if (statsOn && statsRows.length) || cursorReadout}
    <div class="readout">
      {#if cursorReadout}
        <div class="rhead">{cursorReadout.head}</div>
        <table>
          <tbody>
            {#each cursorReadout.rows as r}
              <tr><th style:color={r.color}>{r.name}</th><td>A {num(r.a)}</td><td>B {num(r.b)}</td><td>Δ {r.a != null && r.b != null ? num(r.b - r.a) : '–'}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
      {#if statsOn && statsRows.length}
        <table>
          <tbody>
            {#each statsRows as r}
              <tr><th style:color={r.color}>{r.name}</th><td>min {num(r.s.min)}</td><td>max {num(r.s.max)}</td><td>mean {num(r.s.mean)}</td><td>σ {num(r.s.sd)}</td><td>n {r.s.n}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
  {#if !hasData}<p class="idle">No numeric lines yet</p>{/if}
</section>

<svelte:window onmousedown={outsideFx} onkeydown={(e) => e.key === 'Escape' && (fxOpen = false)} />

<style>
  .anchor { position: relative; }
  .fx { font-style: italic; }
  .readout { padding: 4px 8px 6px; border-top: 1px solid var(--line); font: 12px var(--mono); color: var(--muted); overflow-x: auto; }
  .readout .rhead { color: var(--fg); white-space: pre; margin-bottom: 2px; }
  .readout table { border-collapse: collapse; }
  .readout th { text-align: left; font-weight: 600; padding-right: 12px; white-space: nowrap; }
  .readout td { padding-right: 14px; white-space: nowrap; }
  .fs { width: 8em; height: 23px; font: 12px var(--mono); }
  .peaks b + b { margin-left: 1ch; }
  .peaks { font: 12px var(--mono); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .fx.active { color: var(--accent); border-color: var(--accent); }
  .popover {
    position: absolute; top: calc(100% + 4px); left: 0; z-index: 10; padding: 10px; min-width: 300px; background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; box-shadow: 0 6px 24px rgb(0 0 0 / .18);
  }
  .plot { flex: 1; min-height: 0; overflow: hidden; padding: 4px 4px 0; }
  .plot :global(.u-legend) { font: 12px ui-monospace, Menlo, Consolas, monospace; color: var(--fg); text-align: left; padding: 0 4px; }
  .plot :global(.u-legend .u-series:first-child) { display: none; }
  .plot :global(.u-legend th) { font-weight: 500; }
  .plot :global(.u-over) { cursor: pointer; }
</style>

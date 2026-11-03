<script lang="ts">
  import { FindIndex, type StyleRun, NUM_TYPES, decodeNumbers, formatNumber, numInfo, toAscii, toBinary, toHex, type NewlineMode, type NumType } from '@superserial/core';
  import { untrack } from 'svelte';
  import CanvasView, { type Span } from './CanvasView.svelte';
  import { ansiColor } from '../lib/ansi-colors';
  import type { Session } from '../lib/session.svelte';

  let { session }: { session: Session } = $props();

  type Format = 'ascii' | 'hex' | 'dec' | 'bin' | 'num';
  interface Dump { per: number; skip: number; fmt: (b: Uint8Array) => string; width: number; side: (b: Uint8Array) => string }
  const DUMP: Record<'hex' | 'dec' | 'bin', Dump> = {
    hex: { per: 16, skip: 0, fmt: (b) => toHex(b), width: 16 * 3 - 1, side: (b) => toAscii(b) },
    dec: { per: 16, skip: 0, fmt: (b) => Array.from(b, (x) => String(x).padStart(3)).join(' '), width: 16 * 4 - 1, side: (b) => toAscii(b) },
    bin: { per: 8, skip: 0, fmt: (b) => toBinary(b), width: 8 * 9 - 1, side: (b) => toAscii(b) },
  };

  let format = $state<Format>('ascii');
  let numType = $state<NumType>('int16');
  let littleEndian = $state(true);
  let align = $state(0);
  const size = $derived(numInfo(numType).size);
  // Changing to a smaller type must not leave an alignment it cannot have.
  $effect(() => { if (align >= size) align = 0; });

  /** Numeric rows keep 16 bytes per row; the raw bytes are shown beside the values. */
  const numDump = $derived<Dump>({
    per: 16,
    skip: align,
    fmt: (b) => decodeNumbers(b, numType, littleEndian).map((v) => formatNumber(v, numType)).join(' '),
    width: (16 / size) * (numInfo(numType).width + 1) - 1,
    side: (b) => toHex(b),
  });
  const dump = $derived(format === 'num' ? numDump : format === 'ascii' ? DUMP.hex : DUMP[format]);
  let stamps = $state(false);
  let ansi = $state(true);

  // Theme-dependent colours for the ANSI palette and for inverse video.
  let dark = $state(false);
  let fgColor = '#000';
  let panelColor = '#fff';
  $effect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const read = () => {
      dark = mq.matches;
      const cs = getComputedStyle(document.documentElement);
      fgColor = cs.getPropertyValue('--fg').trim();
      panelColor = cs.getPropertyValue('--panel').trim();
    };
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  });

  let findOpen = $state(false);
  let query = $state('');
  let caseSensitive = $state(false);
  let regex = $state(false);
  let filter = $state(false);
  let findRev = $state(0);
  /** Current match: absolute line and which match within it. */
  let cur = $state<{ abs: number; k: number } | null>(null);
  let findInput: HTMLInputElement | undefined = $state();
  const index = new FindIndex();

  $effect(() => {
    const q = query, o = { caseSensitive, regex }, showAnsi = ansi;
    const t = setTimeout(() => {
      index.set(q, o, untrack(() => session.log), (l) => (showAnsi ? l.text : (l.raw ?? l.text)));
      cur = null;
      untrack(() => findRev++);
    }, 120);
    return () => clearTimeout(t);
  });

  // Only new data drives this; the bookkeeping it updates must not become a dependency.
  $effect(() => {
    void session.version;
    untrack(() => {
      if (!index.active) return;
      index.scan(session.log);
      if (cur && cur.abs < session.log.dropped) cur = null;
      findRev++;
    });
  });

  const filtering = $derived(findOpen && filter && format === 'ascii' && (void findRev, index.active));

  const position = $derived.by(() => {
    void findRev;
    if (!cur) return 0;
    let n = 0;
    for (const h of index.hits) {
      if (h.abs === cur.abs) return n + cur.k + 1;
      n += h.ranges.length;
    }
    return 0;
  });

  function step(dir: 1 | -1) {
    const hits = index.hits;
    if (!hits.length) return;
    let hi: number;
    let k: number;
    if (cur && index.find(cur.abs) >= 0) {
      hi = index.find(cur.abs);
      k = cur.k + dir;
      if (k < 0) { hi = (hi - 1 + hits.length) % hits.length; k = hits[hi]!.ranges.length - 1; }
      else if (k >= hits[hi]!.ranges.length) { hi = (hi + 1) % hits.length; k = 0; }
    } else {
      const top = filtering ? (hits[view.topRow()]?.abs ?? 0) : session.log.dropped + view.topRow();
      hi = index.lowerBound(top);
      if (dir < 0) hi -= 1;
      hi = (hi + hits.length) % hits.length;
      k = dir > 0 ? 0 : hits[hi]!.ranges.length - 1;
    }
    cur = { abs: hits[hi]!.abs, k };
    view.scrollToRow(filtering ? hi : hits[hi]!.abs - session.log.dropped);
  }

  export function openFind() {
    format = 'ascii';
    findOpen = true;
    queueMicrotask(() => { findInput?.focus(); findInput?.select(); });
  }

  function closeFind() {
    findOpen = false;
    filter = false;
    query = '';
    cur = null;
  }

  function findKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.stopPropagation(); closeFind(); }
  }

  /**
   * Splits a line into spans at every ANSI style edge and find-match edge.
   * `shift` is the length of a prefix (the tx arrow) that the ranges do not include.
   */
  function segments(text: string, tone: Span['tone'], abs: number, shift: number, runs: StyleRun[]): Span[] {
    const hi = index.active ? index.find(abs) : -1;
    const ranges = hi >= 0 ? index.hits[hi]!.ranges : [];
    if (!runs.length && !ranges.length) return [{ text, tone }];
    const cuts = new Set([0, text.length]);
    for (const r of runs) { cuts.add(r.from + shift); cuts.add(r.to + shift); }
    for (const [a, b] of ranges) { cuts.add(a + shift); cuts.add(b + shift); }
    const edges = [...cuts].filter((c) => c >= 0 && c <= text.length).sort((x, y) => x - y);
    const out: Span[] = [];
    for (let e = 0; e < edges.length - 1; e++) {
      const a = edges[e]!;
      const span: Span = { text: text.slice(a, edges[e + 1]), tone };
      const run = runs.find((r) => a - shift >= r.from && a - shift < r.to);
      if (run) Object.assign(span, styleOf(run));
      const k = ranges.findIndex(([x, y]) => a - shift >= x && a - shift < y);
      if (k >= 0) span.mark = cur && cur.abs === abs && cur.k === k ? 'current' : 'match';
      out.push(span);
    }
    return out;
  }

  function styleOf(r: StyleRun): Partial<Span> {
    const fg = r.fg !== undefined ? ansiColor(r.fg, dark) : undefined;
    const bg = r.bg !== undefined ? ansiColor(r.bg, dark) : undefined;
    const style = { bold: r.bold, italic: r.italic, underline: r.underline, dim: r.dim };
    // Inverse swaps the effective colours, so unset ones fall back to the theme's.
    return r.inverse ? { ...style, color: bg ?? panelColor, bg: fg ?? fgColor } : { ...style, color: fg, bg };
  }
  let follow = $state(true);
  let view: CanvasView;

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  function stamp(t: number): string {
    const d = session.wallClock(t);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)} `;
  }

  function dumpStart() {
    return Math.max(session.hexStart, session.ring.start) + dump.skip;
  }

  const count = $derived.by(() => {
    void session.version;
    if (filtering) return index.hits.length;
    if (format === 'ascii') return session.log.length + (session.partial ? 1 : 0);
    return Math.max(0, Math.ceil((session.ring.end - dumpStart()) / dump.per));
  });

  function asciiLine(i: number) {
    return i < session.log.length ? session.log.get(i)! : { ...session.partial!, dir: 'rx' as const };
  }

  function row(i: number): Span[] {
    if (format === 'ascii') {
      const li = filtering ? index.hits[i]!.abs - session.log.dropped : i;
      const l = asciiLine(li);
      const abs = li < session.log.length ? session.log.dropped + li : -1;
      const spans: Span[] = [];
      if (stamps) spans.push({ text: stamp(l.time), tone: 'muted' });
      if (l.dir === 'tx') spans.push(...segments('→ ' + l.text, 'tx', abs, 2, []));
      else if (ansi) spans.push(...segments(l.text, 'fg', abs, 0, l.runs ?? []));
      else spans.push(...segments(l.raw ?? l.text, 'fg', abs, 0, []));
      return spans;
    }
    const d = dump;
    const at = dumpStart() + i * d.per;
    const bytes = session.ring.slice(at, Math.min(at + d.per, session.ring.end));
    return [
      { text: at.toString(16).padStart(8, '0') + '  ', tone: 'muted' },
      { text: d.fmt(bytes).padEnd(d.width) + '  ', tone: 'fg' },
      { text: d.side(bytes), tone: 'accent' },
    ];
  }

  /** Anything that changes what rows look like must force a redraw, not only new data. */
  const revision = $derived(`${session.version}|${format}|${numType}|${littleEndian}|${align}|${stamps}|${findRev}|${filtering}|${ansi}|${dark}|${cur?.abs}:${cur?.k}`);

  const rowText = (i: number) => row(i).map((s) => s.text).join('');

  /** Scrolls to the line containing a stream offset, switching to ASCII if needed. */
  export function jumpToOffset(offset: number) {
    if (format !== 'ascii') format = 'ascii';
    filter = false;
    const i = session.log.indexOfOffset(offset);
    if (i >= 0) queueMicrotask(() => view.scrollToRow(i));
  }
</script>

<section class="pane">
  <div class="toolbar">
    {#if !findOpen}
      <div class="seg" role="group" aria-label="Display format">
        {#each [['ascii', 'ASCII'], ['hex', 'Hex'], ['dec', 'Dec'], ['bin', 'Bin'], ['num', 'Num']] as [f, l]}
          <button class:on={format === f} onclick={() => (format = f as Format)} title={f === 'num' ? 'Decode as integers or floats' : undefined}>{l}</button>
        {/each}
      </div>
    {/if}
    {#if format === 'num'}
      <select bind:value={numType} title="Value type">
        {#each NUM_TYPES as n}<option value={n.type}>{n.type}</option>{/each}
      </select>
      {#if size > 1}
        <div class="seg" role="group" aria-label="Byte order">
          <button class:on={littleEndian} onclick={() => (littleEndian = true)} title="Little endian (least significant byte first)">LE</button>
          <button class:on={!littleEndian} onclick={() => (littleEndian = false)} title="Big endian (most significant byte first)">BE</button>
        </div>
        <select bind:value={align} title="Skip bytes so values line up with the sender's framing">
          {#each Array.from({ length: size }, (_, i) => i) as a}<option value={a}>+{a}</option>{/each}
        </select>
      {/if}
    {/if}
    {#if findOpen}
      <input
        bind:this={findInput}
        bind:value={query}
        onkeydown={findKey}
        class="find"
        class:bad={!!index.error && (void findRev, true)}
        placeholder="Find"
        title={index.error || 'Enter: next, Shift+Enter: previous, Esc: close'}
        spellcheck="false"
      />
      <button class="toggle" class:on={caseSensitive} onclick={() => (caseSensitive = !caseSensitive)} title="Match case">Aa</button>
      <button class="toggle" class:on={regex} onclick={() => (regex = !regex)} title="Regular expression">.*</button>
      <button class="toggle" class:on={filter} onclick={() => (filter = !filter)} title="Show only matching lines">Filter</button>
      {#if query}
        <span class="count">{(void findRev, index.total) ? `${position || '–'}/${index.total}` : 'none'}</span>
      {/if}
      <button onclick={() => step(-1)} disabled={!(void findRev, index.total)} title="Previous (Shift+Enter)">↑</button>
      <button onclick={() => step(1)} disabled={!(void findRev, index.total)} title="Next (Enter)">↓</button>
      <button onclick={closeFind} title="Close (Esc)">✕</button>
    {:else if format === 'ascii'}
      <select value={session.newline} onchange={(e) => session.setNewline(e.currentTarget.value as NewlineMode)} title="Receive line ending">
        <option value="auto">CR/LF auto</option><option value="lf">LF</option><option value="cr">CR</option><option value="crlf">CRLF</option>
      </select>
      <button class="toggle" class:on={stamps} onclick={() => (stamps = !stamps)} title="Timestamps">⏱</button>
      <button class="toggle" class:on={ansi} onclick={() => (ansi = !ansi)} title="Interpret ANSI colour codes (off: show them as ␛[…)">ANSI</button>
      <button class="toggle" class:on={session.echo} onclick={() => (session.echo = !session.echo)} title="Show sent data (local echo)">⇄</button>
      <button onclick={openFind} title="Find (Ctrl+F)">Find</button>
    {/if}
    {#if !findOpen}<span class="spacer"></span>{/if}
    {#if !follow}<button onclick={() => (follow = true)} title="Scroll to newest">↓ Live</button>{/if}
    {#if !findOpen}<button onclick={() => session.clear()} title="Clear (Ctrl+L)">Clear</button>{/if}
  </div>
  <CanvasView bind:this={view} {count} version={revision} {row} {rowText} bind:follow />
  {#if !session.open && count === 0 && !filtering}<p class="idle">Not connected</p>{/if}
</section>

<style>
  .find { flex: 1; min-width: 6em; font-family: var(--mono); height: 23px; font-size: 12px; }
  .find.bad { border-color: var(--err); }
  .count { font: 12px var(--mono); color: var(--muted); white-space: nowrap; }
</style>

<script lang="ts">
  import { FindIndex, type StyleRun, NUM_TYPES, decodeNumbers, formatNumber, numInfo, toAscii, toBinary, toHex, type NewlineMode, type NumType } from '@superserial/core';
  import { untrack } from 'svelte';
  import CanvasView, { type Span } from './CanvasView.svelte';
  import { ansiColor } from '../lib/ansi-colors';
  import { rules, ruleText, ruleTint } from '../lib/rules.svelte';
  import { applyRules, type RuleRun } from '@superserial/core';
  import type { DisplayFormat, TermSource } from '../lib/source';

  let { source, onrules }: { source: TermSource; onrules?: () => void } = $props();

  type Format = DisplayFormat;
  const disp = $derived(source.display);
  interface Dump { per: number; skip: number; fmt: (b: Uint8Array) => string; width: number; side: (b: Uint8Array) => string }
  const DUMP: Record<'hex' | 'dec' | 'bin', Dump> = {
    hex: { per: 16, skip: 0, fmt: (b) => toHex(b), width: 16 * 3 - 1, side: (b) => toAscii(b) },
    dec: { per: 16, skip: 0, fmt: (b) => Array.from(b, (x) => String(x).padStart(3)).join(' '), width: 16 * 4 - 1, side: (b) => toAscii(b) },
    bin: { per: 8, skip: 0, fmt: (b) => toBinary(b), width: 8 * 9 - 1, side: (b) => toAscii(b) },
  };

  const size = $derived(numInfo(disp.numType).size);
  // Changing to a smaller type must not leave an alignment it cannot have.
  $effect(() => { if (disp.align >= size) disp.align = 0; });

  /** Numeric rows keep 16 bytes per row; the raw bytes are shown beside the values. */
  const numDump = $derived<Dump>({
    per: 16,
    skip: disp.align,
    fmt: (b) => decodeNumbers(b, disp.numType, disp.littleEndian).map((v) => formatNumber(v, disp.numType)).join(' '),
    width: (16 / size) * (numInfo(disp.numType).width + 1) - 1,
    side: (b) => toHex(b),
  });
  const dump = $derived(disp.format === 'num' ? numDump : disp.format === 'ascii' ? DUMP.hex : DUMP[disp.format]);

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
    const q = query, o = { caseSensitive, regex }, showAnsi = disp.ansi;
    const t = setTimeout(() => {
      index.set(q, o, untrack(() => source.log), (l) => (showAnsi ? l.text : (l.raw ?? l.text)));
      cur = null;
      untrack(() => findRev++);
    }, 120);
    return () => clearTimeout(t);
  });

  // Only new data drives this; the bookkeeping it updates must not become a dependency.
  $effect(() => {
    void source.version;
    untrack(() => {
      if (!index.active) return;
      index.scan(source.log);
      if (cur && cur.abs < source.log.dropped) cur = null;
      findRev++;
    });
  });

  const filtering = $derived(findOpen && filter && disp.format === 'ascii' && (void findRev, index.active));

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
      const top = filtering ? (hits[view.topRow()]?.abs ?? 0) : source.log.dropped + view.topRow();
      hi = index.lowerBound(top);
      if (dir < 0) hi -= 1;
      hi = (hi + hits.length) % hits.length;
      k = dir > 0 ? 0 : hits[hi]!.ranges.length - 1;
    }
    cur = { abs: hits[hi]!.abs, k };
    view.scrollToRow(filtering ? hi : hits[hi]!.abs - source.log.dropped);
  }

  export function openFind() {
    disp.format = 'ascii';
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
  function segments(text: string, tone: Span['tone'], abs: number, shift: number, runs: StyleRun[], ruled: RuleRun[] = []): Span[] {
    const hi = index.active ? index.find(abs) : -1;
    const ranges = hi >= 0 ? index.hits[hi]!.ranges : [];
    if (!runs.length && !ranges.length && !ruled.length) return [{ text, tone }];
    const cuts = new Set([0, text.length]);
    for (const r of runs) { cuts.add(r.from + shift); cuts.add(r.to + shift); }
    for (const r of ruled) { cuts.add(r.from + shift); cuts.add(r.to + shift); }
    for (const [a, b] of ranges) { cuts.add(a + shift); cuts.add(b + shift); }
    const edges = [...cuts].filter((c) => c >= 0 && c <= text.length).sort((x, y) => x - y);
    const out: Span[] = [];
    for (let e = 0; e < edges.length - 1; e++) {
      const a = edges[e]!;
      const span: Span = { text: text.slice(a, edges[e + 1]), tone };
      const run = runs.find((r) => a - shift >= r.from && a - shift < r.to);
      if (run) Object.assign(span, styleOf(run));
      // A colour rule is a deliberate choice, so it wins over the device's ANSI colour.
      const rr = ruled.find((r) => a - shift >= r.from && a - shift < r.to);
      if (rr) { span.color = ruleText(rr.color, dark); span.bold = true; }
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
    const d = source.wallClock(t);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)} `;
  }

  function dumpStart() {
    return Math.max(source.hexStart ?? 0, source.ring!.start) + dump.skip;
  }

  const count = $derived.by(() => {
    void source.version;
    if (filtering) return index.hits.length;
    if (disp.format === 'ascii') return source.log.length + (source.partial ? 1 : 0);
    if (!source.ring) return 0;
    return Math.max(0, Math.ceil((source.ring.end - dumpStart()) / dump.per));
  });

  function asciiLine(i: number) {
    return i < source.log.length ? source.log.get(i)! : { ...source.partial!, dir: 'rx' as const };
  }

  function row(i: number): Span[] {
    if (disp.format === 'ascii') {
      const li = filtering ? index.hits[i]!.abs - source.log.dropped : i;
      const l = asciiLine(li);
      const abs = li < source.log.length ? source.log.dropped + li : -1;
      const spans: Span[] = [];
      const tag = l.src !== undefined ? source.sources?.[l.src] : undefined;
      if (tag) spans.push({ text: `${tag.label}› `, tone: 'fg', color: tag.color, bold: true });
      if (disp.stamps) spans.push({ text: stamp(l.time), tone: 'muted' });
      const ruled = applyRules(rules.compiled, shownText(l)).runs;
      if (l.dir === 'sys') spans.push(...segments(l.text, 'muted', abs, 0, [], ruled));
      else if (l.dir === 'tx') spans.push(...segments('→ ' + l.text, 'tx', abs, 2, [], ruled));
      else if (disp.ansi) spans.push(...segments(l.text, 'fg', abs, 0, l.runs ?? [], ruled));
      else spans.push(...segments(l.raw ?? l.text, 'fg', abs, 0, [], ruled));
      return spans;
    }
    const d = dump;
    const at = dumpStart() + i * d.per;
    const ring = source.ring!;
    const bytes = ring.slice(at, Math.min(at + d.per, ring.end));
    return [
      { text: at.toString(16).padStart(8, '0') + '  ', tone: 'muted' },
      { text: d.fmt(bytes).padEnd(d.width) + '  ', tone: 'fg' },
      { text: d.side(bytes), tone: 'accent' },
    ];
  }

  /** The text a line is drawn with, which is also what rules and find match against. */
  function shownText(l: { dir: string; text: string; raw?: string }): string {
    return l.dir === 'tx' || disp.ansi ? l.text : (l.raw ?? l.text);
  }

  function rowBg(i: number): string | undefined {
    if (disp.format !== 'ascii' || !rules.compiled.length) return undefined;
    const li = filtering ? index.hits[i]!.abs - source.log.dropped : i;
    const c = applyRules(rules.compiled, shownText(asciiLine(li))).line;
    return c === undefined ? undefined : ruleTint(c, dark);
  }

  function promoteToRule() {
    if (!query || index.error) return;
    rules.add({ pattern: query, caseSensitive, regex, mode: 'match' });
    onrules?.();
  }

  /** Anything that changes what rows look like must force a redraw, not only new data. */
  const revision = $derived(`${source.version}|${disp.format}|${disp.numType}|${disp.littleEndian}|${disp.align}|${disp.stamps}|${findRev}|${filtering}|${disp.ansi}|${dark}|${cur?.abs}:${cur?.k}|${rules.version}`);

  const rowText = (i: number) => row(i).map((s) => s.text).join('');

  /** Scrolls to the line containing a stream offset, switching to ASCII if needed. */
  export function jumpToOffset(offset: number) {
    if (disp.format !== 'ascii') disp.format = 'ascii';
    filter = false;
    const i = source.log.indexOfOffset(offset);
    if (i >= 0) queueMicrotask(() => view.scrollToRow(i));
  }
</script>

<section class="pane">
  <div class="toolbar">
    {#if !findOpen && source.ring}
      <div class="seg" role="group" aria-label="Display format">
        {#each [['ascii', 'ASCII'], ['hex', 'Hex'], ['dec', 'Dec'], ['bin', 'Bin'], ['num', 'Num']] as [f, l]}
          <button class:on={disp.format === f} onclick={() => (disp.format = f as Format)} title={f === 'num' ? 'Decode as integers or floats' : undefined}>{l}</button>
        {/each}
      </div>
    {/if}
    {#if disp.format === 'num'}
      <select bind:value={disp.numType} title="Value type">
        {#each NUM_TYPES as n}<option value={n.type}>{n.type}</option>{/each}
      </select>
      {#if size > 1}
        <div class="seg" role="group" aria-label="Byte order">
          <button class:on={disp.littleEndian} onclick={() => (disp.littleEndian = true)} title="Little endian (least significant byte first)">LE</button>
          <button class:on={!disp.littleEndian} onclick={() => (disp.littleEndian = false)} title="Big endian (most significant byte first)">BE</button>
        </div>
        <select bind:value={disp.align} title="Skip bytes so values line up with the sender's framing">
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
      {#if onrules}<button onclick={promoteToRule} disabled={!query || !!index.error} title="Keep colouring this search as a rule">+ Rule</button>{/if}
      {#if query}
        <span class="count">{(void findRev, index.total) ? `${position || '–'}/${index.total}` : 'none'}</span>
      {/if}
      <button onclick={() => step(-1)} disabled={!(void findRev, index.total)} title="Previous (Shift+Enter)">↑</button>
      <button onclick={() => step(1)} disabled={!(void findRev, index.total)} title="Next (Enter)">↓</button>
      <button onclick={closeFind} title="Close (Esc)">✕</button>
    {:else if disp.format === 'ascii'}
      {#if source.setNewline}
        <select value={source.newline} onchange={(e) => source.setNewline?.(e.currentTarget.value as NewlineMode)} title="Receive line ending. Auto: CR, LF or CRLF each end a line">
          <option value="auto">Auto</option><option value="lf">LF</option><option value="cr">CR</option><option value="crlf">CRLF</option>
        </select>
      {/if}
      <button class="toggle" class:on={disp.stamps} onclick={() => (disp.stamps = !disp.stamps)} title="Timestamps">⏱</button>
      <button class="toggle" class:on={disp.ansi} onclick={() => (disp.ansi = !disp.ansi)} title="Interpret ANSI colour codes (off: show them as ␛[…)">ANSI</button>
      {#if source.echo !== undefined}
        <button class="toggle" class:on={source.echo} onclick={() => (source.echo = !source.echo)} title="Show sent data (local echo)">⇄</button>
      {/if}
      <button onclick={openFind} title="Find (Ctrl+F)">Find</button>
      {#if onrules}<button class:active={rules.list.length > 0} onclick={onrules} title="Colour rules: patterns that are always highlighted">Rules</button>{/if}
    {/if}
    {#if !findOpen}<span class="spacer"></span>{/if}
    {#if !follow}<button onclick={() => (follow = true)} title="Scroll to newest">↓ Live</button>{/if}
    {#if !findOpen}<button onclick={() => source.clear()} title="Clear (Ctrl+L)">Clear</button>{/if}
  </div>
  <CanvasView bind:this={view} {count} version={revision} {row} {rowText} {rowBg} bind:follow />
  {#if !source.open && count === 0 && !filtering}<p class="idle">Not connected</p>{/if}
</section>

<style>
  .find { flex: 1; min-width: 6em; font-family: var(--mono); height: 23px; font-size: 12px; }
  .find.bad { border-color: var(--err); }
  .count { font: 12px var(--mono); color: var(--muted); white-space: nowrap; }
  button.active { color: var(--accent); border-color: var(--accent); }
</style>

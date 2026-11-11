<script lang="ts">
  import { FindIndex, type StyleRun, decodeNumbers, formatNumber, numInfo, toAscii, toBinary, toHex } from '@someterm/core';
  import { untrack } from 'svelte';
  import CanvasView, { type Span } from './CanvasView.svelte';
  import Screen from './Screen.svelte';
  import { WrapMap, sliceSpans } from '../lib/wrap';
  import { prefs, TEXT_SIZES } from '../lib/prefs.svelte';
  import type { Session } from '../lib/session.svelte';
  import { ansiColor } from '../lib/ansi-colors';
  import { rules, ruleText, ruleTint } from '../lib/rules.svelte';
  import { applyRules, RGB_FLAG, type RuleRun, type TermLine } from '@someterm/core';
  import { expandBytes, expandPictures, type Expanded } from '../lib/ctrl';
  import type { TermSource } from '../lib/source';

  /** `onshow` brings forward the panel tab that owns something: colour rules and auto-replies live under Automation. */
  let { source, onshow }: { source: TermSource; onshow?: (tab: 'terminal' | 'automation') => void } = $props();
  const utf8 = new TextEncoder();
  const CSI = (s: string) => utf8.encode(`\x1b[${s}`);
  const KEYS: Record<string, Uint8Array> = {
    Backspace: Uint8Array.of(0x08), Tab: Uint8Array.of(0x09), Escape: Uint8Array.of(0x1b),
    ArrowUp: CSI('A'), ArrowDown: CSI('B'), ArrowRight: CSI('C'), ArrowLeft: CSI('D'),
    Home: CSI('H'), End: CSI('F'), Delete: CSI('3~'), PageUp: CSI('5~'), PageDown: CSI('6~'), Insert: CSI('2~'),
    // VT220/xterm function keys
    F1: utf8.encode('\x1bOP'), F2: utf8.encode('\x1bOQ'), F3: utf8.encode('\x1bOR'), F4: utf8.encode('\x1bOS'),
    F5: CSI('15~'), F6: CSI('17~'), F7: CSI('18~'), F8: CSI('19~'), F9: CSI('20~'), F10: CSI('21~'), F11: CSI('23~'), F12: CSI('24~'),
  };

  /** Terminal-mode key mapping. Ctrl+Shift stays with the app; Ctrl+C copies when lines are selected. */
  function typeKey(e: KeyboardEvent): boolean {
    if (!typing || !source.typeKeys || e.isComposing || e.altKey || e.metaKey) return false;
    if (e.ctrlKey && e.shiftKey) return false;
    if (e.key === 'Escape' && view?.hasSelection()) return false;
    if (e.ctrlKey) {
      const k = e.key.toLowerCase();
      // Select all, find and clear stay with the app; \x01, \x06 and \x0c can still be sent from the send bar.
      if (k === 'a' || k === 'f' || k === 'l') return false;
      if (k === 'c' && view?.hasSelection()) return false;
      if (k === 'v') return false;
      if (k.length === 1 && k >= 'a' && k <= 'z') { source.typeKeys(Uint8Array.of(k.charCodeAt(0) - 96), 'other'); return true; }
      return false;
    }
    if (e.key === 'Enter') { source.typeKeys(new Uint8Array(0), 'enter'); return true; }
    if (e.key === 'Backspace') { source.typeKeys(KEYS.Backspace!, 'backspace'); return true; }
    if (KEYS[e.key]) { source.typeKeys(KEYS[e.key]!, 'other'); return true; }
    if ([...e.key].length === 1) { source.typeKeys(utf8.encode(e.key), 'text', e.key); return true; }
    return false;
  }

  function imeText(input: { kind: 'text'; text: string } | { kind: 'backspace' } | { kind: 'enter' }) {
    if (!typing || !source.typeKeys) return;
    if (input.kind === 'text') source.typeKeys(utf8.encode(input.text), 'text', input.text);
    else source.typeKeys(new Uint8Array(0), input.kind);
  }

  function typePaste(text: string) {
    if (!typing || !source.typeKeys) return;
    if (source.pasteText) { source.pasteText(text); return; }
    text.split(/\r?\n|\r/).forEach((part, i, all) => {
      if (part) source.typeKeys!(utf8.encode(part), 'text', part);
      if (i < all.length - 1) source.typeKeys!(new Uint8Array(0), 'enter');
    });
  }

  const TOKEN = RGB_FLAG | 0x5b7fb8;

  const disp = $derived(source.display);
  const FORMAT_NAMES: Record<string, string> = { ascii: 'ASCII', hex: 'Hex', dec: 'Dec', bin: 'Bin', num: 'Int/Float', screen: 'xterm' };
  /** Terminal mode: keys pressed in the focused ASCII view go straight to the device. */
  const typing = $derived(!!source.typeKeys && !!source.typeToDevice && !!source.open && disp.format === 'ascii');
  /** Auto-replies send on their own, so while any is on the toolbar says so. */
  const replyCount = $derived(source.autoReplies?.filter((r) => r.enabled).length ?? 0);
  interface Dump { per: number; skip: number; fmt: (b: Uint8Array) => string; width: number; side: (b: Uint8Array) => string }
  const per = $derived(disp.perRow || 16);
  const DUMP: Record<'hex' | 'dec' | 'bin', Dump> = $derived({
    hex: { per, skip: 0, fmt: (b) => toHex(b), width: per * 3 - 1, side: (b) => toAscii(b) },
    dec: { per, skip: 0, fmt: (b) => Array.from(b, (x) => String(x).padStart(3)).join(' '), width: per * 4 - 1, side: (b) => toAscii(b) },
    bin: { per: per / 2, skip: 0, fmt: (b) => toBinary(b), width: (per / 2) * 9 - 1, side: (b) => toAscii(b) },
  });

  /** Byte views cut into frames by the Display tab; null when rows are cut by width alone. */
  const frames = $derived.by(() => {
    void disp.frame; void disp.frameGapMs; void disp.frameSync;
    return disp.format !== 'ascii' && disp.format !== 'screen' && source.frameIndex ? source.frameIndex() : null;
  });
  const size = $derived(numInfo(disp.numType).size);
  // Changing to a smaller type must not leave an alignment it cannot have.
  $effect(() => { if (disp.align >= size) disp.align = 0; });

  /** Numeric rows show the raw bytes beside the values. */
  const numDump = $derived<Dump>({
    per,
    // Each frame starts aligned, so the skip only applies to rows cut by width.
    skip: frames ? 0 : disp.align,
    fmt: (b) => decodeNumbers(b, disp.numType, disp.littleEndian).map((v) => formatNumber(v, disp.numType)).join(' '),
    width: (per / size) * (numInfo(disp.numType).width + 1) - 1,
    side: (b) => toHex(b),
  });
  const dump = $derived(disp.format === 'num' ? numDump : disp.format === 'hex' || disp.format === 'dec' || disp.format === 'bin' ? DUMP[disp.format] : DUMP.hex);
  /** Only a single port can show a screen: it needs the raw stream and somewhere to type. */
  const screenSource = $derived('onRaw' in source ? (source as unknown as Session) : null);
  let screen: Screen | undefined = $state();

  // Theme-dependent colours for the ANSI palette and for inverse video.
  let dark = $state(false);
  let fgColor = '#000';
  let panelColor = '#fff';
  $effect(() => {
    dark = prefs.dark;
    const cs = getComputedStyle(document.documentElement);
    fgColor = cs.getPropertyValue('--fg').trim();
    panelColor = cs.getPropertyValue('--panel').trim();
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

  /** The query the index was last built for; Enter applies a newer one at once rather than waiting out the debounce. */
  let appliedKey = '';
  const searchKey = () => `${query}\u0000${caseSensitive}${regex}${disp.ansi}${disp.ctrl}`;
  function applySearch() {
    index.set(query, { caseSensitive, regex }, untrack(() => source.log), (l) => shownText(l));
    appliedKey = searchKey();
    cur = null;
    untrack(() => findRev++);
  }

  $effect(() => {
    void query; void caseSensitive; void regex; void disp.ansi; void disp.ctrl;
    const t = setTimeout(() => untrack(() => { if (searchKey() !== appliedKey) applySearch(); }), 120);
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
      const topRow = toLogical(view?.topRow() ?? 0);
      const top = filtering ? (hits[topRow]?.abs ?? 0) : source.log.dropped + topRow;
      hi = index.lowerBound(top);
      if (dir < 0) hi -= 1;
      hi = (hi + hits.length) % hits.length;
      k = dir > 0 ? 0 : hits[hi]!.ranges.length - 1;
    }
    cur = { abs: hits[hi]!.abs, k };
    view?.scrollToRow(toScreen(filtering ? hi : hits[hi]!.abs - source.log.dropped));
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
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchKey() !== appliedKey) applySearch();
      step(e.shiftKey ? -1 : 1);
    }
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
  let view: CanvasView | undefined = $state();

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  function stamp(t: number): string {
    const d = source.wallClock(t);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)} `;
  }

  function dumpStart() {
    return Math.max(source.hexStart ?? 0, source.ring!.start) + dump.skip;
  }

  const logicalCount = $derived.by(() => {
    void source.version;
    if (filtering) return index.hits.length;
    if (disp.format === 'ascii') return source.log.length + (source.partial || typing ? 1 : 0);
    if (!source.ring) return 0;
    if (frames) return frames.count(source.frameFrom!(), dump.per);
    return Math.max(0, Math.ceil((source.ring.end - dumpStart()) / dump.per));
  });

  function asciiLine(i: number) {
    if (i < source.log.length) return source.log.get(i)!;
    // The last row: the partial line, or an empty one to type on.
    return source.partial ? { ...source.partial, dir: 'rx' as const } : { text: '', time: 0, offset: -1, dir: 'rx' as const };
  }

  /** Screen width in characters, from the view; wrapping needs it. */
  let cols = $state(0);
  const wrapping = $derived(disp.wrap && disp.format === 'ascii' && cols > 0);
  const wrap = new WrapMap();
  const STAMP_LEN = 13;

  /** Characters a logical row draws, without building its spans; must match `logicalRow`. */
  function logicalLen(i: number): number {
    const li = filtering ? index.hits[i]!.abs - source.log.dropped : i;
    const l = asciiLine(li);
    const tag = l.src !== undefined ? source.sources?.[l.src] : undefined;
    let n = (tag ? tag.label.length + 2 : 0) + (disp.stamps && !(li === source.log.length && !source.partial) ? STAMP_LEN : 0);
    const pre = l.dir === 'tx' && !('via' in l && l.via === 'typed') ? 2 : 0;
    if (l.dir === 'sys') n += l.text.length;
    else if (disp.ctrl) n += (l.dir === 'tx' ? pre : 0) + expanded(l).text.length;
    else if (l.dir === 'tx') n += pre + l.text.length;
    else n += (disp.ansi ? l.text : (l.raw ?? l.text)).length;
    if (typing && li === source.log.length) n += (source.echoed?.length ?? 0) + 1;
    return n;
  }

  const count = $derived.by(() => {
    const n = logicalCount;
    if (!wrapping) return n;
    void source.echoed;
    const settled = filtering ? n : Math.min(n, source.log.length);
    const key = `${cols}|${disp.stamps}|${disp.ctrl}|${disp.ansi}|${filtering ? findRev : 'all'}`;
    wrap.update(key, source.log.dropped, settled, n, cols, logicalLen);
    return wrap.rows;
  });

  /** Screen row ↔ logical row, which differ only while wrapping. */
  const toScreen = (j: number) => (wrapping ? (void count, wrap.first(j)) : j);
  const toLogical = (r: number) => (wrapping ? (void count, wrap.locate(r).j) : r);

  function row(r: number): Span[] {
    if (!wrapping) return logicalRow(r);
    const { j, k } = wrap.locate(r);
    return sliceSpans(logicalRow(j), k * cols, (k + 1) * cols);
  }

  function logicalRow(i: number): Span[] {
    if (disp.format === 'ascii') {
      const li = filtering ? index.hits[i]!.abs - source.log.dropped : i;
      const l = asciiLine(li);
      const abs = li < source.log.length ? source.log.dropped + li : -1;
      const spans: Span[] = [];
      const tag = l.src !== undefined ? source.sources?.[l.src] : undefined;
      if (tag) spans.push({ text: `${tag.label}› `, tone: 'fg', color: tag.color, bold: true });
      // The empty row to type on has no time of its own.
      if (disp.stamps && !(li === source.log.length && !source.partial)) spans.push({ text: stamp(l.time), tone: 'muted' });
      const ruled = applyRules(rules.compiled, shownText(l)).runs;
      if (l.dir === 'sys') spans.push(...segments(l.text, 'muted', abs, 0, [], ruled));
      else if (disp.ctrl) {
        const x = expanded(l);
        const tokens = x.tokens.map(([from, to]) => ({ from, to, fg: TOKEN }));
        if (l.dir === 'tx') {
          const pre = 'via' in l && l.via === 'auto' ? '↩ ' : 'via' in l && l.via === 'typed' ? '' : '→ ';
          spans.push(...segments(pre + x.text, 'tx', abs, pre.length, tokens, ruled));
        }
        else spans.push(...segments(x.text, 'fg', abs, 0, tokens, ruled));
      } else if (l.dir === 'tx' && 'via' in l && l.via === 'typed') spans.push(...segments(l.text, 'tx', abs, 0, [], ruled));
      else if (l.dir === 'tx' && 'via' in l && l.via === 'auto') spans.push(...segments('↩ ' + l.text, 'tx', abs, 2, [], ruled));
      else if (l.dir === 'tx') spans.push(...segments('→ ' + l.text, 'tx', abs, 2, [], ruled));
      else if (disp.ansi) spans.push(...segments(l.text, 'fg', abs, 0, l.runs ?? [], ruled));
      else spans.push(...segments(l.raw ?? l.text, 'fg', abs, 0, [], ruled));
      if (typing && li === source.log.length) {
        if (source.echoed) spans.push({ text: source.echoed, tone: 'tx' });
        spans.push({ text: '▏', tone: 'accent', decor: true });
      }
      return spans;
    }
    const d = dump;
    const ring = source.ring!;
    const fr = frames?.row(i, source.frameFrom!(), d.per);
    const at = fr ? fr.at : dumpStart() + i * d.per;
    const bytes = ring.slice(at, fr ? at + fr.len : Math.min(at + d.per, ring.end));
    // A frame's arrival time on its first row; continuation rows leave the column blank.
    const time = fr && disp.stamps ? (fr.first && !Number.isNaN(fr.time) ? stamp(fr.time) : ' '.repeat(13)) : '';
    return [
      { text: at.toString(16).padStart(8, '0') + '  ' + time, tone: 'muted' },
      { text: d.fmt(bytes).padEnd(d.width) + '  ', tone: 'fg' },
      { text: d.side(bytes), tone: 'accent' },
    ];
  }

  /** The text a line is drawn with, which is also what rules and find match against. */
  function shownText(l: Pick<TermLine, 'dir' | 'text' | 'raw' | 'offset' | 'bytes' | 'len'>): string {
    if (disp.ctrl && l.dir !== 'sys') return expanded(l).text;
    return l.dir === 'tx' || disp.ansi ? l.text : (l.raw ?? l.text);
  }

  /**
   * Every byte of a line as text or a token. Received lines are read back from the
   * ring with their terminator, so non-ASCII bytes show as hex rather than '.';
   * once evicted, or for sent lines, the stored control pictures are used.
   */
  function expanded(l: Pick<TermLine, 'dir' | 'text' | 'raw' | 'offset' | 'bytes' | 'len'>): Expanded {
    if (l.bytes) return expandBytes(l.bytes);
    const shown = l.raw ?? l.text;
    const ring = source.ring;
    if (l.dir === 'rx' && ring && l.offset >= ring.start && l.offset < ring.end) {
      const n = l.len ?? shown.length;
      const bytes = ring.slice(l.offset, Math.min(ring.end, l.offset + n + 2));
      let end = Math.min(n, bytes.length);
      while (end < bytes.length && (bytes[end] === 0x0d || bytes[end] === 0x0a)) end++;
      return expandBytes(bytes.subarray(0, end));
    }
    return expandPictures(shown);
  }


  function rowBg(r: number): string | undefined {
    // Alternate frames are shaded so where one ends and the next starts is plain.
    if (frames) return frames.row(r, source.frameFrom!(), dump.per).n % 2 ? (dark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.035)') : undefined;
    if (disp.format !== 'ascii' || !rules.compiled.length) return undefined;
    const i = toLogical(r);
    const li = filtering ? index.hits[i]!.abs - source.log.dropped : i;
    const c = applyRules(rules.compiled, shownText(asciiLine(li))).line;
    return c === undefined ? undefined : ruleTint(c, dark);
  }

  function promoteToRule() {
    if (!query || index.error) return;
    rules.add({ pattern: query, caseSensitive, regex, mode: 'match' });
    onshow?.('automation');
  }

  /** Anything that changes what rows look like must force a redraw, not only new data. */
  const revision = $derived(`${source.version}|${disp.format}|${disp.numType}|${disp.littleEndian}|${disp.align}|${per}|${disp.stamps}|${wrapping}|${cols}|${findRev}|${filtering}|${disp.ansi}|${disp.ctrl}|${dark}|${typing}|${source.echoed}|${cur?.abs}:${cur?.k}|${rules.version}|${disp.frame}|${disp.frameGapMs}|${disp.frameSync}`);

  const rowText = (i: number) => row(i).filter((s) => !s.decor).map((s) => s.text).join('');
  /** A wrapped continuation: copied without a line break before it. */
  const continues = (r: number) => wrapping && (void count, wrap.locate(r).k > 0);

  /**
   * Puts the keyboard where typing goes, the device in terminal mode or xterm, and
   * sends `e` there if given. False when this view does not take keys.
   */
  export function takeKeys(e?: KeyboardEvent): boolean {
    if (disp.format === 'screen' && screen && screenSource?.open) {
      screen.focus();
      if (e) screen.type(e);
      return true;
    }
    if (!typing) return false;
    view?.focus();
    if (e && typeKey(e)) e.preventDefault();
    return true;
  }

  /** Until someone has typed into a terminal once, an unfocused one says it takes keys. */
  const HINT_KEY = 'someterm.typedInTerminal.v1';
  let focused = $state(false);
  let typedOnce = $state((() => { try { return !!localStorage.getItem(HINT_KEY); } catch { return true; } })());
  const takesKeys = $derived(typing || (disp.format === 'screen' && !!screenSource?.open));
  const hint = $derived(takesKeys && !focused && !typedOnce);
  $effect(() => {
    if (!takesKeys || !focused || typedOnce) return;
    const done = () => { typedOnce = true; try { localStorage.setItem(HINT_KEY, '1'); } catch { /* shown again next time */ } };
    // Capture: the terminal stops the keys it sends to the device.
    window.addEventListener('keydown', done, { once: true, capture: true });
    return () => window.removeEventListener('keydown', done, { capture: true });
  });

  /** Scrolls to the line containing a stream offset, switching to ASCII if needed. */
  export function jumpToOffset(offset: number) {
    if (disp.format !== 'ascii') disp.format = 'ascii';
    filter = false;
    const i = source.log.indexOfOffset(offset);
    if (i >= 0) queueMicrotask(() => view?.scrollToRow(toScreen(i)));
  }
</script>


<section class="pane" onfocusin={() => (focused = true)} onfocusout={(e) => (focused = !!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)))}>
  <div class="toolbar">
    {#if !findOpen}<span class="fmt" title="Set on the Display tab">{FORMAT_NAMES[disp.format]}{disp.format === 'num' ? ` · ${disp.numType} ${size > 1 ? (disp.littleEndian ? 'LE' : 'BE') : ''}` : ''}</span>{/if}
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
      {#if onshow}<button onclick={promoteToRule} disabled={!query || !!index.error} title="Keep colouring this search as a rule">+ Rule</button>{/if}
      {#if query}
        <span class="count">{(void findRev, index.total) ? `${position || '–'}/${index.total}` : 'none'}</span>
      {/if}
      <button onclick={() => step(-1)} disabled={!(void findRev, index.total)} title="Previous (Shift+Enter)">↑</button>
      <button onclick={() => step(1)} disabled={!(void findRev, index.total)} title="Next (Enter)">↓</button>
      <button onclick={closeFind} title="Close (Esc)">✕</button>
    {:else if disp.format === 'ascii'}
      {#if replyCount}
        <button class="active" onclick={() => onshow?.('automation')} title="{replyCount} auto-repl{replyCount === 1 ? 'y is' : 'ies are'} on and will send data">↩ {replyCount}</button>
      {/if}
    {/if}
    {#if !findOpen}<span class="spacer"></span>{/if}
    {#if !follow}<button onclick={() => (follow = true)} title="Scroll to newest">↓ Live</button>{/if}
    {#if !findOpen && disp.format === 'ascii'}
      <button class="icon" onclick={openFind} title="Find (Ctrl+F)" aria-label="Find">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10 10l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      </button>
    {/if}
    {#if !findOpen}
      <div class="zoom" role="group" aria-label="Text size">
        <button onclick={() => prefs.stepTextSize(-1)} disabled={prefs.textSize <= TEXT_SIZES[0]} title="Smaller text (Ctrl+wheel down)" aria-label="Smaller text">A−</button>
        <span title="Text size; Ctrl+= and Ctrl+- zoom the whole window">{Math.round((prefs.textSize / TEXT_SIZES[0]) * 100)}%</span>
        <button onclick={() => prefs.stepTextSize(1)} disabled={prefs.textSize >= TEXT_SIZES[TEXT_SIZES.length - 1]!} title="Larger text (Ctrl+wheel up)" aria-label="Larger text">A+</button>
      </div>
      <button onclick={() => { source.clear(); screen?.reset(); }} title="Clear (Ctrl+L)">Clear</button>
    {/if}
  </div>
  {#if disp.format === 'screen' && screenSource}
    <Screen bind:this={screen} session={screenSource} />
  {:else}
    <CanvasView bind:this={view} {count} version={revision} {row} {rowText} {rowBg} {continues} bind:cols wrapped={wrapping} onkey={typeKey} onpaste={typing ? typePaste : undefined} ontext={typing ? imeText : undefined} {typing} bind:follow />
    {#if !source.open && count === 0 && !filtering}<p class="idle">Not connected</p>{/if}
  {/if}
  {#if hint}<span class="typehint" aria-hidden="true">Click here to type to the device</span>{/if}
</section>

<style>
  .typehint { position: absolute; right: 22px; bottom: 8px; font-size: 11.5px; color: var(--muted); opacity: .8; pointer-events: none; background: var(--panel); padding: 1px 6px; border-radius: 4px; }
  .find { flex: 1; min-width: 6em; font-family: var(--mono); height: 23px; font-size: 12px; }
  .find.bad { border-color: var(--err); }
  .fmt { font-size: 12px; color: var(--muted); padding: 0 4px; }
  .zoom { display: flex; align-items: center; }
  .zoom span { font: 11.5px var(--mono); color: var(--muted); min-width: 4.2ch; text-align: center; }
  .zoom button { padding: 1px 5px; }
  .count { font: 12px var(--mono); color: var(--muted); white-space: nowrap; }
  button.active { color: var(--accent); border-color: var(--accent); }
  button.icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; padding: 0; }
</style>

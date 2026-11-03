<script lang="ts">
  import { NUM_TYPES, decodeNumbers, formatNumber, numInfo, toAscii, toBinary, toHex, type NewlineMode, type NumType } from '@superserial/core';
  import CanvasView, { type Span } from './CanvasView.svelte';
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
    if (format === 'ascii') return session.log.length + (session.partial ? 1 : 0);
    return Math.max(0, Math.ceil((session.ring.end - dumpStart()) / dump.per));
  });

  function asciiLine(i: number) {
    return i < session.log.length ? session.log.get(i)! : { ...session.partial!, dir: 'rx' as const };
  }

  function row(i: number): Span[] {
    if (format === 'ascii') {
      const l = asciiLine(i);
      const spans: Span[] = [];
      if (stamps) spans.push({ text: stamp(l.time), tone: 'muted' });
      if (l.dir === 'tx') spans.push({ text: '→ ' + l.text, tone: 'tx' });
      else spans.push({ text: l.text, tone: 'fg' });
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
  const revision = $derived(`${session.version}|${format}|${numType}|${littleEndian}|${align}|${stamps}`);

  const rowText = (i: number) => row(i).map((s) => s.text).join('');

  /** Scrolls to the line containing a stream offset, switching to ASCII if needed. */
  export function jumpToOffset(offset: number) {
    if (format !== 'ascii') format = 'ascii';
    const i = session.log.indexOfOffset(offset);
    if (i >= 0) queueMicrotask(() => view.scrollToRow(i));
  }
</script>

<section class="pane">
  <div class="toolbar">
    <div class="seg" role="group" aria-label="Display format">
      {#each [['ascii', 'ASCII'], ['hex', 'Hex'], ['dec', 'Dec'], ['bin', 'Bin'], ['num', 'Num']] as [f, l]}
        <button class:on={format === f} onclick={() => (format = f as Format)} title={f === 'num' ? 'Decode as integers or floats' : undefined}>{l}</button>
      {/each}
    </div>
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
    {#if format === 'ascii'}
      <select value={session.newline} onchange={(e) => session.setNewline(e.currentTarget.value as NewlineMode)} title="Receive line ending">
        <option value="auto">CR/LF auto</option><option value="lf">LF</option><option value="cr">CR</option><option value="crlf">CRLF</option>
      </select>
      <button class="toggle" class:on={stamps} onclick={() => (stamps = !stamps)} title="Timestamps">⏱</button>
      <button class="toggle" class:on={session.echo} onclick={() => (session.echo = !session.echo)} title="Show sent data (local echo)">⇄</button>
    {/if}
    <span class="spacer"></span>
    {#if !follow}<button onclick={() => (follow = true)} title="Scroll to newest">↓ Live</button>{/if}
    <button onclick={() => session.clear()} title="Clear (Ctrl+L)">Clear</button>
  </div>
  <CanvasView bind:this={view} {count} version={revision} {row} {rowText} bind:follow />
  {#if !session.open && count === 0}<p class="idle">Not connected</p>{/if}
</section>

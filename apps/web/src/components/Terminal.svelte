<script lang="ts">
  import { toAscii, toBinary, toDecimal, toHex, type NewlineMode } from '@superserial/core';
  import CanvasView, { type Span } from './CanvasView.svelte';
  import type { Session } from '../lib/session.svelte';

  let { session }: { session: Session } = $props();

  type Format = 'ascii' | 'hex' | 'dec' | 'bin';
  const DUMP: Record<Exclude<Format, 'ascii'>, { per: number; fmt: (b: Uint8Array) => string; width: number }> = {
    hex: { per: 16, fmt: (b) => toHex(b), width: 16 * 3 - 1 },
    dec: { per: 16, fmt: (b) => Array.from(b, (x) => String(x).padStart(3)).join(' '), width: 16 * 4 - 1 },
    bin: { per: 8, fmt: (b) => toBinary(b), width: 8 * 9 - 1 },
  };

  let format = $state<Format>('ascii');
  let stamps = $state(false);
  let follow = $state(true);
  let view: CanvasView;

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  function stamp(t: number): string {
    const d = session.wallClock(t);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)} `;
  }

  function dumpStart() {
    return Math.max(session.hexStart, session.ring.start);
  }

  const count = $derived.by(() => {
    void session.version;
    if (format === 'ascii') return session.log.length + (session.partial ? 1 : 0);
    const per = DUMP[format].per;
    return Math.ceil((session.ring.end - dumpStart()) / per);
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
    const d = DUMP[format];
    const at = dumpStart() + i * d.per;
    const bytes = session.ring.slice(at, Math.min(at + d.per, session.ring.end));
    return [
      { text: at.toString(16).padStart(8, '0') + '  ', tone: 'muted' },
      { text: d.fmt(bytes).padEnd(d.width) + '  ', tone: 'fg' },
      { text: toAscii(bytes), tone: 'accent' },
    ];
  }

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
      {#each [['ascii', 'ASCII'], ['hex', 'Hex'], ['dec', 'Dec'], ['bin', 'Bin']] as [f, l]}
        <button class:on={format === f} onclick={() => (format = f as Format)}>{l}</button>
      {/each}
    </div>
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
  <CanvasView bind:this={view} {count} version={session.version} {row} {rowText} bind:follow />
  {#if !session.open && count === 0}<p class="idle">Not connected</p>{/if}
</section>

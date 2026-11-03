<script lang="ts" module>
  export type Tone = 'fg' | 'muted' | 'tx' | 'accent';
  export type Mark = 'match' | 'current';
  export type Span = { text: string; tone: Tone; mark?: Mark };
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    count: number;
    /** Changes whenever the rows' content may have changed. */
    version: unknown;
    row: (i: number) => Span[];
    rowText: (i: number) => string;
    follow?: boolean;
  }
  let { count, version, row, rowText, follow = $bindable(true) }: Props = $props();

  const LINE = 18;
  const PAD = 8;
  const FONT = '12.5px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  let canvas: HTMLCanvasElement;
  let scroller: HTMLDivElement;
  let width = $state(0);
  let height = $state(0);
  let charW = $state(7.5);
  let maxChars = $state(80);
  let sel: { a: number; b: number } | null = $state(null);
  let flash = $state(-1);
  let dragging = false;
  let colors: Record<Tone | Mark | 'bg' | 'sel' | 'flash', string> = { fg: '#000', muted: '#888', tx: '#06c', accent: '#06c', bg: '#fff', sel: '#cde', flash: '#ff0', match: '#fe8', current: '#f90' };

  function readColors() {
    const cs = getComputedStyle(scroller);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    colors = { fg: v('--fg'), muted: v('--muted'), tx: v('--tx'), accent: v('--accent'), bg: v('--panel'), sel: v('--sel'), flash: v('--flash'), match: v('--match'), current: v('--match-current') };
  }

  onMount(() => {
    readColors();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => { readColors(); draw(); };
    mq.addEventListener('change', onTheme);
    const ro = new ResizeObserver(() => {
      width = scroller.clientWidth;
      height = scroller.clientHeight;
    });
    ro.observe(scroller);
    return () => { mq.removeEventListener('change', onTheme); ro.disconnect(); };
  });

  $effect(() => {
    void version; void width; void height; void sel; void flash;
    if (count === 0) { follow = true; sel = null; }
    if (follow) scroller.scrollTop = scroller.scrollHeight;
    draw();
  });

  function draw() {
    if (!canvas || !width || !height) return;
    const dpr = devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT;
    const w = ctx.measureText('M').width;
    if (w !== charW) charW = w;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'middle';
    const top = scroller.scrollTop - PAD;
    const first = Math.max(0, Math.floor(top / LINE));
    const last = Math.min(count, Math.ceil((top + height) / LINE));
    const x0 = PAD - scroller.scrollLeft;
    const lo = sel ? Math.min(sel.a, sel.b) : -1;
    const hi = sel ? Math.max(sel.a, sel.b) : -2;
    let widest = maxChars;
    for (let i = first; i < last; i++) {
      const y = i * LINE - top;
      if (i >= lo && i <= hi) { ctx.fillStyle = colors.sel; ctx.fillRect(0, y, width, LINE); }
      if (i === flash) { ctx.fillStyle = colors.flash; ctx.fillRect(0, y, width, LINE); }
      let x = x0;
      let chars = 0;
      for (const s of row(i)) {
        if (s.mark) {
          ctx.fillStyle = colors[s.mark];
          ctx.fillRect(x, y + 1, s.text.length * charW, LINE - 2);
        }
        ctx.fillStyle = colors[s.tone];
        ctx.fillText(s.text, x, y + LINE / 2);
        x += s.text.length * charW;
        chars += s.text.length;
      }
      if (chars > widest) widest = chars;
    }
    if (widest !== maxChars) maxChars = widest;
  }

  function onScroll() {
    follow = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 4;
    draw();
  }

  function rowAt(e: MouseEvent): number {
    const r = scroller.getBoundingClientRect();
    return Math.max(0, Math.min(count - 1, Math.floor((e.clientY - r.top + scroller.scrollTop - PAD) / LINE)));
  }

  function down(e: MouseEvent) {
    if (e.button !== 0 || e.offsetX > scroller.clientWidth || e.offsetY > scroller.clientHeight) return;
    const i = rowAt(e);
    sel = e.shiftKey && sel ? { a: sel.a, b: i } : { a: i, b: i };
    dragging = true;
  }
  function move(e: MouseEvent) {
    if (dragging && sel) sel = { a: sel.a, b: rowAt(e) };
  }
  function up() {
    dragging = false;
  }

  function onCopy(e: ClipboardEvent) {
    if (!sel) return;
    const lo = Math.min(sel.a, sel.b);
    const hi = Math.max(sel.a, sel.b);
    const lines: string[] = [];
    for (let i = lo; i <= hi && i < count; i++) lines.push(rowText(i));
    e.clipboardData?.setData('text/plain', lines.join('\n'));
    e.preventDefault();
  }

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      sel = { a: 0, b: count - 1 };
      e.preventDefault();
    } else if (e.key === 'Escape') sel = null;
  }

  export function topRow(): number {
    return Math.max(0, Math.floor((scroller.scrollTop - PAD) / LINE));
  }

  export function scrollToRow(i: number) {
    follow = false;
    scroller.scrollTop = Math.max(0, i * LINE + PAD - height / 2);
    flash = i;
    setTimeout(() => { if (flash === i) flash = -1; }, 1200);
  }
</script>

<svelte:window onmouseup={up} onmousemove={move} />

<div class="wrap">
  <canvas bind:this={canvas} style:width="{width}px" style:height="{height}px"></canvas>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="scroller"
    bind:this={scroller}
    onscroll={onScroll}
    onmousedown={down}
    oncopy={onCopy}
    onkeydown={onKey}
    tabindex="0"
    role="log"
    aria-label="Received data"
  >
    <div style:height="{count * LINE + PAD * 2}px" style:width="{maxChars * charW + PAD * 2}px"></div>
  </div>
</div>

<style>
  .wrap { position: relative; flex: 1; min-height: 0; overflow: hidden; }
  canvas { position: absolute; inset: 0; }
  .scroller { position: absolute; inset: 0; overflow: auto; outline: none; cursor: text; }
</style>

<script lang="ts" module>
  export type Tone = 'fg' | 'muted' | 'tx' | 'accent';
  export type Mark = 'match' | 'current';
  export type Span = {
    text: string;
    tone: Tone;
    mark?: Mark;
    /** Explicit colours (ANSI) override the tone. */
    color?: string;
    /** Drawn but not part of the text (the typing caret): left out of copies. */
    decor?: boolean;
    bg?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    dim?: boolean;
  };
</script>

<script lang="ts">
  import { prefs } from '../lib/prefs.svelte';
  import { onMount } from 'svelte';

  interface Props {
    count: number;
    /** Changes whenever the rows' content may have changed. */
    version: unknown;
    row: (i: number) => Span[];
    rowText: (i: number) => string;
    /** Background for a whole row (colour rules), drawn under selection and find highlights. */
    rowBg?: (i: number) => string | undefined;
    /** Gets keys first (terminal mode); returning true means handled. */
    onkey?: (e: KeyboardEvent) => boolean;
    onpaste?: (text: string) => void;
    /** Text from an on-screen keyboard (touch devices), which does not report keys reliably. */
    ontext?: (input: { kind: 'text'; text: string } | { kind: 'backspace' } | { kind: 'enter' }) => void;
    /** Outline the view while it is capturing keys. */
    typing?: boolean;
    follow?: boolean;
  }
  let { count, version, row, rowText, rowBg, onkey, onpaste, ontext, typing = false, follow = $bindable(true) }: Props = $props();

  const PAD = 8;
  /**
   * Phones open their keyboard only for a focused text field, so a touch tap while
   * typing focuses this hidden one. It always holds one placeholder character, so a
   * Backspace with nothing typed still shows up as a shorter value.
   */
  const SENTINEL = '\u200b';
  let ime: HTMLTextAreaElement | undefined = $state();
  let imeFocused = $state(false);

  let touched = false;
  // Focus on click, the last event of a tap: the mousedown a browser adds after a touch would otherwise take focus back.
  function tapped() {
    if (!touched || !typing || !ime) return;
    touched = false;
    ime.value = SENTINEL;
    ime.focus({ preventScroll: true });
  }

  function imeInput() {
    if (!ime) return;
    const v = ime.value;
    ime.value = SENTINEL;
    if (v.length < SENTINEL.length) { ontext?.({ kind: 'backspace' }); return; }
    const added = v.replaceAll(SENTINEL, '');
    added.split('\n').forEach((part, i) => {
      if (i > 0) ontext?.({ kind: 'enter' });
      if (part) ontext?.({ kind: 'text', text: part });
    });
  }

  const LINE = $derived(Math.round(prefs.textSize * 1.44));
  const FONT = $derived(`${prefs.textSize}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`);

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

  $effect(() => {
    void prefs.dark;
    if (scroller) { readColors(); draw(); }
  });

  onMount(() => {
    readColors();
    const ro = new ResizeObserver(() => {
      width = scroller.clientWidth;
      height = scroller.clientHeight;
    });
    ro.observe(scroller);
    return () => ro.disconnect();
  });

  $effect(() => {
    void version; void width; void height; void sel; void flash; void LINE;
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
      const tint = rowBg?.(i);
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, y, width, LINE); }
      if (i >= lo && i <= hi) { ctx.fillStyle = colors.sel; ctx.fillRect(0, y, width, LINE); }
      if (i === flash) { ctx.fillStyle = colors.flash; ctx.fillRect(0, y, width, LINE); }
      let x = x0;
      let chars = 0;
      for (const s of row(i)) {
        const w = s.text.length * charW;
        if (s.bg) {
          ctx.fillStyle = s.bg;
          ctx.fillRect(x, y, w, LINE);
        }
        if (s.mark) {
          ctx.fillStyle = colors[s.mark];
          ctx.fillRect(x, y + 1, w, LINE - 2);
        }
        const styled = s.bold || s.italic;
        if (styled) ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${FONT}`;
        if (s.dim) ctx.globalAlpha = 0.6;
        ctx.fillStyle = s.color ?? colors[s.tone];
        if (s.underline) ctx.fillRect(x, y + LINE - 3, w, 1);
        ctx.fillText(s.text, x, y + LINE / 2);
        if (styled) ctx.font = FONT;
        if (s.dim) ctx.globalAlpha = 1;
        x += w;
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

  /** Row a plain press started on; -1 for a shift-click, which extends the selection. */
  let pressed = -1;
  function down(e: MouseEvent) {
    if (e.button !== 0 || e.offsetX > scroller.clientWidth || e.offsetY > scroller.clientHeight) return;
    const i = rowAt(e);
    sel = e.shiftKey && sel ? { a: sel.a, b: i } : { a: i, b: i };
    dragging = true;
    pressed = e.shiftKey ? -1 : i;
  }
  function move(e: MouseEvent) {
    if (dragging && sel) sel = { a: sel.a, b: rowAt(e) };
  }
  function up() {
    // While typing, a plain click only focuses, as in a terminal emulator; dragging still selects.
    if (dragging && typing && sel && pressed === sel.a && sel.a === sel.b) sel = null;
    dragging = false;
  }

  function onCopy(e: ClipboardEvent) {
    if (!sel) return;
    const lo = Math.min(sel.a, sel.b);
    const hi = Math.max(sel.a, sel.b);
    const lines: string[] = [];
    for (let i = lo; i <= hi && i < count; i++) lines.push(rowText(i));
    // The empty last row exists to type on; it is not a line of data.
    if (hi >= count - 1 && lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    e.clipboardData?.setData('text/plain', lines.join('\n'));
    e.preventDefault();
  }

  /** Ctrl+wheel sizes the terminal text instead of zooming the whole page. */
  function zoomWheel(e: WheelEvent) {
    if (!e.ctrlKey || e.deltaY === 0) return;
    e.preventDefault();
    prefs.stepTextSize(e.deltaY < 0 ? 1 : -1);
  }

  function onKey(e: KeyboardEvent) {
    if (onkey?.(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      sel = { a: 0, b: count - 1 };
      e.preventDefault();
    } else if (e.key === 'Escape' && sel) {
      // Clearing a selection is all this Esc does; it must not also move focus to the send box.
      sel = null;
      e.stopPropagation();
    }
  }

  export function topRow(): number {
    return Math.max(0, Math.floor((scroller.scrollTop - PAD) / LINE));
  }

  export function focus() {
    scroller.focus();
  }

  export function hasSelection(): boolean {
    return !!sel;
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
    onpointerdown={(e) => (touched = e.pointerType === 'touch')}
    onclick={tapped}
    oncopy={onCopy}
    onpaste={(e) => { if (!onpaste) return; e.preventDefault(); onpaste(e.clipboardData?.getData('text/plain') ?? ''); }}
    class:typing
    class:ime-on={typing && imeFocused}
    onkeydown={onKey}
    onwheel={zoomWheel}
    tabindex="0"
    role="log"
    aria-label="Received data"
  >
    <div style:height="{count * LINE + PAD * 2}px" style:width="{maxChars * charW + PAD * 2}px"></div>
  </div>
  {#if ontext}
    <textarea
      bind:this={ime}
      class="ime"
      aria-label="Type to the device"
      autocapitalize="off"
      autocomplete="off"
      spellcheck="false"
      oninput={imeInput}
      onkeydown={onKey}
      onpaste={(e) => { if (!onpaste) return; e.preventDefault(); onpaste(e.clipboardData?.getData('text/plain') ?? ''); }}
      onfocus={() => (imeFocused = true)}
      onblur={() => (imeFocused = false)}
    ></textarea>
  {/if}
</div>

<style>
  .wrap { position: relative; flex: 1; min-height: 0; overflow: hidden; }
  canvas { position: absolute; inset: 0; }
  .scroller { position: absolute; inset: 0; overflow: auto; outline: none; cursor: text; }
  .scroller.typing:focus, .scroller.ime-on { box-shadow: inset 0 0 0 2px var(--accent); }
  /* Present for the on-screen keyboard but invisible; 16px stops iOS zooming in on focus. */
  .ime { position: absolute; left: 0; bottom: 0; width: 1px; height: 1px; opacity: 0; border: 0; padding: 0; resize: none; font-size: 16px; pointer-events: none; }
</style>

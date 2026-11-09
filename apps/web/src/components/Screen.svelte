<script lang="ts">
  import { onMount } from 'svelte';
  import { Terminal as XTerm } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import { CrNewline } from '@someterm/core';
  import type { Session } from '../lib/session.svelte';
  import { prefs } from '../lib/prefs.svelte';

  /**
   * Full-screen terminal emulation (VT100/xterm) for menus, `top`, editors and
   * anything else that moves the cursor. Fed the raw received bytes; only
   * exists while this view is chosen, so the line log pays nothing for it.
   */
  let { session }: { session: Session } = $props();

  /** Received bytes replayed into a new screen so it opens on the current state, not blank. */
  const BACKFILL = 64 << 10;

  let host: HTMLDivElement;
  let term: XTerm | undefined;
  let fit: FitAddon | undefined;
  const cr = new CrNewline();
  const feed = (c: Uint8Array) => term?.write(session.display.crNewline ? cr.push(c) : c);

  /** Redraws from the received bytes, e.g. after the CR setting changes. */
  function refill() {
    if (!term) return;
    term.reset();
    cr.reset();
    const ring = session.ring;
    const from = Math.max(ring.start, session.hexStart, ring.end - BACKFILL);
    if (ring.end > from) feed(ring.slice(from, ring.end));
  }

  function theme() {
    const cs = getComputedStyle(host);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return { background: v('--panel'), foreground: v('--fg'), cursor: v('--accent'), selectionBackground: v('--sel') };
  }

  export function focus() {
    term?.focus();
  }

  /** A key pressed while the screen did not have focus, sent as if it had. */
  export function type(e: KeyboardEvent) {
    const s = e.key === 'Enter' ? '\r' : e.key === 'Backspace' ? (session.sendOptions.backspace === 'bs' ? '\b' : '\x7f') : e.key === 'Tab' ? '\t' : e.key === 'Escape' ? '\x1b' : [...e.key].length === 1 ? e.key : '';
    if (s && session.open) { e.preventDefault(); void session.sendRaw(new TextEncoder().encode(s)); }
  }

  export function reset() {
    term?.reset();
    cr.reset();
  }

  onMount(() => {
    term = new XTerm({ fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: prefs.textSize, theme: theme(), scrollback: 5000, convertEol: false, allowProposedApi: false });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    refill();

    const off = session.onRaw(feed);
    const keys = term.onData((s) => {
      if (!session.open) return;
      // xterm.js sends DEL for Backspace; follow the connection's Backspace setting.
      if (s === '\x7f' && session.sendOptions.backspace === 'bs') s = '\b';
      // A multi-line paste is paced like one in the line view; a terminal ends lines with CR.
      if (s.length > 1 && /[\r\n]/.test(s) && !s.startsWith('\x1b')) { void session.pasteText(s, '\r'); return; }
      void session.sendRaw(new TextEncoder().encode(s));
    });
    const ro = new ResizeObserver(() => fit?.fit());
    ro.observe(host);
    term.focus();
    return () => { off(); keys.dispose(); ro.disconnect(); term?.dispose(); term = undefined; };
  });

  let lastCr: boolean | undefined;
  $effect(() => {
    const on = session.display.crNewline;
    if (lastCr !== undefined && on !== lastCr) refill();
    lastCr = on;
  });

  $effect(() => {
    void prefs.dark;
    if (term) term.options.theme = theme();
  });

  $effect(() => {
    const size = prefs.textSize;
    if (term && term.options.fontSize !== size) { term.options.fontSize = size; fit?.fit(); }
  });
</script>

<div class="screen" bind:this={host} onwheel={(e) => { if (e.ctrlKey && e.deltaY) { e.preventDefault(); prefs.stepTextSize(e.deltaY < 0 ? 1 : -1); } }}></div>

<style>
  .screen { flex: 1; min-height: 0; padding: 4px 0 0 8px; background: var(--panel); overflow: hidden; }
  .screen :global(.xterm) { height: 100%; }
</style>

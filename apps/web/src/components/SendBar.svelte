<script lang="ts">
  import { CHECKSUMS, parseEscapes, parseHexBytes, toHex } from '@superserial/core';
  import type { Session } from '../lib/session.svelte';
  import { formatBytes } from '../lib/format';

  /** The send options themselves are on the Send tab; this bar shows what they add. */
  let { session }: { session: Session } = $props();

  const HISTORY_MAX = 100;
  let mode = $state<'text' | 'hex'>('text');
  let input = $state('');
  let error = $state('');
  let history: string[] = [];
  let cursor = -1;
  let field: HTMLInputElement | undefined = $state();

  const o = $derived(session.sendOptions);
  /** A recording being replayed has nothing to send to. */
  const canSend = $derived(session.open && !session.player);
  const job = $derived(session.job);

  const preview = $derived.by(() => {
    if (mode !== 'hex' || !input.trim()) return '';
    try { return toHex(parseHexBytes(input)); } catch { return ''; }
  });

  /** Only options that change what gets sent are worth a label. */
  const summary = $derived(
    [
      mode === 'text' && (o.eol ? `+${o.eol.replaceAll('\\r', 'CR ').replaceAll('\\n', 'LF ').trim()}` : 'no line ending'),
      o.checksum !== 'none' && CHECKSUMS.find((c) => c.kind === o.checksum)!.label,
      (o.byteDelayMs || o.lineDelayMs) && 'paced',
      o.rtsWhileSending && 'RTS',
      o.echoWaitMs > 0 && 'echo',
    ].filter(Boolean).join(' · '),
  );
  const sendLabel = $derived(o.repeat === 1 ? 'Send' : o.repeat === 0 ? 'Send ∞' : `Send ×${o.repeat}`);

  export function focus() {
    field?.focus();
  }

  async function send(e: SubmitEvent) {
    e.preventDefault();
    if (job) { session.cancelJob(); return; }
    let payload: Uint8Array;
    try {
      payload = mode === 'hex' ? parseHexBytes(input) : parseEscapes(input);
    } catch (err) {
      error = (err as Error).message;
      return;
    }
    const suffix = mode === 'text' ? parseEscapes(session.sendOptions.eol) : new Uint8Array(0);
    if (input && history[0] !== input) history = [input, ...history].slice(0, HISTORY_MAX);
    cursor = -1;
    const sent = input;
    await session.sendMessage(payload, suffix);
    if (input === sent && o.repeat === 1) input = '';
  }

  function saveQuick() {
    const text = input.trim() ? input : '';
    if (!text) return;
    const label = [...text].length > 16 ? `${[...text].slice(0, 15).join('')}…` : text;
    session.quickSends.push({ id: `q${Date.now().toString(36)}`, label, text, hex: mode === 'hex' });
  }

  function key(e: KeyboardEvent) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!history.length) return;
    e.preventDefault();
    cursor = Math.max(-1, Math.min(history.length - 1, cursor + (e.key === 'ArrowUp' ? 1 : -1)));
    input = cursor < 0 ? '' : history[cursor]!;
  }


  function progressText(j: NonNullable<typeof job>): string {
    if (j.kind === 'repeat') return j.total === 0 ? `Repeating · ${j.done} sent` : `Repeating · ${j.done} / ${j.total}`;
    const pct = j.total ? Math.floor((100 * j.done) / j.total) : 100;
    return `${j.label} · ${formatBytes(j.done)} / ${formatBytes(j.total)} · ${pct}%`;
  }
</script>


<form onsubmit={send}>
  <div class="seg" role="group" aria-label="Send as">
    <button type="button" class:on={mode === 'text'} onclick={() => (mode = 'text')}>Text</button>
    <button type="button" class:on={mode === 'hex'} onclick={() => (mode = 'hex')}>Hex</button>
  </div>
  {#if job}
    <div class="progress" role="status">
      {#if job.kind !== 'repeat' || job.total}<div class="bar" style:width="{job.total ? (100 * job.done) / job.total : 0}%"></div>{/if}
      <span>{progressText(job)}</span>
    </div>
  {:else}
    <input
      bind:this={field}
      bind:value={input}
      oninput={() => (error = '')}
      onkeydown={key}
      placeholder={session.player ? 'Replaying a recording' : mode === 'hex' ? '0D 0A 41' : 'Text, \\r \\n \\xNN'}
      title={mode === 'hex' ? 'Hex bytes separated by spaces or commas' : 'Escapes: \\r \\n \\t \\0 \\\\ \\xNN. ↑/↓ for history'}
      class:bad={!!error}
      disabled={!canSend}
      spellcheck="false"
      autocomplete="off"
    />
  {/if}
  {#if summary && !job}<span class="adds" title="Set on the Send tab">{summary}</span>{/if}
  {#if !job}
    <button type="button" class="star" onclick={saveQuick} disabled={!input.trim()} title="Save as a quick-send button (Alt+1…9 send them)" aria-label="Save as a quick-send button">☆</button>
  {/if}
  <button class="primary" disabled={!canSend}>{job ? 'Stop' : sendLabel}</button>
  {#if error}<span class="err">{error}</span>{:else if preview && !job}<span class="preview">{preview}</span>{/if}
</form>

<style>
  form { display: flex; gap: 6px; align-items: center; padding: 6px 8px; background: var(--panel); border-top: 1px solid var(--line); }
  input:not([type]) { flex: 1; min-width: 8em; font-family: var(--mono); }
  @media (max-width: 520px) { form { gap: 4px; padding: 6px; } input:not([type]) { min-width: 3em; } }
  input.bad { border-color: var(--err); }
  .preview { font: 12px var(--mono); color: var(--muted); }
  .err { font-size: 12px; color: var(--err); }
  .progress { flex: 1; position: relative; height: 26px; border: 1px solid var(--line); border-radius: 5px; overflow: hidden; display: flex; align-items: center; padding: 0 8px; font: 12px var(--mono); }
  .progress .bar { position: absolute; inset: 0 auto 0 0; background: var(--sel); }
  .progress span { position: relative; }
  .adds { font: 11.5px var(--mono); color: var(--muted); white-space: nowrap; }
  @media (max-width: 520px) { .adds { display: none; } }
</style>

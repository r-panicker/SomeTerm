<script lang="ts">
  import { parseEscapes, parseHexBytes, toHex } from '@superserial/core';
  import type { Session } from '../lib/session.svelte';

  let { session }: { session: Session } = $props();

  const HISTORY_MAX = 100;
  let mode = $state<'text' | 'hex'>('text');
  let eol = $state('\r\n');
  let input = $state('');
  let error = $state('');
  let history: string[] = [];
  let cursor = -1;
  let field: HTMLInputElement;

  const preview = $derived.by(() => {
    if (mode !== 'hex' || !input.trim()) return '';
    try { return toHex(parseHexBytes(input)); } catch { return ''; }
  });

  export function focus() {
    field?.focus();
  }

  async function send(e: SubmitEvent) {
    e.preventDefault();
    let bytes: Uint8Array;
    try {
      bytes = mode === 'hex' ? parseHexBytes(input) : parseEscapes(input + eol);
    } catch (err) {
      error = (err as Error).message;
      return;
    }
    await session.send(bytes);
    if (input && history[0] !== input) history = [input, ...history].slice(0, HISTORY_MAX);
    cursor = -1;
    input = '';
  }

  function key(e: KeyboardEvent) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!history.length) return;
    e.preventDefault();
    cursor = Math.max(-1, Math.min(history.length - 1, cursor + (e.key === 'ArrowUp' ? 1 : -1)));
    input = cursor < 0 ? '' : history[cursor]!;
  }
</script>

<form onsubmit={send}>
  <div class="seg" role="group" aria-label="Send as">
    <button type="button" class:on={mode === 'text'} onclick={() => (mode = 'text')}>Text</button>
    <button type="button" class:on={mode === 'hex'} onclick={() => (mode = 'hex')}>Hex</button>
  </div>
  <input
    bind:this={field}
    bind:value={input}
    oninput={() => (error = '')}
    onkeydown={key}
    placeholder={mode === 'hex' ? '0D 0A 41' : 'Text, \\r \\n \\xNN'}
    title={mode === 'hex' ? 'Hex bytes separated by spaces or commas' : 'Escapes: \\r \\n \\t \\0 \\\\ \\xNN. ↑/↓ for history'}
    class:bad={!!error}
    disabled={!session.open}
    spellcheck="false"
    autocomplete="off"
  />
  {#if mode === 'text'}
    <select bind:value={eol} title="Appended to each send">
      <option value={'\r\n'}>+CRLF</option><option value={'\n'}>+LF</option><option value={'\r'}>+CR</option><option value="">none</option>
    </select>
  {/if}
  <button class="primary" disabled={!session.open}>Send</button>
  {#if error}<span class="err">{error}</span>{:else if preview}<span class="preview">{preview}</span>{/if}
</form>

<style>
  form { display: flex; gap: 6px; align-items: center; padding: 6px 8px; background: var(--panel); border-top: 1px solid var(--line); }
  input { flex: 1; min-width: 8em; font-family: var(--mono); }
  input.bad { border-color: var(--err); }
  .preview { font: 12px var(--mono); color: var(--muted); }
  .err { font-size: 12px; color: var(--err); }
</style>

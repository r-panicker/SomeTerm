<script lang="ts">
  import { parseEscapes, parseHexBytes } from '@superserial/core';
  import type { Session } from '../lib/session.svelte';

  /** Editor for a connection's quick-send buttons (Automation tab). */
  let { session }: { session: Session } = $props();

  const newId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  function problem(text: string, hex: boolean): string {
    try {
      if (hex) parseHexBytes(text);
      else parseEscapes(text);
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  }

  function move(i: number, dir: -1 | 1) {
    const list = session.quickSends;
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
</script>

{#each session.quickSends as q, i (q.id)}
  {@const err = problem(q.text, q.hex)}
  <div class="row">
    <span class="key" title={i < 9 ? `Alt+${i + 1}` : ''}>{i < 9 ? i + 1 : ''}</span>
    <input class="label" bind:value={q.label} placeholder="Label" title="Button label" spellcheck="false" />
    <input class="text" class:bad={!!err} bind:value={q.text} placeholder={q.hex ? '0D 0A 41' : 'Text, \\r \\n \\xNN'} title={err || (q.hex ? 'Hex bytes' : 'Sent with the line ending; escapes \\r \\n \\t \\0 \\\\ \\xNN')} spellcheck="false" />
    <button class="toggle" class:on={q.hex} onclick={() => (q.hex = !q.hex)} title="Hex bytes instead of text">Hex</button>
    <button class="mv" onclick={() => move(i, -1)} disabled={i === 0} title="Move left" aria-label="Move left">↑</button>
    <button class="del" onclick={() => session.quickSends.splice(i, 1)} title="Delete" aria-label="Delete">×</button>
  </div>
{/each}

<button class="add" onclick={() => session.quickSends.push({ id: newId(), label: '', text: '', hex: false })} title="Add a quick-send button">+</button>

<style>
  .row { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
  .row input { height: 24px; font: 12px var(--mono); min-width: 0; }
  .key { width: 12px; font-size: 11px; color: var(--muted); text-align: right; }
  .label { width: 7em; }
  .text { flex: 1; }
  .text.bad { border-color: var(--err); }
  .row button { height: 24px; font-size: 12px; padding: 0 6px; }
  .mv, .del { border: 0; background: none; color: var(--muted); }
  .del { font-size: 15px; padding: 0 4px; }
  .add { width: 32px; font-size: 16px; }
</style>

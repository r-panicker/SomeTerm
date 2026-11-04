<script lang="ts">
  import type { Session } from '../lib/session.svelte';

  let { session }: { session: Session } = $props();

  const newId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  function add() {
    session.autoReplies.push({ id: newId(), enabled: true, pattern: '', caseSensitive: false, regex: false, reply: '', delayMs: 0 });
  }

  function regexError(pattern: string): string {
    try {
      new RegExp(pattern);
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  }
</script>

{#each session.autoReplies as r, i (r.id)}
  {@const err = r.regex ? regexError(r.pattern) : ''}
  <div class="reply" class:off={!r.enabled}>
    <div class="line">
      <input type="checkbox" bind:checked={r.enabled} title={r.enabled ? 'On' : 'Off'} aria-label="Enabled" />
      <input class="pattern" class:bad={!!err} bind:value={r.pattern} placeholder="when a line contains…" title={err || 'Matched against each received line, and against a prompt that has no newline yet'} spellcheck="false" />
      <button class="toggle" class:on={r.caseSensitive} onclick={() => (r.caseSensitive = !r.caseSensitive)} title="Match case">Aa</button>
      <button class="toggle" class:on={r.regex} onclick={() => (r.regex = !r.regex)} title="Regular expression; $1…$9 in the reply insert its groups">.*</button>
      <button class="del" onclick={() => session.autoReplies.splice(i, 1)} title="Delete" aria-label="Delete">×</button>
    </div>
    <div class="line">
      <span class="arrow">↩</span>
      <input class="answer" bind:value={r.reply} placeholder="send… (\r \n \xNN)" title="Sent once per matching line. Escapes: \r \n \t \0 \\ \xNN" spellcheck="false" />
      <input class="delay" type="number" min="0" bind:value={r.delayMs} title="Wait this long before replying, ms" /> ms
    </div>
  </div>
{/each}

<button class="add" onclick={add} title="Add an auto-reply">+</button>

<style>
  .reply { border: 1px solid var(--line); border-radius: 6px; padding: 6px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
  .reply.off { opacity: .6; }
  .line { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
  .line input:not([type='checkbox']) { height: 24px; font: 12px var(--mono); min-width: 0; }
  .pattern, .answer { flex: 1; }
  .pattern.bad { border-color: var(--err); }
  .delay { width: 4.5em; }
  .arrow { width: 16px; text-align: center; }
  .line button.toggle { height: 24px; font-size: 12px; padding: 0 6px; }
  .del { border: 0; background: none; color: var(--muted); font-size: 15px; padding: 0 4px; }
  .add { width: 32px; font-size: 16px; }
</style>

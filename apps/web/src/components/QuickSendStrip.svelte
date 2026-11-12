<script lang="ts">
  import type { Session } from '../lib/session.svelte';

  /** One-click sends above the send bar; shown only once a tab has any. */
  let { session, onedit }: { session: Session; onedit: () => void } = $props();
  const canSend = $derived(session.open && !session.player && !session.job);
</script>

<div class="strip" role="toolbar" aria-label="Quick sends">
  {#each session.quickSends as q, i (q.id)}
    <button onclick={() => session.sendQuick(q)} disabled={!canSend || !q.text} title="{q.numbers ? 'Numbers ' : ''}{q.text}{i < 9 ? ` (Alt+${i + 1})` : ''}">{q.label || q.text || '…'}</button>
  {/each}
  <button class="edit" onclick={onedit} title="Edit quick-send buttons" aria-label="Edit quick-send buttons">✎</button>
</div>

<style>
  .strip { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 8px 0; }
  .strip button { height: 24px; font-size: 12px; padding: 0 8px; max-width: 16em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); }
  .edit { color: var(--muted); font-family: inherit !important; }
</style>

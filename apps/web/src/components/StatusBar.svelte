<script lang="ts">
  import type { Session } from '../lib/session.svelte';
  import { formatBytes as bytes } from '../lib/format';

  let { session, onCapture }: { session: Session; onCapture: () => void } = $props();

  const SIGNALS = [['cts', 'CTS'], ['dsr', 'DSR'], ['dcd', 'DCD'], ['ri', 'RI']] as const;
  const show = $derived(session.open || session.rx > 0 || session.tx > 0 || session.errors > 0 || !!session.capture);
</script>

{#if show}
  <footer>
    {#if session.signals}
      {#each SIGNALS as [k, l]}
        <span class="sig" class:on={session.signals[k]} title="{l} input">{l}</span>
      {/each}
    {/if}
    <span class="spacer"></span>
    {#if session.errors}
      <button class="errs" onclick={() => { session.errors = 0; session.lastError = ''; }} title="{session.lastError} (click to reset)">⚠ {session.errors} {session.lastError}</button>
    {/if}
    {#if session.capture}
      {@const c = session.capture}
      <button class="cap" class:rec={c.state === 'running'} onclick={onCapture} title="Capture: {c.name}">
        {c.state === 'running' ? '● REC' : c.state === 'paused' ? '❚❚ REC' : c.kind === 'memory' ? 'Capture' : 'Saved'} {bytes(c.captured)}
      </button>
    {/if}
    <span title="Received">↓ {bytes(session.rx)}{session.open ? ` · ${bytes(Math.round(session.rate))}/s` : ''}</span>
    <span title="Sent">↑ {bytes(session.tx)}</span>
  </footer>
{/if}

<style>
  footer { display: flex; gap: 10px; align-items: center; padding: 2px 8px; font: 11.5px var(--mono); color: var(--muted); background: var(--panel); border-top: 1px solid var(--line); min-height: 22px; }
  .sig::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; background: var(--line); vertical-align: 0; }
  .sig.on { color: var(--fg); }
  .sig.on::before { background: var(--ok); }
  .cap { all: unset; cursor: pointer; }
  .cap.rec { color: var(--err); }
  .errs { all: unset; cursor: pointer; color: var(--err); max-width: 40ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

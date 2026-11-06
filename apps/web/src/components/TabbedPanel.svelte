<script lang="ts" generics="T extends string">
  import type { Snippet } from 'svelte';

  /** RealTerm-style tabs under the terminal: always there, one click away, and folded away by clicking the showing tab. */
  let { tabs, state, children }: { tabs: readonly (readonly [T, string])[]; state: { tab: T; open: boolean; click(t: T): void }; children: Snippet<[T]> } = $props();
</script>

<section class="panel" class:closed={!state.open}>
  <div class="strip" role="tablist" aria-label="Settings">
    {#each tabs as [id, label], i (id)}
      <button role="tab" aria-selected={state.tab === id} aria-expanded={state.tab === id ? state.open : undefined} class:on={state.tab === id} onclick={() => state.click(id)} title="{state.tab === id ? (state.open ? 'Click to fold the panel away' : 'Click to open the panel') : label} (Ctrl+Shift+{i + 1})">{label}</button>
    {/each}
    <span class="spacer"></span>
    <button class="fold" onclick={() => state.click(state.tab)} title="{state.open ? 'Fold the panel away' : 'Open the panel'} (Ctrl+,)" aria-expanded={state.open}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d={state.open ? 'M3.5 6l4.5 4.5L12.5 6' : 'M3.5 10.5L8 6l4.5 4.5'} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      {state.open ? 'Hide' : 'Show'}
    </button>
  </div>
  {#if state.open}
    <div class="body" role="tabpanel">{@render children(state.tab)}</div>
  {/if}
</section>

<style>
  .panel { background: var(--panel); border-top: 1px solid var(--line); display: flex; flex-direction: column; }
  .strip { display: flex; align-items: flex-end; gap: 2px; padding: 4px 8px 0; border-bottom: 1px solid var(--line); background: var(--bg); overflow-x: auto; }
  .panel.closed .strip { border-bottom: 0; }
  .strip button[role='tab'] {
    height: 26px; padding: 0 12px; font-size: 12.5px; border: 1px solid var(--line); border-bottom: 0;
    border-radius: 6px 6px 0 0; background: var(--bg); color: var(--muted); margin-bottom: -1px; white-space: nowrap;
  }
  .strip button[role='tab'].on { background: var(--panel); color: var(--fg); font-weight: 600; border-bottom: 1px solid var(--panel); }
  .panel.closed .strip button[role='tab'].on { border-bottom: 1px solid var(--line); }
  .strip button[role='tab']:hover { color: var(--fg); }
  .fold { display: flex; align-items: center; gap: 3px; height: 24px; padding: 0 10px 0 6px; margin-bottom: 3px; font-size: 12.5px; flex-shrink: 0; }
  .fold:hover { border-color: var(--muted); }
  .body { height: 210px; overflow: auto; padding: 8px 10px 10px; }
  @media (max-height: 640px) { .body { height: 160px; } }
  @media (max-width: 700px) { .body { height: 38vh; } .strip button[role='tab'] { padding: 0 8px; } }
</style>

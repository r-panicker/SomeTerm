<script lang="ts">
  import { compileExpr } from '@superserial/core';
  import type { Session } from '../../lib/session.svelte';

  /** Per-series conversions; used by the plot's ƒx popover and the Settings panel. */
  let { session, colors }: { session: Session; colors: readonly string[] } = $props();

  // Names are plain data; the version tick keeps the list current.
  const names = $derived.by(() => (void session.version, [...session.series.names]));

  function error(expr: string): string {
    if (!expr.trim()) return '';
    try { compileExpr(expr); return ''; } catch (e) { return (e as Error).message; }
  }

  function set(name: string, patch: Partial<{ expr: string; unit: string }>) {
    const t = { expr: '', unit: '', ...session.plotTransforms[name], ...patch };
    if (!t.expr.trim() && !t.unit.trim()) delete session.plotTransforms[name];
    else session.plotTransforms[name] = t;
  }
</script>

<div class="fx">
  {#each names as n, i (n)}
    {@const err = error(session.plotTransforms[n]?.expr ?? '')}
    <span class="sname" style:color={colors[i % colors.length]}>{n}</span>
    <input
      class="expr"
      class:bad={!!err}
      value={session.plotTransforms[n]?.expr ?? ''}
      oninput={(e) => set(n, { expr: e.currentTarget.value })}
      placeholder="x"
      title={err || 'Expression in x, e.g. x*3.3/4095 or (x-500)/10. Functions: abs sqrt exp ln log sin cos tan min max pow round'}
      spellcheck="false"
    />
    <input class="unit" value={session.plotTransforms[n]?.unit ?? ''} oninput={(e) => set(n, { unit: e.currentTarget.value })} placeholder="unit" maxlength="16" />
  {:else}
    <span class="none">No series yet</span>
  {/each}
</div>

<style>
  .fx { display: grid; grid-template-columns: auto 1fr 5em; gap: 6px 8px; align-items: center; }
  .sname { font: 600 12px var(--mono); max-width: 12ch; overflow: hidden; text-overflow: ellipsis; }
  input { height: 24px; font: 12px var(--mono); min-width: 0; }
  .expr.bad { border-color: var(--err); }
  .none { grid-column: 1 / -1; color: var(--muted); font-size: 12px; }
</style>

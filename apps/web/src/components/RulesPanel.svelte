<script lang="ts">
  import { RULE_COLOR_NAMES, ruleText, rules } from '../lib/rules.svelte';
  import { prefs } from '../lib/prefs.svelte';

  let picking = $state<string | null>(null);
  let dragFrom = $state<number | null>(null);
  let dropAt = $state<number | null>(null);
  const dark = $derived(prefs.dark);

  function drop(i: number) {
    if (dragFrom !== null) rules.move(dragFrom, i);
    dragFrom = null;
    dropAt = null;
  }
</script>

{#each rules.list as r, i (r.id)}
  {@const err = rules.compiled[i]?.error}
  <div
    class="rule"
    class:drop={dropAt === i && dragFrom !== i}
    role="listitem"
    ondragover={(e) => { e.preventDefault(); dropAt = i; }}
    ondrop={() => drop(i)}
  >
    <span class="handle" draggable="true" role="button" tabindex="-1" aria-label="Drag to reorder" title="Drag to reorder; earlier rules win where they overlap" ondragstart={() => (dragFrom = i)} ondragend={() => { dragFrom = null; dropAt = null; }}>⋮⋮</span>
    <button class="swatch" style:background={ruleText(r.color, dark)} onclick={() => (picking = picking === r.id ? null : r.id)} title="Colour: {RULE_COLOR_NAMES[r.color]}" aria-label="Colour"></button>
    <input
      class="pattern"
      class:bad={!!err}
      value={r.pattern}
      oninput={(e) => rules.update(r.id, { pattern: e.currentTarget.value })}
      placeholder="text or pattern"
      title={err || r.pattern}
      spellcheck="false"
    />
    <button class="toggle" class:on={r.caseSensitive} onclick={() => rules.update(r.id, { caseSensitive: !r.caseSensitive })} title="Match case">Aa</button>
    <button class="toggle" class:on={r.regex} onclick={() => rules.update(r.id, { regex: !r.regex })} title="Regular expression">.*</button>
    <div class="seg" role="group" aria-label="Colour the line or the match">
      <button class:on={r.mode === 'line'} onclick={() => rules.update(r.id, { mode: 'line' })} title="Tint the whole line">Line</button>
      <button class:on={r.mode === 'match'} onclick={() => rules.update(r.id, { mode: 'match' })} title="Colour the matched text">Match</button>
    </div>
    <button class="del" onclick={() => rules.remove(r.id)} title="Delete rule" aria-label="Delete rule">×</button>
    {#if picking === r.id}
      <div class="palette">
        {#each RULE_COLOR_NAMES as name, c}
          <button class="swatch" class:sel={r.color === c} style:background={ruleText(c, dark)} onclick={() => { rules.update(r.id, { color: c }); picking = null; }} title={name} aria-label={name}></button>
        {/each}
      </div>
    {/if}
  </div>
{/each}

<div class="actions">
  <button onclick={() => rules.add({ pattern: '', caseSensitive: false, regex: false, mode: 'match' })}>+ Add rule</button>
  <button onclick={() => rules.addCommon()} title="Errors red, warnings amber, OK/pass green">Add common rules</button>
</div>

<style>
  .rule { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px 0; border-top: 2px solid transparent; }
  .rule.drop { border-top-color: var(--accent); }
  .handle { cursor: grab; color: var(--muted); user-select: none; padding: 0 2px; letter-spacing: -2px; }
  .swatch { width: 18px; height: 18px; padding: 0; border-radius: 4px; border: 1px solid var(--line); flex: none; }
  .swatch.sel { outline: 2px solid var(--fg); outline-offset: 1px; }
  .pattern { flex: 1; min-width: 6em; height: 24px; font: 12px var(--mono); }
  .pattern.bad { border-color: var(--err); }
  .rule button.toggle, .seg button { height: 24px; font-size: 12px; padding: 0 6px; }
  .del { border: 0; background: none; color: var(--muted); font-size: 15px; padding: 0 4px; }
  .palette { flex-basis: 100%; display: flex; gap: 6px; padding: 4px 0 2px 22px; }
  .actions { display: flex; gap: 6px; margin-top: 10px; }
</style>

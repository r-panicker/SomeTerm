<script lang="ts">
  import type { NewlineMode } from '@superserial/core';
  import type { TermSource } from '../../lib/source';

  /** Terminal view options; used by the terminal's ⋯ menu and the Settings panel. */
  let { source }: { source: TermSource } = $props();
  const disp = $derived(source.display);
</script>

{#if source.setNewline}
  <label class="row">Line ending
    <select value={source.newline} onchange={(e) => source.setNewline?.(e.currentTarget.value as NewlineMode)} title="Auto: CR, LF or CRLF each end a line">
      <option value="auto">Auto</option><option value="lf">LF</option><option value="cr">CR</option><option value="crlf">CRLF</option>
    </select>
  </label>
{/if}
<label class="check"><input type="checkbox" bind:checked={disp.stamps} /> Timestamps</label>
<label class="check" title="Off: show escape codes as ␛[…"><input type="checkbox" bind:checked={disp.ansi} /> ANSI colours</label>
<label class="check" title="Show CR, LF, TAB, NUL and every other non-printing byte, line endings included"><input type="checkbox" bind:checked={disp.ctrl} /> Control characters</label>
{#if source.typeKeys}
  <label class="check" title="Show what you type in Type mode; leave off for devices that echo"><input type="checkbox" checked={source.localEcho} onchange={(e) => (source.localEcho = e.currentTarget.checked)} /> Local echo while typing</label>
{/if}
{#if source.echo !== undefined}
  <label class="check" title="Show what you send, as → lines"><input type="checkbox" checked={source.echo} onchange={(e) => (source.echo = e.currentTarget.checked)} /> Show sent data</label>
{/if}

<style>
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); }
  .check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
</style>

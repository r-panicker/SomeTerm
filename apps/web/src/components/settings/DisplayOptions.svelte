<script lang="ts">
  import type { NewlineMode } from '@someterm/core';
  import type { TermSource } from '../../lib/source';

  /** Terminal view options (Display tab, for connections and the Monitor). */
  let { source }: { source: TermSource } = $props();
  const disp = $derived(source.display);
</script>

{#if source.setNewline}
  <label class="row">Received line ending
    <select value={source.newline} onchange={(e) => source.setNewline?.(e.currentTarget.value as NewlineMode)} title="What ends a received line. What you send (and Enter when typing) uses the send bar's line ending">
      <option value="auto">CR, LF or CR+LF</option><option value="lf">LF</option><option value="cr">CR</option><option value="crlf">CR+LF</option>
    </select>
  </label>
{/if}
<label class="check"><input type="checkbox" bind:checked={disp.stamps} /> Timestamps</label>
<label class="check" title="Long lines continue on the next row instead of scrolling sideways"><input type="checkbox" bind:checked={disp.wrap} /> Wrap long lines</label>
<label class="check" title="Off: show escape codes as ␛[…"><input type="checkbox" bind:checked={disp.ansi} /> ANSI colours</label>
<label class="check" title="Show CR, LF, TAB, NUL and every other non-printing byte, line endings included"><input type="checkbox" bind:checked={disp.ctrl} /> Control characters</label>
{#if source.typeKeys}
  <label class="check" title="Keys pressed in the terminal go to the device, like a terminal emulator. Ctrl+Shift keeps app shortcuts"><input type="checkbox" checked={source.typeToDevice} onchange={(e) => (source.typeToDevice = e.currentTarget.checked)} /> Keyboard to device</label>
  <label class="check" title="Show what you type and send; leave off for devices that echo"><input type="checkbox" checked={source.localEcho} onchange={(e) => (source.localEcho = e.currentTarget.checked)} /> Local echo</label>
{/if}

<style>
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
</style>

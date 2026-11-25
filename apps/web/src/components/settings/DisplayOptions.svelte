<script lang="ts">
  import type { NewlineMode } from '@someterm/core';
  import type { TermSource } from '../../lib/source';

  /** Terminal view options (Display tab, for connections and the Monitor). */
  let { source }: { source: TermSource } = $props();
  const disp = $derived(source.display);
</script>

{#if source.setNewline}
  <fieldset class="ending" disabled={disp.ctrl} title={disp.ctrl ? 'Turn Control characters off to choose a line ending: with them on, every byte is shown and rows fill the width' : undefined}>
    <label class="row">Received line ending
      <select value={source.newline} onchange={(e) => source.setNewline?.(e.currentTarget.value as NewlineMode)} title={disp.ctrl ? undefined : "What ends a received line. What you send (and Enter when typing) uses the send bar's line ending"}>
        <option value="auto">CR, LF or CR+LF</option><option value="lf">LF</option><option value="cr">CR</option><option value="crlf">CR+LF</option>
      </select>
    </label>
  </fieldset>
{/if}
<label class="check"><input type="checkbox" bind:checked={disp.stamps} /> Timestamps</label>
<label class="check" title="Long lines continue on the next row instead of scrolling sideways"><input type="checkbox" bind:checked={disp.wrap} /> Wrap long lines</label>
<label class="check" title="Off: show escape codes as ␛[…"><input type="checkbox" bind:checked={disp.ansi} /> ANSI colours</label>
<label class="check" title="Show every byte: CR, LF, TAB, NUL and other non-printing bytes as [CR] [LF] [TAB] [NUL], Backspace not applied. Rows fill the width instead of ending at line endings"><input type="checkbox" bind:checked={disp.ctrl} /> Control characters</label>
{#if source.typeKeys}
  <label class="check" title="Keys pressed in the terminal go to the device, like a terminal emulator. Ctrl+Shift keeps app shortcuts"><input type="checkbox" checked={source.typeToDevice} onchange={(e) => (source.typeToDevice = e.currentTarget.checked)} /> Keyboard to device</label>
  <label class="check" title="Show what you type and send; leave off for devices that echo"><input type="checkbox" checked={source.localEcho} onchange={(e) => (source.localEcho = e.currentTarget.checked)} /> Local echo</label>
{/if}

<style>
  .ending { border: 0; padding: 0; margin: 0; min-width: 0; grid-column: 1 / -1; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
</style>

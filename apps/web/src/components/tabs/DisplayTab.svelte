<script lang="ts">
  import { NUM_TYPES, numInfo } from '@someterm/core';
  import type { DisplayFormat, TermSource } from '../../lib/source';
  import type { Session } from '../../lib/session.svelte';
  import DisplayOptions from '../settings/DisplayOptions.svelte';

  /** `session` is absent for the Monitor, which has no raw stream to show bytes or a screen from. */
  let { source, session }: { source: TermSource; session?: Session } = $props();
  const disp = $derived(source.display);
  const size = $derived(numInfo(disp.numType).size);

  const FORMATS: [DisplayFormat, string, string][] = [
    ['ascii', 'ASCII', 'Text, line by line'],
    ['hex', 'Hex', 'Every byte in hexadecimal, with the text alongside'],
    ['dec', 'Dec', 'Every byte as a decimal number, 0 to 255'],
    ['bin', 'Bin', 'Every byte in binary'],
    ['num', 'Int/Float', 'Groups of bytes decoded as 8, 16 or 32-bit integers or 32/64-bit floats'],
    ['screen', 'xterm', 'Terminal emulator (VT100/xterm): the device draws the screen, for menus, top and editors. Keys always go to the device'],
  ];
  const formats = $derived(source.ring ? FORMATS.filter(([f]) => f !== 'screen' || session) : FORMATS.filter(([f]) => f === 'ascii'));
  const xterm = $derived(disp.format === 'screen');
  // A smaller type cannot keep an alignment it does not have.
  $effect(() => { if (disp.align >= size) disp.align = 0; });
</script>

<div class="groups">
  <fieldset>
    <legend>Display as</legend>
    <div class="seg" role="group" aria-label="Display as">
      {#each formats as [f, label, title] (f)}
        <button class:on={disp.format === f} onclick={() => (disp.format = f)} {title}>{label}</button>
      {/each}
    </div>
    {#if disp.format === 'num'}
      <div class="row">
        <select bind:value={disp.numType} title="Value type">{#each NUM_TYPES as n}<option value={n.type}>{n.type}</option>{/each}</select>
        {#if size > 1}
          <div class="seg" role="group" aria-label="Byte order">
            <button class:on={disp.littleEndian} onclick={() => (disp.littleEndian = true)} title="Little endian: least significant byte first, as most microcontrollers send">LE</button>
            <button class:on={!disp.littleEndian} onclick={() => (disp.littleEndian = false)} title="Big endian: most significant byte first">BE</button>
          </div>
          <select bind:value={disp.align} title="Skip bytes until values line up with the sender's framing">
            {#each Array.from({ length: size }, (_, i) => i) as a}<option value={a}>skip {a}</option>{/each}
          </select>
        {/if}
      </div>
    {/if}
    {#if disp.format !== 'ascii' && disp.format !== 'screen'}
      <label class="row">Bytes per row
        <select bind:value={disp.perRow} title="Bin shows half as many">{#each [8, 16, 32] as n}<option value={n}>{n}</option>{/each}</select>
      </label>
    {/if}
  </fieldset>

  <fieldset class="text">
    <legend>Text and typing</legend>
    <fieldset class="bare" disabled={xterm} title={xterm ? 'Not applicable in xterm mode: the device controls what the screen shows' : undefined}>
      <div class="checks cols"><DisplayOptions {source} /></div>
    </fieldset>
    {#if session}
      <label class="row">Backspace sends
        <select bind:value={session.sendOptions.backspace} title="What the Backspace key sends when typing to the device; many Linux consoles expect DEL">
          <option value="bs">BS (0x08)</option><option value="del">DEL (0x7F)</option>
        </select>
      </label>
    {/if}
  </fieldset>
</div>

<style>
  .row { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12.5px; }
  .text { flex: 1 1 360px; }
  .bare { border: 0; padding: 0; margin: 0; min-width: 0; }
  .bare:disabled :global(label) { opacity: .45; cursor: default; }
  .cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, max-content)); column-gap: 18px; row-gap: 5px; }
  .cols :global(.row) { grid-column: 1 / -1; justify-content: flex-start; }
  .seg button { height: 26px; font-size: 12.5px; }
</style>

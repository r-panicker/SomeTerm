<script lang="ts">
  import { NUM_TYPES, numInfo, parseHexBytes } from '@someterm/core';
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
  ];
  const formats = $derived(source.ring ? FORMATS : FORMATS.filter(([f]) => f === 'ascii'));
  const xterm = $derived(disp.format === 'screen');
  const syncProblem = $derived.by(() => {
    if (disp.frame !== 'sync') return '';
    if (!disp.frameSync.trim()) return 'Type the hex bytes that start each frame';
    try { parseHexBytes(disp.frameSync); return ''; } catch (e) { return (e as Error).message; }
  });
  const framed = $derived(disp.frame === 'gap' || (disp.frame === 'sync' && !syncProblem));
  /** Why the terminal's settings do nothing in the current view, or ''. */
  const off = $derived(session?.view === 'plot' ? 'Not available in Plot view' : '');
  const xtermOff = $derived(off || (xterm ? 'Not available in xterm mode' : ''));
  // A smaller type cannot keep an alignment it does not have.
  $effect(() => { if (disp.align >= size) disp.align = 0; });
</script>

<div class="groups">
  <fieldset disabled={!!xtermOff} title={xtermOff || undefined}>
    <legend>Display as</legend>
    <div class="seg" role="group" aria-label="Display as">
      {#each formats as [f, label, title] (f)}
        <button class:on={disp.format === f && !xterm} onclick={() => (disp.format = f)} {title}>{label}</button>
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
          <select bind:value={disp.align} disabled={framed} title={framed ? 'Each frame starts aligned; not used when rows are cut into frames' : "Skip bytes until values line up with the sender's framing"}>
            {#each Array.from({ length: size }, (_, i) => i) as a}<option value={a}>skip {a}</option>{/each}
          </select>
        {/if}
      </div>
    {/if}
    {#if disp.format !== 'ascii' && disp.format !== 'screen'}
      <div class="row">
        <label class="inline">Bytes per row
          <select bind:value={disp.perRow} title="Bin shows half as many; a longer frame continues on the next row">{#each [8, 16, 32] as n}<option value={n}>{n}</option>{/each}</select>
        </label>
        <label class="inline">New row
          <select bind:value={disp.frame} title="Start each frame (packet) on its own row, so packets line up and can be told apart">
            <option value="none">when full</option>
            <option value="gap">after a pause</option>
            <option value="sync">at sync bytes</option>
          </select>
        </label>
        {#if disp.frame === 'gap'}
          <input class="num" type="number" min="1" max="60000" value={disp.frameGapMs} onchange={(e) => { const v = Number(e.currentTarget.value); if (v > 0 && v <= 60000) disp.frameGapMs = v; else e.currentTarget.value = String(disp.frameGapMs); }} title="A pause in received data of at least this long starts a new frame. Data arrives in chunks, so very short pauses at high baud rates are approximate" aria-label="Pause in ms" /> ms
        {:else if disp.frame === 'sync'}
          <input class="sync" class:bad={!!syncProblem} bind:value={disp.frameSync} placeholder="AA 55" spellcheck="false" title={syncProblem || 'Hex bytes that start every frame, e.g. AA 55 or 0x7E'} aria-label="Sync bytes" />
        {/if}
      </div>
    {/if}
  </fieldset>

  <fieldset class="text" disabled={!!off} title={off || undefined}>
    <legend>Text and typing</legend>
    <fieldset class="bare" disabled={!!xtermOff} title={xtermOff || undefined}>
      <div class="checks cols"><DisplayOptions {source} /></div>
    </fieldset>
    {#if session}
      {#if xterm}
        <label class="check row" title="For devices that end lines with CR alone, so each line does not overwrite the last. CR LF still gives one new line; a progress line redrawn with CR scrolls instead"><input type="checkbox" bind:checked={disp.crNewline} /> New line on received CR</label>
      {/if}
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
  .cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, max-content)); column-gap: 18px; row-gap: 5px; }
  .cols :global(.row) { grid-column: 1 / -1; justify-content: flex-start; }
  .seg button { height: 26px; font-size: 12.5px; }
  .inline { display: flex; align-items: center; gap: 6px; }
  .row .num { width: 5em; }
  .row .sync { width: 8em; font-family: var(--mono); }
  .bad { border-color: var(--err); }
</style>

<script lang="ts">
  import { parseEscapes, parseNumbers, XMODEM_MODES } from '@someterm/core';
  import { defaultSendField, type Session } from '../../lib/session.svelte';
  import { formatBytes } from '../../lib/format';
  import SendOptions from '../settings/SendOptions.svelte';
  import LineEnding from '../LineEnding.svelte';
  import QuickSendPanel from '../QuickSendPanel.svelte';

  let { session }: { session: Session } = $props();
  const canSend = $derived(session.open && !session.player);
  const xterm = $derived(session.display.format === 'screen' && session.view !== 'plot');
  const job = $derived(session.job);
  let fileInput: HTMLInputElement | undefined = $state();
  let quickEditor: QuickSendPanel | undefined = $state();

  /** Why a line cannot be sent as ASCII / as numbers, or ''. */
  function problem(text: string, as: 'ascii' | 'numbers'): string {
    try { if (as === 'numbers') parseNumbers(text); else parseEscapes(text); return ''; } catch (e) { return (e as Error).message; }
  }
</script>

<div class="groups">
  <div class="commands">
    <fieldset aria-label="Quick-send buttons" disabled={xterm} title={xterm ? 'Not available in xterm mode, where keys go straight to the device' : undefined}>
      <legend>Quick-send buttons <span class="hint">Alt+1…9</span><button class="quick-add" disabled={xterm} onclick={() => quickEditor?.add()} title="Add a quick-send button" aria-label="Add a quick-send button">+</button></legend>
      <QuickSendPanel bind:this={quickEditor} {session} />
    </fieldset>
    <fieldset class="lines" disabled={xterm} title={xterm ? 'Not available in xterm mode, where keys go straight to the device; Send file still works, e.g. for loady' : undefined}>
      <legend>Send lines</legend>
      {#each session.sendFields as field, i (i)}
        {@const numErr = problem(field.text, 'numbers')}
        {@const ascErr = problem(field.text, 'ascii')}
        <div class="line">
          <input bind:value={field.text} spellcheck="false" placeholder={i === 0 ? 'AT\\r or 0x41 66 $42' : ''} aria-label="Send line {i + 1}" onkeydown={(e) => { if (e.key === 'Enter' && canSend) { e.preventDefault(); void session.sendField(i, e.shiftKey ? 'numbers' : 'ascii'); } }} title="Enter sends as ASCII, Shift+Enter as numbers" />
          <LineEnding bind:eol={field.eol} label="Send line {i + 1} ending" />
          <button disabled={!canSend || !!job || !!ascErr} title={ascErr || `As text: escapes \\r \\n \\t \\xNN work; adds ${field.eol ? field.eol.replaceAll('\\r', 'CR').replaceAll('\\n', 'LF') : 'no line ending'}`} onclick={() => session.sendField(i, 'ascii')}>Send ASCII</button>
          <button disabled={!canSend || !!job || !!numErr || !field.text.trim()} title={numErr || 'As bytes: 65 0x41 $41 41h 0b1000001 \'A\' are all 0x41; no line ending'} onclick={() => session.sendField(i, 'numbers')}>Send Numbers</button>
        </div>
      {/each}
      <div class="foot">
        {#if session.sendFields.length < 16}<button class="add" onclick={() => session.sendFields.push(defaultSendField())} title="Another line">+</button>{/if}
        {#if session.sendFields.length > 2}<button class="add" onclick={() => session.sendFields.pop()} title="Remove the last line">−</button>{/if}
      </div>
    </fieldset>
  </div>

  <fieldset>
    <legend>Framing and timing</legend>
    <div class="form"><SendOptions {session} /></div>
  </fieldset>

  <fieldset>
    <legend>File</legend>
    <div class="file">
      <button onclick={() => fileInput?.click()} disabled={!!job} title="Choose a file; nothing is sent until you press Send file">Choose file…</button>
      <span class="fname" title={session.fileToSend?.name ?? ''}>{session.fileToSend ? `${session.fileToSend.name} · ${formatBytes(session.fileToSend.size)}` : 'none chosen'}</span>
    </div>
    <div class="file">
      <select bind:value={session.sendOptions.fileProtocol} disabled={!!job} title="Raw sends the bytes as they are, paced by the delays. XMODEM and YMODEM wait for the receiver (a bootloader, U-Boot loadx/loady) to ask, then send checked blocks">
        <option value="raw">Raw</option>
        {#each XMODEM_MODES as m}<option value={m.mode}>{m.label}</option>{/each}
      </select>
      {#if job?.kind === 'file'}
        <button class="primary" onclick={() => session.cancelJob()}>Stop</button>
      {:else}
        <button class="primary" disabled={!canSend || !session.fileToSend || !!job} onclick={() => session.fileToSend && session.sendFile(session.fileToSend)}>Send file</button>
      {/if}
    </div>
    <input bind:this={fileInput} type="file" hidden onchange={() => { const f = fileInput?.files?.[0]; if (fileInput) fileInput.value = ''; if (f) session.fileToSend = f; }} />
  </fieldset>
</div>

<style>
  .commands { display: flex; flex-direction: column; gap: 10px; flex: 1 1 400px; min-width: 0; }
  .commands > fieldset { border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px 8px; margin: 0; min-width: 0; }
  .commands legend { font-size: 11.5px; font-weight: 600; color: var(--muted); padding: 0 4px; }
  .hint { font-weight: 400; }
  .quick-add { height: 18px; width: 24px; padding: 0; margin-left: 6px; line-height: 1; vertical-align: middle; }
  .foot { display: flex; align-items: center; gap: 10px; font-size: 12.5px; }
  .line { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
  .line > input { flex: 1; min-width: 6em; font-family: var(--mono); height: 25px; }
  .line button { height: 25px; font-size: 12px; white-space: nowrap; }
  .add { width: 28px; height: 24px; padding: 0; }
  .file { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; font-size: 12.5px; }
  .fname { color: var(--muted); max-width: 18em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

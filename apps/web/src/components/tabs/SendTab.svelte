<script lang="ts">
  import { parseEscapes, parseNumbers, XMODEM_MODES } from '@someterm/core';
  import type { Session } from '../../lib/session.svelte';
  import { formatBytes } from '../../lib/format';
  import SendOptions from '../settings/SendOptions.svelte';

  let { session }: { session: Session } = $props();
  const canSend = $derived(session.open && !session.player);
  const job = $derived(session.job);
  const eol = $derived(session.sendOptions.eol);
  const cr = $derived(eol.includes('\\r'));
  const lf = $derived(eol.includes('\\n'));
  let fileInput: HTMLInputElement | undefined = $state();

  function setEol(withCr: boolean, withLf: boolean) {
    session.sendOptions.eol = `${withCr ? '\\r' : ''}${withLf ? '\\n' : ''}`;
  }

  /** Why a line cannot be sent as ASCII / as numbers, or ''. */
  function problem(text: string, as: 'ascii' | 'numbers'): string {
    try { if (as === 'numbers') parseNumbers(text); else parseEscapes(text); return ''; } catch (e) { return (e as Error).message; }
  }
</script>

<div class="groups">
  <fieldset class="lines">
    <legend>Send lines</legend>
    {#each session.sendFields as _, i (i)}
      {@const numErr = problem(session.sendFields[i] ?? '', 'numbers')}
      {@const ascErr = problem(session.sendFields[i] ?? '', 'ascii')}
      <div class="line">
        <input bind:value={session.sendFields[i]} spellcheck="false" placeholder={i === 0 ? 'AT\\r or 0x41 66 $42' : ''} aria-label="Send line {i + 1}" onkeydown={(e) => { if (e.key === 'Enter' && canSend) { e.preventDefault(); void session.sendField(i, e.shiftKey ? 'numbers' : 'ascii'); } }} title="Enter sends as ASCII, Shift+Enter as numbers" />
        <button disabled={!canSend || !!job || !!ascErr} title={ascErr || `As text: escapes \\r \\n \\t \\xNN work; adds ${cr || lf ? `${cr ? 'CR' : ''}${lf ? 'LF' : ''}` : 'no line ending'}`} onclick={() => session.sendField(i, 'ascii')}>Send ASCII</button>
        <button disabled={!canSend || !!job || !!numErr || !session.sendFields[i]?.trim()} title={numErr || 'As bytes: 65 0x41 $41 41h 0b1000001 \'A\' are all 0x41; no line ending'} onclick={() => session.sendField(i, 'numbers')}>Send Numbers</button>
      </div>
    {/each}
    <div class="foot">
      {#if session.sendFields.length < 16}<button class="add" onclick={() => session.sendFields.push('')} title="Another line">+</button>{/if}
      <span class="spacer"></span>
      <span title="Added after Send ASCII, the send bar's text, and Enter when typing in the terminal">ASCII line ending</span>
      <label class="check"><input type="checkbox" checked={cr} onchange={(e) => setEol(e.currentTarget.checked, lf)} /> +CR</label>
      <label class="check"><input type="checkbox" checked={lf} onchange={(e) => setEol(cr, e.currentTarget.checked)} /> +LF</label>
    </div>
  </fieldset>

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
  .lines { flex: 1 1 300px; }
  .foot { display: flex; align-items: center; gap: 10px; font-size: 12.5px; }
  .line { display: flex; gap: 4px; margin-bottom: 4px; }
  .line input { flex: 1; min-width: 6em; font-family: var(--mono); height: 25px; }
  .line button { height: 25px; font-size: 12px; white-space: nowrap; }
  .add { width: 28px; height: 24px; padding: 0; }
  .file { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; font-size: 12.5px; }
  .fname { color: var(--muted); max-width: 18em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

<script lang="ts">
  import { CHECKSUMS, XMODEM_MODES } from '@superserial/core';
  import type { Session } from '../../lib/session.svelte';

  /** Rows for a `.form` grid; used by the send bar's ⋯ options and the Settings panel. */
  let { session, onfile }: { session: Session; onfile?: () => void } = $props();

  const o = $derived(session.sendOptions);
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  const canSend = $derived(session.open && !session.player);
</script>

<label>Checksum
  <select bind:value={session.sendOptions.checksum}>
    {#each CHECKSUMS as c}<option value={c.kind} title={c.detail}>{c.label}</option>{/each}
  </select>
</label>
<label>Repeat
  <span class="pair">
    <input type="number" min="0" value={o.repeat} oninput={(e) => (session.sendOptions.repeat = num(e.currentTarget.value))} title="Times to send; 0 = until stopped" />
    every
    <input type="number" min="0" value={o.intervalMs} oninput={(e) => (session.sendOptions.intervalMs = num(e.currentTarget.value))} disabled={o.repeat === 1} title="Milliseconds from the start of one send to the next" /> ms
  </span>
</label>
<label>Delay
  <span class="pair">
    <input type="number" min="0" value={o.byteDelayMs} oninput={(e) => (session.sendOptions.byteDelayMs = num(e.currentTarget.value))} title="Pause after every byte, ms" /> ms/byte
    <input type="number" min="0" value={o.lineDelayMs} oninput={(e) => (session.sendOptions.lineDelayMs = num(e.currentTarget.value))} title="Pause after every line ending, ms" /> ms/line
  </span>
</label>
{#if onfile}
  <span>File</span>
  <span class="pair">
    <select bind:value={session.sendOptions.fileProtocol} title="Raw sends the bytes as they are, paced by the delays above. XMODEM and YMODEM wait for the receiver (a bootloader, U-Boot loadx/loady) to ask, then send checked blocks">
      <option value="raw">Raw</option>
      {#each XMODEM_MODES as m}<option value={m.mode}>{m.label}</option>{/each}
    </select>
    <button type="button" class="action filebtn" onclick={onfile} disabled={!canSend}>Send file…</button>
  </span>
{/if}
<label>Echo wait
  <span class="pair">
    <input type="number" min="0" value={o.echoWaitMs} oninput={(e) => (session.sendOptions.echoWaitMs = num(e.currentTarget.value))} title="Send one byte at a time and wait up to this long for the device to echo it; 0 = off" /> ms per byte
  </span>
</label>
<label>Half duplex
  <span class="pair">
    <input type="checkbox" bind:checked={session.sendOptions.rtsWhileSending} disabled={!session.capabilities.lineSignals || !session.lineControl} title={session.lineControl ? '' : 'This port has no modem control lines'} />
    raise RTS while sending
  </span>
</label>

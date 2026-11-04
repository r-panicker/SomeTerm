<script lang="ts">
  import { unsupportedOptions, type SerialOptions } from '@superserial/core';
  import type { Session } from '../../lib/session.svelte';
  import type { Workspace } from '../../lib/workspace.svelte';

  /** Rows for a `.form` grid; used by the settings chip and the Settings panel. */
  let { session, workspace }: { session: Session; workspace: Workspace } = $props();

  const BAUDS = [300, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 57600, 74880, 115200, 230400, 250000, 460800, 500000, 921600, 1000000, 1500000, 2000000, 3000000];
  const PARITY = ['none', 'even', 'odd', 'mark', 'space'] as const;
  const FLOW = { none: 'none', rtscts: 'RTS/CTS', dsrdtr: 'DSR/DTR', xonxoff: 'XON/XOFF' } as const;
  /** "Other…" chosen, or a rate that is not in the list: show the box for typing one. */
  let custom = $state(false);
  const showCustom = $derived(custom || !BAUDS.includes(session.options.baudRate));

  const others = $derived(workspace.sessions.filter((o) => o !== session));
  const locked = $derived(session.open ? 'Disconnect to change port settings' : '');
  const why = (patch: Partial<SerialOptions>) => unsupportedOptions(session.capabilities, { ...session.options, ...patch })[0] ?? '';
  const canBreak = $derived(session.open && session.capabilities.sendBreak && !session.player);

  function baudInput(e: Event & { currentTarget: HTMLInputElement }) {
    const n = Number(e.currentTarget.value);
    if (Number.isInteger(n) && n >= 50 && n <= 20_000_000) session.options.baudRate = n;
    else e.currentTarget.value = String(session.options.baudRate);
  }

  function baudPick(e: Event & { currentTarget: HTMLSelectElement }) {
    const v = e.currentTarget.value;
    custom = v === 'other';
    if (!custom) session.options.baudRate = Number(v);
  }
</script>

<label>Baud
  <span class="pair">
    <select class="baud" value={showCustom ? 'other' : String(session.options.baudRate)} onchange={baudPick} disabled={session.open} title={locked}>
      {#each BAUDS as b}<option value={String(b)}>{b}</option>{/each}
      <option value="other">Other…</option>
    </select>
    {#if showCustom}
      <input class="baud-custom" type="text" inputmode="numeric" value={session.options.baudRate} onchange={baudInput} disabled={session.open} title={locked || 'Any rate from 50 to 20,000,000; the adapter may round it'} aria-label="Custom baud rate" />
    {/if}
  </span>
</label>
<label>Data bits
  <select bind:value={session.options.dataBits} disabled={session.open} title={locked}>
    {#each [5, 6, 7, 8] as d}<option value={d} disabled={!!why({ dataBits: d as 8 })} title={why({ dataBits: d as 8 })}>{d}</option>{/each}
  </select>
</label>
<label>Parity
  <select bind:value={session.options.parity} disabled={session.open} title={locked}>
    {#each PARITY as p}<option value={p} disabled={!!why({ parity: p })} title={why({ parity: p })}>{p}</option>{/each}
  </select>
</label>
<label>Stop bits
  <select bind:value={session.options.stopBits} disabled={session.open} title={locked}>
    {#each [1, 1.5, 2] as s}<option value={s} disabled={!!why({ stopBits: s as 1 })} title={why({ stopBits: s as 1 })}>{s}</option>{/each}
  </select>
</label>
<label>Flow
  <select bind:value={session.options.flowControl} disabled={session.open} title={locked}>
    {#each Object.entries(FLOW) as [f, l]}<option value={f} disabled={!!why({ flowControl: f as 'none' })} title={why({ flowControl: f as 'none' })}>{l}</option>{/each}
  </select>
</label>
{#if canBreak || others.length}<hr />{/if}
{#if canBreak}
  <span>Break</span>
  <button class="action" onclick={() => session.sendBreak()} title="Hold the line in the break state for 250 ms">Send 250 ms break</button>
{/if}
{#if others.length}
  <label>Forward
    <select
      class="fwd"
      value={session.forwardTo?.letter ?? ''}
      onchange={(e) => (session.forwardTo = others.find((o) => o.letter === e.currentTarget.value) ?? null)}
      title="Write everything received on this port out of another port"
    >
      <option value="">none</option>
      {#each others as o (o.id)}<option value={o.letter}>to {o.letter} ({o.portLabel()})</option>{/each}
    </select>
  </label>
{/if}

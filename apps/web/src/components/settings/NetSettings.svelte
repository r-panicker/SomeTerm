<script lang="ts">
  import { netSpecProblem, type NetSpec } from '@someterm/core';
  import type { Session } from '../../lib/session.svelte';

  /** Rows for a `.form` grid: TCP/Telnet, client or server, host and port. */
  let { session }: { session: Session } = $props();
  const spec = $derived(session.choice.kind === 'net' ? session.choice.spec : session.lastNet);
  const problem = $derived(netSpecProblem(spec));
  const locked = $derived(session.open ? 'Disconnect to change the connection' : '');

  function set(patch: Partial<NetSpec>) {
    const next = { ...spec, ...patch };
    // A server listens on every address unless told otherwise; a client needs somewhere to go.
    if (patch.mode === 'server' && (spec.host === '127.0.0.1' || !spec.host)) next.host = '0.0.0.0';
    if (patch.mode === 'client' && spec.host === '0.0.0.0') next.host = '127.0.0.1';
    session.choice = { kind: 'net', spec: next };
    session.lastNet = next;
  }
</script>

<label>Mode
  <span class="seg" role="group" aria-label="Mode">
    <button type="button" class:on={spec.mode === 'client'} disabled={session.open} title={locked || 'Connect to a server'} onclick={() => set({ mode: 'client' })}>Client</button>
    <button type="button" class:on={spec.mode === 'server'} disabled={session.open} title={locked || 'Listen for clients; several can connect, and each gets everything sent'} onclick={() => set({ mode: 'server' })}>Server</button>
  </span>
</label>
<label>Protocol
  <span class="seg" role="group" aria-label="Protocol">
    <button type="button" class:on={spec.protocol === 'tcp'} disabled={session.open} title={locked || 'Raw TCP: bytes pass untouched'} onclick={() => set({ protocol: 'tcp' })}>Raw TCP</button>
    <button type="button" class:on={spec.protocol === 'telnet'} disabled={session.open} title={locked || 'Telnet: option negotiation is answered and hidden, 0xFF is escaped'} onclick={() => set({ protocol: 'telnet' })}>Telnet</button>
  </span>
</label>
<label>{spec.mode === 'server' ? 'Listen on' : 'Host'}
  <input value={spec.host} disabled={session.open} title={locked || (spec.mode === 'server' ? '0.0.0.0 accepts connections on every network; 127.0.0.1 only from this computer' : 'Name or address of the server')} onchange={(e) => set({ host: e.currentTarget.value.trim() })} spellcheck="false" />
</label>
<label>Port
  <input type="number" min="1" max="65535" value={spec.port} disabled={session.open} title={locked || (spec.mode === 'server' ? 'Ports below 1024 usually need administrator rights' : '')} onchange={(e) => set({ port: Number(e.currentTarget.value) })} />
</label>
{#if problem}<span></span><span class="problem">{problem}</span>{/if}

<style>
  .problem { color: var(--err); font-size: 12px; }
  .seg button { height: 26px; }
</style>

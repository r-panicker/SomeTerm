<script lang="ts">
  import { fullscreen } from '../lib/fullscreen.svelte';
  import { parseRecording, unsupportedOptions, type SerialOptions } from '@someterm/core';
  import { isWebSerialAvailable } from '@someterm/transport-webserial';
  import { native, type PortChoice, type Session, type View } from '../lib/session.svelte';
  import type { Workspace } from '../lib/workspace.svelte';
  import { portPanel, type PortTab } from '../lib/panel.svelte';

  /** `onshow` brings a tab of the control panel forward. */
  let { session, workspace, onshow }: { session: Session; workspace: Workspace; onshow: (tab: PortTab) => void } = $props();

  const others = $derived(workspace.sessions.filter((o) => o !== session));
  /** Tooltip naming the tab that already has this port open, or ''. */
  const heldBy = (c: PortChoice) => {
    const h = workspace.holder(c, session);
    return h ? `Open in connection ${h.letter}` : '';
  };

  const hasWebSerial = !native && isWebSerialAvailable();


  const o = $derived(session.options);

  const why = (patch: Partial<SerialOptions>) => unsupportedOptions(session.capabilities, { ...session.options, ...patch })[0] ?? '';

  // A more limited port must not inherit settings it cannot honour.
  $effect(() => {
    const opts = session.options;
    if (why({ dataBits: opts.dataBits })) opts.dataBits = 8;
    if (why({ stopBits: opts.stopBits })) opts.stopBits = 1;
    if (why({ parity: opts.parity })) opts.parity = 'none';
    if (why({ flowControl: opts.flowControl })) opts.flowControl = 'none';
  });

  const choices = $derived<{ key: string; c: PortChoice }[]>([
    ...session.nativePorts.map((p) => ({ key: `n:${p.path}`, c: { kind: 'native', ...p } as PortChoice })),
    ...session.granted.map((port, i) => ({ key: `p${i}`, c: { kind: 'webserial', port } as PortChoice })),
    ...(hasWebSerial ? [{ key: 'add', c: { kind: 'add' } as PortChoice }] : []),
    { key: 'loop', c: { kind: 'loopback' } as PortChoice },
    { key: 'net', c: (session.choice.kind === 'net' ? session.choice : { kind: 'net', spec: session.lastNet }) as PortChoice },
    ...(session.choice.kind === 'replay' ? [{ key: 'replay', c: session.choice }] : []),
  ]);
  let recInput: HTMLInputElement;
  let portSelect: HTMLSelectElement;

  async function openRecording() {
    const f = recInput.files?.[0];
    recInput.value = '';
    if (!f) return;
    try {
      session.loadRecording(f.name, parseRecording(new Uint8Array(await f.arrayBuffer())));
    } catch (e) {
      session.errors++;
      session.lastError = `${f.name}: ${(e as Error).message}`;
    }
  }

  const clock = (ms: number) => {
    const s = Math.max(0, ms) / 1000;
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  };
  const selectedKey = $derived(
    choices.find((x) => keyOf(x.c) === keyOf(session.choice))?.key ?? choices[0]?.key ?? 'loop',
  );

  function keyOf(c: PortChoice): unknown {
    return c.kind === 'native' ? `n:${c.path}` : c.kind === 'webserial' ? c.port : c.kind === 'replay' ? c.recording : c.kind;
  }

  function pick(key: string) {
    if (key === 'open-rec') {
      portSelect.value = selectedKey;
      recInput.click();
      return;
    }
    session.choosePort(choices.find((x) => x.key === key)!.c);
    // The connection's own settings are on the Port tab; a network one has nothing usable until host and port are set.
    if (key === 'net') onshow('port');
  }

  /** In a browser there are no sockets, so the network choice is shown but cannot be picked. */
  const netUnavailable = native ? '' : 'TCP and Telnet need the desktop app: a browser cannot open network connections';

</script>

<header>
  <select bind:this={portSelect} value={selectedKey} onchange={(e) => pick(e.currentTarget.value)} onfocus={() => session.refreshPorts()} disabled={session.open || session.busy || session.waiting} title="Port">
    {#each choices as x (x.key)}
      {#if x.key === 'net'}<option value="net" disabled={!!netUnavailable} title={netUnavailable || 'Raw TCP or Telnet, as client or server'}>{session.choice.kind === 'net' ? session.portLabel(x.c) : netUnavailable ? 'TCP / Telnet (desktop app only)' : 'TCP / Telnet…'}</option>
      {:else}<option value={x.key} disabled={!!heldBy(x.c)} title={heldBy(x.c)}>{session.portLabel(x.c)}</option>{/if}
    {/each}
    <option value="open-rec">Open recording…</option>
  </select>
  {#if session.waiting && !session.open}
    <button class="primary waiting" onclick={() => session.cancelWaiting()} title="The device was unplugged or reset; it reconnects when it comes back. Click to stop waiting.">Waiting…</button>
  {:else}
    <button class="primary" onclick={() => (session.open ? session.disconnect() : session.connect())} disabled={session.busy || (!session.open && !!heldBy(session.choice))} title={heldBy(session.choice) && !session.open ? heldBy(session.choice) : `${session.open ? 'Disconnect' : 'Connect'} (Ctrl+Shift+Enter)`}>
      {session.open ? 'Disconnect' : 'Connect'}
    </button>
  {/if}
  <input bind:this={recInput} type="file" accept=".strec" hidden onchange={openRecording} />
  {#if session.player}
    {@const pl = session.player}
    <button class="play" onclick={() => session.togglePlay()} title={pl.playing ? 'Pause' : 'Play'}>{pl.playing ? '❚❚' : '▶'}</button>
    <select class="speed" value={pl.speed} onchange={(e) => (pl.speed = Number(e.currentTarget.value))} title="Replay speed; Max is as fast as the view keeps up" aria-label="Replay speed">
      <option value={1}>1×</option><option value={2}>2×</option><option value={10}>10×</option><option value={0}>Max</option>
    </select>
    <input class="seekbar" type="range" min="0" max={pl.duration || 1} step="any" value={pl.position} onchange={(e) => session.seek(Number(e.currentTarget.value))} title="Seek · {clock(pl.position)} / {clock(pl.duration)}" />
    <span class="ptime">{clock(pl.position)} / {clock(pl.duration)}</span>
    {#if session.choice.kind === 'replay' && session.choice.recording.records.some((r) => r.kind === 'signals')}
      <span class="outs" title="Output lines as recorded"><span class:on={pl.dtr}>DTR</span> <span class:on={pl.rts}>RTS</span></span>
    {/if}
  {:else if session.open && session.choice.kind !== 'net'}
    {@const noLines = session.lineControl ? '' : 'This port has no modem control lines'}
    <button class="line" class:on={session.dtr && session.lineControl} onclick={() => session.setLine('dtr', !session.dtr)} disabled={!!noLines} title={noLines || 'DTR output'}>DTR</button>
    <button class="line" class:on={session.rts && session.lineControl} onclick={() => session.setLine('rts', !session.rts)} disabled={!!noLines} title={noLines || 'RTS output'}>RTS</button>
  {/if}
  <span class="spacer"></span>
  <div class="seg" role="group" aria-label="View">
    {#each [['terminal', 'Terminal'], ['split', 'Split'], ['plot', 'Plot']] as [v, l]}
      <button class:on={session.view === v} onclick={() => { session.chooseView(v as View); if (v !== 'terminal') onshow('plot'); }}>{l}</button>
    {/each}
  </div>
  {#if !others.length}<button onclick={() => workspace.openTab()} title="Open another connection, starting from this one's settings">+</button>{/if}
  {#if fullscreen.available}
    <button class="icon" onclick={() => fullscreen.toggle()} title="{fullscreen.on ? 'Leave full screen' : 'Full screen'} (Alt+Enter)" aria-label={fullscreen.on ? 'Leave full screen' : 'Full screen'} aria-pressed={fullscreen.on}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d={fullscreen.on ? 'M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4' : 'M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4'} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
  {/if}
</header>

<style>
  .play { width: 30px; padding: 0; }
  .icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; padding: 0; }
  .waiting { animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) { .waiting { animation: none; } }
  .speed { width: 4.2em; }
  select[title='Port'] { max-width: 170px; }
  @media (max-width: 700px) { select[title='Port'] { max-width: 120px; } }
  .seekbar { flex: 1 1 80px; min-width: 60px; max-width: 260px; height: 20px; padding: 0; border: 0; background: none; }
  .ptime { font: 12px var(--mono); color: var(--muted); white-space: nowrap; }
  @media (max-width: 960px) { .ptime { display: none; } }
  .outs { font: 11px var(--mono); color: var(--muted); white-space: nowrap; }
  .outs .on { color: var(--ok); font-weight: 600; }
  .line.on { background: var(--ok); color: var(--accent-fg); border-color: var(--ok); }
</style>

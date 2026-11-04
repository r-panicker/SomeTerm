<script lang="ts">
  import { parseRecording, unsupportedOptions, type SerialOptions } from '@superserial/core';
  import { isWebSerialAvailable } from '@superserial/transport-webserial';
  import { native, type PortChoice, type Session, type View } from '../lib/session.svelte';
  import type { Workspace } from '../lib/workspace.svelte';
  import { profiles, settingsOf } from '../lib/profiles.svelte';

  let { session, workspace, drawer = $bindable(null) }: { session: Session; workspace: Workspace; drawer?: 'capture' | 'profiles' | 'rules' | 'replies' | null } = $props();

  const others = $derived(workspace.sessions.filter((o) => o !== session));
  /** Tooltip naming the tab that already has this port open, or ''. */
  const heldBy = (c: PortChoice) => {
    const h = workspace.holder(c, session);
    return h ? `Open in tab ${h.letter}` : '';
  };

  const BAUDS = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 250000, 460800, 500000, 921600, 1000000, 2000000];
  const PARITY = { none: 'N', even: 'E', odd: 'O', mark: 'M', space: 'S' } as const;
  const FLOW = { none: '', rtscts: 'RTS/CTS', dsrdtr: 'DSR/DTR', xonxoff: 'XON/XOFF' } as const;
  const hasWebSerial = !native && isWebSerialAvailable();

  let settingsOpen = $state(false);
  let popover: HTMLDivElement | undefined = $state();
  let chip: HTMLButtonElement | undefined = $state();

  const o = $derived(session.options);
  const profile = $derived(profiles.get(session.profileId));
  const dirty = $derived(!!profile && JSON.stringify(settingsOf(session)) !== JSON.stringify(profile.settings));
  const device = $derived(session.deviceId());
  const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');
  const deviceText = $derived(device ? `${hex4(device.vid)}:${hex4(device.pid)}${device.serial ? ` #${device.serial}` : ''}` : '');
  let saving = $state(false);
  let newName = $state('');
  let matchDevice = $state(true);
  const locked = $derived(session.open ? 'Disconnect to change port settings' : '');

  function profilePick(e: Event & { currentTarget: HTMLSelectElement }) {
    const v = e.currentTarget.value;
    if (v === '__save') { saving = true; newName = profile?.name ?? ''; }
    else if (v === '__manage') { settingsOpen = false; drawer = 'profiles'; }
    else if (v) session.applyProfile(v);
    else session.profileId = null;
    e.currentTarget.value = session.profileId ?? '';
  }

  function saveNew() {
    const p = profiles.create(newName, settingsOf(session), matchDevice && device ? device : undefined);
    session.profileId = p.id;
    saving = false;
  }

  const summary = $derived(`${o.baudRate} ${o.dataBits}${PARITY[o.parity]}${o.stopBits}${FLOW[o.flowControl] ? ' ' + FLOW[o.flowControl] : ''}`);
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
  }

  function outside(e: MouseEvent) {
    if (settingsOpen && !popover?.contains(e.target as Node) && !chip?.contains(e.target as Node)) settingsOpen = false;
  }

  function baudInput(e: Event & { currentTarget: HTMLInputElement }) {
    const n = Number(e.currentTarget.value);
    if (Number.isInteger(n) && n >= 50 && n <= 20_000_000) session.options.baudRate = n;
  }
</script>

<svelte:window onmousedown={outside} onkeydown={(e) => e.key === 'Escape' && (settingsOpen = false)} />

<header>
  <select bind:this={portSelect} value={selectedKey} onchange={(e) => pick(e.currentTarget.value)} onfocus={() => session.refreshPorts()} disabled={session.open || session.busy || session.waiting} title="Port">
    {#each choices as x (x.key)}<option value={x.key} disabled={!!heldBy(x.c)} title={heldBy(x.c)}>{session.portLabel(x.c)}</option>{/each}
    <option value="open-rec">Open recording…</option>
  </select>
  <div class="anchor">
    <button bind:this={chip} class="chip" onclick={() => (settingsOpen = !settingsOpen)} title={`${profile ? `Profile: ${profile.name}${dirty ? ' (changed since applied)' : ''}` : 'Port settings'}`}>
      {#if profile}<span class="pname">{profile.name}</span><span class="sep">·</span>{/if}{summary}{#if session.forwardTo}<span class="sep">→{session.forwardTo.letter}</span>{/if}{#if dirty}<span class="dirty">•</span>{/if}
    </button>
    {#if settingsOpen}
      <div class="popover" bind:this={popover}>
        <label>Profile
          <span class="pair">
            <select value={session.profileId ?? ''} onchange={profilePick}>
              <option value="" disabled={session.open} title={locked}>None</option>
              {#each profiles.list as p (p.id)}<option value={p.id} disabled={session.open} title={locked || (p.match ? 'Applies itself to its device' : '')}>{p.name}</option>{/each}
              <option value="__save">Save as…</option>
              <option value="__manage">Manage…</option>
            </select>
            {#if dirty}<button onclick={() => profile && profiles.update(profile.id, settingsOf(session))} title="Save the current settings into {profile?.name}">Update</button>{/if}
          </span>
        </label>
        {#if saving}
          <label>Name
            <input bind:value={newName} placeholder="e.g. ESP32 DevKit" onkeydown={(e) => e.key === 'Enter' && saveNew()} />
          </label>
          {#if device}
            <span></span>
            <label class="check"><input type="checkbox" bind:checked={matchDevice} /> Apply to {deviceText} automatically</label>
          {/if}
          <span></span>
          <span class="pair"><button class="primary" onclick={saveNew}>Save</button><button onclick={() => (saving = false)}>Cancel</button></span>
        {/if}
        <hr />
        <label>Baud
          <input type="text" inputmode="numeric" list="bauds" value={o.baudRate} onchange={baudInput} disabled={session.open} title={locked} />
          <datalist id="bauds">{#each BAUDS as b}<option value={b}></option>{/each}</datalist>
        </label>
        <label>Data bits
          <select bind:value={session.options.dataBits} disabled={session.open} title={locked}>
            {#each [5, 6, 7, 8] as d}<option value={d} disabled={!!why({ dataBits: d as 8 })} title={why({ dataBits: d as 8 })}>{d}</option>{/each}
          </select>
        </label>
        <label>Parity
          <select bind:value={session.options.parity} disabled={session.open} title={locked}>
            {#each Object.keys(PARITY) as p}<option value={p} disabled={!!why({ parity: p as 'none' })} title={why({ parity: p as 'none' })}>{p}</option>{/each}
          </select>
        </label>
        <label>Stop bits
          <select bind:value={session.options.stopBits} disabled={session.open} title={locked}>
            {#each [1, 1.5, 2] as s}<option value={s} disabled={!!why({ stopBits: s as 1 })} title={why({ stopBits: s as 1 })}>{s}</option>{/each}
          </select>
        </label>
        <label>Flow
          <select bind:value={session.options.flowControl} disabled={session.open} title={locked}>
            {#each Object.entries(FLOW) as [f, l]}<option value={f} disabled={!!why({ flowControl: f as 'none' })} title={why({ flowControl: f as 'none' })}>{l || 'none'}</option>{/each}
          </select>
        </label>
        {#if (session.open && session.capabilities.sendBreak && !session.player) || others.length}<hr />{/if}
        {#if session.open && session.capabilities.sendBreak && !session.player}
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
      </div>
    {/if}
  </div>
  {#if session.waiting && !session.open}
    <button class="primary waiting" onclick={() => session.cancelWaiting()} title="The device was unplugged or reset; it reconnects when it comes back. Click to stop waiting.">Waiting…</button>
  {:else}
    <button class="primary" onclick={() => (session.open ? session.disconnect() : session.connect())} disabled={session.busy || (!session.open && !!heldBy(session.choice))} title={session.open ? '' : heldBy(session.choice)}>
      {session.open ? 'Disconnect' : 'Connect'}
    </button>
  {/if}
  <input bind:this={recInput} type="file" accept=".ssrec" hidden onchange={openRecording} />
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
  {:else if session.open}
    {@const noLines = session.lineControl ? '' : 'This port has no modem control lines'}
    <button class="line" class:on={session.dtr && session.lineControl} onclick={() => session.setLine('dtr', !session.dtr)} disabled={!!noLines} title={noLines || 'DTR output'}>DTR</button>
    <button class="line" class:on={session.rts && session.lineControl} onclick={() => session.setLine('rts', !session.rts)} disabled={!!noLines} title={noLines || 'RTS output'}>RTS</button>
  {/if}
  <span class="spacer"></span>
  <button class="toggle" class:on={drawer === 'capture'} class:rec={session.capture.info?.state === 'running'} onclick={() => (drawer = drawer === 'capture' ? null : 'capture')} title="Capture to file">Capture</button>
  <div class="seg" role="group" aria-label="View">
    {#each [['terminal', 'Terminal'], ['split', 'Split'], ['plot', 'Plot']] as [v, l]}
      <button class:on={session.view === v} onclick={() => session.chooseView(v as View)}>{l}</button>
    {/each}
  </div>
  {#if !others.length}<button onclick={() => workspace.add()} title="Open another port in a new tab">+</button>{/if}
</header>

<style>
  .anchor { position: relative; }
  .chip { font-family: var(--mono); display: inline-flex; align-items: center; max-width: 34ch; white-space: nowrap; }
  .pname { font-family: system-ui, sans-serif; overflow: hidden; text-overflow: ellipsis; max-width: 16ch; }
  .sep { margin: 0 .4em; color: var(--muted); }
  @media (max-width: 760px) { .pname { max-width: 6ch; } .sep { margin: 0 .25em; } }
  @media (max-width: 660px) { .pname, .sep { display: none; } }
  .dirty { margin-left: .3em; color: var(--accent); }
  .popover .action { justify-self: start; }
  .popover hr { grid-column: 1 / -1; width: 100%; border: 0; border-top: 1px solid var(--line); margin: 2px 0; }
  .pair { display: flex; gap: 6px; align-items: center; }
  .pair select { flex: 1; min-width: 0; }
  .popover .check { display: flex; gap: 6px; align-items: center; color: var(--fg); font-size: 12px; }
  .popover .check input { width: auto; }
  .popover {
    position: absolute; top: calc(100% + 4px); left: 0; z-index: 10; display: grid; grid-template-columns: auto 1fr;
    gap: 6px 10px; padding: 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    box-shadow: 0 6px 24px rgb(0 0 0 / .18); min-width: 300px;
  }
  .popover label { display: contents; color: var(--muted); }
  .popover input, .popover select { width: 100%; }
  .rec::before { content: '● '; color: var(--err); }
  .play { width: 30px; padding: 0; }
  .waiting { animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) { .waiting { animation: none; } }
  .speed { width: 4.2em; }
  select[title='Port'] { max-width: 170px; }
  .seekbar { flex: 1 1 80px; min-width: 60px; max-width: 260px; height: 20px; padding: 0; border: 0; background: none; }
  .ptime { font: 12px var(--mono); color: var(--muted); white-space: nowrap; }
  @media (max-width: 960px) { .ptime { display: none; } }
  .outs { font: 11px var(--mono); color: var(--muted); white-space: nowrap; }
  .outs .on { color: var(--ok); font-weight: 600; }
  .line.on { background: var(--ok); color: var(--accent-fg); border-color: var(--ok); }
</style>

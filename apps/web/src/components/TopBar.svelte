<script lang="ts">
  import { unsupportedOptions, type SerialOptions } from '@superserial/core';
  import { isWebSerialAvailable } from '@superserial/transport-webserial';
  import type { PortChoice, Session, View } from '../lib/session.svelte';

  let { session, drawer = $bindable(null) }: { session: Session; drawer?: 'capture' | null } = $props();

  const BAUDS = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 250000, 460800, 500000, 921600, 1000000, 2000000];
  const PARITY = { none: 'N', even: 'E', odd: 'O', mark: 'M', space: 'S' } as const;
  const FLOW = { none: '', rtscts: 'RTS/CTS', dsrdtr: 'DSR/DTR', xonxoff: 'XON/XOFF' } as const;
  const hasWebSerial = isWebSerialAvailable();

  let settingsOpen = $state(false);
  let popover: HTMLDivElement | undefined = $state();
  let chip: HTMLButtonElement | undefined = $state();

  const o = $derived(session.options);
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
    ...session.granted.map((port, i) => ({ key: `p${i}`, c: { kind: 'webserial', port } as PortChoice })),
    ...(hasWebSerial ? [{ key: 'add', c: { kind: 'add' } as PortChoice }] : []),
    { key: 'loop', c: { kind: 'loopback' } as PortChoice },
  ]);
  const selectedKey = $derived(
    choices.find((x) => x.c.kind === session.choice.kind && (x.c.kind !== 'webserial' || (session.choice.kind === 'webserial' && x.c.port === session.choice.port)))?.key ?? 'add',
  );

  function pick(key: string) {
    session.choice = choices.find((x) => x.key === key)!.c;
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
  <select value={selectedKey} onchange={(e) => pick(e.currentTarget.value)} disabled={session.open || session.busy} title="Port">
    {#each choices as x (x.key)}<option value={x.key}>{session.portLabel(x.c)}</option>{/each}
  </select>
  <div class="anchor">
    <button bind:this={chip} class="chip" onclick={() => (settingsOpen = !settingsOpen)} disabled={session.open} title={session.open ? 'Disconnect to change port settings' : 'Port settings'}>{summary}</button>
    {#if settingsOpen && !session.open}
      <div class="popover" bind:this={popover}>
        <label>Baud
          <input type="text" inputmode="numeric" list="bauds" value={o.baudRate} onchange={baudInput} />
          <datalist id="bauds">{#each BAUDS as b}<option value={b}></option>{/each}</datalist>
        </label>
        <label>Data bits
          <select bind:value={session.options.dataBits}>
            {#each [5, 6, 7, 8] as d}<option value={d} disabled={!!why({ dataBits: d as 8 })} title={why({ dataBits: d as 8 })}>{d}</option>{/each}
          </select>
        </label>
        <label>Parity
          <select bind:value={session.options.parity}>
            {#each Object.keys(PARITY) as p}<option value={p} disabled={!!why({ parity: p as 'none' })} title={why({ parity: p as 'none' })}>{p}</option>{/each}
          </select>
        </label>
        <label>Stop bits
          <select bind:value={session.options.stopBits}>
            {#each [1, 1.5, 2] as s}<option value={s} disabled={!!why({ stopBits: s as 1 })} title={why({ stopBits: s as 1 })}>{s}</option>{/each}
          </select>
        </label>
        <label>Flow
          <select bind:value={session.options.flowControl}>
            {#each Object.entries(FLOW) as [f, l]}<option value={f} disabled={!!why({ flowControl: f as 'none' })} title={why({ flowControl: f as 'none' })}>{l || 'none'}</option>{/each}
          </select>
        </label>
      </div>
    {/if}
  </div>
  <button class="primary" onclick={() => (session.open ? session.disconnect() : session.connect())} disabled={session.busy}>
    {session.open ? 'Disconnect' : 'Connect'}
  </button>
  {#if session.open}
    <button class="line" class:on={session.dtr} onclick={() => session.setLine('dtr', !session.dtr)} title="DTR output">DTR</button>
    <button class="line" class:on={session.rts} onclick={() => session.setLine('rts', !session.rts)} title="RTS output">RTS</button>
    {#if session.capabilities.sendBreak}<button onclick={() => session.sendBreak()} title="Send a 250 ms break">Break</button>{/if}
  {/if}
  <span class="spacer"></span>
  <button class="toggle" class:on={drawer === 'capture'} class:rec={session.capture?.state === 'running'} onclick={() => (drawer = drawer === 'capture' ? null : 'capture')} title="Capture to file">Capture</button>
  <div class="seg" role="group" aria-label="View">
    {#each [['terminal', 'Terminal'], ['split', 'Split'], ['plot', 'Plot']] as [v, l]}
      <button class:on={session.view === v} onclick={() => session.chooseView(v as View)}>{l}</button>
    {/each}
  </div>
</header>

<style>
  .anchor { position: relative; }
  .chip { font-family: var(--mono); }
  .popover {
    position: absolute; top: calc(100% + 4px); left: 0; z-index: 10; display: grid; grid-template-columns: auto 1fr;
    gap: 6px 10px; padding: 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    box-shadow: 0 6px 24px rgb(0 0 0 / .18); min-width: 220px;
  }
  .popover label { display: contents; color: var(--muted); }
  .popover input, .popover select { width: 100%; }
  .rec::before { content: '● '; color: var(--err); }
  .line.on { background: var(--ok); color: var(--accent-fg); border-color: var(--ok); }
</style>

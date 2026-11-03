<script lang="ts">
  import {
    FULL_CAPABILITIES,
    parseEscapes,
    parseHexBytes,
    toHex,
    unsupportedOptions,
    type HexDumpRow,
    type NewlineMode,
    type SerialOptions,
  } from '@superserial/core';
  import { WEB_SERIAL_CAPABILITIES, isWebSerialAvailable } from '@superserial/transport-webserial';
  import { Session, type Source } from './lib/session';

  const BAUDS = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000, 2000000];
  const hasWebSerial = isWebSerialAvailable();

  const session = new Session(refresh);
  let ui = $state({ open: false, rx: 0, tx: 0, error: '', text: '', hex: [] as HexDumpRow[] });

  function refresh() {
    const { lines, partial } = session;
    ui = {
      open: session.open,
      rx: session.rx,
      tx: session.tx,
      error: session.error,
      text: view === 'ascii' ? lines.join('\n') + (lines.length && partial ? '\n' : '') + partial : '',
      hex: view === 'hex' ? session.hexRows() : [],
    };
  }

  let source = $state<Source>(hasWebSerial ? 'webserial' : 'loopback');
  let opts = $state<SerialOptions>({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
  let view = $state<'ascii' | 'hex'>('ascii');
  let newline = $state<NewlineMode>('auto');
  let sendMode = $state<'text' | 'hex'>('text');
  let eol = $state('\r\n');
  let input = $state('');
  let sendError = $state('');
  let busy = $state(false);
  let output: HTMLElement | undefined = $state();
  let follow = $state(true);

  const caps = $derived(source === 'webserial' ? WEB_SERIAL_CAPABILITIES : FULL_CAPABILITIES);
  const why = (patch: Partial<SerialOptions>) => unsupportedOptions(caps, { ...opts, ...patch })[0] ?? '';
  const open = $derived(ui.open);

  // Switching to a more limited source must not leave an impossible selection behind.
  $effect(() => {
    const defaults: SerialOptions = { ...opts, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' };
    if (why({ dataBits: opts.dataBits })) opts.dataBits = defaults.dataBits;
    if (why({ stopBits: opts.stopBits })) opts.stopBits = defaults.stopBits;
    if (why({ parity: opts.parity })) opts.parity = defaults.parity;
    if (why({ flowControl: opts.flowControl })) opts.flowControl = defaults.flowControl;
  });

  $effect(() => {
    void ui;
    if (follow && output) queueMicrotask(() => output && (output.scrollTop = output.scrollHeight));
  });

  async function toggle() {
    busy = true;
    try {
      if (open) await session.disconnect();
      else await session.connect(source, $state.snapshot(opts));
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) session.error = (e as Error).message;
      refresh();
    } finally {
      busy = false;
    }
  }

  async function send(e: SubmitEvent) {
    e.preventDefault();
    try {
      const body = sendMode === 'hex' ? parseHexBytes(input) : parseEscapes(input + eol);
      sendError = '';
      await session.send(body);
    } catch (err) {
      sendError = (err as Error).message;
    }
  }

  function onScroll() {
    if (!output) return;
    follow = output.scrollHeight - output.scrollTop - output.clientHeight < 4;
  }
</script>

<header>
  <select bind:value={source} disabled={open} title="Port source">
    <option value="webserial" disabled={!hasWebSerial} title={hasWebSerial ? '' : 'Needs Chrome or Edge'}>Web Serial</option>
    <option value="loopback">Loopback</option>
  </select>
  <select bind:value={opts.baudRate} disabled={open} title="Baud rate">
    {#each BAUDS as b}<option value={b}>{b}</option>{/each}
  </select>
  <select bind:value={opts.dataBits} disabled={open} title="Data bits">
    {#each [5, 6, 7, 8] as d}<option value={d} disabled={!!why({ dataBits: d as 5 })} title={why({ dataBits: d as 5 })}>{d}</option>{/each}
  </select>
  <select bind:value={opts.parity} disabled={open} title="Parity">
    {#each [['none', 'N'], ['even', 'E'], ['odd', 'O'], ['mark', 'M'], ['space', 'S']] as [p, l]}
      <option value={p} disabled={!!why({ parity: p as 'none' })} title={why({ parity: p as 'none' })}>{l}</option>
    {/each}
  </select>
  <select bind:value={opts.stopBits} disabled={open} title="Stop bits">
    {#each [1, 1.5, 2] as s}<option value={s} disabled={!!why({ stopBits: s as 1 })} title={why({ stopBits: s as 1 })}>{s}</option>{/each}
  </select>
  <select bind:value={opts.flowControl} disabled={open} title="Flow control">
    {#each [['none', 'No flow'], ['rtscts', 'RTS/CTS'], ['dsrdtr', 'DSR/DTR'], ['xonxoff', 'XON/XOFF']] as [f, l]}
      <option value={f} disabled={!!why({ flowControl: f as 'none' })} title={why({ flowControl: f as 'none' })}>{l}</option>
    {/each}
  </select>
  <button class="primary" onclick={toggle} disabled={busy}>{open ? 'Disconnect' : 'Connect'}</button>

  <span class="spacer"></span>

  <div class="seg" role="group" title="Display">
    <button class:on={view === 'ascii'} onclick={() => { view = 'ascii'; refresh(); }}>ASCII</button>
    <button class:on={view === 'hex'} onclick={() => { view = 'hex'; refresh(); }}>Hex</button>
  </div>
  {#if view === 'ascii'}
    <select bind:value={newline} onchange={() => session.setNewline(newline)} title="Line ending on receive">
      <option value="auto">CR/LF auto</option><option value="lf">LF</option><option value="cr">CR</option><option value="crlf">CRLF</option>
    </select>
  {/if}
  <button onclick={() => session.clear()} title="Clear display">Clear</button>
  {#if open || ui.rx || ui.tx}
    <span class="counts" title="Bytes received / sent">{ui.rx} ↓ {ui.tx} ↑</span>
  {/if}
</header>

{#if ui.error}<div class="error">{ui.error}</div>{/if}

<main bind:this={output} onscroll={onScroll}>
    {#if view === 'ascii'}
      <pre>{ui.text}</pre>
    {:else}
      <pre>{#each ui.hex as r}<span class="off">{r.offset.toString(16).padStart(8, '0')}</span>  {r.hex}  <span class="asc">{r.ascii}</span>
{/each}</pre>
    {/if}
  {#if !open && !ui.rx}<p class="idle">Not connected</p>{/if}
</main>

<form onsubmit={send}>
  <div class="seg" role="group" title="Send as">
    <button type="button" class:on={sendMode === 'text'} onclick={() => (sendMode = 'text')}>Text</button>
    <button type="button" class:on={sendMode === 'hex'} onclick={() => (sendMode = 'hex')}>Hex</button>
  </div>
  <input
    bind:value={input}
    oninput={() => (sendError = '')}
    placeholder={sendMode === 'hex' ? '0D 0A 41' : 'Text, \\r \\n \\xNN'}
    title={sendMode === 'hex' ? 'Hex bytes separated by spaces or commas' : 'Escapes: \\r \\n \\t \\0 \\\\ \\xNN'}
    class:bad={!!sendError}
    disabled={!open}
    spellcheck="false"
  />
  {#if sendMode === 'text'}
    <select bind:value={eol} title="Appended to each send">
      <option value={'\r\n'}>+CRLF</option><option value={'\n'}>+LF</option><option value={'\r'}>+CR</option><option value="">none</option>
    </select>
  {/if}
  <button class="primary" disabled={!open}>Send</button>
  {#if sendError}<span class="error inline">{sendError}</span>
  {:else if sendMode === 'hex' && input.trim()}
    <span class="preview">{(() => { try { return toHex(parseHexBytes(input)); } catch { return ''; } })()}</span>
  {/if}
</form>

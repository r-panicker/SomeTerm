import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { FULL_CAPABILITIES, type SerialOptions } from '@superserial/core';
import { TcpTransport } from './net';
import { CHANNELS, type BridgeEvent, type NativeSerialBridge } from './bridge';
import { serveSerialBridge } from './ipc-host';
import { IpcSerialTransport } from './ipc-client';

const opts: SerialOptions = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cleanup: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanup.splice(0).reverse()) await c(); });

/** A local server: echoes by default, or runs `onSocket`. Returns its port. */
async function server(onSocket?: (s: net.Socket) => void): Promise<number> {
  // The far end of a connection the transport closes can see a reset (macOS does); that is expected here.
  const srv = net.createServer((s) => { s.on('error', () => {}); (onSocket ?? ((x: net.Socket) => x.pipe(x)))(s); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  cleanup.push(() => new Promise((r) => srv.close(() => r(null))));
  return (srv.address() as net.AddressInfo).port;
}

async function freePort(): Promise<number> {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  return port;
}

function collect(t: TcpTransport) {
  const got: number[] = [];
  const notices: string[] = [];
  t.onData((c) => got.push(...c));
  t.onNotice((n) => notices.push(n));
  return { got, notices };
}

function client(port: number) {
  const s = net.connect({ host: '127.0.0.1', port });
  s.on('error', () => {});
  const got: number[] = [];
  s.on('data', (b) => got.push(...b));
  cleanup.push(() => s.destroy());
  return { s, got, ready: new Promise((r) => s.once('connect', r)) };
}

describe('TcpTransport client', () => {
  it('sends and receives exact bytes, all 256 values', async () => {
    const port = await server();
    const t = new TcpTransport({ mode: 'client', protocol: 'tcp', host: '127.0.0.1', port });
    cleanup.push(() => t.close());
    const { got } = collect(t);
    await t.open();
    expect(t.state).toBe('open');
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    await t.write(all);
    await wait(100);
    expect(got).toEqual(Array.from(all));
  });

  it('reports the remote closing', async () => {
    const port = await server((s) => setTimeout(() => s.end(), 50));
    const t = new TcpTransport({ mode: 'client', protocol: 'tcp', host: '127.0.0.1', port });
    let closed = false;
    t.onClose(() => (closed = true));
    await t.open();
    await wait(200);
    expect(closed).toBe(true);
    expect(t.state).toBe('closed');
  });

  it('a refused connection fails open with the address in the message', async () => {
    const port = await freePort();
    const t = new TcpTransport({ mode: 'client', protocol: 'tcp', host: '127.0.0.1', port });
    await expect(t.open()).rejects.toThrow(new RegExp(`TCP 127.0.0.1:${port}`));
    expect(t.state).toBe('closed');
  });

  it('Telnet: answers negotiation, strips it, escapes 0xFF', async () => {
    const seen: number[] = [];
    const port = await server((s) => {
      s.on('data', (b) => seen.push(...b));
      // WILL ECHO, DO TERMINAL-TYPE, then data with an escaped 0xFF
      s.write(Buffer.from([255, 251, 1, 255, 253, 24, 0x6f, 0x6b, 255, 255]));
    });
    const t = new TcpTransport({ mode: 'client', protocol: 'telnet', host: '127.0.0.1', port });
    cleanup.push(() => t.close());
    const { got } = collect(t);
    await t.open();
    await wait(100);
    expect(got).toEqual([0x6f, 0x6b, 0xff]);
    await t.write(Uint8Array.of(0x41, 0xff));
    await wait(100);
    expect(seen).toEqual([255, 253, 1, 255, 252, 24, 0x41, 0xff, 0xff]);
  });
});

describe('TcpTransport server', () => {
  it('accepts several clients, merges their data, sends writes to all, and reports connections', async () => {
    const port = await freePort();
    const t = new TcpTransport({ mode: 'server', protocol: 'tcp', host: '127.0.0.1', port });
    cleanup.push(() => t.close());
    const { got, notices } = collect(t);
    await t.open();
    const a = client(port);
    const b = client(port);
    await Promise.all([a.ready, b.ready]);
    await wait(50);
    expect(t.connections).toBe(2);
    a.s.write('A');
    await wait(30);
    b.s.write('B');
    await wait(80);
    expect(String.fromCharCode(...got)).toBe('AB');
    await t.write(new TextEncoder().encode('hi'));
    await wait(80);
    expect(String.fromCharCode(...a.got)).toBe('hi');
    expect(String.fromCharCode(...b.got)).toBe('hi');
    a.s.destroy();
    await wait(80);
    expect(notices.filter((n) => /:\d+ connected/.test(n)).length).toBe(2);
    expect(notices.at(-1)).toMatch(/disconnected · 1 connected/);
    expect(t.state).toBe('open');
  });

  it('a busy port fails open with a plain reason', async () => {
    const port = await server();
    const t = new TcpTransport({ mode: 'server', protocol: 'tcp', host: '127.0.0.1', port });
    await expect(t.open()).rejects.toThrow(`Port ${port} is already in use`);
  });

  it('close disconnects clients and frees the port', async () => {
    const port = await freePort();
    const t = new TcpTransport({ mode: 'server', protocol: 'tcp', host: '127.0.0.1', port });
    await t.open();
    const a = client(port);
    await a.ready;
    let ended = false;
    a.s.on('close', () => (ended = true));
    await t.close();
    await wait(50);
    expect(ended).toBe(true);
    const again = new TcpTransport({ mode: 'server', protocol: 'tcp', host: '127.0.0.1', port });
    await again.open();
    await again.close();
  });
});

describe('network paths through the IPC bridge', () => {
  it('a tcp:// path opens a TCP connection with network capabilities, and notices arrive', async () => {
    const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
    const listeners = new Set<(e: BridgeEvent) => void>();
    const stop = serveSerialBridge(
      { handle: (c, fn) => handlers.set(c, fn as never), removeHandler: (c) => handlers.delete(c) },
      (_c, ev) => listeners.forEach((l) => l(structuredClone(ev))),
      undefined,
      async () => [],
    );
    cleanup.push(stop);
    const call = async (c: string, ...a: unknown[]) => structuredClone(await handlers.get(c)!(null, ...a.map((x) => structuredClone(x))));
    const bridge: NativeSerialBridge = {
      capabilities: FULL_CAPABILITIES,
      list: () => call(CHANNELS.list) as never,
      open: (p, o) => call(CHANNELS.open, p, o) as never,
      close: (p) => call(CHANNELS.close, p) as never,
      write: (p, d) => call(CHANNELS.write, p, d) as never,
      setSignals: (p, s) => call(CHANNELS.setSignals, p, s) as never,
      getSignals: (p) => call(CHANNELS.getSignals, p) as never,
      sendBreak: (p, ms) => call(CHANNELS.sendBreak, p, ms) as never,
      onEvent: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    };
    const port = await freePort();
    const t = new IpcSerialTransport(bridge, `tcp-server://127.0.0.1:${port}`);
    expect(t.capabilities.lineSignals).toBe(false);
    expect(t.capabilities.sendBreak).toBe(false);
    const got: number[] = [];
    const notices: string[] = [];
    t.onData((c) => got.push(...c));
    t.onNotice((n) => notices.push(n));
    await t.open(opts);
    const a = client(port);
    await a.ready;
    a.s.write('ping');
    await wait(100);
    expect(String.fromCharCode(...got)).toBe('ping');
    expect(notices[0]).toMatch(/127\.0\.0\.1:\d+ connected · 1 connected/);
    await t.write(new TextEncoder().encode('pong'));
    await wait(80);
    expect(String.fromCharCode(...a.got)).toBe('pong');
    await t.close();
  });
});

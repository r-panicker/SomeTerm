import { describe, expect, it } from 'vitest';
import { LoopbackTransport, FULL_CAPABILITIES, type SerialOptions } from '@superserial/core';
import { CHANNELS, type BridgeEvent, type NativeSerialBridge } from './bridge';
import { serveSerialBridge } from './ipc-host';
import { IpcSerialTransport } from './ipc-client';

const opts: SerialOptions = { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' };
const tick = () => new Promise((r) => setTimeout(r, 5));

/** Wires host and client together the way Electron's ipcMain/ipcRenderer would, with structured cloning. */
function wire(caps = FULL_CAPABILITIES) {
  const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
  const listeners = new Set<(e: BridgeEvent) => void>();
  const transports: LoopbackTransport[] = [];
  const stop = serveSerialBridge(
    { handle: (c, fn) => handlers.set(c, fn as never), removeHandler: (c) => handlers.delete(c) },
    (_c, ev) => listeners.forEach((l) => l(structuredClone(ev))),
    () => { const t = new LoopbackTransport(caps); transports.push(t); return t; },
    async () => [{ path: '/dev/ttyUSB0', label: '/dev/ttyUSB0 · FTDI' }],
  );
  const call = async (c: string, ...a: unknown[]) => structuredClone(await handlers.get(c)!(null, ...a.map((x) => structuredClone(x))));
  const bridge: NativeSerialBridge = {
    capabilities: caps,
    list: () => call(CHANNELS.list) as never,
    open: (p, o) => call(CHANNELS.open, p, o) as never,
    close: (p) => call(CHANNELS.close, p) as never,
    write: (p, d) => call(CHANNELS.write, p, d) as never,
    setSignals: (p, s) => call(CHANNELS.setSignals, p, s) as never,
    getSignals: (p) => call(CHANNELS.getSignals, p) as never,
    sendBreak: (p, ms) => call(CHANNELS.sendBreak, p, ms) as never,
    onEvent: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
  };
  return { bridge, transports, stop, listeners };
}

describe('IPC bridge', () => {
  it('lists ports and round-trips exact bytes', async () => {
    const { bridge } = wire();
    expect(await bridge.list()).toEqual([{ path: '/dev/ttyUSB0', label: '/dev/ttyUSB0 · FTDI' }]);
    const t = new IpcSerialTransport(bridge, '/dev/ttyUSB0', () => 1);
    const got: number[] = [];
    t.onData((c) => got.push(...c));
    await t.open(opts);
    await t.write(Uint8Array.of(0, 0x7f, 0x80, 0xff));
    await tick();
    expect(got).toEqual([0, 0x7f, 0x80, 0xff]);
  });

  it('carries signals across', async () => {
    const { bridge } = wire();
    const t = new IpcSerialTransport(bridge, '/dev/ttyUSB0');
    await t.open(opts);
    await t.setSignals({ rts: true, dtr: false });
    expect(await t.getSignals()).toEqual({ cts: true, dsr: false, dcd: false, ri: false });
  });

  it('propagates open errors and leaves the client closed and unsubscribed', async () => {
    const { bridge, listeners } = wire({ ...FULL_CAPABILITIES, xonXoffFlow: false });
    const t = new IpcSerialTransport(bridge, '/dev/ttyUSB0');
    await expect(t.open({ ...opts, flowControl: 'xonxoff' })).rejects.toThrow('XON/XOFF');
    expect(t.state).toBe('closed');
    expect(listeners.size).toBe(0);
  });

  it('refuses a second open of the same path', async () => {
    const { bridge } = wire();
    await new IpcSerialTransport(bridge, '/dev/ttyUSB0').open(opts);
    await expect(new IpcSerialTransport(bridge, '/dev/ttyUSB0').open(opts)).rejects.toThrow('already open');
  });

  it('a main-side close (unplug) reaches the client once', async () => {
    const { bridge, transports } = wire();
    const t = new IpcSerialTransport(bridge, '/dev/ttyUSB0');
    let closes = 0;
    t.onClose(() => closes++);
    await t.open(opts);
    await transports[0]!.close();
    await tick();
    expect(t.state).toBe('closed');
    expect(closes).toBe(1);
    await t.open(opts);
    expect(t.state).toBe('open');
  });

  it('stopping the host closes every open port', async () => {
    const { bridge, transports, stop } = wire();
    await new IpcSerialTransport(bridge, '/dev/ttyUSB0').open(opts);
    await stop();
    expect(transports[0]!.state).toBe('closed');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { SerialPortMock } from 'serialport';
import type { SerialOptions } from '@someterm/core';
import { NodeSerialTransport, nodeCapabilities, type PortFactory } from './node';

const opts: SerialOptions = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' };
const PATH = '/dev/MOCK0';
const MockBinding = SerialPortMock.binding;
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function setup(platform = 'linux') {
  MockBinding.reset();
  MockBinding.createPort(PATH, { echo: true, record: true });
  let port: SerialPortMock | null = null;
  const setCalls: object[] = [];
  const opened: object[] = [];
  const factory: PortFactory = (path, o) => {
    const p = new SerialPortMock({ path, baudRate: o.baudRate, dataBits: o.dataBits, stopBits: o.stopBits, parity: o.parity, rtscts: o.flowControl === 'rtscts', xon: o.flowControl === 'xonxoff', xoff: o.flowControl === 'xonxoff', autoOpen: false });
    const origSet = p.set.bind(p);
    p.set = ((s: object, cb?: (e: Error | null) => void) => { setCalls.push({ ...s }); return origSet(s as never, cb as never); }) as typeof p.set;
    opened.push(o);
    port = p;
    return p as never;
  };
  const t = new NodeSerialTransport(PATH, factory, nodeCapabilities(platform), () => 42);
  const got: number[][] = [];
  const errors: string[] = [];
  let closes = 0;
  t.onData((c, ts) => { expect(ts).toBe(42); got.push([...c]); });
  t.onError((e) => errors.push(e.message));
  t.onClose(() => closes++);
  return { t, got, errors, setCalls, opened, port: () => port!, closes: () => closes };
}

afterEach(() => MockBinding.reset());

describe('nodeCapabilities', () => {
  it('mark/space and 1.5 stop bits only on Windows; no DSR/DTR flow; no RI anywhere', () => {
    for (const p of ['linux', 'darwin']) {
      const c = nodeCapabilities(p);
      expect([c.markSpaceParity, c.oneAndHalfStopBits, c.dsrDtrFlow, c.ringIndicator, c.xonXoffFlow, c.fiveSixDataBits]).toEqual([false, false, false, false, true, true]);
    }
    const w = nodeCapabilities('win32');
    expect([w.markSpaceParity, w.oneAndHalfStopBits]).toEqual([true, true]);
  });
});

describe('NodeSerialTransport (mock binding)', () => {
  it('echoes exact bytes including NUL and 0xFF', async () => {
    const { t, got } = setup();
    await t.open(opts);
    await t.write(Uint8Array.of(0x00, 0x41, 0xff, 0x0d, 0x0a));
    await wait();
    expect(got.flat()).toEqual([0x00, 0x41, 0xff, 0x0d, 0x0a]);
  });

  it('accepts XON/XOFF and 5 data bits, which Web Serial cannot do', async () => {
    const { t, opened } = setup();
    await t.open({ ...opts, flowControl: 'xonxoff', dataBits: 5 });
    expect(opened).toHaveLength(1);
  });

  it('refuses mark parity off Windows before touching the port', async () => {
    const { t, opened } = setup('linux');
    await expect(t.open({ ...opts, parity: 'mark' })).rejects.toThrow('mark parity');
    expect(opened).toHaveLength(0);
  });

  it('always sends the full DTR/RTS/break state so one change does not reset the other', async () => {
    const { t, setCalls } = setup();
    await t.open(opts);
    await t.setSignals({ rts: false });
    await t.setSignals({ dtr: false });
    await t.sendBreak(5);
    expect(setCalls).toEqual([
      { dtr: true, rts: false, brk: false },
      { dtr: false, rts: false, brk: false },
      { dtr: false, rts: false, brk: true },
      { dtr: false, rts: false, brk: false },
    ]);
  });

  it('reports CTS/DSR/DCD and RI false', async () => {
    const { t } = setup();
    await t.open(opts);
    const s = await t.getSignals();
    expect(Object.keys(s).sort()).toEqual(['cts', 'dcd', 'dsr', 'ri']);
    expect(s.ri).toBe(false);
  });

  it('close fires onClose once and blocks further I/O', async () => {
    const { t, closes } = setup();
    await t.open(opts);
    await t.close();
    await t.close();
    expect(closes()).toBe(1);
    expect(t.state).toBe('closed');
    await expect(t.write(Uint8Array.of(1))).rejects.toThrow('not open');
  });

  it('unplug reports an error and closes', async () => {
    const { t, errors, closes, port } = setup();
    await t.open(opts);
    port().emit('close', Object.assign(new Error('gone'), { disconnected: true }));
    expect(errors).toEqual(['The device has been disconnected.']);
    expect(closes()).toBe(1);
    expect(t.state).toBe('closed');
  });

  it('can reopen after close', async () => {
    const { t, got } = setup();
    await t.open(opts);
    await t.close();
    await t.open(opts);
    await t.write(Uint8Array.of(7));
    await wait();
    expect(got.flat()).toEqual([7]);
  });
});

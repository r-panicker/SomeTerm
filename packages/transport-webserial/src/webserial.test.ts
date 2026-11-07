import { describe, expect, it } from 'vitest';
import type { SerialOptions } from '@someterm/core';
import { WebSerialTransport, describePort } from './webserial';
import { FakeSerialPort } from './fake-port';

const opts: SerialOptions = { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' };
const tick = () => new Promise((r) => setTimeout(r, 5));

function setup() {
  const port = new FakeSerialPort();
  let now = 0;
  const t = new WebSerialTransport(port as unknown as SerialPort, () => ++now);
  const got: number[][] = [];
  const errors: string[] = [];
  let closes = 0;
  t.onData((c) => got.push([...c]));
  t.onError((e) => errors.push(e.message));
  t.onClose(() => closes++);
  return { port, t, got, errors, closes: () => closes };
}

describe('WebSerialTransport', () => {
  it('maps options onto Web Serial and delivers received bytes exactly', async () => {
    const { port, t, got } = setup();
    await t.open({ ...opts, flowControl: 'rtscts', parity: 'even', stopBits: 2, dataBits: 7 });
    expect(port.openedWith).toEqual({ baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even', flowControl: 'hardware' });
    port.receive([0x00, 0x41, 0xff]);
    port.receive([0x0d, 0x0a]);
    await tick();
    expect(got).toEqual([[0x00, 0x41, 0xff], [0x0d, 0x0a]]);
  });

  it('writes bytes through, unaffected by later mutation of the caller buffer', async () => {
    const { port, t } = setup();
    await t.open(opts);
    const buf = Uint8Array.from([1, 2, 3]);
    const p = t.write(buf);
    buf.fill(0);
    await p;
    await tick();
    expect(port.written).toEqual([1, 2, 3]);
  });

  it('refuses options Web Serial cannot do, without touching the port', async () => {
    const { port, t } = setup();
    await expect(t.open({ ...opts, flowControl: 'xonxoff' })).rejects.toThrow('XON/XOFF');
    await expect(t.open({ ...opts, parity: 'mark' })).rejects.toThrow('mark parity');
    expect(port.openedWith).toBeNull();
    expect(t.state).toBe('closed');
  });

  it('reports a line error and keeps receiving on the replacement stream', async () => {
    const { port, t, got, errors } = setup();
    await t.open(opts);
    port.receive([1]);
    await tick();
    port.lineError('Parity error.');
    await tick();
    port.receive([2]);
    await tick();
    expect(got).toEqual([[1], [2]]);
    expect(errors).toEqual(['Parity error.']);
    expect(t.state).toBe('open');
  });

  it('closes itself and notifies when the device is unplugged', async () => {
    const { port, t, errors, closes } = setup();
    await t.open(opts);
    port.unplug();
    await tick();
    expect(t.state).toBe('closed');
    expect(errors).toEqual(['The device has been lost.']);
    expect(closes()).toBe(1);
  });

  it('close cancels reading, closes the port, reports no error, fires onClose once', async () => {
    const { port, t, errors, closes } = setup();
    await t.open(opts);
    await t.close();
    await t.close();
    expect(port.closed).toBe(true);
    expect(errors).toEqual([]);
    expect(closes()).toBe(1);
    await expect(t.write(Uint8Array.of(1))).rejects.toThrow('not open');
  });

  it('can reopen after close', async () => {
    const { port, t, got } = setup();
    await t.open(opts);
    await t.close();
    await t.open(opts);
    port.receive([7]);
    await tick();
    expect(got).toEqual([[7]]);
  });

  it('maps DTR/RTS out and CTS/DSR/DCD/RI in', async () => {
    const { port, t } = setup();
    await t.open(opts);
    await t.setSignals({ dtr: true, rts: false });
    expect(port.signalLog).toEqual([{ dataTerminalReady: true, requestToSend: false }]);
    port.inputSignals = { clearToSend: true, dataSetReady: false, dataCarrierDetect: true, ringIndicator: false };
    expect(await t.getSignals()).toEqual({ cts: true, dsr: false, dcd: true, ri: false });
  });

  it('holds break for the requested time then releases it', async () => {
    const { port, t } = setup();
    await t.open(opts);
    const start = Date.now();
    await t.sendBreak(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
    expect(port.signalLog).toEqual([{ break: true }, { break: false }]);
  });
});

describe('describePort', () => {
  const port = (usbVendorId?: number, usbProductId?: number) =>
    ({ getInfo: () => ({ usbVendorId, usbProductId }) }) as unknown as SerialPort;
  it('names known vendors and formats IDs', () => {
    expect(describePort(port(0x2341, 0x43))).toBe('Arduino 2341:0043');
    expect(describePort(port(0xabcd, 0x1))).toBe('USB ABCD:0001');
    expect(describePort(port())).toBe('Serial port');
  });

  it('numbers ports that would otherwise read the same, in grant order', () => {
    const a = port(), b = port(), c = port(0x2341, 0x43), d = port(0x2341, 0x43), e = port(0x0403, 0x6001);
    const all = [a, c, b, e, d];
    expect(all.map((x) => describePort(x, all))).toEqual(['Serial port #1', 'Arduino 2341:0043 #1', 'Serial port #2', 'FTDI 0403:6001', 'Arduino 2341:0043 #2']);
    expect(describePort(port(), all)).toBe('Serial port');
  });
});

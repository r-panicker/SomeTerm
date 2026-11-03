import { describe, expect, it } from 'vitest';
import { LoopbackTransport } from './loopback';
import { unsupportedOptions, type SerialOptions } from '../transport';

const opts: SerialOptions = {
  baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none',
};

const collect = (t: LoopbackTransport) => {
  const chunks: { bytes: number[]; at: number }[] = [];
  t.onData((c, at) => chunks.push({ bytes: [...c], at }));
  return chunks;
};
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('LoopbackTransport', () => {
  it('echoes exactly the bytes written, including NUL and 0xFF', async () => {
    let now = 100;
    const t = new LoopbackTransport({}, () => now++);
    const got = collect(t);
    await t.open(opts);
    await t.write(new Uint8Array([0x48, 0x69, 0x00, 0xff, 0x0d, 0x0a]));
    await flush();
    expect(got).toEqual([{ bytes: [0x48, 0x69, 0x00, 0xff, 0x0d, 0x0a], at: 100 }]);
  });

  it('is unaffected by the caller mutating its buffer after write', async () => {
    const t = new LoopbackTransport();
    const got = collect(t);
    await t.open(opts);
    const buf = new Uint8Array([1, 2, 3]);
    await t.write(buf);
    buf.fill(9);
    await flush();
    expect(got[0]?.bytes).toEqual([1, 2, 3]);
  });

  it('wires RTS to CTS and DTR to DSR, and clears them on close', async () => {
    const t = new LoopbackTransport();
    await t.open(opts);
    await t.setSignals({ rts: true });
    expect(await t.getSignals()).toEqual({ cts: true, dsr: false, dcd: false, ri: false });
    await t.setSignals({ dtr: true });
    expect((await t.getSignals()).dsr).toBe(true);
    await t.close();
    await t.open(opts);
    expect(await t.getSignals()).toEqual({ cts: false, dsr: false, dcd: false, ri: false });
  });

  it('rejects I/O on a closed port and double open', async () => {
    const t = new LoopbackTransport();
    await expect(t.write(new Uint8Array([1]))).rejects.toThrow('not open');
    await t.open(opts);
    await expect(t.open(opts)).rejects.toThrow('already open');
  });

  it('drops in-flight data when closed before delivery', async () => {
    const t = new LoopbackTransport();
    const got = collect(t);
    await t.open(opts);
    const pending = t.write(new Uint8Array([1]));
    await t.close();
    await pending;
    await flush();
    expect(got).toEqual([]);
  });

  it('stops delivering after unsubscribe', async () => {
    const t = new LoopbackTransport();
    const seen: number[] = [];
    const off = t.onData((c) => seen.push(c.length));
    await t.open(opts);
    off();
    await t.write(new Uint8Array([1]));
    await flush();
    expect(seen).toEqual([]);
  });
});

describe('capability checking', () => {
  const web = {
    markSpaceParity: false, xonXoffFlow: false, dsrDtrFlow: false,
    oneAndHalfStopBits: false, fiveSixDataBits: false,
  };

  it('reports each unsupported option with a reason', () => {
    const t = new LoopbackTransport(web);
    expect(
      unsupportedOptions(t.capabilities, {
        ...opts, parity: 'mark', flowControl: 'xonxoff', stopBits: 1.5, dataBits: 7,
      }),
    ).toEqual([
      'mark parity is not available on this transport',
      'XON/XOFF flow control is not available on this transport',
      '1.5 stop bits are not available on this transport',
    ]);
  });

  it('refuses to open with unsupported options and stays closed', async () => {
    const t = new LoopbackTransport(web);
    await expect(t.open({ ...opts, parity: 'space' })).rejects.toThrow('space parity');
    expect(t.state).toBe('closed');
  });

  it('accepts supported options', () => {
    expect(unsupportedOptions(new LoopbackTransport(web).capabilities, opts)).toEqual([]);
  });
});

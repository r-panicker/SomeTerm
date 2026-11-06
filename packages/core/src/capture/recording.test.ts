import { describe, expect, it } from 'vitest';
import { Capture } from './capture';
import { decodeSignals, encodeHeader, encodeRecord, encodeSignals, parseRecording } from './recording';
import { ReplayTransport } from '../mock/replay';

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const T0 = 1_800_000_000_000;

async function record(feed: (c: Capture) => void, extra: Partial<ConstructorParameters<typeof Capture>[1]> = {}) {
  const chunks: number[] = [];
  const sink = { write: (b: Uint8Array) => void chunks.push(...b), close: async () => {} };
  const c = new Capture(sink, { source: 'rx', format: 'session', meta: { port: 'COM5 · 测试', options: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' } }, ...extra }, T0);
  feed(c);
  await c.stop();
  return Uint8Array.from(chunks);
}

describe('recording format', () => {
  it('round-trips rx, tx and signal records with relative times, both directions regardless of source', async () => {
    const file = await record((c) => {
      c.tx(enc('AT\r\n'), T0 + 5);
      c.signals({ cts: true, dsr: false, dcd: true, ri: false, dtr: true, rts: false }, T0 + 6);
      c.rx(Uint8Array.of(0, 0xff, 0x0a), T0 + 12.5);
    });
    const r = parseRecording(file);
    expect(r.meta).toMatchObject({ version: 1, created: T0, port: 'COM5 · 测试' });
    expect(r.meta.options?.baudRate).toBe(9600);
    expect(r.records.map((x) => [x.kind, x.t, [...x.data]])).toEqual([
      ['tx', 5, [0x41, 0x54, 0x0d, 0x0a]],
      ['signals', 6, [...encodeSignals({ cts: true, dsr: false, dcd: true, ri: false, dtr: true, rts: false })]],
      ['rx', 12.5, [0, 0xff, 0x0a]],
    ]);
    expect(r.duration).toBe(12.5);
    expect(r.truncated).toBe(false);
  });

  it('header is pure ASCII even with non-ASCII metadata', () => {
    const h = encodeHeader({ version: 1, created: 1, port: 'µC' });
    expect([...h].every((b) => b < 0x80)).toBe(true);
  });

  it('a file cut mid-record keeps every complete record and says so', () => {
    const full = Uint8Array.from([...encodeHeader({ version: 1, created: 0 }), ...encodeRecord('rx', 1, enc('ab')), ...encodeRecord('rx', 2, enc('cd'))]);
    const r = parseRecording(full.subarray(0, full.length - 1));
    expect(r.records.map((x) => String.fromCharCode(...x.data))).toEqual(['ab']);
    expect(r.truncated).toBe(true);
  });

  it('rejects other files', () => {
    expect(() => parseRecording(enc('hello'))).toThrow('Not a SomeTerm recording');
    expect(() => parseRecording(enc('STREC1\n{"version":9,"created":1}\n'))).toThrow('Unsupported');
  });

  it('opens recordings saved under the earlier name', () => {
    const r = parseRecording(Uint8Array.from([...enc('SSREC1\n{"version":1,"created":0}\n'), ...encodeRecord('rx', 1, enc('hi'))]));
    expect(r.records.map((x) => String.fromCharCode(...x.data))).toEqual(['hi']);
  });

  it('signal bits round-trip', () => {
    const s = { cts: false, dsr: true, dcd: false, ri: true, dtr: false, rts: true };
    expect(decodeSignals(encodeSignals(s))).toEqual(s);
  });
});

describe('ReplayTransport', () => {
  const rec = parseRecording(Uint8Array.from([
    ...encodeHeader({ version: 1, created: 0 }),
    ...encodeRecord('rx', 10, enc('a')),
    ...encodeRecord('tx', 20, enc('T')),
    ...encodeRecord('signals', 25, encodeSignals({ cts: true, dsr: false, dcd: false, ri: false, dtr: false, rts: true })),
    ...encodeRecord('rx', 30, enc('bb')),
    ...encodeRecord('rx', 30, enc('cc')),
    ...encodeRecord('rx', 50, enc('d')),
  ]));

  async function setup() {
    const t = new ReplayTransport(rec, () => 1000);
    const log: string[] = [];
    t.onData((c, at) => log.push(`rx:${String.fromCharCode(...c)}@${at}`));
    t.onTx((c, at) => log.push(`tx:${String.fromCharCode(...c)}@${at}`));
    t.onSignals((s) => log.push(`sig:${s.cts ? 'C' : 'c'}${s.rts ? 'R' : 'r'}`));
    await t.open({ baudRate: 1, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    log.length = 0;
    return { t, log };
  }

  it('delivers records in order up to a time, with timestamps on the clock origin', async () => {
    const { t, log } = await setup();
    t.advanceTo(25);
    expect(log).toEqual(['rx:a@1010', 'tx:T@1020', 'sig:CR']);
    expect(await t.getSignals()).toEqual({ cts: true, dsr: false, dcd: false, ri: false });
    expect(t.position).toBe(25);
    t.advanceTo(100);
    expect(log.slice(3)).toEqual(['rx:bb@1030', 'rx:cc@1030', 'rx:d@1050']);
    expect(t.ended).toBe(true);
    expect(t.position).toBe(50);
  });

  it('a byte budget spreads a fast-forward without losing or repeating records', async () => {
    const { t, log } = await setup();
    let frames = 1;
    while (!t.advanceTo(100, 2)) frames++;
    expect(frames).toBeGreaterThan(1);
    expect(log.filter((l) => l.startsWith('rx')).map((l) => l.slice(3, l.indexOf('@')))).toEqual(['a', 'bb', 'cc', 'd']);
  });

  it('rewind starts over and resets signals; sending is refused', async () => {
    const { t, log } = await setup();
    t.advanceTo(100);
    t.rewind();
    expect(t.position).toBe(0);
    expect(log[log.length - 1]).toBe('sig:cr');
    t.advanceTo(10);
    expect(log[log.length - 1]).toBe('rx:a@1010');
    await expect(t.write()).rejects.toThrow('cannot be sent');
  });
});

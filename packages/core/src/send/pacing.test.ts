import { describe, expect, it } from 'vitest';
import { planWrites, repeatSend, sendPaced } from './pacing';

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const str = (b: Uint8Array) => String.fromCharCode(...b);
const plan = (s: string, o: Parameters<typeof planWrites>[1], chunk?: number) =>
  planWrites(enc(s), o, chunk).map((p) => [str(p.bytes), p.delayAfter]);

describe('planWrites', () => {
  it('no delays: chunks only', () => {
    expect(plan('abcdefg', {}, 3)).toEqual([['abc', 0], ['def', 0], ['g', 0]]);
  });
  it('line delay splits after LF, CRLF and lone CR', () => {
    expect(plan('a\nb\r\nc\rd', { lineDelayMs: 50 })).toEqual([['a\n', 50], ['b\r\n', 50], ['c\r', 50], ['d', 0]]);
  });
  it('byte delay writes single bytes; line delay adds at line ends', () => {
    expect(plan('a\nb', { byteDelayMs: 2, lineDelayMs: 10 })).toEqual([['a', 2], ['\n', 12], ['b', 2]]);
  });
});

describe('sendPaced', () => {
  it('writes everything in order, sleeps between writes but not after the last', async () => {
    const writes: string[] = [];
    const sleeps: number[] = [];
    const n = await sendPaced(enc('ab\ncd\n'), { lineDelayMs: 30 }, async (b) => void writes.push(str(b)), async (ms) => void sleeps.push(ms));
    expect(writes).toEqual(['ab\n', 'cd\n']);
    expect(sleeps).toEqual([30]);
    expect(n).toBe(6);
  });
  it('stops between writes when cancelled and reports bytes sent', async () => {
    const token = { cancelled: false };
    const writes: string[] = [];
    const n = await sendPaced(enc('abcd'), { byteDelayMs: 1 }, async (b) => {
      writes.push(str(b));
      if (writes.length === 2) token.cancelled = true;
    }, async () => {}, token);
    expect(writes).toEqual(['a', 'b']);
    expect(n).toBe(2);
  });
});

describe('repeatSend', () => {
  it('sends count times with the interval measured start to start', async () => {
    let t = 0;
    const sleeps: number[] = [];
    const n = await repeatSend(3, 100, async () => { t += 30; }, async (ms) => { sleeps.push(ms); t += ms; }, () => t, { cancelled: false });
    expect(n).toBe(3);
    expect(sleeps).toEqual([70, 70]);
  });
  it('count 0 repeats until cancelled', async () => {
    const token = { cancelled: false };
    const n = await repeatSend(0, 0, async () => {}, async () => {}, () => 0, token, (k) => { if (k === 5) token.cancelled = true; });
    expect(n).toBe(5);
  });
});

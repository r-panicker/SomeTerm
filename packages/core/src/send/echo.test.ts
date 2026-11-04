import { describe, expect, it } from 'vitest';
import { EchoMatcher, sendWithEcho, type SetTimer } from './echo';

/** Manual timers so timeouts fire only when the test says. */
function timers() {
  const live = new Map<number, () => void>();
  let id = 0;
  const setTimer: SetTimer = (fn) => { const k = ++id; live.set(k, fn); return () => void live.delete(k); };
  const fireAll = () => { const fns = [...live.values()]; live.clear(); fns.forEach((f) => f()); };
  return { setTimer, fireAll, pending: () => live.size };
}
const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('sendWithEcho', () => {
  it('sends one byte at a time, each only after the previous echo', async () => {
    const t = timers();
    const m = new EchoMatcher(t.setTimer);
    const writes: string[] = [];
    // An echoing device: writes come straight back.
    const n = await sendWithEcho(enc('AT\r'), { echoTimeoutMs: 100 }, async (b) => { writes.push(String.fromCharCode(...b)); queueMicrotask(() => m.feed(b)); }, m, async () => {});
    expect(writes).toEqual(['A', 'T', '\r']);
    expect(n).toBe(3);
    expect(t.pending()).toBe(0);
  });

  it('stops with the reason when no echo arrives in time', async () => {
    const t = timers();
    const m = new EchoMatcher(t.setTimer);
    const writes: number[] = [];
    const run = sendWithEcho(enc('ab'), { echoTimeoutMs: 250 }, async (b) => void writes.push(b[0]!), m, async () => {});
    await tick();
    t.fireAll();
    await expect(run).rejects.toThrow("No echo for 0x61 'a' within 250 ms");
    expect(writes).toEqual([0x61]);
  });

  it('a different byte back is a mismatch, reported with both bytes', async () => {
    const t = timers();
    const m = new EchoMatcher(t.setTimer);
    const run = sendWithEcho(enc('a'), { echoTimeoutMs: 100 }, async () => queueMicrotask(() => m.feed(Uint8Array.of(0x0d))), m, async () => {});
    await expect(run).rejects.toThrow("Echo mismatch: sent 0x61 'a', got 0x0D");
  });

  it('echo then reply in one chunk: the reply is not taken as the next echo', async () => {
    const t = timers();
    const m = new EchoMatcher(t.setTimer);
    let first = true;
    const run = sendWithEcho(enc('ab'), { echoTimeoutMs: 100 }, async (b) => {
      // the device echoes 'a' and immediately sends 'X'; 'b' then gets echoed normally
      const chunk = first ? Uint8Array.of(b[0]!, 0x58) : b;
      first = false;
      queueMicrotask(() => m.feed(chunk));
    }, m, async () => {});
    await expect(run).rejects.toThrow("sent 0x62 'b', got 0x58 'X'");
  });

  it('bytes received before a send are not taken as its echo', async () => {
    const t = timers();
    const m = new EchoMatcher(t.setTimer);
    m.feed(enc('zzz'));
    const n = await sendWithEcho(enc('q'), { echoTimeoutMs: 100 }, async (b) => queueMicrotask(() => m.feed(b)), m, async () => {});
    expect(n).toBe(1);
  });

  it('pacing delays apply after each echoed byte, plus the line delay at line ends', async () => {
    const t = timers();
    const m = new EchoMatcher(t.setTimer);
    const sleeps: number[] = [];
    await sendWithEcho(enc('a\nb'), { echoTimeoutMs: 100, byteDelayMs: 2, lineDelayMs: 10 }, async (b) => queueMicrotask(() => m.feed(b)), m, async (ms) => void sleeps.push(ms));
    expect(sleeps).toEqual([2, 12]);
  });

  it('cancelling stops between bytes', async () => {
    const t = timers();
    const m = new EchoMatcher(t.setTimer);
    const token = { cancelled: false };
    const n = await sendWithEcho(enc('abc'), { echoTimeoutMs: 100 }, async (b) => { queueMicrotask(() => m.feed(b)); token.cancelled = true; }, m, async () => {}, token);
    expect(n).toBe(1);
  });
});

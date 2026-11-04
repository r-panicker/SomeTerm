import { describe, expect, it } from 'vitest';
import { Capture, formatStamp, type CaptureOptions } from './capture';

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const T0 = new Date(2026, 10, 3, 13, 5, 9, 7).getTime();

function setup(options: CaptureOptions, failAfter = Infinity) {
  const out: number[] = [];
  let closed = 0;
  let writes = 0;
  const sink = {
    write: async (b: Uint8Array) => {
      if (++writes > failAfter) throw new Error('disk full');
      out.push(...b);
    },
    close: async () => void closed++,
  };
  const stops: string[] = [];
  const c = new Capture(sink, options, T0, (cap) => stops.push(cap.stopReason));
  const text = () => String.fromCharCode(...out);
  return { c, out, text, stops, closed: () => closed };
}

describe('formatStamp', () => {
  it('is local, zero padded, millisecond precision', () => {
    expect(formatStamp(T0)).toBe('2026-11-03 13:05:09.007');
  });
});

describe('Capture', () => {
  it('raw keeps exact bytes in order and filters by direction', async () => {
    const { c, out, closed } = setup({ source: 'rx', format: 'raw' });
    c.rx(Uint8Array.of(0, 0xff, 0x0d), T0);
    c.tx(Uint8Array.of(9), T0);
    c.rx(Uint8Array.of(0x0a), T0);
    await c.stop();
    expect(out).toEqual([0, 0xff, 0x0d, 0x0a]);
    expect(closed()).toBe(1);
  });

  it('text: one stamped line per line, RX/TX tags only for both, partial flushed on stop', async () => {
    const { c, text } = setup({ source: 'both', format: 'text' });
    c.tx(enc('AT\r\n'), T0);
    c.rx(enc('OK\r\nhal'), T0 + 5);
    c.rx(enc('f'), T0 + 6);
    await c.stop();
    expect(text()).toBe(
      '2026-11-03 13:05:09.007 TX AT\n' +
      '2026-11-03 13:05:09.012 RX OK\n' +
      '2026-11-03 13:05:09.013 RX half\n',
    );
  });

  it('text without tags for a single direction; preserves non-ASCII bytes', async () => {
    const { c, out } = setup({ source: 'rx', format: 'text' });
    c.rx(Uint8Array.of(0xc2, 0xb0, 0x0a), T0);
    await c.stop();
    expect(out.slice(-4)).toEqual([0x20, 0xc2, 0xb0, 0x0a]);
  });

  it('hex: one stamped line per chunk', async () => {
    const { c, text } = setup({ source: 'rx', format: 'hex' });
    c.rx(Uint8Array.of(0x41, 0x0d), T0);
    await c.stop();
    expect(text()).toBe('2026-11-03 13:05:09.007 41 0D\n');
  });

  it('size limit truncates the crossing chunk exactly and stops', async () => {
    const { c, out, stops } = setup({ source: 'rx', format: 'raw', maxBytes: 5 });
    c.rx(Uint8Array.of(1, 2, 3), T0);
    c.rx(Uint8Array.of(4, 5, 6, 7), T0);
    c.rx(Uint8Array.of(8), T0);
    await c.done;
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(stops).toEqual(['size limit reached']);
  });

  it('time limit stops on tick even with no data', async () => {
    const { c, stops } = setup({ source: 'rx', format: 'raw', maxSeconds: 2 });
    c.tick(T0 + 1999);
    expect(c.state).toBe('running');
    c.tick(T0 + 2000);
    await c.done;
    expect(stops).toEqual(['time limit reached']);
  });

  it('pause drops data until resumed', async () => {
    const { c, out } = setup({ source: 'rx', format: 'raw' });
    c.rx(Uint8Array.of(1), T0);
    c.pause();
    c.rx(Uint8Array.of(2), T0);
    c.resume();
    c.rx(Uint8Array.of(3), T0);
    await c.stop();
    expect(out).toEqual([1, 3]);
  });

  it('start after N bytes begins exactly at byte N+1 and limits count from there', async () => {
    const { c, out } = setup({ source: 'rx', format: 'raw', startAfterBytes: 5, maxBytes: 3 });
    expect(c.state).toBe('armed');
    c.rx(Uint8Array.of(1, 2, 3), T0);
    c.rx(Uint8Array.of(4, 5, 6, 7), T0 + 10);
    c.rx(Uint8Array.of(8, 9), T0 + 20);
    await c.done;
    expect(out).toEqual([6, 7, 8]);
    expect(c.startedAt).toBe(T0 + 10);
  });

  it('start on text includes the match, even when it is split across chunks', async () => {
    const { c, text } = setup({ source: 'rx', format: 'raw', startOnText: 'READY\\r\\n' });
    c.rx(enc('boot...RE'), T0);
    expect(c.state).toBe('armed');
    c.rx(enc('ADY\r\nv:1\n'), T0 + 5);
    c.rx(enc('v:2\n'), T0 + 6);
    await c.stop();
    expect(text()).toBe('READY\r\nv:1\nv:2\n');
  });

  it('text trigger watches only the captured direction', async () => {
    const { c, out } = setup({ source: 'rx', format: 'raw', startOnText: 'GO' });
    c.tx(enc('GO'), T0);
    expect(c.state).toBe('armed');
    c.rx(enc('xGOy'), T0);
    await c.stop();
    expect(String.fromCharCode(...out)).toBe('GOy');
  });

  it('armed: the time limit waits for the trigger; stopping while armed writes nothing', async () => {
    const { c, out, closed } = setup({ source: 'rx', format: 'raw', startOnText: 'Z', maxSeconds: 1 });
    c.tick(T0 + 5000);
    expect(c.state).toBe('armed');
    await c.stop();
    expect(out).toEqual([]);
    expect(closed()).toBe(1);
  });

  it('a sink error stops the capture with the reason', async () => {
    const { c, out, stops } = setup({ source: 'rx', format: 'raw' }, 1);
    c.rx(Uint8Array.of(1), T0);
    c.rx(Uint8Array.of(2), T0);
    await c.done;
    expect(out).toEqual([1]);
    expect(stops).toEqual(['write failed: disk full']);
  });
});

import { describe, expect, it } from 'vitest';
import { RxPipeline } from './rx';

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('RxPipeline', () => {
  it('renders lines, extracts samples only from numeric lines, reports the partial', () => {
    const p = new RxPipeline('auto');
    p.apply({ type: 'data', chunk: enc('boot\r\nt:1,h:2\r\n\x01x'), time: 5 });
    expect(p.drain()).toEqual({
      lines: [
        { text: 'boot', runs: [], time: 5, offset: 0, samples: null },
        { text: 't:1,h:2', runs: [], time: 5, offset: 6, samples: [{ name: 't', value: 1 }, { name: 'h', value: 2 }] },
      ],
      partial: { text: '␁x', runs: [], time: 5, offset: 15 },
    });
  });

  it('a trailing CR (CRLF sender, LF mode) still plots but stays visible', () => {
    const p = new RxPipeline('lf');
    p.apply({ type: 'data', chunk: enc('5,6\r\n'), time: 0 });
    const [l] = p.drain()!.lines;
    expect(l!.text).toBe('5,6\u240d');
    expect(l!.samples).toEqual([{ name: '1', value: 5 }, { name: '2', value: 6 }]);
  });

  it('coloured numeric output still plots; raw kept only for lines with escapes', () => {
    const p = new RxPipeline('auto');
    p.apply({ type: 'data', chunk: enc('\x1b[32mtemp:21.5\x1b[0m\nplain\n'), time: 0 });
    const [a, b] = p.drain()!.lines;
    expect(a!.text).toBe('temp:21.5');
    expect(a!.samples).toEqual([{ name: 'temp', value: 21.5 }]);
    expect(a!.runs).toEqual([{ from: 0, to: 9, fg: 2 }]);
    expect(a!.raw).toBe('␛[32mtemp:21.5␛[0m');
    expect(b!.raw).toBeUndefined();
  });

  it('drain is null when nothing changed and does not repeat lines', () => {
    const p = new RxPipeline();
    expect(p.drain()).toBeNull();
    p.apply({ type: 'data', chunk: enc('a\n'), time: 0 });
    expect(p.drain()?.lines).toHaveLength(1);
    expect(p.drain()).toBeNull();
  });

  it('reset changes newline mode, drops pending output and keeps offsets absolute', () => {
    const p = new RxPipeline('lf');
    p.apply({ type: 'data', chunk: enc('abc'), time: 0 });
    p.apply({ type: 'reset', mode: 'cr', offset: 3 });
    p.apply({ type: 'data', chunk: enc('x\ry\r'), time: 1 });
    expect(p.drain()?.lines.map((l) => [l.text, l.offset])).toEqual([['x', 3], ['y', 5]]);
  });
});

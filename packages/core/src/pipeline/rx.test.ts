import { describe, expect, it } from 'vitest';
import { RxPipeline } from './rx';

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('RxPipeline', () => {
  it('renders lines, extracts samples only from numeric lines, reports the partial', () => {
    const p = new RxPipeline('auto');
    p.apply({ type: 'data', chunk: enc('boot\r\nt:1,h:2\r\n\x01x'), time: 5 });
    expect(p.drain()).toEqual({
      lines: [
        { text: 'boot', runs: [], time: 5, offset: 0, len: 4, samples: null },
        { text: 't:1,h:2', runs: [], time: 5, offset: 6, len: 7, samples: [{ name: 't', value: 1 }, { name: 'h', value: 2 }] },
      ],
      partial: { text: '␁x', runs: [], time: 5, offset: 15, len: 2 },
    });
  });

  it('LF mode shows the CR of a CRLF sender, as CR mode shows its LF, and both still plot', () => {
    const lf = new RxPipeline('lf');
    lf.apply({ type: 'data', chunk: enc('5,6\r\n'), time: 0 });
    const [l] = lf.drain()!.lines;
    expect(l!.text).toBe('5,6␍');
    expect(l!.len).toBe(4);
    expect(l!.samples).toEqual([{ name: '1', value: 5 }, { name: '2', value: 6 }]);
    const cr = new RxPipeline('cr');
    cr.apply({ type: 'data', chunk: enc('1,2\r\n3,4\r\n'), time: 0 });
    const [, m] = cr.drain()!.lines;
    expect(m!.text).toBe('␊3,4');
    expect(m!.samples).toEqual([{ name: '1', value: 3 }, { name: '2', value: 4 }]);
  });

  it('only auto returns to the line start on a lone CR; a chosen ending shows it, and BS still erases', () => {
    const auto = new RxPipeline('auto');
    auto.apply({ type: 'data', chunk: enc('x\n10%\r55%\n'), time: 0 });
    expect(auto.drain()!.lines.map((l) => l.text)).toEqual(['x', '55%']);
    const lf = new RxPipeline('lf');
    lf.apply({ type: 'data', chunk: enc('10%\r55%\nab\b \bc\n'), time: 0 });
    expect(lf.drain()!.lines.map((l) => l.text)).toEqual(['10%␍55%', 'ac']);
  });

  it('a re-cut parses received bytes again with the new line ending, keeping arrival times, then carries on live', () => {
    const bytes = enc('one\ntwo\rthr');
    const { pipeline, batch } = RxPipeline.recut({ type: 'recut', id: 1, mode: 'cr', rows: false, width: 80, from: 100, bytes, cuts: [0, 4], times: [5, 9] });
    expect(batch.lines.map((l) => [l.text, l.offset, l.time])).toEqual([['one␊two', 100, 5]]);
    expect(batch.partial).toMatchObject({ text: 'thr', offset: 108, time: 9 });
    pipeline.apply({ type: 'data', chunk: enc('ee\r'), time: 12 });
    expect(pipeline.drain()!.lines.map((l) => [l.text, l.offset])).toEqual([['three', 108]]);
  });

  it('a re-cut with rows on cuts every byte at the width, while lines still plot by the line ending', () => {
    const bytes = enc('1,2\r\n3,4\r\nab\bcdefgh');
    const { pipeline, batch } = RxPipeline.recut({ type: 'recut', id: 1, mode: 'lf', rows: true, width: 8, from: 0, bytes, cuts: [0], times: [0] });
    expect(batch.lines.map((l) => [l.text, l.samples?.length])).toEqual([['1,2␍', 2], ['3,4␍', 2]]);
    // [CR] and [LF] take four characters each.
    expect(batch.rows!.done.map((r) => [r.text, r.offset, r.len])).toEqual([['1,2␍', 0, 4], ['␊3,4', 4, 4], ['␍␊', 8, 2], ['ab␈cd', 10, 5]]);
    expect(batch.rows!.partial).toMatchObject({ text: 'efgh', offset: 15 });
    pipeline.apply({ type: 'width', width: 4 });
    pipeline.apply({ type: 'data', chunk: enc('ij'), time: 1 });
    expect(pipeline.drain()!.rows).toMatchObject({ done: [{ text: 'efgh' }], partial: { text: 'ij' } });
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

import { describe, expect, it } from 'vitest';
import { renderLine } from './render';
import { RxPipeline } from './rx';
import { LineSplitter } from './lines';

const enc = (s: string) => new TextEncoder().encode(s);
const bytes = (...b: number[]) => Uint8Array.from(b);

describe('renderLine', () => {
  it('decodes UTF-8 and keeps invalid bytes as dots', () => {
    expect(renderLine(enc('T = 25.3 °C, 12 µA'), []).text).toBe('T = 25.3 °C, 12 µA');
    expect(renderLine(enc('ok ✓ 🙂'), []).text).toBe('ok ✓ 🙂');
    // Latin-1 degree sign, a lone continuation byte, an overlong '/', a truncated sequence
    expect(renderLine(bytes(0x32, 0x35, 0xb0, 0x43), []).text).toBe('25.C');
    expect(renderLine(bytes(0x80, 0x41), []).text).toBe('.A');
    expect(renderLine(bytes(0xc0, 0xaf), []).text).toBe('..');
    expect(renderLine(bytes(0x41, 0xe2, 0x82), []).text).toBe('A..');
    expect(renderLine(bytes(0xed, 0xa0, 0x80), []).text).toBe('...'); // UTF-16 surrogate
  });

  it('shows other control bytes as control pictures', () => {
    expect(renderLine(bytes(0x41, 0x00, 0x09, 0x1b, 0x7f), []).text).toBe('A␀␉␛␡');
  });

  it('applies a shell echo of Backspace', () => {
    expect(renderLine(enc('ls -lx\b \b'), []).text).toBe('ls -l');
    expect(renderLine(enc('ls -lx\b \b\b \ba'), []).text).toBe('ls -a');
    expect(renderLine(enc('\b\bab'), []).text).toBe('ab'); // nothing to the left
    expect(renderLine(enc('abc\bX'), []).text).toBe('abX');
  });

  it('CR returns to the start and overwrites, keeping what is longer', () => {
    expect(renderLine(enc('Flashing 10%\rFlashing 55%\rFlashing 100%'), []).text).toBe('Flashing 100%');
    expect(renderLine(enc('Flashing 100%\rDone'), []).text).toBe('Donehing 100%');
    expect(renderLine(enc('abc\r'), []).text).toBe('abc');
  });

  it('without edit, BS and CR stay visible', () => {
    expect(renderLine(enc('a\bb\rc'), [], false).text).toBe('a␈b␍c');
  });

  it('maps style runs from byte to text positions', () => {
    // "°C" in red after "25": bytes 2..5 are C2 B0 43, text 2..4 is "°C"
    const r = renderLine(enc('25°C ok'), [{ from: 2, to: 5, fg: 1 }]);
    expect(r.text).toBe('25°C ok');
    expect(r.runs).toEqual([{ from: 2, to: 4, fg: 1 }]);
    // overwrite with an unstyled character splits the run
    const o = renderLine(enc('abc\bX'), [{ from: 0, to: 3, fg: 2 }]);
    expect(o.text).toBe('abX');
    expect(o.runs).toEqual([{ from: 0, to: 2, fg: 2 }]);
  });
});

describe('auto line endings with lone CR', () => {
  const split = (s: string) => new LineSplitter('auto').push(enc(s), 0).map((l) => new TextDecoder().decode(l.bytes));

  it('a CR-only sender gets a line per CR', () => {
    expect(split('one\rtwo\rthree\r')).toEqual(['one', 'two', 'three']);
  });

  it('after the first LF, a lone CR is content and CRLF still ends one line', () => {
    expect(split('boot\r\n10%\r55%\r100%\r\nnext\n')).toEqual(['boot', '10%\r55%\r100%', 'next']);
  });

  it('a CR held at a chunk boundary is resolved by the next chunk', () => {
    const s = new LineSplitter('auto');
    const got = [...s.push(enc('x\n10%\r'), 0), ...s.push(enc('\n'), 1), ...s.push(enc('a\r'), 2), ...s.push(enc('b\n'), 3)];
    expect(got.map((l) => new TextDecoder().decode(l.bytes))).toEqual(['x', '10%', 'a\rb']);
  });

  it('the pipeline shows a progress line in place, with its byte length', () => {
    const p = new RxPipeline('auto');
    p.apply({ type: 'data', chunk: enc('start\nFlashing 10%\rFlashing 55%'), time: 0 });
    const b = p.drain()!;
    expect(b.lines.map((l) => l.text)).toEqual(['start']);
    expect(b.partial).toMatchObject({ text: 'Flashing 55%', len: 25 });
    p.apply({ type: 'data', chunk: enc('\rFlashing 100%\r\n'), time: 1 });
    const [l] = p.drain()!.lines;
    expect(l).toMatchObject({ text: 'Flashing 100%', len: 39 });
  });

  it('UTF-8 split across chunks decodes once the line is complete', () => {
    const p = new RxPipeline('auto');
    const deg = enc('25°C\n');
    p.apply({ type: 'data', chunk: deg.subarray(0, 3), time: 0 });
    p.apply({ type: 'data', chunk: deg.subarray(3), time: 1 });
    expect(p.drain()!.lines[0]).toMatchObject({ text: '25°C', len: 5 });
  });

  it('coloured text keeps its colour across UTF-8', () => {
    const p = new RxPipeline('auto');
    p.apply({ type: 'data', chunk: enc('\x1b[31m°C\x1b[0m!\n'), time: 0 });
    const [l] = p.drain()!.lines;
    expect(l!.text).toBe('°C!');
    expect(l!.runs).toEqual([{ from: 0, to: 2, fg: 1 }]);
  });
});

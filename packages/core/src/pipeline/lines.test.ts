import { describe, expect, it } from 'vitest';
import { LineSplitter, type NewlineMode } from './lines';

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const text = (l: { bytes: Uint8Array }) => String.fromCharCode(...l.bytes);

function run(mode: NewlineMode, chunks: string[]) {
  const s = new LineSplitter(mode);
  return chunks.flatMap((c, i) => s.push(enc(c), i * 10));
}

describe('LineSplitter', () => {
  it('auto: CR, LF and CRLF each end exactly one line', () => {
    const lines = run('auto', ['a\rb\nc\r\nd\n']);
    expect(lines.map(text)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('auto: CRLF split across chunks is still one terminator', () => {
    expect(run('auto', ['a\r', '\nb\n']).map(text)).toEqual(['a', 'b']);
  });

  it('auto: LF LF yields an empty line', () => {
    expect(run('auto', ['a\n\nb\n']).map(text)).toEqual(['a', '', 'b']);
  });

  it('lf: CR is content', () => {
    expect(run('lf', ['a\rb\n']).map(text)).toEqual(['a\rb']);
  });

  it('cr: LF is content', () => {
    expect(run('cr', ['a\nb\r']).map(text)).toEqual(['a\nb']);
  });

  it('crlf: lone CR and lone LF are content; CR before a non-LF is kept in order', () => {
    expect(run('crlf', ['a\rb\nc\r\n']).map(text)).toEqual(['a\rb\nc']);
    expect(run('crlf', ['a\r', '\n']).map(text)).toEqual(['a']);
  });

  it('reports absolute offsets and the first-byte chunk timestamp', () => {
    const lines = run('auto', ['ab', 'c\r\nde', 'f\n']);
    expect(lines.map((l) => [text(l), l.offset, l.timestamp])).toEqual([
      ['abc', 0, 0],
      ['def', 5, 10],
    ]);
  });

  it('a splitter started mid-stream reports absolute offsets', () => {
    const s = new LineSplitter('lf', 1000);
    expect(s.push(enc('ab\ncd\n'), 0).map((l) => l.offset)).toEqual([1000, 1003]);
  });

  it('exposes the unterminated tail as a partial line', () => {
    const s = new LineSplitter('auto');
    s.push(enc('hi\nwor'), 5);
    const p = s.peekPartial();
    expect(p && text(p)).toBe('wor');
    expect(p?.offset).toBe(3);
    s.push(enc('ld\n'), 6);
    expect(s.peekPartial()).toBeNull();
  });
});

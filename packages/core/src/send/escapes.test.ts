import { describe, expect, it } from 'vitest';
import { parseEscapes, parseHexBytes } from './escapes';

describe('parseEscapes', () => {
  it('passes plain ASCII through', () => {
    expect([...parseEscapes('AT')]).toEqual([0x41, 0x54]);
  });
  it('handles \\r \\n \\t \\0 \\\\ and \\xNN', () => {
    expect([...parseEscapes('a\\r\\n\\t\\0\\\\\\x7F\\xff')]).toEqual([0x61, 0x0d, 0x0a, 0x09, 0x00, 0x5c, 0x7f, 0xff]);
  });
  it('keeps unknown escapes and a trailing backslash literally', () => {
    expect([...parseEscapes('\\q\\')]).toEqual([0x5c, 0x71, 0x5c]);
  });
  it('encodes non-ASCII as UTF-8', () => {
    expect([...parseEscapes('°C')]).toEqual([0xc2, 0xb0, 0x43]);
    expect([...parseEscapes('😀')]).toEqual([0xf0, 0x9f, 0x98, 0x80]);
  });
  it('rejects a malformed \\x', () => {
    expect(() => parseEscapes('\\x4')).toThrow(SyntaxError);
    expect(() => parseEscapes('\\xZZ')).toThrow(SyntaxError);
  });
});

describe('parseHexBytes', () => {
  it('accepts spaces, commas and 0x prefixes', () => {
    expect([...parseHexBytes(' 0D 0a,0x41  F ')]).toEqual([0x0d, 0x0a, 0x41, 0x0f]);
  });
  it('rejects non-hex and oversized tokens', () => {
    expect(() => parseHexBytes('GG')).toThrow(SyntaxError);
    expect(() => parseHexBytes('123')).toThrow(SyntaxError);
  });
  it('empty input is no bytes', () => {
    expect([...parseHexBytes('  ')]).toEqual([]);
  });
});

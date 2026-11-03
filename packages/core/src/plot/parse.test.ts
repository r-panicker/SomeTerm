import { describe, expect, it } from 'vitest';
import { parseNumericLine } from './parse';

const v = (s: string) => parseNumericLine(s)?.map((x) => [x.name, x.value]) ?? null;

describe('parseNumericLine', () => {
  it('plain values in any common separator', () => {
    expect(v('1,2.5,-3')).toEqual([['1', 1], ['2', 2.5], ['3', -3]]);
    expect(v('1 2\t3')).toEqual([['1', 1], ['2', 2], ['3', 3]]);
    expect(v('4;5')).toEqual([['1', 4], ['2', 5]]);
  });
  it('labelled values with : or =, with or without spaces', () => {
    expect(v('temp:23.1,hum:41')).toEqual([['temp', 23.1], ['hum', 41]]);
    expect(v('temp: 23.1 hum = 41')).toEqual([['temp', 23.1], ['hum', 41]]);
  });
  it('mixed labelled and unlabelled; unlabelled numbered among themselves', () => {
    expect(v('5 x:1 6')).toEqual([['1', 5], ['x', 1], ['2', 6]]);
  });
  it('exponents and leading dot', () => {
    expect(v('1e3 .5 -2.5E-1')).toEqual([['1', 1000], ['2', 0.5], ['3', -0.25]]);
  });
  it('rejects anything with a non-numeric token', () => {
    for (const s of ['', '   ', 'hello', 'ready 1', 'x:abc', '0x10', '1.2.3', 'NaN', 'Infinity', '12V']) {
      expect(v(s), s).toBeNull();
    }
  });
  it('tolerates trailing separators and CR', () => {
    expect(v('1,2,\r')).toEqual([['1', 1], ['2', 2]]);
  });
});

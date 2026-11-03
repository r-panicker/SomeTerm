import { describe, expect, it } from 'vitest';
import { decodeNumbers, formatNumber } from './numbers';

const b = (...n: number[]) => Uint8Array.from(n);

describe('decodeNumbers', () => {
  it('signed vs unsigned 8-bit', () => {
    expect(decodeNumbers(b(0x7f, 0x80, 0xff), 'int8', true)).toEqual([127, -128, -1]);
    expect(decodeNumbers(b(0x7f, 0x80, 0xff), 'uint8', true)).toEqual([127, 128, 255]);
  });
  it('16-bit in both byte orders', () => {
    expect(decodeNumbers(b(0x34, 0x12, 0xff, 0xff), 'int16', true)).toEqual([0x1234, -1]);
    expect(decodeNumbers(b(0x12, 0x34), 'uint16', false)).toEqual([0x1234]);
  });
  it('32-bit extremes', () => {
    expect(decodeNumbers(b(0, 0, 0, 0x80), 'int32', true)).toEqual([-2147483648]);
    expect(decodeNumbers(b(0xff, 0xff, 0xff, 0xff), 'uint32', true)).toEqual([4294967295]);
  });
  it('IEEE floats', () => {
    expect(decodeNumbers(b(0x00, 0x00, 0x80, 0x3f), 'float32', true)).toEqual([1]);
    expect(decodeNumbers(b(0x40, 0x49, 0x0f, 0xdb), 'float32', false)[0]).toBeCloseTo(Math.PI, 6);
    expect(decodeNumbers(b(0x18, 0x2d, 0x44, 0x54, 0xfb, 0x21, 0x09, 0x40), 'float64', true)).toEqual([Math.PI]);
  });
  it('ignores a trailing partial element and honours a subarray offset', () => {
    const buf = b(0xaa, 0x01, 0x00, 0x02);
    expect(decodeNumbers(buf.subarray(1), 'uint16', true)).toEqual([1]);
  });
});

describe('formatNumber', () => {
  it('pads integers to the type width', () => {
    expect(formatNumber(-1, 'int16')).toBe('    -1');
    expect(formatNumber(4294967295, 'uint32')).toBe('4294967295');
  });
  it('float32 shows 7 significant digits, not binary noise', () => {
    expect(formatNumber(Math.fround(0.1), 'float32').trim()).toBe('0.1');
    expect(formatNumber(Math.fround(Math.PI), 'float32').trim()).toBe('3.141593');
  });
  it('huge, tiny and special floats stay within width', () => {
    for (const v of [3.4e38, -1.17e-38, NaN, Infinity, -Infinity]) {
      expect(formatNumber(v, 'float32').length).toBe(14);
    }
    expect(formatNumber(NaN, 'float32').trim()).toBe('NaN');
    expect(formatNumber(-Infinity, 'float64').trim()).toBe('-Inf');
  });
});

import { describe, expect, it } from 'vitest';
import { hexDump, toAscii, toBinary, toDecimal, toHex } from './bytes';

const b = (...n: number[]) => Uint8Array.from(n);

describe('formatters', () => {
  it('hex, binary and decimal', () => {
    expect(toHex(b(0, 0xab, 0xff))).toBe('00 AB FF');
    expect(toHex(b(0xab), { upper: false })).toBe('ab');
    expect(toBinary(b(5, 0x80))).toBe('00000101 10000000');
    expect(toDecimal(b(0, 255))).toBe('0 255');
  });

  it('ascii shows printable, placeholders for the rest', () => {
    expect(toAscii(b(0x48, 0x69, 0x0d, 0x0a, 0x00, 0xff, 0x7f))).toBe('Hi.....');
  });

  it('ascii control pictures make CR/LF/NUL/DEL visible', () => {
    expect(toAscii(b(0x0d, 0x0a, 0x00, 0x7f, 0x41), { controlPictures: true })).toBe('␍␊␀␡A');
  });

  it('hexDump aligns the ASCII column on a short final row', () => {
    const rows = hexDump(Uint8Array.from('ABCDEF', (c) => c.charCodeAt(0)), 0x10, 4);
    expect(rows).toEqual([
      { offset: 0x10, hex: '41 42 43 44', ascii: 'ABCD' },
      { offset: 0x14, hex: '45 46      ', ascii: 'EF' },
    ]);
    expect(rows[0]!.hex.length).toBe(rows[1]!.hex.length);
  });
});

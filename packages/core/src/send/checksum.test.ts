import { describe, expect, it } from 'vitest';
import { checksumBytes, frame } from './checksum';

const check = Uint8Array.from('123456789', (c) => c.charCodeAt(0));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

describe('checksums against standard check values for "123456789"', () => {
  it.each([
    ['sum8', 'dd'],
    ['xor8', '31'],
    ['crc8', 'f4'],
    ['crc16-modbus', '374b'],
    ['crc16-ccitt', '29b1'],
    ['crc32', '2639f4cb'],
  ] as const)('%s', (kind, expected) => {
    expect(hex(checksumBytes(kind, check))).toBe(expected);
  });

  it('none is empty', () => {
    expect(checksumBytes('none', check).length).toBe(0);
  });

  it('MODBUS frame: read holding registers request', () => {
    expect(hex(frame(Uint8Array.of(0x01, 0x03, 0x00, 0x00, 0x00, 0x0a), 'crc16-modbus'))).toBe('01030000000ac5cd');
  });

  it('frame puts checksum before the suffix and does not checksum the suffix', () => {
    expect([...frame(Uint8Array.of(1, 2), 'sum8', Uint8Array.of(0x0d, 0x0a))]).toEqual([1, 2, 3, 0x0d, 0x0a]);
  });
});

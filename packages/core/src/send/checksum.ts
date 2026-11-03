export type ChecksumKind = 'none' | 'sum8' | 'xor8' | 'crc8' | 'crc16-modbus' | 'crc16-ccitt' | 'crc32';

export const CHECKSUMS: { kind: ChecksumKind; label: string; detail: string }[] = [
  { kind: 'none', label: 'None', detail: '' },
  { kind: 'sum8', label: 'Sum8', detail: 'Byte sum mod 256, 1 byte' },
  { kind: 'xor8', label: 'XOR8', detail: 'XOR of all bytes (NMEA style), 1 byte' },
  { kind: 'crc8', label: 'CRC-8', detail: 'Poly 0x07, init 0x00, 1 byte' },
  { kind: 'crc16-modbus', label: 'CRC-16/MODBUS', detail: 'Poly 0x8005 reflected, init 0xFFFF, low byte first' },
  { kind: 'crc16-ccitt', label: 'CRC-16/CCITT', detail: 'Poly 0x1021, init 0xFFFF, high byte first' },
  { kind: 'crc32', label: 'CRC-32', detail: 'IEEE 802.3, low byte first' },
];

export function checksumBytes(kind: ChecksumKind, data: Uint8Array): Uint8Array {
  switch (kind) {
    case 'none':
      return new Uint8Array(0);
    case 'sum8': {
      let s = 0;
      for (const b of data) s = (s + b) & 0xff;
      return Uint8Array.of(s);
    }
    case 'xor8': {
      let x = 0;
      for (const b of data) x ^= b;
      return Uint8Array.of(x);
    }
    case 'crc8': {
      let c = 0;
      for (const b of data) {
        c ^= b;
        for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
      }
      return Uint8Array.of(c);
    }
    case 'crc16-modbus': {
      let c = 0xffff;
      for (const b of data) {
        c ^= b;
        for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1;
      }
      return Uint8Array.of(c & 0xff, c >>> 8);
    }
    case 'crc16-ccitt': {
      let c = 0xffff;
      for (const b of data) {
        c ^= b << 8;
        for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
      }
      return Uint8Array.of(c >>> 8, c & 0xff);
    }
    case 'crc32': {
      let c = 0xffffffff;
      for (const b of data) {
        c ^= b;
        for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
      }
      c = (c ^ 0xffffffff) >>> 0;
      return Uint8Array.of(c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff, c >>> 24);
    }
  }
}

/** payload + checksum(payload) + suffix. The line ending goes in `suffix` so it is not checksummed. */
export function frame(payload: Uint8Array, kind: ChecksumKind, suffix: Uint8Array = new Uint8Array(0)): Uint8Array {
  const sum = checksumBytes(kind, payload);
  const out = new Uint8Array(payload.length + sum.length + suffix.length);
  out.set(payload);
  out.set(sum, payload.length);
  out.set(suffix, payload.length + sum.length);
  return out;
}

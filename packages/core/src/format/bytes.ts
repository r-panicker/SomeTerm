export function toHex(bytes: Uint8Array, opts: { upper?: boolean; separator?: string } = {}): string {
  const { upper = true, separator = ' ' } = opts;
  const parts: string[] = [];
  for (const b of bytes) parts.push(b.toString(16).padStart(2, '0'));
  const s = parts.join(separator);
  return upper ? s.toUpperCase() : s;
}

export function toBinary(bytes: Uint8Array, separator = ' '): string {
  return Array.from(bytes, (b) => b.toString(2).padStart(8, '0')).join(separator);
}

export function toDecimal(bytes: Uint8Array, separator = ' '): string {
  return Array.from(bytes, (b) => String(b)).join(separator);
}

/**
 * Printable ASCII passes through. Other bytes become `placeholder` ('.' by default),
 * except when `controlPictures` is set, which maps 0x00-0x1F to U+2400.. glyphs.
 */
export function toAscii(
  bytes: Uint8Array,
  opts: { placeholder?: string; controlPictures?: boolean } = {},
): string {
  const { placeholder = '.', controlPictures = false } = opts;
  let out = '';
  for (const b of bytes) {
    if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b);
    else if (controlPictures && b < 0x20) out += String.fromCharCode(0x2400 + b);
    else if (controlPictures && b === 0x7f) out += '␡';
    else out += placeholder;
  }
  return out;
}

export interface HexDumpRow {
  offset: number;
  hex: string;
  ascii: string;
}

/** Rows of `bytesPerRow`; `hex` is padded so the ASCII column aligns on a short final row. */
export function hexDump(bytes: Uint8Array, startOffset = 0, bytesPerRow = 16): HexDumpRow[] {
  if (bytesPerRow <= 0) throw new RangeError('bytesPerRow must be positive');
  const rows: HexDumpRow[] = [];
  const width = bytesPerRow * 3 - 1;
  for (let i = 0; i < bytes.length; i += bytesPerRow) {
    const slice = bytes.subarray(i, i + bytesPerRow);
    rows.push({ offset: startOffset + i, hex: toHex(slice).padEnd(width), ascii: toAscii(slice) });
  }
  return rows;
}

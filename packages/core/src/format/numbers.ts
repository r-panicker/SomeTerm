export type NumType = 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'float32' | 'float64';

export const NUM_TYPES: { type: NumType; size: 1 | 2 | 4 | 8; width: number }[] = [
  { type: 'int8', size: 1, width: 4 },
  { type: 'uint8', size: 1, width: 3 },
  { type: 'int16', size: 2, width: 6 },
  { type: 'uint16', size: 2, width: 5 },
  { type: 'int32', size: 4, width: 11 },
  { type: 'uint32', size: 4, width: 10 },
  { type: 'float32', size: 4, width: 14 },
  { type: 'float64', size: 8, width: 23 },
];

export function numInfo(type: NumType) {
  return NUM_TYPES.find((n) => n.type === type)!;
}

/** Decodes whole elements only; trailing bytes that do not fill one are ignored. */
export function decodeNumbers(bytes: Uint8Array, type: NumType, littleEndian: boolean): number[] {
  const { size } = numInfo(type);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: number[] = [];
  for (let o = 0; o + size <= bytes.length; o += size) {
    switch (type) {
      case 'int8': out.push(view.getInt8(o)); break;
      case 'uint8': out.push(view.getUint8(o)); break;
      case 'int16': out.push(view.getInt16(o, littleEndian)); break;
      case 'uint16': out.push(view.getUint16(o, littleEndian)); break;
      case 'int32': out.push(view.getInt32(o, littleEndian)); break;
      case 'uint32': out.push(view.getUint32(o, littleEndian)); break;
      case 'float32': out.push(view.getFloat32(o, littleEndian)); break;
      case 'float64': out.push(view.getFloat64(o, littleEndian)); break;
    }
  }
  return out;
}

/**
 * Right-aligned to the type's width. Floats use the shortest form that round-trips
 * at their precision (7 significant digits for float32, 15 for float64).
 */
export function formatNumber(v: number, type: NumType): string {
  const { width } = numInfo(type);
  let s: string;
  if (type === 'float32' || type === 'float64') {
    if (!Number.isFinite(v)) s = Number.isNaN(v) ? 'NaN' : v > 0 ? 'Inf' : '-Inf';
    else {
      s = String(Number(v.toPrecision(type === 'float32' ? 7 : 15)));
      if (s.length > width) s = v.toExponential(type === 'float32' ? 6 : 15);
    }
  } else s = String(v);
  return s.padStart(width);
}

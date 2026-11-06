import type { SerialOptions } from '../transport';

export const RECORDING_MAGIC = 'STREC1\n';
export const RECORDING_EXT = '.strec';

export interface RecordingMeta {
  version: 1;
  /** Epoch ms when recording started; record times are relative to it. */
  created: number;
  options?: SerialOptions;
  port?: string;
}

export type RecordKind = 'rx' | 'tx' | 'signals';

export interface RecordEntry {
  kind: RecordKind;
  /** Milliseconds since `created`. */
  t: number;
  data: Uint8Array;
}

export interface Recording {
  meta: RecordingMeta;
  records: RecordEntry[];
  /** Time of the last record, ms. */
  duration: number;
  /** True when the file ended inside a record (e.g. the app was killed mid-write). */
  truncated: boolean;
}

export interface SignalState {
  cts: boolean;
  dsr: boolean;
  dcd: boolean;
  ri: boolean;
  dtr: boolean;
  rts: boolean;
}

const KIND_CODE: Record<RecordKind, number> = { rx: 0, tx: 1, signals: 2 };
const CODE_KIND: RecordKind[] = ['rx', 'tx', 'signals'];
const SIGNAL_ORDER = ['cts', 'dsr', 'dcd', 'ri', 'dtr', 'rts'] as const;
/** Record layout: kind u8, time f64 LE (ms), length u32 LE, payload. */
const RECORD_HEAD = 13;

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

/** Header bytes. JSON is kept pure ASCII (non-ASCII as \uXXXX) so no text encoder is needed either way. */
export function encodeHeader(meta: RecordingMeta): Uint8Array {
  const json = JSON.stringify(meta).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return ascii(`${RECORDING_MAGIC}${json}\n`);
}

export function encodeRecord(kind: RecordKind, t: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(RECORD_HEAD + data.length);
  const v = new DataView(out.buffer);
  v.setUint8(0, KIND_CODE[kind]);
  v.setFloat64(1, t, true);
  v.setUint32(9, data.length, true);
  out.set(data, RECORD_HEAD);
  return out;
}

export function encodeSignals(s: SignalState): Uint8Array {
  let bits = 0;
  SIGNAL_ORDER.forEach((k, i) => { if (s[k]) bits |= 1 << i; });
  return Uint8Array.of(bits);
}

export function decodeSignals(data: Uint8Array): SignalState {
  const bits = data[0] ?? 0;
  const s = {} as SignalState;
  SIGNAL_ORDER.forEach((k, i) => { s[k] = !!(bits & (1 << i)); });
  return s;
}

/** Throws a readable error for files that are not recordings; a truncated tail is tolerated and reported. */
export function parseRecording(bytes: Uint8Array): Recording {
  const magic = String.fromCharCode(...bytes.subarray(0, RECORDING_MAGIC.length));
  if (magic !== RECORDING_MAGIC) throw new Error('Not a SomeTerm recording');
  const nl = bytes.indexOf(0x0a, RECORDING_MAGIC.length);
  if (nl < 0) throw new Error('Recording header is incomplete');
  let meta: RecordingMeta;
  try {
    meta = JSON.parse(String.fromCharCode(...bytes.subarray(RECORDING_MAGIC.length, nl)));
  } catch {
    throw new Error('Recording header is damaged');
  }
  if (meta?.version !== 1 || typeof meta.created !== 'number') throw new Error('Unsupported recording version');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records: RecordEntry[] = [];
  let o = nl + 1;
  let truncated = false;
  while (o < bytes.length) {
    if (o + RECORD_HEAD > bytes.length) { truncated = true; break; }
    const kind = CODE_KIND[view.getUint8(o)];
    const t = view.getFloat64(o + 1, true);
    const len = view.getUint32(o + 9, true);
    if (!kind || !Number.isFinite(t)) throw new Error('Recording is damaged');
    if (o + RECORD_HEAD + len > bytes.length) { truncated = true; break; }
    records.push({ kind, t, data: bytes.slice(o + RECORD_HEAD, o + RECORD_HEAD + len) });
    o += RECORD_HEAD + len;
  }
  return { meta, records, duration: records.length ? records[records.length - 1]!.t : 0, truncated };
}

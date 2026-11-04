import { LineSplitter, type NewlineMode } from '../pipeline/lines';
import { toHex } from '../format/bytes';
import type { Direction } from '../terminal/log';
import { encodeHeader, encodeRecord, encodeSignals, type RecordingMeta, type SignalState } from './recording';
import { parseEscapes } from '../send/escapes';

export type CaptureSource = 'rx' | 'tx' | 'both';
export type CaptureFormat = 'raw' | 'text' | 'hex' | 'session';
/** armed: waiting for the start trigger; nothing is written yet. */
export type CaptureState = 'armed' | 'running' | 'paused' | 'stopped';

export interface CaptureOptions {
  source: CaptureSource;
  /**
   * raw: bytes as received; text: one timestamped line per line; hex: one timestamped
   * hex line per chunk; session: a replayable recording of both directions and line signals.
   */
  format: CaptureFormat;
  /** Header for the session format; `created` is taken from the capture start. */
  meta?: Omit<RecordingMeta, 'version' | 'created'>;
  newline?: NewlineMode;
  /** Stop once this many data bytes have been captured; the chunk that crosses it is truncated. */
  maxBytes?: number;
  /** Stop this many seconds after starting. */
  maxSeconds?: number;
  /** Start only after this many data bytes have gone by. */
  startAfterBytes?: number;
  /** Start where this text (send-box escapes allowed) first appears; the match is included. */
  startOnText?: string;
}

export interface CaptureSink {
  write(bytes: Uint8Array): void | Promise<void>;
  close(): Promise<void>;
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Local time as `YYYY-MM-DD HH:MM:SS.mmm`. */
export function formatStamp(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/**
 * Turns the live stream into file bytes for a sink. Writes are serialised so a
 * slow sink never reorders data; a sink error stops the capture.
 */
export class Capture {
  state: CaptureState;
  /** Data bytes captured (before formatting). */
  captured = 0;
  /** Bytes handed to the sink (after formatting). */
  written = 0;
  stopReason = '';
  readonly done: Promise<void>;

  private chain: Promise<void> = Promise.resolve();
  private splitters: Record<Direction, LineSplitter>;
  private lastTime: Record<Direction, number> = { rx: 0, tx: 0 };
  private resolveDone!: () => void;

  constructor(
    private readonly sink: CaptureSink,
    readonly options: CaptureOptions,
    /** When writing began: construction, or the trigger for an armed capture. Limits count from here. */
    public startedAt: number,
    private readonly onStop: (c: Capture) => void = () => {},
  ) {
    const nl = options.newline ?? 'auto';
    this.splitters = { rx: new LineSplitter(nl), tx: new LineSplitter(nl) };
    this.done = new Promise((r) => (this.resolveDone = r));
    this.trigger = options.startOnText ? parseEscapes(options.startOnText) : null;
    this.state = (this.trigger && this.trigger.length) || options.startAfterBytes ? 'armed' : 'running';
    if (this.state === 'running') this.begin(startedAt);
  }

  private trigger: Uint8Array | null;
  private skipped = 0;
  /** The last trigger-length−1 bytes per direction, so a trigger split across chunks is still found. */
  private tails: Record<Direction, Uint8Array> = { rx: new Uint8Array(0), tx: new Uint8Array(0) };

  private begin(at: number): void {
    this.state = 'running';
    this.startedAt = at;
    if (this.options.format === 'session') this.emit(encodeHeader({ version: 1, created: at, ...this.options.meta }));
  }

  /** While armed: returns the bytes of this chunk that come after the trigger, or null if it has not fired. */
  private armed(dir: Direction, chunk: Uint8Array): Uint8Array | null {
    const n = this.options.startAfterBytes;
    if (n && !this.trigger?.length) {
      const before = this.skipped;
      this.skipped += chunk.length;
      return this.skipped > n ? chunk.subarray(Math.max(0, n - before)) : null;
    }
    const t = this.trigger!;
    const tail = this.tails[dir];
    const window = new Uint8Array(tail.length + chunk.length);
    window.set(tail);
    window.set(chunk, tail.length);
    const at = indexOf(window, t);
    if (at >= 0) return window.subarray(at);
    this.tails[dir] = window.slice(Math.max(0, window.length - (t.length - 1)));
    return null;
  }

  /** Records a line-signal change; only the session format keeps these. */
  signals(state: SignalState, epochMs: number): void {
    if (this.state !== 'running' || this.options.format !== 'session') return;
    this.emit(encodeRecord('signals', epochMs - this.startedAt, encodeSignals(state)));
  }

  rx(chunk: Uint8Array, epochMs: number): void {
    this.data('rx', chunk, epochMs);
  }

  tx(chunk: Uint8Array, epochMs: number): void {
    this.data('tx', chunk, epochMs);
  }

  /** Call periodically so a time limit fires even when no data arrives. */
  tick(epochMs: number): void {
    if (this.state !== 'stopped' && this.state !== 'armed' && this.options.maxSeconds && epochMs - this.startedAt >= this.options.maxSeconds * 1000) {
      void this.stop('time limit reached');
    }
  }

  pause(): void {
    if (this.state === 'running') this.state = 'paused';
  }

  resume(): void {
    if (this.state === 'paused') this.state = 'running';
  }

  async stop(reason = 'stopped'): Promise<void> {
    if (this.state === 'stopped') return this.done;
    this.state = 'stopped';
    this.stopReason = reason;
    if (this.options.format === 'text') {
      for (const dir of ['rx', 'tx'] as const) {
        const p = this.splitters[dir].peekPartial();
        if (p) this.emitLine(dir, p.bytes, this.lastTime[dir]);
      }
    }
    this.chain = this.chain.then(() => this.sink.close()).catch((e) => {
      this.stopReason = `write failed: ${(e as Error).message}`;
    });
    await this.chain;
    this.onStop(this);
    this.resolveDone();
  }

  private data(dir: Direction, chunk: Uint8Array, epochMs: number): void {
    if (this.state !== 'running' && this.state !== 'armed') return;
    if (this.options.format !== 'session' && this.options.source !== 'both' && this.options.source !== dir) return;
    if (this.state === 'armed') {
      const rest = this.armed(dir, chunk);
      if (!rest) return;
      this.begin(epochMs);
      chunk = rest;
    }
    this.tick(epochMs);
    if (this.state !== 'running') return;
    let bytes = chunk;
    const max = this.options.maxBytes;
    if (max && this.captured + bytes.length >= max) bytes = bytes.subarray(0, max - this.captured);
    this.captured += bytes.length;
    this.lastTime[dir] = epochMs;
    switch (this.options.format) {
      case 'raw':
        this.emit(bytes.slice());
        break;
      case 'session':
        if (bytes.length) this.emit(encodeRecord(dir, epochMs - this.startedAt, bytes));
        break;
      case 'hex':
        if (bytes.length) this.emit(ascii(`${formatStamp(epochMs)} ${this.tag(dir)}${toHex(bytes)}\n`));
        break;
      case 'text':
        for (const l of this.splitters[dir].push(bytes, epochMs)) this.emitLine(dir, l.bytes, l.timestamp);
        break;
    }
    if (max && this.captured >= max) void this.stop('size limit reached');
  }

  private emitLine(dir: Direction, content: Uint8Array, epochMs: number): void {
    const head = ascii(`${formatStamp(epochMs)} ${this.tag(dir)}`);
    const out = new Uint8Array(head.length + content.length + 1);
    out.set(head);
    out.set(content, head.length);
    out[out.length - 1] = 0x0a;
    this.emit(out);
  }

  private tag(dir: Direction): string {
    return this.options.source === 'both' ? (dir === 'rx' ? 'RX ' : 'TX ') : '';
  }

  private emit(bytes: Uint8Array): void {
    this.written += bytes.length;
    this.chain = this.chain
      .then(() => this.sink.write(bytes))
      .catch((e) => {
        if (this.state !== 'stopped') void this.stop(`write failed: ${(e as Error).message}`);
      });
  }
}

function indexOf(hay: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

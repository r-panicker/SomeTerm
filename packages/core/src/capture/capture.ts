import { LineSplitter, type NewlineMode } from '../pipeline/lines';
import { toHex } from '../format/bytes';
import type { Direction } from '../terminal/log';

export type CaptureSource = 'rx' | 'tx' | 'both';
export type CaptureFormat = 'raw' | 'text' | 'hex';
export type CaptureState = 'running' | 'paused' | 'stopped';

export interface CaptureOptions {
  source: CaptureSource;
  /** raw: bytes as received; text: one timestamped line per line; hex: one timestamped hex line per chunk. */
  format: CaptureFormat;
  newline?: NewlineMode;
  /** Stop once this many data bytes have been captured; the chunk that crosses it is truncated. */
  maxBytes?: number;
  /** Stop this many seconds after starting. */
  maxSeconds?: number;
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
  state: CaptureState = 'running';
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
    readonly startedAt: number,
    private readonly onStop: (c: Capture) => void = () => {},
  ) {
    const nl = options.newline ?? 'auto';
    this.splitters = { rx: new LineSplitter(nl), tx: new LineSplitter(nl) };
    this.done = new Promise((r) => (this.resolveDone = r));
  }

  rx(chunk: Uint8Array, epochMs: number): void {
    this.data('rx', chunk, epochMs);
  }

  tx(chunk: Uint8Array, epochMs: number): void {
    this.data('tx', chunk, epochMs);
  }

  /** Call periodically so a time limit fires even when no data arrives. */
  tick(epochMs: number): void {
    if (this.state !== 'stopped' && this.options.maxSeconds && epochMs - this.startedAt >= this.options.maxSeconds * 1000) {
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
    if (this.state !== 'running') return;
    if (this.options.source !== 'both' && this.options.source !== dir) return;
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

import {
  ByteRing,
  LineSplitter,
  LoopbackTransport,
  toAscii,
  hexDump,
  type NewlineMode,
  type SerialOptions,
  type SerialTransport,
} from '@superserial/core';
import { requestWebSerialPort } from '@superserial/transport-webserial';

export type Source = 'webserial' | 'loopback';

const MAX_LINES = 5000;
const HEX_TAIL = 4096;

/**
 * Glue between a transport and the views. Throttles redraws to one per
 * animation frame so a fast stream costs one render per frame, not per chunk.
 */
export class Session {
  transport: SerialTransport | null = null;
  lines: string[] = [];
  partial = '';
  rx = 0;
  tx = 0;
  error = '';
  private ring = new ByteRing(1 << 20);
  private splitter: LineSplitter;
  private offs: (() => void)[] = [];
  private scheduled = false;
  private clearedAt = 0;

  constructor(private readonly onChange: () => void, newline: NewlineMode = 'auto') {
    this.splitter = new LineSplitter(newline);
  }

  get open(): boolean {
    return this.transport?.state === 'open';
  }

  async connect(source: Source, options: SerialOptions): Promise<void> {
    this.error = '';
    const t = source === 'loopback' ? new LoopbackTransport({}, () => performance.now()) : await requestWebSerialPort();
    this.offs = [
      t.onData((c, ts) => this.receive(c, ts)),
      t.onError((e) => { this.error = e.message; this.changed(); }),
      t.onClose(() => this.changed()),
    ];
    try {
      await t.open(options);
    } catch (e) {
      this.offs.forEach((f) => f());
      throw e;
    }
    this.transport = t;
    this.changed();
  }

  async disconnect(): Promise<void> {
    await this.transport?.close();
    this.offs.forEach((f) => f());
    this.offs = [];
    this.changed();
  }

  async send(bytes: Uint8Array): Promise<void> {
    if (!this.transport) return;
    await this.transport.write(bytes);
    this.tx += bytes.length;
    this.changed();
  }

  clear(): void {
    this.lines = [];
    this.partial = '';
    this.clearedAt = this.ring.end;
    this.changed();
  }

  setNewline(mode: NewlineMode): void {
    this.splitter = new LineSplitter(mode);
    this.partial = '';
  }

  hexRows() {
    const start = Math.max(this.ring.start, this.clearedAt, this.ring.end - HEX_TAIL);
    const aligned = start + ((16 - (start % 16)) % 16);
    return hexDump(this.ring.slice(Math.min(aligned, this.ring.end)), aligned);
  }

  private receive(chunk: Uint8Array, ts: number): void {
    this.rx += chunk.length;
    this.ring.push(chunk);
    for (const l of this.splitter.push(chunk, ts)) this.lines.push(toAscii(l.bytes, { controlPictures: true }));
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
    const p = this.splitter.peekPartial();
    this.partial = p ? toAscii(p.bytes, { controlPictures: true }) : '';
    this.changed();
  }

  private changed(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.onChange();
    });
  }
}

import { Capture, type CaptureOptions } from '@superserial/core';
import { FileSink, MemorySink } from './sinks';

export interface CaptureInfo {
  name: string;
  kind: 'file' | 'memory';
  state: 'running' | 'paused' | 'stopped';
  captured: number;
  written: number;
  startedAt: number;
  reason: string;
}

/** One capture at a time to a file or memory, with its reactive status. Shared by port tabs and the Monitor. */
export class CaptureController {
  info = $state<CaptureInfo | null>(null);
  private cap: Capture | null = null;
  private sink: FileSink | MemorySink | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly report: (message: string) => void) {}

  get active(): boolean {
    return !!this.cap && this.cap.state !== 'stopped';
  }

  /**
   * For a file this opens the save dialog, so call it from a user gesture.
   * Resolves false if the user cancelled.
   */
  async start(options: CaptureOptions, dest: 'file' | 'memory', append: boolean): Promise<boolean> {
    if (this.active) return false;
    const name = `superserial-${stampForName(new Date())}.txt`;
    let sink: FileSink | MemorySink;
    try {
      const f = dest === 'file' ? await FileSink.pick(name, append) : new MemorySink(name);
      if (!f) return false;
      sink = f;
    } catch (e) {
      this.report(`Capture: ${(e as Error).message}`);
      return false;
    }
    this.sink = sink;
    const cap = new Capture(sink, options, Date.now(), () => this.sync());
    this.cap = cap;
    this.sync();
    this.timer = setInterval(() => { cap.tick(Date.now()); this.sync(); }, 250);
    return true;
  }

  rx(bytes: Uint8Array, epochMs: number): void {
    this.cap?.rx(bytes, epochMs);
  }

  tx(bytes: Uint8Array, epochMs: number): void {
    this.cap?.tx(bytes, epochMs);
  }

  pause(): void { this.cap?.pause(); this.sync(); }
  resume(): void { this.cap?.resume(); this.sync(); }

  async stop(): Promise<void> {
    await this.cap?.stop();
  }

  /** The finished in-memory capture, if any. */
  blob(): Blob | null {
    return this.sink instanceof MemorySink && this.cap?.state === 'stopped'
      ? this.sink.blob(this.cap.options.format === 'raw' ? 'application/octet-stream' : 'text/plain;charset=utf-8')
      : null;
  }

  discard(): void {
    if (this.active) return;
    this.cap = null;
    this.sink = null;
    this.info = null;
  }

  private sync(): void {
    const c = this.cap;
    if (!c || !this.sink) return;
    if (c.state === 'stopped' && this.timer) { clearInterval(this.timer); this.timer = null; }
    this.info = {
      name: this.sink.name,
      kind: this.sink instanceof FileSink ? 'file' : 'memory',
      state: c.state,
      captured: c.captured,
      written: c.written,
      startedAt: c.startedAt,
      reason: c.stopReason,
    };
  }
}

function stampForName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

import { Capture, RotatingSink, rotatedName, type CaptureOptions, type CaptureSink, type RotateOptions } from '@superserial/core';
import { FileSink, MemorySink, pickFolder } from './sinks';

export interface CaptureInfo {
  name: string;
  kind: 'file' | 'memory' | 'folder';
  /** Files written so far, for a capture split across a folder. */
  files?: number;
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
  private sink: CaptureSink | null = null;
  private kind: CaptureInfo['kind'] = 'file';
  private name = '';
  private rotating: RotatingSink | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly report: (message: string) => void) {}

  get active(): boolean {
    return !!this.cap && this.cap.state !== 'stopped';
  }

  /**
   * For a file this opens the save dialog, so call it from a user gesture.
   * Resolves false if the user cancelled.
   */
  async start(options: CaptureOptions, dest: 'file' | 'memory', append: boolean, rotate?: RotateOptions): Promise<boolean> {
    if (this.active) return false;
    const base = `superserial-${stampForName(new Date())}`;
    const ext = options.format === 'raw' ? '.bin' : '.txt';
    let sink: CaptureSink;
    this.rotating = null;
    try {
      if (dest === 'file' && rotate && (rotate.bytes || rotate.seconds)) {
        // A split capture needs a folder: the browser can only write the one file a save dialog returns.
        const dir = await pickFolder();
        if (!dir) return false;
        this.kind = 'folder';
        this.name = `${dir.name}/${rotatedName(base, 1, ext)}`;
        const r = new RotatingSink(
          async (i) => FileSink.open(await dir.getFileHandle(rotatedName(base, i, ext), { create: true }), false),
          rotate,
          Date.now,
          (i) => { this.name = `${dir.name}/${rotatedName(base, i, ext)}`; },
        );
        this.rotating = r;
        sink = r;
      } else if (dest === 'file') {
        const f = await FileSink.pick(base + ext, append);
        if (!f) return false;
        this.kind = 'file';
        this.name = f.name;
        sink = f;
      } else {
        this.kind = 'memory';
        this.name = base + ext;
        sink = new MemorySink(this.name);
      }
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
      name: this.name,
      kind: this.kind,
      ...(this.rotating && { files: this.rotating.count }),
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

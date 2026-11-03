import type { CaptureSink } from './capture';

export interface RotateOptions {
  /** Start a new file once the current one holds at least this many bytes. */
  bytes?: number;
  /** Start a new file once the current one is this old. */
  seconds?: number;
}

/**
 * Splits a capture across numbered files. The check runs before each write, and
 * Capture writes whole records (a line, a hex chunk), so a record is never split
 * across files. A file is only opened when there is something to put in it.
 */
export class RotatingSink implements CaptureSink {
  /** Files opened so far. */
  count = 0;
  private current: CaptureSink | null = null;
  private size = 0;
  private openedAt = 0;

  constructor(
    private readonly open: (index: number) => Promise<CaptureSink>,
    private readonly rotate: RotateOptions,
    private readonly now: () => number = () => Date.now(),
    private readonly onOpen: (index: number) => void = () => {},
  ) {}

  async write(bytes: Uint8Array): Promise<void> {
    if (this.current && this.due()) {
      await this.current.close();
      this.current = null;
    }
    if (!this.current) {
      this.count++;
      this.current = await this.open(this.count);
      this.size = 0;
      this.openedAt = this.now();
      this.onOpen(this.count);
    }
    await this.current.write(bytes);
    this.size += bytes.length;
  }

  async close(): Promise<void> {
    await this.current?.close();
    this.current = null;
  }

  private due(): boolean {
    const { bytes, seconds } = this.rotate;
    return (!!bytes && this.size >= bytes) || (!!seconds && this.now() - this.openedAt >= seconds * 1000);
  }
}

/** `base-001.txt`, `base-002.txt`, … */
export function rotatedName(base: string, index: number, ext = '.txt'): string {
  return `${base}-${String(index).padStart(3, '0')}${ext}`;
}

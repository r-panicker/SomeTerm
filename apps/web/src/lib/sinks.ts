import type { CaptureSink } from '@superserial/core';

type SaveFilePicker = (opts: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

export function canSaveToFile(): boolean {
  return typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

const FLUSH_BYTES = 64 * 1024;
const FLUSH_MS = 500;

/**
 * Streams to a user-chosen file. Small writes are batched because each
 * FileSystemWritableFileStream.write is a round trip to the browser process.
 * Data reaches disk on flush, and the file is only replaced or extended on close.
 */
export class FileSink implements CaptureSink {
  private buf: Uint8Array[] = [];
  private size = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<void> = Promise.resolve();

  private constructor(private readonly stream: FileSystemWritableFileStream, readonly name: string) {}

  /** Opens the save dialog; must run from a user gesture. Resolves null if the user cancels. */
  static async pick(suggestedName: string, append: boolean): Promise<FileSink | null> {
    const picker = (window as unknown as { showSaveFilePicker: SaveFilePicker }).showSaveFilePicker;
    let handle: FileSystemFileHandle;
    try {
      handle = await picker({ suggestedName, types: [{ description: 'Capture', accept: { 'text/plain': ['.txt', '.log', '.bin', '.csv'] } }] });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
    return FileSink.open(handle, append);
  }

  static async open(handle: FileSystemFileHandle, append: boolean): Promise<FileSink> {
    const stream = await handle.createWritable({ keepExistingData: append });
    if (append) await stream.seek((await handle.getFile()).size);
    return new FileSink(stream, handle.name);
  }

  write(bytes: Uint8Array): Promise<void> {
    this.buf.push(bytes);
    this.size += bytes.length;
    if (this.size >= FLUSH_BYTES) return this.flush();
    this.timer ??= setTimeout(() => void this.flush(), FLUSH_MS);
    return this.pending;
  }

  async close(): Promise<void> {
    await this.flush();
    await this.stream.close();
  }

  private flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.size) return this.pending;
    const joined = new Uint8Array(this.size);
    let o = 0;
    for (const b of this.buf) { joined.set(b, o); o += b.length; }
    this.buf = [];
    this.size = 0;
    this.pending = this.pending.then(() => this.stream.write(joined));
    return this.pending;
  }
}

/** Keeps the capture in memory for View and Download. */
export class MemorySink implements CaptureSink {
  private chunks: Uint8Array[] = [];
  size = 0;

  constructor(readonly name: string) {}

  write(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.size += bytes.length;
  }

  async close(): Promise<void> {}

  blob(type: string): Blob {
    return new Blob(this.chunks as BlobPart[], { type });
  }
}

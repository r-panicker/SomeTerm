/**
 * Fixed-capacity byte ring addressed by absolute stream offsets, so views can
 * keep stable references (a plotted point, a bookmark) while old data is evicted.
 */
export class ByteRing {
  private readonly data: Uint8Array;
  private written = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('capacity must be a positive integer');
    this.data = new Uint8Array(capacity);
  }

  /** Offset of the oldest byte still held. */
  get start(): number {
    return Math.max(0, this.written - this.capacity);
  }

  /** Offset one past the newest byte. */
  get end(): number {
    return this.written;
  }

  push(chunk: Uint8Array): void {
    // A chunk larger than the ring only needs its tail stored; offsets still advance by the full length.
    const src = chunk.length > this.capacity ? chunk.subarray(chunk.length - this.capacity) : chunk;
    let pos = (this.written + (chunk.length - src.length)) % this.capacity;
    const first = Math.min(src.length, this.capacity - pos);
    this.data.set(src.subarray(0, first), pos);
    this.data.set(src.subarray(first), 0);
    this.written += chunk.length;
  }

  /** Copy of bytes in [from, to). Throws if any part has been evicted or not yet written. */
  slice(from: number, to: number = this.end): Uint8Array {
    if (from < this.start || to > this.end || from > to) {
      throw new RangeError(`range [${from}, ${to}) is outside held data [${this.start}, ${this.end})`);
    }
    const out = new Uint8Array(to - from);
    for (let i = 0; i < out.length; i++) out[i] = this.data[(from + i) % this.capacity]!;
    return out;
  }
}

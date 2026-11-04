export type NewlineMode = 'cr' | 'lf' | 'crlf' | 'auto';

export interface Line {
  /** Content bytes, terminator excluded. */
  bytes: Uint8Array;
  /** Absolute stream offset of the first content byte. */
  offset: number;
  /** Timestamp of the chunk in which the line's first byte arrived. */
  timestamp: number;
}

const CR = 0x0d;
const LF = 0x0a;

/**
 * Streaming line splitter. `auto` accepts CR, LF or CRLF, each ending exactly one line.
 * `crlf` ends a line only on the two-byte sequence, so a lone CR or LF is content.
 */
export class LineSplitter {
  private pending: number[] = [];
  private pendingOffset = 0;
  private pendingTime = 0;
  private offset: number;
  private sawCr = false;

  /** `startOffset` is the stream offset of the next byte, so offsets stay absolute across a reset. */
  constructor(private readonly mode: NewlineMode = 'auto', startOffset = 0) {
    this.offset = startOffset;
    this.pendingOffset = startOffset;
  }

  push(chunk: Uint8Array, timestamp: number): Line[] {
    const lines: Line[] = [];
    for (const b of chunk) {
      this.step(b, timestamp, lines);
      this.offset++;
    }
    return lines;
  }

  /** Bytes received since the last terminator, for display of a partial line. */
  peekPartial(): Line | null {
    if (this.pending.length === 0) return null;
    return { bytes: Uint8Array.from(this.pending), offset: this.pendingOffset, timestamp: this.pendingTime };
  }

  private step(b: number, t: number, out: Line[]): void {
    if (this.mode === 'auto') {
      if (this.sawCr) {
        this.sawCr = false;
        if (b === LF) return; // second half of CRLF, already terminated
      }
      if (b === CR) { this.sawCr = true; this.emit(out, t); return; }
      if (b === LF) { this.emit(out, t); return; }
    } else if (this.mode === 'cr') {
      if (b === CR) { this.emit(out, t); return; }
    } else if (this.mode === 'lf') {
      if (b === LF) { this.emit(out, t); return; }
    } else {
      if (this.sawCr) {
        this.sawCr = false;
        if (b === LF) { this.emit(out, t); return; }
        this.append(CR, this.offset - 1, t);
      }
      if (b === CR) { this.sawCr = true; return; }
    }
    this.append(b, this.offset, t);
  }

  private append(b: number, at: number, t: number): void {
    if (this.pending.length === 0) { this.pendingOffset = at; this.pendingTime = t; }
    this.pending.push(b);
  }

  private emit(out: Line[], t: number): void {
    // An empty line has no first byte of its own; it happened when its terminator arrived.
    const time = this.pending.length ? this.pendingTime : t;
    out.push({ bytes: Uint8Array.from(this.pending), offset: this.pendingOffset, timestamp: time });
    this.pending = [];
    this.pendingOffset = this.offset + 1;
  }
}

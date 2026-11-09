/** How a received byte stream is cut into frames for the byte views. */
export type FrameRule = { kind: 'gap'; ms: number } | { kind: 'sync'; pattern: Uint8Array };

/** One row of a framed byte view. */
export interface FrameRow {
  /** Absolute stream offset of the row's first byte. */
  at: number;
  len: number;
  /** The row starts a frame (rather than continuing a long one). */
  first: boolean;
  /** Arrival time of the frame, on the first row; NaN when unknown. */
  time: number;
  /** Frame number since the index was made, for telling neighbours apart. */
  n: number;
}

/**
 * Frame starts in a byte stream addressed by absolute offsets (as `ByteRing`),
 * and the rows they wrap into at a given row width. A frame starts after an idle
 * gap between chunks, or at each occurrence of a sync pattern; a frame longer
 * than a row continues on the next. Row numbers are kept absolute so evicting
 * old data or clearing the view never re-walks every frame.
 */
export class FrameIndex {
  private starts: number[] = [];
  private times: number[] = [];
  /** Rows before each frame, counted from the first frame ever held. */
  private cum: number[] = [];
  private per = 16;
  private lastTs = -Infinity;
  private tail: number[] = [];
  /** Frames spliced off the front, so frame numbers stay stable. */
  private dropped = 0;
  private end: number;

  constructor(readonly rule: FrameRule, at: number) {
    this.end = at;
    this.add(at, NaN);
  }

  /** Feeds the next chunk; its first byte is at the current end offset. */
  push(chunk: Uint8Array, ts: number): void {
    if (this.rule.kind === 'gap') {
      if (ts - this.lastTs >= this.rule.ms) this.add(this.end, ts);
      this.lastTs = ts;
    } else {
      const p = this.rule.pattern;
      if (p.length) {
        const base = this.end - this.tail.length;
        let buf = chunk;
        if (this.tail.length) {
          buf = new Uint8Array(this.tail.length + chunk.length);
          buf.set(this.tail);
          buf.set(chunk, this.tail.length);
        }
        for (let i = 0; i + p.length <= buf.length; i++) {
          let j = 0;
          while (j < p.length && buf[i + j] === p[j]) j++;
          if (j === p.length) this.add(base + i, ts);
        }
        this.tail = Array.from(buf.subarray(Math.max(0, buf.length - (p.length - 1))));
      }
    }
    this.end += chunk.length;
  }

  /** Rows in [from, end) at `per` bytes per row. */
  count(from: number, per: number): number {
    this.setPer(per);
    const last = this.starts.length - 1;
    const total = this.cum[last]! + Math.ceil((this.end - this.starts[last]!) / per);
    return Math.max(0, total - this.rowsBefore(from));
  }

  /** The i-th row counted from `from`. */
  row(i: number, from: number, per: number): FrameRow {
    this.setPer(per);
    const r = i + this.rowsBefore(from);
    let lo = 0;
    let hi = this.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid]! <= r) lo = mid;
      else hi = mid - 1;
    }
    const start = this.starts[lo]!;
    const next = this.starts[lo + 1] ?? this.end;
    let at = start + (r - this.cum[lo]!) * per;
    const stop = Math.min(at + per, next);
    if (at < from) at = Math.min(from, stop);
    return { at, len: stop - at, first: at === start, time: at === start ? this.times[lo]! : NaN, n: this.dropped + lo };
  }

  /** Drops frames that end before `from` (evicted or cleared data). */
  prune(from: number): void {
    let k = 0;
    while (k + 1 < this.starts.length && this.starts[k + 1]! <= from) k++;
    // Splicing is O(n); do it in batches.
    if (k > 1024 && k * 2 > this.starts.length) {
      this.starts.splice(0, k);
      this.times.splice(0, k);
      this.cum.splice(0, k);
      this.dropped += k;
    }
  }

  private rowsBefore(o: number): number {
    if (o <= this.starts[0]!) return this.cum[0]!;
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= o) lo = mid;
      else hi = mid - 1;
    }
    // The row holding `o` is the first one shown, clipped to start at `o`.
    return this.cum[lo]! + Math.floor((o - this.starts[lo]!) / this.per);
  }

  private add(at: number, ts: number): void {
    const n = this.starts.length;
    if (n && this.starts[n - 1] === at) {
      if (Number.isNaN(this.times[n - 1]!)) this.times[n - 1] = ts;
      return;
    }
    this.cum.push(n ? this.cum[n - 1]! + Math.ceil((at - this.starts[n - 1]!) / this.per) : 0);
    this.starts.push(at);
    this.times.push(ts);
  }

  private setPer(per: number): void {
    if (per === this.per) return;
    this.per = per;
    for (let k = 1; k < this.starts.length; k++) this.cum[k] = this.cum[k - 1]! + Math.ceil((this.starts[k]! - this.starts[k - 1]!) / per);
  }
}

import type { Span } from '../components/CanvasView.svelte';

/**
 * Maps logical rows (one per line) to screen rows when long lines wrap at `cols`
 * characters. Row counts of settled lines are cached and extended as lines
 * arrive; only the trailing rows that can still change (the partial line, the
 * line being typed) are measured every time.
 */
export class WrapMap {
  private key = '';
  private base = -1;
  /** prefix[j] = screen rows before logical row j, for settled rows. */
  private prefix: number[] = [0];
  /** Screen rows of each trailing, still-changing logical row. */
  private tail: number[] = [];

  /**
   * `settled` rows never change once measured; rows from `settled` to `total`
   * are re-measured. `key` covers everything that changes a row's length
   * (columns, timestamps, control-character view, filtering…); `base` is the
   * index of logical row 0 in the whole log, so trimming the log rebuilds.
   */
  update(key: string, base: number, settled: number, total: number, cols: number, len: (j: number) => number): void {
    const rows = (j: number) => Math.max(1, Math.ceil(len(j) / cols));
    if (key !== this.key || base !== this.base || settled < this.prefix.length - 1) {
      this.key = key;
      this.base = base;
      this.prefix = [0];
    }
    for (let j = this.prefix.length - 1; j < settled; j++) this.prefix.push(this.prefix[j]! + rows(j));
    this.tail = [];
    for (let j = settled; j < total; j++) this.tail.push(rows(j));
  }

  get rows(): number {
    return this.prefix[this.prefix.length - 1]! + this.tail.reduce((a, b) => a + b, 0);
  }

  /** First screen row of logical row `j`. */
  first(j: number): number {
    const settled = this.prefix.length - 1;
    if (j <= settled) return this.prefix[j]!;
    let r = this.prefix[settled]!;
    for (let t = 0; t < j - settled && t < this.tail.length; t++) r += this.tail[t]!;
    return r;
  }

  /** The logical row and the piece of it (0 = its first screen row) shown on screen row `r`. */
  locate(r: number): { j: number; k: number } {
    const settled = this.prefix.length - 1;
    if (r < this.prefix[settled]!) {
      let lo = 0;
      let hi = settled - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (this.prefix[mid]! <= r) lo = mid;
        else hi = mid - 1;
      }
      return { j: lo, k: r - this.prefix[lo]! };
    }
    let at = this.prefix[settled]!;
    for (let t = 0; t < this.tail.length; t++) {
      if (r < at + this.tail[t]!) return { j: settled + t, k: r - at };
      at += this.tail[t]!;
    }
    return { j: settled + Math.max(0, this.tail.length - 1), k: 0 };
  }
}

/** The part of a row's spans covering characters [from, to). */
export function sliceSpans(spans: Span[], from: number, to: number): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const s of spans) {
    const end = at + s.text.length;
    if (end > from && at < to) out.push({ ...s, text: s.text.slice(Math.max(0, from - at), Math.min(s.text.length, to - at)) });
    at = end;
    if (at >= to) break;
  }
  return out;
}

import type { Sample } from './parse';

/**
 * Column store of plotted rows, aligned on a shared time axis. A series that is
 * missing from a row gets null there, so uPlot draws a gap rather than a false value.
 */
export class SeriesStore {
  names: string[] = [];
  times: number[] = [];
  /** Stream offset of the line each row came from, for jumping to raw data. */
  offsets: number[] = [];
  columns: (number | null)[][] = [];
  private index = new Map<string, number>();

  constructor(private readonly maxRows = 200_000) {}

  get length(): number {
    return this.times.length;
  }

  push(time: number, offset: number, samples: Sample[]): void {
    for (const s of samples) {
      if (!this.index.has(s.name)) {
        this.index.set(s.name, this.names.length);
        this.names.push(s.name);
        this.columns.push(new Array<number | null>(this.times.length).fill(null));
      }
    }
    this.times.push(time);
    this.offsets.push(offset);
    for (const col of this.columns) col.push(null);
    for (const s of samples) this.columns[this.index.get(s.name)!]![this.times.length - 1] = s.value;
    // Trim in batches so pushes stay amortised O(1).
    if (this.times.length > this.maxRows * 1.1) this.dropFirst(this.times.length - this.maxRows);
  }

  /** Index of the first row with time >= t. */
  lowerBound(t: number): number {
    let lo = 0;
    let hi = this.times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.times[mid]! < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Rows [from, end) as [times, ...columns]. */
  slice(from: number): [number[], ...(number | null)[][]] {
    return [this.times.slice(from), ...this.columns.map((c) => c.slice(from))];
  }

  clear(): void {
    this.names = [];
    this.times = [];
    this.offsets = [];
    this.columns = [];
    this.index.clear();
  }

  private dropFirst(n: number): void {
    this.times.splice(0, n);
    this.offsets.splice(0, n);
    for (const c of this.columns) c.splice(0, n);
  }
}

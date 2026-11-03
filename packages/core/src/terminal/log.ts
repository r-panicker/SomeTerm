import type { StyleRun } from '../pipeline/ansi';

export type Direction = 'rx' | 'tx';

export interface TermLine {
  dir: Direction;
  text: string;
  /** ANSI styling over `text`. */
  runs?: StyleRun[];
  /** Text with escapes visible, when it had any. */
  raw?: string;
  time: number;
  /** Stream offset of the first byte for rx lines; -1 for tx. */
  offset: number;
  /** Which port the line came from, in views that merge several. */
  src?: number;
}

/** Bounded list of terminal lines; trims from the front in batches. */
export class TerminalLog {
  private lines: TermLine[] = [];
  /** Lines ever trimmed from the front; index i is absolute line `dropped + i`. */
  dropped = 0;

  constructor(private readonly maxLines = 100_000) {}

  get length(): number {
    return this.lines.length;
  }

  get(i: number): TermLine | undefined {
    return this.lines[i];
  }

  push(line: TermLine): void {
    this.lines.push(line);
    if (this.lines.length > this.maxLines * 1.1) {
      const n = this.lines.length - this.maxLines;
      this.lines.splice(0, n);
      this.dropped += n;
    }
  }

  /**
   * Pushes an rx line, placing it before any trailing tx lines that are newer.
   * Rx lines reach the log after parsing, so a send echoed meanwhile can
   * otherwise appear ahead of data that arrived before it.
   */
  pushRx(line: TermLine): void {
    let i = this.lines.length;
    while (i > 0) {
      const prev = this.lines[i - 1]!;
      if (prev.dir !== 'tx' || prev.time <= line.time) break;
      i--;
    }
    if (i === this.lines.length) this.push(line);
    else this.lines.splice(i, 0, line);
  }

  /**
   * Inserts by time, for merging several ports' lines that reach the log out of
   * order by a few milliseconds. Only the newest `window` lines are searched, so
   * a line far older than that lands at that boundary rather than costing a full scan.
   */
  pushByTime(line: TermLine, window = 256): void {
    let i = this.lines.length;
    const stop = Math.max(0, i - window);
    while (i > stop && this.lines[i - 1]!.time > line.time) i--;
    if (i === this.lines.length) this.push(line);
    else this.lines.splice(i, 0, line);
  }

  clear(): void {
    this.dropped += this.lines.length;
    this.lines = [];
  }

  /** Index of the rx line containing `offset`, or -1 if it is no longer held. */
  indexOfOffset(offset: number): number {
    let lo = 0;
    let hi = this.lines.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const l = this.lines[mid]!;
      if (l.offset < 0) {
        // tx lines carry no offset; step to the nearest rx neighbour
        let j = mid - 1;
        while (j >= lo && this.lines[j]!.offset < 0) j--;
        if (j < lo) { lo = mid + 1; continue; }
        if (this.lines[j]!.offset <= offset) { best = j; lo = mid + 1; } else hi = j - 1;
        continue;
      }
      if (l.offset <= offset) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  }
}

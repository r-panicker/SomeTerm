import { buildMatcher, type Matcher, type SearchOptions } from './search';
import type { TermLine, TerminalLog } from './log';

export interface Hit {
  /** Absolute line number (log.dropped + index). */
  abs: number;
  ranges: [number, number][];
}

/** Rx lines can be slotted in among the newest few lines, so those are always rescanned. */
const RESCAN_TAIL = 64;

/** Incremental search over a TerminalLog: only lines added since the last scan are matched. */
export class FindIndex {
  hits: Hit[] = [];
  total = 0;
  error = '';
  private matcher: Matcher | null = null;
  private scanned = 0;
  private textOf: (l: TermLine) => string = (l) => l.text;

  get active(): boolean {
    return !!this.matcher;
  }

  /** `textOf` picks the text that is on screen, so match positions line up with what is drawn. */
  set(query: string, opts: SearchOptions, log: TerminalLog, textOf: (l: TermLine) => string = (l) => l.text): void {
    this.textOf = textOf;
    const m = buildMatcher(query, opts);
    this.error = typeof m === 'string' ? m : '';
    this.matcher = typeof m === 'function' ? m : null;
    this.hits = [];
    this.total = 0;
    this.scanned = log.dropped;
    this.scan(log);
  }

  scan(log: TerminalLog): void {
    if (!this.matcher) return;
    const end = log.dropped + log.length;
    const from = Math.max(log.dropped, Math.min(this.scanned, end) - RESCAN_TAIL);
    this.dropBefore(log.dropped);
    while (this.hits.length && this.hits[this.hits.length - 1]!.abs >= from) this.total -= this.hits.pop()!.ranges.length;
    for (let abs = from; abs < end; abs++) {
      const ranges = this.matcher(this.textOf(log.get(abs - log.dropped)!));
      if (ranges.length) {
        this.hits.push({ abs, ranges });
        this.total += ranges.length;
      }
    }
    this.scanned = end;
  }

  /** Index into `hits` of the line `abs`, or -1. */
  find(abs: number): number {
    let lo = 0;
    let hi = this.hits.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const a = this.hits[mid]!.abs;
      if (a === abs) return mid;
      if (a < abs) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  /** First hit index whose line is >= abs (hits.length if none). */
  lowerBound(abs: number): number {
    let lo = 0;
    let hi = this.hits.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.hits[mid]!.abs < abs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private dropBefore(abs: number): void {
    let n = 0;
    while (n < this.hits.length && this.hits[n]!.abs < abs) this.total -= this.hits[n++]!.ranges.length;
    if (n) this.hits.splice(0, n);
  }
}

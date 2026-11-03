export type Direction = 'rx' | 'tx';

export interface TermLine {
  dir: Direction;
  text: string;
  time: number;
  /** Stream offset of the first byte for rx lines; -1 for tx. */
  offset: number;
}

/** Bounded list of terminal lines; trims from the front in batches. */
export class TerminalLog {
  private lines: TermLine[] = [];

  constructor(private readonly maxLines = 100_000) {}

  get length(): number {
    return this.lines.length;
  }

  get(i: number): TermLine | undefined {
    return this.lines[i];
  }

  push(line: TermLine): void {
    this.lines.push(line);
    if (this.lines.length > this.maxLines * 1.1) this.lines.splice(0, this.lines.length - this.maxLines);
  }

  clear(): void {
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

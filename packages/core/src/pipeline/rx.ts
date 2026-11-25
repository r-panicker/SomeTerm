import { renderLine } from './render';
import { parseNumericLine, type Sample } from '../plot/parse';
import { LineSplitter, type Line, type NewlineMode } from './lines';
import { AnsiParser, type StyleRun } from './ansi';

export interface RxLine {
  /** Display text with ANSI escapes removed, UTF-8 decoded, BS and CR applied. */
  text: string;
  /** Content bytes in the stream, terminator excluded; the text can be shorter or longer. */
  len: number;
  /** ANSI styling over `text`; empty when unstyled. */
  runs: StyleRun[];
  /** The line with escapes shown as ␛…, present only when it contained any. */
  raw?: string;
  time: number;
  offset: number;
  /** Plot samples when the whole line is numeric, else null. */
  samples: Sample[] | null;
}

/** A screen row of the every-byte view: no line ending, cut where the width is full. */
export interface RxRow {
  /** Every byte as text, BS and CR not applied. */
  text: string;
  time: number;
  offset: number;
  len: number;
}

export interface RxBatch {
  lines: RxLine[];
  partial: { text: string; runs: StyleRun[]; raw?: string; time: number; offset: number; len: number } | null;
  /** Present while rows are on; the screen shows these instead of the lines. */
  rows?: { done: RxRow[]; partial: RxRow | null };
}

export type RxCommand =
  | { type: 'data'; chunk: Uint8Array; time: number }
  | { type: 'reset'; mode: NewlineMode; offset: number }
  /** Row width in characters, every byte shown. */
  | { type: 'width'; width: number };

/**
 * Parse again, with new settings, bytes already received: `bytes` start at stream
 * offset `from`, and chunk k starts at `cuts[k]` and arrived at `times[k]`. The new
 * pipeline then carries on with the live stream, so there is no seam between the two.
 */
export interface RecutCommand {
  type: 'recut';
  id: number;
  mode: NewlineMode;
  rows: boolean;
  width: number;
  from: number;
  bytes: Uint8Array;
  cuts: number[];
  times: number[];
}

/**
 * Receive-side parsing: split into lines, render for display, extract plot
 * samples. Pure so it can run in a worker or inline with identical results.
 * Lines always follow the line ending, since auto-replies, the plot and the
 * Monitor work on them; rows only change what the screen shows.
 */
export class RxPipeline {
  private splitter: LineSplitter;
  private ansi = new AnsiParser();
  private lines: RxLine[] = [];
  private dirty = false;
  private mode: NewlineMode;
  private width = 80;
  private rows: LineSplitter | null = null;
  private done: RxRow[] = [];

  constructor(mode: NewlineMode = 'auto', offset = 0) {
    this.mode = mode;
    this.splitter = new LineSplitter(mode, offset);
  }

  /** A pipeline that has parsed `c`'s bytes, and the batch of everything it found. */
  static recut(c: RecutCommand): { pipeline: RxPipeline; batch: RxBatch } {
    const p = new RxPipeline(c.mode, c.from);
    p.width = c.width;
    if (c.rows) p.rows = new LineSplitter('none', c.from, c.width);
    c.cuts.forEach((at, k) => {
      const end = c.cuts[k + 1] ?? c.bytes.length;
      if (end > at) p.apply({ type: 'data', chunk: c.bytes.subarray(at, end), time: c.times[k]! });
    });
    p.dirty = true;
    return { pipeline: p, batch: p.drain()! };
  }

  apply(cmd: RxCommand): void {
    if (cmd.type === 'reset') {
      this.mode = cmd.mode;
      this.splitter = new LineSplitter(cmd.mode, cmd.offset);
      if (this.rows) this.rows = new LineSplitter('none', cmd.offset, this.width);
      this.ansi.reset();
      this.lines = [];
      this.done = [];
      this.dirty = true;
      return;
    }
    if (cmd.type === 'width') {
      this.width = cmd.width;
      if (this.rows) this.rows.width = cmd.width;
      return;
    }
    this.split(cmd.chunk, cmd.time);
    this.cut(cmd.chunk, cmd.time);
  }

  private split(chunk: Uint8Array, time: number): void {
    for (const l of this.splitter.push(chunk, time)) {
      const { text, runs, raw } = this.render(l.bytes, true);
      // The other half of a CRLF, shown when the line ending is set to CR or LF alone, does not stop a line plotting.
      const samples = parseNumericLine(text.replace(/^[␊␍]+|[␊␍]+$/g, ''));
      this.lines.push({ text, runs, ...(raw !== undefined && { raw }), time: l.timestamp, offset: l.offset, len: l.bytes.length, samples });
    }
    this.dirty = true;
  }

  private cut(chunk: Uint8Array, time: number): void {
    if (!this.rows) return;
    for (const r of this.rows.push(chunk, time)) this.done.push(row(r));
    this.dirty = true;
  }

  /** Lines completed since the last drain, plus the current partial line; null if nothing changed. */
  drain(): RxBatch | null {
    if (!this.dirty) return null;
    this.dirty = false;
    const p = this.splitter.peekPartial();
    const batch: RxBatch = {
      lines: this.lines,
      partial: p ? { ...this.render(p.bytes, false), time: p.timestamp, offset: p.offset, len: p.bytes.length } : null,
    };
    if (this.rows) {
      const rp = this.rows.peekPartial();
      batch.rows = { done: this.done, partial: rp && row(rp) };
    }
    this.lines = [];
    this.done = [];
    return batch;
  }

  private render(bytes: Uint8Array, commit: boolean): { text: string; runs: StyleRun[]; raw?: string } {
    const r = this.ansi.parse(bytes, () => '', commit);
    // Only auto treats a CR inside a line as a return to its start; with a line ending
    // chosen by hand, a CR that does not end the line is shown, as a stray LF is.
    const { text, runs } = renderLine(r.kept, r.runs, this.mode === 'auto' ? 'screen' : 'bs');
    // The escapes-visible form is the raw stream, so BS and CR stay as ␈ and ␍ there.
    return r.hadEscape ? { text, runs, raw: renderLine(bytes, [], 'none').text } : { text, runs };
  }
}

function row(l: Line): RxRow {
  return { text: renderLine(l.bytes, [], 'none').text, time: l.timestamp, offset: l.offset, len: l.bytes.length };
}

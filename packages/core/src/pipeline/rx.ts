import { renderLine } from './render';
import { parseNumericLine, type Sample } from '../plot/parse';
import { LineSplitter, type NewlineMode } from './lines';
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

export interface RxBatch {
  lines: RxLine[];
  partial: { text: string; runs: StyleRun[]; raw?: string; time: number; offset: number; len: number } | null;
}

export type RxCommand =
  | { type: 'data'; chunk: Uint8Array; time: number }
  | { type: 'reset'; mode: NewlineMode; offset: number };

/**
 * Receive-side parsing: split into lines, render for display, extract plot
 * samples. Pure so it can run in a worker or inline with identical results.
 */
export class RxPipeline {
  private splitter: LineSplitter;
  private ansi = new AnsiParser();
  private lines: RxLine[] = [];
  private dirty = false;

  constructor(mode: NewlineMode = 'auto', offset = 0) {
    this.splitter = new LineSplitter(mode, offset);
  }

  apply(cmd: RxCommand): void {
    if (cmd.type === 'reset') {
      this.splitter = new LineSplitter(cmd.mode, cmd.offset);
      this.ansi.reset();
      this.lines = [];
      this.dirty = true;
      return;
    }
    for (const l of this.splitter.push(cmd.chunk, cmd.time)) {
      const { text, runs, raw } = this.render(l.bytes, true);
      const samples = parseNumericLine(text);
      this.lines.push({ text, runs, ...(raw !== undefined && { raw }), time: l.timestamp, offset: l.offset, len: l.bytes.length, samples });
    }
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
    this.lines = [];
    return batch;
  }

  private render(bytes: Uint8Array, commit: boolean): { text: string; runs: StyleRun[]; raw?: string } {
    const r = this.ansi.parse(bytes, () => '', commit);
    const { text, runs } = renderLine(r.kept, r.runs);
    // The escapes-visible form is the raw stream, so BS and CR stay as ␈ and ␍ there.
    return r.hadEscape ? { text, runs, raw: renderLine(bytes, [], false).text } : { text, runs };
  }
}

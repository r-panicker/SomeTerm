import { toAscii } from '../format/bytes';
import { parseNumericLine, type Sample } from '../plot/parse';
import { LineSplitter, type NewlineMode } from './lines';
import { AnsiParser, type StyleRun } from './ansi';

export interface RxLine {
  /** Display text with ANSI escapes removed. */
  text: string;
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
  partial: { text: string; runs: StyleRun[]; raw?: string; time: number; offset: number } | null;
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
      // In LF mode a CRLF sender leaves a CR on every line; it must not stop the line plotting.
      const plain = text.replace(/\u240d+$/, '');
      const samples = parseNumericLine(plain);
      this.lines.push({ text, runs, ...(raw !== undefined && { raw }), time: l.timestamp, offset: l.offset, samples });
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
      partial: p ? { ...this.render(p.bytes, false), time: p.timestamp, offset: p.offset } : null,
    };
    this.lines = [];
    return batch;
  }

  private render(bytes: Uint8Array, commit: boolean): { text: string; runs: StyleRun[]; raw?: string } {
    const show = (b: Uint8Array) => toAscii(b, { controlPictures: true });
    const r = this.ansi.parse(bytes, show, commit);
    return r.hadEscape ? { text: r.text, runs: r.runs, raw: show(bytes) } : { text: r.text, runs: r.runs };
  }
}

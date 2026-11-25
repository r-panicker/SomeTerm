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
  | { type: 'reset'; mode: NewlineMode; offset: number }
  /** A new line ending from the current, unfinished line on; completed lines stay as they are. */
  | { type: 'mode'; mode: NewlineMode }
  /** Row length in bytes for line ending `none`. */
  | { type: 'width'; width: number };

/**
 * Receive-side parsing: split into lines, render for display, extract plot
 * samples. Pure so it can run in a worker or inline with identical results.
 */
export class RxPipeline {
  private splitter: LineSplitter;
  private ansi = new AnsiParser();
  private lines: RxLine[] = [];
  private dirty = false;
  private mode: NewlineMode;
  private width = 80;

  constructor(mode: NewlineMode = 'auto', offset = 0) {
    this.mode = mode;
    this.splitter = new LineSplitter(mode, offset, this.width);
  }

  apply(cmd: RxCommand): void {
    if (cmd.type === 'reset') {
      this.mode = cmd.mode;
      this.splitter = new LineSplitter(cmd.mode, cmd.offset, this.width);
      this.ansi.reset();
      this.lines = [];
      this.dirty = true;
      return;
    }
    if (cmd.type === 'mode') {
      const u = this.splitter.unfinished();
      this.mode = cmd.mode;
      this.splitter = new LineSplitter(cmd.mode, u.offset, this.width);
      this.split(u.bytes, u.timestamp);
      return;
    }
    if (cmd.type === 'width') {
      this.width = cmd.width;
      this.splitter.width = cmd.width;
      return;
    }
    this.split(cmd.chunk, cmd.time);
  }

  private split(chunk: Uint8Array, time: number): void {
    for (const l of this.splitter.push(chunk, time)) {
      const { text, runs, raw } = this.render(l.bytes, true);
      // Rows cut by width are not lines, so they carry no plot values. The other half of a
      // CRLF, shown when the line ending is set to CR or LF alone, does not stop a line plotting.
      const samples = this.mode === 'none' ? null : parseNumericLine(text.replace(/^[␊␍]+|[␊␍]+$/g, ''));
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
    // Only auto treats a CR inside a line as a return to its start; with a line ending
    // chosen by hand, a CR that does not end the line is shown, as a stray LF is.
    const { text, runs } = renderLine(r.kept, r.runs, this.mode === 'auto' ? 'screen' : 'bs');
    // The escapes-visible form is the raw stream, so BS and CR stay as ␈ and ␍ there.
    return r.hadEscape ? { text, runs, raw: renderLine(bytes, [], 'none').text } : { text, runs };
  }
}

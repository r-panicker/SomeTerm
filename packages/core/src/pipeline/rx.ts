import { toAscii } from '../format/bytes';
import { parseNumericLine, type Sample } from '../plot/parse';
import { LineSplitter, type NewlineMode } from './lines';

export interface RxLine {
  text: string;
  time: number;
  offset: number;
  /** Plot samples when the whole line is numeric, else null. */
  samples: Sample[] | null;
}

export interface RxBatch {
  lines: RxLine[];
  partial: { text: string; time: number; offset: number } | null;
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
  private lines: RxLine[] = [];
  private dirty = false;

  constructor(mode: NewlineMode = 'auto', offset = 0) {
    this.splitter = new LineSplitter(mode, offset);
  }

  apply(cmd: RxCommand): void {
    if (cmd.type === 'reset') {
      this.splitter = new LineSplitter(cmd.mode, cmd.offset);
      this.lines = [];
      this.dirty = true;
      return;
    }
    for (const l of this.splitter.push(cmd.chunk, cmd.time)) {
      const text = toAscii(l.bytes, { controlPictures: true });
      // In LF mode a CRLF sender leaves a CR on every line; it must not stop the line plotting.
      let end = l.bytes.length;
      while (end > 0 && l.bytes[end - 1] === 0x0d) end--;
      const samples = parseNumericLine(toAscii(l.bytes.subarray(0, end)));
      this.lines.push({ text, time: l.timestamp, offset: l.offset, samples });
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
      partial: p ? { text: toAscii(p.bytes, { controlPictures: true }), time: p.timestamp, offset: p.offset } : null,
    };
    this.lines = [];
    return batch;
  }
}

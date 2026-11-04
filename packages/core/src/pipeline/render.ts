import type { StyleRun } from './ansi';

const BS = 0x08;
const CR = 0x0d;

/** Length of the UTF-8 sequence starting with `b`, or 0 if `b` cannot start one. */
function seqLength(b: number): number {
  if (b >= 0xc2 && b <= 0xdf) return 2;
  if (b >= 0xe0 && b <= 0xef) return 3;
  if (b >= 0xf0 && b <= 0xf4) return 4;
  return 0;
}

/** The code point of a well-formed sequence at `i`, or -1 (overlong, surrogate, out of range, truncated). */
function decodeAt(bytes: Uint8Array, i: number, n: number): number {
  if (i + n > bytes.length) return -1;
  let cp = bytes[i]! & (0xff >> (n + 1));
  for (let k = 1; k < n; k++) {
    const c = bytes[i + k]!;
    if ((c & 0xc0) !== 0x80) return -1;
    cp = (cp << 6) | (c & 0x3f);
  }
  if ((n === 3 && cp < 0x800) || (n === 4 && (cp < 0x10000 || cp > 0x10ffff)) || (cp >= 0xd800 && cp <= 0xdfff)) return -1;
  return cp;
}

function asciiChar(b: number): string {
  if (b >= 0x20 && b < 0x7f) return String.fromCharCode(b);
  if (b < 0x20) return String.fromCharCode(0x2400 + b);
  return b === 0x7f ? '␡' : '.';
}

/**
 * Turns one line's bytes (escape sequences already removed) into display text.
 * UTF-8 is decoded; bytes that are not part of a valid sequence show as '.', and
 * control bytes as control pictures (␀ ␉ …). With `edit`, BS and CR act as on a
 * terminal: BS moves left and the next character overwrites, CR returns to the
 * start of the line, so a shell's echoed Backspace or a `10%\r55%` counter reads
 * as the screen would show it. `runs` are positions in `bytes` and come back as
 * positions in the text.
 */
export function renderLine(bytes: Uint8Array, runs: StyleRun[], edit = true): { text: string; runs: StyleRun[] } {
  let simple = true;
  for (const b of bytes) {
    if (b >= 0x80 || (edit && (b === BS || b === CR))) { simple = false; break; }
  }
  if (simple) {
    let text = '';
    for (const b of bytes) text += asciiChar(b);
    return { text, runs };
  }

  const styleOf = new Int32Array(bytes.length).fill(-1);
  runs.forEach((r, k) => styleOf.fill(k, Math.max(0, r.from), Math.min(bytes.length, r.to)));
  const cells: string[] = [];
  const cellStyle: number[] = [];
  let col = 0;
  let backspaced = false;
  const put = (ch: string, style: number) => { cells[col] = ch; cellStyle[col] = style; col++; };

  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!;
    if (edit && b === BS) { if (col > 0) col--; backspaced = true; i++; continue; }
    if (edit && b === CR) { col = 0; i++; continue; }
    if (b < 0x80) { put(asciiChar(b), styleOf[i]!); i++; continue; }
    const n = seqLength(b);
    const cp = n ? decodeAt(bytes, i, n) : -1;
    if (cp < 0) { put('.', styleOf[i]!); i++; continue; }
    put(String.fromCodePoint(cp), styleOf[i]!);
    i += n;
  }

  // Erasing with "\b \b" leaves blanks a screen would show as nothing.
  let len = cells.length;
  if (backspaced) while (len > 0 && cells[len - 1] === ' ' && cellStyle[len - 1] === -1) len--;

  let text = '';
  const out: StyleRun[] = [];
  let lastStyle = -1;
  for (let c = 0; c < len; c++) {
    const from = text.length;
    text += cells[c]!;
    const k = cellStyle[c]!;
    if (k >= 0 && k === lastStyle && out[out.length - 1]!.to === from) out[out.length - 1]!.to = text.length;
    else if (k >= 0) out.push({ ...runs[k]!, from, to: text.length });
    lastStyle = k;
  }
  return { text, runs: out };
}

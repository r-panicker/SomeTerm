/** Colour: 0-255 is the xterm palette index; >= 0x1000000 is 0x1000000 | 0xRRGGBB. */
export type AnsiColor = number;

export interface AnsiStyle {
  fg?: AnsiColor;
  bg?: AnsiColor;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

export interface StyleRun extends AnsiStyle {
  from: number;
  to: number;
}

export const RGB_FLAG = 0x1000000;

const ESC = 0x1b;

function isDefault(s: AnsiStyle): boolean {
  return s.fg === undefined && s.bg === undefined && !s.bold && !s.dim && !s.italic && !s.underline && !s.inverse;
}

function same(a: AnsiStyle, b: AnsiStyle): boolean {
  return a.fg === b.fg && a.bg === b.bg && !a.bold === !b.bold && !a.dim === !b.dim && !a.italic === !b.italic && !a.underline === !b.underline && !a.inverse === !b.inverse;
}

/** Applies one SGR parameter list (the numbers in ESC[...m) to a style. */
export function applySgr(style: AnsiStyle, params: number[]): AnsiStyle {
  let s: AnsiStyle = { ...style };
  if (params.length === 0) params = [0];
  for (let i = 0; i < params.length; i++) {
    const p = params[i]!;
    if (p === 0) s = {};
    else if (p === 1) s.bold = true;
    else if (p === 2) s.dim = true;
    else if (p === 3) s.italic = true;
    else if (p === 4) s.underline = true;
    else if (p === 7) s.inverse = true;
    else if (p === 22) { s.bold = false; s.dim = false; }
    else if (p === 23) s.italic = false;
    else if (p === 24) s.underline = false;
    else if (p === 27) s.inverse = false;
    else if (p >= 30 && p <= 37) s.fg = p - 30;
    else if (p >= 90 && p <= 97) s.fg = p - 90 + 8;
    else if (p >= 40 && p <= 47) s.bg = p - 40;
    else if (p >= 100 && p <= 107) s.bg = p - 100 + 8;
    else if (p === 39) s.fg = undefined;
    else if (p === 49) s.bg = undefined;
    else if (p === 38 || p === 48) {
      const key = p === 38 ? 'fg' : 'bg';
      if (params[i + 1] === 5 && params[i + 2] !== undefined) {
        s[key] = params[i + 2]! & 0xff;
        i += 2;
      } else if (params[i + 1] === 2 && params[i + 4] !== undefined) {
        s[key] = RGB_FLAG | ((params[i + 2]! & 0xff) << 16) | ((params[i + 3]! & 0xff) << 8) | (params[i + 4]! & 0xff);
        i += 4;
      }
    }
  }
  return s;
}

/**
 * Line-oriented ANSI handling: SGR styling is kept as runs over the visible
 * text, every other escape sequence (cursor movement, erase, OSC titles,
 * charset selection) is removed. Style carries from line to line.
 */
export class AnsiParser {
  private style: AnsiStyle = {};

  /**
   * `render` maps the remaining bytes to display text one character per byte.
   * With `commit` false the carried style is left unchanged (for partial lines).
   */
  parse(bytes: Uint8Array, render: (b: Uint8Array) => string, commit = true): { text: string; runs: StyleRun[]; hadEscape: boolean } {
    let style = this.style;
    const keep: number[] = [];
    const runs: StyleRun[] = [];
    let runStart = 0;
    let runStyle = style;
    let hadEscape = false;
    const mark = () => {
      if (keep.length > runStart && !isDefault(runStyle)) runs.push({ from: runStart, to: keep.length, ...runStyle });
      runStart = keep.length;
      runStyle = style;
    };
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]!;
      if (b !== ESC) { keep.push(b); continue; }
      hadEscape = true;
      const next = bytes[i + 1];
      if (next === 0x5b) {
        // CSI: ESC [ params intermediates final(0x40-0x7e)
        let j = i + 2;
        while (j < bytes.length && (bytes[j]! < 0x40 || bytes[j]! > 0x7e)) j++;
        if (j < bytes.length && bytes[j] === 0x6d) {
          const body = String.fromCharCode(...bytes.subarray(i + 2, j));
          const params = body === '' ? [] : body.split(/[;:]/).map((x) => (x === '' ? 0 : Number(x)));
          if (params.every((n) => Number.isFinite(n))) {
            const nextStyle = applySgr(style, params);
            if (!same(nextStyle, style)) { style = nextStyle; mark(); }
          }
        }
        i = Math.min(j, bytes.length);
      } else if (next === 0x5d) {
        // OSC: ends at BEL or ESC \
        let j = i + 2;
        while (j < bytes.length && bytes[j] !== 0x07 && !(bytes[j] === ESC && bytes[j + 1] === 0x5c)) j++;
        i = bytes[j] === ESC ? j + 1 : j;
      } else if (next === 0x28 || next === 0x29) {
        i += 2; // charset designation: ESC ( X
      } else if (next !== undefined) {
        i += 1; // other two-byte escapes
      }
    }
    mark();
    if (commit) this.style = style;
    return { text: render(Uint8Array.from(keep)), runs, hadEscape };
  }

  reset(): void {
    this.style = {};
  }
}

/** RealTerm-style names for control characters; other control bytes and bytes ≥ 0x80 show as hex. */
const NAMES: Record<number, string> = { 0: 'NUL', 7: 'BEL', 8: 'BS', 9: 'TAB', 10: 'LF', 11: 'VT', 12: 'FF', 13: 'CR', 27: 'ESC', 127: 'DEL' };

export interface Expanded {
  text: string;
  /** [from, to) of each token in `text`, for colouring. */
  tokens: [number, number][];
}

function token(b: number): string {
  return `[${NAMES[b] ?? b.toString(16).toUpperCase().padStart(2, '0')}]`;
}

/** Every byte visible: printable ASCII as itself, everything else as a token. */
export function expandBytes(bytes: Uint8Array): Expanded {
  let text = '';
  const tokens: [number, number][] = [];
  for (const b of bytes) {
    if (b >= 0x20 && b < 0x7f) { text += String.fromCharCode(b); continue; }
    const t = token(b);
    tokens.push([text.length, text.length + t.length]);
    text += t;
  }
  return { text, tokens };
}

/**
 * For text whose raw bytes are no longer held: control pictures (U+2400…) become
 * tokens. Bytes ≥ 0x80 were stored as '.', which cannot be told apart from a real dot.
 */
export function expandPictures(s: string): Expanded {
  let text = '';
  const tokens: [number, number][] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const b = c >= 0x2400 && c <= 0x241f ? c - 0x2400 : c === 0x2421 ? 0x7f : -1;
    if (b < 0) { text += ch; continue; }
    const t = token(b);
    tokens.push([text.length, text.length + t.length]);
    text += t;
  }
  return { text, tokens };
}

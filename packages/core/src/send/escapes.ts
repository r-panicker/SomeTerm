/**
 * Parses send-box text into bytes. Supports \r \n \t \0 \\ and \xNN.
 * Non-ASCII characters are encoded as UTF-8; unknown escapes are sent literally.
 * Throws on a malformed \x so a typo is never sent as something else.
 */
export function parseEscapes(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c !== '\\' || i === text.length - 1) {
      const code = text.codePointAt(i)!;
      pushUtf8(out, code);
      if (code > 0xffff) i++;
      continue;
    }
    const n = text[++i]!;
    switch (n) {
      case 'r': out.push(0x0d); break;
      case 'n': out.push(0x0a); break;
      case 't': out.push(0x09); break;
      case '0': out.push(0x00); break;
      case '\\': out.push(0x5c); break;
      case 'x': {
        const hex = text.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new SyntaxError(`\\x needs two hex digits at position ${i - 1}`);
        out.push(parseInt(hex, 16));
        i += 2;
        break;
      }
      default: out.push(0x5c, n.charCodeAt(0));
    }
  }
  return Uint8Array.from(out);
}

/** Parses space/comma separated hex bytes ("0D 0A", "0x41,42"). Throws on anything else. */
export function parseHexBytes(text: string): Uint8Array {
  const tokens = text.trim().split(/[\s,]+/).filter(Boolean);
  return Uint8Array.from(tokens, (t) => {
    const s = t.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{1,2}$/.test(s)) throw new SyntaxError(`"${t}" is not a hex byte`);
    return parseInt(s, 16);
  });
}

function pushUtf8(out: number[], cp: number): void {
  if (cp < 0x80) out.push(cp);
  else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
  else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
}

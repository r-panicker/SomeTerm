/**
 * "Send Numbers": bytes written as numbers, in whatever base is handy, separated
 * by spaces or commas. `65 0x41 $41 41h 0b1000001 'A'` are all the byte 0x41.
 * Plain numbers are decimal. A quoted character stands for its UTF-8 bytes.
 */
export function parseNumbers(input: string): Uint8Array {
  const out: number[] = [];
  const tokens = input.trim() ? input.trim().split(/[\s,;]+/) : [];
  for (const t of tokens) {
    const ch = /^'(.+)'$/u.exec(t);
    if (ch && [...ch[1]!].length === 1) {
      out.push(...new TextEncoder().encode(ch[1]!));
      continue;
    }
    let v: number;
    if (/^0x[0-9a-f]+$/i.test(t)) v = parseInt(t.slice(2), 16);
    else if (/^\$[0-9a-f]+$/i.test(t)) v = parseInt(t.slice(1), 16);
    else if (/^[0-9a-f]+h$/i.test(t)) v = parseInt(t.slice(0, -1), 16);
    else if (/^0b[01]+$/i.test(t)) v = parseInt(t.slice(2), 2);
    else if (/^\d+$/.test(t)) v = parseInt(t, 10);
    else throw new Error(`“${t}” is not a number (try 65, 0x41, $41, 41h, 0b1000001 or 'A')`);
    if (v > 255) throw new Error(`${t} does not fit in a byte (0 to 255)`);
    out.push(v);
  }
  return Uint8Array.from(out);
}

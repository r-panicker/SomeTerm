export interface Sample {
  name: string;
  value: number;
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const LABELLED = /^([A-Za-z_][\w.\-]*)[:=](.+)$/;

/**
 * Arduino-plotter style line parsing. Tokens are separated by commas, tabs,
 * semicolons or spaces; each is a number or `name:number` / `name=number`.
 * Unlabelled values are named by position among unlabelled values ("1", "2", ...).
 * Returns null unless every token is numeric, so prose lines never plot.
 */
export function parseNumericLine(line: string): Sample[] | null {
  const text = line.trim().replace(/\s*([:=])\s*/g, '$1');
  if (!text) return null;
  const out: Sample[] = [];
  let unnamed = 0;
  for (const tok of text.split(/[\s,;]+/)) {
    if (!tok) continue;
    const m = LABELLED.exec(tok);
    const num = m ? m[2]! : tok;
    if (!NUMBER.test(num)) return null;
    out.push({ name: m ? m[1]! : String(++unnamed), value: Number(num) });
  }
  return out.length ? out : null;
}

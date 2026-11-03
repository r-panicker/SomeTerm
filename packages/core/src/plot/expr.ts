export type Fn = (x: number) => number;

const FUNCS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log: Math.log10, log2: Math.log2,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  round: Math.round, floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, pow: Math.pow,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Node = (x: number) => number;

/**
 * Compiles a plot transform such as `x*3.3/4095` or `(x-512)/10.24` into a
 * function of the raw value `x`. Grammar: numbers, `x`, `pi`, `e`, + - * / ^
 * (right-associative), unary minus, parentheses and the functions in FUNCS.
 * Nothing is evaluated as JavaScript. Throws SyntaxError naming the position.
 */
export function compileExpr(src: string): Fn {
  let i = 0;
  const fail = (msg: string): never => {
    throw new SyntaxError(`${msg} at position ${i + 1}`);
  };
  const ws = () => { while (src[i] === ' ' || src[i] === '\t') i++; };
  const peek = () => { ws(); return src[i]; };

  function expr(): Node {
    let left = term();
    for (let c = peek(); c === '+' || c === '-'; c = peek()) {
      i++;
      const l = left, r = term();
      left = c === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return left;
  }
  function term(): Node {
    let left = unary();
    for (let c = peek(); c === '*' || c === '/'; c = peek()) {
      i++;
      const l = left, r = unary();
      left = c === '*' ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
    }
    return left;
  }
  function unary(): Node {
    if (peek() === '-') { i++; const v = unary(); return (x) => -v(x); }
    if (peek() === '+') { i++; return unary(); }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (peek() === '^') {
      i++;
      const exp = unary();
      return (x) => base(x) ** exp(x);
    }
    return base;
  }
  function atom(): Node {
    const c = peek();
    if (c === undefined) return fail('Unexpected end');
    if (c === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') fail('Expected )');
      i++;
      return v;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      const n = Number(num[0]);
      return () => n;
    }
    const id = /^[A-Za-z_]\w*/.exec(src.slice(i));
    if (id) {
      const name = id[0].toLowerCase();
      i += id[0].length;
      if (name === 'x') return (x) => x;
      if (name in CONSTS) { const k = CONSTS[name]!; return () => k; }
      const f = FUNCS[name];
      if (!f) return fail(`Unknown name "${id[0]}"`);
      if (peek() !== '(') fail(`Expected ( after ${id[0]}`);
      i++;
      const args: Node[] = [expr()];
      while (peek() === ',') { i++; args.push(expr()); }
      if (peek() !== ')') fail('Expected )');
      i++;
      return (x) => f(...args.map((a) => a(x)));
    }
    return fail(`Unexpected "${c}"`);
  }

  const root = expr();
  if (peek() !== undefined) fail(`Unexpected "${src[i]}"`);
  return root;
}

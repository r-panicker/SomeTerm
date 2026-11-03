import { describe, expect, it } from 'vitest';
import { compileExpr } from './expr';

const f = (s: string, x = 0) => compileExpr(s)(x);

describe('compileExpr', () => {
  it('typical lab conversions', () => {
    expect(f('x*3.3/4095', 4095)).toBeCloseTo(3.3);
    expect(f('(x - 500) / 10', 750)).toBe(25);
    expect(f('x/1000', 1234)).toBe(1.234);
  });
  it('precedence, unary minus, right-associative power', () => {
    expect(f('1+2*3')).toBe(7);
    expect(f('-x^2', 3)).toBe(-9);
    expect(f('2^3^2')).toBe(512);
    expect(f('2*-x', 4)).toBe(-8);
  });
  it('functions, constants and exponents in numbers', () => {
    expect(f('abs(x)', -2)).toBe(2);
    expect(f('max(x, 0)', -5)).toBe(0);
    expect(f('sin(pi/2)')).toBeCloseTo(1);
    expect(f('1.5e3 + .5')).toBe(1500.5);
    expect(f('20*log(x)', 10)).toBe(20);
  });
  it('case-insensitive names', () => {
    expect(f('X*PI', 1)).toBeCloseTo(Math.PI);
  });
  it('rejects bad input with a position, and never runs JavaScript', () => {
    expect(() => compileExpr('x*')).toThrow('Unexpected end');
    expect(() => compileExpr('foo(x)')).toThrow('Unknown name "foo"');
    expect(() => compileExpr('(x+1')).toThrow('Expected )');
    expect(() => compileExpr('x x')).toThrow('position 3');
    expect(() => compileExpr('alert(1)')).toThrow('Unknown name');
    expect(() => compileExpr('x;1')).toThrow('Unexpected ";"');
    expect(() => compileExpr('')).toThrow();
  });
});

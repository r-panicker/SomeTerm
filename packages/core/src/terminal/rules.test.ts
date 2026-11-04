import { describe, expect, it } from 'vitest';
import { applyRules, compileRules, type ColorRule } from './rules';

let n = 0;
const R = (pattern: string, mode: ColorRule['mode'], color: number, extra: Partial<ColorRule> = {}): ColorRule => ({ id: String(n++), pattern, caseSensitive: false, regex: false, mode, color, ...extra });

describe('applyRules', () => {
  it('line rules: the first matching one tints the line', () => {
    const rules = compileRules([R('warn', 'line', 1), R('error', 'line', 0), R('e', 'line', 5)]);
    expect(applyRules(rules, 'E (12) ERROR: x').line).toBe(0);
    expect(applyRules(rules, 'w: warn and error').line).toBe(1);
    expect(applyRules(rules, 'ok').line).toBeUndefined();
  });

  it('match rules colour each occurrence; earlier rules win where they overlap', () => {
    const rules = compileRules([R('PASS', 'match', 2), R('pass|fail', 'match', 0, { regex: true })]);
    expect(applyRules(rules, 'pass fail PASS').runs).toEqual([
      { from: 0, to: 4, color: 2 },
      { from: 5, to: 9, color: 0 },
      { from: 10, to: 14, color: 2 },
    ]);
  });

  it('partial overlap splits correctly and adjacent same-colour ranges merge', () => {
    const rules = compileRules([R('bcd', 'match', 3), R('abcdef', 'match', 4), R('gh', 'match', 4)]);
    expect(applyRules(rules, 'abcdefgh').runs).toEqual([
      { from: 0, to: 1, color: 4 },
      { from: 1, to: 4, color: 3 },
      { from: 4, to: 8, color: 4 },
    ]);
  });

  it('line and match rules combine; invalid and empty patterns are reported and ignored', () => {
    const compiled = compileRules([R('(', 'line', 0, { regex: true }), R('', 'match', 1), R('x', 'match', 2), R('x', 'line', 3)]);
    expect(compiled[0]!.error).not.toBe('');
    expect(compiled[1]!.match).toBeNull();
    expect(applyRules(compiled, 'axb')).toEqual({ line: 3, runs: [{ from: 1, to: 2, color: 2 }] });
  });

  it('case sensitivity per rule', () => {
    const rules = compileRules([R('Err', 'match', 0, { caseSensitive: true })]);
    expect(applyRules(rules, 'err Err').runs).toEqual([{ from: 4, to: 7, color: 0 }]);
  });
});

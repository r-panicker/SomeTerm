import { describe, expect, it } from 'vitest';
import { nearestIndex, rangeStats } from './stats';

describe('rangeStats', () => {
  it('min, max, mean and population sd over a range, skipping gaps', () => {
    const s = rangeStats([99, 2, null, 4, 4, 4, 5, 5, 7, 9, 99], 1, 10)!;
    expect(s).toMatchObject({ n: 8, min: 2, max: 9, mean: 5 });
    expect(s.sd).toBeCloseTo(2, 12);
  });
  it('applies a transform first', () => {
    expect(rangeStats([0, 4095], 0, 2, (x) => (x * 3.3) / 4095)).toMatchObject({ min: 0, max: 3.3, mean: 1.65 });
  });
  it('stays accurate with a large offset', () => {
    // 1e6 keeps the inputs themselves exact to ~1e-10; a naive E[x²]−E[x]² would still be far off here.
    const v = Array.from({ length: 1000 }, (_, i) => 1e6 + (i % 2 ? 0.001 : -0.001));
    expect(rangeStats(v, 0, v.length)!.sd).toBeCloseTo(0.001, 9);
  });
  it('empty range or all gaps gives null; out-of-bounds range is clamped', () => {
    expect(rangeStats([null, null], 0, 2)).toBeNull();
    expect(rangeStats([1, 2], 5, 9)).toBeNull();
    expect(rangeStats([1, 3], -4, 99)).toMatchObject({ n: 2, mean: 2 });
  });
});

describe('nearestIndex', () => {
  it('finds the closest sample, ties to the earlier one', () => {
    const xs = [0, 1, 2, 4];
    expect([-5, 0.4, 0.5, 2.9, 3.1, 9].map((x) => nearestIndex(xs, x))).toEqual([0, 0, 0, 2, 3, 3]);
    expect(nearestIndex([], 1)).toBe(-1);
  });
});

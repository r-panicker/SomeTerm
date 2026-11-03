import { describe, expect, it } from 'vitest';
import { decimateMinMax } from './decimate';

describe('decimateMinMax', () => {
  it('returns small ranges unchanged with their source rows', () => {
    const r = decimateMinMax([0, 1, 2, 3], [[5, 6, 7, 8]], 1, 3, 10);
    expect(r).toEqual({ data: [[1, 2], [6, 7]], rows: [1, 2] });
  });

  it('keeps a one-sample spike that plain subsampling would drop', () => {
    const times = Array.from({ length: 1000 }, (_, i) => i);
    const col = times.map((i) => (i === 517 ? 999 : 0));
    const r = decimateMinMax(times, [col], 0, 1000, 10);
    expect(r.data[0].length).toBe(20);
    expect(Math.max(...(r.data[1] as number[]))).toBe(999);
    expect(Math.min(...(r.data[1] as number[]))).toBe(0);
  });

  it('applies transforms before min/max, so abs() keeps a negative spike', () => {
    const times = Array.from({ length: 100 }, (_, i) => i);
    const col = times.map((i) => (i === 40 ? -50 : 1));
    const r = decimateMinMax(times, [col], 0, 100, 5, [Math.abs]);
    expect(Math.max(...(r.data[1] as number[]))).toBe(50);
    const small = decimateMinMax([0, 1], [[-2, null]], 0, 2, 10, [(x) => x * 10]);
    expect(small.data[1]).toEqual([-20, null]);
  });

  it('emits min at the bucket start time and max at its end, per series', () => {
    const times = [0, 1, 2, 3, 4, 5, 6, 7];
    const r = decimateMinMax(times, [[3, 1, 4, 1, 5, 9, 2, 6], [null, null, null, null, 1, 2, 3, 4]], 0, 8, 2);
    expect(r.data).toEqual([[0, 3, 4, 7], [1, 4, 2, 9], [null, null, 1, 4]]);
    expect(r.rows).toEqual([0, 3, 4, 7]);
  });
});

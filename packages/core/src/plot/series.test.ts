import { describe, expect, it } from 'vitest';
import { SeriesStore } from './series';

describe('SeriesStore', () => {
  it('aligns series on time, null where a series is absent', () => {
    const s = new SeriesStore();
    s.push(1, 0, [{ name: 'a', value: 10 }]);
    s.push(2, 5, [{ name: 'a', value: 11 }, { name: 'b', value: 20 }]);
    s.push(3, 9, [{ name: 'b', value: 21 }]);
    expect(s.names).toEqual(['a', 'b']);
    expect(s.slice(0)).toEqual([[1, 2, 3], [10, 11, null], [null, 20, 21]]);
    expect(s.offsets).toEqual([0, 5, 9]);
  });
  it('lowerBound finds the window start', () => {
    const s = new SeriesStore();
    for (const t of [1, 2, 4, 8]) s.push(t, t, [{ name: 'a', value: t }]);
    expect([s.lowerBound(0), s.lowerBound(3), s.lowerBound(4), s.lowerBound(9)]).toEqual([0, 2, 2, 4]);
    expect(s.slice(2)).toEqual([[4, 8], [4, 8]]);
  });
  it('trims the oldest rows past capacity and keeps columns aligned', () => {
    const s = new SeriesStore(10);
    for (let i = 0; i < 12; i++) s.push(i, i, [{ name: 'a', value: i * 2 }]);
    expect(s.length).toBe(10);
    expect(s.times[0]).toBe(2);
    expect(s.columns[0]![0]).toBe(4);
    expect(s.offsets[0]).toBe(2);
  });
});

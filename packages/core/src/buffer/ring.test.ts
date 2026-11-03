import { describe, expect, it } from 'vitest';
import { ByteRing } from './ring';

const b = (...n: number[]) => Uint8Array.from(n);

describe('ByteRing', () => {
  it('returns what was pushed, by absolute offset', () => {
    const r = new ByteRing(8);
    r.push(b(1, 2, 3));
    r.push(b(4, 5));
    expect([...r.slice(1, 4)]).toEqual([2, 3, 4]);
    expect([r.start, r.end]).toEqual([0, 5]);
  });

  it('evicts oldest bytes on wrap and keeps offsets absolute', () => {
    const r = new ByteRing(4);
    r.push(b(1, 2, 3));
    r.push(b(4, 5, 6));
    expect([r.start, r.end]).toEqual([2, 6]);
    expect([...r.slice(2)]).toEqual([3, 4, 5, 6]);
    expect(() => r.slice(1, 3)).toThrow(RangeError);
  });

  it('keeps only the tail of an oversized chunk but advances by its full length', () => {
    const r = new ByteRing(3);
    r.push(b(9));
    r.push(b(1, 2, 3, 4, 5));
    expect([r.start, r.end]).toEqual([3, 6]);
    expect([...r.slice(3, 6)]).toEqual([3, 4, 5]);
    expect(() => r.slice(2, 6)).toThrow(RangeError);
  });

  it('rejects ranges past the end and bad capacity', () => {
    const r = new ByteRing(4);
    r.push(b(1));
    expect(() => r.slice(0, 2)).toThrow(RangeError);
    expect(() => new ByteRing(0)).toThrow(RangeError);
  });
});

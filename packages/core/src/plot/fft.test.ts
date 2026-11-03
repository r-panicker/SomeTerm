import { describe, expect, it } from 'vitest';
import { estimateRate, largestPow2, peakFrequency, spectrum } from './fft';

const sine = (n: number, fs: number, f: number, a = 1, dc = 0) => Array.from({ length: n }, (_, i) => dc + a * Math.sin((2 * Math.PI * f * i) / fs));

describe('spectrum', () => {
  it('finds a bin-centred sine at its frequency with the right amplitude', () => {
    const s = spectrum(sine(1024, 1000, (100 * 1000) / 1024, 2), 1000);
    expect(peakFrequency(s)).toBeCloseTo((100 * 1000) / 1024, 6);
    expect(Math.max(...s.db)).toBeCloseTo(20 * Math.log10(2), 1);
    expect(s.freqs.length).toBe(513);
    expect(s.freqs[512]).toBe(500);
  });

  it('an off-bin 50 Hz tone peaks within one bin of 50 Hz', () => {
    const fs = 200, n = 256;
    const s = spectrum(sine(n, fs, 50.3, 1, 3), fs);
    expect(Math.abs(peakFrequency(s) - 50.3)).toBeLessThan(fs / n);
  });

  it('removes the mean by default so DC does not dominate', () => {
    const s = spectrum(sine(256, 100, 10, 0.1, 500), 100);
    expect(peakFrequency(s)).toBeCloseTo(10, 0);
    // A tone that is not a whole number of cycles leaks a little into bin 0 through the window's sidelobes.
    expect(s.db[0]!).toBeLessThan(Math.max(...s.db) - 30);
    const keep = spectrum(sine(256, 100, 10, 0.1, 500), 100, { removeMean: false });
    expect(keep.db[0]!).toBeCloseTo(20 * Math.log10(500), 1);
  });

  it('two tones are both resolved', () => {
    const x = sine(2048, 1000, 60).map((v, i) => v + sine(2048, 1000, 180, 0.5)[i]!);
    const s = spectrum(x, 1000);
    const at = (f: number) => s.db[Math.round((f * 2048) / 1000)]!;
    expect(at(60)).toBeGreaterThan(at(120) + 40);
    expect(at(180)).toBeGreaterThan(at(120) + 40);
    // Both tones sit between bins; Hann scalloping can differ by up to ~1.4 dB between them.
    expect(Math.abs(at(60) - at(180) - 20 * Math.log10(2))).toBeLessThan(1.5);
  });

  it('rejects lengths that are not powers of two', () => {
    expect(() => spectrum([1, 2, 3], 1)).toThrow(RangeError);
  });
});

describe('helpers', () => {
  it('largestPow2', () => {
    expect([0, 1, 2, 3, 1000, 1024, 20000].map(largestPow2)).toEqual([0, 1, 2, 2, 512, 1024, 16384]);
  });
  it('estimateRate uses the overall span, so batched timestamps still give the mean rate', () => {
    expect(estimateRate([0, 0, 0, 0.1, 0.1, 0.1, 0.2, 0.2, 0.2, 0.3])).toBeCloseTo(30, 6);
    expect(estimateRate([1])).toBe(0);
    expect(estimateRate([2, 2])).toBe(0);
  });
});

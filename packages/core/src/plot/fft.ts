/** Largest power of two not above n (0 when n < 1). */
export function largestPow2(n: number): number {
  return n < 1 ? 0 : 2 ** Math.floor(Math.log2(n));
}

/**
 * Average sample rate over a run of timestamps (seconds). Lines arrive in
 * batches that share a timestamp, so per-sample intervals are useless; the
 * span over the whole run is not.
 */
export function estimateRate(times: readonly number[]): number {
  const n = times.length;
  if (n < 2) return 0;
  const span = times[n - 1]! - times[0]!;
  return span > 0 ? (n - 1) / span : 0;
}

/** In-place iterative radix-2 FFT; length must be a power of two. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr; im[b] = im[a]! - ti;
        re[a] = re[a]! + tr; im[a] = im[a]! + ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export interface Spectrum {
  freqs: number[];
  /** Single-sided amplitude in dB re 1 unit: a sine of amplitude A peaks near 20·log10(A). */
  db: number[];
}

/**
 * Amplitude spectrum of real samples (length a power of two) at sample rate fs.
 * Hann-windowed and amplitude-corrected for the window, with the mean removed
 * by default so DC does not dominate the scale.
 */
export function spectrum(samples: readonly number[], fs: number, opts: { removeMean?: boolean } = {}): Spectrum {
  const n = samples.length;
  if (n < 2 || (n & (n - 1)) !== 0) throw new RangeError('sample count must be a power of two ≥ 2');
  const mean = opts.removeMean === false ? 0 : samples.reduce((a, b) => a + b, 0) / n;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let wsum = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    wsum += w;
    re[i] = (samples[i]! - mean) * w;
  }
  fft(re, im);
  const half = n / 2;
  const freqs: number[] = [];
  const db: number[] = [];
  for (let k = 0; k <= half; k++) {
    const mag = Math.hypot(re[k]!, im[k]!) / wsum;
    const amp = k === 0 || k === half ? mag : 2 * mag;
    freqs.push((k * fs) / n);
    db.push(20 * Math.log10(Math.max(amp, 1e-12)));
  }
  return { freqs, db };
}

/** Frequency of the strongest bin above DC. */
export function peakFrequency(s: Spectrum): number {
  let best = 1;
  for (let k = 2; k < s.db.length; k++) if (s.db[k]! > s.db[best]!) best = k;
  return s.freqs[best] ?? 0;
}

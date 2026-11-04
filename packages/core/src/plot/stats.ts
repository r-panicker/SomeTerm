export interface Stats {
  n: number;
  min: number;
  max: number;
  mean: number;
  /** Population standard deviation. */
  sd: number;
}

/**
 * Statistics of values[from, to), skipping gaps, after an optional transform.
 * Welford's update keeps the deviation accurate for large offsets (e.g. 3.3 V ± 1 mV).
 * Returns null when the range holds no values.
 */
export function rangeStats(values: readonly (number | null)[], from: number, to: number, fn?: ((x: number) => number) | null): Stats | null {
  let n = 0, mean = 0, m2 = 0, min = Infinity, max = -Infinity;
  for (let i = Math.max(0, from); i < Math.min(to, values.length); i++) {
    const raw = values[i];
    if (raw == null) continue;
    const v = fn ? fn(raw) : raw;
    if (!Number.isFinite(v)) continue;
    n++;
    const d = v - mean;
    mean += d / n;
    m2 += d * (v - mean);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return n ? { n, min, max, mean, sd: Math.sqrt(m2 / n) } : null;
}

/** Index of the entry in sorted `xs` nearest to x (-1 when empty). */
export function nearestIndex(xs: readonly number[], x: number): number {
  if (!xs.length) return -1;
  let lo = 0, hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && Math.abs(xs[lo - 1]! - x) <= Math.abs(xs[lo]! - x) ? lo - 1 : lo;
}

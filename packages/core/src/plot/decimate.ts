export interface Decimated {
  data: [number[], ...(number | null)[][]];
  /** Source row index for each output point, for mapping a click back to raw data. */
  rows: number[];
}

/**
 * Reduces rows [from, to) to at most 2 points per bucket: the bucket's first time
 * carries each series' minimum, its last time the maximum. Spikes and the visible
 * envelope survive; drawing cost becomes proportional to pixels, not samples.
 * Ranges already within budget are returned as-is.
 */
export function decimateMinMax(
  times: number[],
  columns: (number | null)[][],
  from: number,
  to: number,
  buckets: number,
): Decimated {
  const n = to - from;
  if (n <= buckets * 2) {
    const rows = Array.from({ length: n }, (_, i) => from + i);
    return { data: [times.slice(from, to), ...columns.map((c) => c.slice(from, to))], rows };
  }
  const t: number[] = [];
  const rows: number[] = [];
  const out = columns.map(() => [] as (number | null)[]);
  for (let b = 0; b < buckets; b++) {
    const lo = from + Math.floor((b * n) / buckets);
    const hi = from + Math.floor(((b + 1) * n) / buckets);
    if (hi <= lo) continue;
    t.push(times[lo]!, times[hi - 1]!);
    rows.push(lo, hi - 1);
    columns.forEach((c, k) => {
      let mn = Infinity;
      let mx = -Infinity;
      for (let i = lo; i < hi; i++) {
        const v = c[i];
        if (v == null) continue;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      const empty = mn === Infinity;
      out[k]!.push(empty ? null : mn, empty ? null : mx);
    });
  }
  return { data: [t, ...out], rows };
}

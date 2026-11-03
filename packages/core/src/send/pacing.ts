export interface PaceOptions {
  /** Delay after every byte; forces byte-at-a-time writes. */
  byteDelayMs?: number;
  /** Delay after every LF (or CR not followed by LF). */
  lineDelayMs?: number;
}

export interface CancelToken {
  cancelled: boolean;
}

/** Splits `data` into the writes and pauses that `opts` imply. */
export function planWrites(data: Uint8Array, opts: PaceOptions, chunk = 4096): { bytes: Uint8Array; delayAfter: number }[] {
  const byteDelay = opts.byteDelayMs ?? 0;
  const lineDelay = opts.lineDelayMs ?? 0;
  const out: { bytes: Uint8Array; delayAfter: number }[] = [];
  if (byteDelay > 0) {
    for (let i = 0; i < data.length; i++) {
      out.push({ bytes: data.subarray(i, i + 1), delayAfter: byteDelay + (lineDelay && endsLine(data, i) ? lineDelay : 0) });
    }
    return out;
  }
  let start = 0;
  for (let i = 0; i < data.length; i++) {
    const lineEnd = lineDelay > 0 && endsLine(data, i);
    if (lineEnd || i + 1 - start >= chunk) {
      out.push({ bytes: data.subarray(start, i + 1), delayAfter: lineEnd ? lineDelay : 0 });
      start = i + 1;
    }
  }
  if (start < data.length) out.push({ bytes: data.subarray(start), delayAfter: 0 });
  return out;
}

function endsLine(d: Uint8Array, i: number): boolean {
  return d[i] === 0x0a || (d[i] === 0x0d && d[i + 1] !== 0x0a);
}

/**
 * Writes `data` paced per `opts`. Resolves with bytes written; stops early,
 * between writes, when `token.cancelled` is set.
 */
export async function sendPaced(
  data: Uint8Array,
  opts: PaceOptions,
  write: (b: Uint8Array) => Promise<void>,
  sleep: (ms: number) => Promise<void>,
  token: CancelToken = { cancelled: false },
  onProgress: (sent: number) => void = () => {},
): Promise<number> {
  let sent = 0;
  const plan = planWrites(data, opts);
  for (let i = 0; i < plan.length; i++) {
    if (token.cancelled) break;
    const { bytes, delayAfter } = plan[i]!;
    await write(bytes);
    sent += bytes.length;
    onProgress(sent);
    if (delayAfter > 0 && i < plan.length - 1) await sleep(delayAfter);
  }
  return sent;
}

/**
 * Sends `data` `count` times (0 = until cancelled), waiting `intervalMs` between
 * starts of consecutive sends. Resolves with the number of completed sends.
 */
export async function repeatSend(
  count: number,
  intervalMs: number,
  once: () => Promise<void>,
  sleep: (ms: number) => Promise<void>,
  now: () => number,
  token: CancelToken,
  onCount: (n: number) => void = () => {},
): Promise<number> {
  let n = 0;
  while (!token.cancelled && (count === 0 || n < count)) {
    const started = now();
    await once();
    onCount(++n);
    if (count !== 0 && n >= count) break;
    const wait = intervalMs - (now() - started);
    if (wait > 0) await sleep(wait);
  }
  return n;
}

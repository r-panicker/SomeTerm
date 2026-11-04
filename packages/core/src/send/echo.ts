import type { CancelToken, PaceOptions } from './pacing';

export type SetTimer = (fn: () => void, ms: number) => () => void;

/**
 * Matches received bytes against bytes sent one at a time. Every received byte
 * is consumed in order, so a device that echoes and then replies cannot have
 * its reply mistaken for a later echo.
 */
export class EchoMatcher {
  private pending: { byte: number; resolve: () => void; reject: (e: Error) => void; cancel: () => void } | null = null;
  private queue: number[] = [];

  constructor(private readonly setTimer: SetTimer) {}

  /** Resolves when `byte` comes back; rejects on a different byte or after `timeoutMs`. */
  expect(byte: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const cancel = this.setTimer(() => {
        this.pending = null;
        reject(new Error(`No echo for ${describe(byte)} within ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending = { byte, resolve, reject, cancel };
      this.drain();
    });
  }

  feed(chunk: Uint8Array): void {
    if (!this.pending) return; // only bytes after a send can be its echo
    for (const b of chunk) this.queue.push(b);
    this.drain();
  }

  /** Forget everything; used when a send ends. */
  reset(): void {
    this.pending?.cancel();
    this.pending = null;
    this.queue = [];
  }

  private drain(): void {
    const p = this.pending;
    if (!p || !this.queue.length) return;
    const got = this.queue.shift()!;
    this.pending = null;
    p.cancel();
    if (got === p.byte) p.resolve();
    else p.reject(new Error(`Echo mismatch: sent ${describe(p.byte)}, got ${describe(got)}`));
  }
}

function describe(b: number): string {
  const hex = `0x${b.toString(16).toUpperCase().padStart(2, '0')}`;
  return b >= 0x20 && b < 0x7f ? `${hex} '${String.fromCharCode(b)}'` : hex;
}

/**
 * Sends byte by byte, waiting for each byte's echo before the next. Pacing
 * delays still apply after each echo. Resolves with bytes sent; a missing or
 * wrong echo rejects with the reason.
 */
export async function sendWithEcho(
  data: Uint8Array,
  opts: PaceOptions & { echoTimeoutMs: number },
  write: (b: Uint8Array) => Promise<void>,
  matcher: EchoMatcher,
  sleep: (ms: number) => Promise<void>,
  token: CancelToken = { cancelled: false },
  onProgress: (sent: number) => void = () => {},
): Promise<number> {
  let sent = 0;
  try {
    for (let i = 0; i < data.length && !token.cancelled; i++) {
      const byte = data[i]!;
      const echoed = matcher.expect(byte, opts.echoTimeoutMs);
      await write(data.subarray(i, i + 1));
      await echoed;
      sent++;
      onProgress(sent);
      const lineEnd = byte === 0x0a || (byte === 0x0d && data[i + 1] !== 0x0a);
      const delay = (opts.byteDelayMs ?? 0) + (lineEnd ? (opts.lineDelayMs ?? 0) : 0);
      if (delay > 0 && i < data.length - 1) await sleep(delay);
    }
  } finally {
    matcher.reset();
  }
  return sent;
}

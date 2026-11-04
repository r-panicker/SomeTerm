/**
 * XMODEM, XMODEM-1K and YMODEM (batch of one file) sending, for bootloaders
 * and U-Boot `loadx`/`loady`. The receiver drives the transfer: it asks with
 * NAK (8-bit checksum) or 'C' (CRC-16), then ACKs or NAKs each block.
 */

export type XmodemMode = 'xmodem' | 'xmodem1k' | 'ymodem';

export const XMODEM_MODES: { mode: XmodemMode; label: string }[] = [
  { mode: 'xmodem', label: 'XMODEM' },
  { mode: 'xmodem1k', label: 'XMODEM-1K' },
  { mode: 'ymodem', label: 'YMODEM' },
];

const SOH = 0x01;
const STX = 0x02;
const EOT = 0x04;
const ACK = 0x06;
const NAK = 0x15;
const CAN = 0x18;
const C = 0x43;
const SUB = 0x1a;

export interface XmodemIo {
  write(bytes: Uint8Array): Promise<void>;
  /** Next byte from the receiver, or null if none arrives within `timeoutMs`. */
  read(timeoutMs: number): Promise<number | null>;
  /** Drops anything received but not yet read. */
  flush(): void;
  cancelled(): boolean;
}

export interface XmodemTimeouts {
  /** How long to wait for the receiver to start (it is often started by hand). */
  startMs: number;
  /** How long to wait for the answer to each block. */
  blockMs: number;
  retries: number;
}

const DEFAULTS: XmodemTimeouts = { startMs: 60_000, blockMs: 10_000, retries: 10 };

/** CRC-16/XMODEM: polynomial 0x1021, initial value 0. */
export function crc16Xmodem(data: Uint8Array): number {
  let crc = 0;
  for (const b of data) {
    crc ^= b << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** One framed block: header, number, its complement, data padded to `size`, then CRC or sum. */
export function xmodemBlock(n: number, data: Uint8Array, size: 128 | 1024, crc: boolean, pad = SUB): Uint8Array {
  const body = new Uint8Array(size).fill(pad);
  body.set(data.subarray(0, size));
  const out = new Uint8Array(3 + size + (crc ? 2 : 1));
  out[0] = size === 1024 ? STX : SOH;
  out[1] = n & 0xff;
  out[2] = 0xff - (n & 0xff);
  out.set(body, 3);
  if (crc) {
    const c = crc16Xmodem(body);
    out[3 + size] = c >> 8;
    out[4 + size] = c & 0xff;
  } else {
    let sum = 0;
    for (const b of body) sum = (sum + b) & 0xff;
    out[3 + size] = sum;
  }
  return out;
}

export class XmodemError extends Error {}

/**
 * Sends one file. Resolves when the receiver has acknowledged the end of the
 * transfer; throws `XmodemError` when the receiver cancels, stops answering,
 * or the user cancels (the receiver is then told with CAN).
 */
export async function xmodemSend(
  data: Uint8Array,
  name: string,
  mode: XmodemMode,
  io: XmodemIo,
  onProgress: (sent: number) => void = () => {},
  timeouts: Partial<XmodemTimeouts> = {},
): Promise<void> {
  const t = { ...DEFAULTS, ...timeouts };
  let lastCan = false;

  const abort = async (why: string): Promise<never> => {
    await io.write(new Uint8Array(8).fill(CAN));
    throw new XmodemError(why);
  };

  /** Waits for the receiver's start request; true for CRC mode. */
  const awaitStart = async (ms: number): Promise<boolean> => {
    const until = Date.now() + ms;
    for (;;) {
      if (io.cancelled()) return abort('Cancelled');
      const left = until - Date.now();
      if (left <= 0) throw new XmodemError('The receiver did not start; is it waiting for an upload?');
      const b = await io.read(Math.min(left, 250));
      if (b === C) return true;
      if (b === NAK && mode !== 'ymodem') return false;
      if (b === CAN) {
        if (lastCan) throw new XmodemError('The receiver cancelled');
        lastCan = true;
      } else if (b !== null) lastCan = false;
    }
  };

  /** Sends a frame until ACKed. */
  const sendFrame = async (frame: Uint8Array, what: string): Promise<void> => {
    for (let attempt = 0; attempt <= t.retries; attempt++) {
      if (io.cancelled()) return abort('Cancelled');
      io.flush();
      await io.write(frame);
      const until = Date.now() + t.blockMs;
      for (;;) {
        const left = until - Date.now();
        const b = left > 0 ? await io.read(Math.min(left, 250)) : null;
        if (io.cancelled()) return abort('Cancelled');
        if (b === ACK) return;
        if (b === CAN) {
          if (lastCan) throw new XmodemError('The receiver cancelled');
          lastCan = true;
          continue;
        }
        lastCan = false;
        // NAK, a repeated start request, or silence: send it again.
        if (b === NAK || b === C || (b === null && Date.now() >= until)) break;
      }
    }
    return abort(`No acknowledgement for ${what} after ${t.retries} retries`);
  };

  let crc = await awaitStart(t.startMs);

  if (mode === 'ymodem') {
    const header = new TextEncoder().encode(`${name}\0${data.length}`);
    await sendFrame(xmodemBlock(0, header, header.length + 1 > 128 ? 1024 : 128, true, 0), 'the file header');
    // After the header the receiver asks again before the data.
    crc = await awaitStart(t.blockMs);
  }

  // 1K blocks need CRC; a receiver that asked for checksums gets 128-byte blocks.
  const big = mode !== 'xmodem' && crc;
  let n = 1;
  for (let at = 0; at < data.length; n++) {
    const size = big && data.length - at > 128 ? 1024 : 128;
    await sendFrame(xmodemBlock(n, data.subarray(at, at + size), size, crc), `block ${n}`);
    at += Math.min(size, data.length - at);
    onProgress(at);
  }

  // End of file: some receivers NAK the first EOT to be sure.
  await sendFrame(Uint8Array.of(EOT), 'end of file');

  if (mode === 'ymodem') {
    await awaitStart(t.blockMs);
    await sendFrame(xmodemBlock(0, new Uint8Array(0), 128, true, 0), 'the end-of-batch block');
  }
}

/** Collects received bytes for `XmodemIo.read`, with a timeout per read. */
export class ByteQueue {
  private bytes: number[] = [];
  private waiter: ((b: number | null) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  push(chunk: Uint8Array): void {
    for (const b of chunk) this.bytes.push(b);
    if (this.waiter && this.bytes.length) this.resolve(this.bytes.shift()!);
  }

  read(timeoutMs: number): Promise<number | null> {
    if (this.bytes.length) return Promise.resolve(this.bytes.shift()!);
    return new Promise((r) => {
      this.waiter = r;
      this.timer = setTimeout(() => this.resolve(null), timeoutMs);
    });
  }

  flush(): void {
    this.bytes = [];
  }

  private resolve(b: number | null): void {
    clearTimeout(this.timer);
    const w = this.waiter;
    this.waiter = null;
    w?.(b);
  }
}

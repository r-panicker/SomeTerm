import type { InputSignals, OutputSignals, SerialOptions, SerialTransport, TransportCapabilities, TransportState, Unsubscribe } from '../transport';
import { decodeSignals, type Recording, type SignalState } from '../capture/recording';
import { FULL_CAPABILITIES } from './loopback';

const NO_SIGNALS: SignalState = { cts: false, dsr: false, dcd: false, ri: false, dtr: false, rts: false };

/**
 * Plays a recording through the transport interface, so every view works on it
 * unchanged. Playback is driven from outside by `advanceTo`, which keeps it
 * deterministic: the caller decides how fast recorded time passes.
 */
export class ReplayTransport implements SerialTransport {
  readonly capabilities: TransportCapabilities = FULL_CAPABILITIES;
  /** Recorded time (ms) up to which records have been delivered. */
  position = 0;
  private current: TransportState = 'closed';
  private index = 0;
  private origin = 0;
  private signals: SignalState = NO_SIGNALS;
  private data = new Set<(chunk: Uint8Array, timestamp: number) => void>();
  private txs = new Set<(chunk: Uint8Array, timestamp: number) => void>();
  private outs = new Set<(s: SignalState) => void>();
  private errors = new Set<(e: Error) => void>();
  private closes = new Set<() => void>();

  constructor(readonly recording: Recording, private readonly clock: () => number) {}

  get state(): TransportState { return this.current; }
  get duration(): number { return this.recording.duration; }
  get ended(): boolean { return this.index >= this.recording.records.length; }
  /** Clock value that recorded time 0 maps to. */
  get timeOrigin(): number { return this.origin; }

  async open(_o: SerialOptions): Promise<void> {
    this.current = 'open';
    this.origin = this.clock();
    this.rewind();
  }

  async close(): Promise<void> {
    if (this.current === 'closed') return;
    this.current = 'closed';
    this.closes.forEach((l) => l());
  }

  async write(): Promise<void> { throw new Error('A recording cannot be sent to'); }
  async setSignals(_s: OutputSignals): Promise<void> {}
  async sendBreak(): Promise<void> {}

  async getSignals(): Promise<InputSignals> {
    const { cts, dsr, dcd, ri } = this.signals;
    return { cts, dsr, dcd, ri };
  }

  rewind(): void {
    this.index = 0;
    this.position = 0;
    this.signals = NO_SIGNALS;
    this.outs.forEach((l) => l(this.signals));
  }

  /**
   * Delivers every record up to recorded time `t`, stopping early once
   * `budget` data bytes have gone out so a fast-forward can be spread over frames.
   * Returns true when everything up to `t` has been delivered.
   */
  advanceTo(t: number, budget = Infinity): boolean {
    const recs = this.recording.records;
    let sent = 0;
    while (this.index < recs.length && recs[this.index]!.t <= t) {
      const r = recs[this.index++]!;
      const at = this.origin + r.t;
      if (r.kind === 'rx') this.data.forEach((l) => l(r.data, at));
      else if (r.kind === 'tx') this.txs.forEach((l) => l(r.data, at));
      else {
        this.signals = decodeSignals(r.data);
        this.outs.forEach((l) => l(this.signals));
      }
      this.position = r.t;
      sent += r.data.length;
      if (sent >= budget && this.index < recs.length && recs[this.index]!.t <= t) return false;
    }
    this.position = Math.min(t, this.recording.duration);
    return true;
  }

  onData(l: (chunk: Uint8Array, timestamp: number) => void): Unsubscribe { this.data.add(l); return () => this.data.delete(l); }
  /** Recorded sends, for showing them as echo lines. */
  onTx(l: (chunk: Uint8Array, timestamp: number) => void): Unsubscribe { this.txs.add(l); return () => this.txs.delete(l); }
  /** Recorded line states, including the DTR/RTS outputs. */
  onSignals(l: (s: SignalState) => void): Unsubscribe { this.outs.add(l); return () => this.outs.delete(l); }
  onError(l: (e: Error) => void): Unsubscribe { this.errors.add(l); return () => this.errors.delete(l); }
  onClose(l: () => void): Unsubscribe { this.closes.add(l); return () => this.closes.delete(l); }
}

import type {
  InputSignals,
  OutputSignals,
  SerialOptions,
  SerialTransport,
  TransportCapabilities,
  TransportState,
  Unsubscribe,
} from '../transport';
import { unsupportedOptions } from '../transport';

export const FULL_CAPABILITIES: TransportCapabilities = {
  markSpaceParity: true,
  dsrDtrFlow: true,
  xonXoffFlow: true,
  oneAndHalfStopBits: true,
  fiveSixDataBits: true,
  portMetadata: true,
  sendBreak: true,
  lineSignals: true,
  ringIndicator: true,
};

type Listeners<T extends unknown[]> = Set<(...args: T) => void>;

/**
 * Echoes every written byte back as received data, and wires RTS to CTS and
 * DTR to DSR like a loopback plug. Delivery is asynchronous, as on real hardware.
 */
export class LoopbackTransport implements SerialTransport {
  readonly capabilities: TransportCapabilities;
  private current: TransportState = 'closed';
  private signals: InputSignals = { cts: false, dsr: false, dcd: false, ri: false };
  private data: Listeners<[Uint8Array, number]> = new Set();
  private errors: Listeners<[Error]> = new Set();
  private closes: Listeners<[]> = new Set();

  constructor(
    capabilities: Partial<TransportCapabilities> = {},
    private readonly clock: () => number = () => Date.now(),
  ) {
    this.capabilities = { ...FULL_CAPABILITIES, ...capabilities };
  }

  get state(): TransportState {
    return this.current;
  }

  async open(options: SerialOptions): Promise<void> {
    if (this.current === 'open') throw new Error('Port is already open');
    const problems = unsupportedOptions(this.capabilities, options);
    if (problems.length) throw new Error(problems.join('; '));
    this.current = 'open';
  }

  async close(): Promise<void> {
    if (this.current === 'closed') return;
    this.current = 'closed';
    this.signals = { cts: false, dsr: false, dcd: false, ri: false };
    this.closes.forEach((l) => l());
  }

  async write(data: Uint8Array): Promise<void> {
    this.requireOpen();
    const copy = data.slice();
    void Promise.resolve().then(() => {
      if (this.current !== 'open') return;
      const t = this.clock();
      this.data.forEach((l) => l(copy, t));
    });
  }

  async setSignals(s: OutputSignals): Promise<void> {
    this.requireOpen();
    if (s.rts !== undefined) this.signals = { ...this.signals, cts: s.rts };
    if (s.dtr !== undefined) this.signals = { ...this.signals, dsr: s.dtr };
  }

  async getSignals(): Promise<InputSignals> {
    this.requireOpen();
    return { ...this.signals };
  }

  async sendBreak(): Promise<void> {
    this.requireOpen();
    if (!this.capabilities.sendBreak) throw new Error('Break is not available on this transport');
  }

  onData(l: (chunk: Uint8Array, timestamp: number) => void): Unsubscribe {
    this.data.add(l);
    return () => this.data.delete(l);
  }

  onError(l: (error: Error) => void): Unsubscribe {
    this.errors.add(l);
    return () => this.errors.delete(l);
  }

  onClose(l: () => void): Unsubscribe {
    this.closes.add(l);
    return () => this.closes.delete(l);
  }

  private requireOpen(): void {
    if (this.current !== 'open') throw new Error('Port is not open');
  }
}

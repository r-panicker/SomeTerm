import type {
  InputSignals,
  OutputSignals,
  SerialOptions,
  SerialTransport,
  TransportCapabilities,
  TransportState,
  Unsubscribe,
} from '@superserial/core';
import { unsupportedOptions } from '@superserial/core';

export const WEB_SERIAL_CAPABILITIES: TransportCapabilities = {
  markSpaceParity: false,
  dsrDtrFlow: false,
  xonXoffFlow: false,
  oneAndHalfStopBits: false,
  fiveSixDataBits: false,
  portMetadata: false,
  sendBreak: true,
  lineSignals: true,
};

export function isWebSerialAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/** Ports the user has already granted to this origin; no prompt needed. */
export async function grantedWebSerialPorts(): Promise<SerialPort[]> {
  return isWebSerialAvailable() ? navigator.serial.getPorts() : [];
}

const USB_VENDORS: Record<number, string> = {
  0x2341: 'Arduino', 0x2a03: 'Arduino', 0x0403: 'FTDI', 0x10c4: 'Silicon Labs', 0x1a86: 'CH34x',
  0x303a: 'Espressif', 0x0483: 'STMicro', 0x2e8a: 'Raspberry Pi', 0x04d8: 'Microchip',
  0x239a: 'Adafruit', 0x1366: 'SEGGER', 0x0d28: 'DAPLink', 0x067b: 'Prolific',
};

/** Short human label for a port; Web Serial exposes only USB IDs, not names. */
export function describePort(port: SerialPort): string {
  const { usbVendorId: v, usbProductId: p } = port.getInfo();
  if (v === undefined) return 'Serial port';
  const hex = (n: number) => n.toString(16).padStart(4, '0').toUpperCase();
  const id = p === undefined ? hex(v) : `${hex(v)}:${hex(p)}`;
  return USB_VENDORS[v] ? `${USB_VENDORS[v]} ${id}` : `USB ${id}`;
}

/** The port picker needs a user gesture, so call this from a click handler. */
export async function requestWebSerialPort(filters?: SerialPortFilter[]): Promise<WebSerialTransport> {
  const port = await navigator.serial.requestPort(filters ? { filters } : {});
  return new WebSerialTransport(port);
}

export class WebSerialTransport implements SerialTransport {
  readonly capabilities = WEB_SERIAL_CAPABILITIES;
  private current: TransportState = 'closed';
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readLoop: Promise<void> | null = null;
  private closing = false;
  private data = new Set<(chunk: Uint8Array, timestamp: number) => void>();
  private errors = new Set<(error: Error) => void>();
  private closes = new Set<() => void>();

  constructor(
    readonly port: SerialPort,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  get state(): TransportState {
    return this.current;
  }

  /** USB vendor/product IDs when the port is USB; there is no friendly name in Web Serial. */
  get info(): SerialPortInfo {
    return this.port.getInfo();
  }

  async open(o: SerialOptions): Promise<void> {
    if (this.current === 'open') throw new Error('Port is already open');
    const problems = unsupportedOptions(this.capabilities, o);
    if (problems.length) throw new Error(problems.join('; '));
    await this.port.open({
      baudRate: o.baudRate,
      dataBits: o.dataBits as 7 | 8,
      stopBits: o.stopBits as 1 | 2,
      parity: o.parity as ParityType,
      flowControl: o.flowControl === 'rtscts' ? 'hardware' : 'none',
    });
    this.current = 'open';
    this.closing = false;
    this.writer = this.port.writable!.getWriter();
    this.readLoop = this.runReadLoop();
  }

  async close(): Promise<void> {
    if (this.current === 'closed') return;
    this.closing = true;
    await this.reader?.cancel().catch(() => {});
    await this.readLoop;
    await this.shutdown();
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.current !== 'open' || !this.writer) throw new Error('Port is not open');
    await this.writer.write(data.slice());
  }

  async setSignals(s: OutputSignals): Promise<void> {
    this.requireOpen();
    const out: SerialOutputSignals = {};
    if (s.dtr !== undefined) out.dataTerminalReady = s.dtr;
    if (s.rts !== undefined) out.requestToSend = s.rts;
    await this.port.setSignals(out);
  }

  async getSignals(): Promise<InputSignals> {
    this.requireOpen();
    const s = await this.port.getSignals();
    return { cts: s.clearToSend, dsr: s.dataSetReady, dcd: s.dataCarrierDetect, ri: s.ringIndicator };
  }

  async sendBreak(durationMs: number): Promise<void> {
    this.requireOpen();
    await this.port.setSignals({ break: true });
    try {
      await new Promise((r) => setTimeout(r, durationMs));
    } finally {
      if (this.current === 'open') await this.port.setSignals({ break: false });
    }
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

  /**
   * Framing, parity, overrun and break errors make Web Serial error the current
   * readable but replace it with a fresh one, so the loop reports and continues.
   * A null readable means the device is gone and the port is torn down.
   */
  private async runReadLoop(): Promise<void> {
    while (!this.closing && this.port.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value && value.length) {
            const t = this.clock();
            this.data.forEach((l) => l(value, t));
          }
        }
      } catch (e) {
        if (!this.closing) this.emitError(e);
      } finally {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
    if (!this.closing) await this.shutdown();
  }

  private async shutdown(): Promise<void> {
    if (this.current === 'closed') return;
    this.current = 'closed';
    try {
      this.writer?.releaseLock();
    } catch {
      /* writer already released */
    }
    this.writer = null;
    await this.port.close().catch((e) => this.emitError(e));
    this.closes.forEach((l) => l());
  }

  private emitError(e: unknown): void {
    const err = e instanceof Error ? e : new Error(String(e));
    this.errors.forEach((l) => l(err));
  }

  private requireOpen(): void {
    if (this.current !== 'open') throw new Error('Port is not open');
  }
}

import { SerialPort } from 'serialport';
import type { SerialPortStream } from '@serialport/stream';
import type {
  InputSignals,
  OutputSignals,
  SerialOptions,
  SerialTransport,
  TransportCapabilities,
  TransportState,
  Unsubscribe,
} from '@someterm/core';
import { unsupportedOptions } from '@someterm/core';
import { nodeCapabilities } from './capabilities';

export { nodeCapabilities };

export interface NativePortInfo {
  path: string;
  label: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

type PortInfo = Awaited<ReturnType<typeof SerialPort.list>>[number];

export async function listNodePorts(): Promise<NativePortInfo[]> {
  return (await SerialPort.list()).map(describe);
}

function describe(p: PortInfo): NativePortInfo {
  const ids = p.vendorId && p.productId ? ` (${p.vendorId.toUpperCase()}:${p.productId.toUpperCase()})` : '';
  return {
    path: p.path,
    label: p.manufacturer ? `${p.path} · ${p.manufacturer}${ids}` : `${p.path}${ids}`,
    manufacturer: p.manufacturer,
    serialNumber: p.serialNumber,
    vendorId: p.vendorId,
    productId: p.productId,
  };
}

export type PortFactory = (path: string, o: SerialOptions) => SerialPortStream;

const realPort: PortFactory = (path, o) =>
  new SerialPort({
    path,
    autoOpen: false,
    baudRate: o.baudRate,
    dataBits: o.dataBits,
    stopBits: o.stopBits,
    parity: o.parity,
    rtscts: o.flowControl === 'rtscts',
    xon: o.flowControl === 'xonxoff',
    xoff: o.flowControl === 'xonxoff',
  });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class NodeSerialTransport implements SerialTransport {
  readonly capabilities: TransportCapabilities;
  private port: SerialPortStream | null = null;
  private current: TransportState = 'closed';
  // The binding's set() resets every unspecified line to its default, so the
  // full output state is tracked here and sent on every change.
  private out = { dtr: true, rts: true, brk: false };
  private data = new Set<(chunk: Uint8Array, timestamp: number) => void>();
  private errors = new Set<(error: Error) => void>();
  private closes = new Set<() => void>();

  constructor(
    readonly path: string,
    private readonly factory: PortFactory = realPort,
    capabilities: TransportCapabilities = nodeCapabilities(),
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.capabilities = capabilities;
  }

  get state(): TransportState {
    return this.current;
  }

  async open(o: SerialOptions): Promise<void> {
    if (this.current === 'open') throw new Error('Port is already open');
    const problems = unsupportedOptions(this.capabilities, o);
    if (problems.length) throw new Error(problems.join('; '));
    const port = this.factory(this.path, o);
    await new Promise<void>((res, rej) => port.open((e) => (e ? rej(e) : res())));
    this.port = port;
    this.current = 'open';
    this.out = { dtr: true, rts: true, brk: false };
    port.on('data', (b: Buffer) => {
      const chunk = new Uint8Array(b.length);
      chunk.set(b);
      const t = this.clock();
      this.data.forEach((l) => l(chunk, t));
    });
    port.on('error', (e: Error) => this.errors.forEach((l) => l(e)));
    port.on('close', (e?: Error & { disconnected?: boolean }) => {
      if (e?.disconnected) this.errors.forEach((l) => l(new Error('The device has been disconnected.')));
      this.finish();
    });
  }

  async close(): Promise<void> {
    const port = this.port;
    if (!port || this.current === 'closed') return;
    await new Promise<void>((res) => port.close(() => res()));
    this.finish();
  }

  async write(data: Uint8Array): Promise<void> {
    const port = this.requireOpen();
    await new Promise<void>((res, rej) => port.write(Buffer.from(data), (e) => (e ? rej(e) : res())));
  }

  async setSignals(s: OutputSignals): Promise<void> {
    this.requireOpen();
    if (s.dtr !== undefined) this.out.dtr = s.dtr;
    if (s.rts !== undefined) this.out.rts = s.rts;
    await this.applyOut();
  }

  async getSignals(): Promise<InputSignals> {
    const port = this.requireOpen();
    const s = await new Promise<{ cts: boolean; dsr: boolean; dcd: boolean }>((res, rej) =>
      port.get((e, st) => (e || !st ? rej(e ?? new Error('No status')) : res(st))),
    );
    return { cts: s.cts, dsr: s.dsr, dcd: s.dcd, ri: false };
  }

  async sendBreak(durationMs: number): Promise<void> {
    this.requireOpen();
    this.out.brk = true;
    await this.applyOut();
    try {
      await sleep(durationMs);
    } finally {
      this.out.brk = false;
      if (this.current === 'open') await this.applyOut();
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

  private applyOut(): Promise<void> {
    const port = this.requireOpen();
    return new Promise((res, rej) => port.set({ ...this.out }, (e) => (e ? rej(e) : res())));
  }

  private finish(): void {
    if (this.current === 'closed') return;
    this.current = 'closed';
    this.port?.removeAllListeners();
    this.port = null;
    this.closes.forEach((l) => l());
  }

  private requireOpen(): SerialPortStream {
    if (this.current !== 'open' || !this.port) throw new Error('Port is not open');
    return this.port;
  }
}

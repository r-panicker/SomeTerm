import {
  NET_CAPABILITIES,
  parseNetPath,
  type InputSignals,
  type OutputSignals,
  type SerialOptions,
  type SerialTransport,
  type TransportCapabilities,
  type TransportState,
  type Unsubscribe,
} from '@superserial/core';
import type { NativeSerialBridge } from './bridge';

/** Electron wraps errors from the main process as "Error invoking remote method 'x': Error: reason"; keep the reason. */
export function ipcError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  return new Error(msg.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, ''));
}

/** Renderer-side transport that drives a native port in the main process. */
export class IpcSerialTransport implements SerialTransport {
  readonly capabilities: TransportCapabilities;
  private current: TransportState = 'closed';
  private off: (() => void) | null = null;
  private data = new Set<(chunk: Uint8Array, timestamp: number) => void>();
  private errors = new Set<(error: Error) => void>();
  private closes = new Set<() => void>();
  private notices = new Set<(text: string) => void>();

  constructor(
    private readonly bridge: NativeSerialBridge,
    readonly path: string,
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.capabilities = parseNetPath(path) ? NET_CAPABILITIES : bridge.capabilities;
  }

  get state(): TransportState {
    return this.current;
  }

  async open(options: SerialOptions): Promise<void> {
    if (this.current === 'open') throw new Error('Port is already open');
    // Subscribe first so nothing that arrives right after opening is lost.
    this.off = this.bridge.onEvent((e) => {
      if (e.path !== this.path) return;
      if (e.type === 'data') {
        const t = this.clock();
        this.data.forEach((l) => l(e.data, t));
      } else if (e.type === 'error') this.errors.forEach((l) => l(new Error(e.message)));
      else if (e.type === 'notice') this.notices.forEach((l) => l(e.text));
      else this.finish();
    });
    try {
      await this.bridge.open(this.path, options);
    } catch (e) {
      this.off();
      this.off = null;
      throw ipcError(e);
    }
    this.current = 'open';
  }

  async close(): Promise<void> {
    if (this.current === 'closed') return;
    await this.bridge.close(this.path);
    this.finish();
  }

  write(data: Uint8Array): Promise<void> {
    this.requireOpen();
    return this.bridge.write(this.path, data.slice()).catch((e) => { throw ipcError(e); });
  }

  setSignals(s: OutputSignals): Promise<void> {
    this.requireOpen();
    return this.bridge.setSignals(this.path, s);
  }

  getSignals(): Promise<InputSignals> {
    this.requireOpen();
    return this.bridge.getSignals(this.path);
  }

  sendBreak(ms: number): Promise<void> {
    this.requireOpen();
    return this.bridge.sendBreak(this.path, ms);
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

  onNotice(l: (text: string) => void): Unsubscribe {
    this.notices.add(l);
    return () => this.notices.delete(l);
  }

  private finish(): void {
    if (this.current === 'closed' && !this.off) return;
    this.current = 'closed';
    this.off?.();
    this.off = null;
    this.closes.forEach((l) => l());
  }

  private requireOpen(): void {
    if (this.current !== 'open') throw new Error('Port is not open');
  }
}

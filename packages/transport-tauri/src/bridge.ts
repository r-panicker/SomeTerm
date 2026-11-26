import type {
  InputSignals,
  OutputSignals,
  SerialOptions,
  TransportCapabilities,
} from '@someterm/core';

export interface NativePortSummary {
  path: string;
  label: string;
  /** Hex strings as the OS reports them, when the port is USB. */
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
}

export type BridgeEvent =
  | { path: string; type: 'data'; data: Uint8Array }
  | { path: string; type: 'error'; message: string }
  | { path: string; type: 'notice'; text: string }
  | { path: string; type: 'close' };

/**
 * The desktop transport contract shared by the UI and Tauri command adapter.
 */
export interface NativeSerialBridge {
  capabilities: TransportCapabilities;
  list(): Promise<NativePortSummary[]>;
  open(path: string, options: SerialOptions): Promise<void>;
  close(path: string): Promise<void>;
  write(path: string, data: Uint8Array): Promise<void>;
  setSignals(path: string, s: OutputSignals): Promise<void>;
  getSignals(path: string): Promise<InputSignals>;
  sendBreak(path: string, ms: number): Promise<void>;
  onEvent(cb: (e: BridgeEvent) => void): () => void;
}

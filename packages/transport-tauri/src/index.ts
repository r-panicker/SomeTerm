import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import type { TransportCapabilities } from '@someterm/core';
import type { BridgeEvent, NativeSerialBridge } from './bridge';
export { IpcSerialTransport } from './transport';
export type {
  NativePortSummary,
  NativeSerialBridge,
  BridgeEvent,
} from './bridge';

type WireEvent =
  | Exclude<BridgeEvent, { type: 'data' }>
  | { type: 'data'; path: string; data: number[] };

/** Browser builds use Web Serial; no native command is invoked outside Tauri. */
export async function createNativeBridge(): Promise<
  NativeSerialBridge | undefined
> {
  if (!isTauri()) return undefined;
  const capabilities = await invoke<TransportCapabilities>(
    'native_capabilities',
  );
  const listeners = new Set<(event: BridgeEvent) => void>();
  const channels = new Map<string, Channel<WireEvent>>();
  return {
    capabilities,
    list: () => invoke('native_list'),
    async open(path, options) {
      if (channels.has(path)) throw new Error(`${path} is already open`);
      const onEvent = new Channel<WireEvent>();
      channels.set(path, onEvent);
      onEvent.onmessage = (event) => {
        // Delayed events from a previous connection must not close its replacement.
        if (channels.get(path) !== onEvent) return;
        if (event.type === 'close') channels.delete(path);
        const decoded: BridgeEvent =
          event.type === 'data'
            ? { ...event, data: Uint8Array.from(event.data) }
            : event;
        listeners.forEach((listener) => listener(decoded));
      };
      try {
        await invoke('native_open', { path, options, onEvent });
      } catch (error) {
        if (channels.get(path) === onEvent) channels.delete(path);
        throw error;
      }
    },
    async close(path) {
      const channel = channels.get(path);
      await invoke('native_close', { path });
      if (channels.get(path) === channel) channels.delete(path);
    },
    write: (path, data) =>
      invoke('native_write', { path, data: Array.from(data) }),
    setSignals: (path, signals) =>
      invoke('native_set_signals', { path, signals }),
    getSignals: (path) => invoke('native_get_signals', { path }),
    sendBreak: (path, ms) => invoke('native_send_break', { path, ms }),
    onEvent(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

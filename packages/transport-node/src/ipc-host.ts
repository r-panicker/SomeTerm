import type { SerialOptions, SerialTransport } from '@superserial/core';
import { CHANNELS, type BridgeEvent, type NativePortSummary } from './bridge';
import { NodeSerialTransport, listNodePorts } from './node';

/** The parts of Electron's ipcMain the host needs; also lets tests run without Electron. */
export interface IpcMainLike {
  handle(channel: string, fn: (event: unknown, ...args: never[]) => unknown): void;
  removeHandler(channel: string): void;
}

/**
 * Main-process side of the bridge. Owns one transport per open path and
 * forwards its events to the renderer through `send`.
 */
export function serveSerialBridge(
  ipc: IpcMainLike,
  send: (channel: string, event: BridgeEvent) => void,
  create: (path: string) => SerialTransport = (p) => new NodeSerialTransport(p),
  list: () => Promise<NativePortSummary[]> = listNodePorts,
): () => Promise<void> {
  const ports = new Map<string, SerialTransport>();
  const get = (path: string) => {
    const t = ports.get(path);
    if (!t) throw new Error(`${path} is not open`);
    return t;
  };
  const h = <A extends unknown[]>(channel: string, fn: (...args: A) => unknown) =>
    ipc.handle(channel, ((_e: unknown, ...args: A) => fn(...args)) as never);

  h(CHANNELS.list, () => list());
  h(CHANNELS.open, async (path: string, options: SerialOptions) => {
    if (ports.has(path)) throw new Error(`${path} is already open`);
    const t = create(path);
    t.onData((data) => send(CHANNELS.event, { path, type: 'data', data }));
    t.onError((e) => send(CHANNELS.event, { path, type: 'error', message: e.message }));
    t.onClose(() => {
      ports.delete(path);
      send(CHANNELS.event, { path, type: 'close' });
    });
    await t.open(options);
    ports.set(path, t);
  });
  h(CHANNELS.close, (path: string) => ports.get(path)?.close());
  h(CHANNELS.write, (path: string, data: Uint8Array) => get(path).write(data));
  h(CHANNELS.setSignals, (path: string, s) => get(path).setSignals(s as never));
  h(CHANNELS.getSignals, (path: string) => get(path).getSignals());
  h(CHANNELS.sendBreak, (path: string, ms: number) => get(path).sendBreak(ms));

  return async () => {
    for (const c of Object.values(CHANNELS)) if (c !== CHANNELS.event) ipc.removeHandler(c);
    await Promise.all([...ports.values()].map((t) => t.close()));
    ports.clear();
  };
}

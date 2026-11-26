import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FULL_CAPABILITIES, type SerialOptions } from '@someterm/core';
const mock = vi.hoisted(() => ({
  native: false,
  invoke: vi.fn(),
  channels: [] as { onmessage: (event: unknown) => void }[],
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => mock.native,
  invoke: mock.invoke,
  Channel: class {
    onmessage = (_event: unknown) => {};
    constructor() {
      mock.channels.push(this);
    }
  },
}));
import { createNativeBridge, IpcSerialTransport } from './index';
const options: SerialOptions = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none',
};
beforeEach(() => {
  mock.native = true;
  mock.channels = [];
  mock.invoke.mockReset();
  mock.invoke.mockImplementation(async (command: string) =>
    command === 'native_capabilities' ? FULL_CAPABILITIES : undefined,
  );
});
describe('Tauri bridge', () => {
  it('does not invoke native commands in a browser', async () => {
    mock.native = false;
    expect(await createNativeBridge()).toBeUndefined();
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('round-trips exact bytes over a channel subscribed before open', async () => {
    const bridge = (await createNativeBridge())!;
    const transport = new IpcSerialTransport(bridge, '/dev/test', () => 123);
    const got: number[] = [];
    transport.onData((bytes, time) => {
      expect(time).toBe(123);
      got.push(...bytes);
    });
    mock.invoke.mockImplementation(async (command: string) => {
      if (command === 'native_open')
        mock.channels[0]!.onmessage({
          type: 'data',
          path: '/dev/test',
          data: [0, 128, 255],
        });
    });
    await transport.open(options);
    expect(got).toEqual([0, 128, 255]);
    await transport.write(Uint8Array.of(0, 255));
    expect(mock.invoke).toHaveBeenCalledWith('native_write', {
      path: '/dev/test',
      data: [0, 255],
    });
    await transport.close();
    expect(transport.state).toBe('closed');
  });
  it('ignores delayed old-channel close events after reopen', async () => {
    const bridge = (await createNativeBridge())!;
    const t = new IpcSerialTransport(bridge, '/dev/test');
    await t.open(options);
    const old = mock.channels[0]!;
    await t.close();
    await t.open(options);
    old.onmessage({ type: 'close', path: '/dev/test' });
    expect(t.state).toBe('open');
    mock.channels[1]!.onmessage({ type: 'close', path: '/dev/test' });
    expect(t.state).toBe('closed');
  });
  it('rejects duplicate opens without replacing the first channel', async () => {
    const bridge = (await createNativeBridge())!;
    await bridge.open('port', options);
    await expect(bridge.open('port', options)).rejects.toThrow('already open');
    expect(mock.channels).toHaveLength(1);
  });
  it('normalizes Rust string errors and releases a failed open for retry', async () => {
    const bridge = (await createNativeBridge())!;
    const t = new IpcSerialTransport(bridge, 'port');
    mock.invoke.mockRejectedValueOnce('access denied');
    await expect(t.open(options)).rejects.toThrow('access denied');
    expect(t.state).toBe('closed');
    await t.open(options);
    expect(t.state).toBe('open');
  });
  it('does not revive a connection that closed while opening', async () => {
    const bridge = (await createNativeBridge())!;
    const t = new IpcSerialTransport(bridge, 'port');
    mock.invoke.mockImplementationOnce(async () =>
      mock.channels[0]!.onmessage({ type: 'close', path: 'port' }),
    );
    await expect(t.open(options)).rejects.toThrow('closed while opening');
    expect(t.state).toBe('closed');
  });
});

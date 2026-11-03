import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodeSerialTransport } from './node';

// A real pseudo-terminal with an echoing far end exercises the actual native
// binding (open, termios, read, write, close) without hardware.
const ECHO = `
import os, pty, select, sys
m, s = pty.openpty()
print(os.ttyname(s), flush=True)
while True:
    r, _, _ = select.select([m, sys.stdin], [], [])
    if sys.stdin in r:
        break
    d = os.read(m, 4096)
    os.write(m, d)
`;
const canRun = process.platform !== 'win32' && existsSync('/usr/bin/python3');

describe.skipIf(!canRun)('NodeSerialTransport over a real pty', () => {
  let echo: ChildProcess;
  let path = '';

  beforeAll(async () => {
    echo = spawn('python3', ['-c', ECHO], { stdio: ['pipe', 'pipe', 'inherit'] });
    path = await new Promise<string>((res) => echo.stdout!.once('data', (d) => res(String(d).trim())));
  });
  afterAll(() => echo.kill());

  it('round-trips bytes through the native binding', async () => {
    const t = new NodeSerialTransport(path);
    const got: number[] = [];
    t.onData((c) => got.push(...c));
    await t.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    const msg = Uint8Array.from({ length: 256 }, (_, i) => i);
    await t.write(msg);
    for (let i = 0; i < 50 && got.length < msg.length; i++) await new Promise((r) => setTimeout(r, 20));
    await t.close();
    expect(got).toEqual([...msg]);
  });
});

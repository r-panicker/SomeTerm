import { describe, expect, it } from 'vitest';
import { ByteQueue, crc16Xmodem, xmodemBlock, xmodemSend, type XmodemIo, type XmodemMode } from './xmodem';

const enc = (s: string) => new TextEncoder().encode(s);

/** A pair of queues, one per direction, so a sender and a test receiver can talk. */
function link() {
  const toReceiver = new ByteQueue();
  const toSender = new ByteQueue();
  let cancel = false;
  const senderIo: XmodemIo = {
    write: async (b) => toReceiver.push(b),
    read: (ms) => toSender.read(ms),
    flush: () => toSender.flush(),
    cancelled: () => cancel,
  };
  return { toReceiver, toSender, senderIo, cancelNow: () => { cancel = true; } };
}

interface ReceiverOpts { crc: boolean; nakBlockOnce?: number; nakFirstEot?: boolean; cancelAtBlock?: number; ymodem?: boolean }

/** Minimal receiver: verifies every block and returns the file it assembled. */
async function receive(rx: ByteQueue, tx: ByteQueue, o: ReceiverOpts) {
  const send = (b: number) => tx.push(Uint8Array.of(b));
  const readN = async (n: number) => {
    const out: number[] = [];
    while (out.length < n) { const b = await rx.read(2000); if (b === null) throw new Error('receiver timed out'); out.push(b); }
    return Uint8Array.from(out);
  };
  const blocks: { n: number; size: number }[] = [];
  let data: number[] = [];
  let header = '';
  let nakked = false;
  let eots = 0;
  let want = o.ymodem ? 0 : 1;
  let ended = false;
  send(o.crc ? 0x43 : 0x15);
  for (;;) {
    const h = await rx.read(2000);
    if (h === null) throw new Error('receiver timed out waiting for a block');
    if (h === 0x18) return { aborted: true, data: Uint8Array.from(data), blocks, header };
    if (h === 0x04) {
      eots++;
      if (o.nakFirstEot && eots === 1) { send(0x15); continue; }
      send(0x06);
      if (!o.ymodem) return { aborted: false, data: Uint8Array.from(data), blocks, header };
      ended = true;
      send(0x43);
      want = 0;
      continue;
    }
    const size = h === 0x02 ? 1024 : 128;
    const rest = await readN(2 + size + (o.crc ? 2 : 1));
    const [n, inv] = [rest[0]!, rest[1]!];
    const body = rest.subarray(2, 2 + size);
    expect(n + inv).toBe(255);
    if (o.crc) expect((rest[2 + size]! << 8) | rest[3 + size]!).toBe(crc16Xmodem(body));
    else expect(rest[2 + size]).toBe(body.reduce((a, b) => (a + b) & 0xff, 0));
    if (o.cancelAtBlock === n) { send(0x18); send(0x18); return { aborted: true, data: Uint8Array.from(data), blocks, header }; }
    if (o.nakBlockOnce === n && !nakked) { nakked = true; send(0x15); continue; }
    if (o.ymodem && n === 0) {
      send(0x06);
      if (ended) return { aborted: false, data: Uint8Array.from(data), blocks, header, nullBlock: body.every((b) => b === 0) };
      const end = body.indexOf(0, body.indexOf(0) + 1);
      header = new TextDecoder().decode(body.subarray(0, end < 0 ? body.length : end));
      send(0x43);
      want = 1;
      continue;
    }
    expect(n).toBe(want & 0xff);
    want++;
    blocks.push({ n, size });
    data = data.concat(Array.from(body));
    send(0x06);
  }
}

const file = Uint8Array.from({ length: 3000 }, (_, i) => (i * 7 + 3) & 0xff);
const quick = { startMs: 1000, blockMs: 300, retries: 3 };

async function transfer(mode: XmodemMode, data: Uint8Array, o: ReceiverOpts) {
  const l = link();
  const progress: number[] = [];
  const [sent, got] = await Promise.allSettled([
    xmodemSend(data, 'fw.bin', mode, l.senderIo, (n) => progress.push(n), quick),
    receive(l.toReceiver, l.toSender, o),
  ]);
  return { sent, got: got.status === 'fulfilled' ? got.value : null, progress };
}

describe('xmodem', () => {
  it('CRC-16/XMODEM matches the standard check value', () => {
    expect(crc16Xmodem(enc('123456789'))).toBe(0x31c3);
  });

  it('frames a block with number, complement, SUB padding and CRC', () => {
    const b = xmodemBlock(1, enc('hi'), 128, true);
    expect(Array.from(b.subarray(0, 5))).toEqual([0x01, 1, 254, 0x68, 0x69]);
    expect(b[5]).toBe(0x1a);
    expect(b.length).toBe(3 + 128 + 2);
  });

  it('XMODEM with checksums: 128-byte blocks, file intact apart from SUB padding', async () => {
    const r = await transfer('xmodem', file, { crc: false });
    expect(r.sent.status).toBe('fulfilled');
    expect(r.got!.blocks.every((b) => b.size === 128)).toBe(true);
    expect(r.got!.blocks.length).toBe(Math.ceil(3000 / 128));
    expect(Array.from(r.got!.data.subarray(0, 3000))).toEqual(Array.from(file));
    expect(r.got!.data.subarray(3000).every((b) => b === 0x1a)).toBe(true);
    expect(r.progress.at(-1)).toBe(3000);
  });

  it('XMODEM-1K uses 1024-byte blocks with CRC, and 128 for a short tail', async () => {
    const r = await transfer('xmodem1k', file, { crc: true });
    expect(r.sent.status).toBe('fulfilled');
    expect(r.got!.blocks.map((b) => b.size)).toEqual([1024, 1024, 1024]);
    const tail = await transfer('xmodem1k', file.subarray(0, 1100), { crc: true });
    expect(tail.got!.blocks.map((b) => b.size)).toEqual([1024, 128]);
  });

  it('XMODEM-1K falls back to 128-byte blocks when the receiver asks for checksums', async () => {
    const r = await transfer('xmodem1k', file.subarray(0, 300), { crc: false });
    expect(r.sent.status).toBe('fulfilled');
    expect(r.got!.blocks.every((b) => b.size === 128)).toBe(true);
  });

  it('resends a NAKed block and a NAKed EOT', async () => {
    const r = await transfer('xmodem', file.subarray(0, 600), { crc: true, nakBlockOnce: 2, nakFirstEot: true });
    expect(r.sent.status).toBe('fulfilled');
    expect(r.got!.blocks.map((b) => b.n)).toEqual([1, 2, 3, 4, 5]);
    expect(Array.from(r.got!.data.subarray(0, 600))).toEqual(Array.from(file.subarray(0, 600)));
  });

  it('YMODEM sends name and size, 1K data, then an empty header to end the batch', async () => {
    const r = await transfer('ymodem', file, { crc: true, ymodem: true });
    expect(r.sent.status).toBe('fulfilled');
    expect(r.got!.header).toBe('fw.bin\u00003000');
    expect(r.got!.blocks.map((b) => b.size)).toEqual([1024, 1024, 1024]);
    expect((r.got as { nullBlock?: boolean }).nullBlock).toBe(true);
  });

  it('stops when the receiver cancels', async () => {
    const r = await transfer('xmodem', file, { crc: true, cancelAtBlock: 3 });
    expect(r.sent.status).toBe('rejected');
    expect((r.sent as PromiseRejectedResult).reason.message).toBe('The receiver cancelled');
  });

  it('times out if nobody starts the receiver', async () => {
    const l = link();
    await expect(xmodemSend(file, 'f', 'xmodem', l.senderIo, () => {}, { startMs: 300 })).rejects.toThrow('did not start');
  });

  it('a user cancel sends CAN to the receiver', async () => {
    const l = link();
    const p = xmodemSend(file, 'f', 'xmodem', l.senderIo, () => {}, quick);
    l.cancelNow();
    await expect(p).rejects.toThrow('Cancelled');
    const sent: number[] = [];
    for (let b = await l.toReceiver.read(10); b !== null; b = await l.toReceiver.read(10)) sent.push(b);
    expect(sent.filter((b) => b === 0x18).length).toBe(8);
  });
});

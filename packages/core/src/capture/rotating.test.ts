import { describe, expect, it } from 'vitest';
import { RotatingSink, rotatedName } from './rotating';
import { Capture } from './capture';

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function files() {
  const all: { index: number; data: string; closed: boolean }[] = [];
  const open = async (index: number) => {
    const f = { index, data: '', closed: false };
    all.push(f);
    return { write: async (b: Uint8Array) => void (f.data += String.fromCharCode(...b)), close: async () => void (f.closed = true) };
  };
  return { all, open };
}

describe('RotatingSink', () => {
  it('starts a new file once the size limit is reached, never splitting a write', async () => {
    const { all, open } = files();
    const s = new RotatingSink(open, { bytes: 10 });
    for (const w of ['12345678', 'abcdef', 'xy', 'z']) await s.write(enc(w));
    await s.close();
    expect(all.map((f) => f.data)).toEqual(['12345678abcdef', 'xyz']);
    expect(all.every((f) => f.closed)).toBe(true);
    expect(s.count).toBe(2);
  });

  it('rotates by age, checked at the next write so idle time makes no empty files', async () => {
    let t = 0;
    const { all, open } = files();
    const s = new RotatingSink(open, { seconds: 60 }, () => t);
    await s.write(enc('a'));
    t = 59_999;
    await s.write(enc('b'));
    t = 600_000;
    await s.write(enc('c'));
    await s.close();
    expect(all.map((f) => f.data)).toEqual(['ab', 'c']);
  });

  it('opens nothing if nothing is written', async () => {
    const { all, open } = files();
    const s = new RotatingSink(open, { bytes: 1 });
    await s.close();
    expect(all).toEqual([]);
  });

  it('with Capture text format, each file holds whole lines', async () => {
    const { all, open } = files();
    const cap = new Capture(new RotatingSink(open, { bytes: 30 }), { source: 'rx', format: 'text' }, 0);
    cap.rx(enc('first line\nsecond line\nthird'), 0);
    cap.rx(enc(' line\nfourth\n'), 0);
    await cap.stop();
    const lines = all.flatMap((f) => f.data.split('\n').filter(Boolean));
    expect(lines.map((l) => l.slice(24))).toEqual(['first line', 'second line', 'third line', 'fourth']);
    expect(all.length).toBeGreaterThan(1);
    for (const f of all) expect(f.data.endsWith('\n')).toBe(true);
  });

  it('names files with a zero-padded index', () => {
    expect(rotatedName('cap', 7)).toBe('cap-007.txt');
    expect(rotatedName('cap', 1234, '.bin')).toBe('cap-1234.bin');
  });
});

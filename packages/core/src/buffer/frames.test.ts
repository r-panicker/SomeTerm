import { describe, expect, it } from 'vitest';
import { FrameIndex, type FrameRow } from './frames';

const rows = (f: FrameIndex, from: number, per: number) => Array.from({ length: f.count(from, per) }, (_, i) => f.row(i, from, per));
const spans = (r: FrameRow[]) => r.map((x) => `${x.at}+${x.len}${x.first ? '*' : ''}`);

describe('FrameIndex', () => {
  it('gap: a chunk after an idle gap starts a frame; long frames wrap', () => {
    const f = new FrameIndex({ kind: 'gap', ms: 5 }, 0);
    f.push(new Uint8Array(3), 0);   // frame at 0
    f.push(new Uint8Array(2), 1);   // same frame (1 ms later)
    f.push(new Uint8Array(4), 10);  // new frame at 5
    f.push(new Uint8Array(20), 30); // new frame at 9, wraps at 8 per row
    expect(spans(rows(f, 0, 8))).toEqual(['0+5*', '5+4*', '9+8*', '17+8', '25+4']);
    expect(f.row(1, 0, 8).time).toBe(10);
    expect(f.row(3, 0, 8).time).toBeNaN();
  });

  it('sync: each occurrence of the pattern starts a frame, also across chunk boundaries', () => {
    const f = new FrameIndex({ kind: 'sync', pattern: Uint8Array.of(0xaa, 0x55) }, 100);
    f.push(Uint8Array.of(1, 2, 0xaa, 0x55, 3, 0xaa), 0);
    f.push(Uint8Array.of(0x55, 4, 5, 6), 1);
    expect(spans(rows(f, 100, 16))).toEqual(['100+2*', '102+3*', '105+5*']);
    expect(f.row(2, 100, 16).time).toBe(1);
  });

  it('starts mid-frame when older data is gone, and keeps absolute rows after pruning', () => {
    const f = new FrameIndex({ kind: 'gap', ms: 5 }, 0);
    for (let i = 0; i < 3000; i++) f.push(new Uint8Array(4), i * 10);
    f.push(new Uint8Array(10), 30_000);
    const from = 11_995; // mid-way through the frame at 11992
    const before = spans(rows(f, from, 4));
    f.prune(from);
    expect(spans(rows(f, from, 4))).toEqual(before);
    expect(f.row(1, from, 4).n).toBe(2999);
    expect(before.slice(0, 2)).toEqual(['11995+1', '11996+4*']);
    expect(before.slice(-3)).toEqual(['12000+4*', '12004+4', '12008+2']);
  });

  it('changing the row width rewraps every frame', () => {
    const f = new FrameIndex({ kind: 'gap', ms: 5 }, 0);
    f.push(new Uint8Array(10), 0);
    f.push(new Uint8Array(3), 10);
    expect(f.count(0, 4)).toBe(4);
    expect(f.count(0, 16)).toBe(2);
    expect(spans(rows(f, 0, 8))).toEqual(['0+8*', '8+2', '10+3*']);
  });
});

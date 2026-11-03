import { describe, expect, it } from 'vitest';
import { TerminalLog, type TermLine } from './log';

const rx = (offset: number): TermLine => ({ dir: 'rx', text: `r${offset}`, time: 0, offset });
const tx = (): TermLine => ({ dir: 'tx', text: 't', time: 0, offset: -1 });

describe('TerminalLog', () => {
  it('finds the rx line containing an offset, skipping tx lines', () => {
    const log = new TerminalLog();
    [rx(0), rx(10), tx(), tx(), rx(20), tx(), rx(35)].forEach((l) => log.push(l));
    expect(log.indexOfOffset(0)).toBe(0);
    expect(log.indexOfOffset(12)).toBe(1);
    expect(log.indexOfOffset(20)).toBe(4);
    expect(log.indexOfOffset(34)).toBe(4);
    expect(log.indexOfOffset(99)).toBe(6);
  });
  it('returns -1 for offsets before the oldest held line', () => {
    const log = new TerminalLog();
    log.push(tx());
    log.push(rx(50));
    expect(log.indexOfOffset(10)).toBe(-1);
  });
  it('trims from the front past capacity', () => {
    const log = new TerminalLog(10);
    for (let i = 0; i < 12; i++) log.push(rx(i));
    expect(log.length).toBe(10);
    expect(log.get(0)?.offset).toBe(2);
  });
});

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
  it('pushRx slots a late rx line before newer tx lines only', () => {
    const log = new TerminalLog();
    log.push({ dir: 'rx', text: 'a', time: 1, offset: 0 });
    log.push({ dir: 'tx', text: 'T1', time: 5, offset: -1 });
    log.push({ dir: 'tx', text: 'T2', time: 9, offset: -1 });
    log.pushRx({ dir: 'rx', text: 'b', time: 7, offset: 2 });
    log.pushRx({ dir: 'rx', text: 'c', time: 10, offset: 4 });
    expect(Array.from({ length: log.length }, (_, i) => log.get(i)!.text)).toEqual(['a', 'T1', 'b', 'T2', 'c']);
  });

  it('pushByTime merges lines from several sources into time order', () => {
    const log = new TerminalLog();
    const at = (time: number, src: number) => ({ dir: 'rx' as const, text: `${src}@${time}`, time, offset: 0, src });
    [at(1, 0), at(4, 0), at(2, 1), at(3, 1), at(5, 1), at(4, 1)].forEach((l) => log.pushByTime(l));
    expect(Array.from({ length: log.length }, (_, i) => log.get(i)!.text)).toEqual(['0@1', '1@2', '1@3', '0@4', '1@4', '1@5']);
  });

  it('trims from the front past capacity', () => {
    const log = new TerminalLog(10);
    for (let i = 0; i < 12; i++) log.push(rx(i));
    expect(log.length).toBe(10);
    expect(log.get(0)?.offset).toBe(2);
    expect(log.dropped).toBe(2);
  });
});

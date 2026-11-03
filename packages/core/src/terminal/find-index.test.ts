import { describe, expect, it } from 'vitest';
import { FindIndex } from './find-index';
import { TerminalLog } from './log';

const rx = (text: string, time = 0) => ({ dir: 'rx' as const, text, time, offset: 0 });
const opts = { caseSensitive: false, regex: false };

describe('FindIndex', () => {
  it('indexes existing lines and counts every match', () => {
    const log = new TerminalLog();
    ['err a', 'ok', 'err err'].forEach((t) => log.push(rx(t)));
    const f = new FindIndex();
    f.set('err', opts, log);
    expect(f.hits.map((h) => [h.abs, h.ranges.length])).toEqual([[0, 1], [2, 2]]);
    expect(f.total).toBe(3);
  });

  it('scan picks up only new lines without double counting', () => {
    const log = new TerminalLog();
    log.push(rx('err'));
    const f = new FindIndex();
    f.set('err', opts, log);
    log.push(rx('x'));
    log.push(rx('err'));
    f.scan(log);
    f.scan(log);
    expect(f.hits.map((h) => h.abs)).toEqual([0, 2]);
    expect(f.total).toBe(2);
  });

  it('keeps absolute positions valid when the log trims its front', () => {
    const log = new TerminalLog(10);
    const f = new FindIndex();
    f.set('hit', opts, log);
    for (let i = 0; i < 12; i++) log.push(rx(i % 3 === 0 ? `hit ${i}` : `${i}`));
    f.scan(log);
    expect(log.dropped).toBe(2);
    expect(f.hits.map((h) => log.get(h.abs - log.dropped)!.text)).toEqual(['hit 3', 'hit 6', 'hit 9']);
    expect(f.total).toBe(3);
  });

  it('a late rx line inserted before recent tx lines is found and nothing shifts', () => {
    const log = new TerminalLog();
    log.push(rx('a', 1));
    log.push({ dir: 'tx', text: 'send hit', time: 5, offset: -1 });
    const f = new FindIndex();
    f.set('hit', opts, log);
    log.pushRx(rx('reply hit', 3));
    f.scan(log);
    expect(f.hits.map((h) => log.get(h.abs)!.text)).toEqual(['reply hit', 'send hit']);
    expect(f.total).toBe(2);
  });

  it('clearing the log drops old hits rather than reusing their line numbers', () => {
    const log = new TerminalLog();
    log.push(rx('hit'));
    const f = new FindIndex();
    f.set('hit', opts, log);
    log.clear();
    log.push(rx('no'));
    f.scan(log);
    expect(f.hits).toEqual([]);
    expect(f.total).toBe(0);
  });

  it('invalid regex sets an error and no hits', () => {
    const log = new TerminalLog();
    log.push(rx('a'));
    const f = new FindIndex();
    f.set('(', { caseSensitive: false, regex: true }, log);
    expect(f.error).not.toBe('');
    expect(f.active).toBe(false);
    expect(f.hits).toEqual([]);
  });

  it('lowerBound and find', () => {
    const log = new TerminalLog();
    ['x', 'hit', 'x', 'hit'].forEach((t) => log.push(rx(t)));
    const f = new FindIndex();
    f.set('hit', opts, log);
    expect([f.find(1), f.find(2), f.lowerBound(2), f.lowerBound(4)]).toEqual([0, -1, 1, 2]);
  });
});

import { describe, expect, it } from 'vitest';
import { buildMatcher, type Matcher } from './search';

const m = (q: string, caseSensitive = false, regex = false) => buildMatcher(q, { caseSensitive, regex }) as Matcher;

describe('buildMatcher', () => {
  it('plain text is literal and case-insensitive by default', () => {
    expect(m('a.b')('xA.Bya.bz axb')).toEqual([[1, 4], [5, 8]]);
  });
  it('case sensitive', () => {
    expect(m('Err', true)('err Err ERR')).toEqual([[4, 7]]);
  });
  it('regex with groups and alternation', () => {
    expect(m('t(emp)?:\\d+', false, true)('temp:23 t:4 x:5')).toEqual([[0, 7], [8, 11]]);
  });
  it('skips empty matches instead of looping or matching everywhere', () => {
    expect(m('x*', false, true)('ab xx c')).toEqual([[3, 5]]);
  });
  it('reports invalid regex as a message and empty query as null', () => {
    expect(typeof buildMatcher('(', { caseSensitive: false, regex: true })).toBe('string');
    expect(buildMatcher('(', { caseSensitive: false, regex: false })).not.toBeTypeOf('string');
    expect(buildMatcher('', { caseSensitive: false, regex: true })).toBeNull();
  });
  it('is reusable across calls', () => {
    const f = m('a');
    expect(f('aa')).toEqual([[0, 1], [1, 2]]);
    expect(f('ba')).toEqual([[1, 2]]);
  });
});

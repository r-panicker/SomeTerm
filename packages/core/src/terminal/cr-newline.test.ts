import { describe, expect, it } from 'vitest';
import { CrNewline } from './cr-newline';

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const dec = (b: Uint8Array) => String.fromCharCode(...b);

describe('CrNewline', () => {
  it('a lone CR becomes CR LF; CR LF and LF pass unchanged', () => {
    const c = new CrNewline();
    expect(dec(c.push(enc('a1\rb2\r\nc3\nd4')))).toBe('a1\r\nb2\r\nc3\nd4');
  });

  it('a CR LF pair split across chunks is not doubled', () => {
    const c = new CrNewline();
    expect(dec(c.push(enc('x\r')))).toBe('x\r\n');
    expect(dec(c.push(enc('\ny')))).toBe('y');
  });

  it('CR CR gives two line breaks, and other bytes are untouched', () => {
    const c = new CrNewline();
    expect([...c.push(Uint8Array.of(0x0d, 0x0d, 0x00, 0xff, 0x1b))]).toEqual([0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0xff, 0x1b]);
  });

  it('reset forgets a trailing CR', () => {
    const c = new CrNewline();
    c.push(enc('\r'));
    c.reset();
    expect(dec(c.push(enc('\nz')))).toBe('\nz');
  });
});

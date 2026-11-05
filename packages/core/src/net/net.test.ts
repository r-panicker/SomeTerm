import { describe, expect, it } from 'vitest';
import { netPath, parseNetPath, netSpecProblem, describeNet } from './spec';
import { TelnetCodec, IAC } from './telnet';
import { parseNumbers } from '../send/numbers';

describe('net paths', () => {
  it('round-trips every mode and protocol', () => {
    for (const mode of ['client', 'server'] as const)
      for (const protocol of ['tcp', 'telnet'] as const) {
        const s = { mode, protocol, host: 'lab-pi.local', port: 2323 };
        expect(parseNetPath(netPath(s))).toEqual(s);
      }
    expect(netPath({ mode: 'client', protocol: 'tcp', host: '::1', port: 23 })).toBe('tcp://[::1]:23');
    expect(parseNetPath('tcp://[::1]:23')).toEqual({ mode: 'client', protocol: 'tcp', host: '::1', port: 23 });
  });

  it('serial paths are not network paths', () => {
    for (const p of ['/dev/ttyUSB0', 'COM3', '/dev/pts/5', 'tcp://host', 'tcp://host:0', 'tcp://host:70000', 'ftp://h:21']) expect(parseNetPath(p)).toBeNull();
  });

  it('describes and validates', () => {
    expect(describeNet({ mode: 'server', protocol: 'telnet', host: '0.0.0.0', port: 2323 })).toBe('Telnet server :2323');
    expect(netSpecProblem({ mode: 'client', protocol: 'tcp', host: '', port: 23 })).toMatch(/host/);
    expect(netSpecProblem({ mode: 'server', protocol: 'tcp', host: '', port: 0 })).toMatch(/Port/);
    expect(netSpecProblem({ mode: 'client', protocol: 'tcp', host: '192.168.1.5', port: 5000 })).toBe('');
  });
});

describe('telnet codec', () => {
  const b = (...x: number[]) => Uint8Array.from(x);
  it('strips negotiation and answers it: accepts echo and SGA, refuses the rest', () => {
    const c = new TelnetCodec();
    // WILL ECHO, WILL SGA, DO TERMINAL-TYPE(24), "hi"
    const r = c.decode(b(IAC, 251, 1, IAC, 251, 3, IAC, 253, 24, 0x68, 0x69));
    expect(Array.from(r.data)).toEqual([0x68, 0x69]);
    expect(Array.from(r.reply)).toEqual([IAC, 253, 1, IAC, 253, 3, IAC, 252, 24]);
    // repeated requests are not answered twice
    expect(c.decode(b(IAC, 251, 1)).reply.length).toBe(0);
  });

  it('removes subnegotiation, keeps escaped 0xFF, turns CR NUL into CR', () => {
    const c = new TelnetCodec();
    const r = c.decode(b(0x41, IAC, 250, 24, 1, IAC, 240, IAC, IAC, 0x0d, 0, 0x42, 0x0d, 0x0a));
    expect(Array.from(r.data)).toEqual([0x41, 0xff, 0x0d, 0x42, 0x0d, 0x0a]);
  });

  it('negotiation split across chunks still decodes', () => {
    const c = new TelnetCodec();
    const a = c.decode(b(0x41, IAC));
    const z = c.decode(b(251, 1, 0x42));
    expect([...a.data, ...z.data]).toEqual([0x41, 0x42]);
    expect(Array.from(z.reply)).toEqual([IAC, 253, 1]);
  });

  it('encodes 0xFF and a bare CR', () => {
    const c = new TelnetCodec();
    expect(Array.from(c.encode(b(0x41, 0xff, 0x0d, 0x0a, 0x0d)))).toEqual([0x41, 0xff, 0xff, 0x0d, 0x0a, 0x0d, 0]);
  });
});

describe('send numbers', () => {
  it('accepts decimal, hex in three spellings, binary and characters', () => {
    expect(Array.from(parseNumbers("65 0x41 $41 41h 0b1000001 'A'"))).toEqual([65, 65, 65, 65, 65, 65]);
    expect(Array.from(parseNumbers('1,2;3  255'))).toEqual([1, 2, 3, 255]);
    expect(Array.from(parseNumbers("'°'"))).toEqual([0xc2, 0xb0]);
    expect(parseNumbers('  ').length).toBe(0);
  });
  it('rejects what is not a byte', () => {
    expect(() => parseNumbers('256')).toThrow(/byte/);
    expect(() => parseNumbers('12 zz')).toThrow(/not a number/);
  });
});

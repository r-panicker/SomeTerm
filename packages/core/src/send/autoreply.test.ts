import { describe, expect, it } from 'vitest';
import { AutoReplier, type AutoReply } from './autoreply';

let n = 0;
const R = (pattern: string, reply: string, extra: Partial<AutoReply> = {}): AutoReply => ({ id: String(n++), enabled: true, pattern, caseSensitive: false, regex: false, reply, delayMs: 0, ...extra });
const str = (b: Uint8Array) => String.fromCharCode(...b);

describe('AutoReplier', () => {
  it('replies to a matching line with escapes applied', () => {
    const a = new AutoReplier(() => 0);
    a.setRules([R('login:', 'root\\r'), R('nothing', 'x')]);
    const r = a.check('box login:', 0);
    expect(r.send.map((s) => str(s.bytes))).toEqual(['root\r']);
  });

  it('fires once per line: a prompt answered as a partial is not answered again when complete', () => {
    const a = new AutoReplier(() => 0);
    a.setRules([R('Password:', 'secret\\n')]);
    expect(a.check('Password:', 100).send).toHaveLength(1);
    expect(a.check('Password: ', 100).send).toHaveLength(0);
    expect(a.check('Password:', 200).send).toHaveLength(1);
  });

  it('regex groups fill $n in the reply; case sensitivity is per rule', () => {
    const a = new AutoReplier(() => 0);
    a.setRules([R('challenge (\\d+)', 'ack $1\\r', { regex: true }), R('OK', 'no', { caseSensitive: true })]);
    const r = a.check('Challenge 4711 ok', 0);
    expect(r.send.map((s) => str(s.bytes))).toEqual(['ack 4711\r']);
  });

  it('disabled and empty rules never fire; a bad regex is skipped', () => {
    const a = new AutoReplier(() => 0);
    a.setRules([R('a', 'x', { enabled: false }), R('', 'y'), R('(', 'z', { regex: true })]);
    expect(a.check('a(', 0).send).toEqual([]);
  });

  it('a rule firing more than 10 times in a second is switched off', () => {
    let t = 0;
    const a = new AutoReplier(() => t);
    a.setRules([R('ping', 'ping\\n')]);
    let sent = 0;
    let disabled: AutoReply[] = [];
    for (let i = 0; i < 20; i++, t += 20) {
      const r = a.check('ping', i);
      sent += r.send.length;
      disabled = disabled.concat(r.disabled);
    }
    expect(sent).toBe(10);
    expect(disabled.map((d) => d.pattern)).toEqual(['ping']);
  });

  it('a slow steady rate is fine', () => {
    let t = 0;
    const a = new AutoReplier(() => t);
    a.setRules([R('tick', 'tock')]);
    let sent = 0;
    for (let i = 0; i < 50; i++, t += 200) sent += a.check('tick', i).send.length;
    expect(sent).toBe(50);
  });

  it('a malformed escape in the reply is reported, not sent', () => {
    const a = new AutoReplier(() => 0);
    a.setRules([R('x', 'bad \\x4')]);
    const r = a.check('x', 0);
    expect(r.send).toEqual([]);
    expect(r.errors[0]!.message).toContain('two hex digits');
  });
});

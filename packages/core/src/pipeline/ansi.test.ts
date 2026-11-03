import { describe, expect, it } from 'vitest';
import { AnsiParser, RGB_FLAG, applySgr } from './ansi';
import { toAscii } from '../format/bytes';

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const render = (b: Uint8Array) => toAscii(b, { controlPictures: true });
const E = '\x1b';

describe('applySgr', () => {
  it('basic, bright, 256 and truecolor', () => {
    expect(applySgr({}, [31, 1])).toEqual({ fg: 1, bold: true });
    expect(applySgr({}, [92, 104])).toEqual({ fg: 10, bg: 12 });
    expect(applySgr({}, [38, 5, 208])).toEqual({ fg: 208 });
    expect(applySgr({}, [48, 2, 255, 128, 0])).toEqual({ bg: RGB_FLAG | 0xff8000 });
  });
  it('resets', () => {
    expect(applySgr({ fg: 1, bold: true, underline: true }, [0])).toEqual({});
    expect(applySgr({ fg: 1, bold: true }, [])).toEqual({});
    expect(applySgr({ fg: 1, bg: 2, bold: true, dim: true }, [39, 22])).toEqual({ fg: undefined, bg: 2, bold: false, dim: false });
  });
});

describe('AnsiParser', () => {
  it('Zephyr/ESP-IDF style coloured log line', () => {
    const p = new AnsiParser();
    const r = p.parse(enc(`${E}[0;31mE (123) wifi: fail${E}[0m`), render);
    expect(r.text).toBe('E (123) wifi: fail');
    expect(r.runs).toEqual([{ from: 0, to: 18, fg: 1 }]);
    expect(r.hadEscape).toBe(true);
  });

  it('several runs in one line, default-styled text has no run', () => {
    const r = new AnsiParser().parse(enc(`ok ${E}[1;32mPASS${E}[0m and ${E}[33mWARN${E}[39m.`), render);
    expect(r.text).toBe('ok PASS and WARN.');
    expect(r.runs).toEqual([
      { from: 3, to: 7, fg: 2, bold: true },
      { from: 12, to: 16, fg: 3 },
    ]);
  });

  it('style carries into the next line until reset; partial lines do not commit', () => {
    const p = new AnsiParser();
    p.parse(enc(`${E}[34mblue`), render);
    expect(p.parse(enc('still'), render, false).runs).toEqual([{ from: 0, to: 5, fg: 4 }]);
    expect(p.parse(enc(`more${E}[0m`), render).runs).toEqual([{ from: 0, to: 4, fg: 4 }]);
    expect(p.parse(enc('plain'), render).runs).toEqual([]);
  });

  it('removes non-SGR CSI, OSC and charset escapes; keeps other control chars visible', () => {
    const r = new AnsiParser().parse(enc(`${E}[2K${E}[1;1H${E}]0;title\x07${E}(Bok\x01${E}[?25l!`), render);
    expect(r.text).toBe('ok␁!');
    expect(r.runs).toEqual([]);
  });

  it('OSC terminated by ESC backslash', () => {
    expect(new AnsiParser().parse(enc(`a${E}]8;;http://x${E}\\b`), render).text).toBe('ab');
  });

  it('a truncated sequence at line end is dropped, not shown as garbage', () => {
    expect(new AnsiParser().parse(enc(`x${E}[3`), render).text).toBe('x');
  });

  it('lines without escapes report hadEscape false', () => {
    expect(new AnsiParser().parse(enc('plain'), render).hadEscape).toBe(false);
  });
});

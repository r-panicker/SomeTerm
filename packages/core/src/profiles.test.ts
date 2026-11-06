import { describe, expect, it } from 'vitest';
import { exportProfiles, matchProfile, parseProfiles, uniqueName, type Profile } from './profiles';

const P = (id: string, match: Profile<number>['match'], updated = 0): Profile<number> => ({ id, name: id, match, settings: 1, updated });
const esp = { vid: 0x303a, pid: 0x1001 };

describe('matchProfile', () => {
  it('model match applies to any board of that model', () => {
    expect(matchProfile([P('esp', esp)], { ...esp, serial: 'X1' })?.id).toBe('esp');
  });
  it('a serial-tied profile matches only that board, and beats a model match', () => {
    const ps = [P('model', esp, 9), P('mine', { ...esp, serial: 'X1' }, 1)];
    expect(matchProfile(ps, { ...esp, serial: 'X1' })?.id).toBe('mine');
    expect(matchProfile(ps, { ...esp, serial: 'X2' })?.id).toBe('model');
    expect(matchProfile([P('mine', { ...esp, serial: 'X1' })], esp)).toBeNull();
  });
  it('ties go to the most recently saved', () => {
    expect(matchProfile([P('old', esp, 1), P('new', esp, 5), P('mid', esp, 3)], esp)?.id).toBe('new');
  });
  it('no device or no matching profile gives null; manual profiles never match', () => {
    expect(matchProfile([P('esp', esp)], null)).toBeNull();
    expect(matchProfile([P('manual', undefined)], esp)).toBeNull();
    expect(matchProfile([P('esp', esp)], { vid: 1, pid: 2 })).toBeNull();
  });
});

describe('export and import', () => {
  const sanitize = (raw: unknown) => (typeof raw === 'number' ? raw : null);

  it('round-trips names, model match and settings, dropping serial numbers', () => {
    const text = exportProfiles([{ id: 'a', name: 'Lab 3', match: { ...esp, serial: 'X1' }, settings: 42, updated: 7 }]);
    expect(text).not.toContain('X1');
    expect(parseProfiles(text, sanitize)).toEqual({ profiles: [{ name: 'Lab 3', match: esp, settings: 42 }], skipped: 0 });
  });

  it('skips entries with bad settings or no name, ignores a malformed match', () => {
    const text = JSON.stringify({
      format: 'someterm-profiles',
      version: 1,
      profiles: [{ name: 'ok', settings: 1, match: { vid: 'x', pid: 2 } }, { name: '', settings: 1 }, { name: 'bad', settings: 'nope' }, null],
    });
    expect(parseProfiles(text, sanitize)).toEqual({ profiles: [{ name: 'ok', settings: 1 }], skipped: 3 });
  });

  it('rejects files that are not profile files, or from a newer version', () => {
    expect(() => parseProfiles('{', sanitize)).toThrow('Not a JSON file');
    expect(() => parseProfiles('{"profiles":[]}', sanitize)).toThrow('Not a SomeTerm profile file');
    expect(() => parseProfiles('{"format":"someterm-profiles","version":99,"profiles":[]}', sanitize)).toThrow('newer');
  });

  it('imports files saved under the earlier name', () => {
    const text = JSON.stringify({ format: 'superserial-profiles', version: 1, profiles: [{ name: 'old', settings: 3 }] });
    expect(parseProfiles(text, sanitize)).toEqual({ profiles: [{ name: 'old', settings: 3 }], skipped: 0 });
  });
});

describe('uniqueName', () => {
  it('appends the first free number', () => {
    expect(uniqueName('ESP32', [])).toBe('ESP32');
    expect(uniqueName('ESP32', ['ESP32', 'ESP32 (2)'])).toBe('ESP32 (3)');
  });
});

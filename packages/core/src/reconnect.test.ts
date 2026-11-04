import { describe, expect, it } from 'vitest';
import { findReturningDevice } from './reconnect';

const esp = { vid: 0x303a, pid: 0x1001 };

describe('findReturningDevice', () => {
  it('serial number wins, even under a new path', () => {
    const target = { id: { ...esp, serial: 'A1' }, path: '/dev/ttyACM0' };
    expect(findReturningDevice(target, [{ id: { ...esp, serial: 'B2' }, path: '/dev/ttyACM0' }, { id: { ...esp, serial: 'A1' }, path: '/dev/ttyACM1' }])).toBe(1);
  });
  it('a different board of the same model is not taken when the serial is known', () => {
    expect(findReturningDevice({ id: { ...esp, serial: 'A1' } }, [{ id: { ...esp, serial: 'B2' } }])).toBe(-1);
  });
  it('without a serial, USB IDs match, preferring the old path', () => {
    const target = { id: esp, path: 'COM7' };
    expect(findReturningDevice(target, [{ id: esp, path: 'COM5' }, { id: esp, path: 'COM7' }])).toBe(1);
    expect(findReturningDevice(target, [{ id: { vid: 1, pid: 2 }, path: 'COM7' }, { id: esp, path: 'COM9' }])).toBe(1);
  });
  it('without USB identity, only the same path counts', () => {
    expect(findReturningDevice({ id: null, path: '/dev/ttyS0' }, [{ id: null, path: '/dev/ttyS1' }, { id: null, path: '/dev/ttyS0' }])).toBe(1);
    expect(findReturningDevice({ id: null }, [{ id: null, path: 'x' }])).toBe(-1);
  });
});

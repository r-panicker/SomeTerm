import type { DeviceId } from './profiles';

export interface PortIdentity {
  id: DeviceId | null;
  path?: string;
}

/**
 * Which candidate is the device that went away. A replugged board can come
 * back under a different path (ttyACM0 → ttyACM1, COM5 → COM7), so identity
 * wins over path: serial number when known, else USB IDs (same path preferred),
 * else the path alone. Returns -1 when none qualifies.
 */
export function findReturningDevice(target: PortIdentity, candidates: readonly PortIdentity[]): number {
  const t = target.id;
  if (t?.serial) return candidates.findIndex((c) => c.id?.vid === t.vid && c.id.pid === t.pid && c.id.serial === t.serial);
  if (t) {
    const same = candidates.map((c, i) => (c.id?.vid === t.vid && c.id.pid === t.pid ? i : -1)).filter((i) => i >= 0);
    return same.find((i) => target.path !== undefined && candidates[i]!.path === target.path) ?? same[0] ?? -1;
  }
  return target.path === undefined ? -1 : candidates.findIndex((c) => c.path === target.path);
}

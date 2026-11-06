/** USB identity of a port. `serial` is only available in the desktop app. */
export interface DeviceId {
  vid: number;
  pid: number;
  serial?: string;
}

export interface Profile<S> {
  id: string;
  name: string;
  /** Device this profile applies itself to; absent for manual-only profiles. */
  match?: DeviceId;
  settings: S;
  /** Epoch ms of the last save; breaks ties between equally good matches. */
  updated: number;
}

export const PROFILE_FILE_FORMAT = 'someterm-profiles';
const LEGACY_PROFILE_FORMAT = 'superserial-profiles';
export const PROFILE_FILE_VERSION = 1;

/**
 * The best profile for a device. A profile tied to a serial number matches only
 * that board; one with just USB IDs matches any board of that model. A serial
 * match beats a model match, and among equals the most recently saved wins.
 */
export function matchProfile<S>(profiles: readonly Profile<S>[], device: DeviceId | null): Profile<S> | null {
  if (!device) return null;
  let best: Profile<S> | null = null;
  let bestRank = 0;
  for (const p of profiles) {
    const m = p.match;
    if (!m || m.vid !== device.vid || m.pid !== device.pid) continue;
    let rank: number;
    if (m.serial !== undefined) {
      if (m.serial !== device.serial) continue;
      rank = 2;
    } else rank = 1;
    if (rank > bestRank || (rank === bestRank && best && p.updated > best.updated)) {
      best = p;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * File contents for sharing. Serial numbers are dropped: a profile handed out
 * for a lab should match every student's board of that model, not one board.
 */
export function exportProfiles<S>(profiles: readonly Profile<S>[]): string {
  return JSON.stringify(
    {
      format: PROFILE_FILE_FORMAT,
      version: PROFILE_FILE_VERSION,
      profiles: profiles.map((p) => ({
        name: p.name,
        ...(p.match && { match: { vid: p.match.vid, pid: p.match.pid } }),
        settings: p.settings,
      })),
    },
    null,
    2,
  );
}

export interface ImportedProfile<S> {
  name: string;
  match?: DeviceId;
  settings: S;
}

/**
 * Parses a profile file. `sanitize` turns untrusted settings into valid ones or
 * returns null to skip that profile. Throws with a readable message when the
 * file is not a profile file at all.
 */
export function parseProfiles<S>(text: string, sanitize: (raw: unknown) => S | null): { profiles: ImportedProfile<S>[]; skipped: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a JSON file');
  }
  const d = data as { format?: unknown; version?: unknown; profiles?: unknown };
  if (!d || (d.format !== PROFILE_FILE_FORMAT && d.format !== LEGACY_PROFILE_FORMAT) || !Array.isArray(d.profiles)) throw new Error('Not a SomeTerm profile file');
  if (typeof d.version !== 'number' || d.version > PROFILE_FILE_VERSION) throw new Error('Made by a newer SomeTerm; update to import it');
  const profiles: ImportedProfile<S>[] = [];
  let skipped = 0;
  for (const raw of d.profiles as unknown[]) {
    const r = raw as { name?: unknown; match?: { vid?: unknown; pid?: unknown }; settings?: unknown };
    const settings = sanitize(r?.settings);
    const name = typeof r?.name === 'string' ? r.name.trim().slice(0, 80) : '';
    if (!name || settings === null) {
      skipped++;
      continue;
    }
    const vid = r.match?.vid;
    const pid = r.match?.pid;
    const valid = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 0xffff;
    profiles.push({ name, settings, ...(valid(vid) && valid(pid) && { match: { vid, pid } }) });
  }
  return { profiles, skipped };
}

/** `name`, or `name (2)`, `name (3)`… so it does not clash with `taken`. */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(name)) return name;
  for (let i = 2; ; i++) if (!set.has(`${name} (${i})`)) return `${name} (${i})`;
}

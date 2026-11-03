import {
  NUM_TYPES,
  CHECKSUMS,
  exportProfiles,
  parseProfiles,
  uniqueName,
  type DeviceId,
  type NewlineMode,
  type Profile,
  type SerialOptions,
  compileExpr,
} from '@superserial/core';
import type { DisplaySettings } from './source';
import type { PlotTransform, SendOptions, Session, View } from './session.svelte';

/** What a profile carries. Repeat count and interval are left out: they describe one job, not a device. */
export interface ProfileSettings {
  options: SerialOptions;
  dtr: boolean;
  rts: boolean;
  newline: NewlineMode;
  echo: boolean;
  display: DisplaySettings;
  send: Pick<SendOptions, 'eol' | 'checksum' | 'byteDelayMs' | 'lineDelayMs' | 'rtsWhileSending'>;
  view: View;
  plotWindow: number;
  plotTransforms: Record<string, PlotTransform>;
  plotX: string | null;
}

export function settingsOf(s: Session): ProfileSettings {
  const o = s.sendOptions;
  return {
    options: $state.snapshot(s.options),
    dtr: s.dtr,
    rts: s.rts,
    newline: s.newline,
    echo: s.echo,
    display: $state.snapshot(s.display),
    send: { eol: o.eol, checksum: o.checksum, byteDelayMs: o.byteDelayMs, lineDelayMs: o.lineDelayMs, rtsWhileSending: o.rtsWhileSending },
    view: s.view,
    plotWindow: s.plotWindow,
    plotTransforms: $state.snapshot(s.plotTransforms),
    plotX: s.plotX,
  };
}

export function applySettings(s: Session, p: ProfileSettings): void {
  Object.assign(s.options, p.options);
  s.dtr = p.dtr;
  s.rts = p.rts;
  if (p.newline !== s.newline) s.setNewline(p.newline);
  s.echo = p.echo;
  Object.assign(s.display, p.display);
  Object.assign(s.sendOptions, p.send);
  s.chooseView(p.view);
  s.plotWindow = p.plotWindow;
  s.plotTransforms = { ...p.plotTransforms };
  s.plotX = p.plotX;
}

/** Keeps only transforms whose expression compiles; an imported file cannot smuggle in anything else. */
export function sanitizeTransforms(raw: unknown): Record<string, PlotTransform> {
  const out: Record<string, PlotTransform> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, t] of Object.entries(raw as Record<string, { expr?: unknown; unit?: unknown }>)) {
    const expr = typeof t?.expr === 'string' ? t.expr.slice(0, 200) : '';
    const unit = typeof t?.unit === 'string' ? t.unit.slice(0, 16) : '';
    if (name.length > 64 || (!expr && !unit)) continue;
    if (expr) {
      try { compileExpr(expr); } catch { continue; }
    }
    out[name] = { expr, unit };
  }
  return out;
}

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const int = (v: unknown, min: number, max: number, fallback: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : fallback;

/**
 * Turns untrusted settings (an imported file) into valid ones. Anything missing
 * or out of range falls back to the default; only an unusable baud rate rejects
 * the profile outright, since that is the one setting it cannot do without.
 */
export function sanitizeSettings(raw: unknown): ProfileSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, Record<string, unknown> | undefined> & Record<string, unknown>;
  const o = (r.options ?? {}) as Record<string, unknown>;
  const baudRate = int(o.baudRate, 50, 20_000_000, -1);
  if (baudRate < 0) return null;
  const d = (r.display ?? {}) as Record<string, unknown>;
  const s = (r.send ?? {}) as Record<string, unknown>;
  return {
    options: {
      baudRate,
      dataBits: pick(o.dataBits, [5, 6, 7, 8] as const, 8),
      stopBits: pick(o.stopBits, [1, 1.5, 2] as const, 1),
      parity: pick(o.parity, ['none', 'even', 'odd', 'mark', 'space'] as const, 'none'),
      flowControl: pick(o.flowControl, ['none', 'rtscts', 'dsrdtr', 'xonxoff'] as const, 'none'),
    },
    dtr: bool(r.dtr, true),
    rts: bool(r.rts, true),
    newline: pick(r.newline, ['auto', 'lf', 'cr', 'crlf'] as const, 'auto'),
    echo: bool(r.echo, true),
    display: {
      format: pick(d.format, ['ascii', 'hex', 'dec', 'bin', 'num'] as const, 'ascii'),
      numType: pick(d.numType, NUM_TYPES.map((n) => n.type), 'int16'),
      littleEndian: bool(d.littleEndian, true),
      align: int(d.align, 0, 7, 0),
      stamps: bool(d.stamps, false),
      ansi: bool(d.ansi, true),
    },
    send: {
      eol: pick(s.eol, ['\\r\\n', '\\n', '\\r', ''], '\\r\\n'),
      checksum: pick(s.checksum, CHECKSUMS.map((c) => c.kind), 'none'),
      byteDelayMs: int(s.byteDelayMs, 0, 60_000, 0),
      lineDelayMs: int(s.lineDelayMs, 0, 60_000, 0),
      rtsWhileSending: bool(s.rtsWhileSending, false),
    },
    view: pick(r.view, ['terminal', 'split', 'plot'] as const, 'terminal'),
    plotWindow: int(r.plotWindow, 0, 86_400, 30),
    plotTransforms: sanitizeTransforms(r.plotTransforms),
    plotX: ((x: unknown) => (typeof x === 'string' && x.length <= 64 ? x : null))((raw as Record<string, unknown>).plotX),
  };
}

const STORAGE_KEY = 'superserial.profiles.v1';
const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** All saved profiles, shared by every tab. */
class ProfileStore {
  list = $state<Profile<ProfileSettings>[]>([]);

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Profile<ProfileSettings>[];
      this.list = raw.flatMap((p) => {
        const settings = sanitizeSettings(p?.settings);
        return settings && typeof p.name === 'string' ? [{ ...p, settings }] : [];
      });
    } catch {
      this.list = [];
    }
  }

  get(id: string | null): Profile<ProfileSettings> | undefined {
    return id ? this.list.find((p) => p.id === id) : undefined;
  }

  create(name: string, settings: ProfileSettings, match?: DeviceId): Profile<ProfileSettings> {
    const p: Profile<ProfileSettings> = {
      id: newId(),
      name: uniqueName(name.trim() || 'Profile', this.list.map((x) => x.name)),
      settings,
      updated: Date.now(),
      ...(match && { match }),
    };
    this.list.push(p);
    this.persist();
    return p;
  }

  update(id: string, settings: ProfileSettings): void {
    const p = this.get(id);
    if (!p) return;
    p.settings = settings;
    p.updated = Date.now();
    this.persist();
  }

  rename(id: string, name: string): void {
    const p = this.get(id);
    const n = name.trim();
    if (!p || !n || n === p.name) return;
    p.name = uniqueName(n, this.list.filter((x) => x !== p).map((x) => x.name));
    this.persist();
  }

  forgetDevice(id: string): void {
    const p = this.get(id);
    if (!p) return;
    delete p.match;
    this.persist();
  }

  remove(id: string): void {
    this.list = this.list.filter((p) => p.id !== id);
    this.persist();
  }

  exportText(ids?: string[]): string {
    return exportProfiles(ids ? this.list.filter((p) => ids.includes(p.id)) : this.list);
  }

  /** Adds every valid profile from a file, renaming on clashes. Throws with a readable message for a bad file. */
  importText(text: string): { added: number; skipped: number } {
    const { profiles, skipped } = parseProfiles(text, sanitizeSettings);
    for (const p of profiles) this.create(p.name, p.settings, p.match);
    return { added: profiles.length, skipped };
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(this.list)));
    } catch {
      /* storage unavailable; profiles last for this session only */
    }
  }
}

export const profiles = new ProfileStore();

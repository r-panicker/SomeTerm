import type { SerialOptions } from '@superserial/core';
import { Monitor } from './monitor.svelte';
import { Session, native, type PortChoice, type SendOptions, type View } from './session.svelte';

const STORAGE_KEY = 'superserial.workspace.v1';

/** What is restored on launch. Kept apart from device profiles, which may later apply settings on top. */
interface SavedTab {
  choice: { kind: 'loopback' | 'add' } | { kind: 'native'; path: string; label: string } | { kind: 'webserial'; vid?: number; pid?: number };
  options: SerialOptions;
  sendOptions: SendOptions;
  view: View;
  echo: boolean;
  newline: Session['newline'];
  forwardTo: string | null;
  profileId?: string | null;
  display?: Session['display'];
  plotWindow?: number;
  dtr?: boolean;
  rts?: boolean;
}

interface Saved {
  tabs: SavedTab[];
  active: string;
}

/** All open tabs plus the merged Monitor. `active` is a session letter or 'monitor'. */
export class Workspace {
  sessions = $state<Session[]>([]);
  active = $state<string>('A');
  readonly monitor = new Monitor(() => this.sessions.some((s) => s.open));
  private nextId = 0;

  get current(): Session | null {
    return this.sessions.find((s) => s.letter === this.active) ?? null;
  }

  add(): Session {
    const used = new Set(this.sessions.map((s) => s.letter));
    let code = 65;
    while (used.has(String.fromCharCode(code))) code++;
    const s = new Session(this.nextId++, String.fromCharCode(code));
    this.monitor.register(s.id, s.letter);
    this.sessions.push(s);
    this.wireMonitor();
    this.active = s.letter;
    return s;
  }

  async close(s: Session): Promise<void> {
    if (this.sessions.length === 1) return;
    const i = this.sessions.indexOf(s);
    for (const o of this.sessions) if (o.forwardTo === s) o.forwardTo = null;
    this.sessions.splice(i, 1);
    this.wireMonitor();
    if (this.active === s.letter) this.active = this.sessions[Math.max(0, i - 1)]!.letter;
    await s.dispose();
  }

  /** The Monitor only exists with two or more tabs; a lone tab pays nothing for it. */
  private wireMonitor(): void {
    const on = this.sessions.length > 1;
    for (const s of this.sessions) s.onLine = on ? (line) => this.monitor.add(s.id, line) : null;
  }

  /** The tab that has this port open, other than `self`. */
  holder(choice: PortChoice, self: Session): Session | undefined {
    const key = self.portKey(choice);
    return key === null ? undefined : this.sessions.find((o) => o !== self && o.open && o.portKey() === key);
  }

  cycle(dir: 1 | -1): void {
    const order = [...this.sessions.map((s) => s.letter), ...(this.sessions.length > 1 ? ['monitor'] : [])];
    const i = order.indexOf(this.active);
    this.active = order[(i + dir + order.length) % order.length]!;
  }

  snapshot(): string {
    const tabs: SavedTab[] = this.sessions.map((s) => ({
      choice: saveChoice(s.choice),
      options: $state.snapshot(s.options),
      sendOptions: $state.snapshot(s.sendOptions),
      view: s.view,
      echo: s.echo,
      newline: s.newline,
      forwardTo: s.forwardTo?.letter ?? null,
      profileId: s.profileId,
      display: $state.snapshot(s.display),
      plotWindow: s.plotWindow,
      dtr: s.dtr,
      rts: s.rts,
    }));
    return JSON.stringify({ tabs, active: this.active } satisfies Saved);
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, this.snapshot());
    } catch {
      /* storage unavailable (private window); restoring is a convenience only */
    }
  }

  /**
   * Recreates saved tabs and their settings without connecting: opening a port
   * toggles DTR, which resets many boards, so that stays the user's decision.
   */
  async restore(): Promise<void> {
    let saved: Saved | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      saved = null;
    }
    if (!saved?.tabs?.length) {
      await this.add().refreshPorts();
      return;
    }
    for (const t of saved.tabs) {
      const s = this.add();
      // Port first: refreshing may default to a port and apply its profile, which the saved settings must then override.
      await s.refreshPorts();
      const c = await loadChoice(t.choice, s);
      if (c) s.choosePort(c, true);
      Object.assign(s.options, t.options);
      Object.assign(s.sendOptions, t.sendOptions);
      s.echo = t.echo;
      if (t.display) Object.assign(s.display, t.display);
      if (t.plotWindow !== undefined) s.plotWindow = t.plotWindow;
      if (t.dtr !== undefined) s.dtr = t.dtr;
      if (t.rts !== undefined) s.rts = t.rts;
      if (t.newline !== s.newline) s.setNewline(t.newline);
      if (t.view !== 'terminal') s.chooseView(t.view);
      s.profileId = t.profileId ?? null;
    }
    saved.tabs.forEach((t, i) => {
      if (t.forwardTo) this.sessions[i]!.forwardTo = this.sessions.find((o) => o.letter === t.forwardTo) ?? null;
    });
    this.active = saved.active === 'monitor' && this.sessions.length > 1 ? 'monitor' : (this.sessions.find((s) => s.letter === saved.active) ?? this.sessions[0]!).letter;
  }
}

function saveChoice(c: PortChoice): SavedTab['choice'] {
  if (c.kind === 'native') return { kind: 'native', path: c.path, label: c.label };
  if (c.kind === 'webserial') {
    const { usbVendorId: vid, usbProductId: pid } = c.port.getInfo();
    return { kind: 'webserial', vid, pid };
  }
  return { kind: c.kind };
}

/** Web Serial ports have no stable name, so a saved one is matched by USB IDs, and only if exactly one granted port matches. */
async function loadChoice(c: SavedTab['choice'], s: Session): Promise<PortChoice | null> {
  if (c.kind === 'loopback') return { kind: 'loopback' };
  if (c.kind === 'native' && native) return { kind: 'native', path: c.path, label: s.nativePorts.find((p) => p.path === c.path)?.label ?? c.path };
  if (c.kind === 'webserial' && !native) {
    const matches = s.granted.filter((p) => {
      const i = p.getInfo();
      return i.usbVendorId === c.vid && i.usbProductId === c.pid;
    });
    return matches.length === 1 ? { kind: 'webserial', port: matches[0]! } : null;
  }
  return null;
}

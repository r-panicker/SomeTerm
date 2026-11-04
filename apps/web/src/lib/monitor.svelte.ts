import { TerminalLog, formatStamp, type TermLine } from '@superserial/core';
import { prefs } from './prefs.svelte';
import { CaptureController } from './capture.svelte';
import { defaultDisplay, type DisplaySettings, type TermSource } from './source';

export const PORT_COLORS = ['#2563eb', '#e8590c', '#2b9348', '#c2255c', '#7048e8', '#0c8599', '#b08900', '#5c7cfa'];

const utf8 = new TextEncoder();

/** One timeline merging every port's received and sent lines, tagged by port. */
export class Monitor implements TermSource {
  readonly log = new TerminalLog(() => prefs.scrollback);
  readonly partial = null;
  version = $state(0);
  display = $state<DisplaySettings>(defaultDisplay());
  errors = $state(0);
  lastError = $state('');
  readonly capture = new CaptureController((m) => { this.errors++; this.lastError = m; });
  /** Indexed by session id; entries outlive closed tabs so their old lines keep their tag. */
  sources = $state<{ label: string; color: string }[]>([]);
  private scheduled = false;

  constructor(private readonly anyOpen: () => boolean) {}

  get open(): boolean {
    return this.anyOpen();
  }

  register(id: number, letter: string): void {
    this.sources[id] = { label: letter, color: PORT_COLORS[(letter.charCodeAt(0) - 65) % PORT_COLORS.length]! };
  }

  add(id: number, line: TermLine): void {
    this.log.pushByTime({ ...line, src: id });
    if (this.capture.active) {
      const tag = this.sources[id]?.label ?? '?';
      this.capture.rx(utf8.encode(`${formatStamp(performance.timeOrigin + line.time)} ${tag} ${line.dir.toUpperCase()} ${line.text}\n`), Date.now());
    }
    this.changed();
  }

  clear(): void {
    this.log.clear();
    this.changed();
  }

  wallClock(t: number): Date {
    return new Date(performance.timeOrigin + t);
  }

  private changed(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.version++;
    });
  }
}

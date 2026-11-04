import type { ByteRing, NewlineMode, NumType, RxBatch, TerminalLog } from '@superserial/core';

export type DisplayFormat = 'ascii' | 'hex' | 'dec' | 'bin' | 'num';

/** How the terminal draws a source; owned by the source so profiles and restore can set it. */
export interface DisplaySettings {
  format: DisplayFormat;
  numType: NumType;
  littleEndian: boolean;
  align: number;
  stamps: boolean;
  ansi: boolean;
  /** Show every control and non-ASCII byte as a token, line endings included. */
  ctrl: boolean;
}

export const defaultDisplay = (): DisplaySettings => ({ format: 'ascii', numType: 'int16', littleEndian: true, align: 0, stamps: false, ansi: true, ctrl: false });

/** What the terminal view needs from whatever feeds it: one port, or several merged. */
export interface TermSource {
  readonly log: TerminalLog;
  readonly partial: RxBatch['partial'];
  readonly version: number;
  readonly open: boolean;
  clear(): void;
  wallClock(t: number): Date;
  readonly display: DisplaySettings;
  /** Raw received bytes for the Hex/Dec/Bin/Num views; absent for merged views. */
  readonly ring?: ByteRing;
  readonly hexStart?: number;
  readonly newline?: NewlineMode;
  setNewline?(mode: NewlineMode): void;
  echo?: boolean;
  /** Labels and colours for `TermLine.src`, in views that merge ports. */
  readonly sources?: readonly { label: string; color: string }[];
}

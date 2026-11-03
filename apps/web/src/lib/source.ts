import type { ByteRing, NewlineMode, RxBatch, TerminalLog } from '@superserial/core';

/** What the terminal view needs from whatever feeds it: one port, or several merged. */
export interface TermSource {
  readonly log: TerminalLog;
  readonly partial: RxBatch['partial'];
  readonly version: number;
  readonly open: boolean;
  clear(): void;
  wallClock(t: number): Date;
  /** Raw received bytes for the Hex/Dec/Bin/Num views; absent for merged views. */
  readonly ring?: ByteRing;
  readonly hexStart?: number;
  readonly newline?: NewlineMode;
  setNewline?(mode: NewlineMode): void;
  echo?: boolean;
  /** Labels and colours for `TermLine.src`, in views that merge ports. */
  readonly sources?: readonly { label: string; color: string }[];
}

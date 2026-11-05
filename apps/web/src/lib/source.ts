import type { ByteRing, NewlineMode, NumType, RxBatch, TerminalLog } from '@superserial/core';

export type DisplayFormat = 'ascii' | 'hex' | 'dec' | 'bin' | 'num' | 'screen';

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
  /** Bytes per row in Hex, Dec and Int/Float; Bin shows half as many. */
  perRow: number;
  /** Long lines continue on the next row instead of scrolling sideways. */
  wrap: boolean;
}

export const defaultDisplay = (): DisplaySettings => ({ format: 'ascii', numType: 'int16', littleEndian: true, align: 0, stamps: false, ansi: true, ctrl: false, perRow: 16, wrap: false });

/** What the terminal view needs from whatever feeds it: one port, or several merged. */
export interface TermSource {
  readonly log: TerminalLog;
  readonly partial: RxBatch['partial'];
  readonly version: number;
  readonly open: boolean;
  clear(): void;
  wallClock(t: number): Date;
  readonly display: DisplaySettings;
  /** Raw received bytes for the Hex/Dec/Bin/Int/Float views; absent for merged views. */
  readonly ring?: ByteRing;
  readonly hexStart?: number;
  readonly newline?: NewlineMode;
  setNewline?(mode: NewlineMode): void;
  echo?: boolean;
  /** Terminal mode: send keystrokes straight to the port. Absent where nothing can be sent. */
  typeKeys?(bytes: Uint8Array, key: 'text' | 'enter' | 'backspace' | 'other', text?: string): void;
  /** Typed but not yet entered, shown inline when local echo is on. */
  readonly typed?: string;
  localEcho?: boolean;
  typeToDevice?: boolean;
  /** Auto-reply rules, for the toolbar indicator; absent where nothing can be sent. */
  readonly autoReplies?: readonly { enabled: boolean }[];
  /** Labels and colours for `TermLine.src`, in views that merge ports. */
  readonly sources?: readonly { label: string; color: string }[];
}

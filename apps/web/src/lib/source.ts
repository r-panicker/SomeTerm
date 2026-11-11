import type { ByteRing, FrameIndex, NewlineMode, NumType, RxBatch, TerminalLog } from '@someterm/core';

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
  /** xterm view: a received CR also starts a new line, for devices that end lines with CR alone. */
  crNewline: boolean;
  /** Byte views: start a new row only at the row width, after an idle gap, or at a sync pattern. */
  frame: 'none' | 'gap' | 'sync';
  frameGapMs: number;
  /** Hex bytes, as typed. */
  frameSync: string;
}

export const defaultDisplay = (): DisplaySettings => ({ format: 'ascii', numType: 'int16', littleEndian: true, align: 0, stamps: false, ansi: true, ctrl: false, perRow: 16, wrap: false, crNewline: false, frame: 'none', frameGapMs: 5, frameSync: '' });

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
  /** Frame boundaries for the byte views, when the Display tab cuts rows into frames. */
  frameIndex?(): FrameIndex | null;
  frameFrom?(): number;
  readonly newline?: NewlineMode;
  setNewline?(mode: NewlineMode): void;
  echo?: boolean;
  /** Terminal mode: send keystrokes straight to the port. Absent where nothing can be sent. */
  typeKeys?(bytes: Uint8Array, key: 'text' | 'enter' | 'backspace' | 'other', text?: string): void;
  /** Pasted text, sent paced as one job when it has several lines. */
  pasteText?(text: string): void;
  /** Typed but not yet entered, and the part of it local echo showed. */
  readonly typed?: string;
  readonly echoed?: string;
  localEcho?: boolean;
  typeToDevice?: boolean;
  /** Auto-reply rules, for the toolbar indicator; absent where nothing can be sent. */
  readonly autoReplies?: readonly { enabled: boolean }[];
  /** Labels and colours for `TermLine.src`, in views that merge ports. */
  readonly sources?: readonly { label: string; color: string }[];
}

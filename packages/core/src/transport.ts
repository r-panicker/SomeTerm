export type DataBits = 5 | 6 | 7 | 8;
export type StopBits = 1 | 1.5 | 2;
export type Parity = 'none' | 'even' | 'odd' | 'mark' | 'space';
export type FlowControl = 'none' | 'rtscts' | 'dsrdtr' | 'xonxoff';

export interface SerialOptions {
  baudRate: number;
  dataBits: DataBits;
  stopBits: StopBits;
  parity: Parity;
  flowControl: FlowControl;
}

/** What a driver can actually do. The UI disables controls using these flags. */
export interface TransportCapabilities {
  markSpaceParity: boolean;
  dsrDtrFlow: boolean;
  xonXoffFlow: boolean;
  oneAndHalfStopBits: boolean;
  fiveSixDataBits: boolean;
  portMetadata: boolean;
  sendBreak: boolean;
  lineSignals: boolean;
  /** Whether getSignals() reports RI; some drivers never do. */
  ringIndicator: boolean;
}

export interface OutputSignals {
  dtr?: boolean;
  rts?: boolean;
}

export interface InputSignals {
  cts: boolean;
  dsr: boolean;
  dcd: boolean;
  ri: boolean;
}

export type TransportState = 'closed' | 'open';
export type Unsubscribe = () => void;

export interface SerialTransport {
  readonly capabilities: TransportCapabilities;
  readonly state: TransportState;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  setSignals(signals: OutputSignals): Promise<void>;
  getSignals(): Promise<InputSignals>;
  sendBreak(durationMs: number): Promise<void>;
  /** `timestamp` is performance.now()-style milliseconds taken at receipt. */
  onData(listener: (chunk: Uint8Array, timestamp: number) => void): Unsubscribe;
  onError(listener: (error: Error) => void): Unsubscribe;
  onClose(listener: () => void): Unsubscribe;
  /** Events worth a line in the terminal but not errors, such as a client connecting to a server. */
  onNotice?(listener: (text: string) => void): Unsubscribe;
}

/** Returns one reason per option the transport cannot honour; empty means all supported. */
export function unsupportedOptions(
  caps: TransportCapabilities,
  o: SerialOptions,
): string[] {
  const out: string[] = [];
  if ((o.parity === 'mark' || o.parity === 'space') && !caps.markSpaceParity)
    out.push(`${o.parity} parity is not available on this transport`);
  if (o.flowControl === 'dsrdtr' && !caps.dsrDtrFlow)
    out.push('DSR/DTR flow control is not available on this transport');
  if (o.flowControl === 'xonxoff' && !caps.xonXoffFlow)
    out.push('XON/XOFF flow control is not available on this transport');
  if (o.stopBits === 1.5 && !caps.oneAndHalfStopBits)
    out.push('1.5 stop bits are not available on this transport');
  if ((o.dataBits === 5 || o.dataBits === 6) && !caps.fiveSixDataBits)
    out.push(`${o.dataBits} data bits are not available on this transport`);
  return out;
}

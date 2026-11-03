/** In-memory stand-in for a Web Serial `SerialPort`, for tests only. */
export class FakeSerialPort {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  written: number[] = [];
  signalLog: SerialOutputSignals[] = [];
  inputSignals: SerialInputSignals = {
    clearToSend: false, dataSetReady: false, dataCarrierDetect: false, ringIndicator: false,
  };
  openedWith: SerialOptions | null = null;
  closed = false;
  private ctl: ReadableStreamDefaultController<Uint8Array> | null = null;

  getInfo(): SerialPortInfo {
    return { usbVendorId: 0x2341, usbProductId: 0x0043 };
  }

  async open(o: SerialOptions): Promise<void> {
    this.openedWith = o;
    this.closed = false;
    this.freshReadable();
    this.writable = new WritableStream({ write: (c) => void this.written.push(...c) });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.readable = null;
    this.writable = null;
  }

  async setSignals(s: SerialOutputSignals): Promise<void> {
    this.signalLog.push({ ...s });
  }

  async getSignals(): Promise<SerialInputSignals> {
    return { ...this.inputSignals };
  }

  receive(bytes: number[]): void {
    this.ctl!.enqueue(Uint8Array.from(bytes));
  }

  /** Mimics a parity/framing error: current readable errors, a new one replaces it. */
  lineError(message: string): void {
    const old = this.ctl!;
    this.freshReadable();
    old.error(new Error(message));
  }

  /** Mimics unplugging: readable errors and is not replaced. */
  unplug(): void {
    const old = this.ctl!;
    this.readable = null;
    old.error(new Error('The device has been lost.'));
  }

  private freshReadable(): void {
    this.readable = new ReadableStream<Uint8Array>({ start: (c) => void (this.ctl = c) });
  }
}

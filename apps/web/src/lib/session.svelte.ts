import {
  ByteRing,
  Capture,
  frame,
  repeatSend,
  sendPaced,
  type CancelToken,
  type ChecksumKind,
  type CaptureOptions,
  FULL_CAPABILITIES,
  LineSplitter,
  LoopbackTransport,
  SeriesStore,
  TerminalLog,
  parseNumericLine,
  toAscii,
  type InputSignals,
  type NewlineMode,
  type SerialOptions,
  type SerialTransport,
  type TransportCapabilities,
} from '@superserial/core';
import {
  WEB_SERIAL_CAPABILITIES,
  WebSerialTransport,
  describePort,
  grantedWebSerialPorts,
  isWebSerialAvailable,
  requestWebSerialPort,
} from '@superserial/transport-webserial';
import type { NativePortSummary, NativeSerialBridge } from '@superserial/transport-node/bridge';
import { IpcSerialTransport } from '@superserial/transport-node/ipc-client';
import { FileSink, MemorySink } from './sinks';

/** Present when running inside the Electron app; serial I/O then goes through Node, not Web Serial. */
export const native = (globalThis as { superserialNative?: NativeSerialBridge }).superserialNative;

export type PortChoice =
  | { kind: 'loopback' }
  | { kind: 'webserial'; port: SerialPort }
  | { kind: 'add' }
  | { kind: 'native'; path: string; label: string };
export type View = 'terminal' | 'split' | 'plot';

export interface SendOptions {
  checksum: ChecksumKind;
  byteDelayMs: number;
  lineDelayMs: number;
  /** 1 = once, 0 = until stopped. */
  repeat: number;
  intervalMs: number;
  /** Raise RTS for the duration of each send (RS-485 style direction control). */
  rtsWhileSending: boolean;
}

export interface SendJob {
  kind: 'paced' | 'repeat' | 'file';
  label: string;
  done: number;
  total: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface CaptureInfo {
  name: string;
  kind: 'file' | 'memory';
  state: 'running' | 'paused' | 'stopped';
  captured: number;
  written: number;
  startedAt: number;
  reason: string;
}

const RING_BYTES = 4 << 20;
const SIGNAL_POLL_MS = 100;

const now = () => performance.now();

/**
 * One connection and everything derived from its stream. Bulk data (log, ring,
 * series) is plain, not reactive; `version` ticks at most once per frame so views
 * redraw per frame rather than per chunk.
 */
export class Session {
  options = $state<SerialOptions>({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
  choice = $state<PortChoice>(!native && isWebSerialAvailable() ? { kind: 'add' } : { kind: 'loopback' });
  granted = $state<SerialPort[]>([]);
  nativePorts = $state<NativePortSummary[]>([]);
  private portChosen = false;
  open = $state(false);
  busy = $state(false);
  version = $state(0);
  rx = $state(0);
  tx = $state(0);
  rate = $state(0);
  errors = $state(0);
  lastError = $state('');
  dtr = $state(true);
  rts = $state(true);
  /** False when the open port has no modem control lines (ptys, many virtual ports). */
  lineControl = $state(true);
  signals = $state<InputSignals | null>(null);
  view = $state<View>('terminal');
  echo = $state(true);
  newline = $state<NewlineMode>('auto');
  capture = $state<CaptureInfo | null>(null);
  sendOptions = $state<SendOptions>({ checksum: 'none', byteDelayMs: 0, lineDelayMs: 0, repeat: 1, intervalMs: 1000, rtsWhileSending: false });
  job = $state<SendJob | null>(null);
  private token: CancelToken | null = null;
  private cap: Capture | null = null;
  private capSink: FileSink | MemorySink | null = null;
  private capTimer: ReturnType<typeof setInterval> | null = null;

  readonly log = new TerminalLog();
  readonly ring = new ByteRing(RING_BYTES);
  readonly series = new SeriesStore();
  /** Stream offset where the hex view starts; moved by Clear. */
  hexStart = 0;
  /** Time origin for the plot's x axis. */
  t0 = 0;

  private transport: SerialTransport | null = null;
  private splitter = new LineSplitter('auto');
  private offs: (() => void)[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private scheduled = false;
  private viewChosen = false;
  private partialText = '';
  private partialTime = 0;
  private partialOffset = 0;

  get capabilities(): TransportCapabilities {
    if (this.choice.kind === 'loopback') return FULL_CAPABILITIES;
    return this.choice.kind === 'native' && native ? native.capabilities : WEB_SERIAL_CAPABILITIES;
  }

  get partial(): { text: string; time: number; offset: number } | null {
    return this.partialText ? { text: this.partialText, time: this.partialTime, offset: this.partialOffset } : null;
  }

  portLabel(c: PortChoice = this.choice): string {
    if (c.kind === 'native') return c.label;
    return c.kind === 'loopback' ? 'Loopback' : c.kind === 'add' ? 'Add port…' : describePort(c.port);
  }

  async refreshPorts(): Promise<void> {
    if (!native) {
      this.granted = await grantedWebSerialPorts();
      return;
    }
    const ports = await native.list().catch(() => this.nativePorts);
    if (JSON.stringify(ports) !== JSON.stringify(this.nativePorts)) this.nativePorts = ports;
    // Until the user picks, default to the first real port rather than Loopback.
    if (!this.portChosen && !this.open && this.choice.kind === 'loopback' && ports[0]) {
      this.choice = { kind: 'native', ...ports[0] };
    }
  }

  choosePort(c: PortChoice): void {
    this.choice = c;
    this.portChosen = true;
  }

  chooseView(v: View): void {
    this.view = v;
    this.viewChosen = true;
  }

  async connect(): Promise<void> {
    this.busy = true;
    try {
      let t: SerialTransport;
      if (this.choice.kind === 'loopback') t = new LoopbackTransport({}, now);
      else if (this.choice.kind === 'native' && native) t = new IpcSerialTransport(native, this.choice.path, now);
      else if (this.choice.kind === 'webserial') t = new WebSerialTransport(this.choice.port, now);
      else {
        const w = await requestWebSerialPort();
        await this.refreshPorts();
        this.choice = { kind: 'webserial', port: this.granted.find((p) => p === w.port) ?? w.port };
        t = w;
      }
      this.offs = [
        t.onData((c, ts) => this.receive(c, ts)),
        t.onError((e) => { this.errors++; this.lastError = e.message; }),
        t.onClose(() => this.closed()),
      ];
      try {
        await t.open($state.snapshot(this.options));
        // Make the shown DTR/RTS state the real one rather than the driver's default.
        this.lineControl = await t.setSignals({ dtr: this.dtr, rts: this.rts }).then(() => true, () => false);
      } catch (e) {
        this.offs.forEach((f) => f());
        this.offs = [];
        if (t.state === 'open') await t.close();
        throw e;
      }
      this.transport = t;
      this.open = true;
      if (!this.t0) this.t0 = now();
      this.startTimers();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) {
        this.errors++;
        this.lastError = (e as Error).message;
      }
    } finally {
      this.busy = false;
    }
  }

  async disconnect(): Promise<void> {
    this.busy = true;
    try {
      await this.transport?.close();
    } finally {
      this.busy = false;
    }
  }

  /** Sends payload + checksum + suffix, honouring repeat, pacing and RTS options. */
  async sendMessage(payload: Uint8Array, suffix: Uint8Array): Promise<void> {
    if (!this.transport || this.job) return;
    const bytes = frame(payload, this.sendOptions.checksum, suffix);
    if (!bytes.length) return;
    const o = this.sendOptions;
    const paced = o.byteDelayMs > 0 || o.lineDelayMs > 0;
    if (o.repeat === 1) {
      if (paced) await this.runJob({ kind: 'paced', label: 'Sending', done: 0, total: bytes.length }, (t) => this.transmit(bytes, t, (n) => this.progress(n)));
      else await this.transmit(bytes, { cancelled: false });
      return;
    }
    await this.runJob({ kind: 'repeat', label: 'Repeat', done: 0, total: o.repeat }, (t) =>
      repeatSend(o.repeat, o.intervalMs, () => this.transmit(bytes, t), sleep, now, t, (n) => this.progress(n)).then(() => {}),
    );
  }

  async sendFile(file: File): Promise<void> {
    if (!this.transport || this.job) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await this.runJob({ kind: 'file', label: file.name, done: 0, total: bytes.length }, (t) =>
      this.transmit(bytes, t, (n) => this.progress(n), `⟨${file.name}, ${bytes.length} B⟩`),
    );
  }

  cancelJob(): void {
    if (this.token) this.token.cancelled = true;
  }

  private progress(n: number): void {
    if (this.job) this.job.done = n;
  }

  private async runJob(job: SendJob, body: (t: CancelToken) => Promise<void>): Promise<void> {
    const token: CancelToken = { cancelled: false };
    this.token = token;
    this.job = job;
    try {
      await body(token);
    } catch (e) {
      this.errors++;
      this.lastError = `Send: ${(e as Error).message}`;
    } finally {
      this.job = null;
      this.token = null;
    }
  }

  /** One transmission: echo, optional RTS framing, paced writes with capture of each piece. */
  private async transmit(bytes: Uint8Array, token: CancelToken, onProgress?: (n: number) => void, echoText?: string): Promise<void> {
    const t = this.transport;
    if (!t) return;
    // Echo happens before the write so it precedes any reply it provokes.
    if (this.echo) {
      this.log.push({ dir: 'tx', text: echoText ?? echoLine(bytes), time: now(), offset: -1 });
      this.changed();
    }
    const o = this.sendOptions;
    const rts = o.rtsWhileSending;
    if (rts) await t.setSignals({ rts: true });
    const started = now();
    let sent = 0;
    try {
      sent = await sendPaced(bytes, o, async (piece) => {
        this.cap?.tx(piece, Date.now());
        await t.write(piece);
        this.tx += piece.length;
      }, sleep, token, onProgress);
    } finally {
      if (rts && t.state === 'open') {
        // write() resolves when the driver has the data, not when it is on the wire.
        const airtime = (sent * this.bitsPerChar() * 1000) / this.options.baudRate;
        const wait = started + airtime - now();
        if (wait > 0) await sleep(wait + 1);
        await t.setSignals({ rts: this.rts });
      }
    }
  }

  private bitsPerChar(): number {
    const o = this.options;
    return 1 + o.dataBits + (o.parity === 'none' ? 0 : 1) + o.stopBits;
  }

  async setLine(which: 'dtr' | 'rts', value: boolean): Promise<void> {
    if (!this.transport) return;
    await this.transport.setSignals({ [which]: value });
    this[which] = value;
  }

  async sendBreak(ms = 250): Promise<void> {
    await this.transport?.sendBreak(ms);
  }

  setNewline(mode: NewlineMode): void {
    this.newline = mode;
    this.splitter = new LineSplitter(mode);
    this.partialText = '';
    this.changed();
  }

  clear(): void {
    this.log.clear();
    this.series.clear();
    this.hexStart = this.ring.end;
    this.partialText = '';
    this.errors = 0;
    this.lastError = '';
    this.t0 = now();
    this.changed();
  }

  /**
   * Starts a capture. For a file, opens the save dialog, so call from a user gesture.
   * Returns false if the user cancelled the dialog.
   */
  async startCapture(options: CaptureOptions, dest: 'file' | 'memory', append: boolean): Promise<boolean> {
    if (this.cap && this.cap.state !== 'stopped') return false;
    const name = `superserial-${stampForName(new Date())}.txt`;
    let sink: FileSink | MemorySink;
    try {
      const f = dest === 'file' ? await FileSink.pick(name, append) : new MemorySink(name);
      if (!f) return false;
      sink = f;
    } catch (e) {
      this.errors++;
      this.lastError = `Capture: ${(e as Error).message}`;
      return false;
    }
    this.capSink = sink;
    const cap = new Capture(sink, { ...options, newline: this.newline }, Date.now(), () => this.syncCapture());
    this.cap = cap;
    this.syncCapture();
    this.capTimer = setInterval(() => { cap.tick(Date.now()); this.syncCapture(); }, 250);
    return true;
  }

  pauseCapture(): void { this.cap?.pause(); this.syncCapture(); }
  resumeCapture(): void { this.cap?.resume(); this.syncCapture(); }

  async stopCapture(): Promise<void> {
    await this.cap?.stop();
  }

  /** The finished in-memory capture, if any. */
  captureBlob(): Blob | null {
    return this.capSink instanceof MemorySink && this.cap?.state === 'stopped'
      ? this.capSink.blob(this.cap.options.format === 'raw' ? 'application/octet-stream' : 'text/plain;charset=utf-8')
      : null;
  }

  discardCapture(): void {
    if (this.cap && this.cap.state !== 'stopped') return;
    this.cap = null;
    this.capSink = null;
    this.capture = null;
  }

  private syncCapture(): void {
    const c = this.cap;
    if (!c || !this.capSink) return;
    if (c.state === 'stopped' && this.capTimer) { clearInterval(this.capTimer); this.capTimer = null; }
    this.capture = {
      name: this.capSink.name,
      kind: this.capSink instanceof FileSink ? 'file' : 'memory',
      state: c.state,
      captured: c.captured,
      written: c.written,
      startedAt: c.startedAt,
      reason: c.stopReason,
    };
  }

  /** Wall-clock time for a stream timestamp. */
  wallClock(t: number): Date {
    return new Date(performance.timeOrigin + t);
  }

  private receive(chunk: Uint8Array, ts: number): void {
    this.rx += chunk.length;
    this.ring.push(chunk);
    this.cap?.rx(chunk, performance.timeOrigin + ts);
    for (const l of this.splitter.push(chunk, ts)) {
      const text = toAscii(l.bytes, { controlPictures: true });
      this.log.push({ dir: 'rx', text, time: l.timestamp, offset: l.offset });
      const samples = parseNumericLine(text);
      if (samples) {
        this.series.push((l.timestamp - this.t0) / 1000, l.offset, samples);
        if (!this.viewChosen && this.view === 'terminal') this.view = 'split';
      }
    }
    const p = this.splitter.peekPartial();
    this.partialText = p ? toAscii(p.bytes, { controlPictures: true }) : '';
    if (p) { this.partialTime = p.timestamp; this.partialOffset = p.offset; }
    this.changed();
  }

  private closed(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.transport = null;
    this.open = false;
    this.signals = null;
    this.rate = 0;
  }

  private startTimers(): void {
    let lastRx = this.rx;
    let lastT = now();
    this.timers.push(setInterval(() => {
      const t = now();
      this.rate = ((this.rx - lastRx) * 1000) / (t - lastT);
      lastRx = this.rx;
      lastT = t;
    }, 1000));
    if (this.transport?.capabilities.lineSignals) {
      this.timers.push(setInterval(async () => {
        try {
          if (this.transport?.state === 'open') this.signals = await this.transport.getSignals();
        } catch {
          /* port went away between the state check and the read; onClose handles it */
        }
      }, SIGNAL_POLL_MS));
    }
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

function stampForName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Sent lines are shown without their terminator, like received ones. */
function echoLine(bytes: Uint8Array): string {
  let end = bytes.length;
  if (bytes[end - 1] === 0x0a) end--;
  if (bytes[end - 1] === 0x0d) end--;
  return toAscii(bytes.subarray(0, end), { controlPictures: true });
}

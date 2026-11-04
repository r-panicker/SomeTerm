import {
  ByteRing,
  frame,
  parseEscapes,
  parseHexBytes,
  xmodemSend,
  ByteQueue,
  XmodemError,
  XMODEM_MODES,
  type XmodemMode,
  AutoReplier,
  type AutoReply,
  repeatSend,
  sendPaced,
  sendWithEcho,
  EchoMatcher,
  type CancelToken,
  type ChecksumKind,
  FULL_CAPABILITIES,
  LoopbackTransport,
  SeriesStore,
  TerminalLog,
  toAscii,
  type InputSignals,
  type RxBatch,
  type NewlineMode,
  type SerialOptions,
  type SerialTransport,
  type TransportCapabilities,
  type TermLine,
  type DeviceId,
  matchProfile,
  ReplayTransport,
  findReturningDevice,
  type PortIdentity,
  type Recording,
  type SignalState,
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
import { CaptureController } from './capture.svelte';
import { applySettings, profiles } from './profiles.svelte';
import { defaultDisplay, type DisplaySettings, type TermSource } from './source';
import { PipelineClient } from './pipeline';
import { prefs } from './prefs.svelte';

/** Present when running inside the Electron app; serial I/O then goes through Node, not Web Serial. */
export const native = (globalThis as { superserialNative?: NativeSerialBridge }).superserialNative;

export type PortChoice =
  | { kind: 'loopback' }
  | { kind: 'webserial'; port: SerialPort }
  | { kind: 'add' }
  | { kind: 'native'; path: string; label: string }
  | { kind: 'replay'; name: string; recording: Recording };

export interface Player {
  playing: boolean;
  /** 0 means as fast as the view can take it. */
  speed: number;
  /** Recorded ms delivered so far. */
  position: number;
  duration: number;
  /** Recorded DTR/RTS, which the top bar shows in place of the toggles. */
  dtr: boolean;
  rts: boolean;
}

/** Bytes a fast-forward or Max-speed replay delivers per frame, so the view keeps drawing. */
const REPLAY_FRAME_BUDGET = 256 * 1024;
export type View = 'terminal' | 'split' | 'plot';

/** A one-click send above the send bar. */
export interface QuickSend {
  id: string;
  label: string;
  /** Send-box text (escapes allowed), or hex bytes when `hex`. */
  text: string;
  hex: boolean;
}

export interface SendOptions {
  checksum: ChecksumKind;
  byteDelayMs: number;
  lineDelayMs: number;
  /** 1 = once, 0 = until stopped. */
  repeat: number;
  intervalMs: number;
  /** Raise RTS for the duration of each send (RS-485 style direction control). */
  rtsWhileSending: boolean;
  /** Appended to text sends, as escape text (`\\r\\n`). */
  eol: string;
  /** Above 0: send byte by byte, waiting up to this long for each byte's echo (half-duplex handshake). */
  echoWaitMs: number;
  /** What the Backspace key sends when typing to the device: BS (0x08) or DEL (0x7F). */
  backspace: 'bs' | 'del';
  /** How Send file sends: the bytes as they are, or an XMODEM/YMODEM transfer. */
  fileProtocol: 'raw' | XmodemMode;
}

export interface PlotTransform {
  /** Expression in `x`, e.g. `x*3.3/4095`; empty means none. */
  expr: string;
  unit: string;
}

export interface SendJob {
  kind: 'paced' | 'repeat' | 'file';
  label: string;
  done: number;
  total: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const RING_BYTES = 4 << 20;
const SIGNAL_POLL_MS = 100;

const now = () => performance.now();

/**
 * One connection and everything derived from its stream. Bulk data (log, ring,
 * series) is plain, not reactive; `version` ticks at most once per frame so views
 * redraw per frame rather than per chunk.
 */
export const defaultSerialOptions = (): SerialOptions => ({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
export const defaultSendOptions = (): SendOptions => ({ checksum: 'none', byteDelayMs: 0, lineDelayMs: 0, repeat: 1, intervalMs: 1000, rtsWhileSending: false, eol: '\\r\\n', echoWaitMs: 0, backspace: 'bs', fileProtocol: 'raw' });

export class Session implements TermSource {
  /** Received data is also written to this port when set (RealTerm's echo port). */
  forwardTo = $state<Session | null>(null);
  /** Every rx line and every send, for merged views; not affected by the echo toggle. */
  onLine: ((line: TermLine) => void) | null = null;

  constructor(
    /** Stable for the session's life; used to tag its lines in merged views. */
    readonly id = 0,
    readonly letter = 'A',
  ) {}

  options = $state<SerialOptions>(defaultSerialOptions());
  // Raw, not deep state: a choice holds a SerialPort or a whole recording, and is only ever replaced.
  choice = $state.raw<PortChoice>(!native && isWebSerialAvailable() ? { kind: 'add' } : { kind: 'loopback' });
  granted = $state.raw<SerialPort[]>([]);
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
  echo = $state(false);
  newline = $state<NewlineMode>('auto');
  display = $state<DisplaySettings>(defaultDisplay());
  /** Plot time window in seconds; 0 shows everything. */
  plotWindow = $state(30);
  /** Per-series display transform, keyed by series name; raw values are kept unchanged. */
  plotTransforms = $state<Record<string, PlotTransform>>({});
  /** Series used as the X axis (XY plot); null plots against time. */
  plotX = $state<string | null>(null);
  /** Plot the amplitude spectrum instead of values; takes precedence over plotX. */
  plotFft = $state(false);
  /** Sample rate for the spectrum in Hz; null estimates it from arrival times. */
  plotFs = $state<number | null>(null);
  /** Pattern → reply rules for this tab; kept in profiles. */
  autoReplies = $state<AutoReply[]>([]);
  quickSends = $state<QuickSend[]>([]);
  private replier = new AutoReplier(now);
  /** Terminal mode: the line being typed, and whether to show it (devices that echo make that redundant). */
  typed = $state('');
  localEcho = $state(false);
  /** Keys pressed in the focused ASCII view go to the device. */
  typeToDevice = $state(true);
  /** True after a device dropped out on its own, until it returns or the user cancels. */
  waiting = $state(false);
  private userClosing = false;
  private identity: PortIdentity | null = null;
  private waitTimer: ReturnType<typeof setInterval> | undefined;
  /** Present while a recording is open in this tab. */
  player = $state<Player | null>(null);
  private replay: ReplayTransport | null = null;
  private replayFrame = 0;
  private seekTarget: number | null = null;
  /** Shifts timestamps so a replay shows the recording's own wall-clock times. */
  private clockOffset = 0;
  /** The profile last applied or saved here; settings may have changed since. */
  profileId = $state<string | null>(null);
  readonly capture = new CaptureController((m) => { this.errors++; this.lastError = m; });
  sendOptions = $state<SendOptions>(defaultSendOptions());
  private echoes = new EchoMatcher((fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); });
  job = $state<SendJob | null>(null);
  /** Receives incoming bytes instead of the line parser during an XMODEM/YMODEM transfer. */
  private protocolTap: ((chunk: Uint8Array, ts: number) => void) | null = null;
  private token: CancelToken | null = null;

  readonly log = new TerminalLog(() => prefs.scrollback);
  readonly ring = new ByteRing(RING_BYTES);
  readonly series = new SeriesStore();
  /** Stream offset where the hex view starts; moved by Clear. */
  hexStart = 0;
  /** Time origin for the plot's x axis. */
  t0 = 0;

  private transport: SerialTransport | null = null;
  private pipeline = new PipelineClient((b) => this.onBatch(b));
  private offs: (() => void)[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private scheduled = false;
  private viewChosen = false;
  private partialLine: RxBatch['partial'] = null;

  get capabilities(): TransportCapabilities {
    if (this.choice.kind === 'loopback') return FULL_CAPABILITIES;
    return this.choice.kind === 'native' && native ? native.capabilities : WEB_SERIAL_CAPABILITIES;
  }

  get partial(): RxBatch['partial'] {
    return this.partialLine && (this.partialLine.raw ?? this.partialLine.text) ? this.partialLine : null;
  }

  portLabel(c: PortChoice = this.choice): string {
    if (c.kind === 'native') return c.label;
    if (c.kind === 'replay') return `▶ ${c.name}`;
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
      this.applyMatchingProfile();
    }
  }

  /** `restoring` skips profile matching: a restored tab already has the exact settings it was left with. */
  choosePort(c: PortChoice, restoring = false): void {
    this.choice = c;
    this.portChosen = true;
    if (!restoring) this.applyMatchingProfile();
  }

  /** USB identity of the chosen port, when it has one. */
  deviceId(c: PortChoice = this.choice): DeviceId | null {
    if (c.kind === 'webserial') {
      const { usbVendorId: vid, usbProductId: pid } = c.port.getInfo();
      return vid !== undefined && pid !== undefined ? { vid, pid } : null;
    }
    if (c.kind === 'native') {
      const p = this.nativePorts.find((x) => x.path === c.path);
      const vid = p?.vendorId ? parseInt(p.vendorId, 16) : NaN;
      const pid = p?.productId ? parseInt(p.productId, 16) : NaN;
      if (Number.isNaN(vid) || Number.isNaN(pid)) return null;
      return { vid, pid, ...(p?.serialNumber && { serial: p.serialNumber }) };
    }
    return null;
  }

  applyProfile(id: string): void {
    const p = profiles.get(id);
    if (!p || this.open) return;
    applySettings(this, p.settings);
    this.profileId = p.id;
  }

  /** Applies the profile saved for this device, if any; settings change only, nothing is sent. */
  private applyMatchingProfile(): void {
    const p = matchProfile(profiles.list, this.deviceId());
    if (p) this.applyProfile(p.id);
  }

  chooseView(v: View): void {
    this.view = v;
    this.viewChosen = true;
  }

  /** `silent` is for reconnect attempts, which fail routinely until the device is back. */
  async connect(silent = false): Promise<void> {
    this.busy = true;
    try {
      let t: SerialTransport;
      if (this.choice.kind === 'replay') t = this.startReplay(this.choice.recording);
      else if (this.choice.kind === 'loopback') t = new LoopbackTransport({}, now);
      else if (this.choice.kind === 'native' && native) t = new IpcSerialTransport(native, this.choice.path, now);
      else if (this.choice.kind === 'webserial') t = new WebSerialTransport(this.choice.port, now);
      else {
        const w = await requestWebSerialPort();
        await this.refreshPorts();
        this.choice = { kind: 'webserial', port: this.granted.find((p) => p === w.port) ?? w.port };
        // A newly granted port gets its profile before it is opened with these settings.
        this.applyMatchingProfile();
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
      if (this.replay) {
        this.t0 = this.replay.timeOrigin;
        this.clockOffset = this.replay.recording.meta.created - (performance.timeOrigin + this.replay.timeOrigin);
        this.runPlayer();
      } else if (!this.t0) this.t0 = now();
      this.identity = { id: this.deviceId(), ...(this.choice.kind === 'native' && { path: this.choice.path }) };
      this.startTimers();
    } catch (e) {
      if (!silent && !(e instanceof DOMException && e.name === 'NotFoundError')) {
        this.errors++;
        this.lastError = (e as Error).message;
      }
    } finally {
      this.busy = false;
    }
  }

  async disconnect(): Promise<void> {
    this.busy = true;
    this.userClosing = true;
    try {
      await this.transport?.close();
    } finally {
      this.userClosing = false;
      this.busy = false;
    }
  }

  private handleReplies(text: string, offset: number): void {
    const r = this.replier.check(text, offset);
    for (const a of r.send) {
      const go = () => {
        if (!this.open) return;
        void this.sendRaw(a.bytes);
        const line: TermLine = { dir: 'tx', text: echoLine(a.bytes), bytes: a.bytes, via: 'auto', time: now(), offset: -1 };
        this.onLine?.(line);
        if (this.echo) { this.log.push(line); this.changed(); }
      };
      if (a.rule.delayMs > 0) setTimeout(go, a.rule.delayMs);
      else go();
    }
    for (const d of r.disabled) {
      const rule = this.autoReplies.find((x) => x.id === d.id);
      if (rule) rule.enabled = false;
      this.errors++;
      this.lastError = `Auto-reply “${d.pattern}” fired over 10 times a second and was turned off`;
    }
    for (const e of r.errors) {
      this.errors++;
      this.lastError = `Auto-reply “${e.rule.pattern}”: ${e.message}`;
    }
  }

  /** Writes bytes immediately, outside any send job; used for keystrokes and auto-replies. */
  async sendRaw(bytes: Uint8Array): Promise<void> {
    const t = this.transport;
    if (!t || this.replay || !bytes.length) return;
    try {
      this.capture.tx(bytes, Date.now());
      await t.write(bytes);
      this.tx += bytes.length;
    } catch (e) {
      this.errors++;
      this.lastError = `Send: ${(e as Error).message}`;
    }
  }

  /**
   * Terminal mode. Every key goes out at once; the typed line is kept so it can be
   * echoed locally and, on Enter, logged as one sent line (Monitor, capture view).
   */
  typeKeys(bytes: Uint8Array, key: 'text' | 'enter' | 'backspace' | 'other', text = ''): void {
    if (!this.open || this.player) return;
    // Enter sends the send-bar line ending; CR when none is set, as most terminals do.
    if (key === 'enter' && !bytes.length) bytes = parseEscapes(this.sendOptions.eol || '\\r');
    if (key === 'backspace') bytes = Uint8Array.of(this.sendOptions.backspace === 'del' ? 0x7f : 0x08);
    void this.sendRaw(bytes);
    if (key === 'text') this.typed += text;
    else if (key === 'backspace') this.typed = [...this.typed].slice(0, -1).join('');
    else if (key === 'enter') {
      const line: TermLine = { dir: 'tx', text: this.typed, via: 'typed', time: now(), offset: -1 };
      this.typed = '';
      this.onLine?.(line);
      if (this.localEcho) this.log.push(line);
    }
    this.changed();
  }

  cancelWaiting(): void {
    clearInterval(this.waitTimer);
    this.waitTimer = undefined;
    this.waiting = false;
  }

  /** A line in the terminal (and Monitor) marking an event, not data. */
  private marker(text: string): void {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const line: TermLine = { dir: 'sys', text: `── ${text} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ──`, time: now(), offset: -1 };
    this.log.push(line);
    this.onLine?.(line);
    this.changed();
  }

  private beginWaiting(): void {
    this.waiting = true;
    this.marker('device lost');
    let trying = false;
    const attempt = async () => {
      if (trying || !this.waiting || this.open) return;
      trying = true;
      try {
        const c = await this.returningPort();
        if (!c || !this.waiting) return;
        this.choice = c;
        await this.connect(true);
        if (this.open) {
          this.cancelWaiting();
          this.marker('reconnected');
        }
      } finally {
        trying = false;
      }
    };
    this.waitTimer = setInterval(attempt, 1000);
    void attempt();
  }

  /** The port that is the lost device, if it has come back. */
  private async returningPort(): Promise<PortChoice | null> {
    if (!this.identity) return null;
    await this.refreshPorts();
    if (native) {
      const cands = this.nativePorts.map((p) => ({ id: this.deviceId({ kind: 'native', ...p }), path: p.path }));
      const i = findReturningDevice(this.identity, cands);
      return i < 0 ? null : { kind: 'native', ...this.nativePorts[i]! };
    }
    const cands = this.granted.map((port) => ({ id: this.deviceId({ kind: 'webserial', port }) }));
    const i = findReturningDevice(this.identity, cands);
    return i < 0 ? null : { kind: 'webserial', port: this.granted[i]! };
  }

  /** Sends payload + checksum + suffix, honouring repeat, pacing and RTS options. */
  /** `once` ignores the repeat setting (quick sends); checksum and pacing still apply. */
  async sendMessage(payload: Uint8Array, suffix: Uint8Array, once = false): Promise<void> {
    if (!this.transport || this.job || this.replay) return;
    const bytes = frame(payload, this.sendOptions.checksum, suffix);
    if (!bytes.length) return;
    const o = this.sendOptions;
    const paced = o.byteDelayMs > 0 || o.lineDelayMs > 0 || o.echoWaitMs > 0;
    if (o.repeat === 1 || once) {
      if (paced) await this.runJob({ kind: 'paced', label: 'Sending', done: 0, total: bytes.length }, (t) => this.transmit(bytes, t, (n) => this.progress(n)));
      else await this.transmit(bytes, { cancelled: false });
      return;
    }
    await this.runJob({ kind: 'repeat', label: 'Repeat', done: 0, total: o.repeat }, (t) =>
      repeatSend(o.repeat, o.intervalMs, () => this.transmit(bytes, t), sleep, now, t, (n) => this.progress(n)).then(() => {}),
    );
  }

  /** Text quick sends get the line ending, as from the send box; hex ones are sent as given. */
  async sendQuick(q: QuickSend): Promise<void> {
    let payload: Uint8Array;
    try {
      payload = q.hex ? parseHexBytes(q.text) : parseEscapes(q.text);
    } catch (e) {
      this.errors++;
      this.lastError = `Quick send “${q.label || q.text}”: ${(e as Error).message}`;
      return;
    }
    await this.sendMessage(payload, q.hex ? new Uint8Array(0) : parseEscapes(this.sendOptions.eol), true);
  }

  async sendFile(file: File): Promise<void> {
    if (!this.transport || this.job || this.replay) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const proto = this.sendOptions.fileProtocol;
    if (proto !== 'raw') return this.sendXmodem(file.name, bytes, proto);
    await this.runJob({ kind: 'file', label: file.name, done: 0, total: bytes.length }, (t) =>
      this.transmit(bytes, t, (n) => this.progress(n), `⟨${file.name}, ${bytes.length} B⟩`),
    );
  }

  /**
   * Received bytes go to the transfer (and still to counters, capture and the raw
   * views). Until the first block is written they also reach the terminal, so the
   * device's own "ready for download" text stays visible; after that they are the
   * receiver's protocol replies and are kept out of it.
   */
  private async sendXmodem(name: string, bytes: Uint8Array, mode: XmodemMode): Promise<void> {
    const t = this.transport!;
    const label = XMODEM_MODES.find((m) => m.mode === mode)!.label;
    const queue = new ByteQueue();
    let result = '';
    this.marker(`${label}: waiting for the receiver to start ${name}`);
    await this.runJob({ kind: 'file', label: `${label} · ${name}`, done: 0, total: bytes.length }, async (token) => {
      let started = false;
      this.protocolTap = (c, ts) => { queue.push(c); if (!started) this.pipeline.data(c, ts); };
      try {
        await xmodemSend(bytes, name, mode, {
          write: async (b) => { started = true; this.capture.tx(b, Date.now()); await t.write(b); this.tx += b.length; },
          read: (ms) => queue.read(ms),
          flush: () => queue.flush(),
          cancelled: () => token.cancelled || t.state !== 'open',
        }, (n) => this.progress(n));
        result = `${label}: sent ${name}, ${bytes.length} B`;
      } catch (e) {
        if (!(e instanceof XmodemError)) throw e;
        result = `${label}: ${name} not sent: ${e.message}`;
        this.errors++;
        this.lastError = result;
      } finally {
        this.protocolTap = null;
      }
    });
    if (result) this.marker(result);
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
    if (this.echo || this.onLine) {
      const line: TermLine = { dir: 'tx', text: echoText ?? echoLine(bytes), ...(!echoText && { raw: toAscii(bytes, { controlPictures: true }), bytes: bytes.slice() }), time: now(), offset: -1 };
      this.onLine?.(line);
      if (this.echo) {
        this.log.push(line);
        this.changed();
      }
    }
    const o = this.sendOptions;
    const rts = o.rtsWhileSending;
    if (rts) await t.setSignals({ rts: true });
    const started = now();
    let sent = 0;
    try {
      const write = async (piece: Uint8Array) => {
        this.capture.tx(piece, Date.now());
        await t.write(piece);
        this.tx += piece.length;
      };
      sent = o.echoWaitMs > 0
        ? await sendWithEcho(bytes, { ...o, echoTimeoutMs: o.echoWaitMs }, write, this.echoes, sleep, token, onProgress)
        : await sendPaced(bytes, o, write, sleep, token, onProgress);
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
    this.recordSignals();
  }

  /** Writes the current line states into a session recording, if one is running. */
  recordSignals(): void {
    const s = this.signals;
    const state: SignalState = { cts: !!s?.cts, dsr: !!s?.dsr, dcd: !!s?.dcd, ri: !!s?.ri, dtr: this.dtr, rts: this.rts };
    this.capture.signals(state, Date.now());
  }

  /** Opens a recording (file chosen by the user) for replay in this tab. */
  loadRecording(name: string, recording: Recording): void {
    if (this.open) return;
    this.choosePort({ kind: 'replay', name, recording });
    if (recording.meta.options) Object.assign(this.options, recording.meta.options);
  }

  private startReplay(rec: Recording): ReplayTransport {
    const t = new ReplayTransport(rec, now);
    this.replay = t;
    t.onTx((chunk, at) => {
      const line: TermLine = { dir: 'tx', text: echoLine(chunk), time: at, offset: -1 };
      this.onLine?.(line);
      if (this.echo) { this.log.push(line); this.changed(); }
    });
    t.onSignals((s) => { if (this.player) { this.player.dtr = s.dtr; this.player.rts = s.rts; } });
    this.player = { playing: true, speed: 1, position: 0, duration: rec.duration, dtr: false, rts: false };
    return t;
  }

  togglePlay(): void {
    const p = this.player;
    if (!p || !this.replay) return;
    if (!p.playing && this.replay.ended) this.seek(0);
    p.playing = !p.playing;
  }

  /** Clears the view and re-delivers everything up to `ms`, spread over frames. */
  seek(ms: number): void {
    if (!this.replay || !this.player) return;
    this.clear();
    this.pipeline.reset(this.newline, this.ring.end, true);
    this.partialLine = null;
    this.t0 = this.replay.timeOrigin;
    this.replay.rewind();
    this.seekTarget = Math.max(0, Math.min(ms, this.player.duration));
    this.player.position = this.seekTarget;
  }

  private runPlayer(): void {
    let last = now();
    const frame = () => {
      const t = this.replay;
      const p = this.player;
      if (!t || !p || t.state !== 'open') return;
      const n = now();
      const dt = n - last;
      last = n;
      if (this.seekTarget !== null) {
        if (t.advanceTo(this.seekTarget, REPLAY_FRAME_BUDGET)) this.seekTarget = null;
      } else if (p.playing) {
        const target = p.speed === 0 ? Infinity : t.position + dt * p.speed;
        t.advanceTo(target, p.speed === 0 ? REPLAY_FRAME_BUDGET : Infinity);
        if (t.ended) p.playing = false;
      }
      p.position = t.position;
      this.replayFrame = requestAnimationFrame(frame);
    };
    this.replayFrame = requestAnimationFrame(frame);
  }

  async sendBreak(ms = 250): Promise<void> {
    await this.transport?.sendBreak(ms);
  }

  /** 'worker' normally; 'inline' if the worker could not start. */
  get pipelineMode(): string {
    return this.pipeline.mode;
  }

  setNewline(mode: NewlineMode): void {
    this.newline = mode;
    this.pipeline.reset(mode, this.ring.end);
    this.partialLine = null;
    this.changed();
  }

  clear(): void {
    this.log.clear();
    this.series.clear();
    this.hexStart = this.ring.end;
    this.partialLine = null;
    this.errors = 0;
    this.lastError = '';
    this.t0 = this.replay ? this.replay.timeOrigin : now();
    this.changed();
  }

  /** Wall-clock time for a stream timestamp. */
  wallClock(t: number): Date {
    return new Date(performance.timeOrigin + t + this.clockOffset);
  }

  private receive(chunk: Uint8Array, ts: number): void {
    this.rx += chunk.length;
    this.ring.push(chunk);
    this.capture.rx(chunk, performance.timeOrigin + ts);
    if (this.protocolTap) { this.protocolTap(chunk, ts); return; }
    this.pipeline.data(chunk, ts);
    this.echoes.feed(chunk);
    const to = this.forwardTo;
    if (to?.open) {
      to.forward(chunk).catch((e: Error) => { to.errors++; to.lastError = `Forward from ${this.letter}: ${e.message}`; });
    }
  }

  /**
   * Writes bytes forwarded from another port. Counted and captured as sent, but
   * not echoed or passed to merged views: those already show them as the source's rx.
   */
  async forward(chunk: Uint8Array): Promise<void> {
    const t = this.transport;
    if (!t) return;
    this.capture.tx(chunk, Date.now());
    await t.write(chunk);
    this.tx += chunk.length;
  }

  /** Identifies the physical port, so two tabs cannot open the same one. Null for Loopback. */
  portKey(c: PortChoice = this.choice): unknown {
    if (c.kind === 'native') return `native:${c.path}`;
    if (c.kind === 'webserial') return c.port;
    return null; // Loopback and recordings can be open in any number of tabs.
  }

  async dispose(): Promise<void> {
    this.cancelWaiting();
    await this.capture.stop();
    if (this.open) await this.disconnect();
    this.pipeline.dispose();
  }

  private onBatch(b: RxBatch): void {
    const replying = this.open && !this.player && this.autoReplies.some((r) => r.enabled);
    if (replying) this.replier.setRules($state.snapshot(this.autoReplies));
    for (const l of b.lines) {
      if (replying) this.handleReplies(l.text, l.offset);
      const line: TermLine = { dir: 'rx', text: l.text, runs: l.runs, raw: l.raw, time: l.time, offset: l.offset, len: l.len };
      this.log.pushRx(line);
      this.onLine?.(line);
      if (l.samples) {
        this.series.push((l.time - this.t0) / 1000, l.offset, l.samples);
        if (!this.viewChosen && this.view === 'terminal') this.view = 'split';
      }
    }
    this.partialLine = b.partial;
    // A prompt without a newline yet ("Password:") still gets its answer.
    if (replying && b.partial) this.handleReplies(b.partial.text, b.partial.offset);
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
    cancelAnimationFrame(this.replayFrame);
    this.replay = null;
    this.player = null;
    this.seekTarget = null;
    this.clockOffset = 0;
    // Only a device that dropped out on its own is waited for; Disconnect and recordings are final.
    const kind = this.choice.kind;
    if (!this.userClosing && (kind === 'native' || kind === 'webserial') && !this.waiting) this.beginWaiting();
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
          if (this.transport?.state !== 'open') return;
          const next = await this.transport.getSignals();
          const changed = JSON.stringify(next) !== JSON.stringify(this.signals);
          this.signals = next;
          if (changed) this.recordSignals();
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

/** Sent lines are shown without their terminator, like received ones. */
function echoLine(bytes: Uint8Array): string {
  let end = bytes.length;
  if (bytes[end - 1] === 0x0a) end--;
  if (bytes[end - 1] === 0x0d) end--;
  return toAscii(bytes.subarray(0, end), { controlPictures: true });
}

import net from 'node:net';
import { performance } from 'node:perf_hooks';
import {
  NET_CAPABILITIES,
  TelnetCodec,
  describeNet,
  type InputSignals,
  type NetSpec,
  type SerialTransport,
  type TransportCapabilities,
  type TransportState,
  type Unsubscribe,
} from '@someterm/core';

type Listener<T extends unknown[]> = (...a: T) => void;

function emitter<T extends unknown[]>() {
  const set = new Set<Listener<T>>();
  return {
    on(fn: Listener<T>): Unsubscribe {
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(...a: T) {
      for (const fn of set) fn(...a);
    },
  };
}

/** One remote end: its socket and, for Telnet, its own negotiation state. */
interface Peer {
  socket: net.Socket;
  telnet: TelnetCodec | null;
  name: string;
}

/**
 * A TCP or Telnet connection behaving like a serial port. As a client it is one
 * connection; as a server it accepts any number of clients, merges what they
 * send, and sends every write to all of them. Serial settings and line signals
 * do not exist here, so the capabilities say so and the UI hides those controls.
 */
export class TcpTransport implements SerialTransport {
  readonly capabilities: TransportCapabilities = NET_CAPABILITIES;
  private _state: TransportState = 'closed';
  private peers = new Set<Peer>();
  private server: net.Server | null = null;
  private closing = false;
  private readonly data = emitter<[Uint8Array, number]>();
  private readonly errors = emitter<[Error]>();
  private readonly closes = emitter<[]>();
  private readonly notices = emitter<[string]>();

  constructor(readonly spec: NetSpec) {}

  get state(): TransportState {
    return this._state;
  }

  /** Clients connected to a server, or 1 for a connected client. */
  get connections(): number {
    return this.peers.size;
  }

  async open(): Promise<void> {
    if (this._state === 'open') throw new Error('Already open');
    this.closing = false;
    if (this.spec.mode === 'client') await this.connect();
    else await this.listen();
    this._state = 'open';
  }

  private adopt(socket: net.Socket): Peer {
    socket.setNoDelay(true);
    const peer: Peer = {
      socket,
      telnet: this.spec.protocol === 'telnet' ? new TelnetCodec(this.spec.mode) : null,
      name: `${socket.remoteAddress?.replace(/^::ffff:/, '')}:${socket.remotePort}`,
    };
    this.peers.add(peer);
    socket.on('data', (buf: Buffer) => {
      const now = performance.now();
      let bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      if (peer.telnet) {
        const { data, reply } = peer.telnet.decode(bytes);
        if (reply.length) socket.write(reply);
        bytes = data;
      }
      if (bytes.length) this.data.emit(bytes.slice(), now);
    });
    socket.on('error', (e) => {
      // A client's socket error only ends that client; the server keeps listening.
      if (this.spec.mode === 'client') this.errors.emit(e);
    });
    socket.on('close', () => {
      this.peers.delete(peer);
      if (this.spec.mode === 'server') {
        if (!this.closing) this.notices.emit(`${peer.name} disconnected · ${this.peers.size} connected`);
      } else this.finish();
    });
    return peer;
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: this.spec.host, port: this.spec.port });
      const fail = (e: Error) => { socket.destroy(); reject(new Error(`${describeNet(this.spec)}: ${e.message}`)); };
      socket.once('error', fail);
      socket.setTimeout(10_000, () => fail(new Error('no answer within 10 s')));
      socket.once('connect', () => {
        socket.off('error', fail);
        socket.setTimeout(0);
        this.adopt(socket);
        resolve();
      });
    });
  }

  private listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        const peer = this.adopt(socket);
        this.notices.emit(`${peer.name} connected · ${this.peers.size} connected`);
      });
      server.once('error', (e: NodeJS.ErrnoException) => {
        reject(new Error(e.code === 'EADDRINUSE' ? `Port ${this.spec.port} is already in use` : e.message));
      });
      server.listen({ host: this.spec.host || undefined, port: this.spec.port }, () => {
        server.removeAllListeners('error');
        server.on('error', (e) => this.errors.emit(e));
        this.server = server;
        resolve();
      });
    });
  }

  private finish(): void {
    if (this._state === 'closed') return;
    this._state = 'closed';
    this.closes.emit();
  }

  async close(): Promise<void> {
    if (this._state === 'closed') return;
    this.closing = true;
    for (const p of this.peers) p.socket.destroy();
    this.peers.clear();
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((r) => server.close(() => r()));
    this.finish();
  }

  async write(data: Uint8Array): Promise<void> {
    if (this._state !== 'open') throw new Error('Not open');
    await Promise.all(
      [...this.peers].map((p) => new Promise<void>((resolve, reject) => {
        const out = p.telnet ? p.telnet.encode(data) : data;
        p.socket.write(out, (e) => (e ? reject(e) : resolve()));
      })),
    );
  }

  async setSignals(): Promise<void> {}

  async getSignals(): Promise<InputSignals> {
    return { cts: false, dsr: false, dcd: false, ri: false };
  }

  async sendBreak(): Promise<void> {
    throw new Error('A network connection has no break signal');
  }

  onData(fn: (chunk: Uint8Array, timestamp: number) => void): Unsubscribe {
    return this.data.on(fn);
  }

  onError(fn: (e: Error) => void): Unsubscribe {
    return this.errors.on(fn);
  }

  onClose(fn: () => void): Unsubscribe {
    return this.closes.on(fn);
  }

  onNotice(fn: (text: string) => void): Unsubscribe {
    return this.notices.on(fn);
  }
}

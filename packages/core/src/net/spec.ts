import type { TransportCapabilities } from '../transport';

/** A network connection used in place of a serial port. */
export interface NetSpec {
  /** Client connects to host:port; server listens on host:port and accepts any number of clients. */
  mode: 'client' | 'server';
  /** Raw TCP passes bytes untouched; Telnet strips option negotiation and escapes 0xFF. */
  protocol: 'tcp' | 'telnet';
  host: string;
  port: number;
}

/** A network "port" has none of a serial line's settings or signals. */
export const NET_CAPABILITIES: TransportCapabilities = {
  markSpaceParity: false,
  dsrDtrFlow: false,
  xonXoffFlow: false,
  oneAndHalfStopBits: false,
  fiveSixDataBits: false,
  portMetadata: false,
  sendBreak: false,
  lineSignals: false,
  ringIndicator: false,
};

const SCHEMES = { 'tcp:': ['client', 'tcp'], 'tcp-server:': ['server', 'tcp'], 'telnet:': ['client', 'telnet'], 'telnet-server:': ['server', 'telnet'] } as const;

/** The spec as a path, so it can travel wherever a serial port path does (`tcp://host:port`, `telnet-server://0.0.0.0:2323`…). */
export function netPath(s: NetSpec): string {
  const scheme = `${s.protocol}${s.mode === 'server' ? '-server' : ''}`;
  const host = s.host.includes(':') ? `[${s.host}]` : s.host;
  return `${scheme}://${host}:${s.port}`;
}

/** The spec a path names, or null when it is not a network path (a serial port). */
export function parseNetPath(path: string): NetSpec | null {
  const m = /^([a-z-]+:)\/\/(\[[^\]]+\]|[^:/]*):(\d{1,5})$/.exec(path);
  if (!m) return null;
  const kind = SCHEMES[m[1] as keyof typeof SCHEMES];
  const port = Number(m[3]);
  if (!kind || port < 1 || port > 65535) return null;
  return { mode: kind[0], protocol: kind[1], host: m[2]!.replace(/^\[|\]$/g, ''), port };
}

export function describeNet(s: NetSpec): string {
  const what = s.protocol === 'telnet' ? 'Telnet' : 'TCP';
  return s.mode === 'server' ? `${what} server :${s.port}` : `${what} ${s.host}:${s.port}`;
}

/** Why a spec cannot be used, or '' when it can. */
export function netSpecProblem(s: NetSpec): string {
  if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535) return 'Port must be 1 to 65535';
  if (s.mode === 'client' && !s.host.trim()) return 'Enter the host to connect to';
  if (/[\s/]/.test(s.host)) return 'Host must be a name or an address, without spaces or slashes';
  return '';
}

/**
 * Telnet (RFC 854) framing for a byte stream: incoming option negotiation is
 * removed and answered, 0xFF is escaped going out. Every option is refused
 * except Suppress Go Ahead, and a remote Echo, which character-at-a-time
 * devices and shells expect; that keeps the stream raw in practice.
 */
export const IAC = 255;
const DONT = 254;
const DO = 253;
const WONT = 252;
const WILL = 251;
const SB = 250;
const SE = 240;
const OPT_ECHO = 1;
const OPT_SGA = 3;

type State = 'data' | 'iac' | 'opt' | 'sb' | 'sb-iac' | 'cr';

export class TelnetCodec {
  private state: State = 'data';
  private verb = 0;
  /** Options already answered, so a peer repeating itself gets no loop of replies. */
  private answered = new Set<string>();

  /** `server` changes nothing in the answers; it is kept for diagnostics and symmetry. */
  constructor(readonly role: 'client' | 'server' = 'client') {}

  /** The data bytes in `chunk`, and the bytes to send back in answer to its negotiation. */
  decode(chunk: Uint8Array): { data: Uint8Array; reply: Uint8Array } {
    const data: number[] = [];
    const reply: number[] = [];
    for (const b of chunk) {
      switch (this.state) {
        case 'data':
          if (b === IAC) this.state = 'iac';
          else if (b === 0x0d) { data.push(b); this.state = 'cr'; }
          else data.push(b);
          break;
        case 'cr':
          // CR NUL is a bare CR on the wire; drop the NUL.
          this.state = 'data';
          if (b === 0) break;
          if (b === IAC) { this.state = 'iac'; break; }
          data.push(b);
          if (b === 0x0d) this.state = 'cr';
          break;
        case 'iac':
          if (b === IAC) { data.push(IAC); this.state = 'data'; }
          else if (b === WILL || b === WONT || b === DO || b === DONT) { this.verb = b; this.state = 'opt'; }
          else if (b === SB) this.state = 'sb';
          else this.state = 'data'; // NOP, GA, AYT…: commands without data
          break;
        case 'opt':
          this.answer(this.verb, b, reply);
          this.state = 'data';
          break;
        case 'sb':
          if (b === IAC) this.state = 'sb-iac';
          break;
        case 'sb-iac':
          this.state = b === SE ? 'data' : 'sb';
          break;
      }
    }
    return { data: Uint8Array.from(data), reply: Uint8Array.from(reply) };
  }

  private answer(verb: number, opt: number, out: number[]): void {
    const key = `${verb}:${opt}`;
    if (this.answered.has(key)) return;
    this.answered.add(key);
    if (verb === WILL) out.push(IAC, opt === OPT_ECHO || opt === OPT_SGA ? DO : DONT, opt);
    else if (verb === DO) out.push(IAC, opt === OPT_SGA ? WILL : WONT, opt);
    // WONT and DONT need no answer: refusing is already the default.
  }

  /** Data ready to send: 0xFF doubled, and a CR not followed by LF sent as CR NUL. */
  encode(data: Uint8Array): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const b = data[i]!;
      out.push(b);
      if (b === IAC) out.push(IAC);
      else if (b === 0x0d && data[i + 1] !== 0x0a) out.push(0);
    }
    return Uint8Array.from(out);
  }
}

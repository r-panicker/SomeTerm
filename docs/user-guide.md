# SuperSerial user guide

## Running

Needs Node 22 and pnpm.

```bash
pnpm install
pnpm dev
```

Open the printed URL in Chrome or Edge. Other browsers have no Web Serial and offer only the Loopback port.

**Loopback** echoes whatever you send. Use it to try settings without hardware.

## Sending

| Mode | Input | Example |
|---|---|---|
| Text | Escapes `\r \n \t \0 \\ \xNN`; the selected line ending is appended | `AT\r` |
| Hex | Bytes separated by spaces or commas, optional `0x` | `0D 0A 41` |

## Receiving

ASCII view shows non-printing bytes as `.`, except control characters, which appear as symbols such as ␀. Pick the receive line ending to match the device; `CR/LF auto` treats CR, LF and CRLF each as one line break.

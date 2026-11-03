# SuperSerial user guide

## Running

Needs Node 22 and pnpm.

```bash
pnpm install
pnpm dev            # browser: open the printed URL in Chrome or Edge
pnpm dev:electron   # desktop app
```

The browser version uses Web Serial, so other browsers offer only Loopback. The desktop app talks to the OS serial driver directly and supports more settings:

| Setting | Browser | Desktop |
|---|---|---|
| 5 and 6 data bits, XON/XOFF | no | yes |
| Mark/space parity, 1.5 stop bits | no | Windows only |
| DSR/DTR flow control | no | no |
| RI input | yes | no |

To use a port the OS does not list (socat, other virtual ports), start the desktop app with `SUPERSERIAL_EXTRA_PORTS=/dev/pts/5` (several separated by `:`, or `;` on Windows).

## Connecting

Pick a port, check the settings chip (`115200 8N1`), then Connect. In the browser, **Add port…** opens the port picker, and ports you have granted before are listed by vendor and USB ID. The desktop app lists every port the OS reports and refreshes the list while disconnected. **Loopback** echoes whatever you send, which is handy for trying settings without hardware.

Settings a port cannot do are greyed out; hover for the reason. Disconnect to change settings.

DTR and RTS toggle the output lines (green is asserted). Input lines CTS, DSR, DCD and RI are shown in the status bar. Virtual ports often have no modem lines; DTR and RTS are then greyed out.

## Several ports

**+** opens another port in a new tab. Tabs are lettered A, B, …; a port open in one tab is greyed out in the others.

| Tab | Use |
|---|---|
| Port tabs | Each is a full terminal, plot, send bar and capture for one port |
| **Monitor** | Every port's sent and received lines on one timeline, tagged `A›`, `B›`. For spying on a link with two adapters, connect one to each wire. Its Capture writes the merged timeline as text |

**→ B** in a port's top bar forwards everything that port receives out of port B, to sit between two devices (set it on both tabs for both directions). Forwarded bytes count as sent on B but are not echoed there, and the Monitor shows them once, as received on the source port. Do not forward through a loopback plug in both directions: the data circulates forever.

Tabs, port choices and settings are restored on the next launch, but ports are not reopened: opening a port toggles DTR, which resets many boards. In the browser a port is only restored if exactly one granted port has its USB IDs.

## Sending

| Mode | Input | Example |
|---|---|---|
| Text | Escapes `\r \n \t \0 \\ \xNN`; the selected line ending is appended | `AT\r` |
| Hex | Bytes separated by spaces or commas, optional `0x` | `0D 0A 41` |

↑ and ↓ recall earlier sends. ⇄ shows what you send in the terminal, prefixed with →.

The ⋯ button holds send options; once any is set, the button shows it instead (`CRC-16/MODBUS · paced`).

| Option | Effect |
|---|---|
| Checksum | Appended after the payload, before the line ending. Hover an entry for its polynomial and byte order |
| Repeat | Send N times (0 = until **Stop**), interval measured start to start |
| Delay | Pause after every byte and/or every line ending; also applies to files |
| Half duplex | Raise RTS for each send and restore it afterwards, for RS-485 style direction control |

**File…** sends a file's bytes as-is, paced by the delay settings; **Stop** cancels between writes.

## Terminal

ASCII shows lines; control characters appear as symbols such as ␀ and non-ASCII bytes as `.`. Pick the receive line ending to match the device; `CR/LF auto` treats CR, LF and CRLF each as one line break. Hex, Dec and Bin show the raw received stream with offsets. Num decodes it as 8, 16 or 32-bit integers or 32/64-bit floats, with the raw bytes alongside:

| Control | Use |
|---|---|
| Type | `int16`, `float32`, … signed and unsigned |
| LE / BE | Byte order of the sender (most microcontrollers are LE) |
| +0 … +7 | Skip bytes until values line up with the sender's framing |

**Find** (Ctrl+F) searches the ASCII view, sent and received lines alike. Enter and Shift+Enter step through matches; **Aa** matches case, **.\*** takes a regular expression, and **Filter** hides lines without a match. New data is searched as it arrives. Esc closes find.

ANSI colour codes are shown as colour; other escape sequences (cursor movement, clear screen, titles) are removed rather than acted on, since this is a scrolling log, not a screen. Turn **ANSI** off to see the raw codes as `␛[31m`. Coloured numeric lines still plot.

⏱ adds arrival timestamps. Drag to select lines, Ctrl+A for all, then Ctrl+C. Scrolling up pauses following; **↓ Live** resumes.

## Plotting

Any received line made only of numbers is plotted, Arduino style:

| Line | Series |
|---|---|
| `12,34,56` or `12 34 56` | 1, 2, 3 |
| `temp:23.1,hum:41` or `temp=23.1 hum=41` | temp, hum |

The first such line switches to Split view. Click a point to jump to its line in the terminal. Drag across the plot to zoom, double-click to reset. Click a legend entry to hide that series. CSV exports everything plotted since the last Clear.

## Capture

**Capture** in the top bar opens the capture panel. Capture is independent of the connection: it keeps running across disconnects until you stop it or a limit is reached.

| Format | One record per | Use for |
|---|---|---|
| Text, timestamped lines | received line, prefixed `YYYY-MM-DD HH:MM:SS.mmm` | logs to read or grep |
| Raw bytes | byte, exactly as received | binary data, replay |
| Hex, timestamped chunks | chunk as it arrived | timing and framing questions |

Choosing **Both** tags each record `RX` or `TX`. **File** streams to disk as data arrives (Chrome and Edge); **Memory** keeps it until you View, Download or Discard. Leave a limit empty for no limit.

## Shortcuts

| Key | Action |
|---|---|
| Ctrl+F | Find in terminal |
| Ctrl+Tab | Next tab (desktop app; browsers keep this key) |
| Ctrl+L | Clear terminal, plot and error count |
| Esc | Close the capture panel, else focus the send box |

# SuperSerial user guide

## Running

Needs Node 22 and pnpm.

```bash
pnpm install
pnpm dev
```

Open the printed URL in Chrome or Edge. Other browsers have no Web Serial and offer only Loopback.

## Connecting

Pick a port, check the settings chip (`115200 8N1`), then Connect. **Add port…** opens the browser's port picker; ports you have granted before are listed by vendor and USB ID. **Loopback** echoes whatever you send, which is handy for trying settings without hardware.

Settings a port cannot do are greyed out; hover for the reason. Disconnect to change settings.

DTR and RTS toggle the output lines (green is asserted). Input lines CTS, DSR, DCD and RI are shown in the status bar.

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

ASCII shows lines; control characters appear as symbols such as ␀ and non-ASCII bytes as `.`. Pick the receive line ending to match the device; `CR/LF auto` treats CR, LF and CRLF each as one line break. Hex, Dec and Bin show the raw received stream with offsets.

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
| Ctrl+L | Clear terminal, plot and error count |
| Esc | Close the capture panel, else focus the send box |

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

## Shortcuts

| Key | Action |
|---|---|
| Ctrl+L | Clear terminal, plot and error count |
| Esc | Focus the send box |

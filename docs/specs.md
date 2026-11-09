# SomeTerm specs

How SomeTerm is built and how far it matches RealTerm's serial features. The [user guide](user-guide.md) covers using it.

## Monorepo layout (pnpm workspaces)

```
packages/
  core/                  pure TS: no DOM, no Node APIs
    transport.ts           SerialTransport interface + capability flags
    buffer/                ring buffer
    pipeline/              line splitter, newline modes, ANSI parser, receive pipeline (runs in a worker)
    format/                ASCII/hex/bin/dec/int/float formatters, number parsing
    terminal/              line log, find index, colour rules, CR-to-newline for xterm
    send/                  escapes, checksums/CRCs, pacing, echo wait, XMODEM/YMODEM, auto-replies
    capture/               logging (text/raw/hex), rotation, session recording format
    plot/                  line parsers, series store, decimation, expressions, FFT, statistics
    net/                   TCP/Telnet target spec and Telnet codec
    profiles.ts            profile matching, export/import
    reconnect.ts           device re-identification after unplug
    mock/                  loopback and replay transports for tests
  transport-webserial/   Web Serial driver
  transport-node/        serialport driver, TCP/Telnet transport, Electron IPC bridge
apps/
  web/                   Svelte 5 + Vite app; the same build runs in Electron
  electron/              main process and preload
docs/
  specs.md  user-guide.md
```

Notes:
- `transport.ts` exposes `capabilities` (xonxoff, markSpace parity, vidPid, break, customBaud, ...). The UI reads these to disable unsupported controls with a reason.
- Electron renderer talks to `transport-node` through a typed IPC channel that mirrors `SerialTransport`; the UI never imports Node.
- The pipeline runs in a worker. `core` exports it as a worker-safe module; each app wires the worker.
- Tooling: TypeScript strict, Vite, Vitest, svelte-check, Playwright for live UI checks.

## RealTerm parity checklist

Serial only. Notes record where SomeTerm takes a different approach. Status column is for tracking.

### Port
| Feature | Notes | Status |
|---|---|---|
| Enumerate/select port | Friendly names where the transport allows; hot-plug refresh | done |
| Baud, incl. custom | Presets plus free entry | done |
| Data bits 5-8, stop 1/1.5/2, parity N/E/O/M/S | Mark/space Node-only | done: desktop all except M/S and 1.5 off Windows (binding limit); browser 7/8 N/E/O |
| Flow control: none, RTS/CTS, DTR/DSR, XON/XOFF | XON/XOFF Node-only | done except DSR/DTR (no binding supports it); XON/XOFF desktop only |
| DTR, RTS set/clear/toggle | One-click toggles | done |
| Line indicators CTS, DSR, DCD, RI | Live, with change timestamps | done |
| Send break (timed) | | done |
| Open/close, auto-reconnect on re-plug | Better: reconnect to same device | done |
| Multiple ports at once | Tabs/split | done: tabs, merged Monitor (rx + tx), forwarding between ports, restore on launch |
| Rx/Tx byte and error counters, rate | Frame/parity/overrun where reported | done |

### Display
| Feature | Notes | Status |
|---|---|---|
| ASCII | Control chars optionally visible | done |
| Hex, hex+ASCII, binary, decimal | Configurable bytes per row | done |
| int8/16/32, uint, float32/64, endian | | done (plus byte alignment) |
| Rx/Tx interleaved vs split views | Tx echo shown in distinct color | done |
| Newline handling: CR, LF, CRLF, auto, "newline on N bytes" | | done |
| ANSI/VT100 escape handling | Colors, cursor, clear | done: SGR colour/styles; cursor and erase sequences removed (line-oriented by design) |
| Timestamps (absolute, delta) per line/chunk | | done |
| Scrollback limit, pause/freeze, auto-scroll | Freeze must not drop data | done (pause = scroll up) |
| Find, filter, highlight rules | Regex | done |
| Display of sync/"frame" boundaries by gap time | Idle-gap or sync-pattern splitting in the byte views | done |

### Send
| Feature | Notes | Status |
|---|---|---|
| Text with escapes (`\r \n \xNN`) | | done |
| Hex/byte entry | | done |
| Append CR/LF/custom, checksum/CRC | Common CRCs | done |
| Send file, with inter-byte and inter-line delay | Progress, cancel | done |
| Repeat N / forever, interval | | done |
| Quick-send buttons / history | Buttons above the send bar | done |
| Local echo | | done |
| Half-duplex mode (Tx waits for/loops on Rx, RTS-controlled direction) | Behavior spec to confirm | done: echo wait + RTS while sending + local echo |
| Send with char-by-char echo wait ("handshake") | | done |

### Logging
| Feature | Notes | Status |
|---|---|---|
| Log to file: append / overwrite | File System Access API streams to disk; otherwise in-memory with View/Download | done |
| Start/stop/pause, start after N bytes, auto-stop | | done (start after N bytes or on text) |
| Raw vs formatted vs timestamped output | | done |
| Rx only, Tx only, or both | | done |
| Auto-rotate by size/time | | done: numbered files in a chosen folder |
| Record raw session for replay | Beyond RealTerm | done |

### Plotting (beyond RealTerm)
| Feature | Notes | Status |
|---|---|---|
| Auto-detect `a,b,c`, whitespace, `key:value`, `label=value` | | done |
| Multi-series, rolling window or full history, pause/scrub | | done |
| Zoom/pan, cursors, min/max/mean | | done |
| Per-series scale/offset/expression | | done |
| XY mode, FFT | | done |
| Export PNG/CSV | | done |
| Click point to jump to raw bytes | | done |

### Gaps found in a review against RealTerm and TeraTerm (serial only)
Checked live over Loopback where possible. Ordered by value to the lab audience.
| Feature | Seen in | Today | Status |
|---|---|---|---|
| Backspace and lone CR edit the current line (shell echo `x\b \b`, `10%\r55%` progress) | TeraTerm | | done |
| UTF-8 text (`°C`, `µA`) | TeraTerm | | done |
| Quick-send buttons / macros | RealTerm, TeraTerm (TTL) | buttons; no scripting | done |
| Text zoom (Ctrl+= / Ctrl+-), for projectors | TeraTerm | | done |
| XMODEM/YMODEM send for bootloaders | TeraTerm | send only | done |
| Split rows on a sync pattern, fixed byte count or idle gap | RealTerm | New row: when full, after a pause, at sync bytes | done |
| Function keys F1–F12, Backspace as BS or DEL | TeraTerm | | done |
| Scrollback size and hex bytes-per-row settings | RealTerm, TeraTerm | | done |
| Paced or confirmed multi-line paste | TeraTerm | sent at once | todo |
| Plot PNG export | (beyond both) | | done |
| Full-screen VT100 (cursor addressing for menus, `top`, `vi`) | TeraTerm | xterm view (xterm.js) | done |
| ZMODEM/Kermit, XMODEM/YMODEM receive, TTL scripting, bit invert / 7-bit mask, Modbus | TeraTerm, RealTerm | no | not planned: niche for the audience, and dedicated tools do them well |

### Layout
| Region | Contents |
|---|---|
| Connection strip | Lettered connections A, B, …, then the Monitor once there are two, then **+** for another |
| Top bar | Connection type (Serial, Network, Loopback, Open recording…), port, Connect, DTR/RTS; views xterm / Terminal / Plot / Split; full screen |
| Main | Terminal and plot over the same stream; split is resizable; clicking a plot point scrolls the terminal to its line |
| Pane toolbars | One thin row per pane: format, find, text size, clear; plot pause, statistics, cursors, CSV |
| Send bar | Text/Hex, input with history, what will be added, Send; quick-send strip above it once buttons exist |
| Settings panel | RealTerm-style tabs: Send, Display, Plot, Automation, Logging, Port, Profiles, App; folds away |
| Status bar | Profile and framing (opens the Port tab), CTS/DSR/DCD/RI, logging indicator, errors, byte counts and rate; each shown only when it carries information |

- Output line controls (DTR, RTS) sit with Connect; input signals sit in the status bar.
- Settings that do nothing in the current view are disabled with the reason as a tooltip.
- Narrow windows (< ~700 px) stack the split vertically.

## Decisions
- Half-duplex: local echo of Tx plus optional RTS direction control.
- Logging without the File System Access API: data is held in memory. View and Download become available when it stops; nothing downloads automatically. Chromium with the API streams straight to the chosen file.
- Package manager: pnpm.

# SuperSerial specs

Status: proposal, nothing implemented. Layout and checklist below are for review.

## Monorepo layout (pnpm workspaces)

```
packages/
  core/                  pure TS: no DOM, no Node APIs
    transport.ts           SerialTransport interface + capability flags
    buffer/                ring buffer, timestamped chunk store
    pipeline/              line splitter, newline modes, ANSI parser, decoders
    format/                ASCII/hex/bin/dec/int/float formatters
    send/                  escape parser, checksum/CRC, file sender, repeater
    capture/               capture writer model (append/overwrite/timestamps)
    plot/                  line/KV parsers, series model, expressions
    session/               profiles, settings schema, record/replay format
    mock/                  loopback + scripted transports for tests
  transport-webserial/   Web Serial driver
  transport-node/        `serialport` driver (runs in Electron main)
  ui/                    Svelte 5 components: terminal, hex, plot, panels
apps/
  web/                   Vite app (Web Serial)
  electron/              main + preload + IPC bridge, hosts the same UI
tests/                   cross-package and throughput tests
docs/
  specs.md  user-guide.md
```

Notes:
- `transport.ts` exposes `capabilities` (xonxoff, markSpace parity, vidPid, break, customBaud, ...). The UI reads these to disable unsupported controls with a reason.
- Electron renderer talks to `transport-node` through a typed IPC channel that mirrors `SerialTransport`; the UI never imports Node.
- The pipeline runs in a worker. `core` exports it as a worker-safe module; each app wires the worker.
- Tooling: TypeScript strict, Vite, Vitest, ESLint, Playwright for live UI checks.

## RealTerm parity checklist

Serial only. "Better" notes where the UX should deliberately depart from RealTerm. Status column is for tracking.

### Port
| Feature | Notes | Status |
|---|---|---|
| Enumerate/select port | Friendly names where the transport allows; hot-plug refresh | done |
| Baud, incl. custom | Presets plus free entry | done |
| Data bits 5-8, stop 1/1.5/2, parity N/E/O/M/S | Mark/space Node-only | partial: Web Serial 7/8, N/E/O only |
| Flow control: none, RTS/CTS, DTR/DSR, XON/XOFF | XON/XOFF Node-only | partial: Web Serial only (no XON/XOFF yet) |
| DTR, RTS set/clear/toggle | One-click toggles | done |
| Line indicators CTS, DSR, DCD, RI | Live, with change timestamps | done |
| Send break (timed) | | done |
| Open/close, auto-reconnect on re-plug | Better: reconnect to same device | partial: no auto-reconnect |
| Multiple ports at once | Tabs/split | todo |
| Rx/Tx byte and error counters, rate | Frame/parity/overrun where reported | done |

### Display
| Feature | Notes | Status |
|---|---|---|
| ASCII | Control chars optionally visible | done |
| Hex, hex+ASCII, binary, decimal | Configurable bytes per row | done (bytes per row fixed) |
| int8/16/32, uint, float32/64, endian | | todo |
| Rx/Tx interleaved vs split views | Tx echo shown in distinct color | done |
| Newline handling: CR, LF, CRLF, auto, "newline on N bytes" | | done |
| ANSI/VT100 escape handling | Colors, cursor, clear | todo |
| Timestamps (absolute, delta) per line/chunk | | done |
| Scrollback limit, pause/freeze, auto-scroll | Freeze must not drop data | done (pause = scroll up) |
| Find, filter, highlight rules | Regex | todo |
| Display of sync/"frame" boundaries by gap time | Idle-gap splitting | todo |

### Send
| Feature | Notes | Status |
|---|---|---|
| Text with escapes (`\r \n \xNN`) | | done |
| Hex/byte entry | | done |
| Append CR/LF/custom, checksum/CRC | Common CRCs | todo |
| Send file, with inter-byte and inter-line delay | Progress, cancel | todo |
| Repeat N / forever, interval | | todo |
| Quick-send buttons / history | Better than RealTerm's per-tab entry | partial: history only |
| Local echo | | done |
| Half-duplex mode (Tx waits for/loops on Rx, RTS-controlled direction) | Behavior spec to confirm | todo |
| Send with char-by-char echo wait ("handshake") | | todo |

### Capture and logging
| Feature | Notes | Status |
|---|---|---|
| Capture to file: append / overwrite | File System Access API streams to disk; otherwise in-memory with View/Download | done |
| Start/stop/pause, capture-after-N-bytes, auto-stop | | partial: no capture-after-N-bytes start |
| Raw vs formatted vs timestamped output | | done |
| Rx only, Tx only, or both | | done |
| Auto-rotate by size/time | | todo |
| Record raw session for replay | Beyond RealTerm | todo |

### Plotting (beyond RealTerm)
| Feature | Notes | Status |
|---|---|---|
| Auto-detect `a,b,c`, whitespace, `key:value`, `label=value` | | done |
| Multi-series, rolling window or full history, pause/scrub | | done |
| Zoom/pan, cursors, min/max/mean | | partial: zoom only |
| Per-series scale/offset/expression | | todo |
| XY mode, FFT | | todo |
| Export PNG/CSV | | partial: CSV only |
| Click point to jump to raw bytes | | done |

### Layout (decided: single workspace)
| Region | Contents |
|---|---|
| Top bar | Port picker, settings chip (`115200 8N1`, popover for the rest), Connect, DTR/RTS toggles, Break; view switch Terminal / Split / Plot |
| Main | Terminal and plot over the same stream; split is resizable; clicking a plot point scrolls the terminal to its line |
| Pane toolbars | One thin row per pane |
| Send bar | Text/Hex, input with history, line ending, Send; quick-send strip only once buttons are defined |
| Right drawer | Capture, macros, port details, profiles; slides over the main area on demand. Only panels that exist are listed |
| Status bar | CTS/DSR/DCD/RI LEDs, rx/tx bytes and rate, error count, capture indicator; each shown only when it carries information |
| Multiple ports | Tab strip above the top bar, only when a second port is open |

- Output line controls (DTR, RTS) sit with Connect; input signals sit in the status bar.
- First connect opens Terminal only; the first numeric line switches to Split unless the user has picked a view.
- Narrow windows (< ~700 px) stack the split vertically.
- Keyboard: Ctrl+L clear, Esc focus send input; command palette (Ctrl+K) and find (Ctrl+F) to follow.

## Decisions
- Half-duplex: local echo of Tx plus optional RTS direction control.
- Capture without the File System Access API: data is held in memory and the capture stays open. View and Download become available on the capture control; nothing downloads automatically on stop. Chromium with the API streams straight to the chosen file.
- Package manager: pnpm.

## Changelog
| Date | Change |
|---|---|
| 2026-11-03 | Initial layout and parity checklist drafted. |
| 2026-11-03 | Resolved half-duplex, capture fallback and pnpm decisions. |
| 2026-11-03 | Scaffolded pnpm workspace and `packages/core`: `SerialTransport` interface, capability flags and option checking, `LoopbackTransport` mock (RTS→CTS, DTR→DSR) with tests. |
| 2026-11-03 | Added `ByteRing` (absolute-offset ring buffer), `LineSplitter` (cr/lf/crlf/auto, partial-line peek, CRLF across chunks) and byte formatters (hex, binary, decimal, ASCII with optional control pictures, hex dump rows). |
| 2026-11-03 | Added `transport-webserial`: maps options and signals onto Web Serial, timed break, survives framing/parity errors by resuming on the replacement stream, self-closes on unplug. Tested against an in-memory fake `SerialPort`. `@types/w3c-web-serial` pinned to 1.0.8; 1.0.9 is an empty stub for TS 7.1+. |
| 2026-11-03 | Added `parseEscapes` (`\r \n \t \0 \\ \xNN`, UTF-8 for non-ASCII, error on malformed `\x`) and `parseHexBytes`. Added `apps/web`: a minimal Svelte page over Web Serial or Loopback with connect, capability-aware port settings, ASCII/hex views, receive newline mode, text/hex send and byte counters. It is a working harness, not the final layout; the views still render plain text, not the virtualized canvas the architecture calls for. Checked live in Chromium: exact bytes in both views, settings reset when switching to Web Serial, 2000 back-to-back sends rendered in about 0.4 s, no horizontal scroll at phone width. |
| 2026-11-03 | Built layout A. Core: `parseNumericLine`, `SeriesStore`, `TerminalLog`, `decimateMinMax`. Web app: top bar with granted-port list and settings popover, DTR/RTS/Break; canvas-virtualized terminal (ASCII with tx echo and timestamps, hex/dec/bin dump, line selection and copy); uPlot pane with time window, pause, CSV export, click-to-jump; resizable split that stacks below 700 px; send history; status bar with line signals, rate and errors. Tx echo is logged before the write so it precedes the reply, and its terminator is hidden to match rx lines. Plot draws min/max per pixel column and redraws at most 30 Hz. Measured in headless Chromium with loopback: terminal holds 60 fps at 92 kB/s; a 1.6 MB/s flood stays responsive. Plot frame times there (median ~33 ms) are dominated by SwiftShader CPU rasterisation, not app code (JS ~7% of profile; a bare canvas with comparable strokes is slower); still to be confirmed on real hardware. Parsing still runs on the main thread; moving the pipeline to a worker is outstanding. |
| 2026-11-03 | Capture: core `Capture` (raw / timestamped text lines / timestamped hex chunks, RX/TX/both with tags, byte and time limits with exact truncation, pause, serialised writes, sink failure stops with reason). Web: `FileSink` streams via File System Access with 64 kB / 500 ms batching and real append (seek to end); `MemorySink` with View/Download/Discard. Opened from a Capture button in the top bar rather than an icon rail, since it is the only drawer panel so far; status bar shows REC and size. Sent data is captured before the write, like the echo, so it precedes its reply. Checked live with an OPFS-backed stub of the save dialog: overwrite, append, 7-byte limit landing exactly on `hello\r\n`, capture surviving disconnect, download content identical to the in-memory blob. |

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
| Enumerate/select port | Friendly names where the transport allows; hot-plug refresh | todo |
| Baud, incl. custom | Presets plus free entry | todo |
| Data bits 5-8, stop 1/1.5/2, parity N/E/O/M/S | Mark/space Node-only | todo |
| Flow control: none, RTS/CTS, DTR/DSR, XON/XOFF | XON/XOFF Node-only | todo |
| DTR, RTS set/clear/toggle | One-click toggles | todo |
| Line indicators CTS, DSR, DCD, RI | Live, with change timestamps | todo |
| Send break (timed) | | todo |
| Open/close, auto-reconnect on re-plug | Better: reconnect to same device | todo |
| Multiple ports at once | Tabs/split | todo |
| Rx/Tx byte and error counters, rate | Frame/parity/overrun where reported | todo |

### Display
| Feature | Notes | Status |
|---|---|---|
| ASCII | Control chars optionally visible | todo |
| Hex, hex+ASCII, binary, decimal | Configurable bytes per row | todo |
| int8/16/32, uint, float32/64, endian | | todo |
| Rx/Tx interleaved vs split views | Tx echo shown in distinct color | todo |
| Newline handling: CR, LF, CRLF, auto, "newline on N bytes" | | todo |
| ANSI/VT100 escape handling | Colors, cursor, clear | todo |
| Timestamps (absolute, delta) per line/chunk | | todo |
| Scrollback limit, pause/freeze, auto-scroll | Freeze must not drop data | todo |
| Find, filter, highlight rules | Regex | todo |
| Display of sync/"frame" boundaries by gap time | Idle-gap splitting | todo |

### Send
| Feature | Notes | Status |
|---|---|---|
| Text with escapes (`\r \n \xNN`) | | todo |
| Hex/byte entry | | todo |
| Append CR/LF/custom, checksum/CRC | Common CRCs | todo |
| Send file, with inter-byte and inter-line delay | Progress, cancel | todo |
| Repeat N / forever, interval | | todo |
| Quick-send buttons / history | Better than RealTerm's per-tab entry | todo |
| Local echo | | todo |
| Half-duplex mode (Tx waits for/loops on Rx, RTS-controlled direction) | Behavior spec to confirm | todo |
| Send with char-by-char echo wait ("handshake") | | todo |

### Capture and logging
| Feature | Notes | Status |
|---|---|---|
| Capture to file: append / overwrite | File System Access API streams to disk; otherwise in-memory with View/Download | todo |
| Start/stop/pause, capture-after-N-bytes, auto-stop | | todo |
| Raw vs formatted vs timestamped output | | todo |
| Rx only, Tx only, or both | | todo |
| Auto-rotate by size/time | | todo |
| Record raw session for replay | Beyond RealTerm | todo |

### Plotting (beyond RealTerm)
| Feature | Notes | Status |
|---|---|---|
| Auto-detect `a,b,c`, whitespace, `key:value`, `label=value` | | todo |
| Multi-series, rolling window or full history, pause/scrub | | todo |
| Zoom/pan, cursors, min/max/mean | | todo |
| Per-series scale/offset/expression | | todo |
| XY mode, FFT | | todo |
| Export PNG/CSV | | todo |
| Click point to jump to raw bytes | | todo |

### UX direction
- Single window, collapsible side panels, command palette and keyboard shortcuts.
- Dark/light theme, saved profiles per device.
- Status bar for line signals and counters; nothing shown when idle.

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

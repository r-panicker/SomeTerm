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
| Data bits 5-8, stop 1/1.5/2, parity N/E/O/M/S | Mark/space Node-only | done: desktop all except M/S and 1.5 off Windows (binding limit); browser 7/8 N/E/O |
| Flow control: none, RTS/CTS, DTR/DSR, XON/XOFF | XON/XOFF Node-only | done except DSR/DTR (no binding supports it); XON/XOFF desktop only |
| DTR, RTS set/clear/toggle | One-click toggles | done |
| Line indicators CTS, DSR, DCD, RI | Live, with change timestamps | done |
| Send break (timed) | | done |
| Open/close, auto-reconnect on re-plug | Better: reconnect to same device | partial: no auto-reconnect |
| Multiple ports at once | Tabs/split | done: tabs, merged Monitor (rx + tx), forwarding between ports, restore on launch |
| Rx/Tx byte and error counters, rate | Frame/parity/overrun where reported | done |

### Display
| Feature | Notes | Status |
|---|---|---|
| ASCII | Control chars optionally visible | done |
| Hex, hex+ASCII, binary, decimal | Configurable bytes per row | done (bytes per row fixed) |
| int8/16/32, uint, float32/64, endian | | done (plus byte alignment) |
| Rx/Tx interleaved vs split views | Tx echo shown in distinct color | done |
| Newline handling: CR, LF, CRLF, auto, "newline on N bytes" | | done |
| ANSI/VT100 escape handling | Colors, cursor, clear | done: SGR colour/styles; cursor and erase sequences removed (line-oriented by design) |
| Timestamps (absolute, delta) per line/chunk | | done |
| Scrollback limit, pause/freeze, auto-scroll | Freeze must not drop data | done (pause = scroll up) |
| Find, filter, highlight rules | Regex | partial: find + filter done; persistent highlight rules not yet |
| Display of sync/"frame" boundaries by gap time | Idle-gap splitting | todo |

### Send
| Feature | Notes | Status |
|---|---|---|
| Text with escapes (`\r \n \xNN`) | | done |
| Hex/byte entry | | done |
| Append CR/LF/custom, checksum/CRC | Common CRCs | done |
| Send file, with inter-byte and inter-line delay | Progress, cancel | done |
| Repeat N / forever, interval | | done |
| Quick-send buttons / history | Better than RealTerm's per-tab entry | partial: history only |
| Local echo | | done |
| Half-duplex mode (Tx waits for/loops on Rx, RTS-controlled direction) | Behavior spec to confirm | partial: echo + RTS while sending; Tx does not wait for Rx |
| Send with char-by-char echo wait ("handshake") | | todo |

### Capture and logging
| Feature | Notes | Status |
|---|---|---|
| Capture to file: append / overwrite | File System Access API streams to disk; otherwise in-memory with View/Download | done |
| Start/stop/pause, capture-after-N-bytes, auto-stop | | partial: no capture-after-N-bytes start |
| Raw vs formatted vs timestamped output | | done |
| Rx only, Tx only, or both | | done |
| Auto-rotate by size/time | | done: numbered files in a chosen folder |
| Record raw session for replay | Beyond RealTerm | todo |

### Plotting (beyond RealTerm)
| Feature | Notes | Status |
|---|---|---|
| Auto-detect `a,b,c`, whitespace, `key:value`, `label=value` | | done |
| Multi-series, rolling window or full history, pause/scrub | | done |
| Zoom/pan, cursors, min/max/mean | | partial: zoom only |
| Per-series scale/offset/expression | | done |
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
| 2026-11-03 | Send side. Core: `checksumBytes`/`frame` (Sum8, XOR8, CRC-8, CRC-16/MODBUS, CRC-16/CCITT-FALSE, CRC-32; verified against the standard `123456789` check values and a textbook Modbus request), `planWrites`/`sendPaced` (byte and line delays, 4 kB chunks otherwise, cancel between writes), `repeatSend` (interval start to start, 0 = forever). Web: send options popover whose button shows active options; `Send ×N` / `Send ∞`; File… with progress and Stop; RTS-while-sending holds RTS for the estimated airtime after the last write, since `write()` resolves when the driver has the data, not when it is on the wire. Checked live over loopback: exact bytes for each mode, repeat and delay timings match settings, cancel leaves a partial send, RTS seen high during send and restored after. Top bar tightened below 700 px so it stays one row down to ~560 px. |
| 2026-11-03 | Desktop app. `transport-node`: `NodeSerialTransport` over `serialport` 13; capabilities taken from the binding source, not docs: mark/space parity and 1.5 stop bits are Windows-only, no OS supports DSR/DTR flow, RI is never reported (new `ringIndicator` capability hides the RI LED). The binding's `set()` resets unspecified lines, so DTR/RTS/break are always sent together. IPC bridge: `serveSerialBridge` (main) and `IpcSerialTransport` (renderer) over a plain-data `NativeSerialBridge` exposed by a sandboxed, context-isolated preload. `apps/electron`: esbuild-bundled main/preload, `serialport` external for its native binary, blob: windows allowed for capture View, other navigation denied. Web app detects the bridge and lists OS ports, polling every 2 s while idle. `SUPERSERIAL_EXTRA_PORTS` adds ports the OS does not enumerate. Found in live testing: port enumeration fails without `udevadm` (now degrades to extra ports), and ports without modem lines (ptys) failed to connect because the initial DTR/RTS set threw; connection now proceeds with DTR/RTS disabled and a tooltip reason. Tests: mock binding (exact bytes, full-state signal writes, unplug), real native binding over a Python pty echo (all 256 byte values), full IPC round trip with structured cloning; Electron driven by Playwright under Xvfb over a pty with XON/XOFF. Vite `base: './'` so the build loads from file://. |
| 2026-11-03 | Receive parsing moved off the main thread. Core `RxPipeline` (split, render, numeric parse) runs in a module worker that batches results every 8 ms; the ring buffer and capture stay on the main thread as plain copies. If the worker never reports ready, the same class runs inline and replays queued commands. `TerminalLog.pushRx` places a late-arriving rx line before newer tx echoes. Fixed: changing the receive line ending restarted line offsets at 0, so plot-click jumps went to the wrong line afterwards (`LineSplitter` now takes a start offset). Fixed: in LF mode a CRLF sender's lines kept a trailing CR and stopped plotting; numeric parsing now ignores trailing CRs while the terminal still shows them. Measured in headless Chromium: 3 s loopback flood went from 1.6 MB/s at 22 ms median / 51 ms p95 frames to 5.7 MB/s at 16.7 / 23 ms; worker confirmed running in the browser and in Electron loading from file://. |
| 2026-11-03 | Num display: core `decodeNumbers` (DataView, whole elements only) and `formatNumber` (fixed width per type; float32 at 7 significant digits so 0.1 reads as 0.1, exponent form when wider than the column, NaN/Inf spelled out). Terminal Num view: type, LE/BE, and a byte-alignment skip; 16 bytes per row with raw hex beside the values. Fixed: the canvas only redrew on new data or resize, so toggling timestamps or changing display settings did not show until the next byte arrived; the terminal now passes a revision covering every display setting. Checked live against hand-decoded values for int16 LE/BE, uint16, float32, int32 and a +1 alignment. |
| 2026-11-03 | Find and filter. Core: `buildMatcher` (literal or regex, case toggle, skips empty matches, invalid regex reported as a message) and `FindIndex` (incremental: only new lines are matched, positions are absolute line numbers so front-trimming does not misalign them, the newest 64 lines are rescanned because late rx lines can be slotted before recent echoes). `TerminalLog` gained `dropped`; `clear()` now counts as dropping every line, so line numbers are never reused. Terminal: Ctrl+F opens find inside the existing toolbar row (format buttons and Clear step aside so it fits a half-width pane), match/current highlights drawn on the canvas, Enter/Shift+Enter with wrap-around, Filter shows only matching lines and follows new data. Measured: search over 100k lines ~35 ms. A Svelte effect that read and wrote its own counter looped until it converged; the bookkeeping now runs untracked. |
| 2026-11-03 | ANSI. Core `AnsiParser` in the receive pipeline: SGR (16/256/24-bit colour, bold, dim, italic, underline, inverse and their resets) becomes style runs over the visible text; CSI non-SGR, OSC and charset escapes are removed; style carries across lines; partial lines parse without committing state; a truncated sequence at line end is dropped. Lines that contained escapes also keep a raw rendering for the ANSI toggle, so memory only grows for coloured lines. Numeric parsing uses the stripped text, so coloured readings plot. `FindIndex` takes a `textOf` so search matches what is drawn (stripped or raw). Web: per-theme 16-colour palette (yellow readable on white, black visible on dark), canvas spans with explicit colours, background, bold/italic/underline/dim; one segmenter splits lines at both style and match edges. Pane toolbars tighten via a container query below 520 px so ASCII, Num and Find rows stay single-line in a half-width pane. Known: under a ~6 MB/s loopback flood an occasional frame stalls (249 ms here, 773 ms before this change), likely GC or buffer trimming; steady 92 kB/s is unaffected. |
| 2026-11-03 | Multiple ports (option C). Core: `TermLine.src` and `TerminalLog.pushByTime` (bounded backward scan) to merge ports by time. Web: `CaptureController` extracted from `Session`; `Terminal` reads a `TermSource` so a port and the Monitor share find, ANSI, timestamps and selection; `Workspace` owns lettered tabs, keeps inactive tabs mounted so their state survives switching, and blocks opening a port another tab holds. `Monitor` merges every port's rx lines and sends (sends regardless of the echo toggle, as requested) and captures the merged timeline as tagged text. Forwarding writes a port's received chunks out of another port; forwarded bytes are counted and captured on the target but not echoed there or added to the Monitor, which already has them as the source's rx. Restore uses its own storage key (`superserial.workspace.v1`), separate from future device profiles, and never reopens ports (DTR resets boards); Web Serial ports are matched by USB IDs only when unique. Found while testing: feeding the Monitor with a single tab halved flood throughput (it is now wired only with two or more tabs, and capture lines are formatted only while capturing); echo text was built even with echo off and no Monitor; the top bar wrapped at 800 px with two tabs (the + moved into the tab strip, forward select shortened); the tab strip showed a stray scrollbar. Measured: two ports each at 921600 baud with the Monitor visible hold 60 fps (p95 17.9 ms); one-tab flood back to ~6 MB/s. Verified in Electron over two real ptys: port conflict, bridge, and restore after quit. Known: with two tabs the top bar wraps below ~700 px. |
| 2026-11-03 | Device profiles (option C, silent auto-apply, Num settings included). Display settings (format, Num type, byte order, alignment, timestamps, ANSI), send line ending and plot window moved from components into the session, so profiles and tab restore can set them. Core `profiles.ts`: `matchProfile` (serial match beats model match, model match applies to any board, ties go to the latest save), `exportProfiles` (drops serial numbers so a shared profile matches every board of the model), `parseProfiles` (strict envelope, per-profile sanitize, skips bad entries, rejects files from a newer version), `uniqueName`. Web: `ProfileStore` in localStorage (`superserial.profiles.v1`, separate from the workspace key), `sanitizeSettings` falls back per field and rejects only an unusable baud rate; auto-apply on choosing a port, on the desktop default port, and on a newly granted Web Serial port before it opens; restore picks the port first and then applies saved settings so a matching profile cannot overwrite them. Settings popover opens while connected (port fields locked with the reason) so Save as and Update work mid-session; profile entries are disabled while connected. Desktop port list now carries USB vendor/product IDs and serial numbers through the bridge. Checked live with a fake Web Serial exposing an ESP32 and an Arduino: save with device match, dirty marker and Update, no match on the other board, full re-apply on return (baud, Num int32 BE, +LF), rename, export without serial, import with rename on clash, bad-file message, forget device, restore beating the match. Narrow-window fixes: popover widened so the profile select is readable; the name truncates below 760 px and hides below 660 px (kept in the tooltip). Known: with one tab connected the top bar fits down to 640 px; at 600 px it wraps (the + button for tabs). |
| 2026-11-03 | Capture rotation. Core `RotatingSink` closes and opens numbered files when the current one reaches a byte or age limit, checked before each write: Capture writes whole records, so a line or hex chunk is never split, and an idle link creates no empty files. Web: splitting needs `showDirectoryPicker`, because a save dialog grants one file only; with a split set, Start becomes Choose folder… and Overwrite/Append disappears (every file is new). Memory capture offers no split. Raw captures now use `.bin`. Status shows the current file and file count. Checked live with an OPFS-backed folder picker: a 524-byte split gave three files that each end on a newline and together hold all 30 lines in order; a 1.2 s split separated two sends; the earlier single-file test still passes. |
| 2026-11-03 | Plot transforms. Core `compileExpr`: recursive-descent compiler for expressions in `x` (numbers, `pi`, `e`, + - * / ^ right-associative, unary minus, a fixed function list) producing closures; no JavaScript is evaluated, errors name the position. `decimateMinMax` takes per-column transforms applied before min/max, so non-monotonic ones keep the true envelope. Web: ƒx popover per series (expression, unit); invalid expressions are flagged and leave the series raw; legend shows `name [unit]` and transformed hover values; CSV exports transformed values with units, and times are rounded to microseconds (they carried float noise). Transforms are display-only, kept per series name in the session, included in profiles (sanitized: only compiling expressions survive an import) and in tab restore. Checked live: 12-bit ADC to volts and an offset/scale to °C, hover, CSV, invalid-expression flag, profile contents, restore. |


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

To build the desktop app as an installer for the machine you are on:

```bash
pnpm dist:electron
```

The result is in `apps/electron/release/`: an AppImage on Linux, an installer `.exe` on Windows, a `.dmg` on macOS. Each OS builds its own; the **Build and release** GitHub workflow builds all three, plus a zip of the web app, when started by hand. Builds are unsigned; the [README](../README.md#desktop-app) says how to get past SmartScreen and Gatekeeper on first launch.

To publish a release, either push a version tag, or start **Build and release** from the repository's Actions tab with the tag (e.g. `v0.2.0`) typed into **Release tag**. The workflow builds everything, creates a GitHub release named after the tag with the installers and `SuperSerial-web-<version>.zip` attached, and updates the browser version on the `web` branch. A tag with a hyphen (`v0.3.0-rc.1`) is marked as a pre-release.

```bash
git tag v0.2.0
```

```bash
git push origin v0.2.0
```

The web zip is a static site: serve it from any web server, or with `python -m http.server` in the unzipped folder for `http://localhost:8000`. Web Serial only works over HTTPS or on `localhost`, and not from a file opened directly.

To use a port the OS does not list (socat, other virtual ports), start the desktop app with `SUPERSERIAL_EXTRA_PORTS=/dev/pts/5` (several separated by `:`, or `;` on Windows).

## Connecting

Pick a port, check the settings chip (`115200 8N1`), then Connect. In the browser, **Add port…** opens the port picker, and ports you have granted before are listed by vendor and USB ID. The desktop app lists every port the OS reports and refreshes the list while disconnected. **Loopback** echoes whatever you send, which is handy for trying settings without hardware.

Settings a port cannot do are greyed out; hover for the reason.

**⚙** (Ctrl+,) opens every setting of the current tab in one place, grouped as Port, Display, Send, Capture, Plot, Automation (colour rules and auto-replies) and Profiles. These are the same settings the chip, menus and popovers change, so use whichever is closer.

If the device is unplugged or resets its USB connection, the tab waits for it (**Waiting…**) and reconnects with the same settings when it returns, even under a new port name. The terminal marks the gap with `── device lost ──` and `── reconnected ──`, and a running capture continues. Click **Waiting…** to stop waiting; **Disconnect** never waits. Disconnect to change settings.

DTR and RTS toggle the output lines (green is asserted); a timed **Break** is in the settings chip. Input lines CTS, DSR, DCD and RI are shown in the status bar. Virtual ports often have no modem lines; DTR and RTS are then greyed out.

## Recording and replay

Choose **Session recording** as the capture format to save a replayable `.ssrec` file: both directions with their timing, plus line-signal changes (CTS, DSR, DCD, RI and your DTR/RTS toggles). A recording is always one file, so splitting is not offered for it.

**Open recording…** in the port list loads one; **Connect** plays it like a live port, so the terminal, plot, find, spectrum, Monitor and capture all work on it. The chip shows the port settings it was recorded with, and timestamps are the original times. Sent data appears as `→` lines; nothing is transmitted, and the send bar is off.

| Control | Use |
|---|---|
| ▶ / ❚❚ | Play or pause; at the end, ▶ starts over |
| 1× 2× 10× Max | Replay speed; Max goes as fast as the view keeps up |
| Slider | Seek; the view is rebuilt up to that point |
| DTR RTS | Output lines as recorded, if the recording has any |

A recording from a crashed session still opens, up to its last complete record.

## Profiles

A profile stores a device's settings: port settings, DTR/RTS, receive line ending, echo, the terminal display (including Num type and byte order, timestamps, ANSI), send line ending, checksum and delays, view, and plot window.

Save one from the settings chip: **Profile → Save as…**. With **Apply to … automatically** ticked, choosing that device's port applies the profile by itself; nothing is sent to the device, only the settings change. A profile saved in the desktop app also records the board's serial number, so it matches that one board rather than every board of the model.

The chip then reads `ESP32 · 115200 8N1`; a • means the settings have changed since, and **Update** saves them into the profile. Profiles can be applied only while disconnected.

**Manage…** renames, deletes, exports and imports profiles. An exported `.superserial.json` file leaves out serial numbers, so a profile shared for a lab matches every student's board of that model. Tabs restored on launch keep their own settings; profiles apply when you choose a port.

## Several ports

**+** opens another port in a new tab. Tabs are lettered A, B, …; a port open in one tab is greyed out in the others.

| Tab | Use |
|---|---|
| Port tabs | Each is a full terminal, plot, send bar and capture for one port |
| **Monitor** | Every port's sent and received lines on one timeline, tagged `A›`, `B›`. For spying on a link with two adapters, connect one to each wire. Its Capture writes the merged timeline as text |

**Forward** in a port's settings chip forwards everything that port receives out of another port (the chip then shows `→B`), to sit between two devices (set it on both tabs for both directions). Forwarded bytes count as sent on B but are not echoed there, and the Monitor shows them once, as received on the source port. Do not forward through a loopback plug in both directions: the data circulates forever.

Tabs, port choices and settings are restored on the next launch, but ports are not reopened: opening a port toggles DTR, which resets many boards. In the browser a port is only restored if exactly one granted port has its USB IDs.

## Sending

| Mode | Input | Example |
|---|---|---|
| Text | Escapes `\r \n \t \0 \\ \xNN`; the selected line ending is appended | `AT\r` |
| Hex | Bytes separated by spaces or commas, optional `0x` | `0D 0A 41` |

↑ and ↓ recall earlier sends. What you send appears in the terminal as → lines (turn off with **Show sent data** in the terminal's ⋯ menu).

The ⋯ button holds send options; once any is set, the button shows it instead (`CRC-16/MODBUS · paced`).

| Option | Effect |
|---|---|
| Checksum | Appended after the payload, before the line ending. Hover an entry for its polynomial and byte order |
| Repeat | Send N times (0 = until **Stop**), interval measured start to start |
| Delay | Pause after every byte and/or every line ending; also applies to files |
| Echo wait | Send one byte at a time and wait for the device to echo it; stops and says which byte if the echo is missing or wrong |
| Half duplex | Raise RTS for each send and restore it afterwards, for RS-485 style direction control |

**Send file…** (in the ⋯ options) sends a file's bytes as-is, paced by the delay settings; **Stop** cancels between writes.

## Auto-replies

**Auto-replies…** in the terminal's ⋯ menu answers patterns automatically, for login prompts, handshakes or keep-alives. **+** adds one: a pattern (text, or a regular expression with **.\***; `$1`…`$9` in the reply insert its groups), the reply (send-box escapes) and an optional delay. A rule answers each matching line once, including a prompt that has no newline yet such as `Password:`. Replies show as `↩` lines, and while any rule is on the toolbar shows `↩ N`. A rule that fires more than 10 times a second (usually a reply that matches itself through an echo) is switched off and reported. Auto-replies are kept with the tab and in profiles; ones imported from a profile file arrive switched off.

## Terminal

**Type** turns the terminal into a terminal emulator, as in GTKTerm or TeraTerm: click in it and keys go straight to the device. Enter sends the send bar's line ending (CR if none is set), Backspace sends BS, arrows and Home/End/Delete send the usual VT sequences, and Ctrl+letter sends the control code (Ctrl+C copies instead when lines are selected). Pasting sends the text. App shortcuts still work with Ctrl+Shift (Ctrl+Shift+F to find). Most device shells echo what you type; for one that does not, tick **Local echo while typing** in the ⋯ menu to see your typing in the sent-data colour.

ASCII shows lines; control characters appear as symbols such as ␀ and non-ASCII bytes as `.`. The terminal's ⋯ menu holds the view options: receive **Line ending** (match the device; `Auto` treats CR, LF and CRLF each as one line break), **Timestamps**, **ANSI colours**, **Control characters** (every non-printing byte as `[CR]`, `[LF]`, `[TAB]`, `[NUL]` or hex such as `[FF]`, line endings included, RealTerm style) and **Show sent data**. The ⋯ button is highlighted while any of them differs from the default. Hex, Dec and Bin show the raw received stream with offsets. Num decodes it as 8, 16 or 32-bit integers or 32/64-bit floats, with the raw bytes alongside:

| Control | Use |
|---|---|
| Type | `int16`, `float32`, … signed and unsigned |
| LE / BE | Byte order of the sender (most microcontrollers are LE) |
| +0 … +7 | Skip bytes until values line up with the sender's framing |

**Find** (Ctrl+F) searches the ASCII view, sent and received lines alike. Enter and Shift+Enter step through matches; **Aa** matches case, **.\*** takes a regular expression, and **Filter** hides lines without a match. New data is searched as it arrives. Esc closes find.

**Colour rules** (in the ⋯ menu) keep patterns coloured all the time, in every tab and the Monitor: **Line** tints the whole line, **Match** colours the matched text in bold over any ANSI colour. Earlier rules win where they overlap; drag ⋮⋮ to reorder. **Add common rules** gives errors red, warnings amber and OK/pass green. In the find bar, **+ Rule** turns the current search into a rule. Rules only change how lines look; capture, copy and find are unaffected.

ANSI colour codes are shown as colour; other escape sequences (cursor movement, clear screen, titles) are removed rather than acted on, since this is a scrolling log, not a screen. Turn **ANSI colours** off to see the raw codes as `␛[31m`. Coloured numeric lines still plot.

Drag to select lines, Ctrl+A for all, then Ctrl+C. Scrolling up pauses following; **↓ Live** resumes.

## Plotting

Any received line made only of numbers is plotted, Arduino style:

| Line | Series |
|---|---|
| `12,34,56` or `12 34 56` | 1, 2, 3 |
| `temp:23.1,hum:41` or `temp=23.1 hum=41` | temp, hum |

The first such line switches to Split view. Click a point to jump to its line in the terminal. Drag across the plot to zoom, double-click to reset. Click a legend entry to hide that series. **vs time** switches to an XY plot of the other series against the one you pick, e.g. a Lissajous figure or an I–V curve. The time window still selects which samples are used; clicking a point jumps to its line as usual.

**Spectrum** in the same selector shows each series' amplitude in dB against frequency, using the newest 32 to 16384 samples in the time window (Hann window, mean removed). The toolbar shows the strongest frequency. The sample rate is estimated from arrival times, which is typically within a few percent; for exact frequencies, type the device's real sample rate into the Hz box.

**Σ** lists min, max, mean, standard deviation and sample count for each series over what is visible: the time window, or a range you zoom into after pausing. **A|B** turns clicks into cursors: the first click places A, the next B; the readout gives each series' value at both and the difference, with Δt also as a frequency. Cursors work on the spectrum too (Δf).

**ƒx** converts a series for display: an expression in `x` (the received value) and a unit, e.g. `x*3.3/4095` in `V` for a 12-bit ADC, or `(x-500)/10` in `°C`. Available: `+ - * / ^`, `pi`, `e`, `abs sqrt exp ln log sin cos tan min max pow round floor ceil`. The terminal still shows the raw numbers. Conversions are saved with the tab and in profiles.

CSV exports everything plotted since the last Clear, converted, with units in the header.

## Capture

**Capture** in the top bar opens the capture panel. Capture is independent of the connection: it keeps running across disconnects until you stop it or a limit is reached.

| Format | One record per | Use for |
|---|---|---|
| Text, timestamped lines | received line, prefixed `YYYY-MM-DD HH:MM:SS.mmm` | logs to read or grep |
| Raw bytes | byte, exactly as received | binary data, replay |
| Hex, timestamped chunks | chunk as it arrived | timing and framing questions |

**More options** holds the rest: **Start after** N bytes or a piece of text (escapes allowed; the text itself is captured, and the capture shows ◌ ARMED until it appears), **Stop after** N bytes or seconds, and **Split every**. It stays open while any of these is set.

**Split every** N MB and/or N min writes a numbered series (`…-001.txt`, `…-002.txt`) into a folder you choose, for long unattended logs. A line or hex chunk is never split across two files, and an idle link does not create empty files.

Choosing **Both** tags each record `RX` or `TX`. **File** streams to disk as data arrives (Chrome and Edge); **Memory** keeps it until you View, Download or Discard. Leave a limit empty for no limit.

## Shortcuts

| Key | Action |
|---|---|
| Ctrl+F | Find in terminal |
| Ctrl+, | Open or close Settings |
| Ctrl+Tab | Next tab (desktop app; browsers keep this key) |
| Ctrl+L | Clear terminal, plot and error count |
| Esc | Close the capture panel, else focus the send box |

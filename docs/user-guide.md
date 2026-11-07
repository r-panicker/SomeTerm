# SomeTerm user guide

## Getting SomeTerm

| Version | How |
|---|---|
| Browser | Open https://r-panicker.github.io/SomeTerm/ in Chrome or Edge. Other browsers have no Web Serial, so they offer only Loopback |
| Desktop | Download the installer from [Releases](https://github.com/r-panicker/SomeTerm/releases/latest); the [README](../README.md#desktop-app) says how to get past SmartScreen and Gatekeeper on first launch |

Both run the same app. The desktop app talks to the OS serial driver directly, so it can do more:

| | Browser | Desktop |
|---|---|---|
| 5 and 6 data bits, XON/XOFF | no | yes |
| Mark/space parity, 1.5 stop bits | no | Windows only |
| DSR/DTR flow control | no | no |
| RI input | yes | no |
| Port names | USB vendor and ID; others numbered (see [Connecting](#connecting)) | the system's own (`COM3`, `/dev/ttyUSB0`) |
| Ports the OS does not list (socat, ptys) | no | **Enter path…** |
| TCP and Telnet | no | yes |

### Building and releasing

Needs Node 22 and pnpm.

```bash
pnpm install
pnpm dev            # browser: open the printed URL in Chrome or Edge
pnpm dev:electron   # desktop app
pnpm dist:electron  # installer for this OS, in apps/electron/release/
```

To publish a release, push a version tag, or start **Build and release** from the Actions tab with the tag typed into **Release tag**. It builds the installers for all three OSes and `SomeTerm-web-<version>.zip`, and attaches them to a GitHub release named after the tag. A tag with a hyphen (`v1.0.0-rc.1`) is marked as a pre-release.

```bash
git tag v1.0.0
```

```bash
git push origin v1.0.0
```

The browser version on GitHub Pages is rebuilt on every push to `main` by the **Pages** workflow; its About line shows the commit. Pages must be switched on once: repository **Settings → Pages → Source: GitHub Actions**.

The web zip is a static site: serve it from any web server, or with `python -m http.server` in the unzipped folder for `http://localhost:8000`. Web Serial only works over HTTPS or on `localhost`, not from a file opened directly.

To have ports the OS does not list appear in the desktop app's list from the start, launch it with `SOMETERM_EXTRA_PORTS=/dev/pts/5` (several separated by `:`, or `;` on Windows).

## Connecting

The first list on the top bar picks the type of connection: **Serial**, **Network** (TCP or Telnet, desktop app), **Loopback** or **Open recording…**. Changing it opens the Port tab, where that type is set up. For Serial, pick the port in the list beside it, check its settings on the Port tab (the status bar shows them as `115200 8N1`), then Connect. The baud list has the common rates; **Other…** takes any rate the adapter supports, such as 31250 for MIDI. In the browser, **Add port…** opens the browser's port picker straight away, and ports you have granted before are listed by vendor and USB ID. A browser does not reveal port names, so ports without a USB ID (built-in, Bluetooth, virtual) and identical adapters are numbered in the order you added them: `Serial port #1`, `Serial port #2`. The desktop app lists every port the OS reports, refreshed whenever you open the list; **Enter path…** takes one it doesn't list, such as a socat pty (`/dev/pts/5`, `COM7`). **Loopback** echoes whatever you send, which is handy for trying settings without hardware.

Settings a port cannot do, or that do nothing in the current view (the Plot tab in Terminal view, say), are greyed out; hover for the reason.

Settings live in the tabs under the terminal, the way RealTerm lays them out:

| Tab | Holds |
|---|---|
| Display | Display as (ASCII, Hex, Dec, Bin, Int/Float), line ending, timestamps, wrap, typing |
| Port | Baud and framing, or the TCP/Telnet connection; profile; Break; forwarding and bridging to another connection |
| Send | Send lines (ASCII or numbers), +CR/+LF, checksum, repeat, delays, file |
| Logging | Log received and/or sent data to a file or memory |
| Plot | Window, horizontal axis (time, XY, spectrum), conversions |
| Automation | Auto-replies, quick-send buttons, colour rules |
| Profiles | Saved profiles: rename, export, import |
| App | Theme, scrollback, reset to defaults, keys, version and credits |

**Hide** (or Ctrl+, or clicking the tab that is showing) folds the panel away for more room; **Show** or any tab brings it back. Ctrl+Shift+1…8 picks a tab from the keyboard. The status-bar summary, Plot view and REC bring their tab forward. **Reset to defaults** (App) keeps colour rules, auto-replies, quick-send buttons, send lines, theme, text size and scrollback unless **All** is ticked; profiles are never deleted, and port settings stay while connected.

If the device is unplugged or resets its USB connection, SomeTerm waits for it (**Waiting…**) and reconnects with the same settings when it returns, even under a new port name. The terminal marks the gap with `── device lost ──` and `── reconnected ──`, and a running log continues. Click **Waiting…** to stop waiting; **Disconnect** never waits. Disconnect to change settings.

DTR and RTS toggle the output lines (green is asserted); a timed **Break** is on the Port tab. Input lines CTS, DSR, DCD and RI are shown in the status bar. Virtual ports often have no modem lines; DTR and RTS are then greyed out.

## Recording and replay

Choose **Session recording** as the logging format to save a replayable `.strec` file: both directions with their timing, plus line-signal changes (CTS, DSR, DCD, RI and your DTR/RTS toggles). A recording is always one file, so splitting is not offered for it.

**Open recording…** in the connection type list loads one; **Connect** plays it like a live port, so the terminal, plot, find, spectrum, Monitor and logging all work on it. The status bar shows the port settings it was recorded with, and timestamps are the original times. Sent data appears as `→` lines; nothing is transmitted, and the send bar is off.

| Control | Use |
|---|---|
| ▶ / ❚❚ | Play or pause; at the end, ▶ starts over |
| 1× 2× 10× Max | Replay speed; Max goes as fast as the view keeps up |
| Slider | Seek; the view is rebuilt up to that point |
| DTR RTS | Output lines as recorded, if the recording has any |

A recording from a crashed session still opens, up to its last complete record.

## Profiles

A profile stores a connection's settings: port settings (or the TCP/Telnet host and port, which applying the profile switches to), DTR/RTS, received line ending, the Display tab (including Int/Float type and byte order), send options and send lines, quick-send buttons, auto-replies, the view, and plot settings. Theme, text size, scrollback and colour rules belong to the app, not to a profile.

Save one on the Port tab: **Profile → Save as…**. With **Apply to … automatically** ticked, choosing that device's port applies the profile by itself; nothing is sent to the device, only the settings change. A profile saved in the desktop app also records the board's serial number, so it matches that one board rather than every board of the model.

The status bar then reads `ESP32 · 115200 8N1`; a • means the settings have changed since, and **Update** saves them into the profile. Profiles can be applied only while disconnected.

The **Profiles** tab renames, deletes, exports and imports them. An exported `.someterm.json` file leaves out serial numbers, so a profile shared for a lab matches every student's board of that model. Connections restored on launch keep their own settings; profiles apply when you choose a port, or a profile by hand. Network connections have no USB ID, so their profiles are only applied by hand.

## Several connections

**+** opens another connection, starting from the settings of the one you were on (without its auto-replies or network target). Connections are lettered A, B, … along the top; a port open in one is greyed out in the others. Each has its own port and its own settings, and the tabs under the terminal always show the selected one's. Everything comes back the next time you open SomeTerm.

| Connection | Use |
|---|---|
| A, B, … | Each is a full terminal, plot, send bar and log for one port or network connection |
| **Monitor** | Every port's sent and received lines on one timeline, tagged `A›`, `B›`. For spying on a link with two adapters, connect one to each wire. Its Logging tab writes the merged timeline as text; its own tabs hold its view options, logging and colour rules |

**Connect to** (Port tab) forwards everything this connection receives out of another (the status bar then shows `→B`, or `⇄B` for a bridge); **bridge** does it both ways, to sit between two devices or to put a serial device on the network (see below). **⇄ new connection…** opens the other end for you. Bridging two serial ports works in the browser too. Forwarded bytes count as sent on B but are not echoed there, and the Monitor shows them once, as received on the source port. Do not forward through a loopback plug in both directions: the data circulates forever.

Connections, port choices and settings are restored on the next launch, but ports are not reopened: opening a port toggles DTR, which resets many boards. In the browser a port is only restored if exactly one granted port has its USB IDs.

## Network: TCP and Telnet

In the desktop app, **Network** as the connection type connects over TCP or Telnet instead of a serial port (a browser cannot open network connections). Set it up on the Port tab:

| Setting | Choice |
|---|---|
| Mode | **Client** connects to a host and port; **Server** listens, and any number of clients can connect, each getting everything sent |
| Protocol | **Raw TCP** passes bytes untouched; **Telnet** answers and hides option negotiation and escapes 0xFF |
| Host / Listen on | The server to reach, or `0.0.0.0` to accept clients from any network (`127.0.0.1` for this computer only) |
| Port | 1 to 65535; ports below 1024 usually need administrator rights |

Clients connecting and leaving are marked in the terminal. To put a serial device on the network, open it in one connection, a TCP or Telnet server in another, and on the server's Port tab choose **Connect to → ⇄ bridge** with the serial connection (or **⇄ new connection…** to open it there and then): whatever a client sends reaches the device, and whatever the device sends reaches every client.

## Sending

| Mode | Input | Example |
|---|---|---|
| Text | Escapes `\r \n \t \0 \\ \xNN`; the line ending ticked on the Send tab is appended | `AT\r` |
| Hex | Bytes separated by spaces or commas, optional `0x` | `0D 0A 41` |

↑ and ↓ recall earlier sends. Tick **Show sent data** on the Display tab to see what you send as → lines.

The Send tab's **send lines** keep commands you send often. **Send ASCII** sends a line as text with the ticked line ending; **Send Numbers** sends it as bytes written as numbers, each separated by a space or comma: `65`, `0x41`, `$41`, `41h`, `0b1000001` and `'A'` are all the same byte. Enter in a line sends ASCII, Shift+Enter numbers; **+** adds a line.

The send bar shows what will be added to a send (`+CR LF · CRC-16/MODBUS`); the options are on the Send tab:

| Option | Effect |
|---|---|
| Checksum | Appended after the payload, before the line ending. Hover an entry for its polynomial and byte order |
| Repeat | Send N times (0 = until **Stop**), interval measured start to start |
| Delay | Pause after every byte and/or every line ending; also applies to files |
| Echo wait | Send one byte at a time and wait for the device to echo it; stops and says which byte if the echo is missing or wrong |
| Half duplex | Raise RTS for each send and restore it afterwards, for RS-485 style direction control |

**Choose file…** (Send tab) picks a file without sending anything; **Send file** then sends its bytes as-is, paced by the delay settings, and **Stop** cancels between writes. To upload firmware to a bootloader, pick **XMODEM**, **XMODEM-1K** or **YMODEM** first, matching what the receiver expects (U-Boot: `loadx` for XMODEM, `loady` for YMODEM). Start the receiver before or after choosing the file: the transfer waits up to a minute for it to ask, and the device's messages stay visible until the first block goes out. Its result is marked in the terminal; **Stop** cancels and tells the receiver.

**☆** in the send bar saves what you've typed as a quick-send button. The buttons sit above the send bar; click one, or press Alt+1…9 for the first nine. A text button gets the line ending and checksum like a normal send; a hex one is sent as given. Each sends once, whatever **Repeat** says. **✎** at the end of the row edits them (Automation tab): rename, reorder, switch to hex or delete. They are saved with the tab and in profiles.

## Auto-replies

**Auto-replies** (Automation tab) answer patterns automatically, for login prompts, handshakes or keep-alives. **+** adds one: a pattern (text, or a regular expression with **.\***; `$1`…`$9` in the reply insert its groups), the reply (send-box escapes) and an optional delay. A rule answers each matching line once, including a prompt that has no newline yet such as `Password:`. Replies show as `↩` lines, and while any rule is on the toolbar shows `↩ N`. A rule that fires more than 10 times a second (usually a reply that matches itself through an echo) is switched off and reported. Auto-replies are kept with the tab and in profiles; ones imported from a profile file arrive switched off.

## Terminal

While connected, the ASCII terminal works like GTKTerm or TeraTerm: keys go straight to the device. Connecting or switching to a connection gives the terminal the keyboard (a blue frame shows it), and keys typed while nothing has focus go there too, so nothing typed is lost. Enter sends the send bar's line ending (CR if none is set), Backspace sends BS (or DEL, set on the Display tab; many Linux consoles want DEL), Esc sends ESC, arrows, Home/End/Delete and F1–F12 send the usual VT sequences, and Ctrl+letter sends the control code. Ctrl+A, Ctrl+F and Ctrl+L stay with the app (select all, find, clear), and Ctrl+C copies instead of sending when lines are selected; send those codes from the send bar as `\x01` and so on if the device needs them. Pasting sends the text. Most device shells echo what you type; for one that does not, tick **Local echo** on the Display tab to see your typing in the sent-data colour. Untick **Keyboard to device** there to make the terminal read-only.

ASCII shows lines as a terminal would draw them: UTF-8 text such as `°C` and `µA` is decoded, Backspace and carriage return edit the line (a shell's echoed Backspace erases, a `10%` → `100%` counter updates in place), other control characters appear as symbols such as ␀, and bytes that are not valid UTF-8 show as `.`. The Display tab holds the view options: **Received line ending** (match the device; `Auto` treats CR, LF and CRLF each as one line break, except that once the device has sent an LF, a CR on its own returns to the start of the line instead), **Timestamps**, **Wrap long lines** (continue a long line on the next row instead of scrolling sideways; copying still gives one line), **ANSI colours**, **Control characters** (every non-printing byte as `[CR]`, `[LF]`, `[TAB]`, `[NUL]` or hex such as `[FF]`, line endings included, RealTerm style) and **Show sent data**. Only ANSI colours (and Keyboard to device) are on by default. Hex, Dec and Bin show every received byte with offsets (Dec is each byte as 0 to 255). Int/Float decodes it as 8, 16 or 32-bit integers or 32/64-bit floats, with the raw bytes alongside:

| Control | Use |
|---|---|
| Value type | `int16`, `float32`, … signed and unsigned (Int/Float, Display tab) |
| LE / BE | Byte order of the sender (most microcontrollers are LE) |
| skip 0 … 7 | Skip bytes until values line up with the sender's framing |

The Display tab sets **Bytes per row** for these views (8, 16 or 32; Bin shows half as many); **Scrollback** on the App tab sets the lines each terminal keeps (10,000 to 500,000; older lines leave the view, not a log).

**xterm** on the top bar (beside Terminal, Plot and Split) shows the port through a terminal emulator (VT100/xterm), for anything that draws with the cursor rather than printing lines: boot menus, `top`, `vi`, `nano`. Keys go straight to the device, including Esc and Ctrl+L. Enter sends CR, as a terminal does, and it is the device's echo (CR LF from a shell) that moves to the next line; a peer that echoes nothing, such as another SomeTerm connection, leaves each line overwriting the last. For such a peer, or a device that ends its lines with CR alone, tick **New line on received CR** (Display tab, xterm only), like Tera Term's CR+LF receive setting; CR LF from other devices still gives a single new line. Use Ctrl+Shift for app shortcuts. It opens showing the last 64 kB received, and the line log, plot and logging carry on underneath. The device decides what the screen shows, so the Text and typing options other than Backspace are greyed out, and the send bar, quick-send buttons and send lines step aside; **Send file** still works, e.g. for U-Boot's `loady`.

The magnifier (Ctrl+F) searches the ASCII view, sent and received lines alike. Enter and Shift+Enter step through matches; **Aa** matches case, **.\*** takes a regular expression, and **Filter** hides lines without a match. New data is searched as it arrives. Esc closes find.

**Colour rules** (Automation tab) keep patterns coloured all the time, in every tab and the Monitor: **Line** tints the whole line, **Match** colours the matched text in bold over any ANSI colour. Earlier rules win where they overlap; drag ⋮⋮ to reorder. **Add common rules** gives errors red, warnings amber and OK/pass green. In the find bar, **+ Rule** turns the current search into a rule. Rules only change how lines look; logging, copy and find are unaffected.

ANSI colour codes are shown as colour; other escape sequences (cursor movement, clear screen, titles) are removed rather than acted on, since this is a scrolling log, not a screen. Turn **ANSI colours** off to see the raw codes as `␛[31m`. Coloured numeric lines still plot.

**Theme** (App tab) picks Light or Dark, or follows the operating system. For a projector, **A−** / **A+** on the terminal toolbar (or Ctrl+wheel over the terminal) set the terminal text size for every connection; Ctrl+= and Ctrl+- zoom the whole window (Ctrl+0 resets). The ⛶ button at the right of the top bar, or Alt+Enter, goes full screen.

Drag to select lines (a plain click only focuses), Ctrl+A for all, then Ctrl+C; Esc clears the selection. In the desktop app, right-click also offers Copy and Paste. Scrolling up pauses following; **↓ Live** resumes.

## Plotting

Any received line made only of numbers is plotted, Arduino style:

| Line | Series |
|---|---|
| `12,34,56` or `12 34 56` | 1, 2, 3 |
| `temp:23.1,hum:41` or `temp=23.1 hum=41` | temp, hum |

The first such line switches to Split view. Click a point to jump to its line in the terminal. Drag across the plot to zoom, double-click to reset. Click a legend entry to hide that series. **Horizontal axis** on the Plot tab switches to an XY plot of the other series against the one you pick, e.g. a Lissajous figure or an I–V curve. The time window still selects which samples are used; clicking a point jumps to its line as usual.

**Frequency (spectrum)** in the same list shows each series' amplitude in dB against frequency, using the newest 32 to 16384 samples in the time window (Hann window, mean removed). The toolbar shows the strongest frequency. The sample rate is estimated from arrival times, which is typically within a few percent; for exact frequencies, type the device's real sample rate into the Hz box.

**Σ** lists min, max, mean, standard deviation and sample count for each series over what is visible: the time window, or a range you zoom into after pausing. **A|B** turns clicks into cursors: the first click places A, the next B; the readout gives each series' value at both and the difference, with Δt also as a frequency. Cursors work on the spectrum too (Δf).

**Conversions** (Plot tab) convert a series for display: an expression in `x` (the received value) and a unit, e.g. `x*3.3/4095` in `V` for a 12-bit ADC, or `(x-500)/10` in `°C`. Available: `+ - * / ^`, `pi`, `e`, `abs sqrt exp ln log sin cos tan min max pow round floor ceil`. The terminal still shows the raw numbers. Conversions are saved with the tab and in profiles.

CSV exports everything plotted since the last Clear, converted, with units in the header.

## Logging

Logging is on the Logging tab and records sent data as well as received. It is independent of the connection: it keeps running across disconnects until you stop it or a limit is reached.

| Format | One record per | Use for |
|---|---|---|
| Text, timestamped lines | received line, prefixed `YYYY-MM-DD HH:MM:SS.mmm` | logs to read or grep |
| Raw bytes | byte, exactly as received | binary data, replay |
| Hex, timestamped chunks | chunk as it arrived | timing and framing questions |
| Session recording | chunk sent or received, with timing and line signals | replaying later (see [Recording and replay](#recording-and-replay)) |

**Start after** waits for N bytes or a piece of text (escapes allowed; the text itself is logged, and the log shows ◌ ARMED until it appears); **Stop after** ends it after N bytes or seconds.

**Split every** N MB and/or N min writes a numbered series (`…-001.txt`, `…-002.txt`) into a folder you choose, for long unattended logs. A line or hex chunk is never split across two files, and an idle link does not create empty files.

**Data** picks what is logged: **Received**, **Sent**, or **Both**, which tags each record `RX` or `TX`. While logging, the status bar shows ● REC and its size. **File** streams to disk as data arrives (Chrome and Edge); **Memory** keeps it until you View, Download or Discard. Leave a limit empty for no limit.

## Shortcuts

| Key | Action |
|---|---|
| Ctrl+Shift+Enter | Connect or disconnect |
| Ctrl+Shift+1…8 | Show a settings tab (Display … App); again folds the panel |
| Ctrl+, | Fold or open the settings panel |
| Ctrl+Shift+Space | Next view: Terminal, Split, Plot |
| Ctrl+F | Find in terminal |
| Alt+Enter | Full screen |
| Alt+1…9 | Quick-send buttons 1–9 |
| Ctrl+= / Ctrl+- / Ctrl+0 | Zoom the whole window |
| Ctrl+wheel over the terminal | Terminal text size |
| Ctrl+Tab | Next connection (desktop app; browsers keep this key) |
| Ctrl+L | Clear terminal, plot and error count |
| Esc | Focus the send box |

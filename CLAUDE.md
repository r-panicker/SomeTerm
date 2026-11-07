# Working in this repo

SomeTerm: a cross-platform serial terminal with RealTerm's serial feature parity, Arduino-style plotting, and a noticeably better UI/UX. TypeScript throughout. Runs in a browser (Web Serial) and as an Electron desktop app (Node `serialport`). Audience is academic: students and lab users, not industrial protocol work. Implemented from scratch; never copy or translate RealTerm source.

## Workflow
- Sole contributor, single branch. Commit straight to `main`: no feature branches, no PRs.
- Commit and push without asking once a coherent unit of work is done. Multiple small, honestly-scoped commits are preferred over one large one.
- No backward compatibility with earlier versions (saved settings, file formats, names): pre-1.0 with no installed base to protect, so just change things.
- Before any risky git operation, check `git status` first; investigate unexpected working-tree state (e.g. files missing without a matching commit) rather than assuming it was intentional.
- Update `docs/specs.md`'s changelog *and* `docs/user-guide.md` as changes are made, not only the specs doc. Same standard either way: the specs entry is free to narrate what changed and why; the user guide only gets a change if it affects what a user should actually do.
- Learn from corrections automatically. When the user corrects or suggests the same kind of thing more than once, or states a durable, generalizable preference, add it to this file (or the relevant memory file) without being asked, so it survives past the conversation. Keep it lean: a general principle plus why, not a growing pile of every incident. A one-off instruction is not a preference.

## Architecture (decided)
- Monorepo, strict boundaries: `core` (pure TS, no DOM, no Node APIs), `transport-webserial`, `transport-node`, `ui` (shared components), `app-web`, `app-electron`.
- All I/O, serial ports and TCP/Telnet connections alike (desktop only; browsers have no sockets), goes through a `SerialTransport` interface. The core never knows which driver is underneath. Features a transport can't support (Web Serial has no XON/XOFF, mark/space parity, or VID/PID metadata) are shown as unavailable on that transport, never silently ignored.
- Incoming data path: transport, ring buffer, Web Worker (timestamp, split, parse), views. The main thread never parses or formats bulk data. Design for sustained 921600 baud and up.
- Terminal and hex views are virtualized/canvas-based; no DOM node per line.
- Plotting uses a canvas/WebGL library (uPlot or equivalent), fed from the same stream as the terminal.
- UI framework: Svelte 5 + Vite. Electron is packaged with `electron-builder`; the Build and release workflow builds every OS.
- Out of scope for now: protocol decoders (Modbus, SLIP, COBS, frame descriptors), I2C and other non-serial RealTerm features, mobile/Android.

## Testing
- Core logic is unit-tested with a mock transport and a loopback transport; no test should need real hardware.
- Run the test files actually relevant to what changed, not the whole battery reflexively: a pure layout/CSS change doesn't need the parser or transport suites, and a pure core change with no UI-visible effect doesn't need the UI suites. When unsure whether a change's blast radius reaches further than it looks (shared state, the ring buffer, a widely-used function), run the fuller set rather than guess.
- Treat any new failure as a regression to root-cause, not a magic number to update blindly.
- Gate commits on the test command's exit status, never on piped output (`… | grep` succeeds even when tests fail).
- A test that only checks "did it run / how many bytes" is not enough: verify the actual received, rendered, or plotted output (byte sequences, displayed text, series values) matches what a human would call correct.
- For UI changes, actually drive the page (a live browser check, not just unit tests) before calling it done. Include throughput: a UI change that looks fine at 9600 baud can fall over at 1 Mbaud.

## UI
- The bar: RealTerm's serial depth with a modern, uncluttered, keyboard-friendly UI, dark and light themes, sensible defaults, cross-platform and runnable from a browser.
- Don't spend screen space on what a user knows by common sense or after one try: idle status, usage hints. Show state only when it carries information.
- A label never costs a row. Fit it into a line that already exists, shrinking type or dropping secondary detail before letting a header wrap.
- Keep the thing being studied next to what identifies it. Explanatory text is secondary; keep it short, and put it after the data, never above it.
- The settings panel should not need vertical scrolling on a laptop-width window: lay groups side by side, merge small groups, and keep labels in the normal text colour (muted reads as disabled).
- Settings live in RealTerm-style tabs under the terminal, always visible and one click away. Each setting has exactly one home; nothing opens settings somewhere else (no popovers, drawers or ⋯ menus for settings). Toolbars hold actions and read-only state. The user found the alternatives (inline popovers plus a drawer, then a single drawer) confusing.
- On/off switches look different from buttons that act or choose (they carry a light); labels say what a thing is in plain words (Int/Float, not Num).
- Reuse the closest existing pattern for a new control instead of inventing a bespoke widget.
- Show a value in more than one form when its format is ambiguous (hex alongside decimal, signed alongside unsigned), toggleable rather than picking one.
- Never show a value before it's meaningful: a disconnected port shows a clear not-connected state, not zeros.
- A setting that does nothing in the current mode or view (xterm, Terminal, Plot) is disabled, with a tooltip saying "Not available in … mode/view"; it never silently changes the mode when touched. Controls that cannot exist on a transport (no modem lines, no sockets in a browser) follow the same rule, or disappear when showing them would only apologize.
- Prevent an invalid state instead of handling it elsewhere. Disable the combination, don't tolerate it.
- Debuggability is a feature: surfacing what the link is actually doing (line signals, byte/error counters, rates, timestamps, raw bytes behind a plotted point) is wanted, not clutter.

## Writing (code comments, docs, commit messages)
- Comments explain non-obvious *current* behavior: a hidden constraint, why the less-obvious approach was chosen. They are never a changelog; that history belongs in the commit message and `docs/specs.md`'s version-history table.
- Don't add comments to justify a change that's simple enough to read on its own.
- `docs/user-guide.md` is written for a reasonably competent user, e.g. a 3rd-year engineering student: what to do, not a description of the UI or a log of what changed. Don't explain things that are obvious once seen, and don't re-explain the same fact in more than one place. State a cross-cutting fact once and point back to it.
- Avoid AI-tell prose in user-facing writing: keep em-dashes rare, vary sentence rhythm, use plain punctuation over uniform dash constructions.
- In-UI copy is not documentation, and unlike documentation it costs vertical space every time it's shown. A control's label plus its `title` tooltip is usually the whole budget. Prefer adding a button to an existing row over giving it a row of its own.
- When mentioning other tools (RealTerm, Tera Term, GTKTerm, the Arduino plotter), credit their strengths and describe SomeTerm by its own (cross-platform, runs in a browser); never criticise them, in docs, UI, commits or chat. The repo is public and these projects are its inspiration.
- When editing a document that already exists, write in *its* register: match its sentence length, bullets vs prose, and how much it explains.
- Prefer tables over paragraphs when they convey the same facts more densely.
- Pitch copy (README, descriptions, About) sells what a user gets: multiple connections, bridging, plotting, profiles, display options, automation, search. Implementation details (workers, canvas, frameworks) belong in specs, not the pitch.

## Scope
- Ideate before implementing anything structural or UX-shaped: present options and a recommendation, wait for direction, rather than building first.
- Choosing between next steps of similar value (build order, which piece first) is not a decision to hand back: pick one, say which, and proceed.
- When a fix reveals the same latent pattern elsewhere, flag it and ask before touching more files than asked.

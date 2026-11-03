# Working in this repo

## Workflow
- Sole contributor, single branch. Commit straight to `main` — no feature branches, no PRs.
- Only commit/push when explicitly asked. Multiple small, honestly-scoped commits are preferred over one large one.
- Before any risky git operation, check `git status` first; investigate unexpected working-tree state (e.g. files missing without a matching commit) rather than assuming it was intentional.
- Keep `Prompts/claude_main_prompts.md` current with every prompt the user types, as it happens, not only when asked. It's git-ignored, session-local.
- Update `riscv_simulator_specs.md`'s changelog *and* `riscv_simulator.md`'s user guide as changes are made, not only the specs doc. Same standard either way: the specs entry is free to narrate what changed and why; the user guide only gets a change if it affects what a user should actually do.
- When a prompt surfaces a durable, generalizable preference (not a one-off), save it to the relevant memory/`.md` file so it survives past this conversation — but keep it lean: a general principle plus why, not a growing pile of every incident that prompted it.

## Testing
- These are hand-built HTML/JS pages with their own test suites (see `riscv_simulator_tests/`). Run the test files actually relevant to what changed, not the whole battery reflexively: a pure layout/CSS change doesn't need the instruction-semantics or execution-program suites, and a pure functional/logic change with no UI-visible effect doesn't need the panel-grid or mobile-keyboard suites. When unsure whether a change's blast radius reaches further than it looks (touches shared state, a widely-used function), run the fuller set rather than guess.
- Treat any new failure as a regression to root-cause, not a magic-number to update blindly.
- A test that only checks "did it compile / how many instructions" is not enough — verify the actual rendered/simulated output (pixel counts, UART text, register values) matches what a human would call correct.
- For UI changes, actually drive the page (a live browser check, not just unit tests) before calling it done.

## UI
- Don't spend screen space on what a user knows by common sense or after one try: idle status ("ready · 9 phases"), usage hints ("Press ▶ to step"). Show state only when it carries information.
- A label never costs a row. Fit it into a line that already exists, shrinking type or dropping secondary detail (an address) before letting a header wrap; this matters most on a phone.
- Keep the thing being studied next to what identifies it: nothing goes between an instruction and its drawing. Explanatory text is secondary; keep it short, and put it after the picture, never above it.
- Interactive UI must keep its result and its controls on screen together. If acting on something requires seeing the result of the last action, do not put the result where reaching it scrolls the controls away — on narrow layouts especially, make it a tab/panel alongside the others rather than a strip below them. The waveform view is the worked example: a bottom dock on desktop, a sixth panel on mobile.

## Writing (code comments, docs, commit messages)
- Comments explain non-obvious *current* behavior — a hidden constraint, why the less-obvious approach was chosen. They are never a changelog: don't narrate what a bug used to do or why a line was removed. That history belongs in the commit message and, for this project, `riscv_simulator_specs.md`'s version-history table.
- Don't add comments to justify a change that's simple enough to read on its own.
- `riscv_simulator.md` (the user guide) is written for a reasonably competent user, e.g. a 3rd-year CG3207 student: what to do, not a description of the UI or a log of what changed. Don't explain things that are obvious once seen, and don't re-explain the same fact in more than one place.
- Avoid AI-tell prose in user-facing writing: keep em-dashes rare, vary sentence rhythm, use plain punctuation (periods, commas, colons, semicolons) over uniform dash constructions.
- In-UI copy is not documentation, and unlike documentation it costs vertical space every time the panel is open. A control's label plus its `title` tooltip is usually the whole budget; a paragraph of explanation beside a button belongs in `riscv_simulator.md` or the tooltip instead. Prefer adding a button to an existing row over giving it a row of its own.
- When editing a document that already exists, write in *its* register, not your own. Match its sentence length, its use of bullets vs prose, and how much it explains. A reference page of terse declaratives should not acquire flowing paragraphs with rhetorical framing ("How much time is sufficient is a fixed number", "that is the whole budget you have") just because a new section was added to it.

## Scope
- Ideate before implementing anything structural or UX-shaped: present options and a recommendation, wait for direction, rather than building first.
- When a fix reveals the same latent pattern elsewhere, flag it and ask before touching more files than asked — the user is often already tracking it and will confirm scope explicitly.

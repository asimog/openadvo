# Notes for agents: state of the work and lessons from 2026-11-15

These are working notes for the next coding agent. They record where the work stands and what was learned in the sessions of 2026-11-15. The durable how-to is [docs/agent-guide.md](../../docs/agent-guide.md). The plan is in `docs/`.

## Where the work stands

- **The code** is the SLP-era application built in rounds v0 to v5, plus the harness work of 2026-11-15:
  - Pi extensions: loader, Settings panel, seven bundled extensions;
  - the app-owned Pi agent folder;
  - pi-permission-system with an app-written policy;
  - compaction on, follow-up while busy, the send-race fix;
  - the confidential distinction removed.
- **The plan** (`docs/`) has 169 features in 13 phases. No phase of the plan has started. The next step is the Phase 1 spec (`docs/build-plan.md` section 3).
- **Open hardening items** are listed in `docs/harness-hardening.md`. The first to do: model re-resolution, a unit test of the `Agent` class, and extension questions in the chat.
- **Not verified:** whether pi-subagent-manager's helper agents receive the application's custom tools. This needs a run with a live model.

## Owner's instructions that shape the work

- Build each module deep and complete, with its tests and views. No thin versions to extend later (AGENTS.md L5).
- Clean docs: no old ids, no "was X" notes, no gaps in numbering. When ids change, renumber and update every reference in docs and code comments.
- Litigation only. No practice management, billing or marketing.
- No confidential matter distinction for now (decision 24).
- Open Advocate produces filing-ready sets. Filing on a portal by the agent is the last phase (decision 25).
- docTR becomes the second OCR engine. OCR comparison and regional engines come later (decision 26).
- Pi's built-in tools (`read`, `bash`, `edit`, `write` and the others) stay off unless the owner decides otherwise (harness-hardening H-28).
- Assess before building when the owner asks for an assessment. Build only after the owner says so.

## Lessons from these sessions

1. **Ask what a stopped command did.** A command the owner stopped had already finished: `npm run vendor:extensions` installed pi-btw and pi-permission-system before the stop. Check the working tree and the vendored folders after any stop.
2. **Third-party Pi extensions assume Pi's terminal.**
   - Before bundling one, `npm pack` it into the scratchpad and read the tarball, not the repository head; they differed in up to 48 files.
   - Scan for tools, commands, `ctx.ui` calls, `child_process`, network calls and `ctx.mode !== "tui"` checks.
   - pi-btw works only in the terminal.
   - pi-permission-system with no config treats every tool as "ask", and an "ask" in the window is a refusal.
3. **`getAgentDir()` is global.** Extensions write under Pi's agent folder. The application now sets `PI_CODING_AGENT_DIR` to `<userData>/pi-agent` at start and reads credentials from the owner's folder with explicit paths. Tests must set `PI_CODING_AGENT_DIR` to a temporary folder before loading extensions.
4. **The faux model is the way to test agent behaviour without a model.** `createFauxCore` from `@earendil-works/pi-ai`, registered with `pi.registerProvider` in an inline extension factory. Then `modelRuntime.getModel("faux-test", "m")` and `session.setModel`. See `tests/unit/pi-extensions.test.ts`.
5. **Merged ids must be mapped in every document, not only in the catalogue.** A first pass rewrote only `features.md`. Other docs kept ids that had been merged and later pointed at the wrong features. The fix was to restore those docs from the last commit and apply one composed map (merged id, then the surviving feature, then the new number). Lesson ids L1 to L6 must be masked, because feature group L uses the same pattern.
6. **Edits through Python heredocs can corrupt string literals.** `"\n"` inside a Python string written into TypeScript became a real line break and broke the renderer build. Use the Edit tool, or `String.fromCharCode(10)`.
7. **Check that all three bundles built.** `npm run build` prints "built in" three times (main, preload, renderer). A renderer failure can follow two successes, and the end-to-end tests then run the old bundle.
8. **The shell rejects some heredocs that contain an apostrophe.** Write the script to a file in the scratchpad and run the file.

## Commits of 2026-11-15 (newest first)

| Commit | What |
|---|---|
| ea3173b | Clean docs: merged features, 13 module phases, navigation layout |
| 0803e6b | Docs: filing readiness, matter import, docTR, side questions, browser |
| e09892f, c1c4158 | Permission system, app-owned Pi folder, pi-btw and confidentiality removed |
| a69af42, 1317b1a | Assessments: browsers and extension candidates |
| 876c489 | Pi extensions: loader, Settings panel, six bundled, hardening plan |
| 4fc330e | Old docs archived, new docs written |
| b37a3e2, 7a5350a | Litigation-harness report and plan |

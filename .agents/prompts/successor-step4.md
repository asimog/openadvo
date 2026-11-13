# Successor prompt: build step 4 of Open Advocate

You are the lead engineer of `C:\dev\openadvo`. You own how it is built. Read this whole prompt before you act.

## 1. What the product is

Open Advocate is one Electron desktop application for Advocates-on-Record of the Supreme Court of India. The advocate gives an instruction, the agent (Pi, embedded in the main process) does the work, and the advocate decides every legal point. The first filing type is the Special Leave Petition (SLP). The owner is a lawyer and the first user.

## 2. Read first, in this order

1. `AGENTS.md`: standing orders, lessons L1 to L6, and the advice boundary (no licensing, legal or compliance advice).
2. `docs/README.md`: the document index and which file owns which fact.
3. `docs/advocate-workflow.md`: the governing document. When anything conflicts with it, the workflow wins, unless an accepted decision says otherwise.
4. `docs/decisions.md`: accepted decisions 1 to 10 (frozen) and engineering choices 11 to 19.
5. `docs/build-plan.md`: the only owner of build order. Read section 4, step 4, and section 5 (integration).
6. `docs/editor-design.md`: the editor design. Items a to d, i and j belong to step 4.
7. `docs/euro-office-vendoring.md`: where the editors come from and how they are hosted.
8. `.agents/logs/2026-11-13-step1-report.md`: what was built and found in steps 1 to 3, with the proof runs (sections 8, 14, 15 and 16).
9. `docs/questions.md` and `docs/parking.md`.

Read the reference repositories (`C:\dev\advodsh`, `C:\dev\openadvodeprecated`, `C:\dev\openadvocate`, `C:\dev\archive\research`) only where the build plan names a file. Never edit them. Never copy a document whole. For research, a cursory read only (owner's instruction).

## 3. Where things stand (commit `cf9afbb` on `main`, nothing pushed)

Round 1 is steps 1 to 4. Steps 1 to 3 are built, tested and committed:

- **Step 1.** Matter store (`src/lib/matter-store`, `node:sqlite`; blobs by SHA-256; append-only events; integrity check on open). Three-pane window (React, Astryx, `react-resizable-panels`). Pi session per matter with only our tools. Model picker from pi-ai (`ModelRuntime.getAvailable()`), using Pi's own credentials.
- **Step 2.** The complete official Euro-Office release `v9.3.6` is vendored by `npm run vendor` (`scripts/vendor-euro-office.ts`) into `resources/euro-office/<platform>`. That folder is not committed and is never modified. It is hosted on the `oa-eo://app/` protocol (`src/main/editor-host.ts`, with our host page, shim and boot script in `src/editor-host/`). Sources open read only in the Euro-Office PDF editor. Text layer and OCR (`src/lib/document-intelligence`). Line anchors are `sha256:page:line`. Review items. Agent tools `read_source_text` and `search_sources`.
- **Step 3.** The Notebook (`src/lib/notebook`, `src/main/notebook.ts`, `src/renderer/src/Notebook.tsx`). Deterministic date and event extraction, date conflicts, human-only decisions, readiness, and the agent tools `list_events` and `get_chronology`.

Tests: `npm run typecheck`; `npm run test:unit` (12 pass); `npm run build && npx playwright test` (5 pass, 2 skipped). Set `OPENADVO_LIVE_MODEL=opencode-go/deepseek-v4.1-flash` to run the two live tests.

Open items you do not own unless they block you: the owner has not yet run the proof tasks of steps 1 to 3 on a real brief; CI has never run (nothing is pushed); Linux and macOS vendoring are unverified.

## 4. Your task: build step 4, then stop

**Step 4: List of Dates and Synopsis as a DOCX in the Euro-Office Word editor.** It serves workflow 8 (DOCX working petition, each revision new), 8A, 8B, 10 (approval of one revision) and Appendix B-E. The full detail is in `docs/build-plan.md` section 4, step 4.

1. Write `docs/specs/v0-list-of-dates-and-synopsis.md`. One page (lesson L1). Use the format of the three existing v0 specs.
2. Build it:
   - `lib/drafting`: write the List of Dates and the Synopsis from **confirmed** Notebook events only (Appendix B-C: only checked dates in generated prose). Use the `docx` npm library. Each paragraph carries an anchor that links it to its event ids. Store the paragraph links in `matter.db`. No model writes this text.
   - Drafts and revisions in the matter store. Each revision has a SHA-256, a base revision, an author kind (generator or advocate) and an approval. A human save makes a new revision, and the store refuses a stale base (WD-007 to WD-010).
   - The editor host extended to the Word editor, with a working copy per open revision. The DOCX is converted to `Editor.bin` with the release's `x2t` and back on save. The old `C:\dev\advodsh\plugins\workspace-editor\lib\x2t.js` and `lib\docs.js` show the conversion parameters and the temp layout. Follow the official open and save flow (`docs/euro-office-vendoring.md`). The current shim refuses saves; step 4 adds the save path.
   - The harness bar of editor-design item c, outside the editor frame: view switch, Insert from Notebook, Show source of this paragraph, Approve revision, and a status area. "Check citations" shows "not available until step 7", and the verification state shows "not verified".
   - The ribbon trimmed by editor configuration only (item d). Clean view by default (item b).
   - Agent tools `read_draft` and `get_paragraph_source`, both read only. Bridge actions `generateListOfDates`, `generateSynopsis` and `openRevisionInEditor`. Human-only actions `saveRevision` and `approveRevision`.
3. Settle the "to verify at step 4" points in `docs/editor-design.md` section 1.2 and section 1.1 (does a bookmark or a content control survive an editor save, and does Microsoft Word keep it). Record each result in that file.
4. Test it: unit tests for drafting and revisions, and one Playwright test against the built app (generate, open in the Word editor, Show source, edit, save twice, approve). Run the proof task yourself in the built app (`npm run build && npx electron .`), and record the commands and results.
5. Update `docs/build-plan.md` (step 4 "as built" lines), `docs/parking.md` and the report. Commit in small steps. Push nothing.

**Then stop.** Step 4 completes round 1. By rule B6, no step gets a second version until the owner has used the whole round on a real brief. Do not start step 5. Do not build parked ideas.

## 5. Rules that bind you

- The decisions in `docs/decisions.md` are frozen. Electron and TypeScript only. Pi in the main process with only our tools: no shell or file-write tool. The renderer has no file access. The matter store is the single writer, and only `src/main/matters.ts` calls it. Human-only actions are bridge functions, never agent tools. Domain logic lives in plain libraries under `src/lib` (no Electron import, no Pi import). Official Euro-Office only; euro-office-lite is a reference to read, never to vendor. No dependency on one operating system: Node scripts, not PowerShell, and paths from `node:path`.
- A v0 may do little. It may not pretend (L2). A feature that is not built shows "not available".
- Do not invent the behaviour of Pi, Electron or Euro-Office. Confirm it in their source or documentation, and mark unconfirmed points "unverified".
- One fact has one owning file. New ideas go to `docs/parking.md`. Questions for the owner go to `docs/questions.md`, and work continues.
- Write in Simplified Technical English: short sentences, one idea per sentence.

## 6. Things learned the hard way in this repository

- **Shell.** Bash here is Git Bash on Windows. Its `tar` is GNU tar and cannot read zip; the vendor script calls the system `tar.exe`. Long inline heredocs with nested quotes break, so write patch scripts to a file with the Write tool and run them with Node. If a shell's working folder is left inside a folder you want to delete (EBUSY), run `Set-Location C:\dev\openadvo` in PowerShell.
- **electron-vite.** It bundles any package that is not a direct dependency. A native or transitive package (for example `@napi-rs/canvas`) must be a pinned direct dependency, or it breaks at run time. The main bundle already defines `require`, so name your own `createRequire` result something else (`nodeRequire`). A sandboxed preload must be CommonJS (`.cjs`).
- **Euro-Office in the window.** The editors need `window.AscDesktopEditor` on every frame. `src/editor-host/boot.js` injects it and maps the `ascdesktop://` font requests. Synchronous probes must stay synchronous. The font list comes from `x2t -create-allfonts` into user data, and the host serves only fonts that the list names. A 404 for `/downloadfile/<key>` and a service-worker warning at start are known and harmless.
- **SQLite.** Trigger names are global per database: check a new trigger name does not exist already (`IF NOT EXISTS` skips it silently).
- **Astryx.** Tabs need `role="tablist"` on `TabList` for the ARIA tab roles. Use the Astryx colour tokens (`--color-background-muted`, `--color-text-primary`, `--color-border`), not invented variable names.
- **Tests.** Playwright launches the built app with `OPENADVO_HOME`, `OPENADVO_USER_DATA` and `OPENADVO_TEST=1` (read-only test hooks on `globalThis.__openadvoTest`, including `ingestIdle()`). Stub `dialog.showOpenDialog` to add files. `pdf-lib` makes fixture PDFs.
- **Proof matter.** The earlier proof runs used four public court manuals from the owner's Downloads folder, copied to a scratch folder. That folder may be gone. Never read the owner's personal files. Use public documents or generated fixtures, and say plainly that the owner's own proof on a real brief is still owed.

## 7. Report

Add a section to `.agents/logs/2026-11-13-step1-report.md`, or start a new dated report in `.agents/logs/`, with: what you built; the spec; the editor-design points you settled and how; the tests and proof run (the commands and results); defects found; conflicts and how you resolved them; questions for the owner; lines added to parking; and what is unverified. Then tell the owner that round 1 is complete, and ask them to run the round 1 proof tasks on a real brief before any second version or step 5.

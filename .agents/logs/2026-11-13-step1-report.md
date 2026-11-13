# Report: Part 0, Parts A to D, step 1

Date: 2026-11-13. Repository: `C:\dev\openadvo`. Six commits on `main`, nothing pushed.

## 1. Euro-Office recommendation

1. Pin to the official DesktopEditors release `v9.3.6` (tag commit `8b25e8ac`). It is option 3 (a mix).
2. Take `editors/web-apps`, `editors/sdkjs`, `converter/` and `fonts/` from each platform's release asset. Check the asset's GitHub sha256, and check each JS file against the release's SLSA provenance.
3. Build only `allfontsgen` from `core@a4a1ba1e`. The release does not ship it.
4. Run agent edits through the Document Builder API that is compiled into the release editor bundle (`Asc.editor.getJsApi()`), in an editor page we own. Save through the same `x2t` path.
5. macOS Intel has no official asset. Windows x64/arm64, Linux x64/arm64 and macOS arm64 have one.

**Official Document Builder source:** yes, but not as a product. Euro-Office publishes no Document Builder repository, release or executable. The official builder API is compiled into the release `word/sdk-all.js`. A `docbuilder` command-line tool can also be built from official `core` source. Full record: [docs/euro-office-vendoring.md](../../docs/euro-office-vendoring.md).

I checked four of its claims myself: the release digest equals the local zip's sha256 (`gh api`); the local `sdk-all.js` sha256 starts `f517ce77`; `sdk-all-min.js` contains `getJsApi=function(){return AscBuilder.Word.Api}`; `x2t.exe` in the zip has sha256 starting `b7e76dd8`. All four match.

## 2. Files written

| File | Part |
|---|---|
| `AGENTS.md` | A1 |
| `docs/README.md`, `docs/repo-map.md` | A2 |
| `docs/advocate-workflow.md` | A3 |
| `docs/decisions.md` | A4, D3 |
| `docs/parking.md`, `docs/questions.md` | A5, rules |
| `docs/build-plan.md` | B |
| `docs/editor-design.md` | C |
| `docs/euro-office-vendoring.md` | 0 |
| `docs/specs/v0-app-and-matter-store.md` | D1 |
| `spikes/d2-smoke/main.mjs`, `result.json` | D2 |
| `src/lib/matter-store/index.ts`, `src/shared/{records,api}.ts`, `src/main/{index,matters,agent}.ts`, `src/preload/index.ts`, `src/renderer/**` | D4 |
| `tests/unit/matter-store.test.ts`, `tests/e2e/app.spec.ts`, `playwright.config.ts` | D4 |
| `.github/workflows/ci.yml` | D4 |
| `package.json`, `electron.vite.config.ts`, `tsconfig.*.json`, `.gitignore`, `.gitattributes` | D4 |

## 3. Workflow terms changed

The source is `C:\dev\openadvodeprecated\docs\advocate-workflow.md`. 18 replacements; the line count is unchanged (678). No section was removed or shortened.

| Section | Was | Now |
|---|---|---|
| Header | architecture.md owns the system shape; terms in section 3 of decisions.md | build-plan.md owns build order; terms in section 5 of decisions.md |
| Header | spec F, I, J, L, U | build step 9, 6, 4, 8, 7 |
| 1 | The Kernel remains in control of … | The application remains in control …: the matter store is the single writer, approvals are human actions on the bridge |
| 2, steps 1, 2, 4, 5 | harness / Kernel | agent / matter store / agent session with only the tools required |
| 7 | The harness coordinates research … | The agent coordinates … |
| 7E | (OQ-10) | (ruling R-1 in decisions.md) |
| 8 | The harness coordinates drafting | The agent coordinates drafting |
| 10 | The harness submits … to the Kernel. The Kernel validates … | The main process submits … to the matter store. The matter store validates … |
| 11, step 6 | from the window or from the CLI behind an OS user-presence prompt | from the window (question Q-4) |
| 12 | The harness coordinates / maintains …; The Kernel owns … | The agent coordinates; the main process and the agent session maintain …; the matter store owns …, the main process owns permissions |
| Appendix A | under Kernel control | under matter store control |
| Appendix C 8 | independent of the harness process | that survive a restart of the application |

## 4. Workflow sections left for later

Every section has a row in the coverage table of [docs/build-plan.md](../../docs/build-plan.md) section 3. Sections served only after round 1, and why:

- 3 (court capture, CAPTCHA, email) and Appendix B-B kind 2: step 9, round 3. Dropped files serve the record until then.
- 7, 8C, 8D, 5E to 5G (research to grounds): step 6, round 2. They need the Notebook first.
- 8E, 9 (all), 10 (filing approval): steps 5, 7, 8, round 2. They need a draft first.
- 11 and voice in 2: step 10, round 3. Filing comes last.
- Inside round 1, these are a later version of their step: a second OCR engine and OCR disputes; automatic classification; annexure references; duplicate kind 3; agent-proposed Notebook events; matter fields (parties, court, CNR); persisted chat (Appendix C 8).

## 5. Engine rules carried into the editor design

WD-013, WD-014, WD-026 (live text); WD-011, WD-012 (commit leaves the session usable); WD-020 to WD-024 (stable block ids); OD-13, WD-015, WD-017 (word-level tracked replace); WD-129, WD-110 (expected-text checks); WD-096 to WD-099 (sidecar cleanup); WD-007 to WD-010 (human save with a base revision); WD-076 to WD-078 (frame sandbox). Source: `C:\dev\advodsh\docs\legal-docx-workspace.md` sections 7 to 21.

## 6. D2 results

Command: `npx electron spikes/d2-smoke/main.mjs` (and `--prompt` with `OPENADVO_MODEL=opencode-go/deepseek-v4.1-flash`). Result file: `spikes/d2-smoke/result.json`.

| Check | Result |
|---|---|
| Pi SDK runs in the Electron main process | Pass. Electron 45.3.2, Node 24.22.2, `process.type === "browser"`, `@earendil-works/pi-coding-agent` 1.5.2. |
| A session has only our tool | Pass. `getActiveToolNames()` and `getAllTools()` both equal `["list_sources"]`. One live turn called the tool once and answered with its output. |
| SQLite in the main process | Pass. Built-in `node:sqlite` `DatabaseSync`: create, insert, select. |

## 7. Component library

Astryx (`@astryxdesign/core` 0.7.15, theme `@astryxdesign/theme-neutral`). It has a sortable `Table` (`useTableSortable`, `useTableSortableState`), `TabList` and `Dialog`, and it ships prebuilt CSS, so Vite needs no StyleX plugin. Fluent UI and Mantine were not needed. Recorded as choice 11 in [docs/decisions.md](../../docs/decisions.md).

## 8. Step 1: what was built, and the proof run

Built: the matter store library (`matter.db`, blobs by SHA-256, append-only events enforced by triggers, re-hash on open); the main process (bridge handlers that check the calling page, one Pi session per matter with our own resource loader); the preload bridge (12 named functions); the React window with three resizable panes; unit tests; Playwright tests; CI.

Test commands and results (Windows 10, this machine):

| Command | Result |
|---|---|
| `npm run typecheck` | No errors |
| `npm run test:unit` | 4 pass, 0 fail |
| `npm run build` then `npx playwright test` | 3 pass, 1 skipped (the live test) |
| `OPENADVO_LIVE_MODEL=opencode-go/deepseek-v4.1-flash npx playwright test -g live` | 1 pass |

Proof run, in the built application, with real PDF files. The files were four public court-software manuals from the owner's Downloads folder (`eFM_2.0_Manual.pdf`, `eFM_3.0_Manual.pdf`, `CCMS3_UserManuals_Advocate Module User Manual- JAN- 2025.pdf`, `3pdf_user_manual.pdf`), plus a copy of one under a second name. They are real PDFs but not a brief. Folders: the scratch `proof/matters` and `proof/user-data`. Started with `OPENADVO_HOME=… OPENADVO_USER_DATA=… OPENADVO_MODEL=opencode-go/deepseek-v4.1-flash npx electron .`

1. Created the matter "Proof run v. Real PDFs" with the New matter dialog.
2. Dragged all five files from 7-Zip File Manager onto the drop zone with real mouse input. Result: Sources (4). Events: four `source.added`, one `source.origin_added`. The copy is one source with two origins.
3. Asked the agent "list the sources". The chat showed "Used tool: list_sources", then all four names, sizes and full SHA-256 values.
4. Closed the application (exit code 0) and started it again. The matter was listed. Opening it showed all four sources with their hashes and status OK after re-hashing. A new `agent.session_started` event recorded the new session id.
5. Checked the folder with `node:sqlite`: four blobs, each named by the SHA-256 of its own bytes; four sources, five origins, eight events.

Not done in the proof run: a second drag of one file after the restart. The drag automation did not reach the window, and the native file dialog was not visible to the automation. The Playwright test covers a second add of the same file after the first add (`0 added`, still two sources).

Defects the proof run found and fixed in commit `1c56358`: the add notice and the selected matter were white text on a light background in dark mode (the CSS used colour variables that Astryx does not define); source names wrapped one letter per line. Parked: raw markdown in agent replies; Electron's default menu.

## 9. Conflicts and resolutions

| Conflict | Text A | Text B | Resolution |
|---|---|---|---|
| Where Pi runs | Old PH-18: "a separate supervised Node process … never in Electron's main process" | Decision 2: "embedded in the main process through its SDK" | Decision 2. Recorded in decisions.md section 4. |
| Widget kit | Old PH-10: "No third-party widget kit is a dependency" | Task D3: use Astryx | Task D3. |
| Pane order | Old PH-05: left pane, chat, view | Task D1: matters and sources, view, chat | Task D1 (newer). |
| Agent edits | `openadvocate` V0-C13: "agent edits are proposals" | Task C(a): tracked changes in the DOCX, no second proposal store | Task C. |
| Conversion fallback | `openadvocate` V0-C15: LibreOffice for previews and fallback | Decision 8: official Euro-Office only | Decision 8. |
| Editor source | `advodsh/AGENTS.md`: "Only official EuroOffice or EuroOfficeLite may be vendored" | Decision 8: euro-office-lite not used in any part | Decision 8. |
| Research location | Task: `C:\dev\openadvocate` has `docs/research C1-C7`, the ULOS schema and `packages/core` | The repository has only `docs/{architecture,components,decisions,v0}.md` | C1 to C4, C6, C7 found in `C:\dev\archive\research`. C5 not found: question Q-1. |
| Second filing confirmation | Workflow 11.6: "from the window or from the CLI behind an OS user-presence prompt" | Decisions: no CLI | CLI path removed as a system term; question Q-4. |
| Secrets | Decision 9: secrets through `safeStorage` | Step 1 uses Pi's own credential store | The application holds no secret, so no conflict in step 1. Question Q-2. |
| Old shim open/save | Old `shim.js` opens with `openDocument` and saves by HTTP post | Official host: `DesktopOfflineAppDocumentEndLoad` and `DesktopOfflineAppDocumentEndSave` | Follow the official flow at step 4 (vendoring doc section f). |

## 10. Questions for the owner

In [docs/questions.md](../../docs/questions.md): Q-1 (where is research C5), Q-2 (Pi's credentials or a `safeStorage` key), Q-3 (default model), Q-4 (operating-system user-presence prompt on the second filing confirmation).

## 11. Lines added to docs/parking.md

Inspector (P9); review inbox (M-03); command bar (M-04); saved layouts (M-02); matter memory (M-13); `safeStorage` API key entry; model picker; persisted Pi session; matter rename and archive; markdown in chat; own application menu.

## 12. Unverified items

- CI has not run. The workflow file is committed, but nothing is pushed. Linux and macOS are untested. On Linux the job lowers the Ubuntu AppArmor restriction on user namespaces for the Electron sandbox.
- The eight unverified items at the end of [docs/euro-office-vendoring.md](../../docs/euro-office-vendoring.md): non-Windows asset contents, payload equality across platforms, a builder run on the release bundle, the tracked-change author, a DocumentServer `docbuilder`, standalone `allfontsgen` builds, the minimal DOCX subtree, and two host members.
- The five "to verify at step 4" points in [docs/editor-design.md](../../docs/editor-design.md) section 1.2.
- `node:sqlite` is marked experimental in Node 24 (decision choice 12).
- Drag-and-drop from Windows File Explorer itself: not tested. The drop in the proof run came from 7-Zip File Manager. It uses the same Windows drag-and-drop mechanism, but File Explorer was not the source.

## 13. Draft v0 spec for step 2 (draft, not approved)

> **Draft, not approved.** Written for review only (lesson L1). Not in `docs/specs/`.
>
> **v0 spec: document intelligence — text, page anchors, PDF view.** Step 2. Serves workflow section 4 and Appendices A and B-A.
>
> **Input.** The PDF sources of a step 1 matter.
>
> **Output.** In `matter.db`: one page record per page (source id, page number, text kind `born_digital` or `ocr`, text); one line anchor per text line (source SHA-256, page, line number, box, text); one OCR reading per OCR page (engine, version, confidence); review items for files or pages that cannot be read.
>
> **Rules.**
> 1. Ingestion is separate from capture. A job starts when a source is added and runs once per source. A job never changes the blob.
> 2. Only the matter store writes. `lib/document-intelligence` computes; `main/ingest.ts` passes results to `main/matters.ts`.
> 3. Every anchor names the source SHA-256 and the page, so it survives a rename.
> 4. An OCR page is marked "single reading, not cross-checked". It is never shown as verified.
> 5. A page with no text and no OCR result opens a review item. Nothing is hidden.
>
> **Surfaces.** PDF view in the view pane (`pdfjs-dist` renders from bytes the bridge gives; the renderer reads no file), with the page text beside it and the anchor of the selected line. A review item list. Agent tools `read_source_text` and `search_sources` (read only). Human bridge actions `classifySource`, `resolveReviewItem`, `skipReviewItem`.
>
> **Not in v0.** A second OCR engine and disputes; automatic document type; annexure references; duplicate kind 3; image and DOCX sources; Hindi.
>
> **Proof task.** The owner opens each PDF of a real brief, checks three pages of born-digital text and three scanned pages against the page image, and resolves or skips every review item.

## 14. Changes after owner feedback (same day)

- Research: cursory search only. Gates G1 to G7 are in research C3 section 6. Q-1 settled.
- Credentials: Pi's own. Q-2 settled; decision choice 16.
- Model: a picker in the chat pane from pi-ai's model list (`ModelRuntime.getAvailable()`), default from Pi's own setting, choice saved and applied with `session.setModel`. Choice 17. Tests: 5 of 5 Playwright tests pass with the live model, including a new picker test.
- Euro-Office: the vendoring document is rewritten short. Plan: the complete official release (`v9.3.6`), every editor, inside the window, hosted with the same three layers euro-office-lite uses (host page, `AscDesktopEditor` bridge, `x2t` backend) but with the release's published editor files, unchanged. Nothing is built from source: `x2t -create-allfonts` from the release builds the font list (checked: exit 0, about 1 second). Choice 18.
- Build plan: hosting moves from step 4 to step 2, because the PDF view is the Euro-Office PDF editor. The draft step 2 spec in section 13 is out of date on this point: its PDF view is now the Euro-Office PDF editor, not `pdfjs-dist`. `pdfjs-dist` stays only for text extraction.

## 15. Step 2: document intelligence and the Euro-Office PDF view

Spec: [docs/specs/v0-document-intelligence.md](../../docs/specs/v0-document-intelligence.md). Not the step 2 draft in section 13, which is superseded.

**Built.**
- `scripts/vendor-euro-office.ts` (`npm run vendor`). It staged the official Windows x64 release `v9.3.6` from the local copy of the release file (`--from`, sha256 checked) into `resources/euro-office/win-x64`, with `editors/`, `converter/`, `fonts/` and `dictionaries/`, about 1.4 GB, not committed. A second run checks and exits.
- The editor host. A custom protocol `oa-eo://app/` serves the vendored editors unchanged, our host page, shim and boot script (adapted from advodsh `shim.js`, `boot.js` and `host.html`), the font list, and one document per view token. The font list comes from the release's own `x2t -create-allfonts`: bundled fonts plus 345 Windows system fonts. Checked: the run leaves the vendored folder unchanged. Fonts are served only when the font list names them.
- Sources open read only in the Euro-Office PDF editor, in a sandboxed frame in the view pane. The frame may navigate only inside `oa-eo://app` (WD-078).
- `lib/document-intelligence`: the `pdfjs-dist` text layer grouped into lines with boxes. A page with no text is rendered with `@napi-rs/canvas` and read by `tesseract.js`, with English data bundled. OCR lines use the same PDF coordinates as text-layer lines.
- In the matter store: ingest jobs, pages, line anchors (`sha256:page:line`), OCR readings and review items. Pages, anchors and readings can only be written once, which triggers enforce. Review items are marked, never deleted.
- `main/ingest.ts`: one job per source, after a file is added or a matter opens. A job left half done by an earlier run is marked failed, with a review item.
- New read-only agent tools: `read_source_text` and `search_sources`. Human-only bridge actions: `resolveReviewItem` and `skipReviewItem`.
- The window: a "Text" status per source, the page text under the PDF editor (line numbers, with the kind of text and the OCR confidence), and review items with Resolve and Skip.

**Tests.** `npm run typecheck`: no errors. `npm run test:unit`: 7 pass. `npx playwright test`: 4 pass, 2 skipped (the live tests), including the new step 2 test (text layer, OCR, review item for a blank page, Skip, page text, the PDF editor reporting "opened"). CI now runs `npm run vendor` with a cache. If vendoring fails there, the editor test checks the error message instead.

**Defect found and fixed during the build.** `@napi-rs/canvas` was not a direct dependency, so the bundler copied it into the main bundle, which broke its native loading. Every ingest job failed with "reading 'prototype'". This failure path itself worked as designed: the source showed "Failed", and a review item gave the reason. It is now a pinned direct dependency.

**Proof run (my run, real files).** The step 1 proof matter: the four court-software manuals, plus `scanned-contents.pdf`, an image-only page made from a real manual page. Script `scratchpad/proof2.mjs`, against the built app, with the live model `opencode-go/deepseek-v4.1-flash`:
- All 5 sources were read in about 2.6 seconds: 108 text-layer pages and 1 OCR page (91% confidence). No failures and no review items.
- `eFM_2.0_Manual.pdf` opened in the Euro-Office PDF editor, read only, about 1 second after the click.
- Question to the agent: "Where do the sources explain how to register as an Advocate-on-Record? Give each place as source, page and line." It used `search_sources`, `read_source_text` and `list_sources`. It cited, among others, eFM 2.0 p. 5 l. 1 and 4, eFM 3.0 p. 6 l. 14–15, and scanned-contents p. 1 l. 5. I checked these against the stored lines in `matter.db`, and all match.
- One inaccuracy in the reply: it called the eFM 2.0 text "OCR" where it is a text layer.

**Known and parked.** At start the editor asks for `oa-eo://app/downloadfile/<key>` (a document-server route) and gets 404. The document still opens through the desktop route, and this is parked. A service worker cannot register on the custom protocol, with no visible effect. The PDF editor still shows its File tab and a save icon. Saving is refused by our host, and the tab is hidden at step 4. Ingestion runs in the main process; moving it to a worker thread is parked.

**Not yet checked.** Linux and macOS vendoring (the tar.xz and dmg paths are written but have not run). Scrolling the PDF editor to a line anchor (parked). The owner's proof task on a real brief with real scanned pages.

## 16. Step 3: the Notebook

Spec: [docs/specs/v0-notebook.md](../../docs/specs/v0-notebook.md).

**Built.**
- `lib/notebook`: dates in Indian court formats, read day first (`12.03.2024`, `12/03/2024`, `12-03-2024`, `12th March, 2024`, `the 3rd day of January, 2021`, `March 12, 2024`). A two-digit year is an inferred date. A month and year is a range. Impossible dates (31.02) and vague words ("thereafter") are not dates. Each dated line gives one candidate event: the line, joined with the next line when the sentence runs on. Its kind is procedural or factual, by a fixed word list. Two events from different lines that describe the same act with different dates are flagged as a conflict. Method `rules-v1`.
- In the matter store: events are written once. Decisions are append-only, and a database CHECK allows only the advocate as their author. Date conflicts open review items. Readiness follows Appendix B-D.
- Extraction runs after ingestion and only once per source. Matters that already exist are extracted when they open.
- New read-only agent tools `list_events` and `get_chronology`, which the session now has (5 tools in all).
- The Notebook view: Matter, Sources, Procedural history, Factual Matrix and Chronology tabs; a readiness badge; date conflicts with "Keep <date>" and "Both dates are right"; Confirm, Reject, Exclude and Include. Each row links to its source page and line, and the page-text panel marks the line.

**Defect found by the tests and fixed.** The new triggers were named `event_no_update` and `event_no_delete`, the names already used by the event table. `CREATE TRIGGER IF NOT EXISTS` therefore skipped them silently, so Notebook events could be changed. The unit test found it. The triggers are now named `notebook_event_*`.

**Tests.** `npm run test:unit`: 12 pass (date formats, events, conflicts, and the store with Matters end to end). `npx playwright test`: 5 pass, 2 skipped (the live tests). The step 3 test covers a list of dates with a conflicting judgment date, the readiness badge, Keep, Confirm, Exclude, the chronology toggle, the procedural filter, and a source link that marks the line.

**Proof run (my run).** The real proof matter, with the four court manuals and the scanned page, using the live model:
- 3 events were extracted from 109 pages: version and revision dates. All are explicit and from the text layer, with no conflicts. Manuals hold few dates, so this is not a brief.
- One event joined a page footer of spaced-out letters into its description (parked).
- The agent answered from the Notebook with `get_chronology` and `list_events`. It listed the three events with correct citations, said that no conflict is open, and said that it cannot confirm events. It wrongly called one text-layer reading "OCR" (parked).

**Not yet checked.** The owner's proof task on a real brief: building the chronology, deciding every event, checking ten against the source lines, and resolving every conflict.

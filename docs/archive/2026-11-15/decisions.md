# Decisions

Status: frozen. Do not reopen an accepted decision (lesson L4). A new decision is added only by the owner, or where a task explicitly gives the choice to the engineer (for example decision 11).

This file owns: the accepted decisions, the engineering choices made under them, the rulings carried over from earlier records, the table of what they supersede, and the map from old terms to new terms.

## 1. Accepted decisions

| No. | Decision |
|---|---|
| 1 | One desktop application of our own, in Electron, in TypeScript. No Tauri. No Rust. Setup: electron-vite. Main process, preload bridge, React renderer. |
| 2 | The agent is Pi (pi.dev), embedded in the main process through its SDK. The agent gets only the tools we register. It gets no shell tool and no file-write tool. |
| 3 | The renderer is React. It holds no business logic and has no file access (`contextIsolation` on, `nodeIntegration` off, `sandbox` on). |
| 4 | One module, the matter store, is the single writer of matter facts: a matter folder, `matter.db` (SQLite), files stored by SHA-256, an append-only event record. |
| 5 | Human-only actions (confirm a fact, keep or undo a change, approve a revision) are named functions on the preload bridge. They are never agent tools. |
| 6 | Domain logic is plain libraries with no Electron import and no Pi import. |
| 7 | The Pi session records agent activity. The matter store records case facts. They link by ids only. |
| 8 | The editor is official Euro-Office only, from the Euro-Office organisation on GitHub. The third-party euro-office-lite project is not used, in any part. No Docker and no document server on the advocate's machine. Vendored Euro-Office files are never modified. |
| 9 | No dependency on one operating system. Node scripts, not PowerShell. Paths from Electron and `node:path`, never written by hand. Secrets through Electron `safeStorage`. A native binary sits behind one module that selects it by platform. |
| 10 | Supreme Court documents are English. Hindi OCR is out of scope. |

## 2. Engineering choices made under the decisions

| No. | Choice | Under | Evidence |
|---|---|---|---|
| 11 | **Component library: Astryx** (`@astryxdesign/core` with `@astryxdesign/theme-neutral`). It has a sortable table (`Table` with `useTableSortable`), tabs (`TabList`) and a dialog (`Dialog`, `AlertDialog`). It ships prebuilt CSS, so no StyleX build plugin is needed. Fluent UI and Mantine are not used. No second component library is added. | Task D3 | `@astryxdesign/core@0.7.15` package exports and `dist/Table/index.d.ts`; [D2 and D3 record](../.agents/logs/2026-11-13-step1-report.md) |
| 12 | **SQLite: the built-in `node:sqlite`** (`DatabaseSync`) in the main process. No native SQLite addon, so no per-platform rebuild. Fact: Node 24.13 prints "ExperimentalWarning: SQLite is an experimental feature" when it loads `node:sqlite`. If an Electron upgrade changes its API, `better-sqlite3` is the replacement behind the same matter-store module. | Decision 4, 9 | D2 smoke test, `spikes/d2-smoke/main.mjs` |
| 13 | **Pi package: `@earendil-works/pi-coding-agent`**, pinned exact. The session is created with our own `ResourceLoader` (no extensions, skills, prompt templates or context files are discovered), an in-memory `SettingsManager`, and `tools: [<our tool names>]` with `customTools`. This is how "only the tools we register" is enforced. | Decision 2 | D2 smoke test; Pi `docs/sdk.md`; `dist/core/sdk.d.ts` (`tools`, `customTools`, `noTools`) |
| 14 | **Panes: `react-resizable-panels`.** It splits the chat dock from the view, and the PDF editor from the page text. | Task D4 | — |
| 15 | **Tests: Playwright against the built application** (`_electron.launch`), plus `node:test` for the plain libraries. | Task D4 | — |
| 16 | **Model credentials: Pi's own credential store.** The application stores no model secret. | Owner, 2026-11-13 | questions.md Q-2 |
| 17 | **Model selection: pi-ai's model list.** The chat composer lists `ModelRuntime.getAvailable()`. The default is `OPENADVO_MODEL`, then the advocate's saved choice (`settings.json` in user data, resolved with the SDK's `resolveCliModel`), then the application default `opencode-go/deepseek-v4.1-flash` (owner, 2026-11-14), then Pi's own default model setting, then the first available model. A change applies to open sessions through `session.setModel`. Pi's own default is not changed. **Reasoning effort** (owner, 2026-11-14): shown beside the model, with the levels the model accepts; the choice is saved in `settings.json` and applies through `session.setThinkingLevel`. | Owner, 2026-11-13 and 2026-11-14 | `src/main/agent.ts` |
| 18 | **Euro-Office: the complete official desktop release, every editor, inside the window.** Hosted like euro-office-lite hosts it (host page, `AscDesktopEditor` bridge, `x2t` backend), but with the release's published editor files, unchanged. Moves Euro-Office hosting to build step 2. | Owner, 2026-11-13 | [euro-office-vendoring.md](euro-office-vendoring.md) |
| 19 | **PDF text: `pdfjs-dist`** (text layer with positions, grouped into lines). **Page images for OCR: `@napi-rs/canvas`**, a prebuilt native canvas per platform, installed by npm and loaded through N-API. **OCR: `tesseract.js`** with English data from `@tesseract.js-data/eng`, so nothing is downloaded at run time. All run in the main process (decision 6: inside `lib/document-intelligence`). | Step 2 | `tests/unit/document-intelligence.test.ts` |

| 20 | **Window layout** (replaces the step 1 layout of matters, view, chat). One title bar of our own, with the system window controls at its end; no File, Edit, View, Window menu. A side navigation that hides to an icon rail (Astryx `AppShell` and `SideNav`): New matter, Home, the matters. With no matter open, the view is the chat landing page. In a matter, the chat is docked on the left and the view fills the right: the Notebook, a source, or the Word editor. There is no pane right of the view. An editor fills the view to its top edge, and the harness bar of a draft sits in the chat dock. The navigation folds while a source or a draft is open. Icons: `@heroicons/react`, the set the Astryx templates use. | Owner, 2026-11-14 | `src/renderer/src/App.tsx`; `tests/e2e/app.spec.ts` |
| 21 | **Agent to window stream: the AG-UI protocol** (`@ag-ui/core`, pinned exact; types and event schemas only). The main process translates Pi session events into AG-UI events and sends them over our own IPC: `RUN_STARTED`, text message and tool call events, then `RUN_FINISHED` or `RUN_ERROR`. No HTTP server and no CopilotKit UI: Astryx renders the events (choice 11). A question the agent puts to the advocate will use an AG-UI interrupt; the answer to a human-only action is still recorded by a bridge function (decision 5). Since step 5, a run in which the agent proposed draft changes ends with `RUN_FINISHED` and an `interrupt` outcome, one interrupt per change; Keep and Undo are the bridge function `decideAgentChanges`. | Owner, 2026-11-14 | `src/main/agent.ts`; `src/renderer/src/ChatDock.tsx`; one real turn of 124 events, all valid against `EventSchemas` ([session record](../.agents/logs/2026-11-14-layout-and-step5-start.md)) |

## 3. Rulings carried over from earlier records

The workflow names these. They keep their meaning. The earlier id is given for traceability only.

| No. | Ruling | Earlier id |
|---|---|---|
| R-1 | An advisory outcome score may use subject category, bench strength, disposal type and period. It never uses a judge identifier. | OQ-10 |
| R-2 | An advocate attestation of a citation unblocks it. The AI-use disclosure lists it as advocate-attested. | OQ-08 |
| R-3 | The AI-use disclosure is a required part of every filing package. | OQ-06 |
| R-4 | An amended section with no advocate attestation blocks, through "Blocked pending legal review". | OQ-09 |
| R-5 | Verification is online. A source that cannot be reached yields `unresolved`, and `unresolved` blocks. | P4 |
| R-6 | Only court public records are verified. Client-supplied files are tagged `client_supplied` and are never put through the validator. | P5 |

## 4. What the decisions supersede

The three earlier repositories are reference only (see [repo-map.md](repo-map.md)). Their rules and tests may be ported. Their architecture is not taken.

| Earlier decision or design | Where it is recorded | Superseded by |
|---|---|---|
| Rust kernel that writes the record; `oa` CLI; `oa-protocol` crate; Rust stores; native addon for the window | `openadvodeprecated/docs/decisions.md` P1, P2, PH-01, PH-02, PH-03, PH-16; specs B, C, E | 1, 4, 6 |
| "CLI first": every capability usable from `oa` before it has a pane; GUI and CLI parity | `openadvodeprecated` P1, P9 | 1. The bridge and the agent tools are the two surfaces. |
| Window named `oa-shell.exe`, one `WebContentsView` per view split, three regions in the order left pane, chat, view | `openadvodeprecated` PH-05, PH-15 | 1, 3, and choice 20: side navigation, chat dock, view |
| Pi runs as a separate supervised Node process, never in Electron's main process | `openadvodeprecated` PH-18, P7 | 2 |
| Pi, OCR engines and Euro-Office vendored as source into our tree | `openadvodeprecated` P7 | 2 (Pi is an npm dependency), 8 (Euro-Office is fetched from official releases or source by a script) |
| One internal UI module; no third-party widget kit | `openadvodeprecated` PH-10 | 11 |
| PDF viewer through pdfium and `pdfium-render`; DOCX reader `docx-rs` | `openadvodeprecated` OQ-18, OQ-19 | 1 (no Rust). Step 2 and step 4 choose TypeScript-side libraries. |
| DeepSeek Harness (DSH) plugins; `dsh-workspace-editor` component; component publication and compatibility gate | `advodsh` AGENTS.md, docs; `openadvocate` docs V0-C01 to V0-C22 | 1, 2 |
| Editor frontend and Document Builder taken from euro-office-lite | `advodsh/docs/eurooffice-hosting-assessment.md`, `advodsh/vendor/euro-office/manifest.json` | 8 |
| Agent edits are proposals in a separate proposal store; change proposals and fan-out | `openadvocate` V0-C13; `advodsh/docs/legal-docx-workspace.md` sections 4.12, 12, 19 | [editor-design.md](editor-design.md) item a: agent edits are tracked changes in the DOCX |
| LibreOffice for read-only previews and as a conversion fallback | `openadvocate` V0-C15 | 8 |
| Build order owned by `openadvodeprecated/docs/architecture.md` | `openadvodeprecated` PH-12 | [build-plan.md](build-plan.md) |

## 5. Map of old terms to new terms

| Old term | New term |
|---|---|
| Kernel | The matter store (canonical matter facts, revisions, events). Permissions and approvals sit in the main process and the bridge. |
| Harness, harness connection | The agent: one Pi session in the main process, with our registered tools. |
| `oa` commands | Bridge functions (for the advocate) and agent tools (for the agent). |
| Crates (`oa-kernel`, `oa-protocol`, stores) | Main-process modules and plain TypeScript libraries under `src/lib`. |
| Spec letters A to U | Build-plan steps 1 to 10. See the coverage table in [build-plan.md](build-plan.md). |
| `ulos` | Unchanged. The validator, built in its own repository. |

## 6. Questions for the owner

Open questions live in [questions.md](questions.md).

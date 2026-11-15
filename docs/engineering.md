# Engineering

This file owns the engineering choices made under the decisions in [decisions.md](decisions.md), how the vendored parts are fetched, and the editor rules. The code is the authority for every detail. Each row names the file to read.

## 1. Engineering choices

These choices are in the code now. They carry over from the archived decisions (choices 11 to 21) with the same meaning.

| No. | Choice | Where in the code |
|---|---|---|
| EC-1 | **Component library: Astryx** (`@astryxdesign/core` with `@astryxdesign/theme-neutral`). Prebuilt CSS, so no StyleX build plugin. No second component library. | `src/renderer` |
| EC-2 | **SQLite: the built-in `node:sqlite`** (`DatabaseSync`) in the main process. No native SQLite addon. If an Electron upgrade changes its API, `better-sqlite3` replaces it behind the same store module. | `src/lib/matter-store` |
| EC-3 | **Pi package: `@earendil-works/pi-coding-agent`**, pinned exact. Each session uses Pi's `DefaultResourceLoader` and a file-backed `SettingsManager` in the application's Pi folder (`<userData>/pi-agent`), so extensions, packages, Pi skills, prompt templates and context files load from there (decision 22). `noTools: "builtin"` and an exclude list keep Pi's built-in tools off; our tools come through `customTools`. `PI_CODING_AGENT_DIR` points at that folder; credentials and models are read from the owner's Pi folder with explicit paths (decision 23). | `src/main/agent.ts`, `src/main/pi-extensions.ts` |
| EC-4 | **Panes: `react-resizable-panels`.** | `src/renderer` |
| EC-5 | **Tests: Playwright against the built application** (`_electron.launch`), and `node:test` for the plain libraries. | `tests/e2e`, `tests/unit` |
| EC-6 | **Model credentials: Pi's own credential store.** The application stores no model secret. | `src/main/agent.ts` |
| EC-7 | **Model selection: pi-ai's model list.** The default is `OPENADVO_MODEL`, then the advocate's saved choice in `settings.json`, then the application default, then Pi's own default, then the first available model. Reasoning effort is chosen beside the model and saved in `settings.json`. | `src/main/agent.ts` |
| EC-8 | **Euro-Office: the complete official desktop release, every editor, inside the window.** A host page supplies `window.AscDesktopEditor`; the release's own `x2t` converts. | `src/editor-host`, `src/main` |
| EC-9 | **PDF text: `pdfjs-dist`.** Page images for OCR: `@napi-rs/canvas`. OCR: `tesseract.js` with bundled English data, and PP-OCR through ONNX Runtime as the second engine. Planned (decision 27): docTR replaces PP-OCR as the second engine; comparison and disputes move to feature H17. | `src/lib/document-intelligence` |
| EC-10 | **Window layout.** One title bar of our own. A side navigation that folds to an icon rail. In a matter, the chat is docked on the left and the view fills the right. Icons: `@heroicons/react`. The navigation of [advocate-workflow.md](advocate-workflow.md) section 3 extends this layout (feature Q7). | `src/renderer/src/App.tsx` |
| EC-11 | **Agent to window stream: the AG-UI protocol** (`@ag-ui/core`, pinned exact; types and schemas only) over our own IPC. No HTTP server. A question or an approval is an AG-UI interrupt. The answer to a human-only action is recorded by a bridge function. | `src/main/agent.ts`, `src/renderer/src/ChatDock.tsx` |
| EC-12 | **Extension UI: Pi's RPC pattern.** Extensions bind with `mode: "rpc"` and a UI context of our own: notices, status lines, and terminal screens rendered once as text. | `src/main/pi-extensions.ts` |

New choices that Phase 1 needs (the vector index, the skill file format, the `intel.db` and `advocate.db` schemas) are made in the spec of the step that needs them, and are then added here.

## 2. Vendored parts

The vendored parts are not in the repository. Each has its own script. A script exits non-zero on any failure.

| Part | Command | Source and pin | Goes to |
|---|---|---|---|
| Euro-Office editors, converter, fonts and dictionaries | `npm run vendor` (`--from <file>` uses a local copy, still checked by SHA-256) | Official `Euro-Office/DesktopEditors` release; tag, commit, file list and hashes in `scripts/euro-office.manifest.json` | `resources/euro-office/<platform>/` |
| `ulos` citation validator and its court database | `npm run vendor:ulos` | `ULOS_SRC`, default `C:\dev\ulosadvo` | `resources/ulos/<platform>/` |
| Speech model (Whisper) | `npm run vendor:voice` | Hugging Face, revision in `VOICE_REVISION`; hashes written to `vendor.lock.json` | `resources/models/` |
| Second OCR engine (PP-OCR) | `npm run vendor:ocr` | RapidOCR models at a pinned revision, checked by SHA-256 in `scripts/vendor-ocr.ts` | `resources/models/ppocr/` |
| Bundled Pi extensions | `npm run vendor:extensions` | npm, exact versions; registry integrity checked against `scripts/pi-extensions.manifest.json`; no install scripts, no peer packages | `resources/pi-extensions/` |

**Euro-Office risk and its test.** `window.AscDesktopEditor` is not a documented interface. A new release can add or change a call. Before every release upgrade: open a DOCX and a PDF, type, run one agent edit, save and reopen. Log every `AscDesktopEditor` call and fail on a call that the host does not answer.

**Licence facts.** The licence statements of the Euro-Office parts, as recorded on 2026-11-13, are in [archive/2026-11-15/euro-office-vendoring.md](archive/2026-11-15/euro-office-vendoring.md). Facts only.

## 3. Editor rules

The code implements these rules now.

1. **One record.** Agent edits are tracked changes in the DOCX, authored by "Open Advocate agent". There is no second proposal store.
2. **Harness bar.** Our own bar, in the chat dock, outside the editor frame.
3. **Ribbon.** Trimmed by editor configuration only, never by changing vendored files.
4. **Review.** Each agent turn that edits a draft gives one chat card: what changed, with Keep all, Undo all and Review one by one. Keep and Undo are bridge functions.
5. **Substantive changes.** A change to a date, an amount, a citation, a party name or a prayer is listed separately and is never part of Keep all.
6. **Gate.** A revision cannot be approved, and no filing PDF can be made, while an agent change is undecided.
7. **Store.** The matter store owns every revision. The editor works on a working copy. A save with a stale base revision is refused.
8. **Hosting.** The editors run in a sandboxed frame with no Node integration.

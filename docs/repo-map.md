# Repository map

This file owns the folders, the write boundaries, the data outside the repository, and the reference repositories. A row marked **planned** does not exist yet. It names the feature that creates it.

## Folders

| Folder | Holds | Who writes it |
|---|---|---|
| `src/main/` | Electron main process: window, bridge handlers, agent sessions, and the modules that call the libraries. | Main-process code only. |
| `src/main/matters.ts` | The only caller of the matter store library. | The single writer of matter facts (decision 4). |
| `src/preload/` | The bridge: named functions exposed to the renderer through `contextBridge`. | — |
| `src/renderer/` | React views. No business logic, no file access (decision 3). | — |
| `src/editor-host/` | The host page that supplies `window.AscDesktopEditor` to the Euro-Office editors. | — |
| `src/lib/` | Plain domain libraries. No Electron import, no Pi import (decision 6). | — |
| `src/shared/` | Types shared by main, preload and renderer. No runtime code with side effects. | — |
| `src/lib/court-adapters/` | **Planned (S1, S14).** One adapter per court; Playwright scripts for scheduled work. | — |
| `src/main/browser/` | **Planned (S12).** The built-in browser: tabs, hidden agent pages, DevTools Protocol control. | Main-process code only. |
| `skills/` | **Planned (N1).** Built-in skills and practice packs, one file per skill. | Engineers, through a reviewed change (N8). |
| `tests/unit/` | `node:test` tests of the plain libraries. | — |
| `tests/e2e/` | Playwright tests against the built application. | — |
| `scripts/` | Node scripts. No PowerShell (decision 9). | — |
| `spikes/` | Small proofs that settle one question. Each has a result file. Not product code. | — |
| `docs/` | Durable documents. See [README.md](README.md). | — |
| `docs/archive/` | Superseded documents, kept for their history. They govern nothing. | Moved there only. Never edited. |
| `.agents/logs/` | Session reports: commands run, results and evidence paths. They govern nothing. | — |
| `resources/euro-office/` | The vendored Euro-Office parts ([engineering.md](engineering.md) section 2). Never committed, never modified. | The vendor script only. |
| `resources/ulos/` | The vendored `ulos` validator and its court database. Never committed, never modified. | The vendor script only. |
| `resources/models/` | The vendored speech model and, in `ppocr/`, the second OCR engine's models. Never committed, never modified. | The vendor scripts only. |
| `resources/pi-extensions/` | The bundled Pi extensions ([harness-hardening.md](harness-hardening.md) section 3). Never committed, never modified. | The vendor script only. |
| `out/` | Build output of electron-vite. Not committed. | — |
| `release/` | The folder to install, made by `npm run dist`. Not committed. | — |

## Data outside the repository

| Path | Holds |
|---|---|
| Matters root: `<Documents>/Open Advocate/Matters`, or the folder in `OPENADVO_HOME` | One folder per matter: `matter.db`, `blobs/<sha256>`, `filing/<time>/` (filing sets with `manifest.json`), `chat/` (Pi session files and the window's messages), `memory.md`, `studio/<run>/` (the model calls of an argument-loop or rehearsal run), `questions/`, and the marker file `archived` when the matter is archived. |
| User data | `settings.json` (model, effort, mail account), `workflows.json` (the advocate's own workflows), `manifest-signing.key` (encrypted with `safeStorage`), `corpus/` (`corpus.db` and the fetched judgment PDFs by SHA-256), `contacts.json`, `word/<matter id>/` (the Word round trip), `logs/editor-host.log`, and `Crashpad/` (local crash dumps; nothing is uploaded). No secret in plain text: the mail password is in `safeStorage`. |
| User data: `pi-agent/` | The application's Pi folder, which is also Pi's agent folder (`PI_CODING_AGENT_DIR`, decision 23): `settings.json` (packages the advocate added, Pi settings), `npm/` and `git/` (installed packages), `extensions/pi-permission-system/` (`config.json`, the permission policy; `logs/`, the review log), `subagent-manager/` (the helper-agent policy, rewritten on every start), the extensions' own preference files, and any Pi skills, prompt templates, context files or extensions placed there. |
| User data, **planned (Q6)** | `advocate.db` (profile, preferences, advocate memory, Knowledge Library) and `intel.db` (court directory, packs, sources and their freshness). `skills/` for the advocate's own skills (N1). |
| Pi credentials | Pi's own credential store. The application does not read or copy it (choice EC-6). |

## Reference repositories

Read only. Never edit them. Never copy a document whole. Read a file there only when a task names it. Copy code only where a task names the file.

| Repository | What it was |
|---|---|
| `C:\dev\openadvodeprecated` | Rust kernel, `oa` CLI, specs A to U. |
| `C:\dev\openadvocate` | DSH fork plan. |
| `C:\dev\advodsh` | DSH plugin testbed: editor host, engine sidecar, document model. |
| `C:\dev\ulosadvo` | The `ulos` validator. Vendored by `npm run vendor:ulos`. |
| `C:\dev\archive\research` | Research files C1 to C4, C6, C7. |

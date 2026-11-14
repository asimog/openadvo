# Repository map

## Folders

| Folder | Holds | Who writes it |
|---|---|---|
| `src/main/` | Electron main process: window, bridge handlers, the agent session, the modules that call the libraries. | Main-process code only. |
| `src/main/matters.ts` | The only caller of the matter store library. | The single writer of matter facts (decision 4). |
| `src/preload/` | The bridge: named functions exposed to the renderer through `contextBridge`. | — |
| `src/renderer/` | React views. No business logic, no file access (decision 3). | — |
| `src/lib/` | Plain domain libraries. No Electron import, no Pi import (decision 6). | — |
| `src/shared/` | Types shared by main, preload and renderer. No runtime code with side effects. | — |
| `tests/unit/` | `node:test` tests of the plain libraries. | — |
| `tests/e2e/` | Playwright tests against the built application. | — |
| `scripts/` | Node scripts. No PowerShell (decision 9). | — |
| `spikes/` | Small proofs that settle one question. Each has a result file. Not product code. | — |
| `docs/` | Durable documents. See [README.md](README.md). | — |
| `.agents/logs/` | Work reports, commands run and results. | — |
| `resources/euro-office/` | The vendored Euro-Office parts, fetched by script at step 2. Never committed and never modified. | The vendor script only. |
| `resources/ulos/` | The vendored `ulos` validator and its court database, copied from `C:\dev\ulosadvo` by `npm run vendor:ulos` (step 7). Never committed and never modified. | The vendor script only. |
| `resources/models/` | The vendored speech model (Whisper tiny, English), fetched by `npm run vendor:voice` (step 10). Never committed and never modified. | The vendor script only. |
| `out/` | Build output of electron-vite. Not committed. | — |
| `release/` | The folder to install, made by `npm run dist` from `electron-builder.yml`. Not committed. | — |

## Data outside the repository

| Path | Holds |
|---|---|
| Matters root: `<Documents>/Open Advocate/Matters` (from `app.getPath("documents")`), or the folder in `OPENADVO_HOME` | One folder per matter: `matter.db`, `blobs/<sha256>`, `filing/<time>/` (filing sets with `manifest.json`), `chat/` (Pi session files in `chat/pi/` and the window's `messages.json`), `memory.md` (the advocate's matter memory), `studio/<run>/` (every model call of an argument-loop run, with `calls.json`), and the marker file `archived` when the matter is archived. |
| User data: `settings.json` (model, effort, mail account), `workflows.json` (the advocate's own workflows) `manifest-signing.key` (the Ed25519 key for filing manifests, encrypted with `safeStorage`), and `corpus/` (the shared judgment index `corpus.db` and the fetched judgment PDFs with their text, by SHA-256) | Settings of the application. No secret: the mail password is in `safeStorage`. |
| Pi credentials | Pi's own credential store for the owner. The application does not read or copy it. See [questions.md](questions.md) Q-2. |

## Reference repositories

Read only. Never edit them. Never copy a document whole. Copy code only where a task or the build plan names the file. Read a file there only when a task names it.

| Repository | What it was | What may be taken |
|---|---|---|
| `C:\dev\openadvodeprecated` | Rust kernel, `oa` CLI, specs A to U, `docs/decisions.md`. | Rules and acceptance tests named by a build-plan step. |
| `C:\dev\openadvocate` | DSH fork plan: `docs/decisions.md` (V0 constraints), `docs/architecture.md`. | Rules named by a build-plan step. |
| `C:\dev\advodsh` | DSH plugin testbed: `plugins/workspace-editor` (editor host, engine sidecar, document model), `docs/legal-docx-workspace.md`, `AGENTS.md`. | The files listed in build-plan step 4 and step 5. |
| `C:\dev\ulosadvo` | The `ulos` validator. Treated as done. | Integrated at step 7. Read only the files that step names. |
| `C:\dev\archive\research` | Research files C1 to C4, C6, C7. | Sections named by a build-plan step. |

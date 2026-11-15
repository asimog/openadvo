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
| `src/lib/court-adapters/` | The court-rule adapter library: checks of an adapter, the quote match, section extraction, format checks ([specs/court-adapters.md](specs/court-adapters.md)). **Planned (S12):** the court-portal adapters and their Playwright scripts. | — |
| `src/lib/browser/` | The browser's plain logic: address normalisation, the URL rule, bookmarks, recent pages, the new-tab page and the case-list answer (S10). | — |
| `src/lib/library/` | The Knowledge Library's kind proposal, title and folder scope (M1). | — |
| `src/lib/classification/` | The classification proposal from the title, files, parties and profile (C3). | — |
| `src/lib/stages/` | The stage list of each proceeding (C4). | — |
| `src/lib/evidence/` | Phase 4's plain rules: facts, structure, layout, relations, contradictions, timelines, templates, jurisdiction and related matters. | — |
| `src/lib/court-directory/` | The offline directory of courts and tribunals (B1). | Engineers; the advocate's corrections come with the pack editor. |
| `adapters/` | Built-in court adapters, one folder per adapter with `adapter.json` (data, never code). | Engineers, with every quote read in the official document. |
| `src/main/browser.ts` | The built-in browser (S10): tabs, bookmarks, recent pages, hidden agent pages, DevTools Protocol control and downloads into the matter. | Main-process code only. |
| `src/main/library.ts` | The Knowledge Library's file import and blob folder (M1). | Main-process code only. |
| `src/main/matter-proposals.ts` | The matters the agent proposes in the chat (C2). | Main-process code only. |
| `src/main/evidence.ts` | The post-ingest analysis: facts, structure, relations, contradictions, the evidence graph and the jurisdiction report (phase 4). | Main-process code only. |
| `src/main/document-ops.ts` | PDF extract, split, merge, reorder, annotate, highlight and redact, each writing a new source (H13). | Main-process code only. |
| `skills/` | Built-in skills, one folder per skill with `SKILL.md` ([specs/harness-and-stores.md](specs/harness-and-stores.md) section 2). Practice packs come in phase 8. | Engineers, through a reviewed change (N6). |
| `tests/unit/` | `node:test` tests of the plain libraries. | — |
| `tests/e2e/` | Playwright tests against the built application. The native harness parts have one file each: `native-policy.spec.ts`, `native-helpers.spec.ts`, `native-plan.spec.ts`, `native-context.spec.ts`. Phase 1 is `phase1.spec.ts`; phase 2 is `phase2.spec.ts`; phase 3 is `phase3.spec.ts`; phase 4 is `phase4.spec.ts`. | — |
| `scripts/` | Node scripts. No PowerShell (decision 9). | — |
| `spikes/` | Small proofs that settle one question. Each has a result file. Not product code. | — |
| `docs/` | Durable documents. See [README.md](README.md). | — |
| `docs/archive/` | Superseded documents, kept for their history. They govern nothing. | Moved there only. Never edited. |
| `.agents/logs/` | Session reports: commands run, results and evidence paths. They govern nothing. | — |
| `.agents/prompts/`, `.agents/templates/` | Successor prompts (the handoff to the next session) and their template, `session-handoff.md`. They govern nothing. | — |
| `resources/euro-office/` | The vendored Euro-Office parts ([engineering.md](engineering.md) section 2). Never committed, never modified. | The vendor script only. |
| `resources/ulos/` | The vendored `ulos` validator and its court database. Never committed, never modified. | The vendor script only. |
| `resources/models/` | The vendored speech model and, in `ppocr/`, the second OCR engine's models. Never committed, never modified. | The vendor scripts only. |
| `resources/adapters/` | Vendored court adapters and `adapters.lock.json`. Never committed. | `npm run vendor:adapters` only. |
| `extensions/` | The bundled Pi extensions: one Pi package per folder. Today only `placeholder/` ([specs/native-harness-parts.md](specs/native-harness-parts.md) section 6). | Code changes with tests. |
| `resources/pi-extensions/` | Not used any more. An older checkout vendored seven Pi packages here; the folder can be deleted. | — |
| `out/` | Build output of electron-vite. Not committed. | — |
| `release/` | The folder to install, made by `npm run dist`. Not committed. | — |

## Data outside the repository

| Path | Holds |
|---|---|
| Matters root: `<Documents>/Open Advocate/Matters`, or the folder in `OPENADVO_HOME` | One folder per matter: `matter.db`, `blobs/<sha256>`, `filing/<time>/` (filing sets with `manifest.json`), `chat/` (Pi session files, the window's messages, `plan.json`, `helpers.json`, `helpers/<id>.txt` and a Pi session file for each helper, `skills/<run id>/` with the Pi session file of each skill run, and `trace.jsonl`), `memory.md`, `studio/<run>/` (the model calls of an argument-loop or rehearsal run), `questions/`, and the marker file `archived` when the matter is archived. |
| User data | `settings.json` (model, effort, mail account, `planStrength`, `partyRule`, disabled extensions), `workflows.json` (the advocate's own workflows), `manifest-signing.key` (encrypted with `safeStorage`), `corpus/` (`corpus.db` and the fetched judgment PDFs by SHA-256), `contacts.json`, `word/<matter id>/` (the Word round trip), `logs/editor-host.log`, and `Crashpad/` (local crash dumps; nothing is uploaded). No secret in plain text: the mail password is in `safeStorage`. |
| User data: `firm-agent/` | The Firm Agent's conversation (feature O10): `pi/` (Pi session files), `messages.json`, `trace.jsonl`, `handoffs.json` (instructions waiting for the advocate) and `usage.jsonl`. |
| User data: `pi-agent/` | The application's Pi folder, which is also Pi's agent folder (`PI_CODING_AGENT_DIR`, decision 22): `settings.json` (packages the advocate added, Pi settings), `npm/` and `git/` (installed packages), the added extensions' own files, and any Pi skills, prompt templates, context files or extensions placed there. |
| User data: `tool-policy.json`, `logs/tool-policy.jsonl` | The tool policy and its review log (decision 23; [harness-build.md](harness-build.md) section 1.3). |
| User data: `adapters/`, `intel/docs/` | The advocate's own court adapters (copies made with Edit a copy, and adapters added from a file, with `adapters.lock.json`), and the court documents downloaded or uploaded for a list, by SHA-256. |
| User data: `advocate.db`, `intel.db`, `skills/` | `advocate.db` (profile, preferences, advocate memory, the Knowledge Library) and `intel.db` (sources and their freshness; the court directory and packs from phase 2), each with its own hash-chained `event` table (Q4). `skills/` holds the advocate's own skills, one folder per skill (N1). |
| User data: `library/`, `browser-bookmarks.json`, `browser-history.json`, `matter-proposals.json`, `enrolment.bin` | The Knowledge Library's files by SHA-256 (M1); the browser's bookmarks and recent pages (S10); the matters the agent proposed (C2); the enrolment number encrypted with `safeStorage` (A2). |
| Pi credentials | Pi's own credential store. The application does not read or copy it (choice EC-6). |

## Reference repositories

Read only. Never edit them. Never copy a document whole. Read a file there only when a task names it. Copy code only where a task names the file.

One exception (owner, 2026-11-15): **always** read `C:\dev\pireference` before you write code against the Pi SDK, an extension, a tool, a session feature or a UI context. Read `packages/coding-agent/examples/sdk`, `examples/extensions`, `docs/` and the source. Before you build a harness part, check whether Pi already has it, and use Pi's feature. Never edit the folder, and never commit it into this repository.

| Repository | What it was |
|---|---|
| `C:\dev\openadvodeprecated` | Rust kernel, `oa` CLI, specs A to U. |
| `C:\dev\openadvocate` | DSH fork plan. |
| `C:\dev\advodsh` | DSH plugin testbed: editor host, engine sidecar, document model. |
| `C:\dev\ulosadvo` | The `ulos` validator. Vendored by `npm run vendor:ulos`. |
| `C:\dev\archive\research` | Research files C1 to C4, C6, C7. |
| `C:\dev\pireference` | Pi (`https://github.com/earendil-works/pi`), tag `v1.5.2`, commit `b4afdddf`, cloned 2026-11-15. It matches the pinned `@earendil-works/pi-coding-agent` 1.5.2. Its `REFERENCE.md` records the source. Read it as the exception above says. |

# Decisions

Status: frozen. Do not reopen an accepted decision (lesson L4). Only the owner adds a decision.

This file owns the accepted decisions, the rulings that apply, and the terms the code still uses. The engineering choices made under the decisions are in [engineering.md](engineering.md).

## 1. Base decisions

The code follows these decisions now. They keep their numbers.

| No. | Decision |
|---|---|
| 1 | One desktop application of our own, in Electron, in TypeScript. Setup: electron-vite. Main process, preload bridge, React renderer. |
| 2 | The agent is Pi, embedded in the main process through its SDK. The agent gets the tools we register and the tools of the Pi extensions the advocate enabled (decision 21). It gets no shell tool and no file-write tool. |
| 3 | The renderer is React. It holds no business logic and has no file access (`contextIsolation` on, `nodeIntegration` off, `sandbox` on). |
| 4 | Each store has one writer. The matter store is the single writer of matter facts: a matter folder, `matter.db` (SQLite), files stored by SHA-256, and an append-only, hash-chained event record. |
| 5 | Human-only actions are named functions on the preload bridge. They are never agent tools. |
| 6 | Domain logic is plain libraries with no Electron import and no Pi import. |
| 7 | The Pi session records agent activity. The stores record case facts. They link by ids only. |
| 8 | The editor is official Euro-Office only. No Docker and no document server on the advocate's machine. Vendored Euro-Office files are never modified. |
| 9 | No dependency on one operating system. Node scripts, not PowerShell. Paths from Electron and `node:path`. Secrets through Electron `safeStorage`. A native binary sits behind one module that selects it by platform. |

## 2. Product and harness decisions

| No. | Decision |
|---|---|
| 10 | **Litigation only.** Open Advocate covers litigation before every Indian court and tribunal. It has no practice management: no billing, time, fees, accounting, CRM, marketing or firm analytics. Scope is in [product.md](product.md) section 2. |
| 11 | **Simple onboarding.** Four skippable steps, then one Practice Profile page. Every other preference is learned later and approved by the advocate. See [advocate-workflow.md](advocate-workflow.md) sections 1 and 2. |
| 12 | **Canonical stores.** `matter.db` per matter, `corpus.db` (public law), `intel.db` (courts, rules and sources, versioned) and `advocate.db` (profile, preferences, advocate memory, Knowledge Library). Each store has one writer module and its own hash-chained audit. See [architecture.md](architecture.md) section 3. |
| 13 | **Derived indexes own nothing.** Full text, vectors, the three graphs and the analytics views are rebuilt from the canonical stores. The graphs are SQLite edge tables, not a graph database. |
| 14 | **Skills are the unit of work.** A skill is a versioned file with inputs, required context, permitted tools, an output schema, checks and approval points. Built-in skills live in the repository. The advocate's own skills live in user data. See [skills.md](skills.md). |
| 15 | **One harness.** Every skill run gets a context package, a scoped Pi session, an output check, an evaluator gate (at most two rewrites) and a report card. See [architecture.md](architecture.md) sections 5 and 7. |
| 16 | **Rules are dated.** Every court rule, statute version and source has its source, its retrieval date and its check interval. A row past its interval is stale. A check that depends on a stale row is "unconfirmed", never "passed". |
| 17 | **Court adapters prepare. They never submit.** An adapter declares its capabilities and its access method. It never solves a CAPTCHA, never holds court credentials, and never submits a filing. Submission keeps the two-confirmation flow of the code. |
| 18 | **No outcome prediction.** No judge personality profile. Bench data is used only for legal-authority research. |
| 19 | **Languages.** English first. Hindi and other Indian languages in phase 11 (features U1 to U3). A translation sits beside the original. It is never the source. |
| 20 | **Build order.** Thirteen phases, each building one or two modules deep and complete ([build-plan.md](build-plan.md)). Each phase ends with real briefs that the owner completes. |
| 21 | **Pi extensions** (owner, 2026-11-15). Every Pi feature is made available through the harness ([harness-hardening.md](harness-hardening.md)). The advocate can add Pi extensions. Six are bundled: pi-subagent-manager, pi-context-decisions, pi-checklist, pi-context-prune, pi-context-usage and pi-cache-graph. Pi's built-in file and shell tools stay off (decision 2). |
| 22 | **Pi's agent folder is the application's own** (owner, 2026-11-15). At start the application sets `PI_CODING_AGENT_DIR` to `<userData>/pi-agent`, so every extension keeps its settings and logs there. Model credentials and models are still read from the owner's Pi folder (decision 16). |
| 23 | **pi-permission-system enforces the tool policy** (owner, 2026-11-15). Its policy file is in the application's Pi folder: allow by default; deny shell commands, Pi's built-in tools and credential files; review log in the application's folder. The rules are in [harness-build.md](harness-build.md) section 1.3. |
| 24 | **No confidential distinction, for now** (owner, 2026-11-15). Every matter uses the chosen model, loads the extensions and may search the web. |
| 25 | **Filing-ready, not filing** (owner, 2026-11-15). Open Advocate produces documents ready to file; the advocate files them. Filing readiness is part of local legal intelligence (features B11 to B17). Filing on a portal by the agent is the last phase (feature T1). The portal filing flow already in the code stays as it is until then. |
| 26 | **docTR is the second OCR engine** (owner, 2026-11-15). It works beside Tesseract (feature H3). Comparison between engines, critical-token disputes, a second engine for regional languages, and OCR checks come later (feature H14, phase 11). |

## 3. Rulings

| No. | Ruling |
|---|---|
| R-1 | An advocate attestation of a citation unblocks it. The AI-use disclosure lists it as advocate-attested. |
| R-2 | The AI-use disclosure is a required part of every filing package. |
| R-3 | An amended section with no advocate attestation blocks, through "Blocked pending legal review". |
| R-4 | Verification is online. A source that cannot be reached yields `unresolved`, and `unresolved` blocks. |
| R-5 | Only court public records are verified against the validator. Client-supplied files are tagged `client_supplied` and are never put through the validator. |

## 4. Names in the code

Some code modules and comments use names from before the current plan. This table maps them to the names in these documents.

| Name in the code | Name in these documents |
|---|---|
| `notebook` (the Notebook view) | The Facts & Chronology tab |
| The Sources view | The Documents & Evidence tab |
| `studio` (the Research and Argument Studio) | The Research & Authorities and the Arguments & Strategy tabs |
| The Practice view | The Proceedings & Hearings and the Tasks & Deadlines tabs |
| `workflows` (six built-in SLP workflows) | Skills and workflows ([skills.md](skills.md)) |
| Step, round, `V1-…` to `V5-…` in comments | Work done before this plan; see the code itself |
| Spec paths under `docs/archive/` in comments | Superseded documents kept for history; they govern nothing |
| `ulos` | The citation validator, built in its own repository |

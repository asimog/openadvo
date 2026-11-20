# Rewrite audit — Stage 1: the verified state of the code

Status: **audit only**. This file owns the verified facts about the codebase at commit `26ac806` on 2026-11-20. It proposes no architecture, no module design and no plan. Stage 1 of the rewrite planning asked for evidence; that is all this file holds.

Nothing here treats a document, a log or a previous assistant proposal as accepted architecture. Where the code and an instruction file disagree, the code wins and the mismatch is reported (AGENTS.md). Where a doc carries an owner's acceptance line, that acceptance is recorded as a fact about the current system, not as a decision for the rewrite.

## 0. How to read this file

Every claim carries a file path and a line number. Two counting methods were used for file sizes (shell `Measure-Object` and direct reads); they differ by a few lines, so sizes are approximate. The four content categories required by the assignment are kept apart:

| Category | Where |
|---|---|
| **Verified current behaviour** | Sections 2 to 6, 8. Evidence: code at `26ac806`. |
| **Stated requirements for the rewrite** | Section 7.2. Source: the owner's assignment of 2026-11-20. These are requirements, not facts about the code. |
| **Decisions and proposals** | Section 7.3. Separates owner-signed frozen decisions from agent-authored proposals that were never accepted or never built. This audit proposes nothing. |
| **Unresolved questions** | Section 7.4. Questions born from the evidence, for later stages. |

## 1. Method and limits

**Inspected.** All of `src/main`, `src/lib`, `src/preload`, `src/shared`, `src/renderer` (largest files in full), `docs/` including `docs/specs/`, `adapters/`, `packs/`, `tests/`, build configuration, `.oxlintrc.json`, CI, and the git history. The import graph was computed from the actual import statements of all 216 TypeScript files (not from file names).

**Commands run on 2026-11-20.**

| Command | Result |
|---|---|
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | 422 tests, 419 pass, 0 fail, 3 skipped, ~61 s. Exit 0. |
| Import-graph script over `src/**` (216 files) | Runtime and type-only imports separated; cycles and fan-in below. |

**Limits of this audit.**

1. Static reading. No application was launched; runtime races were not executed.
2. The Pi SDK (`@earendil-works/pi-coding-agent` 1.5.2) was treated as a black box. Its session-resume semantics are quoted from call sites, not from its source.
3. The e2e suite was not run in this session. The docs record it at about 5 minutes (`playwright.config.ts:4`).
4. No coverage tool exists in the repository (`package.json:29-68`), so coverage statements are import-mapping, not measured lines.
5. Vendored folders (`resources/`) and reference repositories were not audited.
6. The four evidence passes below were run by parallel explorer agents and cross-checked: every load-bearing claim cited in sections 3 to 5 was re-read first-hand before it entered this file.

## 2. Repository shape

- 216 TypeScript/TSX source files: `src/lib` 108, `src/main` 48, `src/renderer` 40, `src/shared` 22, `src/preload` 1. The largest files: `src/main/agent.ts` ~3.1k lines, `src/lib/matter-store/index.ts` ~1.8k, `src/main/bridge.ts` ~1.3k, `src/main/index.ts` ~1.1k, `src/main/drafts.ts` ~1.0k, `src/shared/api.ts` ~0.9k.
- Base: Electron 45, React 19, Pi SDK 1.5.2 pinned, `node:sqlite` (no external SQLite), Tesseract.js + ONNX Runtime (PP-OCR), `@huggingface/transformers`, docx/pdf-lib/pdfjs, Playwright 1.65 (`package.json:29-68`). Node >= 22.19 (`package.json:9`).
- Four SQLite stores: `matter.db` (one per matter folder), `advocate.db`, `intel.db`, `corpus.db`; blobs by SHA-256 per matter; Pi session files per matter under `chat/` (`docs/repo-map.md:66-73`, store code `src/lib/matter-store/index.ts:4,55`, `src/lib/advocate-store/index.ts:24`, `src/lib/intel-store/index.ts:19`, `src/lib/law-store/index.ts:17-77`).
- Build: `asar: false` because vendored executables sit beside the code (`electron-builder.yml:2-8`). CI exists: Windows + Ubuntu matrix, typecheck, lint, unit, build, e2e (`.github/workflows/ci.yml`).
- Churn over the last ~500 commits: `src/main/index.ts` is the most-modified file in the repository (56 modifications), then `src/shared/api.ts` (51), `src/main/agent.ts` (50), `src/preload/index.ts` (41), `src/lib/matter-store/index.ts` (33), `src/renderer/src/App.tsx` (27). The wiring files absorb every feature change.
- All recent commits are by one author. The newest commit (2026-11-20) says "Move the IPC bridge out of index" — the extraction happened, but the boundary did not (section 3.2).

## 3. The concern table, verified

The assignment listed fourteen concerns. Verdicts, with the evidence.

| # | Concern (as stated) | Verdict | Evidence and corrections |
|---|---|---|---|
| 1 | `agent.ts` ~3,271 lines; unrelated responsibilities | **Verified** (~3.1k) | Section 3.3. Fifteen-plus responsibilities enumerated; every agent tool defined inline in one method. |
| 2 | `index.ts` ~1,103 lines; entry point also builds services and holds business logic | **Verified** (~1.1k) | Section 3.1. 23 mutable singletons; matter creation, evidence dispatch and filing-pack selection live in the entry point. |
| 3 | `bridge.ts` ~1,315 lines; large IPC; dependency back into `index.ts` | **Verified, with precision** (~1.3k) | The dependency is **type-only**: `import type { ModelRole } from "./index.ts"` (`bridge.ts:42`) and `typeof import("./index.ts")` (`bridge.ts:101-116`). Runtime direction is one-way (`index.ts:10`). It is a type-level cycle, not a runtime one. |
| 4 | `App.tsx` ~799 lines; application-wide state and orchestration | **Verified** (~0.8k) | Section 3.7. 30 `useState` in the App component; 13 top-level view branches; no router, no React context, no store. |
| 5 | Preload API surface large | **Verified** | 357 named functions (348 invokes, 8 push-event subscribers, 1 `webUtils` wrapper) (`src/preload/index.ts:421`). No raw fs, no raw SQLite, no arbitrary SQL (section 3.6). |
| 6 | Agent tools: registration, implementations, permissions, business operations not separated | **Verified** | Tools are defined inline in `Agent.start()` (`agent.ts:1099-2015`); at least ten separate allowlists (section 3.4); tool handlers perform business work directly (section 3.3). |
| 7 | Matter model: matter, proceeding, SLP confused | **Verified, in a specific way** | There is no proceeding table at all: a matter holds one proceeding, as one TEXT field on a one-row profile (`src/lib/matter-store/practice.ts:35-47`). SLP is privileged by code paths and data defaults, not by schema (section 3.5). Diary numbers are not modelled as a column anywhere. |
| 8 | Matter UI overloaded | **Verified** | 15 matter tabs; the overview tab alone stacks 15 components; the tab vocabulary disagrees across three files (15 / 10 / 9) (section 3.7). |
| 9 | Classification: incomplete proposal schema, precedence issues, SLP defaults, filename/title bias | **Verified** | Signals are title + file *names* + profile fields only; document content is never read (`src/lib/classification/index.ts:27`). The proposal is never validated; `parties` and `basis` are produced and never consumed; the classifier emits display-name courts the filing layer rejects (section 3.5). |
| 10 | Court access: cross-matter access through shared portal state | **Verified** | One portal window, one mutable `matterId` field, one shared `persist:oa-portal` partition for all matters (`src/main/portal.ts:46-47,63-72,79`). Downloads bind to whichever matter is current at download start (`portal.ts:100`). Browser tabs are app-global; agent tabs get per-tab, not per-matter, partitions (`src/main/browser.ts:64,141`). |
| 11 | Policy: corrupted policy must not fail open | **Current code fails OPEN at the file layer** | `read()` swallows any read/parse error and returns `{ default: "allow", tools: {} }` (`tool-policy.ts:130-136`); `cleanPolicy` never throws (`tool-policy.ts:39-44`). The hook layer fails closed only on an unexpected throw (`tool-policy.ts:270-276`). A corrupted `tool-policy.json` therefore yields allow-by-default for every tool without a fixed denial. |
| 12 | Evidence anchors: arbitrary text accepted as source anchor | **Verified** | The `anchor` table exists and anchors are created only by ingest with geometry and text (`matter-store/index.ts:1132-1133`). But the anchor id is a foreign key in exactly one table (`notebook_event`, `index.ts:169`). `fact.anchor_id`, `document_part.anchor_id`, `record_cell.anchor_id`, `forum_clause.anchor_id`, `foreign_element.anchor_id` and `memory` anchors are free TEXT, inserted verbatim (`evidence.ts:40,78`, `work.ts:204`, `evidence.ts:347-348`). The agent's `propose_fact` silently degrades a missing anchor to null (`src/main/index.ts:950`). |
| 13 | Filing: event limits and unsafe submit-control selection | **Verified, both** | Post-submit state is rebuilt by scanning the last **5,000** events (`portal.ts:223`), while the AI-use disclosure reads events with no limit (`filing.ts:426-433`). The submit selector is an agent-supplied free string; any matched element that belongs to a form fires `requestSubmit` (`portal.ts:253-259`); `portal_click` refuses only classic submit controls (`portal.ts:187-188`), so a link or div whose handler submits is not refused. The two-confirmation gate itself is solid (section 3.4.3). |
| 14 | Agent execution: lifecycle, checkpointing, resume, recovery, filesystem middleware | **Partially verified; gaps real** | No checkpoint code exists anywhere (grep over `src/main`: zero matches for "checkpoint"). Resume exists only for conversations (Pi session files) and skill runs (`agent.ts:2895-2907`, `skill-runner.ts:30-35`); helpers are marked `interrupted` after a crash (`helpers.ts:179-219`). Workflow runs have no resume (`workflow-runs.ts` — a failed or stopped run ends; nothing re-enters it). A crash mid-run leaves `run_start` with no `run_end`; the jobs view renders it "running" forever (`jobs.ts:17-18`). Trace and usage writes are best-effort `.catch(() => undefined)` (`agent.ts:2396,2622,2994`). Pi's built-in file and shell tools are excluded at session creation in all four session factories (`agent.ts:2678-2679,2060-2061,2088-2089,2117-2118`) — that is the whole "filesystem middleware". |

Two concerns in the assignment were stated with slightly wrong sizes; one (bridge → index) needed precision. None was found false.

## 4. Findings by area

### 4.1 Entry point (`src/main/index.ts`)

- Constructs and wires ~30 services inside `app.whenReady()` (`index.ts:583-1091`) and holds 23 module-level mutable singletons (`index.ts:91-123`).
- Business logic lives in the entry point: `createMatterFromFields` creates a matter, writes filing details, profile, contacts, parties and infers a hearing row (`index.ts:160-183`); the `evidence` host dispatcher reads and writes `store.evidence` and builds timelines and contradictions inline (`index.ts:936-1006`); `onCorrectionRepeated`/`onCitationInserted` iterate every matter's store and propose advocate-memory records (`index.ts:620-653`); `practiceChoice`/`targetPack` implement filing-pack selection (`index.ts:731-778`); the Firm Agent's usage is appended directly to `usage.jsonl`, bypassing every store (`index.ts:862-869`).
- The entire `AgentHost` implementation — the callback surface the agent writes through — is inline here (~220 lines, `index.ts:794-1016`), not in a module.

### 4.2 IPC surface (`bridge.ts`, `preload/index.ts`, `shared/api.ts`)

- 357 preload functions (concern 5). Grouped: ~7 matters, ~20 sources/documents, ~10 chat, ~20 drafts, ~25 research/studio, ~25 skills/packs/builders, ~19 filing, ~25 evidence/jurisdiction, 22 browser, ~18 mail/contacts/hearings, ~25 intel/library/integrations, ~15 models/policy, 6 intake.
- The channel contract exists in **three copies**: the `OpenAdvoApi` interface (`shared/api.ts`, ~0.9k lines), the invoke strings in `preload/index.ts`, and the `handle(...)` strings in `bridge.ts`. Nothing checks that the three copies agree except an e2e inventory test (`tests/e2e/app.spec.ts:193-257`), which is itself an allowlist snapshot.
- The bridge does more than route: argument validation on nearly every handler, direct store-method calls (`bridge.ts:212,227-239,410,429`), business decisions (`studio:toGrounds` converts an accepted argument into a Grounds paragraph, `bridge.ts:217-223`; `sources:setType` fires triggers, `bridge.ts:164-165`), trigger decisions that inject chat messages telling the agent to run skills (`bridge.ts:1263-1278`), native dialogs in 12 places, and direct `writeFileSync` for diagnostics and exports (`bridge.ts:392,409`).
- Preload exposes two deliberately broad surfaces: `addExtension` installs arbitrary code ("An extension runs code on this computer", `WorkspaceViews.tsx:294`), and `addAdapter` passes a renderer-supplied path that main reads directly after only a path-suffix check (`src/main/court-intel.ts:319-321`). Matter files opened from the renderer are guarded against traversal (`bridge.ts:273-280`).

### 4.3 Agent runtime (`agent.ts`)

One file holds: the tool allowlist (75 tools, `agent.ts:89-192`), port definitions for the whole main process (`AgentHost`, `BrowserAgentHost`, `HarnessHost`, `AgentWorkHost`, `agent.ts:206-339`), model runtime and credential watching (`agent.ts:352-365,793-970`), session lifecycle (`agent.ts:2311-2788`), conversation management with its own JSON persistence (`agent.ts:437-519,2826-2853`), every tool definition inline in `start()` (`agent.ts:1099-2015`), policy wiring (`agent.ts:2614-2632,2691-2700`), plan state and plan-file writes (`agent.ts:2133-2173,2864-2877`), turn orchestration and AG-UI translation (`agent.ts:2855-3212`), trace persistence and cost accounting (`agent.ts:598-614,2990-3013,3200-3209`), the Firm Agent handoffs (`agent.ts:2296-2308`), workflow execution (`agent.ts:2530-2612`), context reporting (`agent.ts:2227-2293`), and a system prompt with embedded legal-domain rules and the line "You are the Open Advocate agent. You work for an Advocate-on-Record of the Supreme Court of India." (`agent.ts:388-427`, line 390).

`agent.ts` itself imports no SQLite and holds the matter store type-only (`agent.ts:51`). All store writes go through callbacks implemented in `index.ts`. So the write path is mediated — but the mediation is an inline host in the entry point, and the business operations sit in tool handlers: `import_case_documents` downloads judgment PDFs into the matter and rebuilds the Notebook (`agent.ts:1269-1285`); `browser_read` opens injection review items directly (`agent.ts:1792-1813`); `run_agent` synthesizes a `WorkflowDefinition` from a profile inside the handler (`agent.ts:2530-2546`); `submit_filing` is on the agent tool list (`agent.ts:116`) and is gated only by the two-confirmation check inside `Portal.submitFiling` (section 4.5).

### 4.4 Permissions and policy

- At least **ten separate allowlists**: `AGENT_TOOLS` (`agent.ts:89-192`), `FIRM_TOOLS`/`FIRM_READ_ONLY` (`firm-agent.ts:40-42`), `PLAN_TOOLS` (`plan.ts:15`), `SIDE_TOOLS` (`side-questions.ts:15-33`), Pi's built-in tool names duplicated in two files that must stay in sync (`pi-extensions.ts:29` and `tool-policy.ts:26`), `READ_ONLY_TOOLS`/`SEQUENTIAL_TOOLS` execution hints (`agent.ts:710-720`), per-skill `permittedTools` intersected at run time (`skill-runner.ts:207-211`), `NEVER_IN_A_SKILL`/`HUMAN_ONLY_PATTERN` (`lib/skills/roles.ts`), the policy file rules and MCP patterns (`tool-policy.ts:55-64`), and the hard start check plus pre-run hiding (`agent.ts:2691-2700`).
- Fail-open at the file layer (concern 11, quoted in section 3). Fixed denials survive corruption: Pi's built-in tools and credential-path patterns are denied in code, and the policy file cannot loosen them (`tool-policy.ts:82-85`).
- Approvals fail closed in behaviour: ask queue one at a time, Stop refuses, an unanswered background-helper approval refuses after ten minutes (`tool-policy.ts:173-180,238-260`), tested in `tests/e2e/native-policy.spec.ts:119-134`.
- Human-only store operations are enforced by the stores, via the caller-supplied `WriteContext` actor string (`shared/records.ts:58-61`): `decideFact` and `supersedeFact` throw `HUMAN_ONLY` for non-advocate actors (`evidence.ts:353-361,363-390`). The actor is decided by main-process code — the bridge hard-codes `{ actor: "advocate" }` for renderer IPC (`bridge.ts:720-737`); the agent passes `{ actor: "agent", sessionId }` (`index.ts:950-951`). **Nothing authenticates the actor**: any in-process caller could pass `advocate`. This is the trust model of a single-user desktop app, and it is nowhere stated as a decision.

### 4.5 Domain model: matter, proceeding, SLP

- `matter.db` holds more than 60 tables across 13 schema files (inventory in the evidence pass; base schema `matter-store/index.ts:58-264`, then `work.ts`, `studio.ts`, `practice.ts`, `evidence.ts`, and nine more).
- **There is no proceeding record.** A matter is the only container. The "proceeding" is one TEXT field on a one-row `matter_profile` (`practice.ts:35-47`) and one row in `filing_target` (`filing-checks.ts:11-18`). One matter = one proceeding = one court = one case number. A matter with two proceedings cannot be represented.
- Case numbers and CNR numbers are plain TEXT with length caps only (`work.ts:39-40`, cleaned `work.ts:500`). Case type is free text validated only as non-empty (`index.ts:934-935`). **No diary-number column exists anywhere**; the diary number appears only as JSON inside the `filing.reconciled` event (`portal.ts:238`).
- SLP has no tables, but is privileged in ten verified places: the SLP pack is the data-level default (`packs/slp.json:7 "default": true`, fallback `lib/packs/index.ts:221-222`); the generic `petition` DraftKind is hard-wired to SLP text — `kind === "petition"` renders `IN THE SUPREME COURT OF INDIA` and the Article 136 heading via `lib/packs/slp.ts:43,51` (`drafts.ts:436-455`), and `condonation` renders the SLP condonation application (`drafts.ts:456-469`); every `petition` draft gets the SLP prayer check (`drafts.ts:894-897`, `slp.ts:16`); the drafting catalogue maps "special leave petition" onto that kind (`drafting/documents.ts:544`); `matter_details` fields serve the SLP workflow (impugned event, certified-copy dates, interim relief, `work.ts:35-49`, `shared/work.ts:9-10`); filing compliance P-2 demands the impugned judgment for every proceeding (`lib/filing/index.ts:87-88`); the in-sc adapter is SLP-first (`adapters/in-sc/adapter.json:29-89`); the classifier has an SLP branch (`classification/index.ts:48`); stage and template routing treat SLP as appeal (`stages/index.ts:95`, `evidence/templates.ts:66`); the agent prompt names "the SLP pack" and the AOR role (`agent.ts:390,394,1274`).
- Comments claim the opposite: "This module holds no SLP (or other pack's) constant" (`filing.ts:33`) and "the core holds no SLP constant" (`index.ts:729`), while `drafts.ts:29` imports `SLP_TITLES, petitionBlocks, condonationBlocks, prayerDefect` from `lib/packs/slp.ts`.
- Hard-coded courts beyond SLP: the generic filing compliance always names the Supreme Court registry, whatever the target court (`lib/filing/index.ts:112-118`, R-0); `COURT_FORMATS` contains exactly one court, `in.hc.delhi` (`drafting/documents.ts:522-524`); binding logic regex-matches "supreme" (`lib/authority/binding.ts:35-36`); the advocate graph sniffs court names to ids (`advocate-store/graph.ts:34-38`); the judgment corpus is an SC-only S3 bucket (`research-sources/aws.ts:12`); the quick citation check is INSC-only (`matter-store/authority2.ts:192-194`); the Studio persona and rehearsal are Supreme-Court-specific (`lib/studio/index.ts:97`, `rehearsal.ts:61`); the workflow prompt says "Supreme Court authorities" (`workflows/index.ts:32`); `package.json:5` describes the product as "for Supreme Court Advocates-on-Record". The court directory itself is an in-code list (`court-directory/index.ts:83-102`) — its stated design, but code, not data.

### 4.6 Classification

- Signals: title, source file names, profile.proceeding, profile.court — all lowercased and joined (`classification/index.ts:27`). Parties are copied through unanalysed; **content is never read** (`bridge.ts:1011` passes names only).
- Precedence: practice area chain then case-type chain, first regex match wins (`classification/index.ts:32-55`); the SLP branch sits between writ and revision (`classification/index.ts:48`).
- The proposal is never validated: the apply handler String()-coerces five fields into `setProfile` (`bridge.ts:1013-1027`); `parties` and `basis` are produced by the classifier and consumed by nothing; the classifier's `court` is a display name (`classification/index.ts:62`) while the filing target requires a directory id against `^[a-z0-9.-]{2,80}$` (`index.ts:933-934`) — so the proposal can carry a court value the next layer rejects.

### 4.7 Stores, the one-writer rule, and chains

- `docs/repo-map.md:10` claims `src/main/matters.ts` is "The only caller of the matter store library". **The claim is false at the level of callers**: store construction is indeed single-site (`MatterStore.open|create` appears only at `matters.ts:54,70`), but store *methods* are invoked from 11 `src/main` modules on instances handed out by `matters.store(matterId)` — `browser`, `drafts`, `evidence`, `filing`, `index`, `mail`, `portal`, `record-table`, `research`, `studio`, `court-intel` (grep and import graph) — and from `bridge.ts` directly (`bridge.ts:721,741,744,1015,1032,1036`). All writes still pass through the `MatterStore` class, so "one writer module" holds for the database file; "one caller" does not.
- The matter store has an internal runtime import cycle of five files: `index.ts ⇄ work.ts ⇄ evidence.ts ⇄ studio.ts ⇄ research-plan.ts`.
- The hash-chained event log is real and shared by all four stores: `eventHash`/`verifyChain` (`matter-store/audit.ts:26-73`), chained appends (`index.ts:737-744`; `store-chain/index.ts:38-52`), append-only triggers (`index.ts:93-96`), refused writes in a separate append-only table (`index.ts:1045-1048`). The chaining algorithm lives in the matter store and is imported by the other three (`store-chain/index.ts:7`) — shared code owned by one domain.
- `LawStore` writes chained events but exposes no verification path (no `verifyChain` anywhere for corpus.db).
- Cross-store flows exist and are mediated: matter outcomes are read from every matter.db and written into advocate.db's graph (`bridge.ts:1123`); `court-intel.ts` drives three stores in one module (`court-intel.ts:223,274-300,341,381`). Scope separation is enforced both ways by CHECK constraints and error types (`evidence.ts:563` refuses advocate-scope types; `advocate-store/index.ts:300` refuses matter types).

### 4.8 Evidence, anchors, facts

- A file on disk (`source` + blob) is properly distinguished from an evidence record: `addEvidence` requires the source and copies its hash into the record (`evidence.ts:436-443`); blobs are re-hashed on every read (`index.ts:608-613`) and `checkIntegrity` marks missing/changed without deleting (`index.ts:718-735`).
- Anchors: enforced for Notebook events only (concern 12, section 3). The inspector recognises anchor *shape* by regex (`audit.ts:128`) — shape, not existence.
- Facts: status enum `candidate/confirmed/disputed/rejected/superseded` and author enum `advocate/agent/system` (`evidence.ts:34-54`). The advocate's typed fact is `confirmed` at insert (`evidence.ts:344-348`); agent and system facts are candidates. Confirmation, dispute, rejection and supersession are human-only store methods that append chained events (`evidence.ts:353-390`). This is an explicit decision, not a boolean — but it lives in the fact row and the event log, not in a dedicated decision record, and the fact table has no append-only trigger (the only trigger in the evidence schema protects `memory`).
- Duplicate suppression for agent facts is exact-match on (source, anchor, text) (`evidence.ts:340-342`).

### 4.9 Filing and the court portal

- The two-confirmation gate is genuine: `submitFiling` refuses while the last result is unknown (`portal.ts:245-247`), requires both confirmations bound to the current payload hash (`portal.ts:248,265-275`), requires confirmations newer than a reconciled "not submitted" (`portal.ts:250-251`), and confirmations are written only by the bridge with `actor: "advocate"` (`bridge.ts:642-645` → `filing.ts:519-521`). Filing-set creation is bridge-only (`bridge.ts:640`).
- The residual paths are real: `submit_filing` runs once both confirmations exist, approved against the payload hash, not against the page action; and `portal_click` will click a non-submit element whose JavaScript submits (concern 13, section 3).
- Cross-matter sharing is verified in both surfaces: the portal (one window, one partition, one mutable `matterId`) and the built-in browser (global tab map, one mutable `matterId`, per-tab partitions, agent tools resolve any tab id) (`browser.ts:64,70,141,230-232,484-489`).

### 4.10 Workflows and recovery

- `executeWorkflow` (~87 lines) owns validation, run start, conditions, gates, step execution and completion, writing all state through the matter store (`workflow-runs.ts:29-87`).
- No resume: a failed step with `onFailure: "stop"` ends the run "failed"; a refused gate ends it "stopped"; nothing re-enters either (`workflow-runs.ts:54,65,79-82`).
- Agent-run recovery is partial: conversations resume from Pi session files (`agent.ts:2671-2736`); helpers are marked `interrupted` with partial output (`helpers.ts:179-219`); skill runs can resume by session file and recorded context package (`agent.ts:2895-2907`, `skill-runner.ts:192-195`); a crashed main run renders "running" forever (`jobs.ts:17-18`) and its usage is lost (`agent.ts:3031`).

### 4.11 Renderer and UI

- `App.tsx` (~0.8k lines) owns everything: 27 `useState` in the App component plus 3 in its dialog helper, a hand-rolled staleness counter (`version`, `App.tsx:163,207-215`), matter open sequencing over 8 calls (`App.tsx:230-251`), new-matter creation rules (`App.tsx:285-296`), the command bar, two global shortcuts, and a 13-branch view switch (`App.tsx:529-784`). No router, no context, no store (grep: 0 matches for `createContext`, router, `pushState`; no such packages in `package.json`). Everything reaches leaf components by prop drilling; `NotebookView` takes 19 props, 12 of them ReactNodes built inline (`App.tsx:650-752`).
- The matter workspace spans 15 tabs (`Notebook.tsx:258-274`); the overview tab stacks 15 components (`App.tsx:710-750`); `Studio.tsx` (~0.95k) has 7 more tabs; the tab vocabulary disagrees across three files: 15 in `Notebook.tsx`, 10 in `WorkspaceViews.tsx:67-78`, 9 in the command bar (`App.tsx:313`).
- Renderer business rules (violations of "no business logic in the renderer", decision 3): per-kind legal guidance text for review items (`WorkspaceViews.tsx:86-111`); the filing confirmation display gate computed by hash comparison (`Work.tsx:373`); the impugned-judgment eligibility rule — only confirmed procedural events qualify — enforced only in the renderer (`Work.tsx:117`); the related-matter relation mapping (`MatterProfile.tsx:196`); chronology and procedural filtering (`Notebook.tsx:201,285`); `/btw` intercepted by the renderer, never reaching the agent (`ChatDock.tsx:424-429`); prompt composition with tool names (`MatterAdminViews.tsx:162`). Every *write* does go through the bridge; what stays in the renderer is gating, ordering, filtering and legal-adjacent text.
- Chat state is dual-held: main owns and persists it; ChatDock keeps a live copy with ~19 local states and its own event reducer (`ChatDock.tsx:269-398`), and FirmChat duplicates the same machinery (`FirmChat.tsx:40-72`). AG-UI events are cast to `{ type: string } & Record<string, unknown>` (`ChatDock.tsx:365`), so event-shape correctness rests on convention.
- The renderer imports six `src/lib` modules for values (stage lists, court portals, record templates — `MatterProfile.tsx:14`, `RightPane.tsx:22`, `Studio.tsx:15,16`, `Phase4.tsx:19`, `MatterAdminViews.tsx:11`). The modules are pure, but two carry legal content (proceeding stage lists, record-table templates), which the renderer now depends on.
- An error-scrubbing regex is repeated identically in 9 renderer files (`.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")`).

### 4.12 Tests and CI

- 422 unit tests in 87 files (run: 419 pass, 3 skip, 0 fail); ~50 e2e cases in 28 spec files; ~473 cases total. No coverage tooling.
- The unit tests are behaviour tests, not smoke checks: retrieval contracts, tamper detection on the Akoma Ntoso round-trip, in-force computation, DOCX round-trips, policy refusal behaviour (evidence in the tests pass).
- The agent is tested with the real `Agent` class over a scripted model (`tests/unit/agent-fixture.ts:10-63`, `createFauxCore` from pi-ai); e2e drives the real built app with a scripted provider and temp homes (`app.spec.ts:34-42`, `test-model.ts:1-12`). Real-model tests exist but are skip-gated (`app.spec.ts:387-421`).
- Security behaviour is genuinely tested: fixed denials the file cannot loosen (`tool-policy.test.ts:13-30`), approval cards and queueing (`tool-policy.test.ts:64-134`), helper policy inheritance (`helpers.test.ts:65-85`), fail-closed approval timeout (`native-policy.spec.ts:119-134`), cross-matter RAG refusals before the port is called (`rag-skeleton.test.ts:149-170`), human-only write refusals asserted in at least 15 unit files.
- **Architecture boundaries have no enforcement at all**: no dependency-cruiser, no ESLint import rules, no boundary test that scans source imports; `.oxlintrc.json` configures generic lint only and turns several checks off (`.oxlintrc.json:17-35`). The tsconfig node/web split stops the renderer importing `src/main` by accident of missing types, and nothing else. The one-writer rule and fail-open policy (concerns 11, and repo-map's claim) have no test that would catch their drift. There is also **no test that a corrupted policy file fails closed** — the tests cover corrupt *rules*, not a corrupt *file*.

### 4.13 Docs versus code, and what is actually accepted

- **No phase is done in the owner-exit sense** (lesson L3): the phase 3 and 4 specs say "The owner's exit (lesson L3) is still owed" (`docs/specs/advocate-matters-browser.md:3`, `docs/specs/documents-evidence-facts.md:3`); harness hardening says live model runs are "Still needed" (`docs/harness-hardening.md:74`).
- Instruction-file mismatches (reported per AGENTS.md): the single-caller claim (`repo-map.md:10`, section 4.7); the "no SLP constant in the core" comments vs `drafts.ts:29` (section 4.5); `resources/pi-extensions/` is described as deletable and still present (`repo-map.md:58`, folder exists); spike result files claimed for phases 3 and 5 are absent from `spikes/` (`build-plan.md:137`, folder holds only `d2-smoke/`).
- Doc-internal contradictions found: onboarding is four steps in three docs and five steps in two (product.md:13, decisions.md:30, features.md:25 vs advocate-workflow.md:7, specs/advocate-matters-browser.md:9); the phase feature counts sum to 164 against the claimed 165 (build-plan.md:16-28 vs README.md:14); the phase-5 spec says "proposed" while the specs index says RAG-0..3 built (specs/law-research-authority.md:3 vs specs/README.md:12); a spec cites a "decision 20 window rule" that does not exist (specs/new-matter-flow.md:858 vs decisions.md:39); Q-5 carries two different rule references in one row (questions.md:11).
- **`docs/specs/new-matter-flow.md` (2026-11-20) is an unregistered proposal, not built** — its libraries do not exist in the tree; it is not in the specs index; it mis-cites a frozen decision. The `scratchpad/` holds working debris, not proposals. The `.agents/logs/` (54 files) and `.agents/prompts/` govern nothing, and nothing in this audit treats them as architecture.
- Owner-signed frozen decisions exist and are facts about the current system: 26 decisions, including Pi embedded in main (2), renderer without business logic (3), per-store single writer (4), human-only bridge functions (5), plain domain libs (6), filing-ready not filed (25) — with its own caveat that the existing portal filing flow stays until the last phase. Where the code diverges from a decision's documentation, the mismatch is listed above, not the decision reopened.

## 5. Why the problems were not caught

The suite is green (419 passing, 0 failing) and the boundaries still eroded. Per major problem: the actual cause, the boundary that failed, why tests and review missed it, the category, and the rule whose absence allowed it. The rule is stated as a missing rule, not as a proposed design.

| Problem | Actual cause | Boundary that failed | Why tests/review missed it | Category | Missing rule |
|---|---|---|---|---|---|
| Entry point became the wiring hub (index.ts, 56 modifications) | Every new service is constructed and referenced where the process starts; singletons make every module reach back | No composition root separate from the entry point; no ownership of wiring | Unit tests bypass index.ts entirely (28 of 48 main files have no direct test import); e2e only proves the app boots | Architecture | A rule that the entry point wires and owns nothing, and that new features do not add code to it |
| IPC contract in three copies, bridge as a business layer | One bridge function per renderer action with no service layer between the renderer and the stores | The bridge was split out of index.ts (newest commit) but kept store calls, trigger decisions and prompt injection | The e2e key inventory checks presence, not responsibility; no test looks at what bridge handlers do besides routing | Architecture | A rule that an interface handler routes to a named operation and holds no decision |
| agent.ts accumulated 15+ responsibilities | Each phase added tools, persistence and events to the one file that owns sessions | No separation between the runtime, the tool registry and the operations tools call | Agent tests use the real class over a scripted model, so behaviour passes while the file grows; file size is not a test | Architecture | A rule that a tool definition declares and delegates, and that business operations live behind named operations |
| Ten allowlists | Each session kind (matter, firm, helper, plan, side, skill) got its own list, plus the policy file and the hard check | No single capability registry | The start check verifies each session's own list against itself (`agent.ts:2691-2696`); drift between lists is not tested | Architecture + policy | A rule that capability and permission are declared once |
| Policy file fails open when corrupted | `read()` returns allow-by-default on any parse failure | The policy's fail-closed rule was implemented in the hook, not in the policy source | Tests cover corrupt rules (`cleanPolicy`) and hook errors — no test corrupts the file itself | Implementation | A rule that unreadable policy is treated as deny, and a test that proves it |
| Matter–proceeding conflation; SLP privilege | The first product surface was one SLP workflow; the proceeding never got a record; SLP defaults seeped into packs, drafting and checks | No domain model separating matter, proceeding, court and case type | E2e drives an SLP happy path; no test asks for a matter with two proceedings or a non-SLP petition | Data model | A rule that a requirement ("one matter, several proceedings") has a representation before features build on it |
| Anchor free-text everywhere except Notebook events | Only the newest table got the FK; older anchor columns were never retrofitted | Validation was added per-table, not at the anchor concept | The inspector checks anchor *shape* (`audit.ts:128`); no test inserts a fact with a fabricated anchor | Data model | A rule that a provenance reference is verified against the record it names |
| Cross-matter portal/browser sharing | One window, one partition and one mutable `matterId` were the simplest first implementation | Session state has no matter scope | No test opens the portal for two matters in one run; RAG isolation is tested, browser isolation is not | Architecture | A rule that external-session state is scoped to the matter that opened it |
| Renderer business rules | Rules accreted where the data was displayed (filtering, gating, legal guidance text) | "No business logic" (decision 3) was enforced only for writes; reads, filters and copy were undefined | No test or lint distinguishes display logic from decisions; e2e asserts outcomes, not ownership | Architecture | A rule that a decision (what qualifies, what is confirmed) is named and owned outside the view |
| No resume/checkpoint for runs and workflows | Long work was recorded (events, run rows) but never designed for re-entry | Recovery was treated as session-file continuation for chat only | Nothing fails: a crashed run simply shows "running" forever | Architecture | A rule that recorded long-running work has a defined recovery state |

**Why code review did not catch it:** the repository's enforcement mechanism is documentation plus convention — repo-map rows, spec rules, header comments. Every verified failure above is a case where the doc said one thing and the code did another, with no tool watching. The single most load-bearing number: `src/main/index.ts` was modified 56 times, and no check ever asked why.

## 6. Verified strengths (not to be casually discarded)

1. **The renderer sandbox discipline holds**: zero `node:`/`electron` imports in `src/renderer` (import graph), one deliberate Blob-based file save (`ChatDock.tsx:36-43`), traversal guard on matter files (`bridge.ts:273-280`).
2. **Domain library purity holds**: no `src/lib` file imports Electron or the Pi SDK (import graph; the documented decision 6 is real in code). The ten `node:fs` uses are plain library code.
3. **The evidence base is sound**: source-vs-evidence separation with hash copying (`evidence.ts:436-443`), blob re-hash on read (`index.ts:608-613`), `checkIntegrity` without deletion (`index.ts:718-735`), append-only origins.
4. **The audit chain is real and shared**: hash-chained events in all four stores, append-only triggers, refused writes recorded separately (`audit.ts:26-73`, `index.ts:93-104,737-744`).
5. **Human authority is enforced in the stores and tested**: human-only store methods with `HUMAN_ONLY` errors, asserted in 15+ unit files; the filing two-confirmation gate is hash-bound and bridge-only.
6. **The permission behaviour is tested at depth**: fixed denials, approval queueing, timeout fail-closed, helper inheritance, party rule, cross-matter RAG refusals.
7. **Court adapters are data, not code**: `adapter.json` with hosts whitelist, https-only fetch, quote/section/format checks (`adapters/in-sc/adapter.json:1-91`, `lib/court-adapters/index.ts:6,94-101,160-335`, `shared/intel.ts:3,6,84-98`). The model is right; the coverage (three courts) and the SC-first defaults are the problem.
8. **The test culture is behaviour-first**: 419 passing behaviour tests, scripted-model agent tests, whole-app e2e with temp homes, a CI matrix, and honest skip-gating of live-model tests.
9. **No CAPTCHA solving, no stored court passwords, no bulk scraping** — verified in code: origin guards on the portal (`portal.ts:54-67`), credential denials in policy (`tool-policy.ts:29,85`).
10. **Fact acceptance is already a decision, not a boolean** (`evidence.ts:34-54,344-390`) — incomplete (no dedicated decision record, in-process actor trust), but the core distinction the rewrite requires exists and works.

## 7. The four-way ledger

### 7.1 Verified current behaviour

Sections 2 to 6. Headline: a green, behaviour-tested desktop app whose wiring layer (index, bridge, api, agent, preload, App) absorbs every change; a matter model that cannot hold two proceedings; SLP privilege in ten code paths despite disclaimers; ten permission allowlists; a policy that fails open on file corruption; free-text provenance anchors outside Notebook events; shared court-portal state across matters; no run recovery beyond session files; zero architecture-boundary enforcement; and a solid, tested core underneath it (stores, chains, evidence, gates, policy behaviour, adapter model).

### 7.2 Stated requirements for the rewrite (owner's assignment, 2026-11-20)

These are requirements. Several contradict current behaviour; that is the point of the rewrite, and each contradiction is a verified fact above, not an error in this audit.

1. General litigation workbench across SC, High Courts, district courts, tribunals, all practice areas. Court support through generalised adapters and capability declarations; no hard-coded individual courts in the core.
2. SLP is a proceeding type/case type/workflow configuration, never the centre. (Today: ten verified SLP-privileged code paths, section 4.5.)
3. One matter may contain multiple proceedings, in different courts at different stages. (Today: one matter = one proceeding, section 4.5.)
4. Local-first, no cloud servers, no Docker/WSL, no unnecessary databases.
5. The agent framework is replaceable and never owns legal records; chat is not the record; every agent capability invokes an approved application operation; the agent never writes canonical stores directly.
6. Permissions declared once; read/propose/execute/human-only; fail closed on policy errors; matter isolation enforced by the application, not prompts.
7. Filing preparation and submission are separate; human approval for reserved actions; adapters declare capabilities and limitations.
8. Evidence, documents, facts, research, drafting, workflows, and the factual record are distinct owners; acceptance of a fact is explicit, authorised and auditable; a model extraction, a person's proposal, an advocate's acceptance, an admission and a judicial finding are distinct states.
9. CLI first, then agent, then desktop UI, all on the same application services; no business logic in any delivery interface.
10. Modular monolith; one canonical owner per truth; dependencies point toward domain rules; audit everything important; fail closed.

### 7.3 Decisions and proposals — what is actually accepted

- **Accepted in the current system (owner-signed, frozen):** the 26 decisions in `docs/decisions.md` (Electron+TS base, Pi embedded, sandboxed renderer, per-store single writer, human-only bridge functions, plain domain libs, filing-ready-not-filed, English only, no analytics). These are facts about the current system. This audit does not reopen them; the rewrite planning may propose changes, which is the owner's call in later stages.
- **Agent-authored, owner-accepted as documents but not owner-exited as done:** the phase specs and feature catalogue. No phase's exit was completed by the owner (section 4.13).
- **Proposals never accepted or never built (treated as claims only):** `docs/specs/new-matter-flow.md` (unregistered, mis-cites a decision, libraries absent); RAG-4/RAG-5 (deferred); HB-2 B/C agent-browser via MCP and Playwright scripts (planned, phase 13); docTR as second OCR engine (decision 26 accepted, but the code still uses PP-OCR, `features.md:127`); every "Planned" row in repo-map; the `scratchpad/` and `.agents/` contents.
- **This audit proposes nothing.** Stage 1 is evidence. Architecture proposals belong to later stages and will be marked as proposals when they come.

### 7.4 Unresolved questions born from this audit

Questions that materially change any later architecture. Numbered for reference; no options are advocated here.

- **AQ-1.** Is the trust model "any in-process caller may claim to be the advocate" (section 4.4) an accepted decision for a single-user desktop app, or a defect? Everything downstream (who may confirm a fact, approve a filing) depends on this.
- **AQ-2.** Must a matter hold several proceedings in the rewrite (the requirement), or is the one-matter-one-proceeding model a product decision to revisit? The data model, the UI and the filing flow all change shape on this answer.
- **AQ-3.** Is the Pi session file the accepted record of agent execution (with its gaps: no checkpoint, crashed runs rendered "running" forever, best-effort trace writes), or must run state be owned and recovered by the application itself?
- **AQ-4.** Should portal/browser sessions be isolated per matter (separate partitions per matter, agent tabs owned by the matter that opened them), or is shared-with-explicit-switching acceptable with different safeguards?
- **AQ-5.** Is content-based classification required (reading document text to classify a new matter), or are name/title/profile signals the accepted ceiling? The current classifier never reads content.
- **AQ-6.** Must every provenance anchor be verified against the anchor table (FK or check), including for legacy rows? Cost: migration of existing free-text anchors.
- **AQ-7.** Should fact acceptance get a dedicated decision record (as Notebook events have `event_decision`), with the fact row holding only state? Affects auditability requirements.
- **AQ-8.** The workflow runner has no resume. Is resumability a requirement for the rewrite's workflows, or is "interrupted, restart the step" acceptable?
- **AQ-9.** The three-copy IPC contract (api.ts, preload strings, bridge strings) — is a single generated contract a requirement, or are three copies with an inventory test acceptable?
- **AQ-10.** The renderer imports legal content from `src/lib` (stage lists, record templates). Where must legal content live for a UI that "owns no business rules" — with the domain, or duplicated per interface?
- **AQ-11.** Keep the current four-store split (matter/advocate/intel/corpus), or does the proceeding model change it? (Audit records the split as-is; the requirement for multi-proceeding matters may force a different matter.db shape.)
- **AQ-12.** `submit_filing` exists as an agent tool today, gated by the two-confirmation flow. Is agent-initiated submission with human confirmation a capability to keep, or must submission be human-only by definition?

## 8. What remains unverified

1. Runtime behaviour: races between the portal's single `matterId` and downloads; the ChatDock reducer under real event order; effect storms from the `version` counter. Static reading cannot settle these.
2. Pi SDK internals: `SessionManager.open/continueRecent/create` resume semantics and hook ordering, read from call sites only.
3. The e2e suite's current pass state (not run in this session; unit suite run: green; CI last recorded state unknown).
4. Coverage of the 28 un-imported `src/main` files through e2e paths — exercised, but how deeply is unmeasured.
5. Vendored `resources/` contents (Euro-Office, ULOS, models) and the reference repositories: presence confirmed, contents unaudited.
6. Whether any path writes `anchor` rows outside ingest — none found; the write-once triggers make it unlikely, not impossible.
7. Whether `portal.evaluateForTest` is reachable outside `OPENADVO_TEST=1`: it is gated by `exposeTestHooks` (`index.ts:383-495`), but the preload surface was not traced end-to-end for it.

---

*Evidence passes: five parallel audits (main process; stores and domain libraries; renderer/preload/shared; tests and build; docs and specs), each citing file:line. Load-bearing claims re-read first-hand before inclusion. Commands and results are recorded in `.agents/logs/2026-11-20-stage1-audit.md`.*

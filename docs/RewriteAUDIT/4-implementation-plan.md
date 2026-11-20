# Stage 4 — Implementation Plan and Final Engineering Assessment

| | |
|---|---|
| Status | Stage 4 of 4. **Proposed implementation plan and final assessment. Not accepted.** |
| Date | 20 November 2026 |
| Inputs | Stages 1 to 3, and the owner's acceptance of D1 to D4. |
| Not used as authority | `docs/rewrite/`, the untracked planning documents, and the repository documents that assert earlier decisions. |
| Deliverables | This file completes Deliverables G (repository), H (phased plan) and J (open decisions and risks), and closes with the final engineering assessment. Deliverables A to F and I are in Stages 1 to 3. |

## Where each deliverable lives

| Deliverable | File | Section |
|---|---|---|
| A. Architecture assessment | `1-audit.md` | Sections 4 to 9 |
| B. Domain ownership map | `2-domain-design.md` | Section 3 |
| C. System architecture | `3-runtime-and-interfaces.md` | Sections 1 to 4 |
| D. Core contracts | `2-domain-design.md`, `3-runtime-and-interfaces.md` | Sections 11 and 3.3, 7.4, 11 |
| E. Agent architecture decision | `3-runtime-and-interfaces.md` | Section 7 |
| F. CLI-first plan | `3-runtime-and-interfaces.md`, this file | Sections 5 and 9 |
| G. Repository structure | This file | Section 6 |
| H. Phased implementation plan | This file | Sections 3 to 5 |
| I. Architecture rules | `3-runtime-and-interfaces.md` | Section 16 |
| J. Open decisions and risks | `3-runtime-and-interfaces.md`, this file | Sections 17 and 14 |

This file does not repeat the architecture. It turns it into a build sequence and tests it against litigation scenarios.

---

## 1. What this plan assumes

1. The owner accepted D1 to D4:
   - D1: an interlocutory application is a child proceeding that shares its lead proceeding's court file.
   - D2: multi-advocate is modelled through identity, organisation, roles and assignment; one advocate is active per installation.
   - D3: the agent prepares filings; it does not submit them in v1.
   - D4: a certified copy is a new document version, not a new document.
2. The application-service boundary is the only path from an interface to a domain.
3. The capability registry is the only source of tools and permissions.
4. The execution port is the only agent API; Pi is the first adapter.
5. The first slice is narrow: Matter → Proceeding → Court File → Document → Evidence → Fact → Review.
6. The plan is a sequence, not a calendar. A phase ends when its acceptance is true, not when a date arrives.

**No code is written in this stage.** This is a plan.

---

## 2. Scenario validation

The architecture must explain these scenarios before implementation. Each row states the runtime path and the result. A failure would send the design back to Stage 2 or 3.

### 2.1 The twelve required scenarios

| # | Scenario | Runtime path | Result |
|---|---|---|---|
| 1 | One matter with several proceedings | `matter.open` creates M1. `proceeding.create` creates P1 (suit, District Court), P2 (appeal, High Court, `appeal_from` P1), P3 (SLP, Supreme Court, `appeal_from` P2). Each has a court file and a stage record. The matter header lists all three. | **Pass.** Matter and court case are separate. |
| 2 | One proceeding with several documents | `document.import` creates a version for each file. `courtfile.add_document` records the role (plaint, written statement, affidavit, annexure, order). The document list shows versions and roles. | **Pass.** Document identity and court-file role are separate. |
| 3 | A shared document used in several proceedings | The trial judgment is one document. `courtfile.add_document` records `order` in CF1 and `impugned_order` in CF2. The document detail shows both roles. | **Pass.** No copy; two roles; one version. |
| 4 | Conflicting facts from different sources | The receipt gives F1 (payment on 1 March). The written statement gives F2 (no payment). `fact.propose` records both; `fact.relate` records `contradicts`. Both stay visible. | **Pass.** The contradiction is a first-class relation, not a silent merge. |
| 5 | A lawyer accepts or rejects a proposed fact | The agent calls `fact.propose`; the fact is `extracted`. The advocate calls `fact.review` with `accept_working` or `reject` and a reason. `AcceptFact` checks policy, version, domain rule, saves and audits. | **Pass.** Acceptance is a `FactDecision`, not a boolean. |
| 6 | Several advocates on one matter | A1 lead, A2 junior, A3 AoR. `matter.assign_advocate` records each. Policy allows A2 to draft, A3 to approve filing, A1 to do both. Every decision records the actor id. | **Pass.** Model supports it; v1 has one active profile. |
| 7 | An advocate across practice areas | A1 has civil, criminal and constitutional practice areas. M1, M2 and M3 share the same domains; case types and stage lists differ. | **Pass.** Practice areas are classifications, not kernels. |
| 8 | Different court adapters with different capabilities | Adapter A has status and orders. Adapter B adds filing preparation. Adapter C adds filing submission with DSC. The proceeding asks for capabilities, not court names. | **Pass.** Missing capability is a visible limitation. |
| 9 | An agent works on one matter while another is open | The execution request carries M1. The capability set is scoped to M1. The browser tab and portal session are bound to M1. A tab from M2 is not listed. A download goes to M1. | **Pass.** The application service checks scope; the prompt is not a control. |
| 10 | A failed workflow must resume | Run W1 at step 3. The process stops. On restart it is `interrupted`. Resume reads the step journal, skips recorded side effects, and continues. A tool with an unknown outcome is reported, not re-run. | **Pass.** Durable state and a resume or fail path. |
| 11 | A court document retrieved and later found incorrect | Order D1 v1 is imported and cited. The court corrects it; D1 v2 is imported with `supersedes`. Evidence still cites v1. The court file shows the cited version was superseded and opens a review item. | **Pass.** Versions are immutable; no silent replacement. |
| 12 | A filing is prepared but not approved or submitted | `filing.prepare` creates the set and manifest. No approval. No submission. The court file has no diary number. The UI says "prepared, not approved". The agent cannot submit. | **Pass.** Preparation and submission are separate; D3. |

### 2.2 Additional scenarios

These are the cases that usually break a legal data model. They are part of the acceptance set.

| # | Scenario | Runtime path | Result |
|---|---|---|---|
| 13 | A court file is renumbered or transferred | `courtfile.renumber` creates a new current file with the new number and marks the old `superseded`. The proceeding points to the new file. Old documents and orders stay with the old file. | **Pass.** Registry identity has history. |
| 14 | An interlocutory application is filed in a pending suit | `proceeding.create` with `parent.relation = interlocutory_in` and the lead's `courtFileId`. The IA has its own relief, hearings and order, and shares the court file. | **Pass.** D1. |
| 15 | A client has two matters against the same opposite party | Client C1 has M1 and M2. The party identity is shared, but the matters are separate. No document, fact or evidence crosses. The conflict check reads both matters. | **Pass.** Client identity is stable; matter isolation holds. |
| 16 | A document is re-imported with a correction | The same bytes return the existing version and add an origin. Changed bytes create a new version with `supersedes`. Evidence points to the version it used. | **Pass.** Duplicate import and correction are different. |
| 17 | A workflow is cancelled mid-step | `workflow.cancel` sets the run to `cancelling`; the current step gets a cancellation token; the run becomes `cancelled`. Completed steps stay. A step with an external side effect records its outcome. | **Pass.** Cancellation is a state, not a silent stop. |
| 18 | The model provider is offline | The execution fails with `MODEL_UNAVAILABLE`. The chat shows the error. No legal record changes. The advocate can retry or switch model. | **Pass.** No partial legal write. |
| 19 | The policy file is corrupt | `PolicyEngine` refuses every capability above read with `POLICY_INVALID`. The UI shows a diagnostic. Read-only views still work. | **Pass.** Fail closed. |
| 20 | The application crashes during OCR | The document version and original bytes are already committed. The processing job is `running`; on restart it becomes `interrupted` or `failed`. The original is untouched. Retry is explicit. | **Pass.** Import and processing are separate. |
| 21 | A filing is rejected by the court with defects | The court file records the rejection and the defects. The filing set becomes `rejected`. A new attempt needs a new approval. The defects become review items. | **Pass.** Court record and preparation are separate. |
| 22 | Two advocates disagree on a fact | A1 accepts F1 as working; A2 disputes it. Each `FactDecision` records the actor and reason. The projection shows the latest decision and the full history. Policy decides who may override whom. | **Pass with an owner rule.** The model records both; the policy must say whether a junior may override a lead. |

### 2.3 What the scenarios changed

The validation changed four things in the design:

1. **Court File cardinality.** The first draft said a court file belongs to one proceeding. The IA scenario (14) showed that an IA shares the lead's file. The design now has one lead proceeding plus child applications.
2. **Issue ownership.** The first draft put `FactIssueLink` in the Factual Record. That created a dependency cycle with Drafting. Issues now belong to Drafting; the Factual Record does not depend on it.
3. **Evidence dependency.** The first draft let an evidence item reference an admission fact. That created a cycle with the Factual Record. An admission is now a document or witness source; the party position lives in the Factual Record.
4. **Filing result lookup.** The audit found a capped event scan. The plan now requires a result lookup by filing-set id, not by recent events.

**Conclusion.** The architecture explains all 22 scenarios. Two need an owner rule, not a model change: who may override a fact decision, and which role may approve a filing in a multi-advocate matter. Both are policy questions.

---

## 3. Build sequence

### 3.1 The phases

| Phase | Objective | Exit | Depends on |
|---|---|---|---|
| **0. Audit and decisions** | Verify the current system and settle the domain | Stages 1 to 4 accepted | — |
| **1. Contracts and capability skeleton** | Define the kernel, the six domain contracts, the first slice's capabilities (about 18) and the error model | Contracts compile; a capability list prints; no database | 0 |
| **2. Persistence and shared foundation** | Build the walking skeleton: firm DB, matter DB, blobs, audit, unit of work, locks, migrations | A script creates and reads a matter with two proceedings, a court file, a document, evidence and a fact | 1 |
| **3. First application services and CLI** | Implement the slice services and a CLI host over the same core | The CLI runs the slice scenario; JSON and exit codes are stable | 2 |
| **4. Document, OCR, evidence and fact slice** | Import real documents, extract text/OCR, register evidence, propose and review facts | The owner reviews a real brief and accepts/rejects facts with anchors | 3 |
| **5. Agent execution and capability tools** | Build the execution port, Pi adapter, policy, approvals, context resolver and chat view | The agent proposes a fact; the advocate accepts; the agent cannot accept or submit | 4 |
| **6. Desktop shell and review UI** | Build the gateway, shell, slice screens, review inbox, approval queue and chat dock | The owner completes the slice in the desktop app | 5 |
| **7. Court and research adapters** | Add court status/orders and research search/save with provenance | An order is retrieved, attached and verified; an authority is saved as a candidate | 6 |
| **8. Drafting, hearings and filing preparation** | Add drafts, revisions, issues, hearings, checklist and manifest | A filing set is prepared and approved; nothing is submitted | 7 |
| **9. Workflows, migration and broader litigation** | Add the workflow runner, tasks, importer and a second case type/court | One real old matter is migrated; a workflow resumes; a second case type works | 8 |
| **10. Hardening and cutover** | Performance, security, backup, diagnostics, training and final proof | The owner completes real tasks; the old app is read-only; rollback is tested | 9 |

### 3.2 Dependency graph

```
0 ─► 1 ─► 2 ─► 3 ─► 4 ─► 5 ─► 6 ─► 7 ─► 8 ─► 9 ─► 10
                │         │
                └──► 4a   └──► 6a
```

- `4a` is the thin review screen. It can start after Phase 3 and run beside Phase 4. It is optional, but it is the best way to get owner proof early.
- `6a` is the full workspace shell. It depends on the agent only because the chat dock is part of the shell; the review screens can be built before the chat.

### 3.3 Evaluation of the suggested order

The assignment's suggested order is: domain contracts, shared foundation, first services, CLI, evidence/factual slice, agent, UI, adapters, workflows. The order is correct, with three adjustments.

**Adjustment 1 — Combine services and CLI in Phase 3.** A CLI built before any service has nothing to call. A service built without a CLI has no independent proof. Do both in one phase, with the CLI as a thin adapter.

**Adjustment 2 — Put a thin review UI in Phase 4, not Phase 6.** The first slice ends with "advocate review". A lawyer will not review facts in a terminal. A thin review screen over the same gateway gives real owner proof before the full shell. The full shell still comes in Phase 6.

**Adjustment 3 — Keep the agent after the slice.** The agent must call application services. Building it earlier would recreate `agent.ts` with hand-written tools and no services. The agent is Phase 5, after the slice works.

**What not to change.** Do not build court adapters, filing, research or drafting before the slice. Do not build the full UI before the services. Do not build the workflow engine before there is a workflow worth running.

---

## 4. Phase details

Each phase has the same shape: objective, scope, not in scope, dependencies, modules, tests, acceptance, risks and decisions.

### Phase 0 — Audit and decisions

**Objective.** Verify the current system and settle the domain and runtime.

**Scope.**
- Stages 1 to 4.
- The owner's acceptance of D1 to D4.
- A decision log with what is accepted, proposed and open.

**Not in scope.** Code, scaffolding, migrations.

**Tests.** None. The evidence is in `1-audit.md`.

**Acceptance.** The owner accepts the domain design and the runtime decision, or records the changes.

**Risks.** Treating a proposal as accepted. The labels in the reports prevent this.

---

### Phase 1 — Contracts and capability skeleton

**Objective.** Define the smallest contracts that let the slice be built without guessing.

**Scope.**
- Kernel: branded IDs, `ActorRef`, `Scope`, `ProvenanceRef`, `Decision`, `AppResult`, `AppError`, `Clock`, `Version`.
- Domain contracts for Matter, Proceeding, Court File, Document, Evidence, Factual Record.
- The slice's capability descriptors (about 18) with input/output schemas.
- The `AgentExecutionPort` and `WorkflowRun` contracts (types only).
- A fake `CoreHost` that lists capabilities and returns a fake result.
- The table ownership manifest (names only).

**Not in scope.**
- Persistence.
- SQLite.
- CLI.
- UI.
- Agent adapter.
- Court adapters.

**Depends on.** Phase 0.

**Modules/files.**
```
src/kernel/
src/domains/matter/domain/
src/domains/proceeding/domain/
src/domains/document/domain/
src/domains/evidence/domain/
src/domains/factual-record/domain/
src/platform/capability/
src/platform/execution/port.ts
tests/unit/kernel/
tests/unit/capability/
tests/architecture/imports.test.ts
```

**Tests.**
- Typecheck.
- Schema validation: every capability input/output parses.
- Registry parity: descriptor has a handler id; handler id has a descriptor.
- Import test: domain imports only the kernel.
- Contract tests: a fake host can list capabilities and invoke a fake command.

**Acceptance.**
- `openadvo capability list --json` prints the slice's descriptors (about 18) from a fake host.
- No database file is created.
- No Electron, React or Pi import exists in the domain.
- The owner can read the capability list and understand what the agent will be allowed to do.

**Risks.** Over-specifying. Limit to the slice; add a capability only when its service exists.

**Decisions before start.**
- TypeBox for runtime schemas (already a dependency) or a small hand-written validator. Recommendation: TypeBox; do not add Zod.
- Capability ID format. Recommendation: `domain.verb`.

---

### Phase 2 — Persistence and shared foundation

**Objective.** Build a walking skeleton that stores and reads the slice's records.

**Scope.**
- Firm DB and per-matter DB migrations.
- Repositories for the slice: matter, client, assignment, proceeding, proceeding party, court file, court file document, document, document version, representation, evidence, evidence source, evidence decision, fact, fact source, fact decision, fact relation, party position, judicial finding, audit, command log, outbox.
- Blob store at `blobs/<sha256>`.
- Unit of work and transaction handling.
- Hash-chained audit.
- Matter and firm locks.
- Config, paths, clock, IDs, logger.
- Migration runner.

**Not in scope.**
- All domains and all tables.
- Search, OCR, PDF conversion.
- Agent, UI, court adapters.
- Migration from the old data.

**Depends on.** Phase 1.

**Modules/files.**
```
src/platform/persistence/
src/platform/persistence/migrations/firm/
src/platform/persistence/migrations/matter/
src/platform/persistence/table-ownership.ts
src/domains/*/persistence/
src/platform/audit/
src/platform/documents/blob-store.ts
tests/integration/persistence/
```

**Tests.**
- Migration up on an empty database.
- Migration down in development.
- Repository round-trip for each aggregate.
- Transaction rollback leaves no partial row.
- Audit chain verifies; a changed row is detected.
- A matter lock blocks a second writer and releases on exit.
- A blob written twice is stored once.
- A cross-matter read is refused by the repository scope.

**Acceptance.**
- A script creates a matter with a client, two proceedings, a court file, a document version, an evidence item and a fact.
- It reads them back with the same ids and versions.
- The audit chain verifies.
- The matter folder is portable: copy it to another temp folder and open it read-only.

**Risks.**
- Schema churn. Use one migration per change; do not edit a migration after a phase.
- SQLite feature gaps. `node:sqlite` is already used; verify the required features in a spike. Keep the driver behind one module.
- Over-normalising. Add a table only when a use case needs it.

**Decisions before start.**
- `node:sqlite` or `better-sqlite3`. Recommendation: `node:sqlite`, because it is already in use and avoids a native dependency; verify it in Phase 2.
- Lock strategy. Recommendation: per-matter lock file, as in Stage 3 S2.
- Audit hash format. Recommendation: SHA-256 over canonical JSON, as the current stores do.

---

### Phase 3 — First application services and CLI

**Objective.** Prove the application boundary with a CLI that calls real services.

**Scope.**
- Services: `OpenMatter`, `CreateProceeding`, `AttachCourtFile`, `AddCourtFileDocument`, `AddCourtFileExhibit`, `ImportDocument`, `RegisterEvidence`, `ProposeFact`, `ReviewFact`, `ListFacts`, `VerifyAudit`.
- `CoreHost` composition.
- CLI host with `matter`, `proceeding`, `court-file`, `document`, `evidence`, `fact`, `capability`, `audit`, `db`.
- JSON output, human output, exit codes, `--yes`, `--dry-run`, `--read-only`.
- Lock handling.
- The slice scenario script.

**Not in scope.**
- OCR and PDF processing.
- Candidate fact extraction.
- Agent and UI.
- Court adapters.

**Depends on.** Phase 2.

**Modules/files.**
```
src/domains/*/application/
src/domains/*/views/
src/apps/cli/
src/platform/capability/
tests/integration/application/
tests/cli/
tests/scenarios/slice.sh
```

**Tests.**
- Each service: valid input, invalid input, policy denied, version conflict, idempotent retry.
- CLI: every command's JSON shape, exit code, error code.
- Scenario: create a matter, two proceedings, a court file, import the same document twice, register evidence, propose and review a fact, verify the audit.
- CLI does not import Electron, React or Pi.

**Acceptance.**
- The scenario script passes with only the CLI.
- The second import of the same bytes returns the existing version and adds an origin.
- A rejected fact stays in the record and its history shows the decision.
- A cross-matter id is refused with `CROSS_MATTER_REFERENCE`.

**Risks.**
- CLI logic creep. Rule: one CLI command calls one service; presentation only.
- Error drift. One `AppError` envelope; no raw strings.

**Decisions before start.**
- CLI parser. Recommendation: `node:util.parseArgs` for the small tree; add a library only if the tree grows.
- Human output format. Recommendation: a simple table; `--json` is the stable contract.

---

### Phase 4 — Document, OCR, evidence and fact slice

**Objective.** Turn a real document into a reviewed factual record.

**Scope.**
- Import PDF, DOCX and text.
- Text layer extraction; OCR for scanned pages.
- Page, line and anchor records; bounding boxes where available.
- Representations: text, OCR, thumbnail.
- Duplicate import and origin.
- Failed processing and retry.
- Evidence registration from a document version.
- Candidate facts from deterministic rules (dates, amounts, admissions, denials) — no agent required.
- Fact review: accept, dispute, reject, supersede, history.
- Contradiction detection and relation.
- A thin review screen: document viewer, candidate facts, accept/reject, source anchor. This is the owner-proof exception to the CLI-first order.

**Not in scope.**
- Agent extraction.
- Court adapters.
- Drafting.
- Multi-advocate collaboration.
- OCR for Hindi or other languages.

**Depends on.** Phase 3.

**Modules/files.**
```
src/platform/documents/
src/domains/document/application/
src/domains/evidence/application/
src/domains/factual-record/application/
src/apps/desktop/renderer/features/review/
tests/integration/documents/
tests/scenarios/review/
```

**Tests.**
- A born-digital PDF yields page and line anchors.
- A scanned PDF yields OCR text with confidence.
- A failed OCR leaves the version and original intact; retry works.
- A duplicate import adds an origin, not a version.
- A fact proposal without a source is refused unless the advocate gives a reason.
- Accept/reject/supersede keep history.
- A contradiction keeps both facts.
- The thin review screen shows the anchor and the decision.

**Acceptance.**
- The owner imports a real brief, reviews at least 10 candidate facts, accepts some and rejects others.
- The factual record shows the source anchor, the decision, the actor and the time.
- The audit chain verifies.
- The owner says the screen is usable for review, or lists the blockers.

**Risks.**
- OCR quality. Use the text layer first; OCR only when needed; show confidence; allow correction.
- Anchor drift. Anchors are content-addressed and immutable; a corrected page creates a new representation, not a silent edit.
- Scope. Do not add drafting or research to this phase.

**Decisions before start.**
- OCR engine order. Recommendation: Tesseract first; PP-OCR behind the same port later.
- Thin UI scope. Recommendation: document viewer + fact review only; no shell.

---

### Phase 5 — Agent execution and capability tools

**Objective.** Add an agent that can propose, but cannot decide.

**Scope.**
- Execution store: conversations, executions, steps, approvals, traces.
- `AgentExecutionPort` implementation.
- Pi adapter: sessions, streaming, tool calls, cancellation, model selection.
- Capability tool generation from the registry.
- Policy engine and approval service.
- Context resolver and context package.
- Chat view as a projection of execution events.
- Budget and stop.
- Resume after a crash.
- A fake runtime for tests.

**Not in scope.**
- Filing submission.
- Multi-agent graph orchestration.
- A second runtime.
- Court adapters.

**Depends on.** Phase 4.

**Modules/files.**
```
src/platform/execution/
src/platform/execution/pi-adapter/
src/platform/policy/
src/platform/capability/tools.ts
src/domains/work/approvals/
src/apps/desktop/renderer/features/chat/
tests/integration/execution/
tests/security/agent/
```

**Tests.**
- The agent can call `fact.propose` but not `fact.review`.
- The agent can read a fact but not another matter's fact.
- A corrupt policy denies every write.
- An approval is bound to the subject version; a stale approval is refused.
- A crash during a tool call marks the execution `interrupted`; resume does not re-run an unknown tool call.
- A budget stop leaves partial results and a visible reason.
- The tool list equals the registry's agent capabilities.
- The fake runtime and Pi adapter pass the same contract tests.

**Acceptance.**
- The agent reads a document and proposes a fact with an anchor.
- The advocate accepts it through the review screen or CLI.
- The audit shows the proposal and the decision, with different actors.
- The agent cannot accept a fact, submit a filing or read another matter.
- A killed process resumes or fails visibly.

**Risks.**
- Pi coupling. The port and the fake runtime are the guard.
- Pi Durable is experimental. Use it behind the adapter only if it passes the crash tests; otherwise use the journal.
- Approval fatigue. Default to `ask_on_write`; do not ask on every read.

**Decisions before start.**
- Pi Durable or own journal. Recommendation: try Pi Durable in a spike; keep the journal as the fallback.
- Context package budget. Recommendation: a per-capability token budget; record exclusions.

---

### Phase 6 — Desktop shell and review UI

**Objective.** Make the slice usable by the advocate without the CLI.

**Scope.**
- IPC gateway and preload.
- Shell: navigation, title bar, workspace, right panel, operation tray.
- Active matter/proceeding context.
- Screens: matters, proceedings, court files, documents, evidence, facts, review inbox, approvals, chat, settings.
- Query cache and event invalidation.
- Long-running operation UI.
- Error boundaries and empty states.
- Keyboard navigation.

**Not in scope.**
- Research, drafting, filing, calendar.
- The full settings surface.
- A web or mobile client.

**Depends on.** Phase 5.

**Modules/files.**
```
src/apps/desktop/main/
src/apps/desktop/preload/
src/apps/desktop/renderer/app/
src/apps/desktop/renderer/features/
src/apps/desktop/renderer/shell/
tests/e2e/slice.spec.ts
tests/architecture/ui-storage.test.ts
```

**Tests.**
- Gateway: every capability's schema validates; a human-only capability is rejected from the renderer.
- The renderer imports no store, no SQLite, no `node:fs`.
- E2E: open a matter, import a document, review a fact, approve an evidence assessment, open the chat, see the audit.
- Reload restores the active matter and tab.
- A long import shows progress and can be cancelled.
- A version conflict shows a reload action.

**Acceptance.**
- The owner completes the slice in the desktop app with no CLI.
- The review inbox shows the open items across matters.
- The approval queue shows the subject, source and effect.
- The chat dock is collapsible and never the only place a decision appears.

**Risks.**
- UI scope. Build only the slice screens.
- State creep. The shell owns navigation and active context; features own their data.
- Accessibility. Test keyboard paths.

**Decisions before start.**
- Query cache. Recommendation: a small typed cache; TanStack Query is acceptable if it removes code, but it is not an architectural decision.
- Routing. Recommendation: a typed route state, not a full router, unless deep links are needed.

---

### Phase 7 — Court and research adapters

**Objective.** Bring in court observations and legal research without letting adapters own legal records.

**Scope.**
- Adapter manifest validation and registry.
- Capabilities: `case_status`, `orders`, `cause_list`, `filing_prepare`.
- Observation store and apply commands.
- Source freshness.
- Research: search, authority, statute, proposition, citation check.
- One public court adapter and manual upload.
- The built-in browser with matter-scoped tabs.

**Not in scope.**
- `filing_submit`.
- Bulk scraping.
- CAPTCHA solving.
- Stored court passwords.
- A general plugin platform.

**Depends on.** Phase 6.

**Modules/files.**
```
src/platform/court-adapters/
src/domains/court/
src/domains/research/
adapters/
packs/
tests/integration/adapters/
tests/security/adapters/
```

**Tests.**
- A manifest with an unknown host or capability is refused.
- An adapter timeout returns `AppError`, not a crash.
- An observation carries source, time and verification.
- An unverified observation is shown as unverified; it does not become the proceeding's status.
- A downloaded order becomes a document version through the import service.
- No adapter has a database handle.
- Research returns a candidate; accepting a proposition is a human decision.

**Acceptance.**
- The advocate retrieves an order from one court adapter, attaches it to a proceeding, and sees the source and time.
- The advocate searches an authority and saves it as a candidate.
- A manual upload works when the adapter fails.

**Risks.**
- Court access. Start with one adapter and manual upload.
- Adapter drift. Version the manifest; show the adapter version and review date.
- Legal accuracy. A research result is not a proposition until accepted.

**Decisions before start.**
- Which court adapter first. Recommendation: the court of the owner's most common brief; do not hard-code it in the core.
- Code modules in v1. Recommendation: manifests plus the built-in browser first; code modules later in a worker.

---

### Phase 8 — Drafting, hearings and filing preparation

**Objective.** Produce a filing-ready set without submitting it.

**Scope.**
- Drafts, sections, revisions, approvals.
- Issues and element charts.
- Citation insertion and checks.
- Hearing briefs and oral outlines.
- Filing checklist, required parts, annexure map, format checks, manifest.
- Filing approval and the "prepared, not submitted" state.
- One case type and one court adapter.

**Not in scope.**
- Filing submission.
- Every case type.
- Every court format.
- Bulk precedent import.

**Depends on.** Phase 7.

**Modules/files.**
```
src/domains/drafting/
src/domains/work/filing/
src/platform/documents/pdf/
tests/integration/drafting/
tests/scenarios/filing/
```

**Tests.**
- A draft cannot state an unaccepted fact as established.
- A citation must resolve to a saved authority and a pinpoint.
- A revision is immutable; approval is human-only.
- A filing set records the payload hash and the approvals.
- The submission capability is absent or human-only.
- A court rejection creates defects and a new approval requirement.

**Acceptance.**
- The owner prepares a filing set for one case type.
- The set is `prepared` or `approved`, never `submitted`.
- The manifest verifies.
- The owner can export the set and file it outside the app.

**Risks.**
- Scope. One case type, one court.
- Legal accuracy. The advocate approves every revision.
- Format drift. Use the adapter's checklist and show its source and date.

**Decisions before start.**
- First case type. Recommendation: the owner's most frequent filing, not SLP by default.
- First court format. Recommendation: the court of that case type.

---

### Phase 9 — Workflows, migration and broader litigation

**Objective.** Make the workbench usable across matters and across the owner's real data.

**Scope.**
- Workflow definitions and runs with resume.
- Tasks, deadlines and review queues.
- Importer from the old matter databases.
- Export and retention.
- A second case type and a second court.
- Multi-advocate assignment UI (one active profile).

**Not in scope.**
- Real-time collaboration.
- Sync.
- Every practice area.
- Every court.

**Depends on.** Phase 8.

**Modules/files.**
```
src/domains/work/workflows/
src/apps/cli/migrate/
src/platform/migration/
tests/integration/migration/
tests/scenarios/workflow/
```

**Tests.**
- A workflow resumes after a kill.
- A step with a recorded side effect is not repeated.
- A step with an unknown side effect is reported.
- The importer reports every unmapped row.
- A migrated matter opens read-only until the owner confirms.
- The audit chain is continuous after migration.

**Acceptance.**
- One real old matter is imported.
- The owner verifies at least 20 records: parties, documents, evidence, facts, drafts.
- A workflow runs and resumes.
- A second case type works end to end.

**Risks.**
- Migration fidelity. Report, do not hide.
- Old `confirmed` facts may not have an advocate decision. Recommendation: map to `under_review` with a migration note unless the old event log shows an advocate decision.
- Workflow scope. Only workflows with a real use case.

**Decisions before start.**
- Migration mapping for `notebook_event`. Recommendation: keep the old chronology as a read-only migration artifact; do not invent facts.
- Retention. Recommendation: closed matters are kept; no hard delete; export is the archive.

---

### Phase 10 — Hardening and cutover

**Objective.** Prove the system on real work and retire the old app safely.

**Scope.**
- Performance on a large matter.
- Security review: IPC, browser, portal, policy, secrets.
- Backup and restore drill.
- Diagnostics and support bundle.
- Documentation and training.
- Final owner proof.
- Old app read-only; new app is the working copy.

**Not in scope.**
- New features.
- A redesign.
- A framework migration.

**Depends on.** Phase 9.

**Tests.**
- Open a 5,000-page matter within the target agreed in Phase 2.
- Search within the target.
- Import 100 pages within the target.
- Kill during OCR and restore.
- Corrupt the policy and verify deny.
- Restore a backup and verify the audit chain.
- Full e2e on the owner's machine.

**Acceptance.**
- The owner completes at least three real tasks end to end.
- No P1 defect.
- The old app is read-only and the new app is the working copy.
- A rollback to the old app is tested.
- The final assessment is updated with what was proved.

**Risks.**
- Cutover panic. Keep the old app and data; the new app writes a new folder.
- Performance. Measure before cutover; do not guess.
- Support. A diagnostics bundle and a known-issues list.

**Decisions before start.**
- Cutover date. Recommendation: after three real tasks, not after a demo.
- Rollback owner. Recommendation: the owner names one person.

---

## 5. The first vertical slice

### 5.1 The sequence

The assignment suggests: Matter → Proceeding → Document import → Evidence registration → OCR → Candidate facts → Advocate review → Accepted factual record.

This is the right slice. One refinement: the order of OCR and evidence registration is not a domain dependency. The evidence item points to a document version; OCR produces a representation. The recommended sequence processes the document before registering evidence for a simpler demo, but either order is valid. OCR never creates evidence.

Recommended sequence:

1. **Open a matter.** Client, title, practice area, lead advocate.
2. **Create a proceeding.** Court, case type, side, title.
3. **Attach a court file.** Case number or diary number, filing date.
4. **Import a document.** Bytes, hash, version, origin.
5. **Process the document.** Text layer or OCR, pages, lines, anchors, representations.
6. **Register evidence.** The document version, kind, source, candidate status.
7. **Propose candidate facts.** Deterministic rules first; the agent later. Each fact has a source anchor.
8. **Review the facts.** Accept as working, dispute, reject, supersede. Each decision records actor, time, reason.
9. **Show the factual record.** The assertion, its sources, its review state, its history.
10. **Prove the model.** Add a second proceeding and use the same judgment as the impugned order. Add a contradictory fact from the written statement. The record keeps both.

### 5.2 What the slice proves

- A matter can hold two proceedings.
- A document has identity and versions.
- The same document can have two court-file roles.
- Evidence is separate from the document.
- A fact has a source, a review state and a decision.
- A contradiction is visible and unresolved.
- The audit records every decision.
- The same services work through the CLI and the thin review screen.

### 5.3 What the slice does not prove

- Court adapters.
- Research.
- Drafting.
- Filing preparation.
- Workflows.
- Multi-advocate collaboration.
- Every practice area.

Those are later phases. The slice is the foundation, not the product.

### 5.4 Acceptance script

A scripted scenario, run through the CLI and then through the UI:

```
1. openadvo matter create --title "Sharma v. Verma" --client "R. Sharma" --practice-area civil
2. openadvo proceeding create --matter M1 --court in.dc.delhi --case-type CS --title "Suit for specific performance" --side plaintiff
3. openadvo proceeding create --matter M1 --court in.hc.delhi --case-type RFA --title "Appeal" --side appellant --parent P1 --relation appeal_from
4. openadvo court-file attach --proceeding P1 --court in.dc.delhi --case-number CS/123/2020
5. openadvo document import --matter M1 --file judgment.pdf
6. openadvo document process <versionId>
7. openadvo evidence register --matter M1 --kind document --version <versionId> --title "Trial court judgment"
8. openadvo fact propose --matter M1 --text "The agreement was signed on 1 March 2019" --version <versionId> --page 4 --line 12
9. openadvo fact propose --matter M1 --text "No agreement was signed" --version <writtenStatementVersion> --page 2 --line 7
10. openadvo fact review <factId> --accept --reason "The recital is admitted"
11. openadvo fact list --matter M1 --state accepted_working --json
12. openadvo audit verify --matter M1
```

The UI script repeats steps 5 to 11 and checks the review screen, the source anchor and the history.

### 5.5 Owner proof

The owner uses a real brief, not a fixture. The acceptance is:

- The owner imports the brief.
- The owner reviews 10 candidate facts.
- The owner accepts at least 3 and rejects at least 1.
- The owner can explain why each accepted fact is accepted.
- The source anchor opens the right page and line.
- The audit chain verifies.
- The owner says the screen is usable, or lists the blockers.

If the owner cannot complete this, the slice is not done.

---

## 6. Repository structure

Create a folder when its first file exists. Do not create empty folders for imagined features.

```
openadvo/
├─ src/
│  ├─ kernel/                       # IDs, actor, scope, provenance, decision, result, clock
│  ├─ domains/
│  │  ├─ advocate-organisation/     # identity, organisation, membership, roles, practice areas
│  │  ├─ matter/                    # engagement, client, assignment, instruction, lifecycle
│  │  ├─ proceeding/                # proceeding, court file, hearing, order, stage
│  │  ├─ document/                  # identity, versions, representations, processing
│  │  ├─ evidence/                  # items, authenticity, admissibility, inclusion, chain
│  │  ├─ factual-record/            # assertions, sources, positions, findings, decisions
│  │  ├─ court/                     # directory, benches, case types, rules, observations
│  │  ├─ research/                  # authorities, statutes, propositions, citation checks
│  │  ├─ drafting/                  # drafts, revisions, issues, citations, checks
│  │  └─ work/                      # tasks, deadlines, approvals, workflows
│  ├─ platform/
│  │  ├─ capability/                # registry, descriptors, parity checks
│  │  ├─ policy/                    # authorisation, fail-closed rules
│  │  ├─ audit/                     # append-only hash-chained audit
│  │  ├─ persistence/               # sqlite, unit of work, migrations, locks
│  │  ├─ execution/                 # execution port, journal, Pi adapter
│  │  ├─ documents/                 # blob, PDF, OCR, conversion ports
│  │  ├─ search/                    # FTS, vectors, index rebuild
│  │  └─ court-adapters/            # manifests, registry, worker
│  ├─ apps/
│  │  ├─ cli/                       # command tree, output, exit codes
│  │  └─ desktop/
│  │     ├─ main/                   # Electron host, CoreHost composition
│  │     ├─ preload/                # gateway and host actions
│  │     └─ renderer/               # shell, features, design system
│  └─ contracts/                    # generated schemas, shared DTOs (if needed)
├─ migrations/
│  ├─ firm/
│  └─ matter/
├─ adapters/                        # court adapter manifests
├─ packs/                           # case-type and court process templates
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ architecture/
│  ├─ security/
│  ├─ e2e/
│  └─ scenarios/
├─ scripts/                         # dev, migration, vendor
├─ resources/                       # vendored OCR, Euro-Office, etc.
└─ docs/                            # one owner per fact
```

### 6.1 Modules as folders, not packages

**Proposed decision.** Keep the domains and platform as folders in one TypeScript package. Do not create npm workspaces or published packages in v1.

Why:

- One build, one lockfile, one version.
- No publishing or semver overhead.
- The import-boundary test provides the same enforcement as a package boundary.
- A court adapter worker can be a separate entry point without being a published package.

When to promote a module to a package:

- It needs a different runtime (worker, CLI-only, browser).
- It is reused by a separate product.
- It has an independent release cadence.

None of these is true for the six core domains in v1.

### 6.2 Import rules

- `kernel` imports nothing from the app.
- A domain imports only `kernel` and its own files. It may use another domain's ID type; it does not import its repository.
- `platform` imports `kernel` and ports. It does not import a domain's rules.
- `apps` imports `platform` and domain application services. It does not import persistence.
- Tests may import anything.
- No circular dependency.

Use path aliases (`@kernel`, `@domains/...`, `@platform/...`, `@apps/...`) so a cross-domain import is visible. Ban `../../` across domains with a lint rule or the import test.

### 6.3 Table ownership

`src/platform/persistence/table-ownership.ts` lists each table and its owning domain. A test:

1. Every table in the migrations appears in the manifest.
2. Every table in the manifest appears in a migration.
3. A repository only writes tables owned by its domain.
4. No SQL string in a domain file.

This is the enforcement that the current 83-table store lacks.

### 6.4 Capability registry

`src/platform/capability/registry.ts` contains descriptors. Domain modules export handlers. The composition root registers them. A test checks parity. The CLI, gateway and agent tools read the same registry.

### 6.5 No empty folders

Do not create `domains/billing/` because the product might add billing. Billing is out of scope. Create a folder when its first use case exists.

---

## 7. Module ownership and import rules

| Module | Owns | May import | Must not import |
|---|---|---|---|
| `kernel` | IDs, actor, scope, provenance, decision, result | Nothing | Any domain, platform, app |
| `advocate-organisation` | Advocate, organisation, membership, roles, practice areas | Kernel | Matter, proceeding, document, evidence, fact |
| `matter` | Matter, client, assignment, instruction, lifecycle | Kernel; advocate IDs | Proceeding tables, document tables |
| `proceeding` | Proceeding, court file, hearing, order, stage | Kernel; matter IDs; court IDs; document/evidence IDs | Matter tables, evidence tables |
| `document` | Document, version, representation, processing | Kernel; matter IDs; document ports | Proceeding, evidence, fact |
| `evidence` | Evidence item, witness, chain, verification, decision | Kernel; matter IDs; document IDs | Factual Record, proceeding |
| `factual-record` | Assertion, source, position, finding, decision, relation | Kernel; matter IDs; document anchors; evidence IDs; proceeding IDs | Drafting, research |
| `court` | Directory, bench, case type, rule, adapter registration, observation | Kernel | Legal records |
| `research` | Authority, statute, provision, proposition, citation check | Kernel; court IDs; document IDs | Facts, evidence, drafts |
| `drafting` | Draft, revision, issue, element, citation, check | Kernel; matter IDs; factual-record/evidence/research IDs | Filing state, court file |
| `work` | Task, deadline, approval, workflow | Kernel; any domain by ID | Domain tables |
| `platform/capability` | Registry, descriptors | Kernel | Domain rules |
| `platform/policy` | Authorisation | Kernel, capability | Domain rules |
| `platform/persistence` | SQLite, migrations, unit of work, locks | Kernel, ports | Domain rules |
| `platform/execution` | Execution port, journal, Pi adapter | Kernel, capability, `CapabilityInvoker` port | Domain tables; application services directly |
| `apps/cli` | Commands, output | Application services, platform | Persistence, domain rules |
| `apps/desktop` | Gateway, shell, features | Application services, platform | Persistence, domain rules |

**The rule that matters most:** a domain may reference another domain's ID, but never its table or repository. A cross-domain view is an application query, not a foreign key join written by a domain.

---

## 8. Core contracts

The domain contracts are in `2-domain-design.md` section 11. The runtime contracts are in `3-runtime-and-interfaces.md` sections 3.3, 7.4 and 11. This plan adds only the contracts the build needs.

### 8.1 Command and query buses

```ts
interface CommandBus {
  execute<I, O>(capabilityId: CapabilityId, input: I, ctx: CommandContext): Promise<AppResult<O>>;
}

interface QueryBus {
  execute<I, O>(capabilityId: CapabilityId, input: I, ctx: QueryContext): Promise<AppResult<O>>;
}
```

### 8.2 Operation handle

```ts
interface OperationHandle {
  operationId: string;
  capabilityId: CapabilityId;
  state: "queued" | "running" | "done" | "failed" | "cancelled";
  startedAt: IsoDateTime;
}
```

### 8.3 Approval

```ts
interface ApprovalDecision {
  decision: "approve" | "refuse";
  reason?: string;
}

interface ApprovalView {
  id: string;
  capabilityId: CapabilityId;
  subject: { kind: string; id: string; version: number };
  effect: string;
  requestedBy: ActorRef;
  requestedAt: IsoDateTime;
  expiresAt: IsoDateTime;
  state: "requested" | "approved" | "refused" | "expired" | "consumed";
}
```

### 8.4 Execution event

```ts
type ExecutionEvent =
  | { type: "execution.started"; executionId: string; at: IsoDateTime }
  | { type: "message.delta"; executionId: string; text: string }
  | { type: "tool.requested"; executionId: string; capabilityId: CapabilityId; inputHash: string }
  | { type: "tool.completed"; executionId: string; capabilityId: CapabilityId; resultRef: string }
  | { type: "tool.refused"; executionId: string; capabilityId: CapabilityId; error: AppError }
  | { type: "approval.requested"; executionId: string; approval: ApprovalView }
  | { type: "execution.interrupted"; executionId: string; at: IsoDateTime }
  | { type: "execution.completed"; executionId: string; at: IsoDateTime }
  | { type: "execution.failed"; executionId: string; error: AppError };
```

The chat view renders these events. The legal record is elsewhere.

---

## 9. CLI-first plan

### 9.1 Command to service map

| Command | Capability | Service |
|---|---|---|
| `matter create` | `matter.open` | `OpenMatter` |
| `matter list` | `matter.list` | `ListMatters` |
| `matter show` | `matter.get` | `GetMatter` |
| `proceeding create` | `proceeding.create` | `CreateProceeding` |
| `proceeding stage set` | `proceeding.record_stage` | `RecordStage` |
| `court-file attach` | `courtfile.attach` | `AttachCourtFile` |
| `court-file document add` | `courtfile.add_document` | `AddCourtFileDocument` |
| `court-file exhibit add` | `courtfile.add_exhibit` | `AddCourtFileExhibit` |
| `document import` | `document.import` | `ImportDocument` |
| `document process` | `document.process` | `ProcessDocument` |
| `evidence register` | `evidence.register` | `RegisterEvidence` |
| `evidence assess` | `evidence.assess` | `AssessEvidence` |
| `fact propose` | `fact.propose` | `ProposeFact` |
| `fact review` | `fact.review` | `ReviewFact` |
| `fact list` | `fact.list` | `ListFacts` |
| `fact history` | `fact.history` | `GetFactHistory` |
| `capability list` | `capability.list` | `ListCapabilities` |
| `audit verify` | `audit.verify` | `VerifyAudit` |
| `db migrate` | `db.migrate` | `Migrate` |

### 9.2 How a command calls a service

1. Parse the arguments and flags.
2. Build the `CommandContext` from the actor, the scope and the idempotency key.
3. Call `commands.execute(capabilityId, input, ctx)`.
4. If `ok`, render the DTO as a table or JSON.
5. If not `ok`, print the error code and message to stderr, and exit with the mapped code.
6. No branching on domain rules. No direct store call.

### 9.3 Output examples

```
$ openadvo matter create --title "Sharma v. Verma" --client "R. Sharma" --json
{"ok":true,"data":{"id":"...","title":"Sharma v. Verma","status":"intake",...},"meta":{"version":1}}
```

```
$ openadvo fact review F-12 --accept --reason "Admitted in the written statement"
Error: POLICY_DENIED: the actor is not assigned to this matter
$ echo $?
3
```

### 9.4 Why the CLI is not a second app

- It has no domain rules.
- It has no SQL.
- It has no policy logic beyond mapping the error code.
- It uses the same `CoreHost` as the desktop.
- It is tested against the same capabilities.

---

## 10. Agent architecture decision

Stage 3 chose an **OpenAdvo-owned execution port with Pi as the first adapter**. This plan keeps that choice.

### 10.1 What to build

- `AgentExecutionPort` and an execution journal.
- A Pi adapter that uses the current SDK (`createAgentSession`, `SessionManager`, `ModelRuntime`) and, if it passes the crash tests, Pi Durable for checkpoints.
- Tool generation from the capability registry.
- Policy and approval services.
- A context resolver.
- A chat projection.
- A fake runtime for tests.

### 10.2 What to remove from the current code

- `AGENT_TOOLS` (102 names) and the ten supporting lists.
- Hand-written tool definitions in `agent.ts`.
- Policy logic in `tool-policy.ts` that is not the policy service.
- Chat JSON stores as a parallel record.
- Browser/portal matter pointers.

### 10.3 Migration path

1. List every capability the current agent tools provide.
2. Map each to a domain capability or mark it obsolete.
3. Generate the tool from the descriptor.
4. Move the execution logic into the application service.
5. Keep the Pi adapter for streaming and model calls.
6. Run the agent contract tests against the fake runtime and Pi.

### 10.4 Why not LangGraph or DeepAgents now

- LangGraph's graph state would become a second legal model. The app already has one.
- DeepAgents' planning/filesystem/subagents are not the legal workbench's shape, and its security model is "trust the LLM".
- A custom runtime would duplicate Pi's streaming and tool calling.
- The execution port keeps the option to add LangGraph for complex workflows or a second adapter later.

### 10.5 Replacement proof

The port is replaceable only if a second adapter exists or a fake adapter passes the same contract. The plan requires a fake runtime in Phase 5. A second real adapter is optional, not v1. The final assessment records this as a limitation.

---

## 11. Testing and independent proof

### 11.1 Test matrix

| Area | Tests | Phase |
|---|---|---|
| Domain | State transitions, fact acceptance, evidence independence, court-file roles, matter/proceeding cardinality | 1, 4 |
| Application | Same operation through CLI and IPC, policy, version conflict, idempotency, audit | 3, 5, 6 |
| Persistence | Migrations, round-trip, rollback, locks, audit chain, cross-matter | 2 |
| CLI | Commands, JSON, exit codes, dry-run, read-only, lock | 3 |
| IPC | Gateway schema, actor/scope, human-only rejection, events | 6 |
| Agent | Tool parity, policy, approval, resume, budget, cross-matter | 5 |
| Court adapter | Manifest, host allowlist, timeout, observation, no DB, no submission | 7 |
| Security | Cross-matter, cross-organisation, corrupt policy, browser scope, portal scope | 2, 5, 6, 7 |
| Integrity | Blob hash, duplicate import, OCR failure, index rebuild, audit chain | 2, 4 |
| Recovery | Crash during import, OCR, agent run, workflow | 4, 5, 9 |
| Architecture | Imports, table ownership, capability parity, no UI storage | 1, 2, 5, 6 |
| Scenario | The 22 scenarios | 4 to 9 |
| Owner proof | Real briefs | 4, 6, 8, 10 |

### 11.2 CI gates

A phase does not merge unless:

1. Typecheck passes.
2. Unit and integration tests pass.
3. Architecture tests pass.
4. The scenario for that phase passes.
5. No P1 defect is open.
6. The owner proof for the phase is recorded, if the phase has one.

End-to-end tests run once at the end of a phase, per the repository's rule. Unit and integration tests run on every change.

### 11.3 Test data

- Synthetic fixtures for the kernel and repositories.
- A fixture matter with three proceedings and a shared judgment.
- A scanned PDF and a born-digital PDF.
- A corrected order (two versions).
- A corrupt policy file.
- A failing court adapter.
- One real brief from the owner, with consent, for the slice proof.

No real client data in the repository.

### 11.4 Independent proof

The owner proof is not a test the agent writes. It is a recorded session where the owner completes a real task and explains the result. The record includes:

- The matter and the task.
- What the system did.
- What the system did not do.
- The source anchors.
- The decisions.
- The audit chain result.
- The owner's blockers.

A phase that cannot produce this is not done.

---

## 12. Migration and cutover

### 12.1 Importer, not in-place rewrite

The old matter databases contain real work. The new app reads them through an importer and writes new matter folders. The old folders stay untouched as the archive.

Why:

- An in-place migration cannot be rolled back safely.
- The old schema is lossy; a report is better than a silent change.
- The owner can compare the old and new records.

### 12.2 Mapping

| Old record | New record | Rule |
|---|---|---|
| `matter` + `matter_profile` + `matter_details` | Matter + one Proceeding + CourtFile | One old matter becomes one proceeding; the court, case type, number and stage map to the proceeding and file. |
| `party` + `contacts.json` | Client / Party identity | Name-only dedupe is not repeated. Same-name contacts are separate unless the old record has a shared id. |
| `source` + `origin` | Document + Version + Origin | Each source becomes a document and version; origins are preserved. |
| `page` + `anchor` + `ocr_reading` | Representation + anchors | Text and OCR are representations; anchors keep page and line. |
| `evidence` | EvidenceItem | `authenticity`, `admissibility` and `status` map to three dimensions; unclear values go to `unknown`/`not_assessed` and open a review item. |
| `fact` | FactAssertion + FactDecision | `confirmed` maps to `accepted_working` only if an advocate event exists; otherwise `under_review` with a migration note. `candidate` maps to `extracted`. `rejected` maps to `rejected`. |
| `notebook_event` | Read-only migration artifact or proceeding event | Do not invent facts. A chronology event can become a hearing or an order only when its source and type support it. |
| `notebook_extract` | Migration metadata | Record that the old Notebook was extracted. |
| `draft` + `revision` | Draft + Revision | Paragraph links and approvals map. |
| `filing_set` | FilingSet | Keep `prepared`; never mark submitted without an old receipt. |
| `advocate.db` | Advocate / Organisation / Preferences | One advocate becomes one organisation and member. |
| `intel.db` | Court / Rules / Adapters | Keep version and freshness. |
| `corpus.db` | Research / Knowledge | Keep source, version and verification. |

### 12.3 What cannot be mapped

- The old singleton profile with a second court case. The importer creates one proceeding; the owner adds the second.
- A `confirmed` fact with no advocate event. It becomes `under_review`, not a new decision.
- A Notebook event with no clear source. It stays in the migration report.
- A filing submission with no receipt. It stays `unknown`.
- A contact with only a name. It becomes a party identity, but the importer warns about possible duplicates.

### 12.4 Migration report

The importer writes a report per matter:

- Rows read.
- Rows mapped.
- Rows skipped, with the reason.
- Rows that need the advocate.
- A hash of the old database.
- A hash of the new matter.

The report is a first-class output. The owner reads it before confirming the migration.

### 12.5 Cutover

1. Run the importer on one matter.
2. The owner verifies 20 records.
3. The old app becomes read-only for that matter.
4. The new app is the working copy.
5. Repeat for the next matter.
6. After all matters, the old app is kept as an archive for one release.

Rollback: the old folder is untouched. The owner can reopen the old app. The new app's changes are in the new folder.

### 12.6 Retention

- A closed matter is kept.
- No hard delete of a matter, source, evidence or fact.
- Export is the archive.
- A retention policy is an owner decision; the code provides the export, not a delete button.

---

## 13. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation | Trigger |
|---|---|---|---|---|
| Scope creep | High | High | Phase gates; one slice; parking lot; no empty folders | A feature outside the phase appears in a PR |
| Migration fidelity | Medium | High | Importer with a report; old app read-only; owner verifies | A mapped record differs from the old |
| Court adapter access | High | Medium | One adapter; manual upload; visible failure; no bulk | An adapter breaks or blocks |
| Pi coupling | Medium | High | Execution port; fake runtime; adapter tests | Domain imports Pi or Pi types leak |
| Pi Durable experimental | Medium | Medium | Spike; journal fallback; adapter contract | API change or failed crash test |
| Policy fail-open | Low | High | Deny by default; schema; tests; diagnostic | A missing/corrupt policy allows a write |
| SQLite concurrency | Medium | Medium | WAL; locks; read-only reads; clear errors | A lock timeout or corrupt write |
| OCR quality | High | Medium | Text layer first; confidence; correction; PP-OCR later | The owner cannot review a scan |
| LLM cost/latency | Medium | Medium | Budgets; local model option; trace; stop | A run exceeds budget |
| UI scope | High | High | Slice screens only; shell after services | A feature page appears before its service |
| Legal semantics | Medium | High | Owner proof; no auto-accept; findings separate | The owner disagrees with a state |
| Performance | Medium | Medium | Measure in Phase 2; targets in Phase 10 | Open/search/import misses the target |
| Security | Low | High | Sandbox; CSP; trusted sender; policy; secret store | An IPC or browser escape |
| Documentation drift | High | Medium | One owner per fact; docs updated in the same PR | A doc and code disagree |
| Dependency churn | Medium | Medium | Pin versions; upgrade in a phase; adapter boundaries | A major upgrade breaks the build |

---

## 14. Open decisions

The Stage 3 decisions S1 to S9 are still open. This plan adds five.

| # | Decision | Recommendation | Consequence |
|---|---|---|---|
| S1 | Hybrid store confirmed? | Yes | Per-matter export and confidentiality; one more file to back up |
| S2 | CLI/desktop lock enough? | Yes; daemon only if measured | No second process; concurrent batch writes wait |
| S3 | Pi Durable or own journal? | Spike Pi Durable; keep the journal fallback | Experimental API risk; the port stays |
| S4 | React + Astryx? | Yes | Reuse; fix state ownership |
| S5 | Thin review UI in the slice? | Yes | Owner proof earlier; a small UI before the full shell |
| S6 | Importer, not in-place? | Yes | Old data stays; report unmapped rows |
| S7 | Execution store scope? | Per organisation, with matter scope | Simpler chat; stricter query checks |
| S8 | Court adapter code in v1? | Manifests + built-in browser first | Less risk; fewer adapters |
| S9 | Performance target? | **Provisional; measure in Phase 2 before fixing.** Initial target: open a 5,000-page matter under 2 s; search under 1 s; import 100 pages under 60 s | A target to test, not a promise |
| P1 | First case type for Phase 8 | The owner's most frequent filing, not SLP by default | The first filing proof is real work |
| P2 | First court adapter | The court of that case type | One adapter, not a catalogue |
| P3 | Migration of `notebook_event` | Read-only artifact; no invented facts | Some old chronology is not editable |
| P4 | Retention | Keep closed matters; export is the archive | No delete button |
| P5 | Cutover | After three real tasks, not a demo | A later but safer switch |

### 14.1 Owner rules still needed

Two scenario results need an owner rule, not a model change:

1. **Who may override a fact decision?** If A1 accepts and A2 disputes, whose decision stands? The model records both. The policy must say whether a junior may override a lead, or whether a lead must confirm.
2. **Who may approve a filing?** The model supports a role and an assignment. The policy must say whether only the AoR, only the lead, or any assigned advocate may approve.

These are policy decisions. They do not change the schema.

---

## 15. Final engineering assessment

### 15.1 The ten questions

| # | Question | Answer |
|---|---|---|
| 1 | Is the problem being solved real? | **Yes.** The audit found a per-matter database with 83 tables, no proceeding entity, a file-as-document model, a fragmented factual record, ten tool lists, a fail-open policy, cross-matter portal leakage and a filing gate bypass. The product cannot support multi-proceeding litigation on that model. |
| 2 | Are the proposed domain boundaries correct? | **Yes, with conditions.** Matter, Proceeding, Court File, Document, Evidence and Factual Record are separate. The Court File is a sub-aggregate of Proceeding, not a separate bounded context. The Factual Record is matter-scoped and does not depend on Drafting. Two owner rules remain (fact override, filing approval). |
| 3 | Is there unnecessary abstraction? | **Controlled.** The kernel is types and value objects, not behaviour. There is one capability registry and one execution port. There is no plugin platform, no microservice, no graph database, no event-sourced every aggregate. The abstractions have concrete use cases: the CLI, the desktop and the agent all need the same operations. |
| 4 | Does each type of truth have one owner? | **Yes.** The ownership map and the table manifest give one owner per record. The Court File owns as-filed roles; the Document and Evidence domains own the items. Facts are separate from evidence and documents. |
| 5 | Are dependencies pointing in the correct direction? | **Yes by design.** Domain → kernel only. Application → domain and ports. Interfaces → application. Infrastructure → ports. The import tests enforce it. The remaining risk is developer discipline before the tests exist. |
| 6 | Can the agent runtime be replaced without rewriting legal records? | **Yes by design, not yet proved.** The execution port isolates Pi. The legal records are outside the runtime. A fake runtime proves the port in tests. A second real adapter is not in v1, so replacement cost is reduced but not zero. |
| 7 | Can CLI and desktop UI use the same application services? | **Yes.** Both embed the same `CoreHost`. The CLI calls the command/query buses. The desktop calls the same buses through a single gateway. A parity test runs the same operation through both. |
| 8 | Can a court adapter be replaced without changing domain rules? | **Yes.** Adapters are manifests and narrow workers. They return observations. The application decides what to record. No adapter has a database handle. |
| 9 | Are permissions and human approvals enforced outside the LLM? | **Yes.** The policy engine and approval service are application/platform services. The agent receives only permitted capabilities. Human-only capabilities are never tools. The agent cannot accept a fact, approve a filing or submit a filing. |
| 10 | What remains unverified? | SQLite concurrency under real desktop/CLI use; Pi Durable compatibility and crash behaviour; court adapter access and stability; migration fidelity on real matters; the owner's acceptance of the legal states on real briefs; performance on a 5,000-page matter; the cost and latency of the chosen models. |

### 15.2 The verdict

## ADOPT WITH LIMITATIONS

**Why ADOPT.** The architecture is coherent, implementable and grounded in the verified failures. It gives each truth one owner, keeps the agent runtime replaceable, puts permissions outside the model, separates preparation from submission, and can be built in small phases. The first slice is narrow enough to finish and broad enough to prove the model.

**Why not a plain ADOPT.** Seven things are not yet proved: SQLite concurrency, Pi Durable, court adapter access, migration fidelity, the owner's legal semantics, performance, and a second runtime adapter. The plan addresses each with a phase or a test, but none is closed today.

**Why not REVISE.** The design survived 22 scenarios. The changes made during validation (court-file cardinality, issue ownership, evidence dependency, filing result lookup) were refinements, not contradictions. No scenario required a different domain boundary.

**Why not REJECT.** The current system cannot support the product. The audit gives verified evidence, and the target is smaller and more enforceable than the current design.

### 15.3 Conditions of adoption

1. The owner confirms S1 to S9 and the two owner rules in section 14.1.
2. The first slice passes the owner proof in Phase 4.
3. The architecture tests exist before the second domain is added.
4. The policy fail-closed tests exist before the agent is enabled.
5. The migration report is accepted before cutover.
6. The agent remains preparation-only until a later explicit decision.
7. The old app remains available as a read-only archive during the rewrite.

If these conditions are not met, the verdict changes to **REVISE**.

### 15.4 What would change the verdict to ADOPT

- A successful crash test on the chosen execution adapter.
- A restored backup with a verified audit chain.
- A migrated real matter with a clean report and the owner's verification.
- A 5,000-page performance run within the target.
- Three real tasks completed by the owner.
- A second execution adapter passing the contract, or a documented decision that the port is enough.

---

## 16. What not to build

Do not build these in the rewrite unless the owner reopens the decision:

- Microservices or a server.
- A cloud dependency, Docker or WSL.
- A generic plugin platform.
- A second agent runtime.
- A graph database.
- Full event sourcing for every aggregate.
- A mobile or web client.
- Billing, time, CRM, marketing or analytics.
- Judge profiles or outcome prediction.
- CAPTCHA solving, stored court passwords or bulk scraping.
- Agent filing submission in v1.
- A new UI framework.
- Empty folders for imagined features.
- A CLI command for every table.
- A second source of truth for facts, evidence or approvals.

---

## 17. Definition of done

The rewrite is done when:

1. The owner completes real litigation tasks end to end, not demos.
2. The first slice, one court adapter, one case type and one filing preparation flow are used on real briefs.
3. Every legal decision has an actor, a time, a reason and an audit event.
4. The factual record shows sources, contradictions and history.
5. The agent can propose but cannot decide or submit.
6. A corrupt policy denies writes.
7. A crash during import, OCR, agent run or workflow recovers or fails visibly.
8. A backup restores with a verified audit chain.
9. One real old matter is migrated with a clean report.
10. The old app is a read-only archive.
11. The architecture tests pass.
12. The owner can explain what the system did, what it did not do, and why.

A document or a test the agent wrote is not proof. The owner's completed task is the proof.

---

## 18. Closing

The smallest coherent architecture is not a small application. It is an application with clear owners, one operation per use case, and interfaces that cannot bypass the boundary.

The current system grew by adding a table, a handler and a tool name. The rewrite grows by adding a domain rule, an application service and a capability. That is the difference that prevents the next 83-table store.

The plan is large because litigation is large. It is phased because the owner needs proof, not a promise. The main risk is not the technology. It is scope discipline: building the next feature before the current slice is proved.

The next action is Phase 1: contracts and the capability skeleton. No code beyond the contracts. No persistence until the contracts are accepted.

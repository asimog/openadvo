# Phased implementation plan — deliverable H

Status: **proposed plan, presented for acceptance** (stage 6). The phases are small, each ends with an owner exit on a real brief (lesson L3: done means the owner completed a real task), and each phase builds its modules deep and complete (lesson L5). Nothing is coded before its phase's one-page spec is written at the depth the phase needs (lesson L1).

The assignment's candidate stages are revised in three ways, from the answered decisions: the vertical slice completes through the CLI (DQ-9), workflow recovery is designed in from phase 1's foundation (DQ-4), and the agent phase follows the runtime decision (DQ-5). Court adapters arrive before drafting so that phase 7 can prove SLP is mere configuration.

## Phase map

| Phase | Builds | Owner exit (the real-task test) |
|---|---|---|
| 0 — done | The audit, the failures, the boundaries, the decisions | This series |
| 1 | Foundation, chain, store base, catalog skeleton, structural tests | — |
| 2 | Matter + Proceedings domains; matter/proceeding CLI | The owner records a real matter with two proceedings in different courts |
| 3 | Documents + Evidence domains; ingest, OCR, anchors | The owner imports a real brief; every anchor resolves |
| 4 | Factual Record + review queue; `fact review` | **The first vertical slice**: the owner reviews candidates on a real brief and accepts one |
| 5 | Courts domain, intel store, first three adapters, content-assisted intake (DQ-8) | A new matter is classified from content with cited signals; a proceeding's checklist comes from adapter data |
| 6 | Agent execution: LangGraph.js behind the owned interface; separate checkpointers (DQ-4) | The agent proposes facts on a real brief; the owner decides through the review queue; a killed run reconciles |
| 7 | Drafting domain; SLP as pack configuration | A **non-SLP** petition is generated with zero core changes |
| 8 | Work + workflow execution with the legal checkpointer | An interrupted workflow restarts from its last completed step; deadlines are computed, never invented |
| 9 | Desktop UI: shell, review panes, chat dock, generated IPC | The owner completes the slice's review through the UI as well |
| 10 | Filing: sets, checks, confirmations; per-matter portal (DQ-7); human-only submission (DQ-6) | A filing set is prepared on a real brief; only the advocate submits |
| 11 | Research & knowledge: corpus, statutes, citation verification | A draft cites a verified authority with a checkable source |

## Per-phase detail

Each block: objective · scope · depends on · modules · tests · acceptance · out of scope · decisions already made.

**Phase 1 — Foundation and enforcement.** Give every later phase its contracts and make drift impossible from the first commit. Scope: `foundation/` (ids, actor/scope, typed refs, result envelope, chain), per-matter store shell with the chain, capability catalog skeleton, the structural test harness, `tools/gen-contracts.ts`. Depends on: acceptance of this plan. Tests: chain round-trip (append, verify, tamper-detected, refusal rows); import-boundary test green on day one; contract generation from one source. Acceptance: `createMatter` runs end to end through one operation from a stub CLI; the structural suite fails on a deliberately planted boundary violation. Out of scope: every other domain. Decisions: DQ-1 (trust), DQ-3 (per-matter folders, fresh start).

**Phase 2 — Matter and Proceedings.** Make the concept the current system collapsed into a record. Scope: both domains' records, rules, ports; matter/proceeding CLI; scope construction. Depends on: phase 1. Tests: matter lifecycle; one matter with several proceedings; typed court ids refuse display names; case-number shapes per court data. Acceptance: the owner's exit — a real matter with two proceedings in different courts. Out of scope: documents, facts, agents. Decisions: DQ-2 (single advocate; ids ready).

**Phase 3 — Documents and Evidence.** Preserve originals; make every reference real. Scope: registration, versions, pages, anchors (write-once), OCR pipeline, evidence records with hash copy; blob re-hash on read. Depends on: phase 2. Tests: duplicate imports; interrupted ingest; blob tamper detection; anchor validation rejects a fabricated id (R-6). Acceptance: the owner's exit — a real brief imported, every anchor resolves, processing state is honest on screen. Out of scope: facts. Decisions: none open.

**Phase 4 — The Factual Record.** The first slice completes. Scope: facts with origins and statuses, `FactDecision`, contradictions, the review queue (work domain's first tables), `fact review` CLI. Depends on: phase 3. Tests: an extraction can never be accepted without a decision; acceptance writes actor, time, chain; conflicts stay visible; cross-matter scope test. Acceptance: **the owner's real-brief exit through the CLI** (DQ-9): candidates reviewed, one accepted, one rejected with a reason. Out of scope: agent proposals (phase 6). Decisions: DQ-9 answered — CLI only.

**Phase 5 — Courts and adapters.** Court behaviour becomes data end to end. Scope: courts domain, intel store with sources and freshness, adapters for the Q-1 default three (in-sc, in-hc-delhi, in-dj-delhi), content-assisted classifier with cited proposals and validated outputs. Depends on: phases 2-3. Tests: adapter capability declarations; stale rows never pass; a fourth adapter drops in without core edits (R-7); classifier output validated — court ids typed, every signal cited. Acceptance: the owner's exit — a new matter classified from content with checkable signals; a proceeding's checklist and limitation computed from adapter data. Out of scope: filing, drafting. Decisions: DQ-8 answered — content-assisted with citations.

**Phase 6 — Agent execution.** The engine lands behind the owned interface. Scope: `AgentExecution` (contracts §7), LangGraph.js adapter, catalog-driven tool views, fail-closed policy wired to the approval queue, **separate checkpointers** (agent: SqliteSaver in the matter chat folder; legal: phase 8's reconciler — here, run states for agent runs), subagent and planning patterns as catalog tools. Depends on: phases 1-5. Tests: every tool resolves to a catalog entry; a corrupted policy denies everything; approval timeout refuses; a killed run reconciles to `interrupted` and its work survives in records (DQ-4); no legal record is ever read from the agent checkpointer; scope isolation — matter A's agent cannot reach matter B (R-12). Acceptance: the owner's exit — the agent proposes facts on a real brief, the owner decides through the queue; a crash mid-run reconciles. **Pi stays in the build as fallback until this exit passes** (agent-runtime.md §5). Out of scope: desktop chat UI (phase 9). Decisions: DQ-5 (LangChain family, verified), DQ-4 (separate checkpointers).

**Phase 7 — Drafting.** Prove the SLP rule by generating something else. Scope: drafts, revisions, templates as pack data, validation referencing facts and authorities without copying them. Depends on: phases 2-6. Tests: template rendering from pack data only — a structural test fails on any court name in code (R-7); revision history; validation cites fact ids that resolve. Acceptance: the owner's exit — a non-SLP petition generated with zero core changes, validated against the factual record. Out of scope: filing. Decisions: none open.

**Phase 8 — Work and workflows.** Coordination with recovery. Scope: tasks, deadlines, review queues generalised; workflow execution with run states and the start-up reconciler (the legal checkpointer). Depends on: phase 6. Tests: a refused gate stops the run; a killed process leaves `interrupted`; the reconciler restarts from the last completed step; no step re-runs a committed operation; the agent checkpointer never holds a step's legal truth (DQ-4). Acceptance: the owner's exit — an interrupted workflow resumes correctly; a deadline is computed from rules data. Out of scope: the desktop UI for these (phase 9). Decisions: DQ-4 answered.

**Phase 9 — Desktop UI.** The same operations, rendered. Scope: Electron shell, generated IPC, review panes, chat dock streaming agent events, approval presentation; the shell owns navigation and active context only (R-4). Depends on: phases 1-8. Tests: e2e on temp homes; the renderer imports no domain, store or `node:` module (structural); every pane's decision routes through an operation. Acceptance: the owner's exit — the slice's review completed through the UI as well. Out of scope: new operations (a pane that needs one goes back to application design). Decisions: DQ-9 revisited here by its own terms if the CLI exit ever showed friction.

**Phase 10 — Filing.** Preparation and submission, split. Scope: filing sets, compliance checks from adapter data, the two confirmations as human-only operations, per-matter portal partitions, submission by the advocate only. Depends on: phases 5, 7, 9. Tests: confirmations bind to the payload hash; `submit` is absent from every agent surface (coherence test, DQ-6); per-matter partitions hold; downloads file only through recorded operations; the shared browser's guards enforced (DQ-7). Acceptance: the owner's exit — a real filing set prepared, checked, confirmed twice, submitted by the advocate. Out of scope: agent-submitted filing (rejected, DQ-6). Decisions: DQ-6, DQ-7 answered.

**Phase 11 — Research and knowledge.** Scope: corpus store, statutes with versions and in-force checks, authorities, citation verification, research queries; propose-only practice memory. Depends on: phases 3, 7. Tests: verification states block when unresolved; a research result cannot become an accepted proposition; corpus chain verifies (the audit's `LawStore` gap closed). Acceptance: the owner's exit — a draft cites a verified authority with a checkable source.

## Rules the plan obeys everywhere

- Between phases: typecheck, unit and structural suites only. The full e2e runs once, at a phase's end (agent-guide 8.4 kept).
- Each phase's spec is written when the phase starts, at the depth the phase needs (L1).
- No empty folders: a folder appears with its phase's first commit.
- Every phase ends with a real-brief exit the owner performs (L3); an exit not performed means the phase is not done, whatever the tests say.

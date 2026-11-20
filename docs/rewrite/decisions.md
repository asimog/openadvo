# Rewrite open decisions — Stage 4

Status: **questions for the owner, none silently decided**. This file owns the unresolved decisions of the rewrite planning (deliverable J, first instalment). Each decision has: the question, the realistic options, the consequence of choosing each, and a **default** that stages 6 and 7 will use *until the owner answers* (the convention of `questions.md`). Defaults are stand-ins, never accepted decisions.

**Round one was answered on 2026-11-20**: DQ-1, DQ-2, DQ-3, DQ-5 and DQ-9; the answers are recorded in place below. **Round two was answered on 2026-11-20**: DQ-4, DQ-6, DQ-7 and DQ-8 — two of them with the owner's own wording, recorded verbatim and interpreted in place. No DQ remains open.

## DQ-1. The trust model: who may claim to be the advocate

*From the audit's AQ-1 and failure F-11.*

**Question.** Today any in-process caller sets `WriteContext.actor` and the stores trust it (`shared/records.ts:58-61`). In the rewrite, is that acceptable as a written decision, or must authority be established by a boundary?

**Options.**
- **A. Documented in-process trust.** One desktop application, one advocate at the keyboard. The actor is constructed by application coordination for each interface (the bridge constructs `advocate` from an IPC source; the agent constructs `agent`); the code habit becomes a written threat model with its limits (extensions run in-process and are trusted — they already exist, `WorkspaceViews.tsx:294`).
- **B. A boundary issues actor tokens.** A sign-in (or OS user-presence) at the application boundary issues short-lived authority that human-only operations require. Extension code and workflows cannot mint it.

**Consequences.** A keeps the rewrite one process and one surface; the cost is that every future surface (CLI, extensions, helpers) must be trusted code, and the audit shows the guarantee rests on convention. B makes human-only authority real rather than labelled, at the cost of a session concept, a prompt flow, and the risk that a friction-heavy prompt gets disabled by its users.

**What it changes.** The shape of application coordination, the capability catalog's `human-only` enforcement, and whether the CLI can perform advocate decisions at all.

**Answered (2026-11-20): A — documented in-process trust.** One desktop application, one advocate at the keyboard. Application coordination constructs the actor for each interface; the threat model — including the fact that extensions run in-process and are trusted — is written down as part of stage 6. Option B is named there as the bolt-on path if the trust model must harden later.

## DQ-2. Multi-advocate scope: is a firm in the first release

**Question.** The assignment lists chambers, teams, roles and several advocates on one matter as candidate scope, and requires the validation scenario "several advocates working on one matter". Is multi-advocate real in the first release, or single-advocate with the model ready?

**Options.**
- **A. Single advocate first.** Organisation tables are deferred; the Advocate domain holds one profile. The `Actor` and `Scope` types carry an advocate id from day one, so adding more later is additive, not a migration.
- **B. Multi-advocate first.** Chambers, membership, roles, matter assignments and per-advocate access checks exist before the first slice ends.

**Consequences.** A keeps the first release small (the assignment's own constraint: smallest coherent architecture) but means the scenario "several advocates on one matter" is validated only structurally (the model allows it), not by use. B makes permissions, review queues and matter isolation multi-user-correct immediately, at the cost of identity, roles and access machinery before any single-advocate value exists.

**What it changes.** The size of the Advocate domain, the permission model's test matrix, and whether the per-matter store can ever assume "the advocate" is one person.

**Answered (2026-11-20): A — single advocate first.** Organisation tables are deferred. The `Actor` and `Scope` types carry an advocate id from day one, so adding more advocates later is additive, not a migration.

## DQ-3. Storage shape, and whether existing matters migrate

*From the audit's AQ-11, and the assignment's constraint against new databases without proven need.*

**Question.** Two parts. (1) Does the rewrite keep one folder per matter with its own database — the current model, where a matter is a portable, archivable unit — or move to one database? (2) Do the owner's existing matters migrate, or does the rewrite start empty?

**Options.**
- **A. Keep per-matter folders; start empty.** Each matter keeps its own store, as today. Existing matters are not migrated; anything worth keeping is re-imported (documents are files; they re-register by hash).
- **B. Keep per-matter folders; write a migration.** A one-way importer reads the current `matter.db` schema into the new one, including facts, events and chains.
- **C. One database, all matters.** Cross-matter queries become joins; the matter folder stops being a portable unit; archival becomes row operations.

**Consequences.** A is the smallest start; the cost is that the owner's current matters sit in the old application until re-imported, and the audit's chains and history do not carry over. B preserves records and history but pays a migration shaped by the audit's findings (sixty-plus tables, free-text anchors that must be validated or quarantined per R-6, event chains to preserve). C simplifies queries but gives up the product property the current system has by design (`repo-map.md:66`) and centralises what the product treats as per-client units.

**What it changes.** The store layer of every domain, the archival and export story, and the effort of the first phases.

**Answered (2026-11-20): A — per-matter folders, start empty.** Each matter keeps its own store. No migration is built; the current matters stay in the old application, and documents re-register by hash when re-imported.

## DQ-4. Recovery depth: resume or mark-and-restart

*From the audit's AQ-3 and failure F-16.*

**Question.** When a run or workflow dies mid-step, must it resume where it stopped, or is marking it interrupted and restarting the step enough?

**Options.**
- **A. Mark interrupted, restart the step.** Run state has real states (running, interrupted, failed, completed) and a start-up reconciler; an interrupted run restarts from its last completed step. Model calls re-run; operations that already committed are not re-run (their records exist).
- **B. Full resume with checkpoints.** Execution state (conversation position, partial outputs) is checkpointed so long model runs continue where they stopped.

**Consequences.** A satisfies R-16 with domain-level idempotence: each operation either completed (its records show it) or not — the audit shows the operations are already record-based, which is what A needs. B saves model cost on 15-minute runs but couples the runtime's checkpoint format to the recovery design, exactly the coupling rule R-3 warns about.

**What it changes.** The workflow execution service's state machine and the runtime choice's weight (B pushes toward a runtime with checkpointing).

**Note after round one.** DQ-5's answer points the engine at the LangChain family, whose runtimes ship checkpointers. That lowers option B's build cost — but the coupling cost does not vanish: a framework checkpointer may hold *execution* state only, never legal records, and the coupling must be declared in the runtime deliverable.

**Answered (2026-11-20): "SEPARATE LEGAL AND AGENT CHECKPOINTERS" (the owner's own wording).** Neither option alone. Two mechanisms, owned separately:

1. **The legal checkpointer is the record itself.** Every operation commits or does not; the event chain carries what committed; workflow run state has defined states and a start-up reconciler that restarts an interrupted run from its last completed step (option A's semantics, applied to runs and workflows).
2. **The agent checkpointer holds execution state only** — conversation position, partial outputs, session files — and may use the runtime's own checkpointer (option B's mechanics, bounded to execution).

The two never share a format, and neither may hold the other's truth: no legal record lives in an agent checkpoint, and no agent execution state is a legal record. R-16 is enforced on both sides: the reconciler owns run states; the execution layer owns session states.

## DQ-5. Agent runtime: keep Pi behind an owned interface, or replace now

*From the audit's failure F-3; the deep comparison is the assignment's deliverable E, which Stage 6 starts.*

**Question.** Does the rewrite keep Pi (embedded, tested, pinned 1.5.2, verified working in the audit) as the execution runtime — behind an OpenAdvo-owned execution interface so it stays replaceable — or replace it now with a thin custom loop?

**Options.**
- **A. Keep Pi, own the interface.** The catalog and operations are OpenAdvo's; Pi executes turns, streams and sessions. The current system's real failures (tools inline in `agent.ts`, identity in the prompt) are fixed by moving ownership, not by replacing the engine.
- **B. Custom thin runtime now.** A small loop: model call, tool dispatch through the catalog, event stream, session file. Full control; the current dependencies on Pi's session format, extension system and faux-model test provider are rebuilt or dropped.

**Consequences.** A keeps a working, locally-run, extension-capable runtime with a scripted-model test path the audit found genuine (`agent-fixture.ts:10-63`); the cost is that the interface must be disciplined about what it lets Pi own (sessions, streams) versus what OpenAdvo owns (operations, records, approvals). B removes an external dependency from the legal-record boundary but re-implements streaming, session resume and the test harness before the first slice earns either.

**What it changes.** The agent execution layer's size, the test harness, and phase ordering.

**Answered (2026-11-20): the owner directed the runtime family — "LANGCHAIN DEEPAGENTS TS JS".** The engine is to be selected from the LangChain family (LangGraph) and DeepAgents **in TypeScript/JavaScript**, in place of keeping Pi. This is a direction, not a completed selection, and the runtime deliverable (assignment deliverable E, stage 6) must verify live before stage 6 commits:

1. What DeepAgents variant exists for TS/JS — the original DeepAgents is a Python project; a maintained TS/JS port must be confirmed with its version, licence and maintenance state.
2. LangGraph.js's current state: local operation, streaming, tool calling, checkpoint model, dependency footprint.
3. What the directed family earns over the working fallback (Pi is embedded, tested, pinned — audit 6), because a migration must be justified by a real problem it solves, not by feature count.

In every case the OpenAdvo-owned execution interface is unchanged: the catalog, operations, records and approvals are OpenAdvo's; the framework owns execution only. Pi moves from preferred engine to fallback.

## DQ-6. Agent-initiated submission

*From the audit's AQ-12.*

**Question.** Today `submit_filing` is an agent tool (`agent.ts:116`) that submits after two human confirmations (`portal.ts:245-275`). Does that capability stay, or does submission become human-only?

**Options.**
- **A. Keep it, gated as today.** The two confirmations bound to the payload hash remain the authority; the agent drives the portal.
- **B. Submission is human-only.** The agent prepares and verifies; the advocate alone presses submit, and `submit` never appears in the capability catalog's agent-facing classes.

**Consequences.** A preserves a working capability the owner built deliberately (decision 25 lets the current flow stand until the last phase) but keeps the residual path the audit found: `portal_click` on a non-submit element whose script submits (`portal.ts:187-188`). B closes F-13's residual path completely and simplifies the portal driver's risk surface, at the cost of the advocate doing more portal keystrokes.

**What it changes.** The Filing domain's operations, the portal driver's capability set, and several permission tests.

**Answered (2026-11-20): B — submission is human-only.** `submit` never appears in the agent-facing capability classes. The agent prepares and verifies; the advocate alone submits. This closes the residual path the audit found (`portal_click` on a non-submit element whose script submits) at the cost of more portal keystrokes for the advocate.

## DQ-7. External session isolation

*From the audit's AQ-4 and failure F-12; the rule R-12 is already accepted, the shape is open.*

**Question.** Portal and browser state must be matter-scoped. Per-matter partitions (separate cookies and sessions per matter), or one shared session with an explicit, recorded switch?

**Options.**
- **A. Per-matter partitions.** Each matter's portal/browser context is its own partition; no cookie crosses matters; agent tabs belong to the matter that opened them and are unreachable from another matter.
- **B. One session, explicit switch.** The current single partition, but the switch is a recorded operation with a visible indicator, and agent tools can only act on the current matter's context.

**Consequences.** A is the strict reading of R-12 and the end of the cross-matter leakage the audit verified (`portal.ts:100`); its cost is that a court sign-in must be repeated per matter, and the advocate may find that burdensome on portals with one account per advocate. B is convenient but keeps one trust pool shared across client matters — the exact exposure F-12 records.

**What it changes.** The portal and browser infrastructure, and the sign-in experience.

**Answered (2026-11-20): "PER MATTER PARTITION FOR EVERYTHING EXCEPT BROWSER" (the owner's own wording).** The court portal, downloads, and every context that acts on a matter get their own per-matter partition; no cookie or sign-in crosses matters there. The built-in browser stays one shared surface: the advocate's own browsing is not matter-scoped. The guards that keep the shared browser honest, and the residual it carries, are named here rather than hidden:

1. Downloads-to-matter are recorded operations that carry the matter scope; nothing files into a matter without one.
2. An agent tab records the matter that opened it, and agent tools on a tab act only inside that tab's recorded matter.
3. Court sign-ins needed for filing go through the per-matter portal, never the shared browser.
4. The shared browser's cookie pool is treated as untrusted for matter actions; it is a reading surface, not a filing or credential surface.

R-12 holds: state that acts on a matter belongs to the matter, and the browser is declared shared exactly as R-12's second clause allows — explicitly, with guards.

## DQ-8. Classification signals

*From the audit's AQ-5.*

**Question.** Is content-based classification (reading document text to classify a new matter) required, or are title, file names and profile fields the accepted ceiling?

**Options.**
- **A. Names and profile fields only.** The current ceiling, kept: fast, no model cost, wrong when file names mislead (the audit's verified weakness, `classification/index.ts:27`).
- **B. Content-assisted classification.** The classifier may read registered text (already extracted, no extra cost) and *propose* with cited evidence for each signal; the proposal is validated before it can be applied (fixing the audit's unvalidated-proposal failure, F-8).

**Consequences.** A is smaller and honest about being shallow. B costs a pipeline step before the first matter is usable but produces proposals whose basis is checkable — which the current classifier's unused `basis` field already gestures at (`bridge.ts:1013-1027` consumes five fields and drops the rest).

**What it changes.** The Matter domain's intake operations and whether document extraction must exist before matter creation completes.

**Answered (2026-11-20): B — content-assisted classification with cited proposals.** The classifier may read already-extracted document text and must cite, per signal, the passage a classification rests on; proposals are validated before they can be applied (typed court ids, typed case types — the fix for the audit's unvalidated-proposal failure). This adds a pipeline step before a new matter is usable, and the boundary map's intake operations account for it: document extraction must complete before matter classification, not after matter creation.

## DQ-9. The first slice's advocate review surface

*From the assignment's own instruction to evaluate the CLI-first order and identify exceptions (lesson L3 makes the owner's real-task exit the test of done).*

**Question.** The first vertical slice ends with "Advocate review → Accepted factual record". Is a CLI-only review (the advocate reviews candidate facts in a terminal listing and accepts by command) an acceptable exit for the first slice, or does the slice wait for a minimal review UI?

**Options.**
- **A. CLI-only exit.** The slice completes in the terminal: candidate facts listed with sources and anchors; accept, dispute or reject by command. The desktop UI comes later, on the same operations.
- **B. Minimal review pane first.** The slice's exit includes a small desktop surface for the same review operations, before the full UI phases.

**Consequences.** A keeps the build order strictly CLI-first (the assignment's stated preference) and proves the operations early; the cost is that the owner's real-brief exit happens in a terminal, which may not be a realistic way for a lawyer to review a brief — L3 requires the owner to complete a *real* task. B front-loads a thin UI shell before the domain phases complete, but the owner's exit then resembles the real product experience.

**What it changes.** The phase plan's order (CLI phase and UI phase swap a slice of scope) and the definition of the slice's exit.

**Answered (2026-11-20): A — CLI-only exit.** The first slice's review and acceptance complete in the terminal, on the same operations the desktop UI will later call. The default is revisited the moment the owner's real-brief test shows friction (lesson L3).

## Decisions already proposed as design details (not blocking)

These audit questions are settled by the proposed rules and boundaries unless the owner rejects them there; they do not need a fork decision.

| Audit question | Settled by |
|---|---|
| AQ-6 (anchors enforced everywhere) | Rule R-6 and the typed references in the foundation; migration of legacy anchors only matters if DQ-3 chooses migration |
| AQ-7 (a dedicated fact decision record) | The Factual Record domain's `fact_decision` table (boundaries §3, row 7) |
| AQ-9 (one IPC contract source) | Rule R-13: one source, other copies generated or divergence-tested |
| AQ-10 (legal content for the UI) | Interfaces render what operations return; stage lists and templates arrive through operations (the fix for the current renderer imports, audit 4.11) |

## What Stage 4 does not do

It does not decide — the owner does, and has. **All nine decisions are answered (2026-11-20).** Round one: DQ-1 documented in-process trust; DQ-2 single advocate first; DQ-3 per-matter folders, start empty; DQ-5 runtime family directed to LangChain / DeepAgents in TS/JS (live verification owed in the runtime deliverable); DQ-9 CLI-only slice exit. Round two: DQ-4 separate legal and agent checkpointers (the owner's own wording); DQ-6 submission human-only; DQ-7 per-matter partitions for everything except the browser (the owner's own wording); DQ-8 content-assisted classification with cited proposals. Two answers carry named residuals — DQ-5's pending verification and DQ-7's shared browser surface — and those residuals are carried forward into the plan and the final assessment, not hidden.

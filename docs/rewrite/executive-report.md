# Executive report — the combined planning record, for discussion

Status: **a discussion document** (2026-11-20). It combines the two complete bodies of planning work in this repository and compresses them into one readable report:

1. The **rewrite series** — 16 documents in `docs/rewrite/`: the verified audit, the failure rules, the proposed boundaries, the nine answered owner decisions, the alternatives, the architecture plan, the scenario validation, the final assessment, and two systems-design capability maps (proposed and current).
2. The **module audit series** — 17 documents in `docs/moduleaudit/`: a whole-application systems-design review (`00`), a deep matter/proceeding/classification/procedural-rules design (`01`), and fourteen module reports (Research Studio, browser, court adapters, workflow, skills, RAG, agent runtime, documents, evidence, drafting, filing, memory, permissions, storage/mail/identity).

Both series read the same code (the rewrite series at commit `26ac806`, the module audit at `9168f6a`; `src/` is identical at both). Both used code as evidence and refused to treat docs or prior proposals as architecture. This report does not restate them; every section points at the owning file. Its job is to show the owner, in one place: **what is settled, what the two series disagree on, and what the discussion must decide.**

---

## 1. The one-page summary

**The verified baseline.** The store layer is real and tested: content-addressed documents with re-hash on read, write-once anchors, evidence records with copied hashes, facts with explicit acceptance states, hash-chained append-only events in all four stores, refused writes in their own table, a signed filing manifest with two hash-bound human confirmations, adapters as data with host allowlists, and human-only store writes asserted in fifteen-plus test files. A green suite of 419 unit tests runs against all of it.

**The verified problem.** A green suite coexists with boundary erosion. The five hottest files are the wiring layer (`index.ts` 56 modifications, `shared/api.ts` 51, `agent.ts` 50, `preload` 41, `matter-store/index` 33 — churn measured over ~500 commits). Every capability that ends at a store is in good shape; every capability that crosses the wiring layer drifted from its own documentation while nothing failed. The proceeding has no record — it is one TEXT field with ten interpreters. Provenance anchors are free text everywhere except one table. The policy file fails open. Permission is declared in ten places. Runs and workflows have no recovery. Nothing enforces a boundary anywhere.

**The two series agree on all of that, independently.** They were produced by separate audit passes with different methods (import-graph computation and churn analysis in one; behavioural probes and per-module inventories in the other), and they converge on the same findings, the same target model, and the same discipline. The findings are settled.

**They disagree on one strategic fork.** The module audit concludes: *"Refactor boundaries, do not rewrite"* — a six-phase strangler refactor that extracts services behind the existing bridge, keeps every working capability and the 419 passing tests, and lands the same target model by additive migration. The rewrite series concludes: build the same target model greenfield — twelve phases, a fresh start with no data migration (the owner's answered DQ-3), the same rules, and a runtime direction the owner set (DQ-5: the LangChain family in TypeScript). Both point at the same destination. The fork is the road.

**What this discussion must settle.** Section 6 lists the decisions: the road (refactor or greenfield), the runtime (keep-and-split versus the owner's directed family), the policy default, the confidential flag, and the handful of genuinely new questions only the module audit raised.

---

## 2. The modules — both series' verdicts side by side

Fourteen capabilities, each with the module audit's maturity and recommendation, and the rewrite series' placement. "Agreement" means the two series assign the same ownership and the same fix.

| Capability | Module audit maturity ([00](../moduleaudit/00-systems-design.md) §3) | Module audit recommendation | Rewrite series placement | Agreement |
|---|---|---|---|---|
| Matter Management | Implemented, broad; the only aggregate | Keep and extract → `MatterService` | The Matter domain, one writer module per table ([boundaries.md](boundaries.md) §3) | Yes — same owner, same fix |
| Proceeding Management | **Emergent** — a label, not an entity | **Build** → proceeding entity, `ProceedingService` | The Proceedings domain; the audit's failure F-5, the plan's phase 2 exit | Yes — the largest shared finding |
| Matter Classification | Partial, low-confidence; circular, unpersisted | **Replace** → evidence-based, field-level, audited | The intake service, content-assisted with cited proposals (owner's DQ-8), validated before apply | Yes — [01](../moduleaudit/01-matter-proceeding-classification.md) §5 and [contracts.md](contracts.md) describe the same staged pipeline |
| Document Management | Implemented for five formats; global ingest queue | Keep; parser registry, per-matter queues | The Documents domain; strongest capability in both audits | Yes, plus two module-audit-only findings (§3 below) |
| Evidence Management | Implemented and deep; matter-scoped | Keep; add proceeding scope, one extraction owner | The Evidence domain, separate from Documents and Facts | Yes — both make extraction single-owner |
| Procedural Intelligence | **Emergent** — three rule authorities, no rule record | **Build** → `ProcedureService`: rule records, versions, applicability, obligations | Deliberately not a module: rules data in the Courts domain, records in Proceedings, deadlines in Work, checks in Filing ([capability-map.md](capability-map.md) §1) | Yes on the model, different on the module count — both forbid an "intelligence" god-service |
| Legal Research | Implemented, deep; corpus partial; two authority writers; provenance unwired | Keep and unify → one `AuthorityService` | The Research domain; provenance wired; propose-only propositions | Yes |
| Drafting | Implemented and deep; matter-level; templates are code | Keep; proceeding scope, templates as data, one gate | The Drafting domain; SLP proven configuration-only in phase 7 | Yes |
| Filing | Implemented, strong integrity; law from packs/adapters; set not idempotent | Keep and harden; requirement sets from the procedure owner | The Filing domain; two confirmations kept; submission human-only (owner's DQ-6) | Yes, plus the module audit's idempotency and partial-folder findings (§3) |
| Workflow | **Fragmented** — two models, four stores | Consolidate → one model, one store | Workflow execution as application coordination with run states and a reconciler (owner's DQ-4) | Yes — both end the four-way "workflow" |
| Permissions | Strong single-user; default allow; confidential flag inert; fail-open read | Harden → default ask, fail closed, one `PermissionService` | The catalog + fail-closed policy; the actor constructed, never self-declared (owner's DQ-1) | Yes — including the fail-open finding, found independently |
| Audit and provenance | Strong writes; decisions not audited; provenance unwired | Extend → decision records, correlation ids, provenance wired | The foundation's chain; `fact_decision` records; the corpus chain gets verification | Yes — plus the module audit's decision-audit scope (classification, pack, rule) |
| Agent runtime | Implemented and deep; god module, 87 tools | Keep the runtime; **split the container** | The `AgentExecution` seam; engine behind it (owner's DQ-5 direction); tools catalog-derived | **Partial — the one real runtime disagreement** (§6) |
| Court adapters | Framework implemented; **used as a legal source** | **Narrow** — technical data only, legal content out | Adapters as infrastructure writing through the Courts domain; a structural test fails on any court name in code | Yes — the same boundary, the same guard |

The pattern across all fourteen rows: **the two series agree on every ownership and integrity question.** The module audit contributes per-module inventories, migration paths and acceptance tests; the rewrite series contributes the domain map, the answered owner decisions, the runtime verification and the phased plan.

## 3. The failures — one combined register

The rewrite series catalogued seventeen failures with missing rules R-1..R-17 ([failures.md](failures.md)); the module audit catalogued twenty-one findings F-01..F-21 with a risk-heat map ([00](../moduleaudit/00-systems-design.md) §7). They were produced independently. Merged:

**Found by both, independently (the settled core).**

| Failure | Rewrite series | Module audit |
|---|---|---|
| No proceeding entity; SLP occupies the generic names | F-5, R-5 | F-02, F-19; probes in [01](../moduleaudit/01-matter-proceeding-classification.md) §2 |
| Procedural rules have no owner (pack/adapter/stage-list as law) | F-7, R-7 | F-03, R-17, R-20 |
| The facade is bypassed; composition has no owner | F-1, R-1 | F-01, F-09 (38 direct sub-store calls outside `Matters`) |
| God modules absorb every change (agent.ts, index.ts, bridge.ts, matter-store/index.ts) | F-1, F-3; churn evidence | F-18, §6.3 |
| Policy fails open at the file layer; default allow | F-10, R-10 | F-12, P-01 ([14](../moduleaudit/14-permissions-audit.md)) |
| The actor is an unverified string | F-11, R-11 | P-03, SM-04 (identity as a principal) |
| Audit covers writes, not decisions; provenance unwired | F-14 context; contracts §4 | F-13, P-05, P-08 |
| Chain owned by one domain, imported by the rest | F-17, R-17 | F-10 (store-chain imports matter-store) |
| Classification circular, unvalidated, display-name courts | F-8; audit 4.6 | F-07, F-08; probe 3 ("first appeal" → criminal because "first" contains "fir") |
| Workflow models multiply; no resume | F-16, R-16 | F-04; W-06 ([05](../moduleaudit/05-workflow-builders-automation.md)) |
| Idempotency uneven | validation revision 3 | F-15 (triggers, filing sets, case-list import) |
| Shared layer imports lib; contracts duplicated | R-13; three-copy IPC | F-11 (shared is not independent) |
| Portal/browser state crosses matters | F-12, R-12 | B-01 ([03](../moduleaudit/03-browser.md)) |
| Two authority write paths | — | F-06, P-04, R-22 in [00](../moduleaudit/00-systems-design.md) §5 |
| Four readiness gates disagree | — | F-05, R-28; one `ReadinessService` target |

**Found only by the module audit** (the rewrite series' method did not reach these; all are evidence-cited): the globally serialized ingest queue ([09](../moduleaudit/09-documents-ocr.md) D-02 — one large PDF blocks every other matter); O(n) docket, related-matter and outcome scans on the UI path (F-14); the **confidential flag stored but not enforced** (F-12, P-02 — decision 24 removed the check, the UI kept the promise); case status missing while the docs describe it (C-04); the document-format claim wider than the parser (F-17); schema/migration discipline uneven (F-16); redaction is a mark, not new bytes (D-05); email is an attachment pipe — the body never becomes a record (SM-02); contacts live outside the audited store (SM-03); the trigger fires have no dedupe (W-03); the filing set has no idempotency key and a failed build can leave an orphan folder (F-02, F-04 in [12](../moduleaudit/12-filing-portal.md)); two matter memories under one name (F-21, M-01); adapter list builds are not idempotent and advocate edits have no review workflow (C-06, C-07); the Firm Agent's read-only boundary is undocumented policy (A-06).

**Found only by the rewrite series:** the computed import cycles (including the type-level `index ⇄ bridge` cycle and the five-file matter-store cycle); the exact three-copy contract inventory with its snapshot-only guard; the ten-allowlist count with the two files that must be manually synced; the dual-held chat state with two duplicated reducers; the churn measurement that names the five wiring files as the system's bottleneck; the 5,000-event filing scan beside a no-limit disclosure scan; and the live runtime verification (LangGraph.js 1.7.5 and deepagents 1.17.0, both MIT, both published three days before the check).

**The lesson in this merge:** two independent audits, different methods, one conclusion — the failure set is settled. No third audit is needed. The open question is only the response.

## 4. The lessons

From the repository's own standing orders (AGENTS.md), still binding:

- **L1** Specify a module when its work starts, at the depth it needs; build it in the same piece of work.
- **L2** Nothing pretends; a feature that does not work says so on screen.
- **L3** Done means the owner completed a real task on a real brief.
- **L4** The base decisions are frozen; new decisions overrule old ones only by the owner's instruction.
- **L5** Build each module deep and complete; a phase is small enough to finish that way.
- **L6** Ideas outside the current step go to parking, not the plan.

And the lessons this session's two bodies of work add, all evidenced:

7. **A green suite proves behaviour, never structure.** 419 passing tests coexisted with every failure in section 3. The missing test kind is the structural test.
8. **Prose enforcement drifts; only checks that run with the tests hold.** Wherever code enforced (triggers, chains, gates, fixed denials), both audits found strength; wherever prose enforced, both found drift — fourteen doc contradictions in one series, a false single-caller claim in the other.
9. **Unowned concepts land in the widest-known file.** The proceeding, the capability, the recovery state and the operation had no homes, so they landed in the profile row, the allowlists, nothing, and the entry point — respectively. The churn data measures where.
10. **A capability with two authorities is worse than a capability with none.** Four gates, two authority writers, four workflow stores, two memories under one name, ten allowlists: disagreement is the cost, not duplication.
11. **A label is not a record.** "Proceeding", "workflow", "memory", "confidential" each did duty as a word while owning nothing. The probes proved it: unknown became SLP; "first" contained "fir" and a civil appeal became criminal.
12. **Two audits converging settles the diagnosis; the fork is strategy, not facts.** Both series end at the same target model. What remains open is the road there, and it is the owner's call.

## 5. The rewrite discipline — one combined rulebook

Both series wrote the discipline down, in nearly the same words. Merged, the binding rules are:

| # | Rule | Rewrite series | Module audit |
|---|---|---|---|
| 1 | One capability, one service/domain, one data owner; a module writes only its own tables | rules.md 3, 22 | Cross-module rules 1-4; A-03 to A-05 |
| 2 | Interfaces route and render; the bridge calls services/operations, never stores | R-2; rules.md 7 | "The bridge calls services, not stores" |
| 3 | The agent calls tools that call services; the runtime owns no record, no legal text, no authority | R-3; rules.md 3 | "The agent calls tools that call services" |
| 4 | Every concept the product names has a record; a workflow artefact never takes a generic name | R-5; rules.md 5 | "No string as a domain object"; the [01](../moduleaudit/01-matter-proceeding-classification.md) ontology |
| 5 | Court-specific behaviour enters the core only as declared adapter data | R-7; rules.md 6 | "No rule text in packs or adapters" (A-09) |
| 6 | References are typed and validated by the target's owner at write time | R-6; rules.md 14 | The anchor and quote-verification rules |
| 7 | Capabilities and permissions are declared once; subsets derive | R-9; rules.md 9 | One `PermissionService`; the tool policy final |
| 8 | Unreadable or invalid policy is deny | R-10; rules.md 12 | A-10; P-01 |
| 9 | Authority is established by the receiving boundary, not a caller-supplied label | R-11; DQ-1 answered | The `Principal` target (P-03, SM-04) |
| 10 | State that acts on a matter belongs to that matter | R-12; DQ-7 answered | B-01: a tab carries its matter |
| 11 | Acceptance is an explicit, authorised, auditable decision; supersede, never overwrite | rules.md 17; contracts §4 | "A confirmed record is superseded, not overwritten"; the decision envelope |
| 12 | Long-running work has defined states and a reconciler; the two checkpointers stay separate | R-16; DQ-4 answered | W-06; the workflow state machines |
| 13 | Every command is idempotent or documents why it is not | validation revision 3 | Cross-module rule 9; F-15 |
| 14 | **Unknown is a valid result.** A resolver returns `unresolved`, never the closest match | — | Cross-module rule 8; the [01](../moduleaudit/01-matter-proceeding-classification.md) resolver rule; the typed result states |
| 15 | A rule is not a checklist, a pack, an adapter or an agent summary | R-7 extended | Cross-module rule 7; C-01 |
| 16 | Every legal decision is recorded with actor, time, reason, source and version | contracts §4; rules.md 16 | Cross-module rule 6; the `DecisionRecord` envelope |
| 17 | Each contract has one source; generated copies, divergence tests | R-13; rules.md 19 | A-02; F-11 |
| 18 | Boundaries are enforced by tests that run in CI: green means behaviour **and** structure | R-15; rules.md 21 | The A-01..A-15 architecture suite |

Rules 13-16 are the module audit's genuine additions to the rewrite series' R-set; the rewrite series' genuine addition is the enforcement mechanism itself — the structural suite, the generated contracts, the churn-avoidance rationale — and the answered decisions that fix the fork's parameters (DQ-1, DQ-4, DQ-6, DQ-7, DQ-8).

## 6. The fork, and what the discussion must settle

### 6.1 The road: refactor in place, or greenfield

**Settled (owner, 2026-11-20): greenfield.** The owner's instruction was to make a plan for the greenfield rewrite of this repository. The plan is [execution-plan.md](execution-plan.md); the facts below are kept as the record of the fork.

**The module audit's case** ([00](../moduleaudit/00-systems-design.md) §9): a strangler refactor in six phases. Phase 1 extracts services behind the existing bridge with no visible change and an architecture-test exit; phases 2-6 land the unified gate, the proceeding and procedure model, the permission hardening, the classification rebuild and the performance work. Every step keeps the application working, is reversible by restoring the previous wiring, and uses additive migrations. Nothing working is discarded; the 419-test suite and every real feature survive.

**The rewrite series' case** ([phases.md](phases.md), [assessment.md](assessment.md)): the same target model, built greenfield in twelve phases on the eleven-domain map, because the current model's ceilings (one proceeding per matter, a one-row profile, SLP in the generic names, three contract copies, ten allowlists) are data-model facts that additive migration converts slowly, and because the owner answered the storage decision "per-matter folders, start empty" (DQ-3) and directed the runtime family (DQ-5). Its own assessment returns **ADOPT WITH LIMITATIONS**, not ADOPT, and names the costs: no migration of existing matters, the runtime integration unproven until phase 6, CLI-only early exits.

**What is honestly at stake.** Refactor keeps everything working and pays in duration and in carrying two shapes of every migrated concept at once; greenfield reaches the clean model faster and pays in losing the working surface until the slice lands, and in the owner's existing matters staying in the old application. The two plans' phase counts (six strangler phases; twelve build phases) are not comparable one-to-one — the strangler phases include the same legal-model work as the greenfield phases 2-8, minus the new foundation. **This was the decision the discussion existed to make, and the owner made it: greenfield.** The owner's DQ-3 answer ("start empty, no migration") stands with it.

### 6.2 The runtime

The module audit: keep the runtime, split the container — `agent.ts` becomes a thin composition over a tool registry split by capability; Pi stays; nothing about the session model changes ([08](../moduleaudit/08-agent-runtime.md)). The rewrite series: the owner directed the LangChain family in TypeScript/JS (DQ-5); verification found LangGraph.js 1.7.5 and `deepagents` 1.17.0 real, MIT, maintained, local-capable — and recommended the **engine** (LangGraph.js) behind an OpenAdvo-owned interface while rejecting the deepagents **harness** (its defaults ship filesystem tools and a trust-the-LLM posture) ([agent-runtime.md](agent-runtime.md)).

The two positions are closer than they look: both demand the same seam (tools from a catalog, runtime owns execution only, no file tools), and both reject "a second runtime to copy features". On the refactor road, the seam is built first and the engine question can be deferred; on the greenfield road, the owner's direction stands and Pi is the fallback until the agent phase's exit test. The genuine open question is timing, not architecture.

### 6.3 The decisions already answered (both roads must respect them)

DQ-1 documented in-process trust with the extension trust written down; DQ-2 single advocate first with ids ready; DQ-4 **separate legal and agent checkpointers** (the owner's own words); DQ-6 submission human-only; DQ-7 **per-matter partitions for everything except the browser** (the owner's own words, with the shared-browser guards recorded); DQ-8 content-assisted classification with cited proposals; DQ-9 CLI-only first exits.

### 6.4 Genuinely new questions, from the module audit only

| ID | Question | The module audit's default | Notes |
|---|---|---|---|
| D-01 | Is a matter one engagement with many proceedings, or one matter per court case? | One matter per engagement/dispute, many proceedings | Both series assume this; it should be affirmed by the owner because it shapes migration either way |
| D-02 | Is the FIR/investigation a proceeding or a pre-institution stage? | A `pre_institution` stage of the criminal case | A criminal-practice modelling question neither series can settle alone |
| D-03 | Do rule records live beside the instrument text (`corpus.db`) with applied records in `intel.db`? | Text in corpus, applied record in intel | The pointer direction; both series agree on the split, not the home |
| D-05 | Tool policy default: allow or ask? | Ask for write/fetch/court/model; allow local reads | The rewrite series states fail-closed on invalid policy (settled); the *default for unknown tools* is this separate, unanswered question |
| D-06 | The confidential flag: enforce or remove? | Enforce it or remove it; never keep an inert control | An owner decision under the advice boundary: record the facts, decide the product posture |
| D-04, D-07, D-08 | Text-workflow naming; one gate; build order | Rename to SavedInstruction; one gate; extraction before the domain model | The first two are agreed by both series; the third is settled by which road is chosen in 6.1 |

### 6.5 What does not need discussion

The target model itself. Both series, independently, landed on the same eleven-or-twelve bounded contexts with one writer per table, the same proceeding/procedure ontology, the same single gate, the same single authority owner, the same fail-closed permissions, the same decision-audit envelope, the same adapter narrowed to technical data, the same idempotency and unknown-is-valid rules. Whatever road is chosen, the destination is already drawn twice.

## 7. Coverage — every source document

| Source | Documents | Contribution to this report |
|---|---|---|
| `docs/rewrite/` | [README](README.md) index + [audit](audit.md), [failures](failures.md), [boundaries](boundaries.md), [decisions](decisions.md), [alternatives](alternatives.md), [system-architecture](system-architecture.md), [contracts](contracts.md), [agent-runtime](agent-runtime.md), [cli-plan](cli-plan.md), [repo-structure](repo-structure.md), [phases](phases.md), [rules](rules.md), [validation](validation.md), [assessment](assessment.md), [capability-map](capability-map.md), [capability-map-current](capability-map-current.md) | The verified audit and failure rules; the answered decisions; the greenfield plan; the two capability maps; the verdict |
| `docs/moduleaudit/` | [README](../moduleaudit/README.md) index + [00](../moduleaudit/00-systems-design.md), [01](../moduleaudit/01-matter-proceeding-classification.md), [02](../moduleaudit/02-research-studio.md)–[15](../moduleaudit/15-storage-mail-contacts-identity.md) | The per-module inventories and maturity verdicts; the probes; the strangler plan with migration paths and the A-01..A-15 acceptance suite; the procedural-rules ontology; the cross-module rules; the module-only findings of §3 |

Everything else — every finding, every rule, every migration step, every acceptance test — stays with its owning document. This report owns only the combination and the fork.

---

*Prepared for the owner's discussion. No code was changed by either series. The next act is a decision, not another document: pick the road in §6.1, and the corresponding plan (six strangler phases or twelve build phases) already exists in full.*

# OpenAdvo planning — the summary

Status: **self-contained** (2026-11-20). This document restates everything it contains. No other document is needed to read it. It is the compressed record of a full planning session: what was assessed, what failed, what is planned, the modules, the repository structure, the discipline and the verdict.

## 1. What was assessed

**The application.** A local-first Electron desktop workbench for Indian litigation, in TypeScript: a React renderer behind a 357-function IPC bridge; an embedded agent runtime (Pi) in the main process; `node:sqlite` storage in four databases (one per matter, plus advocate, court-intelligence and law-corpus stores); content-addressed document blobs; OCR through Tesseract and an ONNX second engine; a vendored Euro-Office document editor; 21 practice packs; 3 court adapters (Supreme Court, Delhi High Court, Delhi district); 140+ agent skills; hash-chained append-only audit logs in every store.

**The method.** Two independent evidence passes over the whole codebase — 216 source files, a computed import graph over every import statement, git churn analysis over ~500 commits, behavioural probes against the production classifier and pack selector, per-module feature inventories, and the test suite actually run (422 tests: 419 pass, 0 fail, 3 skipped). Code was the only evidence; documentation was treated as claims.

**What is strong — verified, and worth keeping.**

- Documents: write-once content-addressed blobs, re-hashed on every read, origins recorded, pages and line anchors created only by ingest, integrity checks that mark but never delete.
- Evidence and facts: evidence records copy the source's hash; facts carry explicit statuses (candidate, confirmed, disputed, rejected, superseded); acceptance, rejection and supersession are human-only store operations, asserted by tests in fifteen-plus files.
- Audit: hash-chained, append-only events in all four stores, with refused writes in their own append-only table and verification exposed per store.
- Filing: a signed manifest (SHA-256 per file, Ed25519 signature), and the two-confirmation gate — both confirmations are human-only and bound to the payload hash.
- Agent permissions: a native policy engine with fixed denials the policy file cannot loosen, credential-path denials, one-at-a-time approval cards, and a ten-minute timeout that refuses unanswered background calls.
- Adapters: pure data with host allowlists, tolerant quote verification, versioned lists and freshness checks — no code runs from an adapter.
- The renderer: zero direct file or database access; every write goes through the bridge.
- Product safety: no CAPTCHA solving, no stored court passwords, no bulk scraping.

**Where each capability stands today.**

| Capability | Verdict | In one line |
|---|---|---|
| Matter management | Implemented, broad | Real records, but also the only container — everything hangs off it |
| Proceeding management | **Emergent — a label, not an entity** | One TEXT field on a one-row profile; one proceeding per matter |
| Matter classification | Partial, low-confidence | Keyword proposal, circular input, unvalidated output |
| Document management | Implemented | Five formats only; one global ingest queue for all matters |
| Evidence management | Implemented, deep | Matter-scoped; anchors unenforced outside one table |
| Procedural intelligence | **Emergent — no owner** | Three rule sources (pack, adapter, stage list) act as law |
| Legal research | Implemented, deep | Corpus coverage partial; provenance library exists but is unwired |
| Drafting | Implemented | 67 document kinds; templates are code; drafts are matter-level |
| Filing | Implemented, strong integrity | The pack/adapter is the law; the filing set has no idempotency key |
| Workflow | **Fragmented** | Two models, four stores, no resume |
| Permissions | Strong for one advocate | Default allow; corrupt policy file fails open; confidential flag stored but not enforced |
| Audit and provenance | Strong on writes | Decisions (classification, pack, rule) are not audited; provenance not surfaced |
| Agent runtime | Implemented, deep | One ~3,100-line file with fifteen-plus responsibilities and 87 tools |
| Court adapters | Framework implemented | Three courts; the adapter is used as a legal source |

## 2. What failed

**The three root patterns.** First, *unowned concepts*: things the product names — a proceeding, a capability, a recovery state, a named operation — never got a code home, so each feature attached its meaning wherever it landed. Second, *unenforced claims*: rules that were true when written and had nothing keeping them true — a green suite ran the whole time while every boundary drifted. Third, *accretion without a gate*: work with no owner lands in the widest-known file. The churn proves it: the five most-modified files in the repository are exactly the wiring layer — the entry point (56 modifications), the IPC contract file (51), the agent file (50), the preload (41), the matter-store index (33).

**The failures, each with its decisive fact.**

1. **No proceeding record.** A matter holds one proceeding as one TEXT field; the case number, diary number and stage are free text. One matter cannot hold a suit, an appeal and an SLP. The diary number exists only inside an event's JSON.
2. **SLP occupies the generic names.** The SLP pack is the data-level default ("no proceeding chooses a pack, so the default SLP pack applies"); the generic draft kind `petition` renders SLP text; every petition gets the SLP prayer check; the agent prompt says "the SLP pack". Comments claiming "no SLP constant in the core" sit beside code that imports SLP generators.
3. **Procedural rules have three owners, none a rule record.** Packs carry limitation and required documents; adapters carry limitation lists and required parts; a stage library carries lists by regex. Meanwhile the generic filing compliance names the Supreme Court registry for *every* court, and the court-format table contains exactly one court.
4. **The entry point is the application.** It constructs ~30 services, holds 23 mutable singletons, implements the agent's host callbacks inline, creates matters with business rules, selects filing packs, polls reminders and writes the firm agent's usage file directly.
5. **The bridge is a business layer.** It calls store methods directly, converts accepted arguments into draft paragraphs, fires triggers, injects chat instructions, and writes files. Its dependency on the entry point is a type-level cycle.
6. **The agent file is a god module.** One file owns sessions, the model runtime, every tool definition (87 tools), conversation persistence, plans, traces, costs, the system prompt with the Supreme Court AOR identity, and business operations inside tool handlers.
7. **Permission is declared ten times.** Separate allowlists for the matter agent, firm agent, plan tools, side questions, skills, plus the policy file, plus a hard start check that verifies each list only against itself. The built-in tool list is duplicated in two files that must be manually synced.
8. **The policy file fails open.** A corrupted or unreadable policy returns allow-by-default; only the in-code fixed denials survive. The hook fails closed — two answers to one question in the same file.
9. **The actor is an unverified string.** Human-only checks trust a caller-supplied label; the bridge hard-codes "advocate" for everything from the window; nothing authenticates the claim.
10. **Court sessions cross matters.** One portal window, one shared cookie partition, one mutable current-matter field; a download files into whichever matter is current when it starts. Agent browser tabs are globally reachable.
11. **Anchors are free text everywhere except one table.** A fact, a document part, a record cell or a memory note can cite an anchor that does not exist; the agent's fact tool silently drops a missing anchor. Only Notebook events enforce the reference.
12. **No run recovery.** Zero checkpoint code exists. A failed workflow ends; a crashed run renders "running" forever; its usage record is lost; trace writes are best-effort.
13. **Contracts exist in three hand-synced copies** (the typed interface, the invoke strings, the handler strings); the tab vocabulary disagrees across three files (15, 10, 9 tabs); the chat state is held twice with two duplicated reducers.
14. **Four readiness gates can disagree** (draft gate, filing blockers, progress stages, inbox blocks), and **two services write authorities** with different duplicate checks. Two different things are both called "matter memory".
15. **Hot paths are global or O(n).** One ingest queue chain serves every matter — a large PDF in one matter blocks ingestion in every other; the docket opens every matter store.
16. **Idempotency is uneven.** Triggers fire again on every repeated event; a repeated filing approval creates a second set; a repeated case-list import can create duplicate matters.
17. **Classification is circular and unvalidated.** It reads its own previous output as input; it proposes display-name courts the filing layer rejects; its probes prove order-dependent, court-blind, default-driven selection — an unknown matter becomes SLP, and "first appeal" classifies as criminal because "first" contains "fir".
18. **Edges nobody audited.** Email is an attachment pipe (the message body never becomes a record); contacts live in an unaudited JSON file; schema migration is ad-hoc in one store and absent in three; case status is described in docs and missing in code; redaction is a mark on the original, not a new source.
19. **Nothing enforces a boundary.** No import-boundary test, no contract-divergence test, no capability-coherence test, no fail-closed policy test. The review mechanism was prose; the doc layer accumulated fourteen internal contradictions while every phase reported success.

**Why none of it was caught.** The suite is green and genuinely good — but it proves behaviour, never structure. Reviews were conducted by the same sessions that wrote the code and the claims. Nothing compares a claim with the code after the session that wrote both has ended.

## 3. What is planned

**The shape.** A modular monolith — one codebase, one process — with five kinds of code, each exactly one thing:

- **Domain rules** (pure, no framework imports): eleven bounded domains.
- **Application coordination**: named operations ("register a document", "accept a fact", "prepare a filing set") that compose domains, enforce permissions, open transactions and emit audit — the single composition point every interface calls.
- **A shared foundation**: ids, actor and scope values, typed references, the hash-chain mechanism, capability metadata. Types and one mechanism; zero business rules.
- **Infrastructure**: SQLite stores, blobs, OCR, PDF, model providers, browser, court portal, court adapters, search indexes — implementing ports, never calling domains unprompted.
- **Delivery interfaces**: a CLI, the desktop UI, and agent tool views — all three calling the same named operations, owning no logic.

**The modules.**

| Module | Owns |
|---|---|
| Advocate | Identity, profile, bar enrolment, preferences (single advocate first; ids ready for more) |
| Matter | Matters, clients, instructions, parties, lifecycle, assignments, related-matter links |
| Proceedings | The missing record: proceedings with typed court and case type, case and diary numbers, stage, hearings, orders, connected proceedings — one matter holds many |
| Courts | The directory, benches, case types, stage and limitation rules as versioned, sourced, freshness-checked data |
| Documents | Registration, versions, pages and anchors, processing state, derived representations |
| Evidence | Evidence records, provenance, integrity, authenticity, relations — the *status* of sources |
| Factual Record | Facts with origins and statuses, acceptance decisions, contradictions, the timeline — acceptance is an explicit decision record |
| Research | Authorities, judgments, statutes with versions, citations and verification, propose-only practice memory |
| Drafting | Drafts, revisions, templates as pack data, validation results |
| Filing | Filing sets, compliance results, the two confirmations, submission records — submission is human-only, always |
| Work | Tasks, deadlines, review items, the cross-matter inbox as a derived view |

Workflow execution (run states, gates, a start-up reconciler) and the agent seam live in application coordination; neither owns a legal record.

**The key contracts.** A proceeding carries `courtId`, `caseType`, `caseNumber`, `diaryNumber`, `stage` — typed, one per proceeding. A fact carries an origin (extracted, proposed, instruction, admission, judicial-finding) and typed, validated sources; acceptance writes a decision record with actor, time and reason. A capability declares scope and access class — read, propose, execute, human-only — and per-session tool lists are *derived* from one catalog, never restated. An adapter declares capabilities, hosts, sources, format checks and limitations; it declares no law and cannot submit anything. A workflow run has states and restarts from its last completed step, with committed operations detected by their records. The agent engine sits behind one interface: it owns turns, streams and execution checkpoints; it never owns records, prompts or authority.

**The decisions the owner has already made.**

1. Trust model: documented in-process trust (one advocate at the keyboard; the threat model written down, extensions trusted by declaration).
2. Single advocate first; organisation tables deferred, ids additive.
3. Per-matter folders kept; the rewrite starts empty — no data migration; documents re-import by hash.
4. **Separate legal and agent checkpointers**: the legal checkpointer is the record itself plus run states with a start-up reconciler; the agent checkpointer holds execution state only; the two never share a format.
5. Runtime family directed to LangChain / DeepAgents in TypeScript — verified live: LangGraph.js 1.7.5 and the deepagents 1.17.0 TypeScript port both exist, both MIT, both maintained. The plan adopts the **engine** (LangGraph.js: durable execution, native approval interrupts, a local SQLite checkpointer) behind the owned interface, and rejects the **harness** (deepagents ships filesystem tools and a "trust the LLM" posture — opposite to the fail-closed rules). Its planning and subagent patterns are adopted as catalog-backed tools. The current runtime (Pi) remains the fallback until the agent phase's exit test passes.
6. Submission is human-only; "submit" never appears on any agent surface.
7. Per-matter partitions for everything except the browser: the portal, downloads and every matter-acting context are isolated per matter; the built-in browser stays one shared surface with recorded guards (agent tabs carry their owning matter; downloads are recorded operations; filing sign-ins only via the portal; shared cookies untrusted for matter actions).
8. Content-assisted classification with one cited signal per field, validated before it can be applied.
9. The first vertical slice completes in the CLI: import → evidence → candidate facts → the advocate reviews and accepts in a terminal, on a real brief.

**The enforcement.** What makes this plan different from the current prose: boundaries are enforced by tests that run in CI — import-direction tests (domains import only the foundation and their ports; interfaces import only operations), contract-divergence tests (the IPC contract has one source; preload and bridge copies are generated), capability-coherence tests (every tool resolves to a catalog entry; human-only entries absent from agent surfaces), a fail-closed policy test that corrupts the policy source, cross-matter scope tests, and recovery-state tests that kill a run mid-step. Green means behaviour *and* structure.

**The CLI.** One command per operation, human output by default, `--json` for machines, stable error codes, explicit confirmation for reserved actions: `matter create/open`, `proceeding add`, `document import`, `evidence register`, `fact review/accept/dispute/reject/supersede`, `review decide`, `court list`, `intake classify`, `policy verify`, `agent ask`. Later phases append `draft`, `workflow`, `filing prepare/confirm` — with `submit` absent from every agent surface.

**The phases.** Twelve, each ending with the owner completing a real task on a real brief: (1) foundation, chain, catalog skeleton, structural tests; (2) matter + proceedings — a real matter with two proceedings in different courts; (3) documents + evidence — a real brief imported, every anchor resolving; (4) the factual record — the first slice exit, the owner reviews and accepts candidate facts via CLI; (5) courts, three adapters, content-assisted intake; (6) agent execution — the engine lands behind the seam, a killed run reconciles, the fallback runtime stays until the exit passes; (7) drafting — a **non-SLP** petition generated with zero core changes proves SLP is now mere configuration; (8) work and workflow recovery; (9) the desktop UI on the same operations; (10) filing with human-only submission and per-matter portal partitions; (11) research with verified citations. No empty folders: a module's folder appears with its phase's first commit.

**The fork, honestly stated.** A second, independent review of the same code reached the same findings and the same target model — and recommends a different road: a six-phase strangler *refactor* of the existing application (extract services behind the bridge, remove direct store access, land the same proceeding and procedure model by additive migration), keeping every working feature and the green suite intact. The plan above is the *greenfield* road: faster to the clean model, at the cost of the working surface until the slice lands and of existing matters staying in the old application. Both roads enforce the same discipline and reach the same destination; the runtime seam is identical either way. The choice between them is the one open strategic decision, and it is the owner's.

## 4. The planned repository structure

```
src/
  foundation/                  ids, actor & scope, typed references, clock,
                               result envelope, the event chain, capability types
  domains/
    advocate/  matter/  proceedings/  courts/  documents/  evidence/
    facts/     research/  drafting/  filing/  work/
                               (each: records, rules, ports, store, queries, tests)
  application/
    operations/                one file per named operation; *.schema.ts = the contract source
    catalog/                   capability declarations assembled; derived subsets
    policy/                    fail-closed tool policy
    scope/                     actor and scope construction
    intake/                    content-assisted classifier
    workflows/                 run states, gates, the reconciler
    agent/                     the execution interface; the engine adapter
  interfaces/
    cli/                       commands, output, confirmations
    desktop/                   electron main, generated preload, renderer
    agent/                     tool views over the catalog
  infrastructure/
    stores/  blobs/  ocr/  pdf/  llm/  browser/  court-portal/  court-adapters/  search/
tools/
  gen-contracts.ts             generates preload + bridge + the API surface from one source
tests/
  unit/  structural/  e2e/
```

Import rules, all tested: the foundation imports nothing above it; a domain imports the foundation and itself only; interfaces import application coordination only; infrastructure implements ports and never calls a domain unprompted; no file imports Electron outside the desktop interface; no file imports the agent framework outside the agent seam and the model-provider layer; cycles — including type-only cycles — are failures. Ordinary folders in one package; nothing becomes a separate package until a second consumer exists.

## 5. The discipline

The rules any future coding agent follows, each enforceable by a test:

1. The process entry assembles; it owns no operation and no state.
2. Every action is a named operation; every interface routes to it; a decision computed in an interface is a defect.
3. A domain imports the foundation and itself only; it never writes another domain's tables; it reads others through their query ports.
4. The foundation holds types and the chain — a business rule in it is a defect.
5. Every concept the product names gets a record with one owner; a workflow artefact never takes a generic name.
6. Court-specific behaviour enters the core only as declared adapter data; a code branch or prompt line naming a court is a defect.
7. Capabilities and permissions are declared once; subsets derive; two copies of one allowlist are a defect.
8. Human-only capabilities never appear on an agent surface.
9. Authority is constructed by the boundary, not supplied by the caller; the trust model is written down.
10. Unreadable or invalid policy is deny, with a visible error, proven by a test that corrupts the source.
11. References are typed and validated by the target's owner at write time; free-text anchors are defects.
12. Originals are write-once and re-hashed on read; derived data is labelled and reproducible.
13. Every write appends a chained event; acceptance is an explicit decision record; supersede, never overwrite.
14. Long-running work has defined states and a start-up reconciler; the agent checkpointer holds execution state only.
15. Each contract has one source; generated copies; a divergence test fails on drift.
16. One operation serves every surface: a second implementation of an operation is a defect.
17. Every command is idempotent or documents why it is not.
18. **Unknown is a valid result** — a resolver returns unresolved with the missing information, never the closest match.
19. Every legal decision is audited with actor, time, reason, source and version.
20. The structural suite stays green: green means behaviour *and* structure; a red structural test is never deleted to proceed.

## 6. The verdict

**Adopt with limitations.** The plan is the smallest coherent architecture that satisfies every failure's missing rule: eleven owned domains, one thin foundation, one capability catalog, one contract source, one seam for the engine, and a test suite that fails the moment any of it drifts. The twelve required product scenarios all walk through it cleanly.

The limitations, each an owner's deliberate choice, carried openly: single advocate first (the several-advocates scenario is structurally ready but unvalidated by use); no data migration (existing matters stay in the old application; documents re-import by hash); the new engine is unproven until the agent phase's exit test (the current runtime stays as fallback); the shared browser surface keeps shared cookies, bounded by recorded guards; the owner's early real-brief exits happen in a terminal; classification waits on document extraction before a new matter can be identified.

The one decision still open is the road — refactor the existing application into this shape, or build it greenfield as planned. Both reach the same destination drawn twice, independently, by two reviews that agreed on everything else.

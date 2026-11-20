# Rewrite alternatives — Stage 5: comparisons for the open forks

Status: **proposed, not accepted**. For each fork that materially shapes the architecture, this file gives a **preferred** choice, a **viable alternative** (with the condition under which it would become the right choice), and the **rejected** options with reasons. The rules R-1 to R-17 ([failures.md](failures.md)) are the acceptance criteria: a preferred choice must satisfy every rule it touches. Where a fork depends on an owner decision, the decision id (**DQ-n**) is marked and the preferred choice is the default, never a fait accompli.

## A1. Domain layout

**Preferred.** The eleven domains of [boundaries.md](boundaries.md) §3, in a modular monolith: one codebase, one process, one writer module per table.

**Viable alternative.** Fewer domains: merge Documents + Evidence + Factual Record into one "Records" domain, and Proceedings into Matter. This is legitimate *if* the first vertical slice shows the boundaries costing more than they carry — three extra seams on one path. The trigger to merge would be measured friction in the slice, not discomfort with the count. The map is designed so this merge is cheap: the three domains already communicate only through typed references and ports.

**Rejected.**
- *Microservices.* The assignment forbids them; nothing in the product needs a second process boundary, and the audit shows the failure was ownership, not distribution.
- *A giant kernel.* One `kernel.ts` owning matter, courts, facts and filing reproduces `index.ts` with a new name (F-1).
- *A kernel per practice area.* The assignment rejects it; the audit confirms practice areas are already well-served as pack data (`packs/`, 21 files), and kernels per area would multiply every table SLP already occupies (F-5).
- *Domains per interface (a "CLI domain", a "UI domain").* Inverts the dependency direction; recreates F-2.

## A2. The shared foundation

**Preferred.** The thin foundation of boundaries §4: ids, actor and scope values, typed references, time and versioning, result types, the event-chain mechanism, capability metadata types. Zero business rules.

**Viable alternative.** No foundation at all: each domain self-contains its ids, chains and error types. This works while there are two domains; it fails at four, and the audit's F-17 shows what happens then — the first writer becomes everyone's dependency by accident (the chain currently lives in the matter store, `store-chain/index.ts:7`).

**Rejected.**
- *A rich kernel with shared business rules* ("a FactValidator everyone calls", "a MatterScope service"). The assignment rejects the giant kernel; the audit shows shared business code is where ownership goes to die (F-17, and the current `shared/api.ts` at 51 modifications — a shared file is a hot file).
- *Foundation as a package with versions.* Premature packaging; a folder with import-boundary tests is enough (rule 18: no generic plugin machinery).

## A3. Storage shape

**Preferred** *(default of DQ-3, part 1)*. Per-matter folders with per-matter stores, plus application-level stores (advocate, courts, corpus), one writer module per table, chains from the foundation.

**Viable alternative.** One database, all matters as rows. Right if cross-matter queries become a first-class product surface (firm-wide search across matters) — but the assignment forbids cross-matter fact retrieval as a safety rule, which removes most of the motive.

**Rejected.**
- *A database per domain* (eleven stores). New authorities without proven need; the assignment forbids it, and the audit found four stores already carry real costs (shared mechanisms with no owner, F-17; `LawStore` with no verify path).
- *Keeping the current "one class writes the whole store" rule.* Verified false as stated (11 runtime callers, audit 4.7). The honest evolution is per-table ownership inside a modular monolith.

## A4. Capability and permission enforcement

**Preferred.** One capability catalog assembled at start-up from domain declarations (id, input, output, scope, access class: read / propose / execute / human-only, risk, side effects), enforced by application coordination before any operation runs. Per-session and per-skill subsets are *derived*, never restated. Fail-closed applies to the whole path: unreadable or invalid policy is deny (R-10), and a missing capability declaration is a start-up failure.

**Viable alternative.** No catalog: each operation hard-checks its own permission, plus a coherence test that scans for drift. Lighter at first, but it is the current pattern with one more test — the audit shows ten restated allowlists already defeat this approach silently (F-9).

**Rejected.**
- *The agent framework's own permission layer as the enforcement point.* The framework must be replaceable (assignment); enforcement inside it couples law to the runtime (F-3).
- *Prompt-level isolation* ("tell the agent which matter it is in"). The assignment rejects it outright; the audit shows matter isolation is already enforced properly only where code enforces it (RAG tests pass, portal does not, F-12).
- *A generic plugin platform for capabilities.* Rule 18; the catalog is a typed list plus derivations, not a plugin system.

## A5. The Factual Record's placement

**Preferred.** Its own domain: facts, review states, a dedicated `fact_decision` record, contradictions, the timeline (boundaries §3 row 7).

**Viable alternative.** Inside Evidence, as today (`evidence.ts:34-54`). One fewer boundary on the hottest path; the acceptance decision already lives beside evidence records and works. This becomes the right choice if the slice shows the fact/evidence seam being crossed for nearly every operation — but then the audit's unowned-concept pattern has merely been renamed, and F-11 (actor trust on the acceptance path) stays inside a domain that also owns hashes.

**Rejected.**
- *Inside Matter.* The current state, where facts, evidence and events sit under the matter's single profile row — the collapse F-5 diagnoses.
- *A boolean or single `accepted` flag.* The assignment rejects it; the audit shows the state machine already exists and is worth keeping (`FACT_STATUSES`, `evidence.ts:34-54`).

## A6. Proceedings' placement

**Preferred.** Its own domain, referenced from Matter: one matter holds zero or more proceedings; each proceeding names one court and its case type from the Courts domain.

**Viable alternative.** An aggregate inside the Matter domain — a `proceeding` table owned by the Matter module. Defensible because a proceeding rarely exists without its matter; this is the right choice if the first release is strictly single-proceeding-per-matter in practice. It carries a real risk: the aggregate boundary is exactly what collapsed into one TEXT field today (`practice.ts:40`), and the audit's F-5 shows the collapse happened *because* the owning module was the matter itself.

**Rejected.**
- *Proceeding as a field on the matter* (current). Verified failure.
- *Proceeding as a workflow configuration only.* Half of the truth: workflows need configuration, courts need records; only records survive audits.

## A7. Agent runtime strategy

**Status after round one (2026-11-20).** The owner answered DQ-5 with a direction rather than one of the two offered options: **"LANGCHAIN DEEPAGENTS TS JS"**. The engine is to be chosen from the LangChain family (LangGraph) and DeepAgents in TypeScript/JavaScript. This overturns the standing default (keep Pi), which now becomes the fallback.

**Preferred (owner-directed, pending verification).** Select the engine from LangGraph.js and any maintained DeepAgents TS/JS variant, behind the OpenAdvo-owned execution interface. The runtime deliverable (stage 6) verifies live, before commitment: which DeepAgents variant exists for TS/JS (the original is a Python project — a TS/JS port must be confirmed with version, licence and maintenance), LangGraph.js's current state, and each candidate against the interface requirements: local operation, streaming, tool calling, checkpoint model, dependency footprint, replacement cost. The comparison must also state honestly what the chosen family earns over the working fallback — a migration justified by feature count alone is exactly what the assignment forbids.

**Viable alternatives.**
- *A custom thin runtime* — still viable, and becomes the preference if the verification finds no maintained DeepAgents TS/JS variant and LangGraph.js's checkpoint model couples execution too deeply for the owned interface.
- *Pi as fallback* — embedded, tested, pinned, verified working by the audit. No longer the preference; the safety net if the directed candidates fail the interface requirements.

**Non-negotiable in every case.** OpenAdvo owns operations, records, approvals and the capability catalog; the framework owns execution only. A framework's checkpoint or session formats may hold execution state, never legal records. Chat content is never the record. If a framework checkpointer is adopted (which also changes DQ-4's cost), the coupling is declared and bounded. A second runtime is not built to copy features.

**Rejected.**
- *Any runtime as harness that also owns legal records or approvals.* Failure F-3's mechanism exists in every framework; the interface above is the guard.
- *Two runtimes.*
- *Selection by feature count.* The assignment's rule; the deliverable must show the problem the directed family solves that the fallback does not — or say so plainly if it does not.

## A8. The enforcement mechanism

**Preferred.** Checks that run with the tests: import-boundary tests (domains import only foundation and ports; interfaces import only application coordination; infrastructure imports no domain), contract tests (one source; generated or divergence-checked copies: R-13), capability-coherence tests (every catalog entry resolves to an operation; every agent tool resolves to a catalog entry), and a fail-closed policy test that corrupts the policy source. This is R-15 made concrete.

**Viable alternative.** Lint rules only (`no-restricted-imports`). Cheaper to set up, weaker in court: it cannot check contracts, coherence or fail-closed behaviour, and the audit found the current lint config enforces nothing structural (`.oxlintrc.json:17-35`).

**Rejected.**
- *Prose enforcement.* The current mechanism; the audit's fourteen doc drifts and the green-while-eroding suite are its measured outcome (F-14, F-15).
- *Code review as the boundary.* The repo's reviews are agent sessions; the audit shows the reviewer wrote the drift (failures doc §4).

## A9. Build order

**Preferred.** The assignment's own order, affirmed with one honest exception: domain contracts and rules → application services → CLI → agent interface → desktop UI → workflows and external adapters. The exception is **DQ-9**: the first slice's *owner exit* may need a minimal review pane, because lesson L3 requires the owner to complete a real task, and a terminal may not be a realistic review experience for a lawyer. If the owner chooses CLI-only exits, the order stands exactly as the assignment states.

**Viable alternative.** A thin desktop shell immediately after the first services (before the agent phase), driven by the same operations. Right if DQ-9 answers B; it front-loads the smallest possible UI (a review list and decision buttons on one pane) and nothing else.

**Rejected.**
- *UI-first.* Recreates F-4: the shell becomes the owner before the domains exist.
- *Agent-first.* Recreates F-3: the runtime becomes the application.
- *A CLI with its own logic.* Forbidden by the assignment; the audit's F-2 is what interface-owned logic becomes.

## A10. Documents and Evidence as two domains

**Preferred.** Two domains, as boundaries §3 rows 5 and 6: Documents owns bytes, versions, pages and derived representations; Evidence owns evidential status, provenance and relationships.

**Viable alternative.** One domain, two modules (a `records` domain with `documents` and `evidence` modules). One fewer seam; the boundary between "the file" and "what the file proves" stays as an internal line. Viable because the two are the closest pair on the map; the reason it is not preferred is that the line between them is the *legal* line — original preservation versus evidential status — and the audit shows the current code already keeps it correctly (`evidence.ts:56-72` keeps them distinct in one file). A boundary the code already believes in costs little and protects much.

**Rejected.**
- *One blob-centric domain where every file is evidence.* Collapses the distinction the assignment requires ("a court order, client affidavit, email, photograph and OCR result must not automatically have the same evidential status").
- *Documents as infrastructure (just an fs service).* Loses registration, versions and classification as records; the audit found the current source model (`source` rows plus blobs, re-hash on read) worth keeping.

## Summary

| Fork | Preferred | Alternative | Rejected (headline reasons) |
|---|---|---|---|
| A1 layout | Eleven domains, modular monolith | Merge the records trio if the slice shows friction | Microservices; giant kernel; per-practice kernels; per-interface domains |
| A2 foundation | Thin contracts + chain + metadata | Self-contained domains (fails by four domains) | Rich kernel; versioned package |
| A3 storage | Per-matter stores + app stores, per-table owners — **confirmed by round one (DQ-3: keep per-matter folders, start empty)** | One database if firm-wide search becomes a product rule | A database per domain; the false one-caller rule |
| A4 capabilities | One catalog, derived subsets, app-layer enforcement | Per-operation checks + coherence test | Framework-managed permissions; prompt isolation; plugin platform |
| A5 facts | Own domain | Inside Evidence if the seam never pays | Inside Matter; a boolean |
| A6 proceedings | Own domain | Aggregate in Matter if single-proceeding practice is proven | A field on the matter; config-only |
| A7 runtime | Owner-directed (DQ-5): LangGraph.js / DeepAgents TS/JS behind the owned interface, pending live verification | Custom thin loop if no maintained DeepAgents TS/JS exists; Pi as working fallback | Any runtime owning records or approvals; two runtimes; feature-count selection |
| A8 enforcement | Boundary + contract + coherence + fail-closed tests | Lint only | Prose; review-as-boundary |
| A9 order | CLI-first per the assignment — **confirmed by round one (DQ-9: CLI-only slice exit)** | Minimal review pane if the real-brief exit shows friction | UI-first; agent-first; CLI with own logic |
| A10 records | Documents and Evidence apart | One domain, two modules | Blob-centric; documents as plain fs |

Stage 6 — the full architecture plan (deliverables C, D, F, G, H, I) — starts when the round-one decisions (DQ-1, DQ-2, DQ-3, DQ-5, DQ-9) are answered. Every preferred choice above is a default until then; any overturned default changes the plan visibly, not silently.

# Rewrite boundaries — Stage 3: proposed domain ownership

Status: **proposed, not accepted**. This is the first architecture content in the rewrite series. Nothing here is decided until the owner accepts it. Every proposal is grounded in [audit.md](audit.md) (verified facts) and [failures.md](failures.md) (rules R-1 to R-17); where a choice depends on an open owner decision, it is marked **DQ-n** and the decision is owned by [decisions.md](decisions.md), Stage 4.

This file owns the proposed domain map (deliverable B of the assignment): the domains, what each owns, the shared foundation, the five kinds of code, dependency direction, and write ownership.

## 1. The five kinds of code

The assignment requires the difference between five things to be explicit. In the rewrite, every piece of code is exactly one of them.

| Kind | What it is | Examples | May call |
|---|---|---|---|
| **Domain rules** | The rules and records of one bounded area of legal work. Pure code: no Electron, no agent framework, no fs side effects beyond its own store port. | Matter lifecycle; fact acceptance; proceeding stages; draft validation; limitation computation | The shared foundation; its own store port |
| **Application coordination** | Named operations that compose domains, enforce permissions, open transactions, emit audit. One operation, one name, one owner. | "Register a document"; "accept a fact"; "prepare a filing set"; "run a workflow step" | Domain rules; the capability catalog; infrastructure through ports |
| **Shared technical contracts** | Types and mechanisms every domain needs; zero business rules. | Ids, actor and scope tokens, typed references, result types, the hash-chain mechanism | Nothing |
| **Infrastructure** | Adapters to the world: filesystem, SQLite, OCR, PDF, LLM providers, browser automation, court portals, search index. | Blob store; OCR pipeline; portal driver; corpus fetchers | Whatever a port declares; never domain rules directly |
| **Agent execution** | The runtime that turns model output into operation calls. Owns sessions, streams, traces. | Turn loop; tool dispatch; approval cards; checkpoint of *execution* | Application coordination only, through the capability catalog |

The current system's `index.ts`, `bridge.ts` and `agent.ts` each mix all five (audit 4.1 to 4.3). The split above is what rules R-1, R-2 and R-3 demand.

## 2. Challenge of the candidate domain list

The assignment proposed ten candidate domains (A to J). This section challenges each before accepting it. Verdicts are tied to audit evidence, not preference.

| Candidate | Verdict | Reason (evidence) |
|---|---|---|
| A. Advocate and Organisation | **Accept, trimmed.** Advocate identity, profile, bar enrolment, preferences stay. Matter assignments and access relationships move to the Matter domain — they are facts about a matter, not about the advocate. Chambers, teams and roles are deferred to the identity stub pending **DQ-2** (multi-advocate scope). Practice areas are configuration, not domain code (the assignment's own instruction; the current `packs/` model is sound). | The current advocate store is a grab bag — profile, memory, library, workflows, triggers, integrations in one schema (`advocate-store/index.ts:27-133`). Trimming it is the fix for that. |
| B. Matter Management | **Accept.** The matter is the advocate's work record: client, instructions, parties, lifecycle, matter metadata, related-matter links, assignments. | F-5: the matter today is also the proceeding, the court case and the SLP workflow. Splitting those out is the point of this domain. |
| C. Proceedings | **Accept as a separate domain.** A proceeding is a case in a court: case and diary numbers, parties of record, stage, hearings, orders, judgments, connected proceedings. One matter holds zero or more proceedings. | F-5: the proceeding has no record today (`practice.ts:35-47`). This is the single largest data-model failure in the audit. The assignment states the requirement: one matter, several proceedings. |
| D. Courts and Court Adapters | **Split in two.** A *Courts* domain owns court identity: the directory, benches, case types, stage and limitation rules, forms and fees — versioned, sourced data. *Court adapters* are infrastructure: they declare capabilities and fetch data; they never own legal records or filing authority (the assignment's own rule). | The adapter-as-data model is a verified strength (audit 6.7). The failure F-7 is that court specifics leak into code beside it. The split makes the data path the only path. |
| E. Documents | **Accept.** Document identity, original registration, versions, page and anchor records, processing state, document classification, derived-representation records. | Preserving originals is a stated requirement; blobs and re-hash on read are a verified strength (`index.ts:608-613`). |
| F. Evidence | **Accept, separate from Documents.** Evidence records, source relationships, provenance, integrity status, authenticity and admissibility states, verification state. A file is not an evidence record (audit 4.8). | The distinction already exists in code and works (`evidence.ts:56-72`). It must become a boundary, not a habit. |
| G. Factual Record | **Accept as a separate domain.** Facts, review states (candidate, accepted, disputed, rejected, superseded), acceptance decisions, contradictions, the factual timeline. | The assignment asked to investigate. Arguments in section 2.1. |
| H. Research and Legal Knowledge | **Accept.** Authorities, judgments, statutes, propositions, citations and their verification, research queries and collections, reusable practice knowledge — including the advocate's own practice memory, which moves here from the current advocate store. | Research outputs must not auto-become accepted propositions (assignment). That rule needs an owner: this domain. |
| I. Drafting | **Accept.** Drafts, sections, revisions, templates, citation references, validation results, review status. | The drafting library is already plain and tested. Its failure is only the SLP hard-wiring (`drafts.ts:436-455`), which R-5 and R-7 remove. |
| J. Work Management and Workflows | **Split in two.** *Work Management* is a domain: tasks, deadlines, review items, work queues. *Workflow execution* is application coordination: it sequences operations, records run state, and owns no domain record (the assignment's rule 14). | F-16: run state today has no recovery model. Giving execution state a named owner (application coordination) is the fix. |
| *(new)* Filing Preparation | **Add as a domain.** Filing sets, compliance check results, the two confirmations, submission records. | Not on the assignment's candidate list, but the two-confirmation gate is a human-authority record (`portal.ts:245-275`) and needs an owner. Placing it in Proceedings or Work would bury either the authority record or the work record. |

**Explicitly not domains:** SLP (a proceeding type and a pack of templates — R-5); practice areas (packs and configuration); the capability registry (a shared technical contract, section 5); permissions (enforced in application coordination, not owned by a domain); agent chat (execution state only — it is never the legal record, current decision 7 restated as a rule).

### 2.1 Why the Factual Record is separate (the one the assignment asked to investigate)

Three reasons, from evidence:

1. **Different rule owner.** Evidence integrity is computational (hashes, chains). Fact acceptance is a human-authority decision with an auditable trail — the audit found it already half-built (`evidence.ts:353-390`) and found its authority resting on an unverified string (F-11). Two different rule owners belong in two domains.
2. **Different inputs.** Facts come from documents (via evidence), client instructions (via matter), orders and judgments (via proceedings), and admissions by parties. Evidence is only the first of those sources. A domain that owns "the statements the matter works from" must consume all of them.
3. **Different consumers.** Draft verification, chronology and arguments consume the accepted factual record, not evidence records. The consumer contract deserves a stable owner.

The cost of the split is one more boundary on the hottest path (document → evidence → fact). The first vertical slice crosses exactly this path, so the boundary is exercised immediately — it is not speculative (rule: no abstraction without a concrete use case). The alternative (facts inside Evidence) is recorded in [alternatives.md](alternatives.md) A5.

## 3. The domain ownership map

The table is the assignment's deliverable B. "Writes" names the store and the tables the domain owns; a domain writes only its own tables (R-1's store-level consequence; the current decision 4 evolves from "one caller per store" to "one owner per table", because multiple domains now legitimately share `matter.db`).

| Domain | Canonical records | Rules owned | Operations exposed (examples) | Depends on (read) | Explicitly does not own | Writes |
|---|---|---|---|---|---|---|
| **1. Advocate & Organisation** | Advocate identity, profile, bar enrolment, interaction preferences; chambers, teams, roles *(deferred, DQ-2)* | Who the advocates are; what they prefer; enrolment facts | `getAdvocate`, `setProfile`, `setPreference` | Foundation (actor type) | Matters, permissions, memory, the Knowledge Library | app store: `advocate`, `preference`, *(org tables when DQ-2 says so)* |
| **2. Matter** | Matters, clients, instructions, parties (as the advocate records them), matter lifecycle, related-matter links, matter assignments | Matter existence and lifecycle; what a matter may reference; assignment and access to a matter | `createMatter`, `recordInstruction`, `addParty`, `assignAdvocate`, `linkRelatedMatter` | Foundation; Advocate (identity only, via operations) | Proceedings, documents, facts — it references them, it does not hold them | per-matter store: `matter`, `client`, `instruction`, `party`, `matter_link`, `assignment` |
| **3. Proceedings** | Proceedings (each with court, case type, case and diary numbers), parties of record, stage, hearings, orders and judgments as procedural events, connected proceedings | One matter holds zero or more proceedings; a proceeding belongs to one court; stage transitions; case-number shapes per court data | `openProceeding`, `setCaseNumber`, `recordHearing`, `recordOrder`, `connectProceeding` | Matter (parent scope); Courts (directory data) | The matter's client or instructions; filings' content; facts | per-matter store: `proceeding`, `proceeding_party`, `hearing`, `procedural_event`, `proceeding_link` |
| **4. Courts** | The court directory, benches, case types, stage lists, limitation rules, fees and forms — versioned, sourced rows with freshness | Every court-specific fact arrives as declared, dated data; a row past its check interval is stale (current decision 16 kept) | `listCourts`, `courtOf`, `caseTypesOf`, `stageListOf`, `limitationOf` | Foundation; adapter-written data (the only writer of directory rows, fed by adapters) | Any matter or proceeding record; filing authority; any court-named code branch (R-7) | intel store: `court`, `bench`, `case_type`, `stage_list`, `limitation_rule`, `source` |
| **5. Documents** | Document registrations, versions, pages and lines (the anchor targets), processing state, document classification, derived-representation records (OCR text, conversions) | Originals are preserved and never replaced; derived data is reproducible and labelled; anchors are created by ingest and are write-once | `registerFile`, `registerVersion`, `recordPages`, `anchorOf`, `recordOcr`, `classifyDocument` | Foundation; Infrastructure via ports (blob store, OCR) | Evidence records; facts; anything about a document's *evidential* status | per-matter store: `document`, `document_version`, `page`, `anchor`, `ocr_reading`, `processing_state` |
| **6. Evidence** | Evidence records, source relationships, provenance, integrity status, authenticity and admissibility states, verification state | A file is not an evidence record; the chain names the bytes (hash copied at registration); anchors are validated against Documents at write time (R-6) | `registerEvidence`, `relateSources`, `setAuthenticity`, `verificationStateOf` | Documents (anchor validation); Foundation | Facts; document bytes; proceeding records | per-matter store: `evidence`, `source_relation`, `evidence_status` |
| **7. Factual Record** | Facts with review states, acceptance decisions (a dedicated decision record), contradiction records, the factual timeline | Only the advocate accepts; a model extraction, a person's proposal, an admission and a judicial finding are distinct states; acceptance is explicit, authorised, auditable; supersession keeps history | `proposeFact`, `acceptFact`, `disputeFact`, `rejectFact`, `supersedeFact`, `recordContradiction` | Evidence and Documents (typed references, validated); Matter (scope); Proceedings (orders as fact sources) | Evidence records; anchors (it references them through Evidence/Documents) | per-matter store: `fact`, `fact_decision`, `fact_contradiction` |
| **8. Research & Knowledge** | Authorities, judgments corpus, statutes and versions, propositions, citations, research queries and collections, advocate practice memory | A research result is never an accepted proposition; citation verification states; statutes are dated and in-force-checked; practice memory is propose-only | `searchAuthorities`, `verifyCitation`, `recordProposition` *(propose-only)*, `saveJudgment` *(registers a document via Documents)*, `recordPracticeMemory` *(propose-only)* | Documents (saves become documents); Foundation; Infrastructure (fetchers) | Facts; any matter record (it is queried *from* a matter scope, it never writes one) | corpus store: `statute_*`, `judgment_*`, `proposition`, `citation`, `practice_memory`; app store: collections |
| **9. Drafting** | Drafts, sections, revisions, templates, citation references, validation results, review status | Draft templates are data (packs); a draft references facts, evidence and authorities without copying them into a competing store (the assignment's rule); validation owns its defect list | `createDraft`, `saveRevision`, `applyTemplate`, `validateDraft`, `decideDraftReview` | Factual Record (references); Research (authorities); Proceedings (impugned data); Documents (outputs) | The facts or authorities themselves; filing confirmations | per-matter store: `draft`, `revision`, `draft_validation`; template data in packs |
| **10. Filing Preparation** | Filing sets, compliance check results, the two confirmations, submission records | Preparation and submission are separate operations; submission requires both human confirmations bound to the payload; adapters never submit on their own | `prepareFilingSet`, `runComplianceChecks`, `confirmFiling` *(human-only)*, `recordSubmission` | Proceedings (target); Documents and Drafting (set contents); Courts (fees, limitation, checklist data); Work (queue) | Portal driving (that is infrastructure); draft content | per-matter store: `filing_set`, `filing_check`, `filing_confirmation`, `submission` |
| **11. Work Management** | Tasks, deadlines, review items, work queues (matter-scoped), hearing-calendar work | Every agent proposal becomes a review item; deadlines are computed from rules data, never invented; the review inbox is a derived cross-matter view, rebuildable | `openTask`, `queueReviewItem`, `decideReviewItem`, `listDeadlines` | Foundation; reads any record through its owning domain's query operations | The record a review item points at; workflow run state | per-matter store: `task`, `deadline`, `review_item`; the cross-matter inbox is a read model, never written directly |

**Application coordination (not a domain):** `RegisterDocument`, `AcceptFact`, `PrepareFiling`, `SubmitFiling` *(human-only step)*, `RunWorkflowStep`, and every other named operation. It enforces capability, permission and scope (R-9, R-11), opens transactions, and appends audit events through the owning domain. **Workflow execution** (run state, recovery per R-16) and **agent execution** (sessions, traces) are also here; both own no legal record.

## 4. The shared foundation

What genuinely belongs to every domain, and nothing else (the assignment's section 4, and rule R-17 against the current state where the matter store owns the chain for everyone):

| Concept | Content | Satisfies |
|---|---|---|
| **Ids** | Stable id generation (`<kind>-<uuid>`); no meaning in ids | R-5 |
| **Actor and scope** | `Actor` (advocate \| agent \| system \| helper, plus session identity) and `Scope` (advocate, matter, proceeding, session) as *values passed in* — the authority boundary lives in application coordination, which constructs them, not in strings callers invent (R-11) | R-11, F-11 |
| **Typed references** | `AnchorRef`, `CitationRef`, `EventRef`, `DocumentRef` — each resolvable through its owning domain; free text is never an interchange format | R-6, R-8 |
| **Time and versioning** | A clock port; `recordedAt`; supersedes-links; row versions | R-16 |
| **Result and error types** | One result envelope; typed error codes per domain (`MATTER_…`, `FACT_…`); no stringly failures | R-8 |
| **The event chain** | Hash-chain append, verify, refusal records — the mechanism the audit found sound, moved to the foundation so no store imports another store's plumbing | R-17 |
| **Capability metadata** | The *types* for declaring operations (id, input, output, scope, access class, risk, side effects). The declarations live in domains; a catalog assembles them at start-up | R-9 |

**Not in the foundation:** any business rule, any store schema, any legal vocabulary, any orchestrator. The test of admission: if two domains would disagree about it, it is not foundation material.

**The capability catalog** (assignment section 7): one canonical registry, assembled at start-up from domain declarations. It serves agent tool registration, permission checks, tool discovery, workflow validation, audit and documentation. It is a shared technical contract — the catalog stores declarations; application coordination *enforces* them. Access classes: read, propose, execute, human-only. The current ten allowlists collapse into per-domain declarations plus derivations (F-9's fix at the structural level).

## 5. Dependency direction

```
                     ┌─────────────────────────────┐
                     │   Delivery interfaces        │
                     │   CLI · Desktop UI · Agent    │
                     └──────────────┬───────────────┘
                                    │ calls only
                     ┌──────────────▼───────────────┐
                     │   Application coordination    │
                     │   named operations · capability│
                     │   enforcement · transactions  │
                     │   workflow & agent execution │
                     └──────────────┬───────────────┘
                                    │ composes
        ┌───────────┬───────────┬───┴──────────┬────────────┐
        │           │           │              │            │
   ┌────▼───┐ ┌────▼───┐ ┌────▼────┐    ┌─────▼────┐ ┌────▼─────┐
   │ Matter │ │Courts  │ │Documents│ …  │  Filing   │ │  Work    │
   │ Proc-  │ │        │ │Evidence │    │          │ │ Mgmt     │
   │ eedings│ │        │ │Facts    │    │          │ │          │
   └────┬───┘ └────┬───┘ └────┬────┘    └─────┬────┘ └────┬─────┘
        │           │           │              │            │
        └───────────┴───────────┴──────┬───────┴────────────┘
                                       │ types only
                          ┌────────────▼─────────────┐
                          │   Shared foundation      │
                          └────────────┬─────────────┘
                                       │ implemented by
                          ┌────────────▼─────────────┐
                          │   Infrastructure          │
                          │ SQLite · blobs · OCR · LLM │
                          │ browser · court adapters  │
                          └───────────────────────────┘
```

Rules, each enforced by a test (R-15):

1. A domain imports the foundation, and nothing else that is not its own code. No Electron, no agent framework — a strength the audit verified in the current `src/lib` (audit 6.2); it stays.
2. A domain never imports another domain. It reads through the other's query operations, passed in as ports. It never writes another domain's tables.
3. Interfaces import application coordination only. A renderer that computes a legal rule is a defect (F-2).
4. Agent execution imports the catalog and application coordination. It never sees a domain or a store. Chat content is execution state; the legal record lives in domains (the assignment's rule, and current decision 7 kept).
5. Infrastructure implements ports that domains declare. Court adapters write directory data through the Courts domain; they hold no legal record (R-7's mechanism).
6. Import-boundary and contract-divergence tests run in CI. Green means behaviour *and* structure (R-15).

## 6. Write ownership across stores

The current four-store split mostly survives, with the ownership restated per table, because the audit found the stores sound (audit 6) and the assignment warns against new databases without proven need. **DQ-3** (Stage 4) owns the one open fork: per-matter folders versus one database, and whether existing matter data migrates.

| Store | Written by (table owner) | Notes |
|---|---|---|
| Per-matter store (`matter.db` in the matter folder) | Matter, Proceedings, Documents, Evidence, Factual Record, Drafting, Filing, Work Management — each its own tables only | The matter folder stays a portable, archivable unit (current product property, `repo-map.md:66`). The chain mechanism comes from the foundation. |
| Application store | Advocate & Organisation; Work Management's cross-matter read model is derived, not written | One writer module per table. |
| Courts store (`intel.db`) | Courts only, fed by adapters | Versioned, sourced, freshness-checked (current decision 16 kept). |
| Corpus store (`corpus.db`) | Research & Knowledge only | Rebuildable derived parts (FTS, vectors) own nothing. Its chain gets a verify path — the audit found none (`LawStore`, audit 4.7). |
| Blobs | Documents, through the blob port; write-once by hash | Originals preserved; re-hash on read (verified strength, audit 6.3). |

## 7. What the first vertical slice touches

The assignment's candidate slice is Matter → Proceeding → Document import → Evidence registration → OCR → Candidate facts → Advocate review → Accepted factual record. That crosses six owners: Matter, Proceedings, Documents, Evidence, Factual Record, and the foundation — plus one operation each and one CLI command each. The other domains exist as folders only when their phase starts (lesson L1: no empty folders for imagined futures). The slice's owner-exit surface is **DQ-9** (Stage 4): whether the advocate's review step is CLI-only for the first exit, or waits for a minimal review UI.

## 8. How the rules map onto this map

| Rules | Where they land |
|---|---|
| R-1, R-2, R-3, R-4 | The five kinds of code (section 1); application coordination as the only composition point |
| R-5 | Proceedings and Courts as domains; SLP and practice areas as configuration |
| R-6, R-8 | Typed references in the foundation; anchor validation in Documents, consumed by Evidence and Facts |
| R-7 | Courts as the only route for court data; adapters as infrastructure |
| R-9 | The capability catalog, assembled from domain declarations |
| R-10, R-11 | Enforcement in application coordination; actor and scope as constructed values |
| R-12 | Matter-scoped sessions in infrastructure, declared and guarded (shape pending **DQ-7**) |
| R-13, R-15 | Contract sources and boundary tests |
| R-14 | This document and its successors carry status lines; claims about code are generated or tested |
| R-16 | Workflow execution owns run state with recovery; agents keep checkpointed *execution* state only |
| R-17 | The chain and other shared mechanisms in the foundation |

## 9. What Stage 3 does not decide

The eleven domains are a proposal. The open forks — storage shape, trust model, multi-advocate scope, runtime strategy, the slice's review surface — are in [decisions.md](decisions.md), with the comparisons in [alternatives.md](alternatives.md). Stage 6 (the full architecture plan) starts once the round-one decisions are answered; the answers are recorded in [decisions.md](decisions.md).

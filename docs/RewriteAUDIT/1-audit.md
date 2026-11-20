# Stage 1 — Verified Architecture Audit

| | |
|---|---|
| Status | Stage 1 of 4. Audit only. This file contains no target architecture. |
| Date | 20 November 2026 |
| Repository | `C:\dev\openadvo` |
| Commit | `e7ba7c1` on `main` |
| Code changed | None. This is a planning document. |
| Not read | `docs/rewrite/`. Also not read: the untracked files `docs/GeminiAUDIT/`, `docs/systems-design-report.md`, `docs/specs/new-matter-flow.md`, `docs/matter-intelligence-and-procedural-rules.md`. |

## How to read this report

Every statement carries one of these labels.

| Label | Meaning |
|---|---|
| **Verified** | I observed it in the code, tests, configuration or a command output at the commit above. |
| **Documented claim** | A repository document asserts it. It is not accepted architecture. It may be out of date or wrong. |
| **Owner requirement** | The rewrite assignment states it. It outranks the current code and the current documents. |
| **Proposed** | A design choice for a later stage. Not accepted. |
| **Unresolved** | The evidence is missing or the owner must decide. |

Two rules apply throughout.

1. A repository document is evidence of intent, not evidence of behaviour. When a document and the code disagree, the code is reported as current behaviour and the mismatch is listed in section 9.
2. A previous assistant proposal is not accepted architecture. This report does not rely on `docs/rewrite/`. Nothing in it should be read as approval of an earlier proposal.

---

## 1. The short answer

1. **The maintenance problem is not file size.** It is that one per-matter SQLite database holds **83 tables** and one main-process module holds the services for every domain. The unit of ownership is the matter folder, not a bounded domain. A smaller `agent.ts` with the same responsibilities would not fix this.
2. **There is no proceeding entity.** `matter_profile` is a singleton row with one court, one case type, one case number, one stage and one filing target. One matter cannot hold several proceedings.
3. **There is no court file.** Documents, evidence, hearings and parties are matter-wide. The same document cannot carry different court-file roles, such as Exhibit P-1 in the suit and Annexure A-3 in the appeal.
4. **The document, evidence and factual-record layers are conflated.** A document is a file's bytes (`source`). Evidence is a row over a file (`evidence`). Facts are spread across `fact`, `notebook_event`, `event_decision`, `memory`, `document_part` and `matter_edge`.
5. **Agent power is a name list, not a capability model.** There are **102** allowed tool names and at least **ten** separate tool lists. There is no single registry with owner, scope, risk, side effects and approval. The tool policy fails **open** on a corrupt or unknown policy file.
6. **Matter isolation is by convention.** IPC handlers accept a `matterId` from the renderer and open that matter. The portal and browser each keep one global "current matter" pointer. A download can land in the wrong matter.
7. **The filing gate has two verified weaknesses.** A submit control can be clicked through the generic portal click when it is not a native submit button. The submission-result lookup is capped at the newest 5,000 events, so an older submission can become invisible.
8. **The good parts are real.** Content-addressed original blobs, an append-only hash-chained event log, store-level human-only checks, quote-on-line validation, a hash-bound filing manifest, a general court directory and resumable skill runs are worth keeping.
9. **The product is described in two different scopes.** `package.json` says "for Supreme Court Advocates-on-Record". `README.md` says the code takes a Supreme Court matter to an SLP. `docs/product.md` says every Indian court and tribunal. The owner requirement for this rewrite is general litigation.

The rest of this document gives the evidence.

---

## 2. Repository facts

**Verified** from `package.json`, `electron.vite.config.ts`, `tsconfig.*.json`, the file tree and the test tree.

| Item | Value |
|---|---|
| Runtime | Electron `45.3.2`, Node `>=22.19.0` |
| Language | TypeScript `7.0.2`, strict |
| UI | React `19.3.1`, Astryx `0.7.15`, StyleX |
| Build | `electron-vite` `6.0.0` |
| Agent framework | `@earendil-works/pi-coding-agent` `1.5.2`, `@earendil-works/pi-ai` `1.5.2` |
| Local database | `node:sqlite` (`DatabaseSync`) |
| Documents | Euro-Office (vendored), `docx`, `pdf-lib`, `pdfjs-dist` |
| OCR | Tesseract.js, PP-OCR through ONNX Runtime |
| Tests | 87 unit test files, 29 Playwright specs, 4 workers |
| Commands | `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e` |
| Import direction | No `src/lib` to `src/main` import. No `src/main` to `src/renderer` import. No `src/shared` to `src/main` import. **Verified by search.** |

The assignment's line counts are accurate at this commit:

| File | Lines |
|---|---:|
| `src/main/agent.ts` | 3,270 |
| `src/main/index.ts` | 1,102 |
| `src/main/bridge.ts` | 1,314 |
| `src/renderer/src/App.tsx` | 798 |
| `src/preload/index.ts` | 421 |
| `src/shared/api.ts` | 937 |
| `src/lib/matter-store/index.ts` | 1,967 |

These files are symptoms. The causes are the boundaries described in section 5.

---

## 3. Runtime and dependency map

**Verified** from the imports and the registration code.

```
React renderer (sandboxed, no Node)
  │  calls named functions only
  ▼
preload/index.ts  (421 lines, ~350 methods on OpenAdvoApi)
  │  ipcRenderer.invoke(channel, ...)
  ▼
IPC layer  (344 handlers: 301 bridge + 23 harness + 20 intel, 75 channel prefixes)
  │  validates some arguments, calls main services and stores directly
  ▼
Main process services
  Matters · Agent · Ingest · Drafts · Research · Filing · Portal · Browser
  CourtIntel · Library · Progress · Contacts · AdvocateStore · IntelStore
  SkillRegistry · PracticePacks · Integrations · Mail · EditorHost
  │
  ├──► per-matter SQLite  matter.db  (83 tables) + blobs/<sha256>
  ├──► advocate.db  (profile, preferences, memory, library, workflows, agents, triggers)
  ├──► intel.db     (court packs, lists, benches, adapter proceedings)
  ├──► corpus.db    (statutes, judgments, vectors, citation checks)
  └──► userData JSON: settings.json, contacts.json, workflows.json,
                      matter-proposals.json, pi-agent/, integrations/
  │
  └──► Pi SDK sessions (chat, skills, helpers, plan, trace, usage)
```

Counts that matter:

| Measure | Count | Source |
|---|---:|---|
| IPC handlers | 344 | `handle("` in `bridge.ts`, `harness-bridge.ts`, `intel-bridge.ts` |
| IPC channel prefixes | 75 | same |
| `OpenAdvoApi` methods | ~350 | `src/shared/api.ts` |
| Agent tool names in `AGENT_TOOLS` | 102 | `src/main/agent.ts:89-192` |
| Inline `defineTool` calls in `agent.ts` | 79 | `src/main/agent.ts` |
| Tool-name lists used for permission or hints | 10+ | see F-11 |
| Tables in one `matter.db` | 83 | `src/lib/matter-store/*.ts` |
| JSON stores outside the audit chain | 4+ | settings, contacts, workflows, matter proposals |

The renderer is well contained at the process level: `contextIsolation`, `sandbox`, no Node integration, a CSP, and a trusted-sender check. The weakness is above that layer: the IPC surface is wide, and the application services behind it do not check who is asking or which matter the caller may see.

---

## 4. The legal model as implemented

**Verified** from the schemas. The table below is the central evidence for Stage 2.

| Concept | Where it lives now | Cardinality | What the model cannot express |
|---|---|---|---|
| Matter | `matter` table: id, title, created_at, schema_version | One row | No client, no lifecycle, no assignment, no scope |
| Matter profile | `matter_profile` with `CHECK (id = 1)` | One row per matter | One court, one case type, one proceeding, one stage, one case number, one CNR |
| Matter details | `matter_details` with `CHECK (id = 1)` | One row per matter | Duplicates `court`, `case_number`, `cnr` from the profile |
| Proceeding | `matter_profile.proceeding` (free text); `intel.proceeding` (adapter template); `classification.proceeding` (set equal to case type) | No entity | A proceeding with its own court, number, stage, hearings, orders and parties |
| Court | `matter_profile.court` (text); `intel.db` directory; adapter `courts[]` | Text | A stable court identity on the legal record |
| Court file | Absent | — | Registry identity, renumbering, filing series, as-filed roles, exhibit designations |
| Case number / CNR | `matter_profile` and `matter_details` | Duplicated | One number per proceeding, with history |
| Party | `party` in the matter, `contact_id` into `contacts.json` | Matter-wide | Parties as they appear in each proceeding; party position per proceeding |
| Hearing | `hearing` in the matter | Matter-wide | Hearings of one proceeding; a hearing shared by connected proceedings |
| Document | `source` (bytes) + `origin`; `page`, `anchor`, `ocr_reading` derived | Byte identity | Stable document identity across versions; the same document used in several proceedings |
| Evidence | `evidence` row over a `source` | Matter-wide | Oral or object evidence; authenticity, admissibility and inclusion as separate states; exhibit roles per court file |
| Fact | `fact`, `notebook_event`, `event_decision`, `memory`, `document_part`, `matter_edge` | Matter-wide, fragmented | A single factual record with origin, review, party position, judicial finding and history |
| Draft | `draft` + `revision` + `revision_approval` | Matter-wide | A draft that references facts, evidence and authorities without copying them |
| Filing | `filing_set` + `filing_confirmation` + `filing_target` (`id = 1`) | One target per matter | Filing preparation versus filing submission; a filing per proceeding and court file |
| Research | `legal_issue`, `authority`, `memorandum`, `citation_check`, `provision` | Matter-wide | Research results as candidates, distinct from accepted propositions |
| Work | `workflow_run`, `task_proposal`, `reminder` | Matter-wide | Workflow state with interruption and resume |

### 4.1 The per-matter database is the whole application

**Verified.** The unique table names in `src/lib/matter-store/*.ts` are:

`adverse_review`, `anchor`, `annexure`, `argument`, `argument_rejection`, `argument_run`, `authority`, `authority_assessment`, `capture`, `capture_browser`, `challenge`, `citation_attestation`, `citation_check`, `context_package`, `cross_question`, `date_anchor`, `date_conflict`, `defect`, `dissent`, `document_operation`, `document_part`, `document_part_layout`, `draft`, `draft_step`, `duplicate_pair`, `event`, `event_correction`, `event_decision`, `evidence`, `fact`, `filing_check`, `filing_confirmation`, `filing_set`, `filing_target`, `find_state`, `foreign_element`, `forum_clause`, `hearing`, `impact_check`, `ingest_job`, `jurisdiction_report`, `legal_issue`, `limitation`, `lod_row`, `matter`, `matter_details`, `matter_edge`, `matter_policy`, `matter_profile`, `memorandum`, `memory`, `memory_proposal`, `notebook_event`, `notebook_extract`, `ocr_dispute`, `ocr_reading`, `origin`, `outcome`, `page`, `page_mark`, `page_quality`, `paragraph_link`, `party`, `provision`, `record_cell`, `record_column`, `refusal`, `related_matter`, `reminder`, `research_plan`, `review_item`, `revision`, `revision_approval`, `revision_step`, `skill_run`, `source`, `source_analysis`, `source_relation`, `source_type`, `task_proposal`, `theory`, `treatment`, `workflow_run`.

This is not one domain with a few supporting tables. It is the schema of an entire litigation application in one file. The code comment says "the matter store is the single writer of matter facts". In practice it is the single writer of nearly everything.

### 4.2 Four singleton rows define the legal identity

**Verified.**

- `matter_profile` has `id INTEGER PRIMARY KEY CHECK (id = 1)` and holds `court`, `bench`, `practice_area`, `case_type`, `proceeding`, `side`, `case_number`, `cnr`, `filing_date`, `institution_date`, `governing_date`, `stage`, `relief`.
- `matter_details` has `id INTEGER PRIMARY KEY CHECK (id = 1)` and holds `petitioner`, `respondent`, `case_number`, `cnr`, `court`, `impugned_event_id`.
- `matter_policy` has `id INTEGER PRIMARY KEY CHECK (id = 1)`.
- `filing_target` has `id INTEGER PRIMARY KEY CHECK (id = 1)` and holds `court`, `case_type`, `list_key`, `adapter_id`.

A matter therefore has exactly one court case. The product document says the opposite: "One universal matter. Any court and any proceeding. Each proceeding has its own list of stages." That is a documented claim, contradicted by the schema.

### 4.3 "Proceeding" has four incompatible meanings

**Verified.**

| Meaning | Where | Example |
|---|---|---|
| Adapter process template | `intel.db.proceeding`, keyed by `(adapter_id, adapter_version, key)` | The Supreme Court adapter's `sc.slp_civil` template |
| Matter field | `matter_profile.proceeding` (free text) | `"SLP"` or `"Writ petition"` |
| Case type substitute | `classification/index.ts:68`: `proceeding` is the profile value, or the case type when the profile is empty | A bail application becomes a "proceeding" |
| Stage-list key | `stages/index.ts` maps `bail`, `quashing`, `writ`, `suit`, `appeal`, `revision`, `review`, `execution`, `arbitration`, `consumer` | A stage list is chosen by keyword |

The same word names a template, a field, a case type and a stage list. No code can answer "which proceeding is this document for?" because there is no proceeding to point at.

---

## 5. Findings

Each finding has verified evidence and an analysis. The code references and the observed behaviour are verified. The cause, the failed boundary and the category are my judgement from that evidence. The "why not caught" column is also a judgement, based on the tests and the review artefacts I could inspect.

Each finding states the evidence, the behaviour, the cause, the boundary that failed, the category, why the tests or review did not catch it, and the rule the rewrite must enforce. The rule is a constraint, not a design.

### F-01 — There is no proceeding entity; the matter is the court case

**Evidence.**
- `src/lib/matter-store/practice.ts:34-50`: `matter_profile` with `CHECK (id = 1)`, one `court`, one `case_type`, one `proceeding`, one `stage`, one `case_number`, one `cnr`.
- `src/lib/matter-store/work.ts:35-49`: `matter_details` with `CHECK (id = 1)`, a second `court`, `case_number` and `cnr`.
- `src/lib/matter-store/filing-checks.ts:11-17`: `filing_target` with `CHECK (id = 1)`.
- `party`, `hearing`, `evidence` and `fact` have no proceeding column.

**Behaviour.** Every legal record is attached to the matter, not to a court case. A second court case in the same engagement has no place to live.

**Cause.** Matter and court case were modelled as one thing.

**Failed boundary.** Matter versus Proceeding versus Court File.

**Category.** Data modelling and architecture.

**Why not caught.** Every fixture creates one matter with one court case. No unit or end-to-end test creates two proceedings in one matter. The UI exposes one profile page, so the missing entity is invisible in normal use.

**Rule the rewrite must enforce.** Any record that can differ by court case carries a proceeding id. No singleton row holds court, case number, case type, stage or filing target.

---

### F-02 — "Proceeding", "case type" and "stage" are confused

**Evidence.**
- `src/lib/classification/index.ts:68`: `const proceeding = input.profile.proceeding.trim() || caseType;`
- `src/lib/classification/index.ts:69-70`: `stageListFor(proceeding, caseType, ...)`; `stage = profile.stage || list.stages[0]`.
- `src/lib/stages/index.ts` maps `bail`, `quashing`, `writ`, `suit`, `appeal`, `revision`, `review`, `execution`, `arbitration`, `consumer` to stage lists.
- `src/lib/intel-store/packs.ts:68-77`: an adapter `proceeding` is a template keyed by adapter and version.

**Behaviour.** A case type (bail, writ, SLP) is promoted to a proceeding. A stage list is inferred from words. If no stage is known, the first stage is assigned. SLP is treated as a case type in one place and as a proceeding in another.

**Cause.** No ubiquitous language. Words were reused as fields.

**Failed boundary.** Proceeding versus Case Type versus Procedural Stage.

**Category.** Data modelling and domain language.

**Why not caught.** The classifier's output looks plausible and carries a `basis` array, so review sees a justified proposal, not a category error. Tests assert the returned strings, not the distinctions.

**Rule the rewrite must enforce.** One term, one entity. A case type is a court taxonomy value. A proceeding is a legal case. A stage is a recorded, dated, sourced value from a versioned stage list, never a default.

---

### F-03 — There is no court file, and no "as filed" role for documents or evidence

**Evidence.**
- No `court_file` table among the 83.
- `src/lib/matter-store/evidence.ts:56-72`: `evidence` has one `exhibit_number` string on the evidence row.
- `src/lib/matter-store/evidence.ts:85-95`: `source_relation` has `annexure_of`, `reply_to`, `certified_copy_of`, `version_of`, `related` — none is a court-file role.
- `src/lib/matter-store/filing-checks.ts`: `filing_target` and `filing_check` describe preparation, not the court's record.

**Behaviour.** The same judgment can be the impugned order in an appeal and an order in the trial proceeding, but it cannot carry two court-file roles. The same document cannot be Exhibit P-1 in the suit and Annexure A-3 in the appeal. A renumbered or transferred case cannot be represented.

**Cause.** The court's registry record was never modelled. Filing preparation was mistaken for the court file.

**Failed boundary.** Proceeding versus Court File versus Document.

**Category.** Data modelling.

**Why not caught.** The tests use one court file per matter. The filing tests check the prepared set, not the court's record.

**Rule the rewrite must enforce.** Court File is a separate record. It owns registry identifiers and "as filed" roles. It does not own the document or the evidence item.

---

### F-04 — Matter is not a client engagement

**Evidence.**
- `src/lib/matter-store/index.ts:59-64`: `matter` has only `id`, `title`, `created_at`, `schema_version`.
- `src/lib/matter-store/practice.ts:58-65`: `party.contact_id` points into `contacts.json`, with no foreign key and no cross-store integrity.
- `src/lib/contacts/index.ts:45-57`: contacts are deduplicated by name only. Two different people with the same name become one contact.
- `src/lib/matter-store/index.ts:291-292,308`: `archived` is a marker file. There is no `closed` state and no lifecycle transition.
- `src/main/index.ts:159-183`: `createMatterFromFields` creates contacts, parties, a profile and a hearing in one function.

**Behaviour.** A client is a contact with `kind: "client"`. A client with two matters has no stable client record in a canonical store. Matter lifecycle is "folder exists" or "archived marker exists". There is no conflict check, no engagement scope and no closure rule.

**Cause.** Matter was treated as a folder, not an engagement.

**Failed boundary.** Client identity versus Matter versus Party.

**Category.** Data modelling and missing domain.

**Why not caught.** Tests create matters with distinct names. No test creates two clients with the same name or one client with two matters.

**Rule the rewrite must enforce.** Client identity is stable across matters and is not keyed by name. A matter has an explicit lifecycle. A party is a role in a proceeding, not a contact record with a free-text role.

---

### F-05 — There is no advocate, organisation, membership, role or assignment model

**Evidence.**
- `src/lib/advocate-store/index.ts:26-31`: `profile` is a key/value table. One advocate per installation.
- `WriteContext.actor` is the string union `"advocate" | "agent" | "system"` (see `src/shared/records.ts`).
- `MatterStore.human()` checks `ctx.actor !== "advocate"` (`src/lib/matter-store/index.ts:748-750`). It does not identify the advocate.
- No table stores organisation, membership, role or matter assignment.

**Behaviour.** Every human write is attributed to the role "advocate". The audit cannot say which advocate decided. Several advocates cannot work on one matter with different permissions. The assignment's scenario "several advocates working on one matter" is not representable.

**Cause.** A single-user desktop assumption was allowed to become the domain model.

**Failed boundary.** Advocate and Organisation versus Matter assignment versus Access policy.

**Category.** Missing domain and audit.

**Why not caught.** Tests pass the literal `{ actor: "advocate" }`. The type system accepts it, so no test can distinguish one advocate from another.

**Rule the rewrite must enforce.** Every human decision records an actor id. Authorisation is evaluated per actor, per matter, per capability. A role label is not an identity.

---

### F-06 — A document is a file's bytes, not a legal document

**Evidence.**
- `src/lib/matter-store/index.ts:65-83`: `source` has `sha256`, `name`, `size`, `media_type`, `status`; `origin` has `original_name`, `original_path`, `provider`.
- `src/lib/matter-store/index.ts:105-140`: `ingest_job`, `page`, `anchor`, `ocr_reading` are derived from the bytes.
- `src/lib/matter-store/index.ts:206-227`: `draft` and `revision` are a separate document-like hierarchy.
- `source_relation` has `version_of`, but it is a proposed relation between two byte-identical identities, not a version chain.

**Behaviour.** A corrected court upload, a certified copy, a scanned copy and an OCR text are all separate `source` rows (or derived rows). There is no stable document identity across them. Evidence points at a `source_id`, so it points at bytes.

**Cause.** File storage was used as the document model.

**Failed boundary.** Document identity versus Document Version versus Representation versus Evidence.

**Category.** Data modelling.

**Why not caught.** Most tests add one file once. The duplicate test checks that identical bytes are stored once, which is correct for blobs but does not test document versions.

**Rule the rewrite must enforce.** Document identity is stable. Versions are immutable and append-only. Bytes and OCR are representations. Evidence points at a version and an anchor, not at a file name.

---

### F-07 — Evidence conflates authenticity, admissibility, inclusion and source type

**Evidence.**
- `src/lib/matter-store/evidence.ts:56-72`: `evidence` has `authenticity` in `candidate | authentic | disputed | rejected`, `admissibility` as free text, `status` in `candidate | confirmed | rejected`, and `source_id NOT NULL`.
- `src/shared/evidence.ts:3`: `FACT_TYPES` includes `admission`, `denial`, `inference`, `decision`.
- `src/shared/evidence.ts:33-54`: `EvidenceRecord` has one `status` field and one `authenticity` field.

**Behaviour.** A document can be authentic but inadmissible, or admissible but of disputed authenticity. The model cannot say both cleanly. Oral testimony and physical objects cannot be evidence without a source file. An opposing party's admission is a fact type, not a party position tied to a pleading.

**Cause.** One legal item was forced into one status enum.

**Failed boundary.** Evidence versus Factual Record.

**Category.** Domain modelling.

**Why not caught.** Tests set one status at a time. No test creates an authentic-but-inadmissible item or a non-document evidence item.

**Rule the rewrite must enforce.** Authenticity, admissibility and inclusion are independent states. Evidence can be a document, testimony, an object, an electronic record or an admission. A decision to include or exclude is human-only and audited.

---

### F-08 — The factual record is fragmented and its states are collapsed

**Evidence.**
- Fact-like records live in `fact` (`evidence.ts:34-54`), `notebook_event` (`index.ts:166-181`), `event_decision` (`index.ts:182-188`), `memory` (`evidence.ts:107-124`), `document_part` (`evidence.ts:73-83`), `matter_edge` (`evidence.ts:96-106`) and `date_conflict` (`index.ts:189-205`).
- `decideFact` (`evidence.ts:354-361`) updates `status` and `decided_at` in place. The only history is the hash-chained `event` row, which is not queryable as fact history.
- `addFact` (`evidence.ts:335-350`) sets `status = "candidate"` for agent and system, `"confirmed"` for the advocate. There is no `under_review` state.
- `FACT_TYPES` mixes `admission`, `denial`, `inference` and `decision` into one enum, while `FACT_STATUSES` mixes review state (`candidate`, `confirmed`, `disputed`, `rejected`, `superseded`) into another.

**Behaviour.** A model extraction, an advocate's working fact, an opposing party's admission and a court's finding are all `fact` rows with different `type` and `status` values. A court finding can be "confirmed" by the advocate, as if the advocate were the author of the finding. A contradiction is recomputed by a heuristic, not stored as a reviewed relation.

**Cause.** Epistemic origin, review state and legal effect were reduced to two enums.

**Failed boundary.** Factual Record versus Evidence versus Proceeding.

**Category.** Domain modelling.

**Why not caught.** The tests assert status transitions on one fact. No test creates a fact from a pleading and the same fact as a judicial finding, or checks that a finding cannot be rejected by the advocate.

**Rule the rewrite must enforce.** Origin, review state and legal effect are separate dimensions. A model extraction never becomes an accepted working fact without an explicit advocate decision. A judicial finding is recorded from an order with an anchor; it is not re-decided as if it were the advocate's fact.

---

### F-09 — Derived facts are not invalidated when the source changes

**Evidence.**
- `src/main/evidence.ts:33-35`: a source is skipped when `store.evidence.isAnalysed(source.id)` is true.
- `src/lib/matter-store/evidence.ts:608-614`: `isAnalysed` and `markAnalysed`; there is no unmark or invalidate method.
- `src/main/ingest.ts:43-71`: after ingest, the analysis runs once per source. `rebuildNotebook` re-runs the Notebook, not the fact extraction.

**Behaviour.** After an OCR correction, a corrected page, a new document version or a re-run with better extraction, the old candidate facts remain. The derived record cannot be rebuilt from the current source.

**Cause.** Derived data was stored as canonical data with no invalidation path.

**Failed boundary.** Document processing versus Factual Record.

**Category.** Implementation and data lifecycle.

**Why not caught.** Tests process a source once. No test corrects a page and re-runs extraction.

**Rule the rewrite must enforce.** Every derived record names the input version and the extractor version. A new input version invalidates or supersedes the derived record. Rebuild is a first-class operation.

---

### F-10 — The per-matter database is the real bounded context

**Evidence.**
- 83 unique tables in `src/lib/matter-store/*.ts`.
- One `MatterStore` class opens the database and composes `EvidenceStore`, `WorkStore`, `StudioStore` and other parts.
- Any module with the database handle can write any table. The "one writer" rule is a convention in comments, not an enforced boundary.

**Behaviour.** The folder is the unit of ownership. A change to evidence can touch a table that a change to filing also owns. There is no table ownership manifest.

**Cause.** Persistence was organised by file size and feature phase, not by domain.

**Failed boundary.** Domain ownership versus storage layout.

**Category.** Architecture.

**Why not caught.** There is no architecture test and no table ownership check. Code review sees a new table in the matter store as normal.

**Rule the rewrite must enforce.** Each table has one owning domain. No domain updates another domain's tables. Cross-domain transactions go through an application service. A table ownership manifest is tested.

---

### F-11 — Agent tools are duplicated across ten lists and lack capability metadata

**Evidence.**
- `AGENT_TOOLS` has 102 names (`src/main/agent.ts:89-192`).
- Separate lists: `FIRM_TOOLS` (`firm-agent.ts`), `PLAN_TOOLS` (`plan.ts`), `READ_MATTER_TOOLS`, `READ_LAW_TOOLS`, `NEVER_IN_A_SKILL`, `WRITING_TOOLS`, `ROLE_TABLE` (`src/lib/skills/roles.ts`), `READ_ONLY_TOOLS`, `SEQUENTIAL_TOOLS` (`src/main/agent.ts:710-720`).
- `policyTools()` adds MCP tool names and reads the policy file (`src/main/index.ts:520-536`).

**Behaviour.** Adding one tool requires edits in several lists. A tool can be in `AGENT_TOOLS` but not in a role, or in a role but not in the policy UI. No list states the domain owner, input/output schema, matter scope, risk, side effects or approval requirement.

**Cause.** Tool registration grew feature by feature. Permission was modelled as a name allowlist.

**Failed boundary.** Capability registry versus agent runtime versus policy.

**Category.** Architecture and missing policy.

**Why not caught.** Tests assert individual lists. No test asserts that the lists agree or that every registered tool has a capability record.

**Rule the rewrite must enforce.** One canonical capability registry. Every interface derives from it. A tool cannot exist without a capability record. A parity test fails on drift.

---

### F-12 — The tool policy fails open on a corrupt or unknown policy

**Evidence.**
- `src/main/tool-policy.ts:23`: `DEFAULT_POLICY = { default: "allow", tools: {} }`.
- `src/main/tool-policy.ts:130-136`: `read()` catches every read or parse error and returns `{ ...DEFAULT_POLICY, tools: {} }`.
- `src/main/tool-policy.ts:39-44`: `cleanPolicy` maps an invalid `default` value to `DEFAULT_POLICY.default`, which is `"allow"`.
- `tests/unit/tool-policy.test.ts:37` asserts that `{ default: "maybe", ... }` becomes `{ default: "allow", ... }`.
- `src/main/tool-policy.ts:270-276` fails closed only when the policy hook itself throws during a call.

**Behaviour.** Delete the policy file, corrupt it, or write an unknown default, and every tool is allowed. The test encodes this as correct. The repository decision document also says "allow by default" (`docs/decisions.md:42`).

**Cause.** The default was chosen for usability, before the security requirement existed.

**Failed boundary.** Policy versus capability risk.

**Category.** Missing policy and implementation.

**Why not caught.** The test asserts the fail-open result. Review reads the comment "bad values become the defaults" and accepts it.

**Rule the rewrite must enforce.** Missing, unreadable or invalid policy denies every capability above read. The default is deny. A policy schema is validated. A corrupt policy is a visible error, not a silent allow.

**Conflict to record.** This finding contradicts the repository's decision 23. The owner requirement in the rewrite assignment is "fail closed". The requirement wins.

---

### F-13 — Matter isolation is enforced by convention, not by the application

**Evidence.**
- `trusted(event)` checks the sender page origin only (`src/main/index.ts:191-195`).
- `handle()` passes arguments to the service with no actor or access check (`src/main/index.ts:197-207`).
- `Matters.store(matterId)` validates the UUID shape and opens the folder (`src/main/matters.ts:66-73`). It does not check that the caller may see the matter.
- IPC handlers take `matterId` from the renderer and hard-code `{ actor: "advocate" }`, for example `bridge.ts:739-741`.
- The agent is scoped by a closure over one `matterId`, but shared services such as `browser` and `portal` are not.

**Behaviour.** Any renderer code can read or write any matter by id. The audit cannot identify the human. A compromised renderer, an injected script in the editor frame, or a bug in one feature can cross matter boundaries.

**Cause.** The renderer was trusted as the only client, and the desktop was assumed to have one user.

**Failed boundary.** Application service versus IPC versus policy.

**Category.** Architecture and missing policy.

**Why not caught.** End-to-end tests use one matter at a time. There is no cross-matter access test.

**Rule the rewrite must enforce.** The application service resolves the active matter and checks actor access on every call. The renderer never supplies an unverified matter id. Cross-matter access is denied by the application, not by the prompt.

---

### F-14 — The portal and browser leak matter context

**Evidence.**
- `Portal` has one `private matterId` (`src/main/portal.ts:47`). `open()` sets it (`59-67`). The download handler reads `this.matterId` at download time (`114-137`).
- The portal uses one shared session partition, `persist:oa-portal` (`83`).
- `Browser` has one `private matterId` (`src/main/browser.ts:70`) and a shared advocate partition, `persist:oa-browser` (`24`). `setMatter()` changes it (`229-231`). Downloads use the current value (`367-373`).
- `browser_tabs` lists every tab, with no matter filter (`src/main/agent.ts:1761-1766`).
- `browser_download_to_matter` accepts any tab id and the current matter id (`1843-1847`).

**Behaviour.** Open matter A, then matter B. A download from A's page can be captured into B. An agent working in A can read a tab that was opened for B. The shared cookie jar means the advocate's court session is shared across matters.

**Cause.** The browser and portal were modelled as application-wide singletons, not as matter-scoped services.

**Failed boundary.** Matter scope versus browser session versus portal session.

**Category.** Architecture and data model.

**Why not caught.** The browser and portal tests use one matter. No test switches matters during a download.

**Rule the rewrite must enforce.** A browser tab and a portal session are bound to a matter and an actor. A download destination is the tab's matter, never a global "current matter". Tab listings are filtered by scope.

---

### F-15 — The filing submission gate can be bypassed, and its result lookup is capped

**Evidence.**
- `Portal.click` refuses only `BUTTON` with `type="submit"` and `INPUT` with `type="submit"` or `"image"` (`src/main/portal.ts:182-194`).
- `submitFiling(matterId, selector)` accepts any selector and calls `el.form.requestSubmit(el)` or `el.click()` (`243-263`). It does not check that the selector is a submit control, or that the page is a filing page.
- `resultState` scans `listEvents(5000)` (`218-229`). `listEvents` defaults to 500 and returns the newest rows first (`src/lib/matter-store/index.ts:1953-1957`).
- `confirmedSet` correctly checks both confirmations against the payload hash (`265-275`).
- The end-to-end test uses a native `#go` submit button and a small event log (`tests/e2e/steps6to10.spec.ts:301-324`).

**Behaviour.** A link, a `div` with a JavaScript submit handler, or a `button type="button"` wired to submit is clickable through `portal_click`. `submit_filing` can be pointed at a non-submit control and still records `filing.submitted`. On a matter with more than 5,000 events, an earlier submission can fall outside the window, so `resultState` returns "none" and a second submission may be allowed.

**Cause.** Submission was modelled as a generic click plus a selector string, not as a court-adapter operation with a declared control.

**Failed boundary.** Court adapter versus filing authority versus workflow.

**Category.** Implementation and missing policy.

**Why not caught.** The test portal has one native submit button and a short event history. No adversarial selector test exists. No test creates more than 5,000 events.

**Rule the rewrite must enforce.** Submission is a distinct operation on a court adapter with a declared submit control. A generic click never submits. The result lookup is by filing-set id, unbounded, and indexed. A second submission is blocked by the filing-set state, not by a recent-events window.

---

### F-16 — Business logic is duplicated between IPC and agent tools

**Evidence.**
- 344 IPC handlers: 301 in `bridge.ts`, 23 in `harness-bridge.ts`, 20 in `intel-bridge.ts`.
- About 350 methods on `OpenAdvoApi` (`src/shared/api.ts`) and a 421-line preload.
- `bridge.ts` handlers map arguments and call stores directly. Example: `evidence:addFact` (`719-737`), `evidence:decideFact` (`739-741`), `filing:confirm` (`642-645`).
- `agent.ts` implements the same operations again. Example: `propose_fact` (`1901-1917`) calls `host.evidence`, which is a switch in `src/main/index.ts:936-1005`.
- There is no test that the IPC path and the agent path produce the same result.

**Behaviour.** One operation has two implementations and two validation paths. A fix to one path can miss the other. Permission and audit are applied at different layers.

**Cause.** Each interface grew its own service logic. There is no application-service layer.

**Failed boundary.** Application operation versus delivery interface.

**Category.** Architecture.

**Why not caught.** Unit tests target stores. End-to-end tests exercise one path per feature. No parity test exists.

**Rule the rewrite must enforce.** One application operation per use case. IPC, CLI, agent tools and workflows are thin adapters over it. A parity test runs the same operation through at least two interfaces.

---

### F-17 — Classification is title-biased, precedence-ordered and invents a stage

**Evidence.**
- `src/lib/classification/index.ts:27`: the input text is `title + sourceNames + profile.proceeding + profile.court`, lower-cased.
- `src/lib/classification/index.ts:43-56`: an `if/else` chain. `writ` is tested before `slp`, so "SLP against a writ" becomes a writ petition. `bail` matches "regular bail" before a more specific type.
- `src/lib/classification/index.ts:58-66`: the court is taken from a file name. "supreme" becomes "Supreme Court of India"; "high" becomes the generic "High Court"; "district" becomes "District Court".
- `src/lib/classification/index.ts:68-70`: `proceeding = caseType`; `stage = profile.stage || list.stages[0]`.
- `src/lib/stages/index.ts`: `stageListFor` tests `writ` before `slp`, so an SLP arising from a writ gets the writ stage list. The fallback is `STAGE_LISTS.other`, and the classifier then takes its first stage.
- `MatterProposal` (`src/shared/work.ts`) has title, CNR, court, petitioner, respondent, stage, next date, reason and source matter. It lacks practice area, case type, proceeding, basis, source URL and confidence.
- `MatterProposals` is a JSON file (`src/main/matter-proposals.ts`), outside every hash chain.

**Behaviour.** A title or a file name can produce a confident-looking classification with a wrong court, a wrong case type and an invented stage. The proposal has no "unknown" value and no confidence. Its lifecycle is unaudited.

**Cause.** Classification was built as a text heuristic before the domain model existed.

**Failed boundary.** Classification versus Proceeding versus Court.

**Category.** Implementation, data model and contracts.

**Why not caught.** Tests assert the chosen labels for chosen titles. No test asserts that a title with no court yields "unknown", or that an SLP arising from a writ stays an SLP.

**Rule the rewrite must enforce.** Structured inputs come first. Every proposal can say "unknown". A stage is never defaulted. A proposal uses the same contract as the record it proposes, with a basis and a confidence, and its decisions are audited.

---

### F-18 — The agent framework is the application

**Evidence.**
- `src/main/agent.ts` is 3,270 lines. It imports Pi's `createAgentSession`, `SessionManager`, `ModelRuntime`, `defineTool` and other SDK types.
- It owns session lifecycle, model selection, conversations, policy, approvals, skills, helpers, plan, trace, usage, browser tools, portal tools and filing tools.
- There is no OpenAdvo-owned execution interface. The Pi types appear in host interfaces and tests.
- `src/main/index.ts` constructs the agent with a large host object that wires nearly every service (`794-1015`).

**Behaviour.** Replacing Pi means editing the largest file and the entry point. Testing the agent requires Pi fixtures. Crash, resume and checkpoint semantics are a mix of Pi behaviour and bespoke code.

**Cause.** The framework was adopted as the runtime and then allowed to define the application's shape.

**Failed boundary.** Agent execution versus application services versus framework adapter.

**Category.** Architecture.

**Why not caught.** The tests use the Pi test harness, so they validate the current coupling. No test replaces the runtime with a fake through a stable port.

**Rule the rewrite must enforce.** OpenAdvo owns an execution port: start, resume, cancel, approve, stream, snapshot. Pi is one adapter behind it. Legal state is never stored in the runtime.

---

### F-19 — Workflow recovery is missing, and "workflow" means two different things

**Evidence.**
- `src/main/workflow-runs.ts:29-87`: `executeWorkflow` always starts at the first step. The loop has no resume path.
- `workflow_run.state` allows `running | done | failed | stopped` (`src/lib/matter-store/index.ts:253-262`). There is no `interrupted`.
- If the process dies, the row stays `running` forever. No startup code scans for it.
- Skill runs do better: `markInterrupted` and `resume` exist (`src/main/skill-runner.ts:101-124`).
- `src/lib/workflows/index.ts` calls a text instruction a "workflow" (`BUILT_IN`, `parseCustom`). `src/lib/builders` calls an orchestration of skills a "workflow" (`checkWorkflow`, `WorkflowDefinition`).

**Behaviour.** A skill run can resume after a crash. A multi-step workflow cannot. The same word names a prompt template and an execution graph.

**Cause.** Two features were built at different times with the same name. Recovery was implemented for one and not the other.

**Failed boundary.** Workflow execution versus prompt template versus agent runtime.

**Category.** Implementation and domain language.

**Why not caught.** Workflow tests run to completion in one process. No test kills the process mid-run.

**Rule the rewrite must enforce.** Every long-running operation has a durable state, an owner and a resume or fail path. The two concepts get different names.

---

### F-20 — There are no architecture tests, and the error contract is inconsistent

**Evidence.**
- `.oxlintrc.json` has no restricted-import rule and no dependency-boundary rule.
- The 87 unit test files contain no architecture test. A search finds no test that asserts imports, table ownership or registry parity.
- Errors are thrown as `MatterStoreError` with a `code`, as `new Error("BAD_STEP: ...")` (`bridge.ts:643`), and as plain strings from agent tools.
- The scope statements conflict: `package.json` says "Supreme Court Advocates-on-Record"; `README.md:5` says the code takes a Supreme Court matter to an SLP; `docs/product.md` says every Indian court and tribunal; the assignment requires general litigation.

**Behaviour.** Drift is invisible until a feature breaks. CLI, UI and agent cannot branch on errors reliably. The product scope is ambiguous in the repository itself.

**Cause.** Boundaries were documented but not tested. Error codes were treated as messages.

**Failed boundary.** Architecture governance versus implementation; contract versus interface.

**Category.** Missing guardrail and contracts.

**Why not caught.** Tests assert behaviour, not structure. Lint checks syntax, not dependencies.

**Rule the rewrite must enforce.** Architecture tests run in CI: imports, table ownership, capability parity, no domain dependency on Electron, React or Pi. Every application error has a stable code and one envelope. One scope statement owns the product boundary.

---

### Smaller verified issues

These are not separate architectural failures, but they matter for the rewrite.

| Issue | Evidence | Consequence |
|---|---|---|
| Duplicate court and case identity | `matter_profile` and `matter_details` both store `court`, `case_number`, `cnr` | Two sources of the same truth can disagree |
| Related matters are mirrored by scanning every matter | `Matters.relatedFor` (`src/main/matters.ts:105-120`) | Incoming links are O(n) and can miss a locked matter |
| Refusals are best-effort and often not recorded | `recordRefusal` uses `args[0]` as the matter id and swallows errors (`src/main/index.ts:209-219`) | Many refused actions leave no audit row |
| Legal proposals live outside the audit chain | `matter-proposals.json`, `workflows.json`, `contacts.json` | A proposal or a contact can change without an event |
| Portal defaults are Supreme Court and e-Courts | `DEFAULT_PORTAL`, `DEFAULT_ORIGINS` (`src/main/portal.ts:17-18`) | The portal is SC-centric even though the product claims all courts |
| Agent tabs do not persist cookies, advocate tabs do | `oa-browser-agent-${randomUUID()}` vs `persist:oa-browser` (`src/main/browser.ts:24,141`) | Correct for isolation, but the advocate session is still shared across matters |
| `source` and `matter` cannot be deleted | Triggers in `src/lib/matter-store/index.ts:101-104` | Good for integrity; no retention story for closed matters |

---

## 6. What holds up and should be retained

These are verified strengths. They are candidates to keep, not a design.

| Strength | Evidence | Why it matters |
|---|---|---|
| Content-addressed original blobs | `putBlob` writes `blobs/<sha256>` atomically (`index.ts:595-605`) | Original bytes are never silently replaced |
| Origin ledger | `origin` records every import path, provider and actor (`index.ts:75-83`) | Provenance survives duplicate imports |
| Append-only hash-chained events | `appendEvent` chains `prev_hash` and `hash`; update and delete triggers (`index.ts:736-747`, `93-104`) | Tampering is detectable |
| Store-level human-only checks | `decideFact`, `updateEvidence`, `addHearing`, `recordOutcome`, `confirmFiling` | A careless caller cannot make a legal decision |
| Quote-on-line validation | `quoteOnLine` and `fillRecordCell` (`src/main/record-table.ts:16-18,78-90`) | A cell cannot cite words that are not on the named line |
| Filing manifest binding | Payload hash, two confirmations, file hash re-check, PDF/A conversion check (`portal.ts:196-275`, `filing.ts:390-470`) | The approved set is the set that would be uploaded |
| Court directory and adapter validation | `court-directory` data; `checkAdapter` validates hosts, sources, lists and proceedings | Courts are data, not hard-coded branches |
| Skill run interruption and resume | `markInterrupted`, `resume`, context package reuse (`skill-runner.ts:101-124`) | The pattern the workflow runner should follow |
| Security shell | `contextIsolation`, `sandbox`, no Node in renderer, CSP, trusted sender (`index.ts:261-267,191-195`) | The renderer is a client, not a shell |
| No `lib` to `main` import | Verified by search | The plain-library direction is real today |
| Test volume | 87 unit files, 29 end-to-end specs | There is a base to build on |

---

## 7. What should be discarded

This is a verdict list, not a design.

1. **The singleton matter profile as the legal identity.** One court, one case number, one stage and one filing target per matter cannot support the product.
2. **The file as the document.** `source` is a blob record. It cannot carry document identity, versions and court-file roles.
3. **The name-based tool permission model.** A list of tool names is not a capability model, and it drifts.
4. **The allow-by-default policy.** It fails open and contradicts the owner requirement.
5. **The global portal and browser matter pointer.** It leaks matter context.
6. **The 344-handler IPC surface and the 350-method preload.** They expose implementation, not application operations.
7. **Business logic inside `bridge.ts` and `agent.ts`.** One operation needs one implementation.
8. **JSON side stores for legal proposals, contacts and workflows.** They are unaudited parallel authorities.
9. **The two meanings of "workflow".** A prompt template is not an execution graph.
10. **Selector-driven filing submission.** Submission must be a declared adapter operation, not a click.
11. **Fact extraction without invalidation.** Derived records must name their inputs and be rebuildable.
12. **The claim that a repository document is architecture.** Documents describe intent. Code and tests describe behaviour. The rewrite must keep the difference visible.

---

## 8. Verification record

Commands run at `C:\dev\openadvo`:

| Command | Result |
|---|---|
| `git rev-parse --short HEAD` | `e7ba7c1` |
| `git branch --show-current` | `main` |
| `git status --porcelain` | Four untracked documentation paths. No code change by this audit. |
| `npm run typecheck` | Exit 0. Both `tsconfig.node.json` and `tsconfig.web.json` passed. |
| `npm run test:unit` | Passed: 422 tests, 419 passed, 0 failed, 3 skipped, about 61 seconds. |
| `npm run test:e2e` | Not run. End-to-end tests run once at the end of a phase, per `docs/agent-guide.md` section 8.4. |

No code was modified. No scaffolding was created. The only writes are the Stage 1 and Stage 2 reports.

The untracked files `docs/GeminiAUDIT/`, `docs/systems-design-report.md`, `docs/specs/new-matter-flow.md` and `docs/matter-intelligence-and-procedural-rules.md` were not read and are not used as evidence. `docs/rewrite/` was not read.

---

## 9. Documented claims versus verified behaviour

This table is the direct answer to the instruction "do not treat previous assistant proposals or docs or logs as accepted architecture". A claim is not a decision. A decision is not a behaviour.

| Claim | Source | Status | Verified behaviour | Consequence |
|---|---|---|---|---|
| "One universal matter. Any court and any proceeding. Each proceeding has its own list of stages." | `docs/product.md` section 1 | **Contradicted** | `matter_profile` is a singleton with one court, case type, proceeding and stage. There is no proceeding table. | The product promise cannot be kept without a data-model change |
| "One owner for each kind of information." | `docs/architecture.md` section 3 | **Partly true** | True at the store level (`matter.db`, `advocate.db`, `intel.db`, `corpus.db`). False inside `matter.db`: 83 tables and six fact-like stores. | Store ownership is not domain ownership |
| "The agent writes nothing directly. It proposes, and the advocate decides." | `docs/architecture.md` section 3 | **Partly true** | Decisions are human-only in the store. But `import_case_documents` writes sources, `rebuild_notebook` writes events, `save_judgment` writes the corpus, and `submit_filing` records a submission. | "Proposal" and "operation" are not separated |
| "A native policy decides every tool call ... allow by default." | `docs/decisions.md` decision 23 | **Implemented, conflicts with the owner requirement** | `DEFAULT_POLICY.default = "allow"`; a corrupt file returns the default | The rewrite requirement is fail closed; the current behaviour is fail open |
| "Court adapters prepare. They never submit." | `docs/decisions.md` decision 17 | **Contradicted in effect** | `portal.ts` exposes `submitFiling` as an agent tool, gated by two confirmations | The adapter/portal distinction does not hold at the capability level |
| "The code today takes a Supreme Court matter from the impugned judgment to a verified filing set for a Special Leave Petition." | `README.md:5` | **Verified** | The portal defaults to the Supreme Court and e-Courts; the filing pack core is SLP-shaped | The code is narrower than the product claim |
| "An agent-operated litigation workspace for Supreme Court Advocates-on-Record." | `package.json` description | **Verified as metadata, contradicted by the assignment** | The package description names one court and one role | The repository's own scope is ambiguous |
| "Derived indexes own nothing." | `docs/architecture.md` section 2 | **Mostly true** | FTS and vectors are rebuildable. But `fact` rows extracted by `analyzeMatter` are stored as canonical candidates with no invalidation. | Some derived data is treated as canonical |
| "A matter's facts never enter advocate scope." | `docs/architecture.md` section 6 | **Verified at the store boundary** | `AdvocateStore.proposeMemory` refuses `CROSS_MATTER_FACT` for non-advocate-scope types (`advocate-store/index.ts:297-300`) | This is a real strength |
| "Human-only actions are named functions on the preload bridge. They are never agent tools." | `docs/decisions.md` decision 5 | **Mostly true, with exceptions** | `submit_filing`, `import_case_documents` and `rebuild_notebook` are agent tools. The first is gated; the other two write records. | The line between a proposal and an operation is blurred |

**Conclusion for Stage 2.** The current documents cannot be used as the target architecture. They describe a broader product than the code implements, and at least one accepted decision (allow by default) conflicts with the rewrite requirement. The domain design must start from the owner requirement and the verified behaviour, not from the documents.

---

## 10. What remains unverified

These items could change the design. They are not settled by this audit.

1. **Runtime performance of 83 tables and per-matter databases.** I did not profile opening, searching or exporting a large matter. The design should measure before choosing a persistence layout.
2. **Crash behaviour of `node:sqlite` and WAL.** I did not kill the process during a write. The recovery rules need a test, not an assumption.
3. **Pi session file stability.** The code uses Pi's `SessionManager` as a checkpoint store. I did not verify that the file format is a stable contract across Pi versions.
4. **Multi-advocate requirement.** The assignment asks to evaluate it. The repository has no organisation model. Whether v1 needs real multi-advocate collaboration or only identity and assignment is an owner decision.
5. **Court file granularity.** Whether an interlocutory application is a proceeding or a court-file item is an owner decision. It changes the model.
6. **Client identity.** Whether a client is a separate aggregate or a contact with a role is an owner decision. It changes migration and access.
7. **Filing submission by the agent.** The assignment requires human approval but does not say the agent may submit. The current code allows it after two confirmations. The owner must decide the v1 boundary.
8. **The exact scope of "evidence".** Oral testimony, physical objects and admissions need a model. I did not find a requirement that settles whether they are first-class in v1.
9. **Data migration.** The current matter databases hold real work. A rewrite must either migrate or run beside the old data. I did not assess migration cost.
10. **The meaning of the passing tests.** The 422 tests pass, but several encode the current behaviour as correct. The policy test asserts fail-open, and the contacts test asserts one contact per name. A green suite is therefore not evidence that the current model is right.

---

## 11. Constraints the target design must satisfy

These are derived from the findings. They are constraints, not a design. Stage 2 must show how the domain model satisfies them.

1. **A matter can contain many proceedings, in different courts, at different stages.** No singleton legal identity.
2. **A proceeding can have a court file, and a court file can change without changing the legal claim.** Registry identity is separate from the proceeding.
3. **A document has identity across versions.** Bytes are representations. Evidence points at a version and an anchor.
4. **Evidence and facts are different records.** Authenticity, admissibility, inclusion and truth are different questions.
5. **A fact has an origin, a review state and a legal effect.** A model extraction cannot become an accepted fact without an advocate decision. A judicial finding is not the advocate's fact.
6. **One owner for each type of truth.** A table has one owning domain. No domain updates another domain's tables.
7. **One application operation, many interfaces.** CLI, IPC, agent tools and workflows call the same service.
8. **One capability registry.** Every agent tool, CLI command, UI action and workflow step derives from it.
9. **Policy fails closed.** Missing or invalid policy denies. Matter isolation is enforced by the application.
10. **Original documents are preserved.** Derived data names its inputs and can be rebuilt.
11. **Filing preparation and filing submission are separate.** Submission is a declared adapter operation with human approval.
12. **Every long-running operation has a durable state and a resume or fail path.**
13. **Architecture rules are tested.** Imports, table ownership, capability parity and interface parity.
14. **The agent runtime is replaceable.** OpenAdvo owns the execution port and the legal record.
15. **The product scope is general litigation.** No individual High Court or District Court is hard-coded in the core. SLP is a case type and workflow configuration, not the centre.

Stage 2 takes these constraints and settles the domain ownership and relationships.

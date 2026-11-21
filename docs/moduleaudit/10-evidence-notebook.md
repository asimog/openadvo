# Module report: evidence and Notebook

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: the Notebook events, facts, evidence records, contradictions, source relations, the matter edge graph, the record table, matter memory, the jurisdiction report, forum clauses and the timeline.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Notebook | `src/main/notebook.ts` | `notebook_event`, `event_decision`, `date_conflict` |
| Event correction and OCR disputes | `src/main/notebook.ts`, `src/lib/matter-store/notebook2.ts` | `event_correction`, `ocr_dispute` |
| Facts and evidence | `src/lib/matter-store/evidence.ts` | `fact`, `evidence`, `document_part`, `source_relation`, `matter_edge` |
| Analysis | `src/main/evidence.ts` | Runs detection and stores results |
| Analyzers | `src/lib/evidence/` | Contradictions, relations, structure, jurisdiction, timeline, templates |
| Record table | `src/main/record-table.ts` | `record_column`, `record_cell` |
| Memory | `src/lib/matter-store/evidence.ts` | `memory` |
| Jurisdiction | `src/lib/evidence/jurisdiction.ts` | `jurisdiction_report`, `forum_clause` |
| Timeline | `src/lib/evidence/timeline.ts` | Derived |
| UI | `src/renderer/src/Notebook.tsx`, `WorkspaceViews.tsx` | Events, facts, evidence, matrix, record table |

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Dated event extraction | Implemented | `findDates`, `notebook_event` | Explicit, inferred, range |
| Event decisions | Implemented | `event_decision` | Advocate only |
| Date conflicts | Implemented | `date_conflict` | Open until resolved |
| Event correction | Implemented | `event_correction` | Append-only correction |
| OCR dispute | Implemented | `ocr_dispute` | Two readings |
| Facts | Implemented | `fact` | Type, status, source, anchor, date, amount, parties, relief |
| Fact decisions | Implemented | `decideFact` | Candidate, confirmed, disputed, rejected |
| Fact supersede | Implemented | `supersedeFact` | Keeps history |
| Fact links | Implemented | `linkFact` | Issue, argument, relief |
| Evidence records | Implemented | `evidence` | Exhibit, witness, authenticity, admissibility |
| Document parts | Implemented | `document_part` | Title, parties, facts, grounds, prayer and more |
| Source relations | Implemented | `source_relation` | Annexure, reply, certified copy, version |
| Contradictions | Implemented | `detectContradictions` | Recomputed from facts and events |
| Matter edge graph | Implemented | `matter_edge` | Supports, contradicts, admits, denies, etc. |
| Record table | Implemented | `record_column`, `record_cell` | Quote on the named line |
| Matter memory | Implemented | `memory` | Proposed, confirmed, superseded |
| Jurisdiction report | Implemented | `jurisdiction_report` | One per matter |
| Forum clauses | Implemented | `forum_clause` | Exclusive, seat, venue |
| Timeline | Implemented | `buildTimeline` | Events and facts |
| Per-proceeding scope | Missing | No proceeding id | Matter-level |
| Element and burden matrix | Partial | `propose_elements`, theory | Not a full matrix |
| Privilege | Missing | No field | No legal privilege model |
| Fact corroboration | Partial | Edge graph | No explicit corroboration count |

## 3. Current flow

```text
Pages and anchors
  → notebook extraction
      → dated events (candidate)
      → date conflicts
  → evidence analysis
      → facts
      → evidence records
      → document parts
      → source relations
      → contradictions
      → matter edges
      → jurisdiction report
  → advocate decisions
      → confirmed events, facts and evidence
  → drafting and research
```

## 4. Problems

### E-01: Evidence is matter-scoped, not proceeding-scoped

**Evidence.** `notebook_event`, `fact`, `evidence`, `matter_edge` and `memory` have no `proceedingId`. `jurisdiction_report` is one row. The party table has no proceeding id.

**Effect.** A fact in the suit and a fact in the appeal share one pool. A bail application and a quashing petition cannot cite different facts and different evidence. A jurisdiction report for the appeal overwrites the report for the suit.

**Target.** `proceedingId` on events, facts, evidence and the jurisdiction report, with a link table for shared facts. A fact can support several proceedings; it is stored once and linked.

### E-02: Two extractors produce dated records

**Evidence.** `main/notebook.ts` extracts events from source lines. `main/evidence.ts` builds facts, parts, relations and contradictions from the same pages. `Drafts.check` recomputes contradictions and case numbers.

**Effect.** The same line can become an event and a fact with different dates. A draft can see a contradiction that the evidence tab does not, because it recomputed it.

**Target.** One `EvidenceService` owns extraction and contradiction detection. The Notebook is a view over events. `Drafts.check` asks for the current contradictions. No second computation.

### E-03: The contradiction lifecycle is split

**Evidence.** `detectContradictions` recomputes; `recordContradictions` opens review items; `Progress.inbox` sets `blocks` for a date conflict but not for every contradiction; `Drafts.check` filters by open review item.

**Effect.** A contradiction can be open in the data, closed in one view and blocking in another. The advocate cannot tell which contradictions are live.

**Target.** A `Contradiction` record with a status, a source pair, a decision and a scope. One lifecycle: open → reviewed (resolved, explained, accepted) → closed. The gate reads the status.

### E-04: The record table is a separate evidence system

**Evidence.** `record_column`, `record_cell`, `quoteOnLine` and `RecordTables` store answers per source and column. The cells are not linked to facts, events or issues.

**Effect.** The table can hold an answer that no fact records. A gap is reported, but the answer does not become evidence.

**Target.** A record cell can promote to a fact or an event, with the quote and anchor. The table is a reading tool over evidence, not a parallel record.

### E-05: No element and burden matrix

**Evidence.** `propose_elements` and theories exist. There is no table of issue → element → burden → evidence → witness → finding. `record_templates` offer columns but not a legal element model.

**Effect.** The advocate cannot see whether every element of the claim or offence is proved. The evidence graph has edges, but not the legal elements.

**Target.** `Element` and `ElementProof` records per issue: element, burden, standard, evidence, witness, finding, status. The evidence matrix and the draft check read them.

### E-06: No privilege or confidentiality model

**Evidence.** `fact` and `evidence` have no privilege flag. The matter has a confidential flag, which is not enforced. There is no legal professional privilege, without-prejudice or protected identity model beyond `victimProtected`.

**Effect.** A privileged document can be used in a draft or sent to a model. The victim protection is a separate string list.

**Target.** A `Sensitivity` record per source and per fact: privileged, without prejudice, protected identity, confidential. The draft check and the model context respect it. The advocate can override with a reason.

### E-07: Jurisdiction is a single free report

**Evidence.** `jurisdiction_report` is one row with `forum`, `courtType`, `territorialBasis`, `subjectBasis`, `provisions`, `alternativeForums`, `limitation`, `appealRoute`, `applicableRules`, `unresolvedFacts`, `undetermined`.

**Effect.** It cannot represent two proceedings with different forums. The report is a text record, not a set of assertions with sources.

**Target.** A `JurisdictionAssertion` per proceeding: basis kind, provision, facts, status, source. The report is a view over the assertions. The limitation is a separate rule-based computation.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `Event` | A dated event with source anchor, type and status |
| `Fact` | A statement with type, status, source, date, amount, parties |
| `Evidence` | An exhibit or statement with authenticity, admissibility and source |
| `DocumentPart` | A part of a document with an anchor |
| `Relation` | A link between sources or records |
| `Contradiction` | Two values that cannot both stand, with a status |
| `Element` | A legal element of an issue |
| `ElementProof` | The evidence and finding for one element |
| `JurisdictionAssertion` | A basis for a forum, with sources |
| `RecordCell` | One answer to one question for one source |
| `MemoryRecord` | A typed memory with a status and a scope |
| `Sensitivity` | Privilege, confidentiality, protected identity |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `EvidenceService` | Events, facts, evidence, parts, relations, contradictions, elements, jurisdiction, memory | `DocumentService`, `ProceedingService` |
| `RecordTableService` | Columns, cells, quote verification, promotion | `EvidenceService`, `DocumentService` |
| `TimelineService` | Derived timeline | `EvidenceService` |
| `SensitivityService` | Privilege and confidentiality | `MatterService`, `DocumentService` |

### 5.3 Contracts

```ts
interface EvidenceService {
  extract(matterId: string, sourceId: string): Promise<ExtractionResult>;
  events(matterId: string, filter?: EventFilter): Promise<Event[]>;
  decideEvent(eventId: string, decision: EventDecision): Promise<Event>;
  proposeFact(matterId: string, input: FactInput): Promise<Fact>;
  decideFact(factId: string, status: FactStatus): Promise<Fact>;
  evidence(matterId: string, filter?: EvidenceFilter): Promise<Evidence[]>;
  contradictions(matterId: string, scope?: Scope): Promise<Contradiction[]>;
  elements(issueId: string): Promise<Element[]>;
  jurisdiction(proceedingId: string): Promise<JurisdictionReport>;
  memory(matterId: string, filter?: MemoryFilter): Promise<MemoryRecord[]>;
}
```

### 5.4 The scope rule

An event, fact or evidence record has a `primaryProceedingId` and may have links to other proceedings. A query names a proceeding or asks for the matter view. A matter view is a read model, not a second set of records.

### 5.5 The contradiction rule

A contradiction is created when:

- two events give different dates for the same event;
- two facts give different values for the same subject and relation;
- a fact contradicts an admission or a document;
- a document part contradicts another part.

It has:

- `kind`;
- `a` and `b` with anchors;
- `status` (`open`, `resolved`, `explained`, `accepted`);
- `decision`, `reason`, `decidedBy`;
- `scope`.

One open contradiction blocks the draft that relies on either side. The gate reads the status, not a recomputation.

## 6. Boundaries

- `EvidenceService` owns events, facts, evidence and contradictions. It does not own documents or drafts.
- `DocumentService` owns pages and anchors. It does not decide what a fact is.
- `DraftingService` reads facts and contradictions. It does not recompute them.
- `ResearchService` reads issues and facts. It does not write evidence.
- `ProceedingService` owns the proceeding. Evidence links to it.

## 7. Migration

1. Add `proceedingId` to event, fact, evidence, contradiction and jurisdiction.
2. Move `Drafts.check` contradiction detection to `EvidenceService`.
3. Add `Element` and `ElementProof`.
4. Add `Sensitivity` and enforce it in context and draft checks.
5. Make record cells promotable to facts/events.
6. Replace the single jurisdiction report with assertions per proceeding.
7. Keep the Notebook as a view.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| EV-01 | One fact used in two proceedings | One record, two links |
| EV-02 | Two proceedings, two jurisdiction reports | Separate assertions |
| EV-03 | A contradiction in the evidence tab | The draft gate sees the same status |
| EV-04 | Record cell promotes to fact | The fact keeps the quote and anchor |
| EV-05 | Element has no proof | The draft gate names the missing element |
| EV-06 | Privileged source in context | Excluded or redacted; reason recorded |
| EV-07 | Victim name in a draft | Blocked by the identity rule |
| EV-08 | Event decision | Append-only; the old value is kept |
| EV-09 | Fact supersede | The old fact is superseded, not overwritten |
| EV-10 | Timeline | Events and facts in date order with anchors |

## 9. Recommendation

**Keep the evidence model; add proceeding scope, one extraction owner, elements, sensitivity and a single contradiction lifecycle.** The Notebook, facts, evidence, edges and record table are valuable. The current weakness is that they are a matter-level pool with duplicate computation and no legal element model.

## Appendix: evidence map

- `src/main/notebook.ts` — event extraction.
- `src/main/evidence.ts` — analysis pipeline.
- `src/lib/evidence/` — contradictions, relations, structure, timeline, jurisdiction, templates.
- `src/lib/matter-store/evidence.ts` — facts, evidence, parts, edges, memory, jurisdiction.
- `src/main/record-table.ts`, `src/lib/matter-store/work.ts` — record table.
- `src/renderer/src/Notebook.tsx`, `WorkspaceViews.tsx` — views.

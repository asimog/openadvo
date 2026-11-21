# Module report: RAG and legal research

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: the law store, the judgment corpus, the seven-scope retrieval registry, the statute/procedure/research/matter/firm/advocate/session adapters, the citation and quote verification, the binding assessment, the research plans and coverage, and the index health.

The Research Studio is the application surface over this system. Its report is `02-research-studio.md`.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Instruments and provisions | `src/lib/law-store/` | `corpus.db` `statute_act`, `statute_provision`, `statute_event`, `statute_check` |
| Judgments | `src/lib/law-store/`, `src/lib/legal-corpus/`, `src/lib/research-sources/corpus.ts` | `judgment_para`, `judgment_identity`, `citation_key`, `legal_edge` |
| Retrieval registry | `src/lib/knowledge/` | No store; reads adapters |
| Retrieval adapters | `src/lib/knowledge/adapters.ts`, `skeleton.ts` | Statute, procedure, research, matter, firm, advocate, session |
| Law import | `src/lib/law-import/`, `src/lib/statutes/` | India Code, Akoma Ntoso, Indian Kanoon fallback |
| External discovery | `src/lib/research-sources/` | India Code, AWS SC, AWS HC, web |
| Quotes and binding | `src/lib/knowledge/quote.ts`, `src/lib/authority/binding.ts` | No store |
| Citation validator | `src/lib/ulos/` | External executable and `shared_citation_check` |
| Research records | `src/main/research.ts`, `src/main/studio.ts` | `matter.db` issues, authorities, memos, checks |
| Index health | `src/main/studio.ts`, `src/shared/law.ts` | Counts, manifest, adapter health |
| Provenance | `src/lib/verification/provenance.ts` | Library only |

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Instrument kinds | Implemented | `act`, `rules`, `regulation`, `notification`, `practice_direction` | Extendable |
| Provisions with versions | Implemented | `statute_provision` | `validFrom`, `validUntil`, `status`, `textHash` |
| Statute events | Implemented | `statute_event` | Commencement, amendment, repeal, savings, transitional |
| In-force by date | Implemented | `LawStore.inForce` | With basis and events |
| Source manifest | Implemented | `LawManifest`, `source_file` | Set hash |
| India Code import | Implemented | `law-import`, `statutes/indiacode` | First wave |
| Akoma Ntoso export | Implemented | `statutes/akn.ts` | Provenance namespace |
| Indian Kanoon fallback | Implemented | `statutes/indiankanoon` | Secondary source, marked unverified |
| Judgment index | Implemented | `judgment_para`, AWS SC/HC | Not all courts or years |
| Judgment paragraphs | Implemented | `legal-corpus/paragraphs` | Page, line, label |
| Treatment edges | Implemented | `legal_edge` | Cites, follows, distinguishes, overrules |
| Citation keys | Implemented | `citationKeyId`, `citation_key` | Stable ids |
| Seven scopes | Implemented | `KNOWLEDGE_SCOPES` | advocate, firm, statute, procedure, matter, research, session |
| Statute adapter | Implemented | `provisionAdapter("statute")` | Acts and notifications |
| Procedure adapter | Partial | `provisionAdapter("procedure")` | Only rules/practice/regulation text |
| Research adapter | Implemented | `researchAdapter` | Paragraph FTS, graph, vectors |
| Matter adapter | Implemented | `boundMatterAdapter` | Refuses another matter |
| Firm adapter | Implemented | `libraryAdapter` | Library scope |
| Advocate adapter | Implemented | `advocateAdapter` | Confirmed memory |
| Session adapter | Missing | `deferredAdapter` | Deferred |
| FTS, vector, graph fusion | Implemented | `runRetrieval` | RRF, bounded concurrency |
| Per-adapter timeout | Implemented | 4 seconds | Coverage on failure |
| Retrieval policy | Implemented | `applyPolicy` | Law vs fact |
| Quote verification | Implemented | `verifyQuote`, `locateQuote` | Hash and offsets |
| Binding effect | Implemented | `authority/binding.ts` | Court, bench, date, treatment |
| Citation validator | Implemented | `ulos` | Neutral citations |
| Shared citation checks | Implemented | `shared_citation_check` | Cross-matter record |
| Research plan and coverage | Implemented | `research-plan`, `research-workflow` | Agent-directed |
| Index health | Implemented | `KnowledgeHealthView` | Counts, manifest, adapters |
| Provenance display | Library-only | `provenance.ts` | Not wired |
| Gold set or evaluation | Missing | Fixture tests | No measured precision |
| Procedure rule records | Missing | No table | Procedure is instrument text |
| Applicability engine | Missing | No path | No forum/type/date selection |
| Full citator | Partial | Index-dependent | Not all HCs/years |
| Scheduled updates | Partial | `checkedAt`, `stale` | Manual check |

## 3. Current flow

### Law import

```text
Official source (India Code / PDF / AKN)
  → law-import
  → act + provisions + events + source files
  → text hash + anchors + check state
  → `corpus.db`
```

### Retrieval

```text
Query + mode + scopes + date + court
  → parseQuery
  → KnowledgeRegistry scope check
  → adapters in parallel (max 4, timeout 4s)
  → exact / FTS / graph / vector lists
  → RRF fusion
  → policy filter
  → finish hooks (stale checks, quote)
  → hits + coverage + notSearched + ms
```

### Verification

```text
Hit
  → open source
  → locate quote (offset, hash)
  → citation check (ULOS)
  → currentness at governing date
  → binding effect
  → passage role and support assessment
  → treatment
  → verified passage or unresolved
```

## 4. Problems

### R-01: The procedure scope is instrument text, not applied rules

**Evidence.** `provisionAdapter("procedure")` searches provisions with `InstrumentKind` `rules`, `practice_direction` or `regulation`, with an optional `includeActIds` for the CPC. It has no `RuleRecord`, no selector, no trigger, no time limit and no applicability.

**Effect.** The procedure scope can return Order XXI rule 1, but not "this rule applies to SLP(C) at the filing stage on this date, with this branch". The agent has to interpret. The filing service uses a pack or adapter instead.

**Target.** `ProcedureService` owns rule records and applicability. The `procedure` scope searches rule records and their source provisions. A hit carries the rule id, selector, effective dates, verification and source anchor.

### R-02: The statute/procedure split is by instrument kind

**Evidence.** `STATUTE_KINDS = ["act", "notification"]`; `PROCEDURE_KINDS = ["rules", "practice_direction", "regulation"]`. The CPC is an Act with procedural content. `includeActIds` lets it appear in the procedure scope.

**Effect.** A procedural provision can be missing from the procedure search unless an engineer adds an act id. The split is a data configuration, not a legal function.

**Target.** An instrument has `legalFunction` (`substantive`, `procedural`, `mixed`, `evidence`). The scope is chosen by the question. The same provision can appear in both scopes with a different role.

### R-03: The context is optional

**Evidence.** `searchKnowledge` takes `date` and `court` as optional. `studio.ts:159-168` uses the profile court and governing date for binding, not for retrieval. The procedure adapter filters by court only when the query has one.

**Effect.** A procedure search can run with no forum or no date and return a confident hit. A historical question can use today's law.

**Target.** `RetrievalContext` is required for a procedure search: forum id, proceeding type, date basis and date. Missing context returns `partial` with a named gap. The context resolver supplies it from the proceeding.

### R-04: The session scope is deferred

**Evidence.** `createPhase5Knowledge` registers `deferredAdapter("session", "The session adapter is deferred to RAG-3 (Phase 12). No session log is connected.")`.

**Effect.** Prior decisions and session logs are not searchable. The agent relies on the chat context.

**Target.** A session adapter over the trace and decisions, read-only, scoped to the current session. It never returns case facts.

### R-05: Corpus coverage is partial and uneven

**Evidence.** The India Code first wave is ten instruments. The judgment index covers SC and HC years that the owner has indexed. The citator depends on the indexed paragraphs. Many HCs and years are absent.

**Effect.** The system can say "not found" when the authority exists outside the index. The coverage line helps, but the advocate may read it as completeness.

**Target.** Coverage is a first-class result: per court, year, instrument and treatment. A missing year is named. A search that cannot reach a source says so. The UI shows the corpus map, not just a hit list.

### R-06: Binding uses the matter's court, not the proceeding's forum

**Evidence.** `studio.ts:162-168` builds the binding question from `profile.court`, `profile.governingDate` or the query date or today. The matter profile court is free text.

**Effect.** A binding label can be wrong when the matter has an appeal in a different court, or when the profile court is a display name.

**Target.** The binding question uses the proceeding's `forumId`, the date basis and the court hierarchy. It is `undetermined` when the forum or date is unknown.

### R-07: No evaluation

**Evidence.** Tests cover the contract, scope guard, quote, citation and retrieval shape. There is no precision/recall set, no ranking evaluation and no regression set for a model or corpus change.

**Effect.** A retrieval change can improve one query and degrade another. The team cannot prove the system is better.

**Target.** A legal evaluation set with known answers per scope. Measure top-k recall, quote accuracy, citation accuracy, binding accuracy and coverage. Run it on every index or ranker change.

### R-08: Provenance is not surfaced

**Evidence.** `verification/provenance.ts` defines citation, fact, provision and court-record provenance. Tests exist. No main or renderer path uses it.

**Effect.** The advocate cannot see whether a provision comes from India Code, Indian Kanoon, an upload or an AKN file; whether a citation is from a court copy or a secondary source; whether a fact is client-supplied.

**Target.** Every hit, quote and authority carries a provenance label. The memo and the draft use the same label.

### R-09: Index health is a count, not an operational view

**Evidence.** `KnowledgeHealthView` has adapter health, law counts and a manifest. It does not show queue depth, last check per source, failed sources, vector coverage or per-court gaps.

**Effect.** A stale or empty source is visible only when a search misses. The owner cannot see what to refresh.

**Target.** A `CorpusHealth` view per source, court, year, instrument and index. It shows rows, last check, staleness, failures, vector count and the next action.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `Instrument` | Constitution, Act, rules, regulation, notification, practice direction |
| `InstrumentVersion` | A version with publication, commencement and end dates |
| `Provision` | The exact text with an anchor and a version |
| `RuleRecord` | The operational interpretation for a forum, proceeding, stage and trigger |
| `RuleInterpretation` | A judgment or note that interprets a rule |
| `Judgment` | A decision with identity, court, date, judges and citations |
| `Paragraph` | A judgment paragraph with a page/line anchor and a role |
| `Treatment` | Cites, follows, distinguishes, overrules, doubts, affirms, reverses |
| `SearchRun` | Query, mode, scopes, date, court, hits, coverage, time |
| `Hit` | One result with scope, anchor, text, checks, binding and provenance |
| `QuoteCheck` | Hash, offsets and result |
| `CitationCheck` | Validator outcome, reason and record |
| `BindingResult` | Label, reasons and unresolved facts |
| `Provenance` | Source label, value and note |
| `CorpusHealth` | Rows, last check, stale, failed, vector and gaps |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `LawService` | Instruments, versions, provisions, judgments, paragraphs, treatments | `corpus.db`, source manifests |
| `ProcedureService` | Rule records, interpretations, applicability, obligations | `LawService`, `ForumService` |
| `RetrievalService` | Registry, scope guard, query planning, adapters, fusion, coverage | `LawService`, `ProcedureService`, matter/firm/advocate ports |
| `CitationService` | Quote, citation, currentness, binding, support, treatment, provenance | `LawService`, `ProcedureService`, ULOS |
| `EvaluationService` | Gold set, metrics, regression runs | `RetrievalService`, `CitationService` |
| `CorpusHealthService` | Index counts, freshness, gaps, failures | `LawService`, `ProcedureService` |

### 5.3 Scope contracts

| Scope | Returns | Must not return |
|---|---|---|
| `statute` | Constitutional, statutory and subordinate legislative text with versions | Judgments, checklists, matter facts, agent summaries |
| `procedure` | Rule records, procedural instruments, practice directions, forms, applicability inputs | A bare checklist as law; a rule without a source |
| `research` | Judgment paragraphs, citations, treatments, passage roles | A headnote as the holding; an unanchored summary |
| `matter` | The bound matter's documents, events, facts, issues, drafts | Another matter; a public judgment as a matter fact |
| `firm` | Library items with scope, status and source | Client facts; unapproved work |
| `advocate` | Confirmed preferences and memory | Proposed or tentative memory as confirmed |
| `session` | Trace, decisions and prior answers | Case facts or legal authority |

### 5.4 Contracts

```ts
interface RetrievalService {
  search(input: {
    query: string;
    mode: SearchMode;
    scopes: KnowledgeScope[];
    context: RetrievalContext;
    limit: number;
  }): Promise<RetrievalResult>;
}

interface RetrievalContext {
  matterId: string | null;
  proceedingId: string | null;
  forumId: string | null;
  dateBasis: DateBasis;
  date: string | null;
  practiceArea: string | null;
}

interface CitationService {
  verifyQuote(hitId: string, quote: string): Promise<QuoteCheck>;
  checkCitation(citation: string, context: RetrievalContext): Promise<CitationCheck>;
  binding(hitId: string, context: RetrievalContext): Promise<BindingResult>;
  assessSupport(hitId: string, proposition: string): Promise<SupportAssessment>;
  provenance(hitId: string): Promise<Provenance>;
}
```

### 5.5 The retrieval rule

A hit is a candidate until:

1. the source is opened;
2. the passage is anchored;
3. the quote is verified;
4. the citation is checked;
5. the currentness is checked at the date;
6. the binding is assessed;
7. the support is assessed;
8. the treatment is checked.

A search result, a web page, a headnote, a digest or a model summary is never a verified passage.

### 5.6 The temporal rule

Every provision and rule record has:

- `publishedAt`;
- `effectiveFrom`;
- `effectiveTo`;
- `retrievedAt`;
- `checkedAt`;
- `supersededAt`;
- `reviewedBy`.

The retrieval context names the date basis. The answer shows the version in force and the current version. A missing date returns `undetermined`, not the latest.

## 6. Boundaries

- `LawService` owns public law text. It does not own matter facts or procedure applicability.
- `ProcedureService` owns the applied rule. It does not own the judgment corpus.
- `RetrievalService` owns search. It does not own the source text or the authority decision.
- `CitationService` owns verification. It does not own the research memo.
- `EvaluationService` owns measurement. It does not change a ranker.
- `ResearchService` owns the matter's issues, authorities and memos. It does not own law text.

## 7. Migration

1. Add `legalFunction` to instruments and use it to route scope.
2. Add `RuleRecord` and make the `procedure` adapter search it. Keep the provision text as the source.
3. Add `RetrievalContext` with forum, proceeding and date. Make it required for procedure.
4. Move binding to the proceeding's forum.
5. Add `Provenance` to hits, quotes and authorities.
6. Add `CorpusHealth` and per-court/year coverage.
7. Add the session adapter over trace and decisions.
8. Add the gold set and run it on every index change.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| RG-01 | Procedure search with no court | `partial`; no applicable rule claimed |
| RG-02 | Procedure search with a court and date | Rule id, version and source |
| RG-03 | Historical provision | The version in force on the date |
| RG-04 | Two versions in range | Conflict; no silent choice |
| RG-05 | Quote not in source | Refused |
| RG-06 | Citation fails | Failed; no verified passage |
| RG-07 | Binding without a forum | Undetermined |
| RG-08 | Matter scope with another matter id | Refused before search |
| RG-09 | Session scope | Returns trace only; no case fact |
| RG-10 | Corpus gap | Coverage names the missing court/year |
| RG-11 | Provenance | Every hit shows its source label |
| RG-12 | Evaluation | The gold set runs and reports recall and quote accuracy |

## 9. Recommendation

**Keep the corpus, registry and quote gate. Add the procedure rule layer, the context and the evaluation.** The retrieval contract is already good. The missing pieces are applied procedure, a required date/forum context, provenance in the UI, a session scope and a measured gold set. Do not replace the corpus with a vector-only system; the exact text and the treatment graph are the value.

## Appendix: evidence map

- `src/lib/law-store/index.ts` — schema, in-force, versions, judgments, treatments.
- `src/lib/knowledge/index.ts` — registry, fusion, coverage, quote.
- `src/lib/knowledge/adapters.ts` — statute, procedure, research, matter, firm, advocate.
- `src/lib/knowledge/skeleton.ts` — registry composition and deferred session.
- `src/lib/legal-corpus/index.ts` — paragraphs, citations, treatments.
- `src/lib/research-sources/corpus.ts` — judgment index.
- `src/lib/statutes/` — import, structure, in-force, crosswalk, AKN.
- `src/lib/authority/binding.ts` — binding effect.
- `src/lib/ulos/index.ts` — citation validator.
- `src/lib/verification/provenance.ts` — provenance, not wired.

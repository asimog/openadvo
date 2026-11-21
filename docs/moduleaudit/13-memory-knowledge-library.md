# Module report: memory, knowledge library and precedents

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: the free-text matter memory, the typed matter memory, the advocate memory and preferences, the Knowledge Library, precedents, the advocate memory graph, outcome records and the six memory questions.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Matter note | `Matters.memory`, `setMemory` | `memory.md` |
| Typed matter memory | `src/lib/matter-store/evidence.ts` | `memory` table |
| Advocate memory | `src/lib/advocate-store/` | `memory` table in `advocate.db` |
| Preferences | `src/lib/preferences/`, `advocate.db` | `preference` table |
| Knowledge Library | `src/main/library.ts`, `advocate.db` | `library_item`, blobs in `userData/library` |
| Precedents | `Library.precedents`, `advocate-store` graph | `library_item`, `advocate_edge` |
| Advocate graph | `src/lib/advocate-store/graph.ts` | `advocate_node`, `advocate_edge` |
| Outcomes | `src/lib/matter-store/outcomes.ts` | `outcome` table |
| Memory answers | `src/lib/memory-answers/` | Derived from a matter snapshot |
| UI | `MemoryEditor`, `MemoryPanel`, `Library.tsx`, `Pages.tsx` | View state |

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Free-text matter memory | Implemented | `memory.md`, `setMemory` | Advocate-only; agent reads as reference |
| Typed matter memory | Implemented | `memory` table | Type, status, source, validity, supersedes |
| Memory proposal and decision | Implemented | `proposeMemory`, `decideMemory` | Candidate until confirmed |
| Advocate memory | Implemented | `advocate.db memory` | Preference, precedent, lesson, court practice |
| Preferences | Implemented | `preference` table | Proposed, approved, rejected |
| Preference questions | Implemented | `preferenceQuestions` | Asked once in a task |
| Knowledge Library | Implemented | `library_item`, blobs | Kinds, status, scope, source |
| Library import | Implemented | `Library.importFiles`, `importFolder` | Files and folder |
| Library roles | Implemented | `Library.roles` | Position, playbook, style, error, precedent |
| Precedents | Implemented | `Library.precedents` | Court, proceeding, practice, role |
| Advocate graph | Implemented | `advocate_node`, `advocate_edge` | Preference, precedent, lesson, outcome |
| Outcomes | Implemented | `outcome` table | Result, court, stage, note |
| Memory answers | Implemented | `answerMemoryQuestion` | Six questions + search |
| Cross-matter research history | Implemented | `ResearchPage` | Law only |
| Library provenance | Partial | Source name, hash | No full provenance label |
| Library retention | Missing | No path | No archive or purge |
| Cross-matter facts | Missing | No path | Correct by design |
| One memory model | Missing | `memory.md` + `memory` table | Two memories |
| Outcome graph use | Partial | Graph builder | Not a measured feedback loop |

## 3. Current flow

### Matter memory

```text
Advocate writes memory.md
  → agent reads it as reference text
  → not a fact, not a confirmed record

Agent proposes a memory record
  → memory (proposed)
  → advocate confirms/rejects
  → memory (confirmed) → context package
```

### Advocate memory and library

```text
Preference proposed in a task
  → advocate approves
  → preference (approved)
  → applied in later tasks with a reason

Library file/folder
  → library_item (unreviewed)
  → advocate reviews, sets status and role
  → precedent offer to a matter
  → outcome records feed the advocate graph
```

## 4. Problems

### M-01: Two matter memories

**Evidence.** `memory.md` is free text, written by the advocate, read by the agent as reference. The `memory` table is typed, proposed by the agent, confirmed by the advocate. Both are called "matter memory". The UI has `MemoryEditor` and `MemoryPanel`.

**Effect.** The advocate can write the same fact in two places. The agent can read one and miss the other. The authority of each is unclear.

**Target.** Two named concepts: `AdvocateNote` (free-text brief for the agent) and `MatterMemoryRecord` (typed, confirmed record). One `MemoryService` may own both, but the names and the scopes are separate.

### M-02: The library has no lifecycle

**Evidence.** `library_item` has status `unreviewed`, `drafted`, `reviewed`, `approved`, `filed`, `superseded`, `rejected`, `withdrawn`. There is no archive, no retention and no delete. A library item linked to a matter is never returned by the firm scope.

**Effect.** The library grows. An old precedent stays as `approved` forever. A withdrawn item can still be offered.

**Target.** A `LibraryLifecycle`: unreviewed → reviewed → approved → superseded/withdrawn → archived. The precedent offer filters to `approved` and current. A retention rule is explicit.

### M-03: A precedent is a library row, not a verified proposition

**Evidence.** `Library.precedents` ranks by court, proceeding and practice. It offers the item with a reason. The item has a kind and status, but no passage anchor or proposition.

**Effect.** A precedent is a document, not a holding. The offer can point to a judgment without the paragraph that supports the proposition.

**Target.** A `Precedent` record: judgment, passage anchor, proposition, court, date, treatment, role, status. The library item can hold the document; the precedent holds the legal use.

### M-04: The advocate graph is built, but not used as a feedback loop

**Evidence.** `advocate-edge` and `advocate-node` are built from memory, preferences, library and outcomes. The graph is a view in `Profile.tsx`. It does not change retrieval or precedent ranking.

**Effect.** Outcomes do not teach the system. A precedent that failed is not down-ranked. A lesson is not applied.

**Target.** A `PrecedentRanker` uses the graph: court, proceeding, practice, outcome, success, failure, recency. The rank is explained. The advocate can override.

### M-05: Outcomes are not linked to the authority or argument that caused them

**Evidence.** `outcome` has result, subject, court, decision date, source and summary. It has no authority id, argument id or issue id.

**Effect.** The outcome graph cannot answer "which argument worked". It only records the result.

**Target.** An outcome links to the proceeding, the issues, the arguments and the authorities. The graph can then show which use succeeded or failed.

### M-06: Memory answers are a read model with no provenance

**Evidence.** `answerMemoryQuestion` returns lines with record links. It classifies six questions. It does not show a source anchor for every line, and it does not include a coverage or missing statement.

**Effect.** The answer is useful but not auditable. A line can rest on a proposed memory record.

**Target.** Every answer line carries the record id, the status and the source. The answer names what was searched and what was missing.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `AdvocateNote` | Free-text brief for one matter; not a fact |
| `MatterMemoryRecord` | Typed, confirmed memory with a scope and validity |
| `AdvocateMemoryRecord` | Preference, precedent, lesson, court practice |
| `Preference` | A learned choice with a reason and approval |
| `LibraryItem` | A file or note with kind, status, scope and source |
| `Precedent` | Judgment, passage, proposition, treatment, use |
| `Outcome` | Result linked to proceeding, issues, arguments and authorities |
| `GraphEdge` | A relation between the above |
| `MemoryAnswer` | Lines with record ids, status, source and coverage |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `MemoryService` | Advocate notes, matter memory, advocate memory, preferences | `MatterService`, `AdvocateStore` |
| `LibraryService` | Library items, import, lifecycle, roles | `advocate.db`, blobs |
| `PrecedentService` | Precedents, ranking, offers | `LibraryService`, `ResearchService`, graph |
| `OutcomeService` | Outcomes and links | `MatterService`, `ProceedingService` |
| `GraphService` | Nodes, edges, rebuild | The stores above |

### 5.3 Contracts

```ts
interface MemoryService {
  readNote(matterId: string): Promise<string>;
  writeNote(matterId: string, text: string): Promise<string>;
  proposeMatterMemory(matterId: string, input: MemoryInput): Promise<MatterMemoryRecord>;
  decideMatterMemory(id: string, status: MemoryStatus): Promise<MatterMemoryRecord>;
  proposeAdvocateMemory(input: AdvocateMemoryInput): Promise<AdvocateMemoryRecord>;
  decideAdvocateMemory(id: string, status: MemoryStatus): Promise<AdvocateMemoryRecord>;
  answer(matterId: string, question: string): Promise<MemoryAnswer>;
}

interface LibraryService {
  importFiles(files: string[], scope?: string): Promise<LibraryImportResult>;
  list(filter: LibraryFilter): Promise<LibraryItem[]>;
  setStatus(id: string, status: LibraryStatus): Promise<LibraryItem>;
  roles(): Promise<LibraryRoleGroup[]>;
}

interface PrecedentService {
  offer(subject: PrecedentSubject, n?: number): Promise<PrecedentOffer[]>;
  recordUse(precedentId: string, outcomeId: string): Promise<void>;
}
```

### 5.4 The scope rule

- `AdvocateNote` is matter-scoped. The agent reads it as reference text, not as a fact.
- `MatterMemoryRecord` is matter-scoped. It can be confirmed and used in context.
- `AdvocateMemoryRecord` is advocate-scoped. It never contains client facts.
- `LibraryItem` is firm-scoped. A matter-linked item is not returned by the firm scope.
- `Precedent` is a legal use of a judgment, not a client fact.
- `Outcome` is matter-scoped. The graph aggregates without exposing another client's facts.

## 6. Boundaries

- `MemoryService` owns notes, memory and preferences. It does not own documents or law.
- `LibraryService` owns the library item and its blob. It does not own the precedent's legal proposition.
- `PrecedentService` owns the precedent and its rank. It does not own the judgment text.
- `OutcomeService` owns the outcome and its links. It does not own the record.
- `GraphService` owns the derived edges. It does not own the source records.

## 7. Migration

1. Rename `memory.md` to `AdvocateNote` in the UI and the prompt.
2. Rename the typed table to `MatterMemoryRecord` in the service layer.
3. Add `Precedent` records with passage, proposition and treatment.
4. Add outcome links to issues, arguments and authorities.
5. Add library lifecycle and retention.
6. Use the graph in precedent ranking and explain the rank.
7. Add provenance and coverage to memory answers.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| MK-01 | Write a note and a memory record | Two distinct records; no duplicate display |
| MK-02 | Agent reads the note | It is labelled reference, not a fact |
| MK-03 | Proposed memory in context | Not used as confirmed |
| MK-04 | Library item withdrawn | Not offered as a precedent |
| MK-05 | Precedent offer | Shows judgment, passage, proposition and reason |
| MK-06 | Outcome linked to an argument | The graph shows the use |
| MK-07 | Firm scope asks for a matter item | Refused |
| MK-08 | Memory answer | Every line has a record id and source |
| MK-09 | No answer | The answer says what was searched and missing |
| MK-10 | Preference applied | The applied-because reason is shown |

## 9. Recommendation

**Keep the two memories but name them; make the library a lifecycle; make the precedent a legal use; link outcomes to arguments and authorities.** The memory and library work is useful but currently mixes a note, a memory, a document and a precedent. The greenfield design separates them and makes the graph a real feedback loop.

## Appendix: evidence map

- `src/main/matters.ts` — `memory`, `setMemory`.
- `src/lib/matter-store/evidence.ts` — typed memory.
- `src/lib/advocate-store/index.ts` — advocate memory, preferences, library, graph.
- `src/main/library.ts` — import, list, roles, precedents.
- `src/lib/memory-answers/index.ts` — six questions and answer.
- `src/lib/matter-store/outcomes.ts` — outcomes.
- `src/renderer/src/MatterAdminViews.tsx`, `Pages.tsx`, `Library.tsx` — UI.

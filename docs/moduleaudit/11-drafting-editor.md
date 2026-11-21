# Module report: drafting and document editor

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: the document catalogue, draft generation from confirmed records, DOCX structure, revisions and approvals, tracked changes, paragraph links, citation insertion, the document checks, the reviewer note and gate, the memo and conference documents, and the Euro-Office editor host.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Draft service | `src/main/drafts.ts` (`Drafts`) | `draft`, `revision`, `revision_approval`, `paragraph_link` |
| Catalogue | `src/lib/drafting/documents.ts` | 67 draft kinds, groups, templates, court formats |
| Generation | `src/lib/drafting/index.ts`, `parts.ts`, `structured.ts` | DOCX blocks and paragraphs |
| Checks | `src/lib/verification/`, `src/lib/drafting/` | Defects, gate, reviewer note |
| Tracked changes | `src/lib/tracked-changes/` | DOCX tracked changes |
| Editor | `src/main/editor-host.ts`, `src/lib/euro-office/` | Working copy, Euro-Office scheme |
| Converter | `src/lib/converter/` | PDF/A |
| UI | `src/renderer/src/Drafts.tsx`, `DraftView.tsx`, `AgentChangesCard.tsx` | Draft list, editor, checks, changes |

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| 67 draft kinds | Implemented | `DRAFT_KINDS` | Records, pleadings, applications, submissions |
| Catalogue and groups | Implemented | `CATALOGUE` | Group, title, template |
| Generate from confirmed records | Implemented | `Drafts.generate` | Events, facts, parties, provisions |
| Structured DOCX | Implemented | `generateStructured` | Headings, paragraphs, tables |
| Court formats | Implemented | `COURT_FORMATS`, `courtFormat` | Page size and margins |
| Revisions | Implemented | `revision` | Append-only, SHA-256 |
| Advocate approval | Implemented | `approveRevision` | Human-only |
| Agent tracked changes | Implemented | `proposeRevision`, `pendingChanges` | Advocate decides |
| Paragraph links | Implemented | `paragraph_link` | Draft paragraph to event/fact/evidence |
| Citation insertion | Implemented | `insertCitation` | From saved authority |
| Grounding check | Implemented | `checkGrounding` | Quote must match a line |
| Statute check | Implemented | `checkStatutes` | In-force date |
| Structure check | Implemented | `checkStructure` | Headings, parts, markers, page format |
| Prayer and party checks | Implemented | `checkDraft` | Case number, date, party, prayer |
| Victim identity check | Implemented | `protectedNamesIn` | Names not to appear |
| Repealed provision check | Implemented | `checkDraft` | Uses saved provisions |
| Reviewer note and gate | Implemented | `buildReviewerNote`, `gateState` | Severity and reasons |
| Memo and conference | Implemented | `memoDocument`, `conferenceBlocks` | DOCX |
| Euro-Office editor | Implemented | `EditorHost` | Working copy, save |
| PDF/A conversion | Implemented | `converter` | Filing use |
| Multi-proceeding drafts | Missing | No proceeding id | Matter-level |
| Template versioning | Missing | Catalogue is code | No version record |
| Court form XML or e-filing fields | Missing | No path | DOCX/PDF only |
| Per-draft gate | Partial | One gate per draft | Filing gate separate |
| Gold set | Missing | Fixtures | No measured quality |

## 3. Current flow

```text
Draft kind + matter records
  → Drafts.generate
  → template blocks
  → events/facts/parts
  → DOCX
  → revision 1
  → editor (Euro-Office) or agent changes
  → save revision
  → Drafts.check
      → grounding, statutes, structure, markers, prayer, victim identity
      → review items + gate + reviewer note
  → advocate approves
  → Filing reads the approved revision
```

## 4. Problems

### DR-01: Drafts are matter-level, not proceeding-level

**Evidence.** `draft` has no `proceedingId`; `matter_details` has one impugned event and one case number. A draft is generated from the matter's current records.

**Effect.** A suit plaint, a first appeal and an SLP cannot coexist with their own cause titles, reliefs, impugned decisions and limitation. An appeal draft uses the trial court's details.

**Target.** `proceedingId` on every draft. The cause title, court, case number, impugned decision, relief and limitation come from the proceeding. A draft can be copied from another proceeding with a new identity.

### DR-02: The template catalogue is code, not data

**Evidence.** `CATALOGUE` is a TypeScript array. `COURT_FORMATS` is code. A template change requires a release.

**Effect.** A court's form or a practice's standard clause cannot be updated by the owner. A template has no version, source or review date.

**Target.** A `DocumentTemplate` record with id, version, kind, group, court, practice, source, body blocks, required parts, checks and review. Built-in templates are checked data; an advocate template is versioned. A draft records the template version it used.

### DR-03: The draft gate and the filing gate disagree

**Evidence.** `Drafts.check` builds `DraftCheck.gate` from draft defects, unresolved checks, undecided changes and legal blockers. `Filing.state` builds `blockers` from compliance rows and procedure rows. The two are different functions.

**Effect.** A draft can be "ready for advocate review" while filing is blocked, or the reverse. The advocate sees two verdicts.

**Target.** One `ReadinessService`. Drafting shows the draft-scoped blockers. Filing shows the filing-scoped blockers. Both come from the same computation.

### DR-04: The check pipeline recomputes evidence

**Evidence.** `Drafts.check` recomputes contradictions from facts and events, extracts case numbers from source lines, and builds a source list. `EvidenceService` already holds contradictions and edges.

**Effect.** Two computations can disagree. A change to evidence does not automatically change the draft check.

**Target.** Drafting asks `EvidenceService` for contradictions and anchors. It does not re-detect them.

### DR-05: The reviewer note is good but not a state machine

**Evidence.** `buildReviewerNote` groups defects by severity and currency. `gateState` returns a state and reasons. There is no record of a reviewer's acceptance of a specific note, and no history of gate changes.

**Effect.** The note is a snapshot. A later check overwrites it. There is no audit of why a draft moved from blocked to ready.

**Target.** A `DraftReview` record with the gate state, reasons, defects, reviewer, time and decision. A gate change is an event.

### DR-06: The editor is an external process with a working copy

**Evidence.** `EditorHost` opens a working copy through `oa-eo://`, saves back to a revision. The document bytes cross the process boundary.

**Effect.** A save conflict or a crash can lose edits. There is no lock or merge.

**Target.** A `WorkingCopy` record with a lease, a base revision and a save policy. A save is a new revision with a base id. A stale base is a conflict, not an overwrite. The editor cannot approve or file.

### DR-07: No template or draft dependency on the proceeding type

**Evidence.** `DraftKind` is a flat list. A writ petition and a writ appeal share some kinds. There is no mapping from proceeding type to allowed draft kinds and required parts.

**Effect.** A user can generate an SLP from a bail matter. The gate may catch a missing part, but the catalogue offers the wrong document.

**Target.** A `ProceedingDefinition` names its draft kinds, required documents, template ids and checks. The catalogue is filtered by proceeding.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `Draft` | A document for one proceeding, with a kind and a title |
| `Revision` | An immutable DOCX with a hash, author, base and approval |
| `ParagraphLink` | A paragraph anchor to events, facts, evidence and authorities |
| `DocumentTemplate` | Versioned blocks, parts, checks and source |
| `DraftCheck` | Defects, gate, reviewer note, coverage |
| `DraftReview` | A gate decision with reasons and actor |
| `WorkingCopy` | A lease on a revision for the editor |
| `CitationInsertion` | An authority inserted at a paragraph |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `DraftingService` | Drafts, revisions, approvals, checks, working copies | `EvidenceService`, `ResearchService`, `ProcedureService` |
| `TemplateRegistry` | Templates, versions, court formats | Checked data |
| `EditorHost` | Working copy, save, close | `DraftingService` |
| `ConverterService` | DOCX to PDF/A | `DraftingService` |
| `ReadinessService` | One gate | All services |

### 5.3 Contracts

```ts
interface DraftingService {
  generate(matterId: string, proceedingId: string, kind: DraftKind): Promise<Draft>;
  saveRevision(draftId: string, docx: Buffer, baseRevisionId: string): Promise<Revision>;
  proposeChanges(draftId: string, docx: Buffer, baseRevisionId: string): Promise<Revision>;
  decideChanges(draftId: string, docx: Buffer, baseRevisionId: string): Promise<Revision>;
  approve(revisionId: string): Promise<Draft>;
  check(draftId: string): Promise<DraftCheck>;
  insertCitation(draftId: string, anchor: string, authorityId: string): Promise<Revision>;
  paragraphSource(anchor: string): Promise<ParagraphSource>;
  openWorkingCopy(revisionId: string): Promise<WorkingCopy>;
}
```

### 5.4 The approval rule

A revision can be approved only when:

- the draft gate is `ready_for_advocate_review`;
- every required part is present;
- every citation is verified or attested;
- the adverse-authority review is recorded for grounds and petitions;
- no agent change is undecided;
- the revision's base is current.

The advocate approves. The agent never approves. The approval is a record with the revision hash and the gate snapshot.

### 5.5 The template rule

A template has:

- a stable id and version;
- the proceeding types and court kinds it serves;
- the blocks: fixed, record, slot;
- the required parts;
- the checks;
- the source and reviewer;
- an effective date.

A draft records the template id and version. A template change does not rewrite an approved draft.

## 6. Boundaries

- `DraftingService` owns drafts and revisions. It does not own evidence, research or filing.
- `TemplateRegistry` owns document shapes. It does not own legal rules.
- `EditorHost` owns the editor session. It does not own approval.
- `ConverterService` owns PDF/A. It does not own the filing set.
- `ReadinessService` owns the gate. Drafting does not recompute it.

## 7. Migration

1. Add `proceedingId` and `templateVersion` to draft.
2. Add the proceeding-to-draft-kind map.
3. Move the draft gate to `ReadinessService` with a draft scope.
4. Make `Drafts.check` consume evidence contradictions instead of recomputing.
5. Add `DraftReview` and a gate history.
6. Move templates to checked data with a version and source.
7. Add a working-copy lease and a stale-base conflict.
8. Add a template test for each proceeding type.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| DR-01 | A suit and an appeal in one matter | Two drafts, two cause titles |
| DR-02 | An SLP draft on a bail proceeding | Refused by the proceeding map |
| DR-03 | A citation fails | The revision cannot be approved |
| DR-04 | An agent change is undecided | The revision cannot be approved |
| DR-05 | A stale base save | Conflict; no overwrite |
| DR-06 | A template version change | The old draft keeps its version |
| DR-07 | A contradiction in evidence | The draft gate sees it without recomputation |
| DR-08 | A missing required part | The gate names it |
| DR-09 | PDF/A conversion | The filing set gets a PDF/A file |
| DR-10 | Approval | Human-only; the hash and gate snapshot are recorded |

## 9. Recommendation

**Keep the catalogue, generation, revisions and checks; add proceeding scope, template data, a working-copy lease and one gate.** The drafting layer is deep and useful. The main risks are matter-level identity, code-defined templates and a second readiness computation.

## Appendix: evidence map

- `src/main/drafts.ts` — generate, revisions, checks, approval, working copy.
- `src/lib/drafting/` — catalogue, parts, structured DOCX, generation.
- `src/lib/verification/` — grounding, statutes, structure, reviewer note, gate.
- `src/lib/tracked-changes/` — tracked changes.
- `src/main/editor-host.ts` — editor.
- `src/lib/converter/` — PDF/A.
- `src/renderer/src/Drafts.tsx`, `DraftView.tsx` — UI.

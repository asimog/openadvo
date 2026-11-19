# Spec: documents, evidence and facts (phase 4)

Status: built 2026-11-16 (owner's instruction: "Start implementation of phase 4"). The phase, its scope and its exit are in [../build-plan.md](../build-plan.md) section 2. The features are in [../features.md](../features.md). The owner's exit (lesson L3) is still owed.

## 1. Features and where each is built

| Feature | Built in | What the advocate sees |
|---|---|---|
| C7 | `src/main/related.ts`; `RelatedMatters` | Possible links by CNR, FIR number, parties or impugned order, each proposed, never made without the advocate. |
| D1 | `src/lib/jurisdiction/`; `src/main/jurisdiction.ts`; `JurisdictionPanel` | The report: forum and type, territorial and subject basis, provisions, alternative forums, limitation, appeal route, rules and unresolved facts. "Undetermined" is allowed. |
| D3 | `src/lib/jurisdiction/`; `JurisdictionPanel` | Forum clauses, arbitration seat and venue, exclusive and non-exclusive jurisdiction, each with its anchor. |
| F1 | `src/lib/matter-store/evidence.ts` `memory`; `MemoryPanel` | Typed matter memory: facts by source kind, admissions, disputes, missing facts, arguments, decisions, orders, open questions and case-theory changes. |
| F3 | `src/lib/matter-store/evidence.ts` | Propose, confirm, supersede, expire, archive; every change is an event. Nothing is deleted except under the retention rule. |
| F4 | `src/renderer/src/Evidence.tsx` | Search, filter by type and status, see the source, correct and supersede. |
| F6 | `Progress.inbox`; `MemoryPanel` | Memory proposals wait in the Review Inbox. |
| G2 | `matter_edge` in `matter.db` | Edges from facts, evidence, events, issues, arguments and record cells. |
| H3 | `src/lib/evidence/layout.ts`; `src/lib/document-intelligence/marks.ts` | Layout blocks, headers, footers, footnotes, paragraph anchors, entities, dates, amounts and citations. Tesseract and the second engine. Tables are read as text lines, not cells. |
| H4 | `page_mark`; `marks.ts` | Signature, stamp and seal marks, and handwriting flagged for the advocate. |
| H5 | `src/lib/evidence/relations.ts`; `source_relation` | Annexure of, reply to, certified copy of, version of and related documents, with the reason. |
| H6 | `src/lib/evidence/structure.ts`; `document_part` | Pleading parts, prayers, allegations, admissions, denials, witnesses, exhibits, the annexure map and order directions. |
| H7 | `src/lib/matter-store/evidence.ts` `evidence`; `EvidencePanel` | Exhibit number, witness, statement, chain of custody, hash, electronic-evidence metadata, authenticity and the advocate's admissibility notes. |
| H8 | `fact`; `src/lib/evidence/facts.ts`; `FactsPanel` | Facts extracted from the record, confirmed, disputed or rejected, with their source, and links to issues, arguments and relief. |
| H9 | `src/lib/evidence/contradictions.ts`; `Progress.inbox` | Contradictions of date, amount, name and event across documents and statements, as review items. |
| H10 | `src/lib/evidence/timeline.ts`; `FactsPanel` | Chronology, procedural, payment, communication and limitation timelines, conflicting dates, and a before/after comparison. |
| H12 | `src/lib/evidence/templates.ts`; `RecordTableView` | Column sets for a charge-sheet, FIR ingredients, a plaint and a written statement. |
| H13 | `src/main/document-ops.ts`; `DocumentOps` | Annotate, highlight, split, merge, reorder, extract pages, redact with a log, and export; the annexure manager keeps its marks. |

## 2. The evidence store

`matter.db` gains these tables, all written only by `MatterStore`:

- `fact`: id, text, type, status, source_id, anchor_id, page, line, event_id, date, amount, parties, issue_ids, argument_ids, relief, supersedes, author, created_at, decided_at.
- `evidence`: id, source_id, exhibit_number, witness, statement, given_by, given_at, hash, electronic, device, authenticity, admissibility, notes, status, created_at.
- `document_part`: id, source_id, kind, part, text, anchor_id, page, line, ref, created_at.
- `source_relation`: source_a, source_b, relation, reason, confidence, review_item_id, decision, decided_at.
- `matter_edge`: from_kind, from_id, relation, to_kind, to_id, evidence_ref, built_from, built_at.
- `memory`: the typed record of architecture.md section 6, matter scope.
- `page_mark`: source_id, page, kind, x, y, w, h, confidence, note, created_at.
- `document_operation`: id, kind, inputs, output_source_id, log, created_at.
- `jurisdiction_report`: one row per matter, with the fields of D1.

Every write appends an event. The agent writes candidates; only the advocate confirms, disputes, supersedes, archives or records an admissibility note.

## 3. Extraction

After ingest, `src/main/evidence.ts` reads the stored lines and pages and writes candidates:

1. **Structure.** Headings, parties, facts, grounds, prayer, allegations, admissions, denials, witnesses, exhibits, annexure references and court directions, each with its line anchor.
2. **Facts.** Sentences with a date, an amount, a party, an admission or a denial become candidate facts. Each fact keeps its line anchor and its event, when it has one.
3. **Forum clauses.** Exclusive and non-exclusive jurisdiction, seat and venue of arbitration, and the courts named, with anchors.
4. **Relations.** Same-text pairs (H5), annexure references, replies to a petition, certified copies and versions.
5. **Contradictions.** Dates, amounts, names and events that disagree across facts and events.
6. **Edges.** Fact to source, fact to event, fact to issue, evidence to source, document part to source, and event to source.
7. **Jurisdiction.** The report is built from the matter profile, the court directory, the built court lists, the limitation record, the appeal route and the forum clauses. A field that cannot be settled is "undetermined", with the reason.

The second OCR engine stays PP-OCR until a docTR model is vendored. H3 says docTR; the difference is recorded in section 7.

### 3.1 The Notebook diagnosis and the case number

The Notebook shows one row per source: its type, pages, lines, extracted events, the extraction time and why it has no event. "Rebuild extraction" re-runs the fixed rules over every read source and adds what is missing; it never deletes or confirms an event. The rebuild also refreshes an unconfirmed document type, so a questionnaire is no longer read as a notice.

A judgment or order also opens one `final_order` review item. It names the court, the date, whether the text reads as a final disposal, and the next forum in the court directory. The choices are an appeal or a special leave petition, a review or revision, or no action; limitation is computed before filing. The item is the next step, not a reading defect, so it does not block Notebook readiness.

The agent tool `import_case_documents` takes a case number (and a court, when known), finds the judgment or order PDFs on the public web with official court hosts first, downloads them into the matter, reads them and rebuilds the Notebook. If no public PDF is found, it returns the court page for the browser and the advocate's sign-in. The agent cannot create an event directly.

## 4. Views

- **Facts & chronology** (`FactsPanel`): facts with type, status, source, date and amount; confirm, dispute, reject, supersede; contradictions; timeline filters (all, procedural, factual, payment, communication, limitation); before/after comparison.
- **Documents & evidence** (`EvidencePanel`): the evidence repository and its authenticity, chain and admissibility notes; document operations; source relations.
- **Structure** (`StructurePanel`): the parts of each document, with anchors.
- **Jurisdiction** (`JurisdictionPanel`): the report, the forum clauses and the unresolved facts; the advocate can correct any field and mark a field "undetermined".
- **Memory** (`MemoryPanel`): typed memory, its status, source and history; the memory.md notes stay below it.
- **Record table**: a template select adds the columns of the proceeding.

## 5. Tests

| Test | Checks |
|---|---|
| `tests/unit/evidence.test.ts` | Facts, structure, relations, contradictions, timelines, templates, jurisdiction and edges |
| `tests/unit/document-ops.test.ts` | Split, merge, extract, reorder and redact a PDF; the redaction log; the hash of the output |
| `tests/e2e/phase4.spec.ts` | A PDF is read; facts, structure and evidence appear; a contradiction opens a review item; the jurisdiction report is shown; a memory record is proposed and confirmed; a record-table template adds columns; a document is split and redacted |
| `tests/e2e/app.spec.ts` | The new bridge functions and agent tools |

## 6. Done

The owner completes the phase exit on a real brief of more than 1,000 pages: coverage stated, review-table cells anchored, contradictions found, and the jurisdiction report with its basis (lesson L3).

## 7. What is not built, and why

- docTR is not vendored. The second engine remains PP-OCR until a docTR model is added. H3's layout, paragraphs, headers, footers, footnotes, classification, entities, dates, amounts and citations are built; the engine name is recorded as a difference.
- Tables are not extracted as cells. The line boxes are kept; a table is read as text lines.
- Handwriting is the same image rule as a signature: dark ink in the lower part of the page. It is a flag for the advocate, not a trained classifier.
- Signature and stamp detection are image rules, not a legal finding; the advocate decides what a mark is.
- Redaction is a new PDF with the marked area covered; the original source is kept and the redaction log names both.
- Convert is not in the document operations. A PDF is already a PDF; the filing set's PDF/A conversion is in the filing work.
- Export is the existing matter export; the document operations do not add a second export.
- The evidence graph is written and counted; it has no separate graph view yet. The Facts and Evidence tabs show the records and their sources.

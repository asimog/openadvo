# Phase 4: documents, evidence and facts

Session of 2026-11-16. Owner's instruction: "Start implementation of phase 4". Spec: [docs/specs/documents-evidence-facts.md](../../docs/specs/documents-evidence-facts.md).

## What was built

| Feature | Code |
|---|---|
| C7 | `src/lib/evidence/related.ts`; `matters:relatedSuggestions`; the detected links in `RelatedMatters` |
| D1 | `src/lib/evidence/jurisdiction.ts`; `src/main/evidence.ts`; `JurisdictionPanel` |
| D3 | `extractForumClauses`; `forum_clause`; `JurisdictionPanel` |
| F1, F3, F4 | `src/lib/matter-store/evidence.ts` `memory`; `MemoryPanel`; `Progress.inbox` |
| F6 | `matter_memory` proposals in the Review Inbox and the Memory tab |
| G2 | `matter_edge`; `EvidenceStore.rebuildEdges`; `evidenceEdges` |
| H3 | `src/lib/evidence/layout.ts` (headers, footers, footnotes, paragraphs); `src/lib/document-intelligence/marks.ts`; the existing classification, entities, dates, amounts and citations |
| H4 | `detectMarks`; `page_mark`; marks on the Evidence tab |
| H5 | `src/lib/evidence/relations.ts`; `source_relation`; the relations in `EvidencePanel` |
| H6 | `src/lib/evidence/structure.ts`; `document_part`; `StructurePanel` |
| H7 | `evidence` table; `EvidencePanel` |
| H8 | `fact` table; `src/lib/evidence/facts.ts`; `FactsPanel`; the link form for issues, arguments and relief |
| H9 | `src/lib/evidence/contradictions.ts`; review items; `FactsPanel` |
| H10 | `src/lib/evidence/timeline.ts`; `FactsPanel` |
| H12 | `src/lib/evidence/templates.ts`; the template select in the record table |
| H13 | `src/main/document-ops.ts`; `EvidencePanel`: extract, split, merge, reorder, annotate, highlight, redact with a log |

The views are in `src/renderer/src/Phase4.tsx`. The new matter tabs are Facts, Evidence, Structure, Jurisdiction and Memory. The agent has `list_facts`, `propose_fact`, `list_evidence`, `propose_evidence`, `list_matter_memory`, `propose_matter_memory`, `get_jurisdiction`, `get_timeline`, `list_document_parts` and `get_contradictions`.

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `node --test tests/unit/evidence.test.ts` | 10 passed, 0 failed |
| `node --test tests/unit/document-ops.test.ts` | 1 passed, 0 failed |
| `node --test tests/unit/marks.test.ts` | 1 passed, 0 failed |
| `npm run test:unit` | 220 tests: 217 passed, 0 failed, 3 skipped; exit 0 |
| `npm run build` | "built in" three times |
| `npx playwright test tests/e2e/phase4.spec.ts` | 1 passed, 0 failed |
| `npx playwright test` | 58 tests: 56 passed, 2 skipped (the live-model tests), 0 failed; 4.8 min; exit 0 |

The full end-to-end run was on the final build, after the `source_analysis` guard, the layout and mark rules, and the fact-link form. An earlier run had one flaky “New matter” timeout in `v5 D`; that test passed alone and in the final run.

Pushed to `main`: `319b9b5` (the code) and `3b78703` (the documents and this record).

## Mismatches between documents and code, reported

- [docs/features.md](../../docs/features.md) H3 names docTR as the second engine. docTR is not vendored. The second engine remains PP-OCR. The spec records the difference.
- H3 names tables. The line boxes are kept, but a table is read as text lines, not as cells.
- H13 names convert. A PDF is already a PDF; the filing set's PDF/A conversion stays in the filing work. Document operations do not add a second converter.
- The evidence graph is written and counted, but it has no separate graph view. The Facts and Evidence tabs show the records and their sources.

## Not built, and said on screen or in the spec

- docTR, table cells, a trained handwriting classifier, and a graph view.
- The owner's exit (lesson L3): a real brief of more than 1,000 pages with coverage stated, anchored review-table cells, contradictions found and the jurisdiction report with its basis.

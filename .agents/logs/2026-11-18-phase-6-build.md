# Phase 6 build: drafting and verification, and the DHC filing set

Date: 2026-11-18. Owner instruction: implement phase 6 of the build plan. The spec is [../docs/specs/drafting-and-verification.md](../../docs/specs/drafting-and-verification.md).

## What was built

| Area | Code |
|---|---|
| The phase spec | `docs/specs/drafting-and-verification.md` |
| The document catalogue (L1, L3) | `src/lib/drafting/documents.ts`: 26 kinds, form/record/slot parts, the court DOCX formats from the adapter's rules, the pack-part mapping |
| The part library (L2, L8) | `src/lib/drafting/parts.ts`: facts (ids kept), prayers from recorded relief, the affidavit from the deponent's own words, chronology, para-wise reply, notices, letters |
| Paragraph links | `paragraph_link` gains `fact_ids` and `evidence_ids`; "Show source" shows facts and statements |
| Learned preferences (A7) | `src/lib/preferences/index.ts`: 8 keys, ask-once questions, the second identical correction proposes, applied-because; `advocate:setPreference` answers inside a task |
| Advocate memory (F2) | `propose_advocate_memory` agent tool (advocate scope only); a citation inserted in 2+ matters proposes a court-practice record |
| Citation insertion (L5) | `insert_citation` agent tool: a saved authority's citation, in the advocate's format, as a tracked change with the applied-because reason |
| Comparison (L6) | `compareRevisionToPdf`: the revision against its rendered PDF, both ways |
| Grounding (P1) | `src/lib/verification/grounding.ts`: verbatim quotes, page references, authority paragraphs; score and items; no model call |
| Provenance (P2) | `src/lib/verification/provenance.ts`: values on citations and facts; labels on sources; the Indian Kanoon rows read as unverified secondary; ruling R-5's client-supplied value |
| Citation checks (P3) | Coverage "checked N of M"; paragraph-exists and paragraph-supports-proposition blockers (the advocate's own assessment); the shared verification record in `corpus.db` (`shared_citation_check`) |
| Statute checks (P4) | `src/lib/verification/statute.ts`: in force on the governing date, version, repealed; `never`/`changed` unconfirmed |
| Procedure checks (P5) | `Filing.procedureRules`: `PROC-forum`, `PROC-route`, `PROC-limitation`, `PROC-rules`; a pack without a limitation rule never shows the SLP rule as its own |
| Fact checks (P6) | The fact rules join `checkDraft`: unconfirmed, disputed, open contradictions (never resolved silently), inferences labelled |
| Draft checks (P7) | `src/lib/verification/structure.ts`: template parts in order, numbering, cross-references, annexure references, the relief prayed, the page format, footnotes and tables reported |
| Markers (P8) | `[CITE]`, `[VERIFY]`, `[REVIEW]` (also in their parameterized form) beside `[TO BE COMPLETED`; an open marker blocks approval with `MARKERS_OPEN` |
| Reviewer note (P9) | `reviewer-note.ts`: sources read N of M, items by severity from the one mapping, currency, before relying; `severity_floor` in the skill gate; SK-027 0.2.0 carries kinds and severities |
| Injection scan (P10) | `src/lib/verification/injection.ts`: fixed patterns; at ingest and on `web_fetch`/`browser_read`, findings open `injection` review items and annotate the tool result |
| Disclosure (P11) | Stays in every filing package of every court; the DHC set carries it |
| The DHC filing set | `Filing.requiredDocuments` from the proceeding pack; PACK rows for annexure parts and unmapped parts; `filing:packCaseType` in the manifest |
| The window | The catalogue picker, the reviewer note and grounding score in the check panel, the preference question cards, the undo reason, the required-documents list, provenance badges on facts, the PDF compare |
| The exit-path test | `tests/e2e/phase6.spec.ts` |

## The exit path

A Delhi High Court W.P.(C) matter: the target set (the court's lists built from fixture documents with the adapter's own quotes), the four pack documents generated from templates, the [REVIEW] marker found with its evidence, the approval refused while markers stand, the agent's ground and citation kept through the tracked-change path, the citation format asked once and answered, the citation check with coverage and the attestation (ruling R-1), the same correction twice proposing `paragraph_length: short`, the affidavit from the deponent's recorded words with the link proven, the approvals, the filing set (four documents, AI-use disclosure, paper book), the manifest digest and signature `valid`, and both confirmations bound to the payload hash.

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 (run after each batch; the last run exits 0) |
| `node --test` per new suite | documents 7, preferences 6, grounding 5, provenance 5, statute 7, structure 6, injection 4, filing-target 5: all pass |
| `npm run test:unit` | 330 tests: 327 passed, 0 failed, 3 skipped (vendored-part suites skip elsewhere; the 3 skips are the live-network ones) |
| `npm run build` | built main, preload and renderer (three "built in" lines) |
| `npx playwright test` (the phase-end run) | 46 tests: 44 passed, 2 skipped (live-model tests need `OPENADVO_LIVE_MODEL`), 0 failed |
| Docs checks (agent-guide 9.1) | links resolve; 170 features, no gaps, no phase-order violations |

## Pre-existing defects found by the full run, and fixed

1. **`ResearchHub` did not create `<userData>/corpus`.** A fresh user-data folder crashed start-up ("unable to open database file") and every e2e test failed. The last full e2e run predates the hub (phase 5 added it; the phase-5 session record lists no full-suite run). Fixed in the owner, `src/main/studio.ts`: `mkdirSync(corpusFolder, { recursive: true })`.
2. **Phase-5 names missing from the exact lists in `tests/e2e/app.spec.ts`.** Seven bridge functions (`knowledgeHealth` … `decideResearchPlan`) and seven agent tools (`search_knowledge` … `write_research_memo`) were never added to the allowlist test. Added, with a comment naming the phase-5 gap.
3. **The `draft` table's kind CHECK listed only the seven pre-plan kinds.** The new kinds were refused by the constraint. The CHECK now comes from `DRAFT_KINDS`, and the pre-catalogue migration rebuilds the table once for an older matter.

## Mismatches and notes

- The steps 6 to 10 spec's Grounds approval now also needs the **support** assessment confirmed (P3: the passage supports the whole proposition). The test records it; the support control already existed in `StudioV5.tsx`.
- `markersIn` matches a marker in its parameterized form ("[REVIEW: what to do]") as well as bare; the feature spells the marker `[REVIEW]`, and the parameter names the work.
- The exit-path test drives `setTarget` with served fixtures of the DHC index page and the two rules documents, because the set-target path builds the court's lists, which download from the court's own site; the quotes in the fixtures are the adapter's own, so the items build as `verified`.
- The screenshot of the filing set is at `test-results/phase6-filing-set.png`.

## Known gaps and limits

- **The phase exit is owed by the owner (lesson L3):** draft review on a real draft with every error supported by a source, and a filing-ready Delhi High Court set the advocate files without changes.
- The reviewer note on skill outputs other than the draft check (the report card's own note) shows the run's `not_read` list; the full P9 shape lives on `DraftCheck` today.
- The context package's `preferences` kind is wired through the skill runner; the built-in skills do not name it yet (SK-027 does not need it; phase 8's drafting skills will).
- A shared verification record is written on each validator run; the view that reads it across matters is the Research tab's `sharedChecks` field — a dedicated view can come with phase 9's monitoring.
- `getInbox` on the Review Inbox shows `injection` items with the pattern and the quote; a source-wide "scan report" view is not built.

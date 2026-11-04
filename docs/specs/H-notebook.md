# H. Notebook

Components: H01 to H09. Conventions, test kinds and status words are in the [README](README.md).

**Status:** the item kinds, both components, the Factual Matrix, chronology with exclusions, conflicts, readiness, human confirm and skip, corrections, the impugned order record, trace and the six views work. Remaining: the procedural-history and authority writers (after M and I), the source peek on the real viewer raster (after J's PDF viewer), the List of Dates generator end to end (J10), and the ULOS-N bundle check (after K).

## Purpose

The integrated matter record the advocate and agent work through. Eight sections: source documents, procedural history, Factual Matrix, chronology, legal issues, authorities, work products, review and verification. It fills as documents arrive. It is schema shaped, not a free narrative. It has two components: items from the court portal, which ULOS-N can check, and files supplied by the client, which are tagged and never checked.

## Decisions implemented

RQ-06, RQ-23, RQ-45, RQ-61, RQ-62, L-05, H-12, P9.

## Depends on

- C: every Notebook write commits through C01.
- G: lines, entities, disputes. F: origins and capture records.
- E04, E05: queries and the traceability chain.
- J: the source peek and the generators. K and U: ULOS-N, integrated last.
- The Notebook is record kinds in `matter.db` plus queries. The graph is a projection, not a source of truth.

## Non-goals

- No free-form model narrative as a record. Model suggestions are candidates, marked.
- The Notebook never points into the draft store. Drafts point at the Notebook.
- No "unverifiable" label on client files. They are tagged `client_supplied`.

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa notebook show [--section <s>]` | query | One or all sections |
| `oa notebook item <id> [--version <n>]` | query | One item with anchors, origin, status |
| `oa notebook facts [--status candidate\|confirmed\|disputed]` | query | The Factual Matrix |
| `oa notebook chronology [--view <v>]` | query | The chronology with exclusions applied by view |
| `oa notebook exclude --view <v> --event <id>\|--category <c>` | internal | Hides an event or category in a view without deleting it |
| `oa notebook propose <item.json>` / `oa notebook extract <doc>` | internal | A writer proposes items |
| `oa notebook correct <id> --reason <r> <patch.json>` | internal | A new version of an item |
| `oa notebook confirm <fact>` | human | Confirms a candidate fact |
| `oa notebook skip <review-item> --reason <r>` | human | Skips a review item |
| `oa notebook impugned set --court-type ... --order-date <d> [--cnr <c>]` | internal | Records the impugned order facts |
| `oa notebook ready` | query | Readiness and what blocks it |
| `oa notebook conflicts` | query | Date, party and amount conflicts |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Notebook | The eight sections with counts of candidate, confirmed, disputed and excluded items | Filter, open any item |
| Factual Matrix | Each event with date, date type, source, method, uncertainty, conflicts and confirmation | Confirm a fact (human control) |
| Chronology | Dated events per view, excluded ones hidden behind "show excluded" | Exclude or restore an event or category |
| Conflicts | Each conflict with every anchor | Open each source side by side in splits |
| Readiness | Ready, or the exact list of blockers | Open each blocker |
| Trace | Extract, line, page, source hash, original file for any item | Open each step |

## Rules

1. **Item kinds.** Each section has its own item kind with a schema (H01). Every item carries anchors, origin, extraction method, status and record version.
2. **Two components.** A source-document item is `court_portal` or `client_supplied`. Only `court_portal` items go to ULOS-N. `client_supplied` items are never described as verified or unverifiable (RQ-45, RQ-61).
3. **Writers.** The domain service for each step (ingestion, OCR, extraction, conflict detection, procedural history from portal orders, research) proposes its items. The kernel commits (RQ-06).
4. **Procedural history.** Each event links to its supporting document and location: orders, applications, hearings, disposal, filing and limitation dates (H03).
5. **Factual Matrix.** Each event has an id, a date or range, a date type (`explicit`, `inferred`, `unresolved`), a description, a source anchor, an extraction method, an uncertainty status, conflicting evidence and a confirmation status (H04).
6. **Chronology.** Every dated event appears. Exclusion is a per-view filter and never deletes (H05).
7. **Conflicts.** H09 flags conflicting dates, party names and amounts as review items. It never resolves them.
8. **Only checked dates in generated prose.** A disputed, inferred-unconfirmed or unresolved date cannot appear in a generated List of Dates or Synopsis sentence.
9. **Impugned order.** Identified by the lower-court search facts (court type, state, bench, case type, number, year, order date) plus the CNR when known (RQ-62).
10. **Readiness.** No ingestion jobs queued or running, and every review item resolved or skipped by the advocate. A milestone, not a lock (H07). Skip is `human` (L-05).
11. **Traceability.** `oa trace` from any item returns extract, line, page, source hash, original file.
12. **Corrections.** A new version with a reason; the old version stays readable.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| H-AC-01 | Every Notebook item in the fixture matter has an anchor that resolves to a blob region. | [AUTO] | done |
| H-AC-02 | A `client_supplied` item is never in a ULOS-N bundle and shows "Supplied by client". | [AUTO] | done |
| H-AC-03 | Excluding an event from a view leaves it in every other view and in `oa notebook facts`. | [AUTO] | done |
| H-AC-04 | Two documents giving different dates for one order produce one conflict item linking both anchors. | [AUTO] | done |
| H-AC-05 | `oa notebook ready` is false while any job runs or any review item is open, and lists them. | [AUTO] | done |
| H-AC-06 | `oa notebook skip` from a harness connection is refused. | [AUTO] | done |
| H-AC-07 | A generated List of Dates contains no disputed, unconfirmed-inferred or unresolved date. | [AUTO] | done |
| H-AC-08 | A correction leaves the earlier version readable through `--version`. | [AUTO] | done |
| H-AC-09 | The impugned order record round-trips to the lower-court search and finds the same case on the recorded portal. | [AUTO] | done |
| H-AC-10 | For a real matter, the procedural history and Factual Matrix match a lawyer's reconstruction. | [HUMAN] | remaining |
| H-AC-11 | The readiness view lists each blocking job and item, and each opens its item. | [AUTO] | done |
| H-AC-12 | Every item opens its source peek in one action and its trace in one more. | [AUTO] | done |
| H-AC-13 | Excluded events show under "show excluded" and are never missing from the Factual Matrix. | [AUTO] | done |
| H-AC-14 | The procedural-history writer turns captured portal orders into events with anchors to each order. | [AUTO] | remaining |
| H-AC-15 | The source peek shows the anchored region highlighted on the pdfium raster. | [AUTO] | remaining |

### GUI tests

| ID | Behaviour | Status |
|---|---|---|
| H-GUI-01 | Confirm in the Factual Matrix draws through the human control and returns `notebook.confirm`. | remaining |
| H-GUI-02 | Opening a conflict puts its two sources in two view pane splits. | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| H-VIS-01 | Notebook, Factual Matrix, chronology, conflicts, readiness and trace in their six gallery states, with a client-supplied item and a disputed date. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| H-E2E-01 | Import an impugned judgment and two orders, OCR them, extract events, resolve one conflict and one dispute in the window, reach readiness, and generate a List of Dates whose every sentence traces to a page. | remaining |

## Edge cases

- An event with a date range ("between March and May 2019") or only a year.
- The same event in a court order and a client letter with different dates: a conflict, not a resolution.
- A party under different names across documents: party identity is advocate-confirmed.
- An impugned order whose CNR is unknown at first: recorded missing and filled later.

## Failure modes

| Failure | Honest state shown |
|---|---|
| A writer proposes an item with an unresolved anchor | Refused, audited; the step reports a failure. |
| Graph projection stale | Queries report the projection's last sequence, and it rebuilds. |

## Open questions

- OQ-04 (the `01-01-1900` placeholder is passed through verbatim).

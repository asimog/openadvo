# H. Notebook

Components: H01 to H09. See [README](README.md) for tags and conventions.

## Purpose

The integrated matter record the advocate and agent work through. Eight sections: source documents, procedural history, Factual Matrix, chronology, legal issues, authorities, work products, review and verification. It fills continuously as documents arrive. It is deterministic and schema shaped, not a free-form narrative. It has two components: items supplied by the court portal, which ULOS-N can check, and files supplied by the client, which are tagged and never checked.

## Decisions implemented

RQ-06, RQ-23, RQ-45, RQ-61, RQ-62, L-05, H-12.

## Depends on

- C (every Notebook write commits through C01).
- G (lines, entities, disputes).
- F (origins and capture records).
- E04 and E05 (queries and the traceability chain).
- K and U (ULOS-N checks the court-portal component).

## Assumptions

- The Notebook is a set of record kinds in `matter.db`, plus queries. The graph is a projection of them, not a source of truth.
- One writer per step: the domain service that did the work proposes, the kernel commits.

## Non-goals

- No free-form LLM narrative as a record. Model suggestions are candidates, marked as such.
- The Notebook never points into the draft store. Drafts point at the Notebook.
- No "unverifiable" label on client files. They are tagged `client_supplied`.

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa notebook show [--section <s>]` | query | One or all sections |
| `oa notebook item <id>` | query | One item with its anchors, origin and status |
| `oa notebook facts [--status candidate|confirmed|disputed]` | query | The Factual Matrix |
| `oa notebook chronology [--view <v>]` | query | The chronology with exclusions applied by view |
| `oa notebook exclude --view <v> --event <id>|--category <c>` | internal | Hides an event or category in a view without deleting it |
| `oa notebook confirm <fact>` | human | The advocate confirms a candidate fact |
| `oa notebook skip <review-item> --reason <r>` | human | The advocate skips a review item |
| `oa notebook impugned set --court-type ... --order-date <d> [--cnr <c>]` | internal | Records the impugned order facts |
| `oa notebook ready` | query | The readiness condition and what blocks it |
| `oa notebook conflicts` | query | Date, party and amount conflicts |

## Rules

1. **Item kinds.** Each section has its own item kind with a schema (H01). Every item carries its anchors, its origin, its extraction method, its status and its record version.
2. **Two components.** Every source-document item is either `court_portal` (from a portal capture) or `client_supplied` (from the client, by email or the advocate's import). Only `court_portal` items are sent to ULOS-N. `client_supplied` items are shown with that tag and are never described as verified or unverifiable (RQ-45, RQ-61).
3. **Writers.** The domain service for each step (ingestion, OCR, extraction, conflict detection, research) proposes its items. The kernel commits (RQ-06).
4. **Procedural history.** Each event links to its supporting document and exact location: orders, applications, hearings, disposal, filing and limitation dates (H03).
5. **Factual Matrix.** Each event has an event id, a date or date range, a date type (`explicit`, `inferred`, `unresolved`), a description, a source anchor, an extraction method, an uncertainty status, conflicting evidence, and a confirmation status (H04).
6. **Chronology.** Every dated event appears. Exclusion is a per-view filter and never deletes the event or its extract (H05).
7. **Conflicts.** H09 flags conflicting dates, party names and amounts as review items. It never resolves them.
8. **Only checked dates are used in generated prose.** A date that is disputed, inferred-unconfirmed or unresolved cannot appear in a generated List of Dates or Synopsis sentence (workflow details C).
9. **Impugned order.** Identified by the facts the portal's lower-court search uses (court type, state, bench, case type, number, year, order date) plus the CNR when known (RQ-62).
10. **Readiness.** Notebook ready means no ingestion jobs queued or running, and every review item resolved or explicitly skipped by the advocate. Readiness is a milestone, not a lock: research may start before it (H07). Skip is a `human` command (L-05).
11. **Traceability.** `oa trace` from any item returns the chain extract, line, page, source hash, original file (workflow details E).
12. **Corrections.** A correction is a new version of the item with a reason. The old version stays readable.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| H-AC-01 | Every Notebook item in the fixture matter has at least one anchor that resolves to a blob region. | [AUTO] |
| H-AC-02 | A `client_supplied` item is never included in a ULOS-N bundle, and is displayed with the "Supplied by client" tag. | [AUTO] |
| H-AC-03 | Excluding an event from a view leaves it in every other view and in `oa notebook facts`. | [AUTO] |
| H-AC-04 | Two documents giving different dates for the same order produce one conflict review item linking both anchors. | [AUTO] |
| H-AC-05 | `oa notebook ready` is false while any job is running or any review item is open, and lists them. | [AUTO] |
| H-AC-06 | `oa notebook skip` from a harness connection is refused. | [AUTO] |
| H-AC-07 | A generated List of Dates contains no date whose event is disputed, unconfirmed-inferred or unresolved. | [AUTO] |
| H-AC-08 | A correction leaves the earlier version readable through `oa notebook item <id> --version <n>`. | [AUTO] |
| H-AC-09 | The impugned order record round-trips to the portal's lower-court search and finds the same case on the fixture portal. | [AUTO] |
| H-AC-10 | For a real matter, the procedural history and Factual Matrix match what a lawyer reconstructs by hand. | [HUMAN] |

## Edge cases

- An event with a date range ("between March and May 2019").
- An event dated only by year.
- The same event described in a court order and in a client letter with different dates. Conflict, not resolution.
- A party described by different names across documents ("the appellant", a company's old name). Party identity is advocate-confirmed.
- An impugned order whose CNR is unknown when the matter opens. Recorded as missing and filled later.

## Failure modes

| Failure | Honest state shown |
|---|---|
| A writer proposes an item with an unresolved anchor | Refused, audited, and the step reports a failure. |
| Graph projection stale | Queries report the projection's last sequence number, and the projection rebuilds. |

## Observable outcomes

- Each section shows counts of candidate, confirmed, disputed and excluded items.
- The readiness indicator says ready, or lists exactly what blocks it.
- Every item has a source peek that opens the anchored region.

## Open questions

- OQ-04 (the `01-01-1900` placeholder is passed through verbatim).

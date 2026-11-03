# P. Observability and evaluation

Components: P01 to P07. See [README](README.md) for tags and conventions.

## Purpose

Seeing what happened in a run, measuring how good each gate is, and proving the integration claim. Traces and the run inspector are for after-the-fact review. The eval harness measures each gate on planted defects. Replay tests are the provider swap drill. iii is a development tool that may observe and keep disposable harness logs, and owns nothing.

## Decisions implemented

RQ-07, RQ-15, RQ-31, RQ-86, X-09, P9, M-01.

## Depends on

- D17 (the model trace store) and D07 (effect states).
- C07 (the ledger, joined by sequence number).
- B (replay drives the control protocol).

## Assumptions

- iii can read a local trace stream in a stable format.

## Non-goals

- No remote exporter. Local only.
- iii is never a record. Nothing it stores is needed for recovery or audit.
- Trace logs are not the canonical ledger and not the harness session store.

## Three kinds of log

| Kind | Where | Kept | Needed for |
|---|---|---|---|
| Canonical ledger | `matter.db`, kernel | Always, with the matter | Audit |
| Harness session store | `harness/session.db` | With the matter (OQ-12) | Recovery and replay |
| Development traces | iii, `tracing` sinks | Disposable, rotated | Debugging only |

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa runs list [--matter <id>]` | query | Runs with cost, duration, outcome |
| `oa runs inspect <run>` | query | Timeline of model calls, tool calls, control calls, gate waits, linked ledger events |
| `oa eval run [--gate <g>]` | internal | Runs the planted-defect corpus and reports catch rates |
| `oa eval report [--version <v>]` | query | Catch rate per gate per version |
| `oa replay <recording> [--swap <capability>=<impl>]` | internal | The swap drill |
| `oa diagnostics bundle --out <zip>` | internal | An inspectable diagnostics bundle, opt in |

## GUI

| View | Shows | The engineer or advocate can |
|---|---|---|
| Run inspector (P02) | A run's timeline of model calls, tool calls, control calls and gate waits, joined to ledger events | Open any span in the Inspector |
| Replay | A recorded run against a new loop, prompt or provider, with the first divergence side by side | Step to the divergence |
| Eval report | Catch rate per gate per version, and every miss | Open each miss |
| Galleries (A17) | Every view in fixture states | Capture screenshots for review |

## Rules

1. **Spans.** One span per model call, tool call, control call and gate wait, carrying the run, turn and, where one exists, the ledger sequence number (P01).
2. **Run inspector.** Shows inputs, outputs, cost, retries and linked events for a run. It reads the session store and the ledger, and works if iii is closed (P02).
3. **iii.** Reads the trace stream and may save harness trace logs. Closing, deleting or replacing iii loses nothing needed for audit or recovery (RQ-86).
4. **Planted-defect corpus.** Built from the Supreme Court Registry's list of filing defects, plus planted citation errors (wrong year, wrong serial, wrong parties, wrong paragraph, misquote, headnote pinpoint), legislation errors (repealed Act, missing section, wrong number and year) and OCR errors (digit swaps, negation flips). Each defect names the gate expected to catch it (RQ-15).
5. **Catch rate.** Reported per gate, per gate version, with every miss listed. A release does not ship with a catch rate below the gate's recorded floor.
6. **Swap drill.** A recorded matter run is replayed through the control protocol with one OCR engine swapped for the other, or with a different provider, and must reach the same Notebook state and ledger event kinds, with differences reported (RQ-07, X-09).
7. **Diagnostics.** A diagnostics bundle is built only on request, listed file by file before it is shared, and excludes blobs unless the advocate adds them (P07).

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| P-AC-01 | Every model call and tool call in a run has a span with a run id and turn. | [AUTO] |
| P-AC-02 | With iii not running and its data deleted, `oa runs inspect` still shows the full run. | [AUTO] |
| P-AC-03 | Every planted defect has an expected gate, and `oa eval run` reports each as caught or missed. | [AUTO] |
| P-AC-04 | A release build fails when a gate's catch rate is below its floor. | [AUTO] |
| P-AC-05 | The swap drill with the OCR engines swapped completes and reports differences, with no harness or kernel code change. | [AUTO] |
| P-AC-06 | The diagnostics bundle contains no blob unless added. | [AUTO] |
| P-AC-07 | The planted-defect corpus covers the Registry's defect list. | [HUMAN] (legal review) |
| P-AC-08 | A lawyer and an engineer can each explain a bad run from the run inspector. | [HUMAN] |
| P-AC-09 | A replay shows the first divergence side by side. | [AUTO] |

## Edge cases

- A run that spans a harness restart. One run id across both processes, joined through the session store.
- A defect the corpus cannot plant mechanically (a missing affidavit). Planted by omitting the document from the fixture payload.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Trace sink full | Oldest development traces rotated out. The session store and ledger are unaffected. |

## Observable outcomes

- The eval report lists every gate's catch rate and misses for the release.

## Open questions

- OQ-12 (session store retention).

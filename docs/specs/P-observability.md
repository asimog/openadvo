# P. Observability and evaluation

Components: P01 to P07. Conventions, test kinds and status words are in the [README](README.md).

**Status:** the ledger, the Inspector, galleries and the repository checks exist (owned by C, A and this group). Remaining: spans, the run inspector, the planted-defect corpus and catch rates, the swap drill, the replay view, diagnostics bundles, and the gallery snapshot harness every spec's visual tests run on.

## Purpose

Seeing what happened in a run, measuring how good each gate is, and proving the integration claim. The run inspector is for after-the-fact review. The eval harness measures each gate on planted defects. Replay is the provider swap drill. The snapshot harness turns every gallery into a visual test. iii is a development tool that owns nothing.

## Decisions implemented

RQ-07, RQ-15, RQ-31, RQ-86, X-09, P9, M-01, PH-09.

## Depends on

- D: the model trace store and effect states. C: the ledger, joined by sequence number.
- B: replay drives the control protocol. A: galleries.
- G: two real OCR engines, for the swap drill.

## Non-goals

- No remote exporter.
- iii is never a record. Nothing it stores is needed for recovery or audit.

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
| `oa runs inspect <run>` | query | Model calls, tool calls, control calls, gate waits, linked ledger events |
| `oa eval run [--gate <g>]` | internal | Runs the planted-defect corpus and reports catch rates |
| `oa eval report [--version <v>]` | query | Catch rate per gate per version |
| `oa replay <recording> [--swap <capability>=<impl>]` | internal | The swap drill |
| `oa diagnostics bundle --out <zip>` | internal | An inspectable diagnostics bundle, opt in |
| `oa-shell --snapshots [--update]` | separate executable | Renders every gallery and compares to committed PNGs |

## GUI

| View | Shows | The advocate or engineer can |
|---|---|---|
| Run inspector (P02) | A run's timeline joined to ledger events | Open any span in the Inspector |
| Replay | A recorded run against a new loop, prompt or provider, with the first divergence side by side | Step to the divergence |
| Eval report | Catch rate per gate per version, and every miss | Open each miss |

## Rules

1. **Spans.** One span per model call, tool call, control call and gate wait, with run, turn and the ledger sequence where one exists (P01).
2. **Run inspector.** Reads the session store and the ledger, and works with iii closed (P02).
3. **iii.** Reads the trace stream and may keep disposable logs. Removing it loses nothing (RQ-86).
4. **Planted-defect corpus.** From the Supreme Court Registry's filing-defect list, plus planted citation, legislation and OCR errors. Each defect names the gate expected to catch it (RQ-15).
5. **Catch rate.** Per gate and gate version, every miss listed. A release does not ship below a gate's floor.
6. **Swap drill.** A recorded run is replayed through the protocol with one OCR engine swapped for the other, or another provider, and must reach the same Notebook state and ledger event kinds, with differences reported (RQ-07).
7. **Diagnostics.** Built only on request, listed file by file before it is shared, and excluding blobs unless added (P07).
8. **Snapshots.** Every gallery state of every view is rendered by `egui_kittest` and compared to a committed PNG. A changed snapshot is committed with the change that caused it.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| P-AC-01 | Every model and tool call in a run has a span with run id and turn. | [AUTO] | remaining |
| P-AC-02 | With iii stopped and its data deleted, `oa runs inspect` still shows the full run. | [AUTO] | remaining |
| P-AC-03 | Every planted defect has an expected gate, and `oa eval run` reports each as caught or missed. | [AUTO] | remaining |
| P-AC-04 | A release build fails when a gate's catch rate is below its floor. | [AUTO] | remaining |
| P-AC-05 | The swap drill with the OCR engines swapped completes and reports differences with no harness or kernel change. | [AUTO] | remaining |
| P-AC-06 | The diagnostics bundle contains no blob unless added. | [AUTO] | remaining |
| P-AC-07 | The planted-defect corpus covers the Registry's defect list. | [HUMAN] | remaining |
| P-AC-08 | A lawyer and an engineer can each explain a bad run from the run inspector. | [HUMAN] | remaining |
| P-AC-09 | A replay shows the first divergence side by side. | [AUTO] | remaining |
| P-AC-10 | `oa-shell --snapshots` fails on any gallery state whose render differs from its committed PNG. | [AUTO] | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| P-VIS-01 | Run inspector, replay and eval report in their six gallery states. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| P-E2E-01 | Record a scripted matter run through OCR and Notebook, replay it with the engines swapped, and get the same Notebook state with a difference report. | remaining |

## Edge cases

- A run spanning a harness restart keeps one run id, joined through the session store.
- A defect that cannot be planted mechanically (a missing affidavit) is planted by omitting the document.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Trace sink full | Oldest development traces rotate out. The session store and ledger are unaffected. |

## Open questions

- OQ-12.

# N. Computer use and desktop apps

Components: N01 to N07. See [README](README.md) for tags and conventions.

## Purpose

Letting the agent operate applications outside our window, such as Word when installed, through UI Automation first and vision only as a fallback. Letting the advocate point at something on screen and mean it. This group comes after the core workflow works through our own panes, because typed state is always preferred.

## Decisions implemented

RQ-73 (order of surfaces), X-04 (Word is a fidelity oracle, never the record), OQ-03, P9.

## Depends on

- B06 (`agent-desktop`, vendored).
- D11 (policy).
- J12 (the fidelity oracle uses Word through N07).

## Assumptions

- `agent-desktop` exposes windows, controls, invoke, read and stable references through UI Automation on Windows.

## Non-goals

- Word never becomes the record and never writes into the draft store directly.
- No desktop action against a filing destination.
- No screenshot leaves the machine without masking.

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa desktop windows` | query | Top-level windows of allowed applications |
| `oa desktop tree <window>` | query | The UI Automation tree with stable references |
| `oa desktop invoke <ref> [--dry-run]` | external | Invokes a control |
| `oa desktop type <ref> --text <t>` | external | Types into a control |
| `oa desktop screenshot <window> --out <png>` | query | Masked before any model sees it |
| `oa desktop apps` | query | The target app registry with per-app quirks |
| `oa word render <docx> --out <pdf>` | internal | Word through COM, for the fidelity oracle |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Desktop actions | Every desktop action with the application, the element reference, the masked screenshot and the result | Open the masked screenshot |
| Allow list | The per-application allow list (firm layer) | Change it |

## Rules

1. The order of surfaces is UI Automation, then vision (N02). Vision acts only after UI Automation reports no usable element.
2. Every desktop action passes D11 policy: a per-app allow list, a confirmation class per action, and dry run support (N04).
3. Screenshots are PII-masked before they are sent to any model, using the matter's entity list (N06).
4. The advocate's point-and-box overlay (N03) produces an anchor or a screen region the agent receives as a typed reference.
5. Word through COM (N07) is used for rendering comparisons and when the advocate asks. Its output is imported as a new revision through J08 only when the advocate asks.
6. The target app registry (N05) is data: per application, the allowed actions and known quirks.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| N-AC-01 | An action on an application not in the allow list is refused. | [AUTO] |
| N-AC-02 | A screenshot sent to a model has every matter party name masked. | [AUTO] |
| N-AC-03 | Vision is not invoked when UI Automation returns the target element. | [AUTO] |
| N-AC-04 | `oa word render` produces a PDF used by the fidelity oracle, and never a revision unless asked. | [AUTO] |
| N-AC-05 | Pointing at a paragraph in our viewer with the overlay gives the agent its anchor. | [AUTO] |
| N-AC-06 | The agent's operation of Word is reliable enough for advocates to trust it. | [HUMAN] |
| N-AC-07 | Every desktop action appears in the desktop actions view with its element reference and masked screenshot. | [AUTO] |

## Edge cases

- Word not installed. The fidelity oracle runs without the Word column and says so.
- A modal dialog in another application blocks the target. The agent reports it and stops.

## Failure modes

| Failure | Honest state shown |
|---|---|
| UI Automation element reference goes stale | Re-query once, then report `element_stale`. |
| COM automation hangs | Killed at timeout, reported as a tool failure. |

## Observable outcomes

- Every desktop action appears as a tool card with the application, the element and the result.

## Open questions

- OQ-03 (renderer).

# N. Computer use and desktop apps

Components: N01 to N07. Conventions, test kinds and status words are in the [README](README.md).

**Status:** not started. Built after the core workflow works through our own views.

## Purpose

Letting the agent operate applications outside our window, such as Word when installed, through UI Automation first and vision only as a fallback; and letting the advocate point at something on screen and mean it.

## Decisions implemented

RQ-73, X-04, OQ-03, P9.

## Depends on

- B06: `agent-desktop`, vendored under Q08. D11: policy. J12: the fidelity oracle uses Word through N07.

## Vendored dependencies

| Dependency | Runs as | Interface |
|---|---|---|
| `agent-desktop` | Separate process | Windows, controls, invoke, read and stable references through UI Automation |

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
| `oa desktop apps` | query | The target app registry |
| `oa word render <docx> --out <pdf>` | internal | Word through COM, for the fidelity oracle |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Desktop actions | Each action with application, element reference, masked screenshot and result | Open the masked screenshot |
| Allow list | The per-application allow list (firm layer) | Change it |

## Rules

1. UI Automation first; vision only after it reports no usable element (N02).
2. Every desktop action passes D11 policy: a per-app allow list, a confirmation class per action, dry run (N04).
3. Screenshots are masked with the matter's entity list before any model sees them (N06).
4. The point-and-box overlay (N03) gives the agent an anchor or a screen region as a typed reference.
5. Word through COM (N07) is for rendering comparisons, and its output becomes a revision only when the advocate asks.
6. The target app registry (N05) is data.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| N-AC-01 | An action on an application not in the allow list is refused. | [AUTO] | remaining |
| N-AC-02 | A screenshot sent to a model has every party name masked. | [AUTO] | remaining |
| N-AC-03 | Vision is not invoked when UI Automation returns the element. | [AUTO] | remaining |
| N-AC-04 | `oa word render` produces a PDF for the fidelity oracle and never a revision unless asked. | [AUTO] | remaining |
| N-AC-05 | Pointing at a paragraph in our viewer gives the agent its anchor. | [AUTO] | remaining |
| N-AC-06 | The agent's operation of Word is reliable enough for advocates to trust. | [HUMAN] | remaining |
| N-AC-07 | Every desktop action appears in the desktop actions view with its reference and masked screenshot. | [AUTO] | remaining |

### Contract tests

| ID | Contract | Status |
|---|---|---|
| N-CT-01 | `agent-desktop` lists windows and returns stable references for Notepad and Word. | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| N-VIS-01 | Desktop actions and allow list in their six gallery states. | remaining |

## Edge cases

- Word not installed: the fidelity oracle runs without the Word column and says so.
- A modal dialog in another application blocks the target: the agent reports it and stops.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Element reference goes stale | Re-query once, then `element_stale`. |
| COM automation hangs | Killed at timeout, reported as a tool failure. |

## Open questions

- OQ-03.

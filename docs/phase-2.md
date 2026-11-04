# Phase 2: full integration

Phase 2 turns the built groups into one integrated application on real dependencies. The design is in [decisions.md](decisions.md) (PH-01 to PH-11), the system shape in [architecture.md](architecture.md), and every task in the specs' status lines and test rows. This file is the working plan: what each step must prove, how work runs in parallel, and how to direct it.

## Goal

An advocate installs the application with no network, opens a matter, imports and captures the record, sees it OCR'd by both real engines, works through the Notebook with the orchestrator in the chat pane, drafts in DOCX with hosted WordCraft, and gets a PDF/A filing document. Verification (K, U) and filing (L) are integrated last.

## Steps and exit tests

A step is done when every test named here is `done` in its spec.

| Step | Work | Done when |
|---|---|---|
| 1 | Control surface: kernel-decided origin, one kernel per folder, contract crate, write lock first, outbox, shutdown | B-AC-14 to B-AC-18, A-AC-24, C-AC-22 to C-AC-25, E-CT-01 |
| 2 | The window: screen, three regions, UI module, snapshot harness, chat pane on a scripted provider | A-AC-06, A-AC-20, A-AC-25, A-AC-26, A-GUI-01 to A-GUI-08, A-VIS-01 to A-VIS-04, D-GUI-01 to D-GUI-05, D-VIS-01, D-VIS-02, P-AC-10 |
| 3 | Live provider, step-scoped grants, disputed-span marking | D-AC-01 (live), D-AC-05, D-AC-23 to D-AC-26, D-E2E-01, D-E2E-02 |
| 4 | Vendor pdfium, Tesseract, PaddleOCR; OCR on real engines | Q-AC-09, Q-AC-10, G-CT-01 to G-CT-07, G-AC-01, G-AC-02, G-AC-11, G-AC-13, G-AC-14, G-AC-18, G-E2E-01, G-E2E-02 |
| 5 | Document viewers on pdfium; ingest end to end | J-AC-24, J-GUI-01, J-GUI-04, J-VIS-02, H-AC-15, F-E2E-02, E-E2E-01 |
| 6 | Vendor Chromium; browser in the view pane; live capture | M-CT-01 to M-CT-04, M-AC-01, M-AC-02, M-AC-05, M-AC-08, M-AC-11 to M-AC-13, M-E2E-01, F-AC-04, F-AC-05, F-E2E-01 |
| 7 | Vendor WordCraft, PdfCraft, `docx-rs`, veraPDF; hosted editing; filing PDF/A | J-CT-01 to J-CT-07, J-AC-01, J-AC-02, J-AC-09 to J-AC-14, J-AC-23, J-E2E-01, J-E2E-02 |
| 8 | Notebook writers, firm data, stores, observability, packaging | H-AC-14, H-E2E-01, O-AC-06, O-AC-07, E-AC-01 to E-AC-14, P-AC-01 to P-AC-06, P-E2E-01, Q-AC-01 to Q-AC-08, Q-E2E-01 |
| 9 | Research Studio | I-AC-01 to I-AC-21, I-E2E-01 |
| 10 | `ulos` and the verification adapter | K-AC-01 to K-AC-20, K-E2E-01, K-E2E-02 |
| 11 | Filing | L-AC-01 to L-AC-14, L-E2E-01 |

`[HUMAN]` rows are signed off by a person at the end of the step that builds them.

## Parallel streams

Streams that touch different files run in their own sessions at the same time. Each session takes one spec and one step.

| Stream | Steps | Files | Can start |
|---|---|---|---|
| Control surface | 1 | `oa-control`, `oa-protocol`, `oa-client`, `oa-cli`, `oa-store`, `oa-kernel/src/lib.rs` | Now |
| Vendoring | 4, then 6 and 7 | `vendor/`, `oa-ocr`, new wrapper crates | Now |
| Window | 2 | `oa-shell` | After step 1 moves the contract types, because both touch `oa-shell/Cargo.toml` |
| Harness | 3 | `oa-harness`, `oa-session`, `oa-cli/src/harness_cmds.rs` | After step 2's chat pane exists |

A session that needs to change a decision stops and asks before editing `decisions.md`.

## The window

Settled (PH-05): left pane, chat pane, view pane, no status bar. Open (OQ-16): the look.

Building blocks (PH-10):

| Choice | Use |
|---|---|
| Our own `oa-shell/src/ui/` module | Theme tokens, table, widgets, the human control, the frame |
| `egui_extras::TableBuilder` | Virtualised table rows |
| `egui_kittest` | GUI tests by AccessKit role and name, and gallery snapshots |
| `egui_commonmark` | The chat transcript and matter memory |
| An icon font through one function | Icons |

`egui-shadcn` is not a dependency: version 0.1 with no release, and it requires egui 0.33 while the workspace is on 0.31. Its MIT licence allows borrowing its token set and component ideas into the UI module with the notice. Upgrading egui is its own change, made for its own reasons.

## Directing the work

For a view or visual change, name it by its code names so it cannot be misread:

```
View:     ViewId::Evidence  (oa-shell --gallery evidence)
State:    empty | loading | error | typical | large | disputed
Change:   one sentence on what should be different
Why:      the advocate task it serves
Accept:   the test id, or a marked-up gallery screenshot
Not:      what must not change
```

One view per request. A visual-only change touches the UI module and that view, nothing else.

For a capability, name the spec and the test ids. The spec's status line and test rows are the record of progress; update them in the same change as the code.

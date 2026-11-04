# Component specs

One implementation contract per component group of [component-map.md](../component-map.md), plus the validator. Each spec can be implemented on its own, except where it names a dependency. [decisions.md](../decisions.md) governs: a spec that disagrees with it is a defect.

## Build order and index

Groups are built in this order (decision PH-06, PH-07). A group's status line says what is left.

| Step | File | Group | Component ids |
|---|---|---|---|
| 1 | [B-control-surface-cli.md](B-control-surface-cli.md) | Control surface and the `oa` CLI | B01 to B08 |
| 1 | [C-kernel.md](C-kernel.md) | Kernel | C01 to C17 |
| 1 | [E-stores.md](E-stores.md) | Stores | E01 to E07 |
| 1 | [R-cloud-seams.md](R-cloud-seams.md) | Cloud seams | R01 to R04 |
| 2 | [A-shell-workspace.md](A-shell-workspace.md) | Shell and workspace | A01 to A18 |
| 2, 3 | [D-harness.md](D-harness.md) | Harness and the chat pane | D01 to D19 |
| 4 onward | [Q-build-ship.md](Q-build-ship.md) | Build, vendoring and ship | Q01 to Q08 |
| 4 | [G-ocr-document-intelligence.md](G-ocr-document-intelligence.md) | OCR and document intelligence | G01 to G13 |
| 5, 7 | [J-documents-editors.md](J-documents-editors.md) | Documents, viewers and editors | J01 to J15 |
| 5, 6 | [F-capture-ingest.md](F-capture-ingest.md) | Capture and ingest | F01 to F13 |
| 6 | [M-browser.md](M-browser.md) | Browser | M01 to M10 |
| 8 | [H-notebook.md](H-notebook.md) | Notebook | H01 to H09 |
| 8 | [O-firm-data.md](O-firm-data.md) | Firm data | O01 to O04 |
| 8 | [P-observability.md](P-observability.md) | Observability and evaluation | P01 to P07 |
| 9 | [I-research-studio.md](I-research-studio.md) | Research Studio | I01 to I14 |
| 10 | [U-ulos-validator.md](U-ulos-validator.md) | The `ulos` validator (its own repository) | K11, K12 |
| 10 | [K-verification-adapter.md](K-verification-adapter.md) | Verification adapter | K01 to K14 |
| 11 | [L-filing.md](L-filing.md) | Filing | L01 to L04 |
| Later | [N-desktop-computer-use.md](N-desktop-computer-use.md) | Computer use and desktop apps | N01 to N07 |

## Shape of every spec

1. **Status.** One line: what works against real dependencies, and what is left.
2. **Purpose.** What the group is for.
3. **Decisions implemented.** The decision ids it carries.
4. **Depends on.** Other groups and hidden dependencies (H-nn) it relies on.
5. **Vendored dependencies.** Where the group runs third-party code: what, where it lives, and its contract tests.
6. **Non-goals.** What the group must not do.
7. **CLI.** The commands, which exist before any view.
8. **GUI.** The views, and what each lets the advocate inspect or do.
9. **Rules.** Numbered and normative. "Must" means a test can fail.
10. **Tests.** Every kind that applies, each row with a status.
11. **Edge cases** and **Failure modes.** Each with the honest state shown.
12. **Open questions.** Pointers to [decisions.md](../decisions.md) section 11.

## Tests

### Kinds

| Kind | Id form | What it proves | How it runs |
|---|---|---|---|
| Acceptance | `G-AC-03` | One rule holds, through the commands | `cargo test`, against a real kernel and real dependencies |
| GUI | `G-GUI-01` | A view behaves: keyboard paths, the actions it issues, the Inspector opens | `egui_kittest`, driving the view by AccessKit role and name, with fixture query results and no kernel |
| Visual | `G-VIS-01` | A view looks right in each gallery state | `egui_kittest` image snapshots of the gallery, compared to committed PNGs |
| End to end | `G-E2E-01` | A workflow slice works across groups | A scripted `oa` session against `oa kernel serve` with the real vendored binaries, asserting replies and ledger events |
| Contract | `G-CT-01` | A vendored dependency still behaves as we rely on | A test against the vendored binary or library with a fixed corpus, run on every change to the vendored tree |

A test's function name contains its id in snake case, for example `g_ac_03_date_digit_mismatch_disputes` or `a_gui_02_j_and_k_move_through_the_inbox`.

### Tags and status

| Tag | Meaning |
|---|---|
| **[AUTO]** | An automated test asserts it. |
| **[HUMAN]** | A person judges it: a legal judgement, visual quality, or an assistive tool. |
| **[AUTO+HUMAN]** | A test covers the mechanical part and a person reviews the rest. Both are needed before release. |

| Status | Meaning |
|---|---|
| `done` | The test exists and passes against the real dependency. A `[HUMAN]` item is `done` when a person has signed it off. |
| `remaining` | No test yet, or the test passes only against a test double. |

A test double is allowed only in a test, behind a seam that has a real adapter in production. A production build refuses test doubles (PH-06).

### Visual tests shared by every view

Every view has a gallery (A17) in six fixture states: empty, loading, error, typical, large, disputed. Each spec's visual tests mean: each view the spec owns has a committed snapshot in each state, and the snapshot test passes. A snapshot changes only in a commit that says why.

### Release gates

The kill tests, the loop conformance fixtures and every contract test must pass for any change in groups C, D, G, J, K, L, M or Q. The `ulos` conformance suite becomes a gate when K is integrated.

## Conventions shared by every group

### Two binaries

| Binary | Role | Talks to |
|---|---|---|
| `oa` | Drives the running application, or runs an in-process kernel when none is serving (PH-02). A thin client of the control protocol. | The kernel over a local named pipe |
| `ulos` | The validator. Deterministic, no model, no access to the kernel or the harness. | Court sources over HTTPS, files given on the command line |

### Command classes

| Class | Meaning | May the harness call it? |
|---|---|---|
| `query` | Reads state. No effect. | Yes |
| `internal` | Changes canonical or local state inside the workspace. Idempotency key required. | Yes, subject to grants |
| `external` | Has an effect outside the machine. Goes through the outbox. Idempotency key required. | Yes, subject to grants and approvals |
| `human` | Records a human decision: approvals, filing confirmations, skips, typed copies, attestations, OCR decisions, voice and limitation confirmations, browser attachment, CAPTCHA handoff completion. | **No.** From `cli` it needs an OS user-presence prompt. From `ui` it needs a deliberate control. |

### CLI output and exit codes

- Every command accepts `--json`. Without it, output is short human text. With it, stdout is one JSON object per line and nothing else. Diagnostics go to stderr.
- Effectful commands accept `--dry-run`.
- `oa` exit codes: `0` success, `1` completed with a negative result, `2` usage error, `3` refused by policy or permission, `4` an external effect is `unknown` and needs reconciliation, `5` a dependency is unavailable, `10` internal error.
- `ulos` exit codes: `0` every outcome `verified` or `not_applicable`, `1` at least one `failed`, `3` at least one `unresolved` and none `failed`, `2` usage error, `10` internal error.

### Identifiers

- Objects: `urn:ulos:{type}:{ulid}`. Judgments: `urn:ulos:judgment:insc:{year}:{serial}`. Acts and sections: `urn:ulos:act:indiacode:{actId}`, `urn:ulos:section:indiacode:{sectionId}`.
- Bytes: `sha256:{lowercase hex}`.
- Court identifiers: stored as issued, `{scheme, code}`, label verbatim.
- Anchors: `{target, selector}`. The target is a blob hash or a draft revision hash. The selector is a page and box, a line hash, or a DOCX paragraph id with a character range.

### Time

Record times are UTC, RFC 3339 with milliseconds. Display is IST. Dates extracted from documents are calendar dates with no zone, plus a time of day when the document states one.

### Vocabulary

Use the terms in [decisions.md](../decisions.md) section 3: "matter workspace" for one matter, "draft" only for our own documents, "verified" only for a validator outcome, "verification proof" for what a verification record points at.

## GUI conventions shared by every group

The window is `oa-shell` (spec A). It holds no canonical state, and it depends on `oa-protocol`, never on the kernel (PH-03).

1. **Parity.** Every `query` command has a view, and every GUI action issues a registered command (A-AC-16).
2. **The Inspector.** Every item in every view opens the Inspector with one action: the raw record, the ledger events that touched it, links out and backlinks, and the producing command, origin and actor.
3. **Nothing only in a log.** An error, refusal, unknown effect or degraded adapter is a visible state in the view that owns it, and Signal in the review inbox when it needs the advocate.
4. **Human commands need a distinct gesture.** A `human` command is drawn only through the UI module's human control, which names exactly what is decided, takes no default focus and has no shortcut.
5. **Keyboard first.** Every view works without a mouse, and the command bar reaches every command.
6. **Galleries.** Every view has a gallery of the six fixture states, runnable with no kernel.
7. **Honest labels.** Validator outcomes, quick-check results, advisory scores and advocate attestations each have their own visual treatment, defined once in the theme.
8. **Views live in the view pane.** A view is a table, a document surface, a hosted window or the browser. The chat pane is only the orchestrator.

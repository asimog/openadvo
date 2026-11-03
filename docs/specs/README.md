# Component specs

Status: implementation specs, 4 November 2026. One file per component group of [component-map.md](../component-map.md), plus the validator. Each spec is written so an agent can implement its group without reading the others, except where it names a dependency.

The decisions these specs implement are in [decisions.md](../decisions.md). When a spec and the decisions disagree, the decisions govern and the spec is a defect.

## Index

| File | Group | Component ids | First build step |
|---|---|---|---|
| [A-shell-workspace.md](A-shell-workspace.md) | Shell and workspace | A01 to A15 | 1 |
| [B-control-surface-cli.md](B-control-surface-cli.md) | Control surface and the `oa` CLI | B01 to B08 | 2 |
| [C-kernel.md](C-kernel.md) | Kernel | C01 to C16 | 1 |
| [D-harness.md](D-harness.md) | Harness | D01 to D17 | 2 |
| [E-stores.md](E-stores.md) | Stores | E01 to E07 | 1 |
| [F-capture-ingest.md](F-capture-ingest.md) | Capture and ingest | F01 to F13 | 4 |
| [G-ocr-document-intelligence.md](G-ocr-document-intelligence.md) | OCR and document intelligence | G01 to G13 | 3 and 5 |
| [H-notebook.md](H-notebook.md) | Notebook | H01 to H09 | 6 |
| [I-research-studio.md](I-research-studio.md) | Research Studio | I01 to I14 | 8 |
| [J-documents-editors.md](J-documents-editors.md) | Documents, viewers and editors | J01 to J14 | 3, 7 and 9 |
| [K-verification-adapter.md](K-verification-adapter.md) | Verification adapter | K01 to K14 | 8 |
| [L-filing.md](L-filing.md) | Filing | L01 to L04 | 10 |
| [M-browser.md](M-browser.md) | Browser | M01 to M10 | 4 |
| [N-desktop-computer-use.md](N-desktop-computer-use.md) | Computer use and desktop apps | N01 to N07 | after 9 |
| [O-firm-data.md](O-firm-data.md) | Firm data | O01 to O04 | after 6 |
| [P-observability.md](P-observability.md) | Observability and evaluation | P01 to P07 | 2 onward |
| [Q-build-ship.md](Q-build-ship.md) | Build and ship | Q01 to Q07 | 1 onward |
| [R-cloud-seams.md](R-cloud-seams.md) | Cloud seams | R01 to R04 | 1 |
| [U-ulos-validator.md](U-ulos-validator.md) | The `ulos` validator CLI | Standard and K11, K12 | 8 |

## Shape of every spec

Each spec has the same sections, in this order.

1. **Purpose.** What the group is for, in one paragraph.
2. **Decisions implemented.** The decision ids this spec carries.
3. **Depends on.** The other groups it calls, and the hidden dependencies (H-nn) it relies on.
4. **Assumptions.** Things taken as true. If one is false, the spec needs revision.
5. **Non-goals.** Things this group must not do, even if it could.
6. **CLI.** The commands the group exposes first, before any pane.
7. **Rules.** Numbered, normative. "Must" means a test can fail.
8. **Acceptance criteria.** Each tagged with how it is checked.
9. **Edge cases.**
10. **Failure modes.** What happens when it breaks, and the honest state shown.
11. **Observable outcomes.** What the advocate, the ledger and the CLI show.
12. **Open questions.** Pointers to [decisions.md](../decisions.md) section 11, and any local ones.

## Test tags

| Tag | Meaning |
|---|---|
| **[AUTO]** | Can become an automated test in CI. The criterion names an observable a test can assert. |
| **[HUMAN]** | Needs a person to judge. Usually a legal judgement, a visual quality judgement or an accessibility check with a real assistive tool. |
| **[AUTO+HUMAN]** | An automated test covers the mechanical part, and a person reviews the rest. Both are required before release. |

## Conventions shared by every group

### Two binaries

| Binary | Role | Talks to |
|---|---|---|
| `oa` | Drives the running application, or starts a headless kernel for scripted runs. A thin client of the control protocol (B01). | The kernel process over a local named pipe |
| `ulos` | The validator. Deterministic, no model, no access to the kernel or the harness. | Court sources over HTTPS, files given on the command line |

### Command classes

Every control command has exactly one class. The class decides policy, logging and who may call it.

| Class | Meaning | May the harness call it? |
|---|---|---|
| `query` | Reads state. No effect. | Yes |
| `internal` | Changes canonical or local state inside the workspace. Idempotency key required. | Yes, subject to grants |
| `external` | Has an effect outside the machine (download, upload, portal action, email). Goes through the outbox. | Yes, subject to grants and approvals |
| `human` | Records a human decision: approvals, filing confirmations, skips, typed copies, attestations, CAPTCHA handoff completion. | **No.** Refused on harness connections. From the CLI it needs an OS user-presence prompt. |

### CLI output and exit codes

- Every command accepts `--json`. Without it, output is short human text. With it, stdout is one JSON object per line and nothing else.
- Diagnostics go to stderr.
- Effectful commands accept `--dry-run`, which validates and prints the proposal without committing.
- `oa` exit codes: `0` success, `1` completed with a negative result (a check failed, a gate is blocked), `2` usage error, `3` refused by policy or permission, `4` an external effect is in state `unknown` and needs reconciliation, `5` a dependency is unavailable (a process is down, a source is unreachable), `10` internal error.
- `ulos` exit codes: `0` every outcome is `verified` or `not_applicable`, `1` at least one `failed`, `3` at least one `unresolved` and none `failed`, `2` usage error, `10` internal error.

### Identifiers

- Objects: `urn:ulos:{type}:{ulid}`. Judgments: `urn:ulos:judgment:insc:{year}:{serial}`. Acts and sections: `urn:ulos:act:indiacode:{actId}`, `urn:ulos:section:indiacode:{sectionId}`.
- Bytes: `sha256:{lowercase hex}`.
- Court identifiers: stored as issued, `{scheme, code}` with the label verbatim.
- Anchors: `{target, selector}` where the target is a blob hash or a draft revision hash, and the selector is a page and box, a line hash, or a DOCX paragraph id with a character range.

### Time

All record times are UTC in RFC 3339 with milliseconds. Display is in IST. Dates extracted from documents are calendar dates with no time zone, plus an optional time of day when the document states one.

### Vocabulary

Use the terms in [decisions.md](../decisions.md) section 3. In particular: "matter workspace", not "workspace", for one matter; "draft" only for our own documents; "verified" only for a validator outcome; "verification proof", not "evidence", for what a verification record points at.

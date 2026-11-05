# Q. Build, vendoring and ship

Components: Q01 to Q08. Conventions, test kinds and status words are in the [README](README.md).

**Status:** the workspace builds and tests in one `cargo test`. Q08 vendoring order 1 to 3 (pdfium, Tesseract, PaddleOCR) and contract tests are done (Q-AC-09, Q-AC-10). Remaining: installer, updater, crash dump, egress, and vendoring 4 to 10.

## Purpose

Bringing every third-party engine into our tree and proving it behaves as we rely on; then getting a signed, offline-installable application onto an advocate's machine, keeping it updated with rollback, recovering from crashes, and proving no telemetry leaves.

## Decisions implemented

P7, RQ-37, X-10, H-10, PH-06, PH-11.

## Depends on

- Every group: CI builds and tests them all.
- Windows first. Installer size is not a constraint.

## Non-goals

- No offline guarantee for capture, research, model calls or verification (RQ-37).
- No telemetry.
- No test double in a production build.

## Components

| ID | Component |
|---|---|
| Q01 | Installer: signed, per user or per machine, installs with no network |
| Q02 | Updater: staged, signed, rollback |
| Q03 | Bundled assets: engines, models, fonts, tokenisers, rule packs, codebooks, each with its hash |
| Q04 | CI: build matrix, every test kind, release gates, docs checks |
| Q05 | Crash handling: dump, safe restart, resume |
| Q06 | Telemetry off, provable |
| Q07 | Network-required behaviour |
| Q08 | The vendored tree and its contract tests |

## Vendoring (Q08)

Every third-party engine lives under `vendor/<name>/` with its pinned upstream version, licence, our patches, a build recipe CI runs, and the hash of what it produces. A crate wraps each one behind a small interface; the wrapper's contract tests run against the real build on every change to `vendor/` or the wrapper.

Order (PH-06):

| Order | Dependency | Used by | Runs as | Contract tests |
|---|---|---|---|---|
| 1 | pdfium | G01, G02, J01 to J03 | Library in the OCR and viewer worker process, never in the window process | G-CT-01 to G-CT-03 |
| 2 | Tesseract with English and Devanagari models | G03 | `ocr-tesseract` process | G-CT-04, G-CT-05 |
| 3 | PaddleOCR PP-OCRv5 with its inference runtime and models | G04 | `ocr-paddle` process | G-CT-06, G-CT-07 |
| 4 | Fonts: an Indic-capable UI face, a document serif, an embeddable PDF face | A13, J13 | Bundled assets | A-VIS-05, J-CT-04 |
| 5 | Chromium (CEF) | M01 to M10, F | One process per profile | M-CT-01 to M-CT-04 |
| 6 | WordCraft fork (engine and editor) | J05 to J08 | `wordcraft` process | J-CT-01 to J-CT-03 |
| 7 | PdfCraft fork | J09 | `pdfcraft` process | J-CT-05 |
| 8 | A DOCX writer (`docx-rs`) | J10 | Library in the kernel's document worker | J-CT-06 |
| 9 | veraPDF with its runtime | J13 PDF/A validation | Separate process | J-CT-07 |
| 10 | A local embedding model | E03 | Kernel worker | E-CT-03 |
| Later | `agent-desktop` | N | Separate process | N's contract tests |

The engines are fed and read through the same typed pipes and interfaces the current wrappers expose, so replacing a stand-in with the real engine changes no caller.

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa version [--json]` | query | Application, `ulos`, engines, models, rule packs, fonts, with hashes |
| `oa update check` / `apply` / `rollback` | external, internal | The updater |
| `oa doctor` | query | Every supervised process, every bundled asset hash, reachability of each source |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| About | Every component and bundled asset with its version and hash | Copy for support |
| Doctor | Every `oa doctor` check | Run it |
| Updates | The staged update and the previous version | Apply or roll back |

## Rules

1. Every third-party engine is vendored under `vendor/`, built by CI from our tree, and pinned by version and hash.
2. A production build contains no test double. The build fails if one is linked into a shipped binary.
3. Every vendored dependency has contract tests against the real build, run on every change to it or its wrapper.
4. The installer works with the network disabled and installs every bundled asset with its hash recorded.
5. Every bundled asset is versioned and hashed like code. `oa version` reports them all, and a mismatch at start disables that capability by name.
6. Updates are staged and signature-checked. A failed update rolls back with matter data untouched. An update waits while a filing is in flight.
7. A crash writes a local dump, restarts safely, and the harness resumes.
8. A CI egress test runs a scripted matter with only allow-listed sources reachable and fails on any other connection (Q06).
9. **Network-required behaviour (Q07).** With no network the application starts, shows every matter, and allows reading, Notebook review and drafting. Capture, research, model calls and verification report `source_unreachable` or `dependency_unavailable`. Nothing becomes `verified`.
10. CI runs every test kind in every spec, and the release gates in the README.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| Q-AC-01 | A clean Windows VM with no network installs and starts the application. | [AUTO] | remaining |
| Q-AC-02 | `oa version --json` lists every bundled asset with a hash that matches the files on disk. | [AUTO] | remaining |
| Q-AC-03 | A corrupted update is refused, and rollback restores the previous version. | [AUTO] | remaining |
| Q-AC-04 | The egress test sees no connection outside the allow list. | [AUTO] | remaining |
| Q-AC-05 | With the network disabled, source-dependent work reports `source_unreachable`, and verification stays `unavailable` or `unresolved`. | [AUTO] | remaining |
| Q-AC-06 | A forced crash mid-run restarts and resumes with no duplicate effect. | [AUTO] | remaining |
| Q-AC-07 | The installer and updater are acceptable to a non-technical advocate. | [HUMAN] | remaining |
| Q-AC-08 | The About view lists every asset with the hash `oa version` prints. | [AUTO] | remaining |
| Q-AC-09 | Every directory under `vendor/` has a version, licence, build recipe and recorded output hash, and CI rebuilds it reproducibly. | [AUTO] | done |
| Q-AC-10 | A release build that links a test double fails. | [AUTO] | done |

### Contract tests

The contract tests for each vendored dependency are listed in the spec that uses it (column above). This spec owns the rule that they run and gate.

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| Q-VIS-01 | About, doctor and updates in their six gallery states. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| Q-E2E-01 | Install on a clean VM with no network, create a matter, import a scanned PDF, OCR it with both real engines, view a page, then enable the network and update. | remaining |

## Edge cases

- An update that changes a rule pack: matters keep their pinned version (RQ-42).
- A vendored upstream with a security fix: the version bump runs every contract test before merge.

## Failure modes

| Failure | Honest state shown |
|---|---|
| A bundled asset hash mismatch at start | The capability is disabled and named; the rest runs. |
| A vendored build fails in CI | The change does not merge; the previous pinned build stays. |

## Open questions

- OQ-01 (WordCraft), OQ-03 (renderer for PDF/A), OQ-11 (embedding model).

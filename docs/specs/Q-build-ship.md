# Q. Build and ship

Components: Q01 to Q07. See [README](README.md) for tags and conventions.

## Purpose

Getting a signed, offline-installable application onto an advocate's machine with every vendored engine and model, keeping it updated with rollback, recovering from crashes, and proving no telemetry leaves. Q07 used to be an offline mode. It is now the network-required behaviour, because there is no offline guarantee (RQ-37).

## Decisions implemented

RQ-37, P7, X-10, H-10, P9.

## Depends on

- Every group (CI builds and tests them).

## Assumptions

- Windows first. Installer size is not a constraint.
- Vendored code (OCR engines, WordCraft, PdfCraft, `agent-browser`, `agent-desktop`) builds from our tree in CI.

## Non-goals

- No offline guarantee for capture, research, model calls or verification.
- No telemetry.

## Components

| ID | Component |
|---|---|
| Q01 | Installer: signed, per user or per machine, installs with no network |
| Q02 | Updater: staged, signed, rollback |
| Q03 | Bundled assets: Chromium, OCR engines and models, fonts, tokenisers, rule packs, codebooks |
| Q04 | CI: build matrix, fixtures, conformance, replay, eval, docs checks |
| Q05 | Crash handling: dump, safe restart, resume |
| Q06 | Telemetry off, provable |
| Q07 | Network-required behaviour |

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa version [--json]` | query | Application, `ulos`, engines, models, rule packs, with hashes |
| `oa update check` / `oa update apply` / `oa update rollback` | external, internal | The updater |
| `oa doctor` | query | Checks every supervised process, every bundled asset hash and network reachability of each source |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| About | Application, `ulos`, engine, model and rule pack versions with their hashes | Copy for support |
| Doctor | Every `oa doctor` check | Run it |
| Updates | The staged update and the previous version | Apply or roll back |

## Rules

1. The installer works with the network disabled and installs every bundled asset with its hash recorded.
2. Every bundled asset is versioned and hashed like code. `oa version` reports them all.
3. Updates are staged and signature-checked. A failed update rolls back to the previous version with matter data untouched.
4. A crash writes a local dump, restarts safely, and the harness resumes from its session store.
5. A CI egress test runs the application through a scripted matter with only the allow-listed sources reachable, and fails on any other connection (Q06).
6. **Network-required behaviour (Q07).** With no network, the application starts, shows every matter, and allows reading, Notebook review and drafting. Capture, research, model calls and verification report `source_unreachable` or `dependency_unavailable`. Verification records `unresolved`, which blocks. Nothing is upgraded to `verified`.
7. CI runs, on every change: unit tests, the B schema check, the loop conformance fixtures, the `ulos` conformance suite, kill tests, replay, the eval harness, the OCR gold set, the fidelity oracle, and the docs check that sections 1 to 12 of the two workflow documents are identical.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| Q-AC-01 | A clean Windows VM with no network installs and starts the application. | [AUTO] |
| Q-AC-02 | `oa version --json` lists every bundled asset with a hash that matches the files on disk. | [AUTO] |
| Q-AC-03 | A corrupted update is refused, and rollback restores the previous version. | [AUTO] |
| Q-AC-04 | The egress test sees no connection outside the allow list. | [AUTO] |
| Q-AC-05 | With the network disabled, `oa verify draft` records `unresolved` with `source_unreachable` for every source-dependent check. | [AUTO] |
| Q-AC-06 | A forced crash mid-run restarts and resumes with no duplicate effect. | [AUTO] |
| Q-AC-07 | The installer and updater experience is acceptable to a non-technical advocate. | [HUMAN] |
| Q-AC-08 | The About view lists every bundled asset with the same hash `oa version` prints. | [AUTO] |

## Edge cases

- An update while a filing is in flight. Refused until the filing state is terminal.
- An update that changes a rule pack. Matters keep their pinned version (RQ-42).

## Failure modes

| Failure | Honest state shown |
|---|---|
| A bundled asset hash mismatch at start | The affected capability is disabled and named, the rest runs. |

## Observable outcomes

- `oa doctor` prints one line per check.

## Open questions

None local.

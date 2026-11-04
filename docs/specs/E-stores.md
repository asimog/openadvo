# E. Stores

Components: E01 to E07. Conventions, test kinds and status words are in the [README](README.md).

**Status:** `matter.db`, `registry.db`, `firm.db`, the harness session store, content-addressed blobs and `oa find` work. Remaining: FTS5 with the legal tokeniser, vector search with a local embedding model, the graph projection, `oa store check`, index rebuilds, export and import bundles, `firm.db` backup, the OS keychain, immediate write transactions.

## Purpose

Where the bytes and rows live. One SQLite database per matter workspace for the canonical record, the Notebook, the drafts index, full-text and vector search. Content-addressed blobs on disk. A separate harness session store. A small global registry. Secrets in the OS keychain. Nothing network shaped.

## Decisions implemented

RQ-31, RQ-70, RQ-75, RQ-83, C-5, X-12, X-18, H-04, P9, M-06, PH-02.

## Depends on

- C: the only writer of canonical tables. D: the only writer of `harness/session.db`.
- H-04: a local embedding model (OQ-11), vendored under Q.
- SQLite with WAL, one kernel process per application data folder, many readers. `sqlite-vec` loads as an extension in the kernel.

## Vendored dependencies

| Dependency | Use | Contract tests |
|---|---|---|
| SQLite (bundled through `rusqlite`) | Every store | E-CT-01 |
| `sqlite-vec` | Vector search in `matter.db` | E-CT-02 |
| A local embedding model (OQ-11) | Vector rows | E-CT-03 |

## Non-goals

- No search cluster, managed vector database, JVM store or Ladybug (C-5, RQ-83).
- Tantivy only if a measured FTS5 query fails its latency target.
- No SQL in domain code. Domain code uses repository traits (R01).

## Files

| File | Owner | Holds |
|---|---|---|
| `<app data>/registry.db` | Kernel | Matter ids, folder paths, titles, last seen, removed flag. Rebuildable from the folders |
| `<app data>/firm.db` | Kernel | Firm data (O) and the command audit. Not rebuildable, so backed up |
| `<matter>/matter.db` | Kernel | Ledger, evidence, Notebook, drafts index, approvals, outbox, filing payloads, rule pins, FTS5, vectors, graph projection, rejected-write audit |
| `<matter>/blobs/<sha256>` | Kernel | Immutable bytes |
| `<matter>/harness/session.db` | Harness | Turns, plans, notes, effect intents, traces, context manifests |

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa store check [--matter <id>]` | query | SQLite integrity, blob presence and hash, ledger chain |
| `oa search text <query> [--matter <id>]` | query | FTS5 over Notebook text, extracted lines and draft paragraphs |
| `oa search similar <text\|anchor> [--k <n>]` | query | Vector search within the matter |
| `oa find <query> [--kind <k>]... [--filter <expr>]` | query | One search across every record kind, typed results |
| `oa index rebuild [--fts\|--vec\|--graph]` | internal | Rebuilds a derived index from canonical tables |
| `oa export <matter> --out <file>` | internal | A self-contained bundle: manifest, `matter.db` snapshot, blobs |
| `oa import-bundle <file> --root <root>` | internal | Restores a bundle as a matter workspace |
| `oa export verify <file>` | query | Checks a bundle offline: hashes, ledger chain, manifest |
| `oa firm backup --out <file>` | internal | A verifiable copy of `firm.db` |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Search | One box over every record kind, with kind facets and filters, through `oa find` | Search, filter by kind, open any result |
| Store health | Integrity, blob and chain checks, with the first failure | Run the checks |
| Indexes | Text, vector and graph index states, and the embedding model in use | Rebuild an index |
| Export and import | A bundle's contents before export, and its verification before import | Export, verify, import |

## Rules

1. One `matter.db` per matter workspace. No canonical table for one matter lives elsewhere.
2. Schema changes ship as numbered migrations. A failed migration leaves the previous schema intact and the matter opens read only.
3. Every write transaction on `matter.db` begins with the write lock (`BEGIN IMMEDIATE`) and a busy timeout (PH-02).
4. FTS5 indexes extracted lines, Notebook text and draft paragraphs with a tokeniser that handles section references ("s. 302", "Section 302"), citations ("2024 INSC 23"), case numbers and Devanagari.
5. Vector search uses `sqlite-vec` inside `matter.db`. Each vector row records the embedding model and version. Changing the model needs a rebuild, never a mix.
6. The graph projection (E04) is built from the ledger and canonical tables with typed tables and recursive CTEs (E05).
7. Every derived index can be dropped and rebuilt to an equal result.
8. Blobs are written to a temporary name, fsynced, hashed, then renamed to `blobs/<sha256>`.
9. Secrets (provider keys, portal credentials, signing keys) live in the OS keychain (DPAPI on Windows, E07). No secret is ever written to a SQLite file.
10. An export bundle is verifiable without the application.
11. `oa find` searches every record kind through one filter language and returns typed results.
12. `firm.db` is backed up on a schedule the firm sets, and before every migration.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| E-AC-01 | Dropping and rebuilding FTS5, vector and graph indexes gives identical results on the fixture matter. | [AUTO] | remaining |
| E-AC-02 | `oa search text "302 IPC"` finds "Section 302 of the Indian Penal Code" and "s. 302 I.P.C.". | [AUTO] | remaining |
| E-AC-03 | `oa search text "2024 INSC 23"` finds the citation in all its display forms. | [AUTO] | remaining |
| E-AC-04 | Vector rows record the model id; changing the model without a rebuild is refused. | [AUTO] | remaining |
| E-AC-05 | A failed migration leaves the matter readable at the old schema. | [AUTO] | remaining |
| E-AC-06 | Truncating a blob file is detected by `oa store check`. | [AUTO] | remaining |
| E-AC-07 | No SQLite file contains a string matching the provider key or credential patterns. | [AUTO] | remaining |
| E-AC-08 | An exported bundle restores on a clean machine and passes `oa ledger verify`. | [AUTO] | remaining |
| E-AC-09 | FTS5 p95 under 200 ms on a 5,000 page fixture matter. | [AUTO] | remaining |
| E-AC-10 | Vector search for ten gold queries has the expected passage in the top five. | [AUTO+HUMAN] | remaining |
| E-AC-11 | `oa find` returns several kinds for one query, each with its kind, and the GUI search shows the same. | [AUTO] | done |
| E-AC-12 | Store health shows the first failing check with the item it failed on. | [AUTO] | remaining |
| E-AC-13 | A secret stored with `oa` is readable back from the keychain and absent from every file under the application data folder. | [AUTO] | remaining |
| E-AC-14 | `oa firm backup` produces a file that opens and passes an integrity check. | [AUTO] | remaining |

### Contract tests

| ID | Contract | Status |
|---|---|---|
| E-CT-01 | The bundled SQLite has FTS5, WAL and `BEGIN IMMEDIATE` behaviour as relied on (two processes, one waits). | remaining |
| E-CT-02 | `sqlite-vec` loads in the kernel and returns the same top five for a fixed vector set. | remaining |
| E-CT-03 | The embedding model gives the same vectors (within tolerance) for a fixed text set, offline. | remaining |

### GUI tests

| ID | Behaviour | Status |
|---|---|---|
| E-GUI-01 | The search box issues `find`, kind facets filter, and each result opens the Inspector. | remaining |
| E-GUI-02 | Rebuild in the indexes view issues `index.rebuild` for that index only. | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| E-VIS-01 | Search, store health, indexes, export and import in their six gallery states. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| E-E2E-01 | Import a 300-page judgment, OCR it, then `oa search text` and `oa search similar` find a known passage, and export and re-import the matter on a clean root with the same results. | remaining |

## Edge cases

- Two matters share bytes: each has its own blob copy, so a matter stays self-contained.
- The embedding model is unavailable at index time: indexing is queued and search reports the vector index as incomplete.
- A blob over 2 GB is streamed, never loaded whole.

## Failure modes

| Failure | Honest state shown |
|---|---|
| `matter.db` corrupt | Read only, backup restore offered, blobs readable. |
| Index stale after a crash | Rebuilt at open, with a notice. |
| Keychain locked | Exit 5, `keychain_locked`. |

## Open questions

- OQ-11 (embedding model local or remote).

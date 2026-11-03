# E. Stores

Components: E01 to E07. See [README](README.md) for tags and conventions.

## Purpose

Where the bytes and rows live. One SQLite database per matter workspace (`matter.db`) for the canonical record, the Notebook, the drafts index, full-text search and vector search. Content-addressed blobs on disk. A separate harness session store. A small global registry. Secrets in the OS keychain. Nothing network shaped.

## Decisions implemented

RQ-31, RQ-70, RQ-75, RQ-83, C-5, X-12, X-18, H-04.

## Depends on

- C (the only writer of `matter.db` canonical tables).
- D (the only writer of `harness/session.db`).

## Assumptions

- A matter holds up to a few thousand pages and tens of thousands of lines.
- SQLite with WAL, one writer process per file, many readers.
- `sqlite-vec` loads as an extension in the kernel process.

## Non-goals

- No search cluster, no managed vector database, no JVM store, no Ladybug in the first release (C-5, RQ-83).
- Tantivy only if a measured FTS5 query fails a stated latency target.
- No SQL dialect in domain code. Domain code uses repository traits (R01).

## Files

| File | Owner | Holds |
|---|---|---|
| `<app data>/registry.db` | Kernel | Matter ids, folder paths, titles, last seen, removed flag. Rebuildable from the folders |
| `<app data>/firm.db` | Kernel | Firm data (group O). Not rebuildable, so backed up like a matter |
| `<matter>/matter.db` | Kernel | Ledger, evidence entries, Notebook records, drafts index, approvals, filing payloads, rule pins, FTS5 tables, vector tables, graph projection tables, rejected-write audit |
| `<matter>/blobs/<sha256>` | Kernel | Immutable bytes |
| `<matter>/harness/session.db` | Harness | Turns, plans, notes, effect intents, model trace store, context manifests |

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa store check [--matter <id>]` | query | SQLite integrity check, blob presence and hash check, ledger chain check |
| `oa search text <query> [--matter <id>]` | query | FTS5 search over Notebook text and extracted lines |
| `oa search similar <text|anchor> [--k <n>]` | query | Vector search within the matter |
| `oa index rebuild [--fts|--vec|--graph]` | internal | Rebuilds a derived index from canonical tables |
| `oa export <matter> --out <file>` | internal | A self-contained bundle: manifest, `matter.db` snapshot, blobs |
| `oa import-bundle <file> --root <root>` | internal | Restores a bundle as a matter workspace |
| `oa export verify <file>` | query | Checks a bundle offline: hashes, ledger chain, manifest |

## Rules

1. One `matter.db` per matter workspace. No canonical table for one matter lives in another matter's file or in the registry.
2. Schema changes ship as numbered migrations. A migration that fails leaves the previous schema intact, and the matter opens read only.
3. FTS5 indexes extracted lines, Notebook text and draft paragraph text with a tokeniser that handles Indian legal forms: section references ("s. 302", "Section 302"), citations ("2024 INSC 23"), case numbers and Devanagari.
4. Vector search uses `sqlite-vec` inside `matter.db`. The embedding model and its version are recorded per vector row. Changing the model requires a rebuild, never a mix.
5. The graph projection (E04) is built from the ledger and canonical tables using typed tables and recursive CTEs (E05). Deleting it costs a rebuild and nothing else.
6. Every derived index (FTS5, vector, graph) can be dropped and rebuilt to an equal result.
7. Blobs are written to a temporary name, fsynced, hashed, then renamed to `blobs/<sha256>`. A blob whose content does not hash to its name is reported by `oa store check`.
8. Secrets (provider keys, portal credentials, signing keys) live in the OS keychain (DPAPI on Windows). A test fails if a secret pattern appears in any SQLite file.
9. An export bundle is verifiable without the application by `oa export verify`, and its ledger is verifiable by recomputing the chain.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| E-AC-01 | Dropping and rebuilding FTS5, vector and graph indexes yields identical query results on the fixture matter. | [AUTO] |
| E-AC-02 | `oa search text "302 IPC"` finds lines containing "Section 302 of the Indian Penal Code" and "s. 302 I.P.C.". | [AUTO] |
| E-AC-03 | `oa search text "2024 INSC 23"` finds the citation in all its display forms. | [AUTO] |
| E-AC-04 | Vector rows record the embedding model id. Changing the configured model without a rebuild is refused. | [AUTO] |
| E-AC-05 | A failed migration leaves the matter readable at the old schema. | [AUTO] |
| E-AC-06 | Truncating a blob file is detected by `oa store check`. | [AUTO] |
| E-AC-07 | No SQLite file contains a string matching the provider key or credential patterns. | [AUTO] |
| E-AC-08 | An exported bundle restores on a clean machine and passes `oa ledger verify`. | [AUTO] |
| E-AC-09 | FTS5 query p95 under 200 ms on a 5,000 page fixture matter. | [AUTO] |
| E-AC-10 | Vector search results for ten gold queries contain the expected passage in the top five. | [AUTO+HUMAN] (gold set authored by a lawyer) |

## Edge cases

- Two matters share bytes (the same judgment captured in both). Each matter has its own blob copy. Dedup is within a matter only, so a matter stays self-contained.
- An embedding model unavailable at index time. Vector indexing is queued, and search reports that the vector index is incomplete rather than returning partial results as complete.
- A blob larger than 2 GB. Streamed, never loaded whole.

## Failure modes

| Failure | Honest state shown |
|---|---|
| `matter.db` corrupt | Read only, backup restore offered, blobs still readable. |
| Index stale after a crash | Rebuilt from canonical tables at open, with a notice. |
| Keychain locked | Commands needing a secret fail with exit 5 and `keychain_locked`. |

## Observable outcomes

- `oa store check` prints one line per check with a pass or the first failure.
- The matter settings view shows the index states and the embedding model in use.

## Open questions

- OQ-11 (embedding model local or remote).

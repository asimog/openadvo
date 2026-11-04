# R. Cloud seams

Components: R01 to R04. Conventions, test kinds and status words are in the [README](README.md).

**Status:** domain crates do not depend on `rusqlite`. Remaining: in-memory adapters for each trait, owner columns everywhere, kill tests against the engine interface.

## Purpose

The interfaces that let a later cloud or multi-user phase attach without rewriting domain code. Nothing here runs remotely. Each seam is a trait with a local adapter and an in-memory adapter for tests, so each seam has two adapters and is real.

## Decisions implemented

C-4, C-5, RQ-70.

## Depends on

- C, D and E: the implementations behind the traits. The first release is one advocate on one machine.

## Non-goals

- No remote store, shared engine or tenancy enforcement.

## Seams

| ID | Seam | Local adapter | Test adapter |
|---|---|---|---|
| R01 | Repository traits | `rusqlite` against `matter.db`, `registry.db`, `firm.db`, `session.db` | In memory |
| R02 | Blob store | Files under `blobs/<sha256>` | In memory |
| R03 | Identity and tenancy | One owner, on every record | Two owners |
| R04 | Durable engine | The local runner with intent rows and the effect ledger (D07) | In memory |

## GUI

None. The seams are internal.

## Rules

1. Domain code depends on the traits, never on `rusqlite` or file paths. A build check enforces it.
2. Every record carries an owner field, set to the single local owner.
3. The durable engine interface is the one D07 implements. Any other engine passes the same kill tests.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| R-AC-01 | No domain crate depends on `rusqlite`. | [AUTO] | done |
| R-AC-02 | The in-memory adapter of each trait passes the same suite as the SQLite adapter. | [AUTO] | remaining |
| R-AC-03 | Every table has an owner column. | [AUTO] | remaining |
| R-AC-04 | The kill tests run against the engine interface, not one implementation. | [AUTO] | remaining |

## Edge cases

- A matter moved between machines keeps its owner field.

## Failure modes

None of its own. Each adapter's failures are in C, D and E.

## Open questions

None.

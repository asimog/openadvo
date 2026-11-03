# R. Cloud seams

Components: R01 to R04. See [README](README.md) for tags and conventions.

## Purpose

The interfaces that let a later cloud or multi-user phase attach without rewriting domain code. Nothing in this group runs remotely in the first release. Each seam is a trait with one local implementation.

## Decisions implemented

C-4, C-5, RQ-70.

## Depends on

- C and E (the implementations behind the traits).

## Assumptions

- The first release is one advocate on one machine.

## Non-goals

- No remote store, no shared engine, no tenancy enforcement in the first release.

## Components

| ID | Seam | Local implementation |
|---|---|---|
| R01 | Repository traits over SQLite | `rusqlite` against `matter.db`, `registry.db`, `firm.db`, `session.db` |
| R02 | Blob store trait | Files under `blobs/<sha256>` |
| R03 | Identity and tenancy | One owner. The owner field exists on every record from day one |
| R04 | Durable engine interface | The local runner with intent rows and the effect ledger (D07) |

## GUI

None. The seams are internal and have no view of their own.

## Rules

1. Domain code depends on the traits, never on `rusqlite` or file paths directly. A build check enforces it.
2. Every record carries an owner field, set to the single local owner.
3. The durable engine interface is the one D07 implements. A future shared engine implements the same interface and passes the same kill tests.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| R-AC-01 | No domain crate depends on `rusqlite`. | [AUTO] |
| R-AC-02 | An in-memory implementation of each trait passes the same test suite as the SQLite one. | [AUTO] |
| R-AC-03 | Every table has an owner column. | [AUTO] |
| R-AC-04 | The kill tests run against the durable engine interface, not the implementation. | [AUTO] |

## Edge cases

- A matter moved between machines. The owner field is unchanged.

## Failure modes

None specific. Each implementation's failures are in C, D and E.

## Observable outcomes

None user-facing.

## Open questions

None local.

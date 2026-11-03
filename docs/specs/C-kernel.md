# C. Kernel

Components: C01 to C17. See [README](README.md) for tags and conventions.

## Purpose

The only writer of the canonical record. The kernel validates every proposal, commits it in one transaction, appends it to the hash-chained ledger and delivers it through the outbox. It owns matters, source documents, drafts, approvals, filing payloads, permissions and rule pack pins. Everything else proposes.

## Decisions implemented

P2, RQ-05, RQ-11, RQ-24, RQ-26, RQ-27, RQ-30, RQ-31, RQ-36, RQ-40, RQ-42, RQ-46, RQ-47, RQ-69, RQ-71, X-15, X-19, L-16, P9, M-05.

## Depends on

- E (SQLite per matter workspace, blobs on disk, secrets in the OS keychain).
- B (the protocol it serves).
- H-09 (OS user-presence prompt for `human` commands from the CLI).

## Assumptions

- One kernel process per installation, one writer connection per `matter.db`.
- A matter of a few thousand pages fits comfortably in one SQLite file plus blobs.

## Non-goals

- The kernel does not run models, OCR, browsers or the validator.
- The kernel does not hold session transcripts. They live in the harness session store (RQ-31).
- No erasure. Removing the folder is erasure (RQ-25).
- No encryption of blobs at rest in the first release (OQ-05).

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa ledger tail [--matter <id>] [--n <k>]` | query | Recent canonical events |
| `oa ledger verify [--matter <id>]` | query | Recomputes the hash chain and reports the first break |
| `oa evidence list` / `oa evidence show <doc>` | query | Source documents with origin, hash and capture record |
| `oa draft list` / `oa draft log <draft>` / `oa draft show <rev>` | query | Drafts, the revision DAG, one revision |
| `oa draft checkpoint <draft> --name <n>` | internal | Names the current head as a checkpoint |
| `oa draft revert <draft> --edit <rev>` | internal | New revision inverting one earlier revision (RQ-27) |
| `oa draft restore <draft> --checkpoint <n>` | internal | New revision with the checkpoint's content |
| `oa approval request <gate> --target <rev>` | internal | Opens a durable gate wait |
| `oa approval decide <gate> --accept|--reject --reason <r>` | human | Records the advocate's decision |
| `oa audit rejected [--since <t>]` | query | The rejected-write audit table (C13) |
| `oa rules pin` / `oa rules adopt <version>` | query, internal | Shows the pinned rule pack, adopts a new one at a stage boundary |
| `oa trace <anchor>` | query | The provenance chain from an anchor back to blob, page and region |
| `oa inspect <id>` | query | Any record with the ledger events that touched it and its links in and out |
| `oa links out <id>` / `oa links in <id>` | query | What a record references, and what references it (C17) |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Ledger timeline | Every event of the matter with sequence, time, actor, origin, command and body, and the hash chain state | Verify the chain; see the first break highlighted |
| Evidence | Every source document with its origins, capture record, blob hash and whether the bytes are present | Open the bytes; inspect each origin |
| Draft history | The revision graph of each draft, every revision with author and note, checkpoints marked, the head marked | Checkpoint, restore, open any revision in the Changes viewer (J15) |
| Approvals board | Each gate, the revision each approval was for, stale approvals shown apart | Decide a pending approval (human command) |
| Rejected writes | The audit table with actor, origin, command and reason | Filter and export |
| Trace | The provenance chain from any anchor to blob, page and region | Open each link in the chain |
| Links | For any record, its links out and its backlinks (C17) | Follow either direction |

## Rules

1. **Single commit path.** Every canonical change goes through C01: validate, check references, check grants, commit in one SQLite transaction with its ledger event, then enqueue outbox delivery. No other code path writes canonical tables.
2. **Propose only.** The harness receives a capability object that can submit proposals and read through queries. It holds no database handle. A build test fails if any harness crate depends on the store crates (RQ-05).
3. **Ledger.** Append only. Each event has a per-matter sequence number, a UTC record time, actor, origin, command, idempotency key, canonical JSON body and `prev_hash`. The event hash covers all of these. `oa ledger verify` must detect any edit, deletion or reorder.
4. **References.** Every reference in a proposal must resolve at write time: blob hashes exist, anchors resolve to a page region or paragraph id, ids exist in this matter. An unresolved reference refuses the write (RQ-40).
5. **Rejected writes.** Every refusal is a row in the separate audit table with actor, origin, command, reason and a hash of the refused body (RQ-26). The count is visible in the UI.
6. **Evidence store.** A source document's bytes never change after import. One evidence entry per document carries the original filename, the origin (`court_portal`, `client_supplied`, `advocate_import`, `email`), and the capture record when there is one. Identical bytes share one blob (RQ-69).
7. **Draft store.** Revisions form a DAG. Each revision has a parent list, an author (advocate, agent configuration and turn, or hosted application), a DOCX blob and a revision hash. Heads move by compare-and-swap. A stale parent is refused with a typed conflict (RQ-27).
8. **Agent edits are independent revisions.** Each accepted agent edit is its own revision. A revert creates a new revision whose content inverts that edit. If later revisions touched the same paragraphs, the revert is a proposal for the advocate, not an automatic commit. Restoring a checkpoint is a new revision. No revision is ever deleted (L-16).
9. **Corrections.** A correction to a fact, event or record is a new version of that record with a reason. Readers select the current version through one query helper (RQ-24).
10. **Binding.** Every verification record and every approval names the revision hash or record version it judged. A gate reads only records bound to the current head (RQ-11).
11. **Approvals precede effects.** An effect that requires an approval checks, inside the same transaction that records the effect intent, that the approval event exists, is for this target hash, is unexpired and unused. A lapse while an effect is in flight is recorded as `unknown` and handed to reconciliation (RQ-30).
12. **`human` class.** Commands of this class are refused on harness connections. From the CLI they need a user-presence prompt raised by the kernel process (X-19).
13. **Rule packs and standard version.** A matter pins one rule pack version and one standard version at creation. A new version is adopted only by `oa rules adopt` at a stage boundary, which writes an explicit event (RQ-42, RQ-47).
14. **Receipts and disclosure.** C08 builds the AI-use disclosure document for a filing (RQ-36). It refuses to build while any citation or legislation item is `failed`, or `unresolved` without an advocate attestation (RQ-14).
15. **Outbox.** Every committed event is delivered to subscribers (panes, workers, observers) at least once, in sequence. Subscribers are idempotent by sequence number. The ledger is the record and the outbox is delivery.
16. **Bitemporal edges.** C16 stores valid time and record time on derived relations. They are rebuildable from the ledger.
17. **Time.** Record times come from the kernel clock in UTC. A clock that moves backwards does not reorder events, because order is the sequence number.
18. **Link index (C17).** Every reference written through C01 also records a link row, derived in the same transaction. `oa links out <id>` and `oa links in <id>` answer both directions for every record kind. The index rebuilds from the ledger.
19. **Inspectable record.** For any record id, `oa inspect <id>` returns the record, the ledger events whose body names it, and its links in and out. The GUI Inspector uses this query.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| C-AC-01 | Killing the kernel at every point inside a commit leaves either the full commit with its ledger event or nothing. | [AUTO] (fault injection) |
| C-AC-02 | Editing, deleting or swapping any ledger row is detected by `oa ledger verify`, which names the first bad sequence number. | [AUTO] |
| C-AC-03 | A harness crate that adds a dependency on a store crate fails the build. | [AUTO] |
| C-AC-04 | A proposal with an anchor to a missing blob is refused and appears in the audit table. | [AUTO] |
| C-AC-05 | Re-importing identical bytes from a second origin adds an origin to the existing entry and creates no new blob. | [AUTO] |
| C-AC-06 | Two concurrent revisions on the same parent: the second is refused with a typed conflict naming the current head. | [AUTO] |
| C-AC-07 | Reverting one agent edit among five produces a sixth revision whose content equals the original with only that edit removed, when no later edit touched the same paragraphs. | [AUTO] |
| C-AC-08 | Reverting an agent edit whose paragraphs a later edit changed produces a proposal, not a commit. | [AUTO] |
| C-AC-09 | The revision DAG never loses a node: after any sequence of edits, reverts and restores, every earlier revision hash is still readable. | [AUTO] (property test) |
| C-AC-10 | An approval for revision R does not satisfy a gate on revision R'. | [AUTO] |
| C-AC-11 | An effect whose approval lapsed while in flight is recorded `unknown`, not `cancelled`. | [AUTO] |
| C-AC-12 | The disclosure builder refuses while one citation is `unresolved` without attestation, and succeeds after the attestation. | [AUTO] |
| C-AC-13 | `oa rules adopt` outside a stage boundary is refused. | [AUTO] |
| C-AC-14 | `oa trace` on a petition paragraph anchor returns event, page, line, blob hash and original filename. | [AUTO] |
| C-AC-15 | A disk-full error during a blob write leaves no evidence entry pointing at a partial blob. | [AUTO] |
| C-AC-16 | A legal reviewer reading `oa ledger tail` for a matter can reconstruct who approved what and when. | [HUMAN] |
| C-AC-17 | The ledger timeline marks the first bad sequence number when the chain is broken. | [AUTO] |
| C-AC-18 | The draft history shows every revision ever committed, including those a restore went past. | [AUTO] |
| C-AC-19 | The approvals board shows an approval given on a non-head revision as stale. | [AUTO] |
| C-AC-20 | `oa inspect` on any record lists the ledger events that touched it. | [AUTO] |
| C-AC-21 | `oa links in` on an evidence entry lists every revision, verification and Notebook item that references it, and the index rebuilt from the ledger gives the same answer. | [AUTO] |

## Edge cases

- The same document captured twice from the portal with different bytes (a re-rendered PDF). Two blobs, one listing, both kept, flagged as a same-listing duplicate (F02).
- A revert of a revert. Allowed. It is another revision.
- A checkpoint name reused. Refused. Checkpoint names are unique per draft.
- An approval decided after the advocate edited the draft. The decision binds to the revision the request named, which is no longer the head, so it does not satisfy the gate.
- A filing payload that is byte-identical to an earlier payload. A new token is still required.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Hash chain break | The matter opens read only, the first bad sequence is named, and a review item is raised. Nothing is repaired silently. |
| SQLite busy beyond the timeout | The command fails with exit 5. The caller retries with the same idempotency key. |
| Blob missing for an evidence entry | Shown as `missing bytes` on the entry, with its recorded hash, and a review item. |
| Outbox subscriber crash | Delivery resumes from the subscriber's last acknowledged sequence. |

## Observable outcomes

- Every canonical change has one ledger event. Every refusal has one audit row.
- The draft history view shows each agent edit as its own revision with a revert action.
- The approval view shows which revision each approval was for, and marks approvals on non-head revisions as stale.

## Open questions

- OQ-05 (encryption at rest), OQ-06 (disclosure required for filing), OQ-08 (attestation unblocks filing).

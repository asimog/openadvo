# C. Kernel

Components: C01 to C17. Conventions, test kinds and status words are in the [README](README.md).

**Status:** the single commit path, the hash-chained ledger, references, rejected writes, the evidence and draft stores, approvals bound to revisions, idempotent replay, `oa inspect` and the link index work. Remaining: kill tests inside a commit, immediate write transactions (PH-02), the durable outbox, revert proposals, the disclosure builder, rule pack adoption, `oa trace` end to end, `kernel.shutdown`.

## Purpose

The only writer of the canonical record. The kernel validates every proposal, commits it in one transaction with its ledger event, and delivers it through the outbox. It owns matters, source documents, drafts, approvals, filing payloads, permissions and rule pack pins. Everything else proposes. It also supervises every other process.

## Decisions implemented

P2, P9, RQ-05, RQ-11, RQ-24, RQ-26, RQ-27, RQ-29, RQ-30, RQ-31, RQ-36, RQ-40, RQ-42, RQ-46, RQ-47, RQ-69, RQ-71, X-15, X-19, L-16, M-05, PH-01, PH-02.

## Depends on

- E: SQLite per matter workspace, blobs on disk, secrets in the OS keychain.
- B: the protocol it serves, and the origin it decides.
- H-09: the OS user-presence prompt for `human` commands from `cli`.
- One kernel process per application data folder (PH-02). A matter of a few thousand pages fits in one SQLite file plus blobs.

## Non-goals

- The kernel does not run models, OCR, browsers or the validator.
- It does not hold session transcripts. They live in the harness session store (RQ-31).
- No erasure. Removing the folder is erasure (RQ-25).
- No encryption of blobs at rest (OQ-05).

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa ledger tail [--matter <id>] [--n <k>]` | query | Recent canonical events |
| `oa ledger verify [--matter <id>]` | query | Recomputes the hash chain and reports the first break |
| `oa evidence list` / `oa evidence show <doc>` | query | Source documents with origin, hash and capture record |
| `oa draft list` / `log <draft>` / `show <rev>` | query | Drafts, the revision DAG, one revision |
| `oa draft checkpoint <draft> --name <n>` | internal | Names the current head as a checkpoint |
| `oa draft revert <draft> --edit <rev>` | internal | New revision inverting one earlier revision (RQ-27) |
| `oa draft restore <draft> --checkpoint <n>` | internal | New revision with the checkpoint's content |
| `oa approval request <gate> --target <rev>` | internal | Opens a durable gate wait |
| `oa approval decide <gate> --accept\|--reject --reason <r>` | human | Records the advocate's decision |
| `oa audit rejected [--since <t>]` | query | The rejected-write audit (C13) |
| `oa outbox list [--state <s>]` / `oa outbox reconcile <id>` | query, internal | External effects and their state; reconcile an `unknown` one |
| `oa rules pin` / `oa rules adopt <version>` | query, internal | The pinned rule pack; adopt a new one at a stage boundary |
| `oa trace <anchor>` | query | The provenance chain from an anchor to blob, page and region |
| `oa inspect <id>` | query | Any record with the ledger events that touched it and its links |
| `oa links out <id>` / `oa links in <id>` | query | What a record references, and what references it |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Ledger | Every event with sequence, time, actor, origin, command and body, and the chain state | Verify the chain; see the first break marked |
| Evidence | Every source document with its origins, capture record, blob hash and whether the bytes are present | Open the bytes; inspect each origin |
| Draft history | The revision graph, each revision with author and note, checkpoints and the head marked | Checkpoint, restore, open any revision in the Changes viewer (J15) |
| Approvals | Each gate, the revision each approval was for, stale approvals apart | Decide a pending approval (human control) |
| Outbox | Every external effect with its state: pending, sent, done, failed, `unknown` | Reconcile an `unknown` effect |
| Rejected writes | The audit table with actor, origin, command and reason | Filter and export |
| Trace | The chain from any anchor to blob, page and region | Open each link |
| Links | For any record, its links out and its backlinks | Follow either direction |

## Rules

1. **Single commit path.** Every canonical change goes through C01: validate, resolve references, check grants, then commit in one SQLite transaction with its ledger event and, for an external effect, its outbox row. No other path writes canonical tables.
2. **Write lock first.** A commit begins its transaction with the write lock (`BEGIN IMMEDIATE`) and re-reads the ledger head inside it. The ledger sequence is the primary key, so the chain cannot fork (PH-02).
3. **Propose only.** The harness gets a capability object that submits proposals and reads through queries. It holds no database handle. A build test fails if a harness crate depends on the store crates (RQ-05).
4. **Ledger.** Append only. Each event has a per-matter sequence, a UTC record time, actor, origin, command, idempotency key, canonical JSON body and `prev_hash`. The hash covers all of them. `oa ledger verify` detects any edit, deletion or reorder.
5. **Idempotency.** A repeated key returns what the first commit recorded and performs nothing.
6. **References.** Every reference in a proposal resolves at write time: blob hashes exist, anchors resolve to a page region or paragraph id, ids exist in this matter. An unresolved reference refuses the write (RQ-40).
7. **Rejected writes.** Every refusal is a row in a separate audit table with actor, origin, command, reason and the hash of the refused body (RQ-26). The count is visible.
8. **Evidence store.** A source document's bytes never change. One evidence entry per document carries the original filename, the origin (`court_portal`, `client_supplied`, `advocate_import`, `email`) and the capture record when there is one. Identical bytes share one blob (RQ-69). A capture record is accepted only from `capture` origin.
9. **Draft store.** Revisions form a DAG. Each has parents, an author (advocate, agent configuration and turn, or hosted application), a DOCX blob and a revision hash. Heads move by compare-and-swap; a stale parent is refused with a typed conflict (RQ-27).
10. **Agent edits are independent revisions.** A revert is a new revision inverting that edit. If later revisions touched the same paragraphs, the revert is a proposal for the advocate. Restoring a checkpoint is a new revision. No revision is ever deleted (L-16).
11. **Corrections.** A correction is a new version of the record with a reason. Readers select the current version through one helper (RQ-24).
12. **Binding.** Every verification record and approval names the revision hash or record version it judged. A gate reads only records bound to the current head (RQ-11).
13. **Approvals precede effects.** An effect that needs an approval checks, in the transaction that records the effect's outbox row, that the approval exists, is for this target hash, is unexpired and unused. A lapse while in flight is `unknown` and goes to reconciliation (RQ-30).
14. **Outbox.** An external effect is an outbox row written in the commit transaction. A worker sends it and records the outcome. An effect whose outcome is not known is `unknown` and is never retried before `oa outbox reconcile` (RQ-29). Committed events are delivered to subscribers at least once, in sequence.
15. **`human` class.** Refused on `harness`. From `cli` they need the user-presence prompt raised by the kernel (X-19).
16. **Rule packs and standard version.** A matter pins one rule pack version and one standard version at creation. `oa rules adopt` changes them only at a stage boundary, with an explicit event (RQ-42, RQ-47).
17. **Disclosure.** C08 builds the AI-use disclosure document for a filing (RQ-36). It refuses while any citation or legislation item is `failed`, or `unresolved` without an advocate attestation (RQ-14).
18. **Bitemporal edges.** C16 stores valid time and record time on derived relations, rebuildable from the ledger.
19. **Time.** Record times come from the kernel clock in UTC. Order is the sequence, so a clock moving backwards reorders nothing.
20. **Link index (C17).** Every reference written through C01 also writes a link row in the same transaction. `oa links out` and `oa links in` answer both directions for every record kind. The index rebuilds from the ledger.
21. **Inspectable record.** `oa inspect <id>` returns the record, the ledger events that name it, and its links in and out.
22. **Shutdown.** `kernel.shutdown` checkpoints running jobs, stops supervised processes in order, and exits. The window uses it when it started the kernel.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| C-AC-01 | Killing the kernel at every point inside a commit leaves either the full commit with its ledger event or nothing. | [AUTO] | remaining |
| C-AC-02 | Editing, deleting or swapping any ledger row is detected by `oa ledger verify`, naming the first bad sequence. | [AUTO] | done |
| C-AC-03 | A harness crate that depends on a store crate fails the build. | [AUTO] | done |
| C-AC-04 | A proposal with an anchor to a missing blob is refused and appears in the audit table. | [AUTO] | remaining |
| C-AC-05 | Identical bytes from a second origin add an origin to the existing entry and create no new blob. | [AUTO] | done |
| C-AC-06 | Two revisions on the same parent: the second is refused with a typed conflict naming the current head. | [AUTO] | done |
| C-AC-07 | Reverting one agent edit among five gives a sixth revision equal to the original minus only that edit, when no later edit touched its paragraphs. | [AUTO] | remaining |
| C-AC-08 | Reverting an edit whose paragraphs a later edit changed gives a proposal, not a commit. | [AUTO] | remaining |
| C-AC-09 | After any sequence of edits, reverts and restores, every earlier revision hash is readable. | [AUTO] | done |
| C-AC-10 | An approval for revision R does not satisfy a gate on revision R'. | [AUTO] | done |
| C-AC-11 | An effect whose approval lapsed in flight is `unknown`, not `cancelled`. | [AUTO] | remaining |
| C-AC-12 | The disclosure builder refuses while one citation is `unresolved` without attestation, and succeeds after it. | [AUTO] | remaining |
| C-AC-13 | `oa rules adopt` outside a stage boundary is refused. | [AUTO] | remaining |
| C-AC-14 | `oa trace` on a petition paragraph anchor returns event, page, line, blob hash and original filename. | [AUTO] | remaining |
| C-AC-15 | A failed blob write leaves no evidence entry pointing at a partial blob. | [AUTO] | done |
| C-AC-16 | A legal reviewer reading `oa ledger tail` can reconstruct who approved what and when. | [HUMAN] | remaining |
| C-AC-17 | The ledger view marks the first bad sequence when the chain is broken. | [AUTO] | done |
| C-AC-18 | The draft history shows every revision ever committed, including those a restore went past. | [AUTO] | done |
| C-AC-19 | The approvals view shows an approval on a non-head revision as stale. | [AUTO] | done |
| C-AC-20 | `oa inspect` on any record lists the ledger events that touched it. | [AUTO] | done |
| C-AC-21 | `oa links in` on an evidence entry lists every revision, verification and Notebook item that references it, and a rebuild from the ledger agrees. | [AUTO] | done |
| C-AC-22 | Two kernels' worth of writers (two processes) on one `matter.db` never fork the chain; the second waits on the lock and then commits or gets a typed conflict. | [AUTO] | remaining |
| C-AC-23 | An external effect's outbox row exists if and only if its ledger event exists, under a kill at every step. | [AUTO] | remaining |
| C-AC-24 | An `unknown` effect is not retried until reconciled; reconciling records the outcome found. | [AUTO] | remaining |
| C-AC-25 | `kernel.shutdown` with a running job checkpoints it; the job resumes on the next start. | [AUTO] | remaining |

### GUI tests

| ID | Behaviour | Status |
|---|---|---|
| C-GUI-01 | The approvals view draws a decision only through the human control, naming the gate and the revision. | remaining |
| C-GUI-02 | The outbox view offers reconcile only on `unknown` effects. | remaining |
| C-GUI-03 | Every row of ledger, evidence, draft history, approvals, outbox and rejected writes opens the Inspector. | done |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| C-VIS-01 | Ledger, evidence, draft history, approvals, outbox, rejected writes, trace and links in their six gallery states, including a broken chain and a stale approval. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| C-E2E-01 | Import a PDF, create a draft, have the agent make three edits, revert the second, request and decide an approval from the window, then `oa ledger verify` passes and `oa trace` reaches the PDF page. | remaining |
| C-E2E-02 | Kill the kernel during an external effect; on restart the effect is `unknown` and visible as Signal in the inbox. | remaining |

## Edge cases

- The same document captured twice with different bytes. Two blobs, one listing, flagged as a same-listing duplicate (F02).
- A revert of a revert is allowed; it is another revision.
- A reused checkpoint name is refused.
- An approval decided after the draft changed binds to the revision named in the request, which is no longer the head.
- A filing payload byte-identical to an earlier one still needs a new token.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Hash chain break | The matter opens read only, the first bad sequence is named, a review item is raised. Nothing is repaired silently. |
| SQLite busy beyond the timeout | Exit 5. The caller retries with the same idempotency key. |
| Blob missing for an evidence entry | `missing bytes` on the entry, with its recorded hash, and a review item. |
| Outbox subscriber crash | Delivery resumes from its last acknowledged sequence. |
| Disk full | Exit 5 with the reason; nothing half written. |

## Open questions

- OQ-05, OQ-06, OQ-08.

# System architecture — the composed plan

Status: **proposed plan, presented for acceptance** (stage 6, deliverable C). It composes what the earlier stages fixed: the domain map ([boundaries.md](boundaries.md)), the owner's nine answered decisions ([decisions.md](decisions.md)), and the alternatives chosen ([alternatives.md](alternatives.md)). Nothing here is built. The stack stays as the frozen decisions have it — Electron, TypeScript, React, `node:sqlite`, local-first — because the audit found the failures in ownership, not in the stack (audit 6).

## 1. The composed picture

```
┌──────────────────────────────────────────────────────────────────────┐
│ DELIVERY INTERFACES (one application operation, many callers)        │
│                                                                      │
│  CLI (`openadvo`)        Desktop UI (Electron)      Agent tools     │
│  human + --json output   shell + panes + chat dock   typed catalog   │
│  confirmations, exits    generated IPC contract     views           │
└───────────────┬────────────────┬──────────────────────┬────────────┘
                │                │                      │
                │  all three call the same named operations
                ▼                ▼                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│ APPLICATION COORDINATION                                              │
│                                                                      │
│  operations/    one named operation per action (register document,  │
│                 accept fact, prepare filing set, …)                  │
│  catalog/       capability declarations assembled from domains;      │
│                 read / propose / execute / human-only classes         │
│  policy/        fail-closed tool policy (unreadable policy = deny)   │
│  scope/         actor and scope constructed here, never caller-set   │
│  intake/        content-assisted classifier (DQ-8): cited proposals   │
│  workflows/     workflow execution: run states + start-up reconciler │
│  agent/         execution interface: the runtime sits behind this    │
└───────────────┬────────────────────────────────────────────────────┘
                │ composes; enforces; opens transactions; emits audit
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ DOMAINS (eleven, one writer module per table)                        │
│                                                                      │
│  advocate   matter   proceedings   courts   documents   evidence      │
│  facts      research   drafting   filing   work                       │
│                                                                      │
│  domains read each other through query ports only;                   │
│  a domain never writes another domain's tables                        │
└───────────────┬────────────────────────────────────────────────────┘
                │ types only
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ SHARED FOUNDATION                                                    │
│  ids · actor & scope values · typed references (AnchorRef, …) ·      │
│  clock & versioning · result/error envelope · the event chain ·     │
│  capability metadata types. No business rules.                        │
└───────────────┬────────────────────────────────────────────────────┘
                │ implemented by
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ INFRASTRUCTURE                                                       │
│  stores (per-matter SQLite, app, intel, corpus) · blobs by hash ·    │
│  OCR · PDF · LLM providers (LangChain) · browser + court portal      │
│  (per-matter partitions, DQ-7) · court adapters (data + fetchers) ·   │
│  search indexes (derived, rebuildable)                                │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. Where each thing lives (the assignment's required list)

| Concern | Owner | Rule |
|---|---|---|
| Domain rules | The eleven domains | Pure code; no Electron, no agent framework, no cross-domain writes |
| Application services | `application/operations/` | One name per operation; the only composition point |
| Infrastructure | `src/infrastructure/` | Implements ports; never calls a domain unprompted |
| CLI | `src/interfaces/cli/` | Prints operation results; human and `--json` output; owns no logic (R-2) |
| Desktop UI | `src/interfaces/desktop/` | Renders operation results through a **generated** IPC contract; the shell owns navigation and active context only (R-4) |
| IPC | One contract source (`application/operations/*.schema.ts`), generated into preload and bridge, with a divergence test (R-13) | The current three-hand-maintained copies end |
| Agent runtime | `application/agent/` behind an owned execution interface; engine per [agent-runtime.md](agent-runtime.md) | The framework owns execution only; the catalog and operations are OpenAdvo's (R-3) |
| Chat | Execution state: session files and the agent checkpointer per matter folder | Never the legal record; links to records by ids only |
| Workflows | `application/workflows/` | Coordinates operations; owns run state with the **legal checkpointer** semantics (DQ-4); owns no domain record |
| Court adapters | `infrastructure/court-adapters/` | Declare capabilities; fetch through the hosts whitelist; write directory data through the Courts domain; never own legal records or submit (DQ-6 makes submission human-only everywhere) |
| Evidence vault | Blob store by SHA-256, written only through the Documents port | Write-once; re-hash on read; originals preserved (verified strength, audit 6.3) |

## 3. The path of one action

Every action from every interface follows one path, in this order:

1. **Scope.** The interface hands over a request; application coordination constructs the `Actor` and `Scope` (DQ-1: constructed here, never caller-supplied).
2. **Capability.** The catalog resolves the operation; a missing declaration is a start-up failure, not a runtime surprise.
3. **Policy.** The fail-closed rule decides: allow, ask (an approval item in the review queue), or deny. Unreadable or invalid policy is deny, with a visible error (R-10).
4. **Operation.** The named operation composes domains, opens the transaction, and each domain writes only its own tables, appending chained events.
5. **Audit and result.** The result envelope returns typed data; the interface renders it — human text, JSON, a pane, or a tool result for the model.

Human-only operations (fact acceptance, filing confirmation, submission) exist in the catalog with the `human-only` class: the agent tool layer cannot even name them, and the CLI and desktop UI ask for explicit confirmation (DQ-6, R-11).

## 4. Data ownership

| Store | Written by | Holds | Derived parts |
|---|---|---|---|
| Per-matter store (one folder, one `matter.db`) | matter, proceedings, documents, evidence, facts, drafting, filing, work — each its own tables | The matter's legal records; the chain from the foundation | none |
| Blob store (`blobs/<sha256>`) | documents, through the blob port | Original bytes, write-once | none |
| Application store | advocate | Profile, preferences (single advocate first, DQ-2; org tables later, additively) | cross-matter inbox view (read model) |
| Intel store | courts, fed by adapters | Directory, benches, case types, stages, limitation rules — versioned with sources and freshness | none |
| Corpus store | research | Statutes, judgments, propositions, citations | FTS and vectors, rebuildable |
| Matter chat folder | `application/agent/` | Session files and the **agent checkpointer** (execution state only, DQ-4) | none; never read as legal record |

A matter folder remains the portable, archivable unit (DQ-3: per-matter folders, start empty — no migration is built).

## 5. Enforcement (what makes this plan different from the current prose)

The current system's boundary rules live in documents; the audit found every one of them drifted (failures F-13 to F-15). This plan's boundaries are enforced by checks that run with the tests:

| Check | Enforces |
|---|---|
| Import-boundary test over the whole `src/` tree | Domains import only foundation and ports; interfaces import only application coordination; infrastructure imports no domain; no cycles |
| Contract divergence test | Preload, bridge and `OpenAdvoApi` are generated from one source; drift fails CI |
| Capability coherence test | Every catalog entry resolves to an operation; every agent tool resolves to a catalog entry; human-only entries absent from agent-facing views |
| Fail-closed policy test | A corrupted policy source denies everything; an approval timeout refuses |
| Cross-matter scope test | An operation invoked from matter A's scope cannot read or write matter B's records; portal partitions per matter (DQ-7); the shared browser carries the recorded guards |
| Recovery-state test | Killing a run mid-step leaves `interrupted`; the reconciler restarts from the last completed step; the agent checkpointer holds execution state only (DQ-4) |
| Original-integrity test | Blob re-hash on read; derived files never replace originals; index rebuild from stores |

Green means behaviour *and* structure (R-15). The structural test suite starts in phase 1 and grows with every phase (see [phases.md](phases.md)).

## 6. What this plan does not contain

- No microservices, no Docker, no cloud, no new database engines (the assignment's constraints, kept).
- No per-practice kernels; practice areas remain pack data.
- No SLP centre; SLP is a proceeding type with a template pack, and phase 7 proves it by generating a **non-SLP** petition with zero core changes.
- No implementation: this is the plan. Code starts when the owner accepts it and a phase's spec is written (lesson L1).

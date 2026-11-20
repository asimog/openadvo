# Stage 3 — Runtime and Interfaces: Application Services, CLI, Agent, Chat and UI

| | |
|---|---|
| Status | Stage 3 of 4. **Proposed runtime and interface architecture. Not accepted.** |
| Date | 20 November 2026 |
| Inputs | Stage 1 audit, Stage 2 domain design, and the owner's acceptance of D1 to D4. |
| Not used as authority | `docs/rewrite/`, the untracked planning documents, and the repository documents that assert earlier decisions. |
| Next document | `4-implementation-plan.md` (Stage 4). |

## How to read this document

The labels are the same as Stages 1 and 2.

| Label | Meaning |
|---|---|
| **Owner requirement** | The rewrite assignment states it, or the owner accepted it in Stage 2. |
| **Verified current behaviour** | Stage 1 observed it in the code. It is context, not a target. |
| **Proposed decision** | My recommendation. It is not accepted until the owner accepts it. |
| **External fact** | A current fact about an external product, checked on the date shown. It is data, not architecture. |
| **Open** | The evidence or the owner decision is missing. |

The owner accepted D1 to D4. This document treats those four as **accepted** input:

- **D1.** An interlocutory application is a child proceeding that shares its lead proceeding's court file.
- **D2.** Multi-advocate is modelled in v1 through identity, organisation, membership, roles and matter assignment. One advocate is active per installation. No real-time collaboration or sync.
- **D3.** The agent prepares filings. It does not submit them in v1.
- **D4.** A certified copy is a new document version with `provenance = certified_copy`, not a new document.

---

## 1. The boundary in one page

The application has four layers, and one rule for each.

1. **Domain** owns legal truth and legal state transitions. It has no I/O.
2. **Application services** own use cases: authorisation, transaction, idempotency, audit, and coordination across domains.
3. **Interfaces** are delivery: CLI, desktop IPC, agent tools, workflows. They contain no business logic.
4. **Infrastructure** implements ports: SQLite, blobs, OCR, PDF, search, LLM, browser, court adapters.

The rule is:

> **One application operation, many interfaces. Every interface calls the same service. No interface reaches a store.**

The second rule is:

> **The agent is a client of capabilities, not a second application. Chat is a view of execution, not a legal record.**

These two rules replace the current design, where `bridge.ts` has 301 handlers with logic, `agent.ts` has 79 tool definitions with logic, and the same operation is implemented twice.

### 1.1 What changes from today

| Today | Target |
|---|---|
| 344 IPC handlers | One `invoke(capabilityId, input)` gateway plus typed events |
| ~350 preload methods | About 8 preload methods |
| 102 agent tool names in 10+ lists | One capability registry; tools generated from it |
| Business logic in `bridge.ts` and `agent.ts` | Application services |
| `matterId` trusted from the renderer | Application service checks actor and matter assignment |
| Chat stores messages in per-matter JSON | Execution log; chat view projects it |
| Pi types throughout `agent.ts` | `AgentExecutionPort`; Pi is an adapter |
| One global browser/portal matter pointer | Matter-scoped browser and portal sessions |
| Policy allow by default | Policy deny by default on missing or invalid input |

---

## 2. Runtime topology

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ CLI host (Node)              │        │ Desktop host (Electron)      │
│  openadvo ...                │        │  main process                │
│  same CoreHost               │        │  renderer (sandbox, React)   │
└──────────────┬───────────────┘        │  preload gateway             │
               │                        └──────────────┬───────────────┘
               └───────────────┬───────────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │ CoreHost            │
                    │ application services│
                    │ policy · audit      │
                    │ capability registry │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
  firm.db                matter/<id>/matter.db   execution store
  identity, courts,      legal record + blobs    runs, steps,
  research, capability                            approvals, chat
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               ▼
                    derived indexes (FTS, vectors)
```

### 2.1 One core, two hosts

**Proposed decision.** The CLI and the desktop application embed the same `CoreHost`. The core has no Electron import, no React import and no Pi import. Each host supplies its own adapters for paths, secrets, dialogs, stdout and the window.

Why:

- The CLI proves the application boundary before the UI exists.
- The desktop is a client, not the owner of the application.
- Tests can run the core with temporary folders and fake ports.
- The agent runtime can be replaced without changing the CLI or the UI.

### 2.2 No local server in v1

**Proposed decision.** There is no HTTP server and no daemon in v1. The CLI and the desktop open the same SQLite files with a single-writer lock per matter. A later `openadvo serve` is allowed only if measurement shows that the lock is a real obstacle.

Why:

- A local server adds a lifecycle, a port, authentication and a second way to fail.
- The assignment says not to introduce unnecessary servers or cloud dependencies.
- SQLite WAL with a single writer is enough for one advocate on one machine.

### 2.3 The agent runtime lives behind a port

**Proposed decision.** The agent runtime runs in the host process (desktop main or CLI) in v1. It calls the same application services through a `CapabilityInvoker`. It never opens a store.

Why:

- One process is simpler to ship and debug.
- The execution port keeps the option to move the runtime to a worker later.
- The runtime cannot become the application because it has no database handle.

### 2.4 Court adapters run outside the core

**Proposed decision.** Court adapters are data manifests plus a narrow code module for portal automation. A code module runs in a dedicated worker with only `fetch`, browser and file ports. It has no database handle and no application service handle.

Why:

- A court adapter is untrusted code from the application's point of view.
- A failing adapter must not take down the app.
- The adapter returns observations; the application decides what to record.

---

## 3. The application-service boundary

This is the most important decision in Stage 3. If it is wrong, the rewrite repeats the current duplication.

### 3.1 Definitions

| Term | Meaning |
|---|---|
| **Command** | A use case that changes state. It has an input schema, an authorisation check, a transaction, an audit event and a result. |
| **Query** | A read use case. It has an input schema, an authorisation check and a DTO. It does not change state. |
| **DTO / view** | A stable shape for an interface. It is not a domain entity and does not expose a database row. |
| **Unit of work** | One transaction over one database. It owns commit and rollback. |
| **Policy** | The authorisation decision for an actor, a capability and a scope. |
| **Audit** | An append-only record of an important action, with actor, time, subject, capability and before/after versions. |
| **Outbox** | A table of events to deliver after commit (search index, UI notification, derived view). |

### 3.2 The rules

1. **Every interface calls an application service.** The CLI, IPC gateway, agent tool and workflow step call the same service. No interface calls a repository, a store or SQLite.
2. **A command is one use case.** It has one name, one input, one output and one transaction. It does not expose a generic `update` that can change anything.
3. **The service authorises before it loads.** The policy check uses the actor, the capability and the scope. The domain then enforces its own invariants.
4. **The domain owns the rule.** The service does not re-implement "only an advocate accepts a fact". The domain method does.
5. **The service owns the transaction.** The domain does not commit. The repository does not commit. The unit of work commits once.
6. **The service writes the audit event in the same transaction.** A decision without an audit event is a defect.
7. **Commands are idempotent by key.** A retry returns the first result. A command log stores the key, the input hash and the result.
8. **Aggregates use versions.** A stale version returns `VERSION_CONFLICT`. The interface reloads and asks the user.
9. **Queries return DTOs.** A query may join across domains for a view. It may not write.
10. **Cross-domain coordination is an application service.** A workflow or a service calls two domains; neither domain writes the other's tables.
11. **No business logic in the CLI, IPC, agent tools or UI.** They validate shape, call the service, and render the result.
12. **Long-running commands return an operation handle.** The work continues; progress and completion arrive as events.

### 3.3 Context and result contracts

```ts
type IsoDateTime = string;

interface ActorRef {
  id: ActorId;
  kind: "advocate" | "agent" | "system" | "migration";
  displayName?: string;
}

interface CommandContext {
  actor: ActorRef;
  scope: {
    organisationId: OrganisationId;
    matterId?: MatterId;
    proceedingId?: ProceedingId;
  };
  correlationId: string;
  idempotencyKey?: string;
  now: IsoDateTime;
}

interface QueryContext {
  actor: ActorRef;
  scope: CommandContext["scope"];
  correlationId: string;
}

type AppResult<T> =
  | { ok: true; data: T; meta?: { version?: number; operationId?: string } }
  | { ok: false; error: AppError };

interface AppError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}
```

**Rules.**
- `actor` is never supplied by the renderer. The host supplies the signed-in advocate.
- `scope` is checked by the application service, not trusted from the interface.
- `correlationId` appears in every log line and audit event for one request.
- `idempotencyKey` is required for commands that create records or call an external system.

### 3.4 Command and query naming

A capability ID is a stable name, in `domain.verb` form. Examples:

| Capability | Type | Access |
|---|---|---|
| `matter.open` | command | execute |
| `matter.assign_advocate` | command | execute |
| `matter.close` | command | human_only |
| `proceeding.create` | command | execute |
| `proceeding.record_stage` | command | execute |
| `courtfile.attach` | command | execute |
| `courtfile.add_document` | command | execute |
| `document.import` | command (long) | execute |
| `document.process` | command (long) | execute |
| `document.classify` | command | propose |
| `evidence.register` | command | execute |
| `evidence.assess` | command | human_only |
| `fact.propose` | command | propose |
| `fact.review` | command | human_only |
| `fact.list` | query | read |
| `fact.history` | query | read |
| `research.search` | query | read |
| `draft.create` | command | execute |
| `filing.prepare` | command | execute |
| `filing.approve` | command | human_only |
| `workflow.start` | command | execute |
| `workflow.resume` | command | execute |
| `capability.list` | query | read |
| `audit.verify` | query | read |

The full list is built in Phase 1. The first slice uses about 18 of them.

### 3.5 Example: accepting a fact

```ts
class AcceptFact {
  constructor(
    private readonly facts: FactRepository,
    private readonly policy: PolicyEngine,
    private readonly audit: AuditLog,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(
    input: { factId: FactId; expectedVersion: number; reason: string },
    ctx: CommandContext,
  ): Promise<AppResult<FactView>> {
    await this.policy.require(ctx.actor, "fact.review", {
      organisationId: ctx.scope.organisationId,
      matterId: ctx.scope.matterId,
    });

    return this.uow.transaction(async (tx) => {
      const fact = await this.facts.get(input.factId, tx);
      if (!fact) return err("FACT_NOT_FOUND", input.factId);
      if (fact.version !== input.expectedVersion) {
        return err("VERSION_CONFLICT", "The fact changed. Reload it and decide again.");
      }

      fact.accept({
        actor: ctx.actor,
        at: ctx.now,
        reason: input.reason,
      });

      await this.facts.save(fact, tx);
      await this.audit.append(
        {
          capability: "fact.review",
          subject: { kind: "fact", id: fact.id, version: fact.version },
          actor: ctx.actor,
          at: ctx.now,
          outcome: "accepted_working",
          reason: input.reason,
        },
        tx,
      );
      return ok(toFactView(fact));
    });
  }
}
```

The domain method `fact.accept` owns the rule: a model extraction cannot be accepted without a reason; a judicial finding cannot be "accepted" as the advocate's fact; a rejected fact remains. The service owns policy, transaction and audit. The CLI, IPC, agent tool and workflow only call the service.

### 3.6 Example: importing a document

`document.import` is a long-running command:

1. Policy check `document.import`.
2. Read the file through the `FileSource` port.
3. Hash the bytes.
4. Find an existing version in the matter. If found, add an origin and return it.
5. Create the document and version in the transaction.
6. Write the blob atomically.
7. Enqueue an outbox event `document.imported`.
8. Return `{ operationId, documentId, versionId }`.

The OCR and text extraction run as `document.process`, a separate command. A failed OCR does not roll back the import. The version and original bytes stay.

### 3.7 The five layers, with examples

| Layer | Example | May import | Must not import |
|---|---|---|---|
| **Domain** | `FactAssertion.accept(decision)` | Kernel | Electron, React, Pi, SQLite, `node:fs` |
| **Application** | `AcceptFact`, `ImportDocument` | Domain, ports | Electron, React, Pi |
| **Shared contract** | `AppResult`, `ProvenanceRef`, `Decision` | Nothing | Any domain |
| **Infrastructure** | SQLite repository, OCR adapter, Pi adapter | Ports, domain types | React, UI |
| **Interface** | CLI command, IPC handler, agent tool | Application | Infrastructure, stores |

**Why this is not a layer cake for its own sake.** Each layer has one testable responsibility. The current code has no application layer, so `bridge.ts` and `agent.ts` both do authorisation, validation, transaction and formatting. That is why one operation has two behaviours.

---

## 4. Composition and hosting

### 4.1 `CoreHost`

```ts
interface CoreHost {
  commands: CommandBus;
  queries: QueryBus;
  capabilities: CapabilityRegistry;
  events: EventStream;
  audit: AuditLog;
  close(): Promise<void>;
}

async function composeCore(config: CoreConfig): Promise<CoreHost>;
```

`composeCore` is the only place that constructs adapters. It receives:

- `paths`: user data, matters root, resources, temp.
- `secrets`: safeStorage or a test fake.
- `clock`, `ids`, `logger`.
- `llm`: a provider port.
- `ocr`, `pdf`, `converter`: document ports.
- `courtAdapters`: a registry.
- `browser`: a browser port (desktop only; the CLI gets a null adapter).

The CLI and the desktop do not construct repositories. They call `composeCore` and then `commands.execute` or `queries.execute`.

### 4.2 Startup sequence

1. Load config and paths.
2. Verify the application version and the schema version.
3. Acquire the firm lock.
4. Run pending migrations.
5. Mark `running` executions as `interrupted`.
6. Rebuild a derived index if its build is missing or stale.
7. Open the event stream.
8. Start the outbox dispatcher.
9. Accept commands.

If a migration fails, the host exits non-zero with a stable code and a log path. It does not open a half-migrated database.

### 4.3 Shutdown sequence

1. Stop accepting new commands.
2. Cancel or checkpoint running executions.
3. Flush the outbox.
4. Close database connections.
5. Release locks.
6. Exit.

`SIGTERM`, `SIGINT`, window close and `before-quit` all call the same shutdown. A hard kill leaves the lock file; the next start detects a stale lock by PID and age and recovers.

### 4.4 Configuration

| Variable | Purpose |
|---|---|
| `OPENADVO_HOME` | Matters root override (tests, portable installs) |
| `OPENADVO_USER_DATA` | Firm data, settings, execution store |
| `OPENADVO_RESOURCES` | Vendored resources (OCR models, Euro-Office) |
| `OPENADVO_TEST` | Test hooks only; never in production |
| `OPENADVO_LOG_LEVEL` | `error`, `warn`, `info`, `debug` |

No secret is read from an environment variable in production except the model provider key the owner chooses. Secrets use the OS secret store.

---

## 5. CLI

### 5.1 Why CLI-first is correct

The owner's preference is: domain contracts → application services → CLI → agent → desktop UI → workflows and adapters. This is correct, with three exceptions.

**Correct because:**
- The CLI forces the application boundary to be real. A command either has a service or it does not.
- The CLI gives the coding agent a fast, scriptable proof without Electron.
- The CLI is the first independent client. If the service works through the CLI, the UI can use it.
- The CLI makes scenario tests cheap: spawn a process, assert JSON and exit codes.

**Exceptions:**
1. **The CLI must not be a second application.** It cannot contain validation that the service lacks, or a shortcut that writes SQLite.
2. **The first slice needs a review surface for the owner.** A lawyer will not review facts in a terminal. A thin review screen is justified in Phase 4 or 5, using the same IPC gateway. It is not a second architecture.
3. **The agent must not parse CLI text.** The agent calls capabilities directly. The CLI is for humans and scripts.

### 5.2 First-slice command tree

```
openadvo
  matter
    create --title <t> --client <name> [--practice-area <a>] [--json]
    list [--json]
    show <matterId> [--json]
  proceeding
    create --matter <id> --court <courtId> --case-type <type> --title <t> --side <s> [--parent <id> --relation <r>]
    list --matter <id>
    show <proceedingId>
    stage set <proceedingId> --key <k> --date <d> --source <ref>
  court-file
    attach --proceeding <id> --court <courtId> [--case-number <n>] [--diary-number <d>]
    document add --court-file <id> --version <id> --role <r> [--label <l>]
    exhibit add --court-file <id> --evidence <id> --designation <d> --label <l>
  document
    import --matter <id> --file <path> [--json]
    list --matter <id>
    process <versionId>
    show <documentId>
  evidence
    register --matter <id> --kind <k> --title <t> [--version <id>] [--no-source-reason <r>]
    assess <evidenceId> --authenticity <a> --admissibility <a> --reason <r>
    include <evidenceId> --reason <r>
  fact
    propose --matter <id> --text <t> [--version <id> --page <n> --line <n>]
    list --matter <id> [--state <s>]
    review <factId> --accept|--dispute|--reject --reason <r>
    history <factId>
  capability
    list [--json]
  audit
    verify --matter <id>
  db
    migrate [--dry-run]
```

Later commands:

```
  issue ...        draft ...        filing prepare ...
  agent run ...    agent resume ...  workflow start ...
  research ...     court ...         migrate matter <path>
```

The first slice has about 18 commands. The full product can grow to about 60. Do not design 300.

### 5.3 Output contract

Every command supports:

| Flag | Meaning |
|---|---|
| `--json` | One JSON object: `{ ok, data, error, meta }` |
| `--quiet` | No progress, result only |
| `--verbose` | Diagnostic detail to stderr |
| `--yes` | Confirm a dangerous operation |
| `--dry-run` | Validate and show what would change |
| `--read-only` | Open the database read-only; refuse writes |

Human output is a table or key-value list. It never hides an error. JSON output is stable across versions; a field is deprecated before it is removed.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Application error (`AppError`) |
| 2 | Usage error |
| 3 | Policy denied |
| 4 | Version conflict or lock conflict |
| 5 | Internal error |
| 130 | Interrupted by the user |

A command that needs confirmation in a non-interactive session fails with `CONFIRMATION_REQUIRED` and prints the `--yes` hint. It never waits forever.

### 5.4 Safety

- `matter.close`, `filing.approve`, `evidence.assess`, `fact.review` and `audit.export` require `--yes` or an interactive confirmation.
- `--dry-run` runs the policy check and the validation, but not the write.
- A write command opens the matter lock. If the desktop holds it, the command fails with `MATTER_LOCKED` and the holder.
- A read command uses a read-only connection and does not need the lock.
- The CLI never prints secrets, full file paths in JSON unless asked, or matter content in diagnostics.

### 5.5 CLI concurrency with the desktop

**Proposed decision.** SQLite WAL, `busy_timeout`, and a per-matter lock file.

- The desktop holds a write lock for the active matter. It does not hold locks for every matter.
- A CLI write waits up to a configurable timeout, then fails with `MATTER_LOCKED`.
- A CLI read opens `readOnly: true`.
- Batch migration runs with the desktop closed, or with an explicit `--lock` that takes the matter and firm locks.

**Why not a daemon now.** A daemon adds a second process to install, start, stop and secure. The lock is enough for one advocate. If the owner later runs long automations while the desktop is open, a local `openadvo serve` can be added behind the same service boundary.

### 5.6 CLI tests

- Every command has a contract test: valid input, invalid input, denied policy, version conflict, JSON shape and exit code.
- Every command appears in help and in the capability registry with the same ID.
- A scripted scenario uses only the CLI: create a matter, two proceedings, import a document, register evidence, propose and review a fact, verify the audit.
- The CLI must not import Electron, React or Pi. An import test enforces this.

---

## 6. IPC and the desktop gateway

### 6.1 Replace the wide surface

The current preload exposes ~350 methods and the main process registers 344 handlers. Every feature adds a channel, a method and a type. The target is one gateway.

```ts
interface DesktopGateway {
  invoke(capabilityId: CapabilityId, input: unknown): Promise<AppResult<unknown>>;
  subscribe(listener: (event: EventEnvelope) => void): () => void;
  cancel(operationId: string): Promise<AppResult<void>>;
  decide(approvalId: string, decision: ApprovalDecision): Promise<AppResult<void>>;
  appInfo(): Promise<AppInfo>;
}

interface HostActions {
  pickFiles(options: { multiple: boolean; filters?: string[] }): Promise<string[]>;
  reveal(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}
```

The preload exposes `window.openadvo.gateway` and `window.openadvo.host`. That is about 8 methods, not 350.

### 6.2 The gateway is not a thin RPC to a store

`invoke` does five things:

1. Check the sender origin (`trusted`).
2. Look up the capability descriptor.
3. Validate the input against the descriptor's schema.
4. Build the `CommandContext` or `QueryContext` from the signed-in actor and the resolved scope.
5. Call the application service and return `AppResult`.

It does not know about matters, documents or facts. It knows about capabilities.

### 6.3 Actor and matter scope

- The renderer never sends `actor`. The main process holds the active advocate session. A profile switch is an audited host action.
- The renderer sends the matter or proceeding ID as part of the capability input. The application service checks that the actor is assigned and that the record belongs to that matter.
- A missing or invalid matter ID returns `MATTER_NOT_FOUND` or `POLICY_DENIED`. It never opens another matter.

### 6.4 Events

One typed event stream, not one channel per feature.

```ts
type EventEnvelope =
  | { type: "operation.progress"; operationId: string; capabilityId: CapabilityId; phase: string; percent?: number; message?: string }
  | { type: "operation.done"; operationId: string; resultRef?: string }
  | { type: "operation.failed"; operationId: string; error: AppError }
  | { type: "execution.event"; executionId: string; event: ExecutionEvent }
  | { type: "review.changed"; matterId: MatterId; count: number }
  | { type: "document.changed"; matterId: MatterId; documentId: DocumentId; state: string }
  | { type: "approval.requested"; approval: ApprovalView }
  | { type: "approval.decided"; approvalId: string; decision: ApprovalDecision }
  | { type: "audit.appended"; matterId?: MatterId; eventId: string };
```

The renderer subscribes once. A feature filters by type and scope. A feature does not open its own channel.

### 6.5 Long-running operations

- A capability descriptor declares `longRunning: true`.
- `invoke` returns `{ ok: true, data: { operationId } }` immediately.
- Progress and completion arrive as events.
- `cancel(operationId)` sets a cancellation token. The service checks it at safe points and records `cancelled`.
- An operation is durable. If the app closes, the next start marks it `interrupted` and offers resume or fail.

### 6.6 Error contract

Every IPC failure is an `AppResult` with an `AppError`. The gateway never throws a raw string. A renderer that receives an unknown error shows `INTERNAL_ERROR` and the correlation ID. It never shows a stack trace.

### 6.7 Security

- `contextIsolation`, `sandbox`, no `nodeIntegration`, a strict CSP, and the trusted-sender check stay.
- The gateway validates input size and shape.
- The renderer cannot pass a file path to a document import. It uses `host.pickFiles`, then the host passes an opaque token or the path through a controlled import capability.
- The renderer cannot call a human-only capability. The gateway rejects it before the service.
- The renderer cannot set the actor, the organisation or the policy.
- The editor frame stays in its own origin; it cannot call the gateway.

### 6.8 Migration from the current IPC

Do not wrap the 344 handlers. Build the gateway for the new services and keep the old app separate. The old app remains a reference and a data source during the rewrite. A compatibility shim would preserve the old coupling.

---

## 7. Agent runtime

This is Deliverable E.

### 7.1 Requirements

| Requirement | Why |
|---|---|
| Local operation | The product is local-first. No cloud runtime. |
| Tool calling with typed schemas | Capabilities need validation and policy. |
| Streaming | Chat and long operations need progress. |
| Cancellation | The advocate must be able to stop work. |
| Human approval | Reserved actions need a decision outside the model. |
| Checkpoint and resume | A crash must not lose a long run. |
| Delegation or helpers | Research and document review benefit from sub-runs. |
| Matter scope | The runtime must not see another matter. |
| Observability | Tool calls, policy decisions, tokens and errors must be traceable. |
| Replaceability | The framework must not own legal state. |
| Small dependency footprint | A desktop app should not carry a second platform. |
| Maintainability | A small team must be able to debug it. |

### 7.2 Candidates

| Candidate | Strengths | Weaknesses | Fit |
|---|---|---|---|
| **Pi coding-agent SDK** (current 1.5.2) | Already embedded; sessions, streaming, tools, extensions, model runtime, skills; MIT; minimal; local | Coding-agent assumptions (file/shell tools must be disabled); Pi types leak into app code; session file is the de facto checkpoint; no native workflow graph | **Good adapter, not the application** |
| **Pi Durable** (experimental, MIT) | SQLite checkpoints; resume; replay-safe tools; exactly-once submissions; built for crash recovery | Experimental API; separate package; not the current dependency; must be verified against the pinned version | **Promising checkpoint adapter; do not make it the contract** |
| **LangGraph 1.x** (MIT) | Explicit state graph; checkpointers; interrupts; `Command(resume=...)`; streaming; durable execution; large ecosystem | Graph state becomes a second domain model; Python-first docs; LangChain dependency; overkill for one agent plus tools; legal state must not live in the graph | **Not for the agent loop; possible for complex workflows later** |
| **DeepAgents 1.16** (MIT) | Batteries-included planning, filesystem, subagents; built on LangGraph; fast start | "Trust the LLM" model; opinionated middleware; subagents share a filesystem; hard to enforce OpenAdvo capabilities and human-only actions; adds LangChain/LangGraph/LangSmith | **Reject as the core; borrow ideas only** |
| **Custom runtime from scratch** | Exact fit; no framework lock-in; own checkpoints and approvals | Duplicates streaming, tool calling, retries, model adapters, context compaction; high maintenance; a second runtime to debug | **Do not build a second runtime** |

**External facts, checked 20 November 2026.** Pi is MIT and ships as an SDK with sessions and a durable companion. Pi Durable is MIT and explicitly experimental. LangGraph is MIT and 1.x, with checkpointers and interrupts. DeepAgents is MIT, 1.16.2, built on LangGraph, and states a "trust the LLM" security model. These are facts, not a recommendation based on licence.

### 7.3 Recommendation

**Adopt an OpenAdvo-owned `AgentExecutionPort`. Keep Pi as the first adapter. Do not adopt LangGraph or DeepAgents for the agent loop. Do not build a general-purpose runtime.**

Why:

1. **The application must own the legal record, policy and approvals.** Pi already does tool calling well. Replacing it with a graph framework would move planning and state into the framework, which is the current failure in a different shape.
2. **The execution port is the real abstraction.** It lets the app test with a fake runtime, swap to Pi Durable, or add a second adapter later. It is much smaller than a framework.
3. **The assignment forbids a second runtime built only to copy features.** A custom loop would duplicate Pi's streaming, retries, model adapters and sessions.
4. **LangGraph is useful for complex durable workflows, not for a chat agent with tools.** If a future workflow needs branching, fan-out and resumable graph state, use LangGraph behind the workflow port. Keep legal state outside.
5. **DeepAgents is a general research harness.** Its planning, filesystem and subagents are not the legal workbench's shape. Its security model is the opposite of "the application enforces permissions".

**What this means in practice.**
- The `AgentExecutionPort` is the only agent API the application knows.
- The Pi adapter maps capabilities to tools, streams events, handles approvals and stores a checkpoint reference.
- The execution journal in SQLite is the source of truth for execution state. The Pi session file is an adapter detail.
- If Pi Durable is compatible, use it behind the adapter for checkpoints. If not, use a small journal with the same semantics.
- A fake runtime is used in tests. A second adapter is a later option, not a v1 deliverable.

### 7.4 The execution port

```ts
interface AgentExecutionPort {
  start(request: ExecutionRequest): Promise<ExecutionHandle>;
  resume(executionId: ExecutionId): Promise<ExecutionHandle>;
  cancel(executionId: ExecutionId, reason: string): Promise<void>;
  decide(executionId: ExecutionId, approvalId: string, decision: ApprovalDecision): Promise<void>;
  events(executionId: ExecutionId): AsyncIterable<ExecutionEvent>;
  snapshot(executionId: ExecutionId): Promise<ExecutionSnapshot>;
}

interface CapabilityInvoker {
  invoke(
    id: CapabilityId,
    input: unknown,
    ctx: { actor: ActorRef; matterId: MatterId; executionId: ExecutionId },
  ): Promise<AppResult<unknown>>;
}

interface ExecutionRequest {
  matterId: MatterId;
  actor: ActorRef;
  capabilityIds: CapabilityId[];
  prompt: string;
  model?: string;
  budget?: { tokens?: number; cost?: number; wallClockMs?: number };
  approvalPolicy: "ask_on_write" | "ask_always" | "read_only";
  parentExecutionId?: ExecutionId;
}
```

The Pi adapter receives a `CapabilityInvoker`, not the command bus. The composition root wires the invoker to the application services.

**Invariants.**
- The runtime receives a matter and a capability set. It never receives a database handle.
- The runtime cannot call a capability outside the set.
- A human-only capability is absent from the set.
- The runtime emits events; it does not write legal records.
- A child execution has the same matter and a subset of capabilities.

### 7.5 Execution lifecycle

```
queued ──► running ──► waiting_approval ──► running ──► completed
             │                │
             │                └──► cancelled
             ├──► interrupted ──► running
             ├──► cancelled
             └──► failed
```

| State | Meaning |
|---|---|
| `queued` | Accepted, not started |
| `running` | A model turn or a tool call is in progress |
| `waiting_approval` | A capability needs an advocate decision |
| `interrupted` | The process stopped; a checkpoint exists |
| `completed` | The run ended normally |
| `failed` | The run ended with an error |
| `cancelled` | The advocate stopped it |

Every execution stores: id, matter, actor, capability set, prompt hash, model, budget, state, checkpoint, parent, started, updated, ended, error.

Every step stores: id, execution, kind (`model`, `tool`, `approval`), capability, tool call id, state, input hash, output reference, started, ended, error.

### 7.6 Checkpoint and resume

1. Before a model call, write a step `model` with `running`.
2. After the model responds, write the response reference and mark `done`.
3. Before a tool call, write a step `tool` with `running` and an idempotency key.
4. After the tool returns, write the result and mark `done`.
5. Before an approval, write a step `approval` and set the execution to `waiting_approval`.
6. On start, mark every `running` execution as `interrupted`.
7. On resume, load the last checkpoint and the step journal.
8. Re-run a model call that was in flight. It is safe; the model may answer differently.
9. Do not re-run a tool call that was in flight. Its outcome is unknown. The runtime tells the model: "This call may have taken effect. Check the current state before trying again." The model must use a read capability or ask the advocate.
10. A tool call with a recorded result is not re-run. The model receives the recorded result.

This matches Pi Durable's documented behaviour: a model request interrupted by a crash is retried; a tool call that was interrupted is reported, not automatically re-run; replay-safe tools can opt in. The adapter can use that behaviour or implement the same rules.

### 7.7 Approvals

- The capability descriptor declares `approval: none | once | always | two_step`.
- Before a call, the runtime asks the `ApprovalService`.
- The service creates an `ApprovalRequest` bound to the capability, the subject, the subject version and the execution.
- The UI or CLI shows the request. The advocate decides with a reason.
- The runtime resumes only with a valid, unconsumed approval for that version.
- A stale approval is refused.
- A denied approval is a blocked tool call. The agent sees the refusal and can explain it.
- `two_step` requires two distinct decisions, by the same advocate or two authorised advocates, as policy says.

### 7.8 Tool generation from capabilities

The agent tool list is not hand-written. For each capability with `interfaces` containing `agent` and `access` in `propose` or `execute`:

1. Generate a tool name and description from the descriptor.
2. Generate the input schema from the descriptor.
3. Generate the executor that calls the application service.
4. Attach the policy check.
5. Attach the approval check.
6. Attach the audit.

A capability with `access: human_only` is never generated. A capability with `access: read` can be generated as a read tool. A capability with `access: propose` creates a candidate or a review item. A capability with `access: execute` performs the operation, subject to approval.

This replaces the 102-name list and the ten supporting lists.

### 7.9 Context resolution

The agent must not receive the whole matter. A `ContextResolver` builds a package for one execution:

1. The matter summary: client, status, practice areas.
2. The active proceeding and court file.
3. The task: the advocate's instruction and the selected capability.
4. The relevant documents and anchors, selected by the capability's declared needs.
5. The accepted facts, disputed facts and contradictions relevant to the task.
6. The evidence items and their status.
7. The authorities and propositions, with verification state.
8. The advocate's approved preferences.
9. The prior execution results the agent may reuse.
10. The exclusions and the reason (token budget, scope, stale, unverified).

The package records what was included and excluded. A summary never replaces a source; it carries the anchor. The agent cannot request another matter's records.

### 7.10 Chat

Chat is a view over execution events.

- A **conversation** is a named sequence of executions in one matter (or the firm).
- An **execution** is one run.
- A **message** is a user message, an assistant message, a tool call, a tool result, an approval card or a notice.
- Messages are stored in the execution store with the execution id, not in the matter's legal record.
- A durable legal outcome is an application operation. If the advocate says "accept this fact" in chat, the agent calls `fact.review`; the `FactDecision` is the record. The chat text is not.
- The chat view can show a fact card with its current state. The card is a projection; the button calls the service.
- Chat export is an execution log export, not a legal record export.
- Chat history is never used as the source of a fact. The context resolver reads the Factual Record, not the chat.

### 7.11 Trace and observability

- One local trace per execution: model calls, tool calls, policy decisions, approvals, tokens, cost, latency, errors.
- The trace is JSONL or SQLite, not a cloud service.
- A diagnostics export removes secrets and matter content unless the advocate explicitly includes it.
- The Review Inbox shows failed executions, refused tools and budget stops.
- A trace line has: at, executionId, stepId, kind, capability, outcome, duration, tokens, error code. It does not have the full document text.

### 7.12 Failure modes

| Failure | Behaviour |
|---|---|
| Model provider unavailable | Execution fails with `MODEL_UNAVAILABLE`; the chat shows it; no legal record changes |
| Tool throws | The step fails; the agent sees the error; it may retry or stop |
| Policy denies | The tool is blocked; the agent sees the reason; no retry loop |
| Approval denied | The tool is blocked; the execution continues or stops by policy |
| Budget exceeded | The execution stops with `BUDGET_EXCEEDED`; partial results stay |
| Process crash | Execution is `interrupted`; resume from the journal |
| Tool outcome unknown | The agent is told; it must check state before retry |
| Corrupt policy | Every capability above read is denied |
| Cross-matter request | Denied before the domain call |
| Runtime bug | The execution fails; legal records are unchanged because the runtime has no store |

---

## 8. Chat, conversation and the legal record

### 8.1 What chat is

Chat is the advocate's conversation with an agent. It is useful for instructions, explanations, plans and review. It is not a database of facts, evidence, permissions or approvals.

### 8.2 What is stored

| Record | Store | Purpose |
|---|---|---|
| Conversation | Execution store | Name, matter, created, updated |
| Execution | Execution store | One run, state, budget, checkpoint |
| Message | Execution store | User, assistant, notice, card |
| Tool call/result | Execution store | What the agent did, with a result reference |
| Approval request | Work/Approval store | The decision the advocate must make |
| Legal decision | Owning domain | The fact/evidence/filing decision |

### 8.3 What is not stored in chat

- A fact's state. The Factual Record owns it.
- Evidence authenticity. The Evidence domain owns it.
- A filing approval. The Work/Approval domain owns it.
- A permission. The Policy domain owns it.
- A document. The Document domain owns it.

### 8.4 Chat and the context package

The context resolver may include recent chat messages for continuity, but it does not treat them as facts. A chat statement can become a proposed fact only through `fact.propose`, with a source or an explicit "advocate's knowledge" reason.

### 8.5 Chat UI

- A dock on the right, collapsible.
- The conversation is scoped to the active matter or the firm.
- A tool call is a collapsible card with its capability, status and result.
- An approval is a card with the subject, the effect and the decision buttons. The card is a view; the approval is a record.
- A fact/evidence card shows the current state and a link to the review screen.
- The chat cannot be the only place a decision is visible. The Review Inbox and the record screens show it too.

---

## 9. Desktop UI

### 9.1 The current problem

`App.tsx` is 798 lines and owns more than 25 state atoms: matters, active matter, sources, events, jobs, review items, page, drafts, notebook, focus, tab, dialogs, dock, browser. It routes every page with a conditional chain. `RightPane.tsx` and `Studio.tsx` are also large. The problem is not React. The problem is that the application shell owns every feature's state and orchestration.

### 9.2 Principles

1. **The UI is a client.** It calls capabilities through the gateway. It does not read SQLite or the filesystem.
2. **The shell owns navigation and active context, not feature data.** The active matter and proceeding are shared. A document list belongs to the Documents feature.
3. **A feature owns its queries, mutations, components and local state.** A feature can be loaded, tested and changed without editing `App.tsx`.
4. **The URL or route state is the source of navigation.** A route can be restored after a reload.
5. **Long-running work is visible.** An operation tray shows progress, cancel and retry.
6. **Approvals are a queue, not a modal.** A modal hides the context. A review queue shows the subject, the source and the effect.
7. **The chat is a panel, not the application.** It can be open, collapsed or hidden.

### 9.3 Shell and workspace

```
┌────────────────────────────────────────────────────────────────────┐
│ Title bar · active matter · command palette · browser · status     │
├──────────────┬──────────────────────────────────────┬──────────────┤
│ Navigation   │ Workspace                            │ Right panel  │
│              │  Matter header                       │  Chat        │
│ Home         │  Proceedings                         │  Source      │
│ Review Inbox │  Documents · Evidence · Facts        │  Approval    │
│ Matters      │  Drafts · Filing · Research          │  Properties  │
│ Calendar     │                                      │              │
│ Research     │                                      │              │
│ Knowledge    │                                      │              │
│ Court        │                                      │              │
│ Settings     │                                      │              │
├──────────────┴──────────────────────────────────────┴──────────────┤
│ Operation tray · errors · sync state                               │
└────────────────────────────────────────────────────────────────────┘
```

The workspace shows **one active proceeding** at a time. The matter header shows all proceedings as tabs or a selector. This prevents the "one overloaded matter pane" problem.

### 9.4 Active context

```ts
interface WorkspaceContext {
  organisationId: OrganisationId;
  matterId?: MatterId;
  proceedingId?: ProceedingId;
  courtFileId?: CourtFileId;
  documentId?: DocumentId;
  evidenceId?: EvidenceId;
  factId?: FactId;
}
```

The context is in the route. A feature reads it from a context provider. A feature does not store a copy of the active matter in its own state.

### 9.5 Feature modules

Each feature has the same shape:

```
features/facts/
  routes.ts          # route entries and labels
  api.ts             # typed calls to the gateway, capability IDs only
  queries.ts         # query keys and hooks
  mutations.ts       # command hooks and invalidation
  components/
    FactList.tsx
    FactDetail.tsx
    FactReview.tsx
    FactHistory.tsx
  state.ts           # local UI state only
  index.ts           # public surface
```

Features:

| Feature | Owns | Does not own |
|---|---|---|
| Matters | Matter list, creation, client link, assignment, lifecycle | Proceedings, documents, facts |
| Proceedings | Proceeding list, court, case type, stage, hearings, orders | Matter lifecycle, documents |
| Court files | Registry identity, filed documents, exhibits | Document content, evidence decisions |
| Documents | Import, versions, processing, classification, viewer | Evidence status, court-file roles |
| Evidence | Register, authenticity, admissibility, inclusion, chain | Document bytes, fact truth |
| Facts | Assertions, sources, positions, findings, review, history | Evidence status, legal propositions |
| Review Inbox | Cross-matter queue, filters, assignment | The subject record |
| Research | Search, authorities, propositions, citation checks | Facts, evidence, drafts |
| Drafting | Drafts, revisions, issues, citations, checks | Facts, evidence, filing state |
| Filing | Checklist, manifest, approval, submission state | Court file identity |
| Work | Tasks, deadlines, workflow runs | The records they reference |
| Agent chat | Conversation, execution events, approvals view | Legal records |
| Settings | Profile, organisation, policy, adapters, diagnostics | Legal records |

### 9.6 State ownership

| State | Owner | Example |
|---|---|---|
| Session | `SessionProvider` | Actor, organisation, roles |
| Workspace | route + `WorkspaceProvider` | Active matter/proceeding |
| Server data | feature query cache | Document list, fact list |
| Local UI | feature component | Open/closed, filter text, selected row |
| Operations | `OperationStore` | Running imports, progress, cancel |
| Notifications | `NotificationStore` | Toasts, errors |
| Theme | settings | Light/dark/system |

There is no global store for legal records. The query cache is keyed by capability and input. An event invalidates the affected keys.

### 9.7 Data access

```ts
const result = await gateway.invoke("fact.list", { matterId, state: "under_review" });
```

- No feature imports a repository or a store.
- No feature constructs SQL.
- No feature sends an actor.
- A feature may use a generated type from the capability schema.
- A feature handles `AppError` by code, not by parsing a message.

### 9.8 Long-running operations

- Import, OCR, export, index rebuild and agent runs return an operation or execution id.
- The operation tray shows progress and a cancel button.
- A feature can subscribe to its operation's events.
- On reload, the operation is still in the store and can be reattached.

### 9.9 Review and approval

- The Review Inbox is the default landing page for a matter with open items.
- An item shows: kind, subject, source anchor, why it matters, the decision options and the effect.
- A decision opens a panel, not a modal. The panel shows the source beside the decision.
- A filing approval is a two-step panel. Step 1 confirms the set. Step 2 confirms the payload hash. The submit button is absent in v1.
- A refusal requires a reason if the policy says so.

### 9.10 Matter, proceeding, document, evidence and fact screens

**Matter.** Client, status, practice areas, lead advocate, assignments, instructions, related matters, proceedings list. No court number or stage here.

**Proceeding.** Court, case type, side, stage (with source and date), hearings, orders, court files, documents, issues. A selector for the active court file.

**Court file.** Case number, diary number, CNR, filing date, bench, reported status (with source and time), filed documents, exhibits, orders.

**Documents.** List with kind, date, versions, processing state, court-file roles. Detail with a PDF viewer, text/OCR toggle, anchors, classification, provenance and version history.

**Evidence.** List with kind, source, authenticity, admissibility, inclusion. Detail with the source, chain, verification, court-file designations and decisions.

**Facts.** Table with text, kind, review state, sources, party positions, findings, contradictions. Detail with the source anchor, decision history and related facts. Review actions: accept working, dispute, reject, supersede. A judicial finding is shown as a finding, not as an editable fact.

### 9.11 Error, empty and loading states

- Every feature has an error boundary.
- An error shows the code, a human message and the correlation ID. It does not show a stack trace.
- An empty state says what is missing and what to do next. It does not pretend.
- A loading state does not block the whole app.
- A stale record shows `VERSION_CONFLICT` and offers reload.

### 9.12 Accessibility

- Keyboard-first navigation: command palette, tab order, focus traps in panels.
- Every icon button has a label.
- The PDF viewer and text viewer support keyboard selection and copy.
- Colour is not the only signal for review state.
- The app respects reduced motion.

### 9.13 UI technology

**Proposed decision.** Keep React 19 and Astryx. Change the architecture, not the framework.

Why:

- The application already has a component library, a theme, an editor host and a PDF viewer.
- The problem is state ownership and routing, not React.
- A new framework would add migration cost without solving the boundary.
- Astryx is a design system, not the application architecture. It can be replaced later if needed.

What to change:
- Remove feature state from `App.tsx`.
- Add a typed route/workspace context.
- Add feature modules.
- Add a query cache and an operation store.
- Replace the 344-channel IPC with the gateway.
- Keep the Euro-Office editor and the PDF viewer behind ports.

What not to do:
- Do not build a web app or a mobile app in v1.
- Do not add a second design system.
- Do not make the chat the centre of the window.
- Do not use modals for approvals.

---

## 10. Capability and policy runtime

### 10.1 The registry

```ts
interface CapabilityDescriptor {
  id: CapabilityId;
  domain: string;
  title: string;
  description: string;
  input: JsonSchema;
  output: JsonSchema;
  access: "read" | "propose" | "execute" | "human_only";
  scope: "matter" | "proceeding" | "firm" | "global";
  risk: "low" | "medium" | "high" | "reserved";
  approval: "none" | "once" | "always" | "two_step";
  sideEffects: string[];
  longRunning: boolean;
  interfaces: Array<"cli" | "desktop" | "agent" | "workflow">;
  handler: string;          // application service id
}
```

The registry is a `Map<CapabilityId, CapabilityDescriptor>`. The composition root registers handlers and descriptors together. A test asserts:

1. Every descriptor has a handler.
2. Every handler has a descriptor.
3. Every CLI command maps to a descriptor.
4. Every agent tool maps to a descriptor with `agent` in `interfaces`.
5. No human-only descriptor has `agent` in `interfaces`.
6. No descriptor with `access: read` has a write side effect.

### 10.2 Policy inputs

The policy engine receives:

- Actor id and kind.
- Organisation membership and role.
- Matter assignment and role.
- Capability access, risk and approval.
- Matter status (closed matter is read-only).
- Explicit approval, if the capability requires one.
- Whether the capability is available on this interface.

It returns allow, ask or deny. It never returns "allow because the file is missing". Missing or invalid policy is deny.

### 10.3 Fail closed

- Missing policy file: deny every capability above read.
- Corrupt policy file: deny every capability above read; show a diagnostic.
- Unknown capability: deny.
- Unknown actor: deny.
- No matter assignment: deny matter-scoped capabilities.
- Closed matter: deny writes; allow reads.
- Policy engine exception: deny.
- A denied call is logged with the actor, capability, scope and reason. It is not retried automatically.

### 10.4 Approval lifecycle

```
requested ──► approved ──► consumed
    │
    ├──► refused
    └──► expired
```

- An approval is bound to the subject id and version, the capability and the execution.
- A stale subject version invalidates the approval.
- A consumed approval cannot be reused.
- An expired approval (default 24 hours) is refused.
- A `two_step` approval requires two records with different steps.
- The ApprovalService is in the Work domain. It does not own the legal record; it owns the decision to allow the operation.

### 10.5 Audit

Every command appends an audit event in the same transaction:

```ts
interface AuditEvent {
  id: string;
  at: IsoDateTime;
  actor: ActorRef;
  capability: CapabilityId;
  subject: { kind: string; id: string; version?: number };
  outcome: string;
  reason?: string;
  correlationId: string;
  beforeHash?: string;
  afterHash?: string;
}
```

The audit is append-only and hash-chained per store. `audit.verify` checks the chain. A broken chain is a visible defect, not a silent warning.

### 10.6 Interface mapping

| Interface | How it calls | What it may expose |
|---|---|---|
| CLI | `commands.execute` / `queries.execute` | All descriptors with `cli` |
| Desktop | gateway `invoke` | All descriptors with `desktop` |
| Agent | generated tool | `read`, `propose`, `execute` with `agent`; never `human_only` |
| Workflow | step handler | Descriptors with `workflow`; approval per step |

A capability can be on several interfaces. The application service is the same. The interface only decides how to present it.

---

## 11. Court adapter runtime

### 11.1 Adapter shape

A court adapter is:

1. A **manifest** (`adapter.json`): id, version, courts, capabilities, access methods, auth, limitations, verification, sources, lists, proceedings.
2. An optional **code module** for browser automation. It runs in a worker with narrow ports.

The manifest is validated before it is registered. Unknown capabilities, hosts or fields are refused. A manifest cannot name a local file or a database.

### 11.2 Capabilities

| Capability | Returns | Human approval | v1 |
|---|---|---|---|
| `case_status` | Observation: status, bench, next date, source, time | No | Yes |
| `orders` | Document versions (PDF) and metadata | No | Yes |
| `cause_list` | Listings for a date and court | No | Yes |
| `filing_prepare` | Checklist, required parts, format checks, draft manifest | No | Yes |
| `filing_submit` | Submission attempt and receipt | Always | No (D3) |

An adapter that supports only `case_status` is valid. A missing capability is a visible limitation.

### 11.3 Observation flow

1. The adapter returns an observation with `courtId`, `subject`, `retrievedAt`, `sourceUrl`, `payload`, `verification`.
2. The application service `court.record_observation` validates the adapter and the court.
3. The observation is stored with its provenance. It is not a legal record.
4. A separate command may apply it: `proceeding.record_hearing`, `courtfile.record_status`, `document.import` for an order.
5. The applied record keeps the observation id. The UI shows "reported by the court adapter, unverified" until the advocate confirms.

### 11.4 Security

- No CAPTCHA solving. Hand off to the advocate.
- No stored court passwords. Use the advocate's session or DSC.
- No bulk scraping against a site's terms.
- Host allowlist per adapter.
- A timeout and a size limit on every fetch.
- A code module has no database handle, no application service handle and no arbitrary filesystem access.
- A downloaded file becomes a document version through the import capability, not by the adapter writing a file.

### 11.5 Filing preparation

`filing.prepare` uses the adapter's checklist and the court's rules to produce:

- Required parts.
- Format checks.
- Annexure map.
- A draft manifest with hashes.
- A list of unresolved defects.

It does not submit. The advocate approves the set. In v1 the advocate submits in the court portal.

---

## 12. Persistence and concurrency

### 12.1 Stores

| Store | Contents | Scope |
|---|---|---|
| `firm.db` | Advocate, organisation, membership, roles, practice areas, preferences, court directory, case types, rules, research, capability registry, cross-matter index | Organisation |
| `matter.db` | Matter, proceeding, court file, document metadata, evidence, factual record, drafting, work, audit | One matter |
| Blobs | Original bytes at `blobs/<sha256>` | One matter |
| `execution.db` | Conversations, executions, steps, approvals, traces | One organisation, with matter scope on rows |
| Derived indexes | FTS, vectors, cross-matter index | Rebuildable |

The execution store is separate because it is high-volume, non-legal and replaceable. It is the authority for execution state only, not for any legal record. Deleting or rebuilding it loses no fact, evidence, document or decision. The `firm.db` and the `matter.db` remain the only authorities for legal truth.

### 12.2 Write ownership

- Each table has one owning domain. A table ownership manifest lists it.
- A repository writes only its domain's tables.
- A unit of work owns the transaction.
- A cross-domain command uses one database and one transaction. A cross-database command avoids a distributed transaction: the matter database is the source of truth; the firm side is an idempotent projection with an outbox.

### 12.3 SQLite settings

- `journal_mode = WAL`
- `synchronous = NORMAL`
- `foreign_keys = ON`
- `busy_timeout = 5000` (configurable)
- One writer per database.
- A read-only connection for queries when the writer is elsewhere.

### 12.4 Locks

- A firm lock file for migrations and firm writes.
- A matter lock file for matter writes.
- The lock records PID, host, started time and command.
- A stale lock is detected by PID and age.
- The desktop holds the active matter lock only while a write is in progress or the matter is open for editing. Read views use a read-only connection.

### 12.5 Migrations

- Forward-only in production; down migrations for development.
- Each migration belongs to one domain.
- A migration is tested on a copy of a real matter.
- A failed migration rolls back and exits non-zero.
- The schema version is stored in the database and checked at open.

### 12.6 Backup and export

- `VACUUM INTO` for a consistent database copy.
- Copy the blob folder and verify every hash.
- Export a matter as a ZIP with a manifest and a checksum file.
- Import an export only through a validated command, not by copying files.
- A backup is tested by restoring to a temporary folder and opening it read-only.

### 12.7 Derived indexes

- FTS and vectors are rebuilt from canonical records.
- A rebuild is a command, not a background mystery.
- An index build records its input version and row count.
- A stale or failed index is visible. A query states its coverage.
- No derived index is a source of legal truth.

---

## 13. Errors, logging and diagnostics

### 13.1 Error contract

Every application error has a code, a message, optional details and a retryable flag. Codes are stable and documented. Examples:

| Code | Meaning |
|---|---|
| `POLICY_DENIED` | The actor may not perform the capability |
| `MATTER_NOT_FOUND` | The matter does not exist or is out of scope |
| `CROSS_MATTER_REFERENCE` | A record belongs to another matter |
| `VERSION_CONFLICT` | The record changed |
| `VALIDATION_FAILED` | The input is invalid |
| `CONFIRMATION_REQUIRED` | A dangerous operation needs `--yes` or an approval |
| `MATTER_LOCKED` | Another process holds the write lock |
| `OPERATION_CANCELLED` | The advocate stopped the operation |
| `MODEL_UNAVAILABLE` | No model is configured or reachable |
| `BUDGET_EXCEEDED` | The execution budget is spent |
| `POLICY_INVALID` | The policy file is missing or corrupt; deny |
| `AUDIT_CHAIN_BROKEN` | The audit chain does not verify |

### 13.2 Logging

- Local JSONL logs with correlation id, capability, actor id and duration.
- No secrets, no full document text, no matter content in diagnostics.
- A log rotation policy with a size cap.
- A diagnostics export includes versions, adapter health, index health, lock state and a redacted error summary.

### 13.3 Crash handling

- A crash writes a local dump and a log path. Nothing is uploaded.
- On restart, the host marks running executions and operations `interrupted`.
- The UI offers resume or fail. It does not auto-resume a reserved action.

---

## 14. Testing and independent proof

### 14.1 Test levels

| Level | What it proves |
|---|---|
| Domain unit | Rules and state transitions, with no I/O |
| Application | Authorisation, transaction, idempotency, audit, DTOs |
| Persistence integration | Schema, repositories, migrations, rollback, locks |
| CLI contract | Commands, JSON, exit codes, errors |
| IPC contract | Gateway, schemas, events, actor/scope |
| Agent contract | Tool generation, policy, approvals, resume, budget |
| Adapter contract | Court manifests, host allowlist, observations, timeouts |
| Architecture | Imports, table ownership, capability parity |
| Security | Cross-matter, fail-closed, human-only, browser scope |
| Integrity | Blobs, duplicates, OCR failure, index rebuild, audit chain |
| Scenario | Real litigation workflows, end to end |
| Owner proof | The owner completes a real task |

### 14.2 The scenario harness

A fixture set that every phase can use:

- Matter M1 with a client and three proceedings: suit, appeal, SLP.
- A shared judgment used in the suit and the appeal.
- A document with a text layer and a scanned document.
- Conflicting facts from two sources.
- An accepted fact, a disputed fact and a rejected fact.
- A corrected court order (two versions).
- A filing set prepared but not approved.
- A workflow that fails mid-step.
- A second matter with the same opposite party.
- A policy file that is corrupt.

The harness runs through the CLI, the IPC gateway and the agent. The same operation must give the same result.

### 14.3 Independent proof

A phase is not done because a test the agent wrote passes. A phase is done when:

1. The owner completes a real task on a real brief.
2. The result is visible in the record, with its source and decision.
3. The audit chain verifies.
4. The owner can explain what the system did and what it did not do.
5. No stand-in is presented as working. If a feature is not built, the screen says so.

---

## 15. Prior art

| Prior art | What to reuse | What to adapt | What to reject |
|---|---|---|---|
| **Clean Architecture** | Dependency direction; domain at the centre; ports and adapters | Keep it small; no layer for every folder | A layer cake with no behaviour |
| **Hexagonal Architecture** | Application services at the boundary; CLI/UI/agent as adapters | One core, two hosts | A port for everything |
| **Domain-Driven Design** | Bounded contexts, aggregates, ubiquitous language, invariants | Use tactical patterns only where they earn their place | Event sourcing every aggregate |
| **CQRS** | Command/query separation at the application boundary | One database; read models as queries/views | Separate write and read databases |
| **Pi** | SDK, sessions, streaming, tool calling, model runtime, skills | Wrap behind `AgentExecutionPort`; consider Pi Durable for checkpoints | Letting Pi types or sessions own legal state |
| **Pi Durable** | SQLite checkpoints, resume, replay-safe tools, exactly-once submissions | Use behind the execution adapter if compatible | Making an experimental API the application contract |
| **LangGraph** | Durable graph, interrupts, resume, streaming | Use for complex workflows behind the workflow port, if needed | Graph state as the legal domain model |
| **DeepAgents** | Planning/todo and subagent ideas | Borrow patterns for research runs | The harness as the application core; "trust the LLM" as security |
| **MCP** | Tool interoperability; a standard way to expose external tools | Map MCP tools to capabilities and policy | Treating MCP as the permission model |
| **docassemble** | Guided interviews and document assembly patterns | Use for intake/templates if a concrete need appears | Its runtime as the application core |
| **FreeEed** | E-discovery review patterns: batches, coding, provenance | Borrow review-queue ideas | Its stack and data model |
| **Paperless-ngx** | Document ingestion, OCR, tagging, correspondents | Borrow ingestion and metadata patterns | Its storage model as the legal record |
| **Legal DMS products** | Versioning, matter-centric document views, audit | Borrow the user expectations | Their closed data model or vendor lock-in |

**External facts, checked 20 November 2026.** Pi, Pi Durable, LangGraph and DeepAgents are MIT. Pi Durable is experimental. LangGraph is 1.x. DeepAgents is 1.16.2 and built on LangGraph. These facts are recorded, not used as a reason to adopt a product. Licence compliance is a separate owner task; this report does not give licensing advice.

**Do not copy an entire architecture from any one product.** The design borrows patterns, not products.

---

## 16. Architecture rules for coding agents

These are enforceable. A future coding agent must follow them.

1. **One owner for each truth.** A table belongs to one domain. Do not write another domain's tables.
2. **Domain has no I/O.** A domain module imports only the kernel. It does not import Electron, React, Pi, SQLite or `node:fs`.
3. **Interfaces are thin.** CLI, IPC, agent tools and workflows call application services. They do not contain business rules.
4. **One operation, one service.** Do not implement a use case twice.
5. **One capability registry.** Do not add a tool name to a second list. A capability without a handler, or a handler without a capability, fails the build.
6. **Human-only actions are never agent tools.** The agent may propose; the advocate decides.
7. **Policy fails closed.** Missing, corrupt or unknown policy denies.
8. **Matter isolation is enforced by the application.** The renderer and the agent do not supply a trusted matter id.
9. **No chat as a legal record.** A durable outcome is an application operation.
10. **Documents are versions, not files.** Never replace an original. A correction is a new version.
11. **Facts need a source or a reason.** A model extraction is not a fact. A judicial finding is not the advocate's fact.
12. **Evidence has three independent states.** Authenticity, admissibility and inclusion. Do not collapse them.
13. **Court adapters do not write legal records.** They return observations.
14. **Filing preparation and submission are separate.** Submission is human-only in v1.
15. **Every command is idempotent and audited.** A decision without an audit event is a defect.
16. **Long-running work has a durable state and a resume or fail path.**
17. **No new dependency without a recorded reason and a boundary.** Do not add a framework because it is popular.
18. **No UI direct storage.** The renderer calls the gateway.
19. **Architecture tests run in CI.** Imports, table ownership, capability parity and interface parity.
20. **No stand-ins.** A feature that does not work says so on screen.

---

## 17. Open decisions and risks

These are Stage 3 decisions that need confirmation before implementation. They are smaller than D1 to D4 but still material.

| # | Decision | Recommendation | Consequence |
|---|---|---|---|
| S1 | Is the hybrid store (firm DB + per-matter DB) confirmed? | Yes | Simpler export and confidentiality; one more file to back up |
| S2 | Is the CLI/desktop write lock enough, or is a local daemon needed? | Lock in v1; daemon only if measured | No second process; concurrent batch writes wait |
| S3 | Is Pi Durable adopted for checkpoints, or is a small journal built? | Try Pi Durable behind the adapter; fall back to the journal | Experimental API risk; the port keeps the option open |
| S4 | Is the UI kept on React + Astryx? | Yes | Reuse components; fix state ownership |
| S5 | Is a thin review UI included in the first slice? | Yes, if the owner will review the slice | Earlier UI work; better owner proof |
| S6 | Is the migration an importer, not an in-place rewrite? | Yes | Old data stays; unmapped rows are reported |
| S7 | Is the execution store per organisation or per matter? | Per organisation, with matter scope on rows | Simpler cross-matter chat; stronger query checks |
| S8 | Is court adapter code allowed in v1, or only manifests? | Manifests + built-in browser first; code modules later | Less risk; fewer adapters |
| S9 | What is the performance target for a 5,000-page matter? | Define in Phase 2: open < 2 s, search < 1 s, import 100 pages < 60 s on the owner's machine | A target to test, not a guess |

**Risks.**

| Risk | Why it matters | Mitigation |
|---|---|---|
| Scope creep | The current product catalogue lists 165 features; the rewrite can repeat the pattern | Phase gates; one vertical slice; parking lot |
| Migration fidelity | Real matters may not map cleanly | Importer with a report; old app read-only; owner verifies |
| Court adapter fragility | Court sites change; access is restricted | Manifests, visible failures, manual upload, no bulk |
| Agent framework lock-in | The runtime can become the app again | Execution port; Pi adapter; fake runtime in tests |
| Policy fail-open | A corrupt file could allow reserved actions | Deny by default; schema validation; tests |
| SQLite concurrency | Desktop and CLI can collide | WAL, locks, read-only reads, clear errors |
| LLM cost/latency | Long runs can be expensive | Budgets, local model option, trace, stop |
| Legal semantics | The model may be wrong about a legal distinction | Owner proof on real briefs; no auto-accept |
| UI rewrite | A new UI can consume the project | Keep React/Astryx; change state ownership only |
| Over-abstraction | Ports and layers can grow without behavior | One concrete use case per abstraction; no plugin platform |

---

## 18. Stage 3 verdict

The runtime and interface architecture is ready for Stage 4, with conditions:

1. The application-service boundary is the only path from an interface to a domain.
2. The capability registry is the only tool/permission source.
3. The execution port is the only agent API; Pi is an adapter.
4. Chat is a view, not a record.
5. The UI is a client, not an owner.
6. Policy fails closed.
7. The CLI and desktop use the same core.
8. The first slice is narrow enough to finish.

The next stage turns this into a dependency-aware build sequence, validates it against realistic litigation scenarios, and gives the final engineering assessment.

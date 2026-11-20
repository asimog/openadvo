# Core contracts — illustrative

Status: **proposed plan, presented for acceptance** (stage 6, deliverable D). These are the boundary shapes, not final code: each implementing phase fixes names at the depth it needs (lesson L1). Every type names its owning layer. Fields shown are the essential ones; validation rules live with their owners in [boundaries.md](boundaries.md) §3.

## 1. Foundation (shared, no rules)

```ts
type Id<T> = `${T["kind"]}-${string}`;          // e.g. "matter-x7…", "fact-a1…"
type ActorKind = "advocate" | "agent" | "system" | "helper";

interface Actor {                                // constructed by application coordination only
  kind: ActorKind;
  advocateId: Id<Advocate>;                      // present from day one (DQ-2), one row today
  sessionId?: Id<AgentSession>;
}

interface Scope {                                // every operation receives one (R-12)
  kind: "app" | "matter" | "proceeding" | "session";
  matterId?: Id<Matter>;
  proceedingId?: Id<Proceeding>;
}

interface AnchorRef {                            // typed reference, never free text (R-6, R-8)
  documentId: Id<Document>;
  page: number;                                  // 1-based
  line: number;
  anchorId: Id<Anchor>;                           // resolves through Documents at write time
}

type DomainResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: `${Uppercase<string>}_${string}`; detail: string }; // e.g. FACT_NOT_FOUND

interface ChainEvent {                           // the foundation's chain, per store (R-17)
  seq: number; actor: Actor; action: string; subject: string;
  at: string; data?: unknown; prevHash: string | null; hash: string;
}
```

## 2. Matter and Proceedings (the split the current system never made)

```ts
interface Matter {                                // domain: matter
  id: Id<Matter>;
  title: string;
  client: PartyRef;                               // client identity lives here
  status: "active" | "archived";
  instructions: Instruction[];                    // dated, each with its actor and chain event
  parties: Party[];                               // as the advocate records them
  assignments: Assignment[];                       // advocate ids (DQ-2: one today, additive later)
  createdAt: string;
}

interface Proceeding {                            // domain: proceedings — a case in a court
  id: Id<Proceeding>;
  matterId: Id<Matter>;                           // a matter holds zero or more of these
  courtId: CourtId;                               // typed directory id, never a display name
  caseType: CaseTypeId;                           // typed, from the adapter/court data
  caseNumber: CaseNumber | null;                  // shaped per the court's declared format
  diaryNumber: DiaryNumber | null;                // a first-class field, not event JSON
  stage: StageKey;                                // from the court's declared stage list
  partiesOfRecord: ProceedingParty[];
  connectedTo?: Id<Proceeding>[];                 // appeals and connected cases
}

interface Hearing {                               // domain: proceedings
  id: Id<Hearing>; proceedingId: Id<Proceeding>;
  date: string; kind: string; outcome?: OrderRef;
}
```

The SLP proceeding type is `caseType: "slp-civil"` plus a template pack — data, not structure (R-5, R-7).

## 3. Documents and Evidence (the file is not the record)

```ts
interface Document {                              // domain: documents
  id: Id<Document>;
  matterId: Id<Matter>;
  sha256: string;                                 // original bytes, write-once blob
  versions: DocumentVersion[];                   // superseded versions keep their hashes
  pages: PageRange;                               // anchors target these
  classification: DocumentClass;                  // court order, affidavit, email, photo, …
  processing: "pending" | "ocr" | "extracted" | "failed"; // state, visible on screen (L2)
  derived: DerivedRef[];                          // OCR text, conversions — labelled, reproducible
}

interface Evidence {                              // domain: evidence — a statement about sources
  id: Id<Evidence>;
  matterId: Id<Matter>;
  sources: AnchorRef[];                           // validated at write time (R-6)
  hashOfSource: string;                           // copied at registration: the chain names the bytes
  kind: "document" | "affidavit" | "order" | "photograph" | "email" | "other";
  authenticity: "unassessed" | "advocate-attested" | "disputed";
  provenance: { retrievedFrom?: string; retrievedAt?: string; suppliedBy?: string };
  relations: EvidenceRelation[];                  // supports / contradicts / duplicates …
}
```

## 4. Factual record and advocate acceptance (the decision is a record)

```ts
type FactOrigin =
  | { kind: "extracted" }        // a model read a source — always candidate
  | { kind: "proposed" }         // a person or the agent typed it
  | { kind: "instruction" }      // from the client, via the matter
  | { kind: "admission" }        // a party admitted it
  | { kind: "judicial-finding" } // an order or judgment found it
  | { kind: "advocate-asserted" };

interface Fact {                                 // domain: facts
  id: Id<Fact>;
  matterId: Id<Matter>;
  text: string;
  status: "candidate" | "accepted" | "disputed" | "rejected" | "superseded";
  origin: FactOrigin;
  sources: AnchorRef[] | InstructionRef | ProceedingEventRef;  // typed, validated
  supersedes?: Id<Fact>;
  createdAt: string;
}

interface FactDecision {                          // the acceptance is its own record (AQ-7 settled)
  id: Id<FactDecision>;
  factId: Id<Fact>;
  decision: "accept" | "dispute" | "reject";
  actor: Actor;                                   // kind: "advocate" — human-only, R-11
  decidedAt: string;
  reason?: string;
}
```

A model extraction can never carry `status: "accepted"`; only a `FactDecision` with an advocate actor moves a fact there, and the chain carries both.

## 5. Court adapter (data, and only data)

```ts
interface CourtAdapter {                          // infrastructure: declared, versioned, checked
  id: CourtAdapterId; version: string;
  courts: CourtId[];
  hosts: string[];                               // https-only fetch whitelist
  capabilities: {                                 // what it can do — differences are expected
    caseStatus: boolean; ordersAndJudgments: boolean; causeList: boolean;
    filingChecklist: boolean; certifiedCopies: boolean;
    retrieval: "official-feed" | "advocate-session" | "manual-upload" | "none";
    filingSubmission: false;                      // DQ-6: never an adapter capability
  };
  sources: CourtSource[];                         // key, title, owner, checkDays, reliability, locate
  lists: CourtList[];                             // checklists, limitation rules — quoted, with refs
  formatChecks: FormatCheck[];                    // pdf_max_mb, pdf_searchable, …
  limitations: string;                            // known limits, in plain words
}
```

Adapters write directory data **through the Courts domain**; they hold no legal record and cannot submit anything (DQ-6).

## 6. Capability (declared once, derived everywhere)

```ts
interface Capability {
  id: string;                                     // stable: "facts.accept"
  operation: OperationName;                       // must resolve — coherence test
  domain: DomainName;
  inputSchema: unknown; outputSchema: unknown;
  scope: "app" | "matter" | "proceeding";
  access: "read" | "propose" | "execute" | "human-only";  // DQ-6: submit = human-only
  risk: "low" | "medium" | "high";
  sideEffects: SideEffect[];
  surfaces: Array<"cli" | "desktop" | "agent" | "workflow">;
}
```

Per-session and per-skill subsets are computed from this list, never restated (R-9). An entry with `access: "human-only"` cannot appear on an agent surface — the coherence test fails if it does.

## 7. Agent execution (the owned interface)

```ts
interface AgentExecution {                        // application layer — the runtime sits behind this
  start(request: { matterId: Id<Matter>; message: string }): Promise<RunRef>;
  stream(runRef: RunRef): AsyncIterable<AgentEvent>;   // to CLI, UI, or trace
  approve(runRef: RunRef, callId: ToolCallId, decision: ApprovalDecision): Promise<void>;
  cancel(runRef: RunRef): Promise<void>;
  checkpointOf(runRef: RunRef): AgentCheckpoint;       // execution state only (DQ-4)
}

type AgentEvent =
  | { kind: "run-start" | "run-finish" | "run-fail" }
  | { kind: "tool-call"; tool: CapabilityId; args: unknown }
  | { kind: "tool-result"; callId: ToolCallId; result: DomainResult<unknown> }
  | { kind: "approval-request"; callId: ToolCallId; capability: CapabilityId; detail: string };
```

The engine (LangGraph.js, per [agent-runtime.md](agent-runtime.md)) implements this interface and owns nothing else: no store, no capability decision, no legal text.

## 8. Workflow (coordinates, owns no record)

```ts
interface WorkflowDefinition { id: string; version: number; steps: WorkflowStep[]; }

interface WorkflowStep {
  operation: OperationName;                        // coherence-tested
  inputs: Record<string, unknown>;
  gate?: "before" | "after";                       // an approval item, answered by the advocate
  onFailure: "stop" | "skip" | "fail-run";
}

interface WorkflowRun {                            // the legal checkpointer's subject (DQ-4)
  id: Id<WorkflowRun>; matterId: Id<Matter>;
  definitionId: string; definitionVersion: number;
  state: "running" | "interrupted" | "failed" | "stopped" | "completed";
  completedSteps: StepRecord[];                    // the reconciler restarts from the last of these
  startedAt: string; reconciledAt?: string;
}
```

## 9. What is deliberately absent

- No generic plugin interfaces, no event bus, no repository abstraction over SQLite — every one would add a second owner to something that already has one (rule 18: no abstraction without a concrete use case).
- No `kernel.ts`. The foundation above is types plus the chain; adding a business rule to it is a structural-test failure by definition.
- No migration layer: DQ-3 chose a fresh start.

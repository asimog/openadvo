# Module report: permissions, audit and provenance

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: the agent tool policy, human-only writes, the trusted renderer, browser and portal isolation, secret storage, the per-store hash chains, refusal records, the Inspector, the Find index, filing manifests and signatures, capture provenance, citation checks and the provenance library.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Tool policy | `src/main/tool-policy.ts` (`PolicyStore`) | `tool-policy.json`, `logs/tool-policy.jsonl` |
| Trusted bridge | `src/main/bridge.ts` | `trusted()` check |
| Human-only matter writes | `src/lib/matter-store/index.ts` | `human()` and `WriteContext` |
| Human-only generic writes | `src/lib/store-chain/index.ts` | `humanOnly()` |
| Agent builder scope | `src/lib/builders/index.ts` | `checkAgent` |
| Browser isolation | `src/main/browser.ts` | Partitions |
| Portal guard | `src/main/portal.ts` | Origins, submit guard, confirmations |
| Secrets | `safeStorage` | Mail, enrolment, signing key |
| Store chain | `src/lib/store-chain/`, `src/lib/matter-store/audit.ts` | `event` per store |
| Refusals | `src/lib/matter-store/audit.ts` | `refusal` table |
| Inspector | `src/lib/matter-store/audit.ts` | `inspect` |
| Find | `src/lib/matter-store/audit.ts`, `src/main/audit.ts` | `find_fts` |
| Filing manifest | `src/main/filing.ts`, `src/main/signing.ts` | `filing_set`, signature |
| Capture provenance | `src/lib/matter-store/work.ts` | `capture` table |
| Citation checks | `src/main/research.ts`, `corpus.db` | `citation_check`, `shared_citation_check` |
| Provenance library | `src/lib/verification/provenance.ts` | Library only |
| Audit UI | `src/renderer/src/AuditPanels.tsx`, `Pages.tsx` | Inspector, record integrity, store chains |

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Allow, ask, deny per tool | Implemented | `ToolPolicy`, `decide` | Default allow |
| Fixed denial of Pi built-ins | Implemented | `ALWAYS_DENIED` | read, bash, edit, etc. |
| Credential-path denial | Implemented | `CREDENTIAL` regex | Args that name secrets |
| MCP server rules | Implemented | `ruleFor` | `mcp__server__*` |
| Party rule for web | Implemented | `partyIn`, `PARTY_TOOLS` | Ask when a party name appears |
| Approval queue and timeout | Implemented | `policyExtension` | One at a time; fail closed on hook error |
| Policy log | Implemented | `PolicyStore.log` | Deny and ask, not all allows |
| Human-only store writes | Implemented | `human()`, `humanOnly()` | Actor check |
| Human-only agent tool rejection | Implemented | `checkAgent` | Build-time |
| Trusted renderer only | Implemented | `trusted()` | Dev or file URL |
| Browser partitions | Implemented | `persist:oa-browser` vs per-agent | Hidden pages |
| Portal origin allowlist | Implemented | `Portal.allowed` | SC/eCourts |
| Submit control refused to click | Implemented | `Portal.click` | Only `submitFiling` |
| Two confirmations | Implemented | `confirmedSet` | Bound to payload |
| Secret storage | Implemented | `safeStorage` | Mail, enrolment, signing key |
| Matter hash chain | Implemented | `event`, `eventHash`, `verifyChain` | Append-only |
| Advocate/intel/corpus chains | Implemented | `CHAIN_SCHEMA`, `appendChained` | Per store |
| Refusal log | Implemented | `refusal` table | Append-only |
| Inspector | Implemented | `inspect` | Record, events, links |
| Find index | Implemented | `find_fts` | Derived, rebuildable |
| Filing manifest and signature | Implemented | `manifestDigest`, `KeyFileSigner` | Ed25519 |
| Capture provenance | Implemented | `capture` table | Portal, browser, email, receipt |
| Citation checks | Implemented | `citation_check`, `shared_citation_check` | Validator record |
| Traces and usage | Implemented | `trace.jsonl`, `agent.usage` | Per run and matter |
| Provenance labels | Library-only | `provenance.ts` | Not wired |
| Role-based access | Missing | One local advocate | No firm RBAC |
| Confidentiality enforcement | Missing | Flag stored, not used | Decision 24 removed the check |
| Fail-closed policy read | Missing | `PolicyStore.read` falls back to allow | Corrupt file allows |
| Full tool-call audit | Partial | Trace and policy log | Allows are not all logged |
| Classification/pack/rule decision audit | Missing | No tables | Only profile write |
| Corpus chain UI | Missing | StoreChainsView only advocate/intel | No corpus row |
| Retention and legal hold | Missing | No path | Archive only |
| External timestamp or notary | Missing | No path | Local signature only |

## 3. Current flow

```text
Tool call
  → policyExtension
  → decide(policy, tool, args, parties)
      → fixed denial
      → credential denial
      → tool rule
      → party rule
  → allow / ask / deny
  → ask: approval card, queue, timeout
  → result

Legal write
  → service passes WriteContext
  → store human() or humanOnly() checks actor
  → write + hash-chained event in one transaction
  → refusal recorded if refused
```

```text
Filing
  → approve set
  → confirmation 1
  → confirmation 2
  → portal upload only confirmed files
  → submit only both confirmations
  → receipt or reconcile
```

## 4. Problems

### P-01: The policy defaults to allow and fails open on read

**Evidence.** `DEFAULT_POLICY = { default: "allow", tools: {} }`. `PolicyStore.read()` returns the default on a parse error. `cleanPolicy` falls back to the default for an unknown value.

**Effect.** A corrupt policy file allows every tool. A new tool or MCP server is allowed until a rule is written. This is the opposite of least privilege.

**Target.** The default is `ask` for write, fetch, court and model tools; `allow` for local read-only tools. A parse error denies all non-read tools. A missing policy uses the safe default, not `allow`.

### P-02: The confidentiality flag is inert

**Evidence.** `matter_policy.confidential` is stored. `bridge.ts:336` sets it. `studio.ts:680` says decision 24 removed the confidential check. No retrieval, model or web path reads it.

**Effect.** The UI offers a protection the application does not provide. A client could be told the matter is confidential while it is sent to a remote model.

**Target.** Either enforce it or remove it. If enforced: local model only, no web, no external source, no remote citation validator without a redacted query. If not enforced: remove the flag and state the rule. Do not keep an inert control.

### P-03: Human-only checks are repeated in every store

**Evidence.** `MatterStore.human`, `store-chain.humanOnly`, bridge functions that hardcode `{ actor: "advocate" }`, `checkAgent` for tools.

**Effect.** A new store or service can forget the check. The actor is a string, not an authenticated principal.

**Target.** One `PermissionService` checks the principal, the action and the resource. The store receives a signed `Principal`, not a string. A new service cannot write a legal record without the check.

### P-04: The party rule is a heuristic, not a privacy control

**Evidence.** `partyIn` lowercases every argument string and checks whether it contains a party name of at least three characters.

**Effect.** A common name or a short name creates false asks. A different spelling, an initial or a company name creates a false allow. It is a useful prompt, not a data-loss control.

**Target.** Keep it as a prompt. Add a `DataScope` check: a web or remote model call is allowed only for the fields the matter policy permits. A confidential matter blocks the call, not only asks.

### P-05: Audit proves integrity, not legal reason

**Evidence.** The event chain covers writes. Classification is a transient proposal; pack choice is recomputed at read; rule applicability and obligation do not exist. `provenance.ts` is not wired. `StoreChainsView` shows advocate and intel, not corpus.

**Effect.** A reader can prove a record was not changed. A reader cannot reconstruct why a classification, a pack or a rule was chosen.

**Target.** A `DecisionRecord` for classification, pack choice, rule applicability, obligation, limitation and filing. Each has actor, time, reason, source refs, before/after and version.

### P-06: The policy log is partial

**Evidence.** `PolicyStore.log` is called for deny and ask. An allow is not logged. The trace records policy lines for asks and denies.

**Effect.** The owner cannot answer "what did the agent read or send?" for an allowed call.

**Target.** Log every tool call: tool, target, rule, decision, outcome, duration and correlation id. Keep secrets out. Rotate and retain by policy.

### P-07: No retention or legal hold

**Evidence.** Archive is a marker file. Sources are never deleted. Filing sets are append-only. There is no retention setting or legal hold.

**Effect.** The data grows. A deletion request has no supported path. A hold cannot be placed on a matter.

**Target.** A `RetentionPolicy` per matter and per store. Archive, purge derived text, purge blobs, hold. A purge is audited and leaves a tombstone. A legal hold blocks purge.

### P-08: No external verification of the chain

**Evidence.** The export writes a signed `record-chain.json`. The signature is local Ed25519. There is no timestamp authority or external notary.

**Effect.** A reader can verify the chain against the exported public key. They cannot prove when it was signed, except by the local clock.

**Target.** Optional: a local RFC 3161 timestamp or a detached signature with a trusted time. Keep the offline verification path.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `Principal` | Advocate, agent, system, integration, with an id |
| `PermissionRequest` | Principal, action, resource, scope, args |
| `PermissionDecision` | Allow, ask, deny; rule; reason; time |
| `Approval` | Once, conversation, refuse; actor; time |
| `AuditEvent` | Actor, action, subject, before/after, reason, correlation id, hash |
| `DecisionRecord` | A legal or procedural decision with sources |
| `Refusal` | A refused write or tool call |
| `Manifest` | Files, digest, signature, approvals |
| `Provenance` | Source label, value, note |
| `RetentionPolicy` | Keep, archive, purge, hold |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `PermissionService` | Policy, principals, approvals, data scope | `advocate.db`, settings |
| `AuditService` | Event envelope, decision records, chains, inspection | All stores |
| `ProvenanceService` | Citation, fact, provision and source labels | `ResearchService`, `EvidenceService` |
| `RetentionService` | Retention, archive, purge, hold | All stores |
| `SigningService` | Manifest key and signature | OS secret store |

### 5.3 Contracts

```ts
interface PermissionService {
  setPolicy(policy: ToolPolicy, partyRule: boolean): Promise<ToolPolicy>;
  ask(input: PermissionRequest): Promise<PermissionDecision>;
  decide(decisionId: string, approval: Approval): Promise<PermissionDecision>;
  assert(principal: Principal, action: string, resource: Resource): Promise<void>;
  log(filter?: LogFilter): Promise<PermissionLogEntry[]>;
}

interface AuditService {
  append(event: AuditEvent): Promise<void>;
  recordDecision(decision: DecisionRecord): Promise<void>;
  verify(store: StoreName): Promise<ChainCheck>;
  inspect(matterId: string, id: string): Promise<Inspection | null>;
  decisions(filter: DecisionFilter): Promise<DecisionRecord[]>;
  refusals(matterId: string, limit?: number): Promise<Refusal[]>;
}
```

### 5.4 The default policy

| Tool class | Default | Why |
|---|---|---|
| Local read-only | allow | Low risk; the matter is already open |
| Local write | ask | Changes a legal record |
| Web fetch/search | ask | Leaves the machine; party rule |
| Court portal | ask | External effect; confirmation |
| Model call | per matter policy | May send facts |
| Credential or shell | deny | Fixed |
| MCP or extension | ask | Unknown capability |

A policy parse error denies every class except local read-only. A missing rule uses the class default.

### 5.5 The audit envelope

```ts
interface AuditEvent {
  id: string;
  correlationId: string;
  at: string;
  actor: Principal;
  action: string;
  subject: string;
  before: unknown | null;
  after: unknown | null;
  reason: string | null;
  sourceRefs: string[];
  version: string;
}
```

Every legal decision uses `recordDecision` with the same envelope plus the evidence and the decision. The per-store chain hashes the envelope. A derived `decision_index` joins them for the UI.

## 6. Boundaries

- `PermissionService` owns the policy and the approval. It does not own the tool or the store.
- `AuditService` owns the envelope and the chain. It does not own the legal record.
- `ProvenanceService` owns the label. It does not own the source.
- `RetentionService` owns the lifecycle. It does not own the bytes.
- Every service asks `PermissionService`; every service writes `AuditService`.

## 7. Migration

1. Change the policy default to `ask` for write/fetch/court/model. Keep local reads allowed.
2. Make `PolicyStore.read` fail closed.
3. Decide the confidential flag: enforce or remove.
4. Add `Principal` and stop hardcoding `{ actor: "advocate" }` in the bridge.
5. Log every tool call.
6. Add `DecisionRecord` for classification, pack, rule, obligation, limitation and filing.
7. Wire provenance into authority, provision and fact views.
8. Add the corpus chain to the store health view.
9. Add retention and legal hold.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| PA-01 | Corrupt policy file | Write/fetch tools denied |
| PA-02 | New MCP tool with no rule | Ask, not allow |
| PA-03 | Party name in a web query | Ask with the party named |
| PA-04 | Confidential matter with a remote model | Blocked if enforced |
| PA-05 | Human-only write by an agent | Refused |
| PA-06 | Every tool call | Logged with decision and correlation id |
| PA-07 | Classification decision | Decision record with evidence and reason |
| PA-08 | Rule applicability decision | Decision record with rule version and date |
| PA-09 | Tamper with an event | Chain verification fails |
| PA-10 | Filing manifest | Signature and file hashes verify |
| PA-11 | Retention purge | Audited; tombstone; legal hold blocks it |
| PA-12 | Provenance | Every authority and provision shows a source label |

## 9. Recommendation

**Keep the chain, the fixed denials, the human-only rule and the filing confirmations. Change the default to ask, fail closed, enforce or remove confidentiality, log every call, and record legal decisions.** The controls are strong for a single advocate. The gaps are policy defaults, an inert confidentiality flag and an audit that proves integrity but not reason.

## Appendix: evidence map

- `src/main/tool-policy.ts` — policy, approval, log.
- `src/main/bridge.ts` — trusted renderer, human-only bridge functions.
- `src/lib/store-chain/index.ts` — chain, humanOnly.
- `src/lib/matter-store/audit.ts` — chain, refusals, Inspector, Find.
- `src/main/audit.ts` — Find, files.
- `src/main/signing.ts` — Ed25519.
- `src/main/portal.ts` — submit guard, confirmations.
- `src/lib/verification/provenance.ts` — provenance, not wired.
- `src/renderer/src/AuditPanels.tsx`, `Pages.tsx` — audit UI.

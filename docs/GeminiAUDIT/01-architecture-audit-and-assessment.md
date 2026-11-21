# 01. Architecture Audit and Assessment

## 1. Executive Summary

This document reports the architectural audit of Open Advocate. It reviews the current codebase to explain why the existing application became difficult to maintain. 

This audit relies on verified evidence from the repository files. It does not assume earlier design proposals were correct. It distinguishes four categories:
- **Verified Current Behaviour**: What the code in `src/` and tests in `tests/` actually execute.
- **Stated Requirements**: The requirements of a general Indian litigation workbench.
- **Proposed Decisions**: Architectural decisions evaluated for the greenfield rewrite.
- **Unresolved Questions**: Engineering questions that require empirical validation.

---

## 2. Methodology and Audit Scope

The audit examined source code, tests, and configuration files. It measured line counts, import graphs, IPC message paths, state ownership, and policy enforcement boundaries.

The primary files inspected include:
- [src/main/agent.ts](file:///c:/dev/openadvo/src/main/agent.ts): 3,118 lines.
- [src/main/index.ts](file:///c:/dev/openadvo/src/main/index.ts): 1,060 lines.
- [src/main/bridge.ts](file:///c:/dev/openadvo/src/main/bridge.ts): 1,307 lines.
- [src/renderer/src/App.tsx](file:///c:/dev/openadvo/src/renderer/src/App.tsx): 773 lines.
- [src/preload/index.ts](file:///c:/dev/openadvo/src/preload/index.ts): 419 lines.
- [src/shared/api.ts](file:///c:/dev/openadvo/src/shared/api.ts): 906 lines.
- [src/main/tool-policy.ts](file:///c:/dev/openadvo/src/main/tool-policy.ts): 255 lines.
- [src/main/portal.ts](file:///c:/dev/openadvo/src/main/portal.ts): 271 lines.
- [src/main/filing.ts](file:///c:/dev/openadvo/src/main/filing.ts): 496 lines.
- [src/lib/classification/index.ts](file:///c:/dev/openadvo/src/lib/classification/index.ts): 134 lines.
- [src/lib/matter-store/evidence.ts](file:///c:/dev/openadvo/src/lib/matter-store/evidence.ts): 648 lines.
- [src/lib/matter-store/index.ts](file:///c:/dev/openadvo/src/lib/matter-store/index.ts): 448 lines.
- [package.json](file:///c:/dev/openadvo/package.json): 98 lines.

---

## 3. Verified Repository Findings and Architectural Failures

### 3.1 `src/main/agent.ts` (3,118 lines): Responsibility Accumulation

#### Verified Current Behaviour
In [src/main/agent.ts#L1099-L1850](file:///c:/dev/openadvo/src/main/agent.ts#L1099-L1850), the file declares over 50 agent tools inside the `Agent.newConversation` and `Agent.switchConversation` methods using the `@earendil-works/pi-coding-agent` SDK. 

The file directly performs:
1. File input/output for chat history, traces, and plans: [src/main/agent.ts#L483](file:///c:/dev/openadvo/src/main/agent.ts#L483) (`messages.json`), [src/main/agent.ts#L2137](file:///c:/dev/openadvo/src/main/agent.ts#L2137) (`plan.json`), [src/main/agent.ts#L2298](file:///c:/dev/openadvo/src/main/agent.ts#L2298) (`handoffs.json`), and [src/main/agent.ts#L2396](file:///c:/dev/openadvo/src/main/agent.ts#L2396) (`trace.jsonl`).
2. Tool definitions and validation schemas via TypeBox.
3. Tool execution logic coupling the agent session to the `AgentHost`, `BrowserAgentHost`, `HarnessHost`, and `AgentWorkHost` interfaces ([src/main/agent.ts#L206-L340](file:///c:/dev/openadvo/src/main/agent.ts#L206-L340)).
4. Cost accounting, token calculation, and CSV generation: [src/main/agent.ts#L2267-L2275](file:///c:/dev/openadvo/src/main/agent.ts#L2267-L2275).
5. AG-UI interrupt definition and response handling: [src/main/agent.ts#L58-L86](file:///c:/dev/openadvo/src/main/agent.ts#L58-L86).
6. Helper agent orchestration and steering: [src/main/agent.ts#L2176-L2220](file:///c:/dev/openadvo/src/main/agent.ts#L2176-L2220).

#### Root Cause
The agent runtime was treated as an application coordinator rather than a delivery adapter. The developer added every new capability directly to the agent tool definition list in `agent.ts`.

#### Failed Boundary
The boundary between Agent Execution and Application Services collapsed. The agent runtime directly orchestrates domain services and persistence rather than calling a uniform application layer.

#### Why Tests and Reviews Missed It
Unit tests mocked `AgentHost` ([tests/unit/agent-fixture.ts](file:///c:/dev/openadvo/tests/unit/agent-fixture.ts)). The tests verified tool outputs in isolation. They did not test the architectural coupling or the accumulation of domain logic in the agent session.

#### Failure Classification
Architecture and Implementation failure.

#### Prevention Rule
The agent runtime must be an external interface consumer. Agent tools must be thin wrappers around Application Service commands. Agent runtimes must never directly read or write files, chat records, or database rows.

---

### 3.2 `src/main/index.ts` (1,060 lines): Monolithic Main Entry Point

#### Verified Current Behaviour
In [src/main/index.ts#L80-L125](file:///c:/dev/openadvo/src/main/index.ts#L80-L125), the main Electron process entry point constructs over 25 distinct singletons as mutable module-level variables:
`matters`, `agent`, `ingest`, `drafts`, `research`, `filing`, `portal`, `mail`, `workHost`, `recordTables`, `signer`, `progress`, `hub`, `contacts`, `studio`, `advocateStore`, `intelStore`, `skillRegistry`, `practicePacks`, `courtIntel`, `browser`, `library`, `integrations`, `skillImporter`, `proposals`.

In [src/main/index.ts#L182-L215](file:///c:/dev/openadvo/src/main/index.ts#L182-L215), the function `createMatterFromFields` coordinates business logic across seven distinct services (`matters`, `filing`, `matters.store`, `contacts`, `store.setProfile`, `store.addParty`, `store.addHearing`).

#### Root Cause
Lack of an Application Service layer or Dependency Injection container. The Electron startup script became the location for global lifecycle orchestration and domain coordination.

#### Failed Boundary
Application Entry Point versus Application Services. `index.ts` conflates process lifecycle management with domain workflow logic.

#### Why Tests and Reviews Missed It
Integration and E2E tests boot Electron directly via Playwright ([tests/e2e/app.spec.ts](file:///c:/dev/openadvo/tests/e2e/app.spec.ts)). Because the application boots successfully in test runs, the lack of composition boundaries went unnoticed.

#### Failure Classification
Architecture failure.

#### Prevention Rule
The entry point must only wire dependencies and start the interface listener. Multi-domain coordination belongs strictly inside Application Services.

---

### 3.3 `src/main/bridge.ts` (1,307 lines): IPC Bridge and Circular Dependencies

#### Verified Current Behaviour
In [src/main/bridge.ts#L42](file:///c:/dev/openadvo/src/main/bridge.ts#L42), `bridge.ts` imports types directly from `index.ts` (`import type { ModelRole } from "./index.ts";`), while `index.ts` imports and executes `registerBridge` from `bridge.ts` ([src/main/index.ts#L8](file:///c:/dev/openadvo/src/main/index.ts#L8)). 

In [src/main/bridge.ts#L119-L121](file:///c:/dev/openadvo/src/main/bridge.ts#L119-L121), `registerBridge` receives an untyped dictionary of 40+ dependency singletons passed from `index.ts`. Over 300 IPC handlers are registered imperatively in a single 1,200-line function block ([src/main/bridge.ts#L122-L1307](file:///c:/dev/openadvo/src/main/bridge.ts#L122-L1307)).

#### Root Cause
The bridge was designed as an imperative dispatch table rather than a typed message gateway. Every renderer feature added an ad-hoc IPC route.

#### Failed Boundary
Presentation Adapter versus Application Boundary. IPC handlers execute business logic, parameter cleaning, and direct file path manipulations instead of forwarding clean Command/Query objects.

#### Why Tests and Reviews Missed It
Tests primarily targeted isolated units or ran full end-to-end clicks in Chromium, bypassing IPC contract validation.

#### Failure Classification
Architecture and Implementation failure.

#### Prevention Rule
IPC must use a typed Command/Query Bus with strict schema validation. Bridge modules must never import entry points.

---

### 3.4 `src/renderer/src/App.tsx` (773 lines): Monolithic State Container

#### Verified Current Behaviour
In [src/renderer/src/App.tsx#L157-L200](file:///c:/dev/openadvo/src/renderer/src/App.tsx#L157-L200), the root React component `App` defines 26 separate `useState` hooks. It holds application-wide state for:
- Matter selection (`matters`, `matterId`).
- Document sources and ingestion jobs (`sources`, `jobs`, `events`).
- Review queues and inbox counts (`reviewItems`, `inboxCount`, `inboxBlocking`).
- Active workspace views and navigation tabs (`page`, `tab`, `navCollapsed`).
- Draft focus and revision tracking (`drafts`, `openDraft`, `openRevision`, `draftFocus`).
- Browser dock and carry-over state (`browserActive`, `dockSlot`, `dockCarry`).

#### Root Cause
State was concentrated at the root component to allow sharing between tabs, avoiding dedicated state management or domain-specific context providers.

#### Failed Boundary
UI Presentation Layer versus Feature State Management.

#### Why Tests and Reviews Missed It
React components rendered without runtime crashes in happy-path E2E tests. State race conditions during complex multi-tab transitions were not covered by automated assertions.

#### Failure Classification
Implementation and UI Architecture failure.

#### Prevention Rule
UI features must manage their own state within feature containers. Cross-feature communication must use explicit domain context providers or workspace navigation events.

---

### 3.5 Preload Surface Area (`src/preload/index.ts`: 419 lines, `src/shared/api.ts`: 906 lines)

#### Verified Current Behaviour
In [src/preload/index.ts#L421](file:///c:/dev/openadvo/src/preload/index.ts#L421), the preload script exposes `window.openadvo` to the renderer. 
A count of function signatures reveals **357 distinct methods** directly exposed on `window.openadvo`. Methods range from low-level file checks to high-level drafting actions.

#### Root Cause
Every service operation added in the backend was mirrored directly into the preload script as a separate IPC wrapper method.

#### Failed Boundary
Secure Boundary Encapsulation. Exposing 357 specific procedural functions creates a fragile API contract that breaks with minor backend refactors.

#### Why Tests and Reviews Missed It
TypeScript compilation succeeded because `shared/api.ts` maintained matching type signatures for the 357 methods.

#### Failure Classification
Architecture failure.

#### Prevention Rule
The preload bridge must expose a minimal, unified invocation interface: `invoke(command, payload)` and `subscribe(topic, callback)`.

---

### 3.6 Tool Policy Fail-Open Vulnerability (`src/main/tool-policy.ts`)

#### Verified Current Behaviour
In [src/main/tool-policy.ts#L22](file:///c:/dev/openadvo/src/main/tool-policy.ts#L22):
```typescript
export const DEFAULT_POLICY: ToolPolicy = { default: "allow", tools: {} };
```
In [src/main/tool-policy.ts#L34-L39](file:///c:/dev/openadvo/src/main/tool-policy.ts#L34-L39):
```typescript
export function cleanPolicy(v: unknown): ToolPolicy {
  const o = (v && typeof v === "object" ? v : {}) as { default?: unknown; tools?: unknown };
  const tools: Record<string, Rule> = {};
  if (o.tools && typeof o.tools === "object") for (const [k, r] of Object.entries(o.tools as Record<string, unknown>)) if (isRule(r) && /^[\w.:*_-]{1,80}$/.test(k)) tools[k] = r;
  return { default: isRule(o.default) ? o.default : DEFAULT_POLICY.default, tools };
}
```
If the policy file on disk is corrupted, empty, or unparseable, `cleanPolicy` falls back to `DEFAULT_POLICY.default`, which is `"allow"`. Any tool without an explicit override defaults to `"allow"`.

#### Root Cause
Inverted security posture. The policy system was designed for developer convenience (permissive by default) rather than high-assurance legal data protection (fail-closed).

#### Failed Boundary
Security and Policy Boundary.

#### Why Tests and Reviews Missed It
Tests in [tests/unit/tool-policy.test.ts](file:///c:/dev/openadvo/tests/unit/tool-policy.test.ts) verified that explicit "deny" rules worked for listed tools. They did not test corruption recovery or missing configuration fallbacks against a fail-closed requirement.

#### Failure Classification
Security and Policy Architecture failure.

#### Prevention Rule
The system must fail closed. The default policy for any unlisted tool or corrupted configuration must be `"deny"` or `"ask"`. Valid policy data must be cryptographically signed or schema-validated with fatal halt on error.

---

### 3.7 Court Access and Cross-Matter Session Contamination (`src/main/portal.ts`)

#### Verified Current Behaviour
In [src/main/portal.ts#L73-L89](file:///c:/dev/openadvo/src/main/portal.ts#L73-L89):
```typescript
const ses = session.fromPartition("persist:oa-portal");
...
if (!(ses as unknown as { __oaDownloads?: boolean }).__oaDownloads) {
  (ses as unknown as { __oaDownloads?: boolean }).__oaDownloads = true;
  ses.on("will-download", (_event, item) => {
    const matterId = this.matterId;
```
The browser uses a single global persistent partition `persist:oa-portal` across the entire application lifecycle. The instance variable `this.matterId` in `Portal` is mutated whenever `open(matterId)` is called ([src/main/portal.ts#L59-L61](file:///c:/dev/openadvo/src/main/portal.ts#L59-L61)).

#### Impact
1. **Session Contamination**: If an advocate logs into a court portal (such as eCourts or High Court portal) for Matter A, then switches to Matter B, the browser partition retains Matter A's cookies, local storage, and active login credentials.
2. **Download Race Condition**: If a download started under Matter A finishes after the advocate opens Matter B, `this.matterId` has changed to Matter B. The downloaded court order or petition is automatically ingested into the wrong matter!

#### Root Cause
Single-window reuse with mutable global state, instead of matter-scoped ephemeral or isolated partitions.

#### Failed Boundary
Matter Isolation Boundary and External Integration Boundary.

#### Why Tests and Reviews Missed It
Tests ran on isolated, single-matter instances in simulated mock environments without simulating concurrent or sequential multi-matter downloads.

#### Failure Classification
Data Integrity and Security failure.

#### Prevention Rule
Every matter browser session must run in an isolated partition (`persist:oa-matter-<matterId>`). Downloads must bind to immutable transaction tokens, not mutable class properties.

---

### 3.8 Evidence Anchors Accept Unverified Text Strings (`src/lib/matter-store/evidence.ts`)

#### Verified Current Behaviour
In [src/lib/matter-store/evidence.ts#L335-L350](file:///c:/dev/openadvo/src/lib/matter-store/evidence.ts#L335-L350):
```typescript
addFact(input: { text: string; type: string; sourceId?: string | null; anchorId?: string | null; ... }, ctx: WriteContext): FactRecord {
  ...
  this.db.prepare("INSERT INTO fact (id, text, type, status, source_id, anchor_id, ...) VALUES (?, ?, ?, ?, ?, ?, ...)")
    .run(String(id), text, input.type, status, input.sourceId ?? null, input.anchorId ?? null, ...);
```
`anchor_id` is defined as a nullable string (`anchor_id TEXT`). The method inserts `anchor_id` directly without validating against the `anchor` table or checking if the source SHA-256 hash, page number, and line offset correspond to an authentic byte range.

#### Root Cause
Treating provenance anchors as decorative UI metadata rather than an evidential integrity constraint.

#### Failed Boundary
Evidence and Provenance Integrity Boundary.

#### Why Tests and Reviews Missed It
Unit tests passed mock anchor strings like `"sha:1:1"` without requiring the mock database to verify relational foreign key constraints against source blobs.

#### Failure Classification
Data Modelling failure.

#### Prevention Rule
An evidence anchor must be a strictly validated domain value object. It must prove its origin against a registered document blob SHA-256 and verified coordinate/line boundary before persistence.

---

### 3.9 Insecure Filing Submission and Event Limit (`src/main/portal.ts`, `src/main/filing.ts`)

#### Verified Current Behaviour
In [src/main/portal.ts#L187](file:///c:/dev/openadvo/src/main/portal.ts#L187):
```typescript
const submit = (el.tagName === "BUTTON" && (el.type || "submit") === "submit") || (el.tagName === "INPUT" && (el.type === "submit" || el.type === "image"));
if (submit) return "refused: submit control";
```
If a web application uses `<button type="button" onclick="doSubmit()">` or a styled `<div role="button">`, `el.type` is `"button"`. The refusal check evaluates to `false`! The agent's `browser_click` tool clicks the button and submits the filing directly, bypassing the two-confirmation human approval rule.

Furthermore, in [src/main/portal.ts#L223](file:///c:/dev/openadvo/src/main/portal.ts#L223):
```typescript
for (const e of [...store.listEvents(5000)].reverse()) {
```
The filing state calculation scans a hardcoded maximum of 5,000 events. If a large matter exceeds 5,000 events, earlier filing submissions and reconciliation events are truncated, corrupting the filing state calculation.

#### Root Cause
Brittle DOM heuristic detection for critical security enforcement, combined with arbitrary event query limits.

#### Failed Boundary
External Portal Boundary and Filing Authority Boundary.

#### Why Tests and Reviews Missed It
Test forms in fixtures used standard `<button type="submit">`, which matched the regex check. Realistic portal DOM structures were not tested.

#### Failure Classification
Security and Architecture failure.

#### Prevention Rule
No automated agent browser tool may trigger network requests to filing submission endpoints. Filing submission must be strictly reserved for human interaction or explicit, isolated, token-authenticated native operations. Event streams must use structured event-sourcing folds, not arbitrary limit slices.

---

### 3.10 Brittle Classification Rules (`src/lib/classification/index.ts`)

#### Verified Current Behaviour
In [src/lib/classification/index.ts#L27-L45](file:///c:/dev/openadvo/src/lib/classification/index.ts#L27-L45):
```typescript
const text = [input.title, ...input.sourceNames, input.profile.proceeding, input.profile.court].join(" ").toLowerCase();
let practiceArea = "";
if (has(/bail|fir|quash|482|crpc|ipc|bns|bnss|criminal|accused|complaint/)) practiceArea = "criminal";
else if (has(/writ|article 226|article 32|mandamus|certiorari|constitutional/)) practiceArea = "constitutional";
```
Classification relies on superficial regex checks on file names and titles. If a commercial dispute file contains a police complaint as an exhibit, the entire matter is classified as "criminal". 

Furthermore, `proceeding` is conflated with `caseType`:
```typescript
const proceeding = input.profile.proceeding.trim() || caseType;
```

#### Root Cause
Heuristic shortcuts substituted for structured legal document classification and matter data modelling.

#### Failed Boundary
Domain Model Boundary (Classification versus Case Model).

#### Why Tests and Reviews Missed It
Unit tests tested specific expected strings (e.g. titles containing "bail") which naturally triggered the corresponding branches.

#### Failure Classification
Domain Modelling failure.

#### Prevention Rule
Classification must be an asynchronous domain analysis operation performed on parsed document contents, with confidence scores and explicit advocate review. Legal concepts (Matter, Proceeding, Court, Case Type) must be separate first-class entities.

---

### 3.11 Monolithic Matter Store Schema (`src/lib/matter-store/index.ts`)

#### Verified Current Behaviour
In [src/lib/matter-store/index.ts#L18-L38](file:///c:/dev/openadvo/src/lib/matter-store/index.ts#L18-L38), a single SQLite database (`matter.db`) contains schemas for 12 disparate domains:
`WORK_SCHEMA`, `STUDIO_SCHEMA`, `RESEARCH_PLAN_SCHEMA`, `NOTEBOOK2_SCHEMA`, `AUTHORITY2_SCHEMA`, `PRACTICE_SCHEMA`, `EVIDENCE_SCHEMA`, `OUTCOME_SCHEMA`, `FOREIGN_SCHEMA`, `FILING_CHECKS_SCHEMA`, `SKILL_RUN_SCHEMA`, and `AUDIT_SCHEMA`.

There is no structural separation between the advocate's client matter, distinct court proceedings, court filings, raw documents, and factual assertions.

#### Root Cause
"Single writer per matter" was misinterpreted as "single database table collection with no domain boundaries".

#### Failed Boundary
Domain-Driven Design Bounded Context Boundary.

#### Why Tests and Reviews Missed It
SQLite handles multi-table transactions easily. The failure was not database crashes, but semantic entanglement and inability to refactor one domain without affecting the others.

#### Failure Classification
Architecture and Data Modelling failure.

#### Prevention Rule
Each bounded domain must own its records. Shared databases may exist only if domain write boundaries and schemas are strictly partitioned.

---

## 4. Architectural Summary: What Failed, What to Retain, What to Discard

| Subsystem | Verified Failure | Status in Rewrite | Architectural Remedy |
|---|---|---|---|
| **Agent Runtime (`agent.ts`)** | 3,118 lines. Holds tool definitions, IO, prompts, and business logic. | **DISCARD** implementation; **RETAIN** concept of scoped agent assistance. | Replace with an external Agent Interface calling standard Application Services. |
| **Main Wiring (`index.ts`)** | 1,060 lines. Global singleton bag and business logic coordinator. | **DISCARD**. | Replace with clean Composition Root and Dependency Injection container. |
| **Bridge (`bridge.ts`)** | 1,307 lines. Monolithic IPC registration with circular dependency. | **DISCARD**. | Replace with typed Command/Query Bus. |
| **Renderer (`App.tsx`)** | 773 lines. Monolithic state container with 26 `useState` hooks. | **DISCARD**. | Replace with modular workspace layout and feature-level state stores. |
| **Tool Policy (`tool-policy.ts`)** | Permissive default (`allow`). Fails open on corruption. | **DISCARD**. | Fail-closed policy engine. Default deny for all operations. |
| **Browser Portal (`portal.ts`)** | Shared partition `persist:oa-portal`. Cross-matter data leaks. | **DISCARD**. | Isolated per-matter browser partitions. Strict boundary on submit actions. |
| **Matter Data Model (`matter-store`)** | Conflates Matter, Proceeding, Document, and Evidence into one flat SQLite schema. | **DISCARD**. | Domain-driven entities: Matter, Proceeding, Court File, Document, Evidence, Factual Record. |
| **Document Processing** | PDF/A conversion, OCR wrappers (Tesseract, docTR), text extract. | **RETAIN**. | Encapsulate as clean infrastructure adapters under Document Processing Service. |
| **Citation Verification (`ulos`)** | Standalone legal citation validation logic. | **RETAIN**. | Encapsulate as a Research Adapter with explicit offline/online capability declarations. |
| **Euro-Office Host** | Official local editor integration. | **RETAIN**. | Keep as an isolated document editor host adapter. |
| **Local-First Storage Principle** | SQLite and content-addressed blobs (SHA-256). | **RETAIN**. | Preserve local-first, hash-addressed storage model, but enforce domain schema boundaries. |

---

## 5. Architectural Distinctions: Architectural vs Implementation Details

To prevent repeating earlier mistakes, the rewrite must distinguish architectural requirements from implementation details:

1. **Architectural Decisions (System Invariants)**:
   - One canonical owner for each type of truth.
   - Domain logic depends on nothing outside the domain.
   - Delivery interfaces (CLI, UI, Agent) are peers calling the same Application Services.
   - Human authority cannot be delegated to an LLM.
   - The system fails closed on all permission and policy errors.
   - Original documents are immutable and content-addressed.

2. **Implementation Details (Interchangeable Choices)**:
   - Specific choice of SQLite driver (`node:sqlite` vs `better-sqlite3`).
   - Specific UI component library or styling system.
   - Specific LLM client SDK (Pi SDK, OpenAI SDK, Anthropic SDK).
   - Exact token budget metrics or cache reporting formats.

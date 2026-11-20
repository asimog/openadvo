# Rewrite failures — Stage 2: causes and consequences

Status: **diagnosis only**. This file owns the architectural failure analysis of the codebase audited at commit `26ac806` (2026-11-20). Every symptom is grounded in [audit.md](audit.md), which owns the verified facts; file:line citations here refer to that commit. The audit's section 5 answered the five questions for the concern table's symptoms; this file owns the full failure inventory and the synthesis.

This stage proposes no architecture. Each failure ends in a **missing rule**: a constraint stated so that a design either satisfies it or visibly does not. *How* to satisfy the rules is Stage 3. Nothing here reopens a frozen decision; where code and an instruction file disagree, the mismatch is reported, as AGENTS.md orders.

## 0. Reading guide

| Label | Meaning |
|---|---|
| **Symptom** | Verified behaviour from the audit, cited. |
| **Cause** | The mechanism that produced it. A diagnosis, not a restatement. |
| **Boundary that failed** | The ownership or integrity boundary that was never built, or that existed only in prose. |
| **Why it was missed** | Why the green suite (419 passing unit tests) and the doc-rule review did not catch it. |
| **Category** | Architecture, data model, implementation, or missing policy — as the assignment requires. |
| **Consequences** | `[observed]` = visible in the repository. `[projected]` = the mechanism is verified in code; no occurrence is recorded in the repository. |
| **Missing rule** | The constraint whose absence allowed the failure. Numbered R-1 to R-17. |

A failure, in this file, is a boundary that did not hold — never a large file. A smaller file with the same responsibilities would keep every failure below.

## 1. The three root patterns

Seventeen failures are catalogued below. They reduce to three root patterns. Each pattern is evidenced by the audit.

**Pattern 1 — Unowned concepts.** The product names concepts that never received a code home: a proceeding, a capability, a matter-scoped external session, a recovery state, an application operation. Because no owner existed, each feature attached its meaning locally. The "proceeding" became one TEXT field on a one-row profile (`practice.ts:35-47`). The "capability" became ten separate allowlists (audit 4.4). The "recovery state" became nothing (zero grep matches for checkpoint; `jobs.ts:17-18` renders a crashed run "running" forever). The "operation" became inline code in the entry point, the bridge and the tool handlers (`index.ts:794-1016`, `bridge.ts:212-239`, `agent.ts:1099-2015`).

**Pattern 2 — Unenforced claims.** Statements that were true when written, with no check that kept them true: the single-caller claim (`repo-map.md:10` against 11 runtime store callers), the "no SLP constant in the core" comments (`filing.ts:33`, `index.ts:729` against `drafts.ts:29`), "no business logic" in the renderer (decision 3 against the rules in audit 4.11), the three-copy IPC contract. Each drifted. Nothing failed. A green suite ran the whole time.

**Pattern 3 — Accretion without a gate.** Features landed where the wiring was easiest to reach. The five most-modified files in the repository are exactly the assembly and contract layer — `src/main/index.ts` (56 modifications), `src/shared/api.ts` (51), `src/main/agent.ts` (50), `src/preload/index.ts` (41), `src/lib/matter-store/index.ts` (33) — plus `App.tsx` (27) close behind. Pattern 3 is a consequence of Patterns 1 and 2: when a new piece of work has no owner, the widest-known file receives it, because no rule says where else it must go.

The maintenance difficulty the owner reported is Patterns 1 and 2 compounded by Pattern 3. The rest of this file is the itemized evidence.

## 2. Failure inventory

### Group A — Ownership and assembly

#### F-1. No composition boundary: the entry point is the application

**Symptom.** `index.ts` constructs ~30 services (`index.ts:583-1091`), holds 23 mutable singletons (`index.ts:91-123`), implements the agent's host callbacks inline (`index.ts:794-1016`), and contains matter creation, the evidence dispatcher, filing-pack selection and direct `usage.jsonl` writes (`index.ts:160-183,731-778,862-869,936-1006`).

**Cause.** Assembly and behaviour grew in the same place because no boundary separates them. Each feature needed its service *somewhere reachable from every other service*; the entry point is the only such place in the design.

**Boundary that failed.** Application assembly (what exists and how it is wired) versus application operations (what the application does). The two never separated.

**Why it was missed.** Unit tests never import `index.ts` (28 of 48 main files have no direct test import, audit 4.12); e2e proves only that the app boots and works, not who owns what.

**Category.** Architecture.

**Consequences.** `[observed]` The most-modified file in the repository is a wiring file; every feature change touches the entry point, so the blast radius of any change is the whole application. `[projected]` The inline `AgentHost` means the agent's write surface is defined by entry-point code: an audit of agent permissions must read the entry point, and an edit there can change agent authority without any permission review.

**Missing rule.** **R-1.** The process entry assembles and starts. It owns no operation, holds no business state, and accepts no feature code.

#### F-2. Delivery interfaces own business decisions

**Symptom.** The bridge converts an accepted argument into a Grounds paragraph (`bridge.ts:217-223`), fires triggers and injects chat messages that tell the agent to run skills (`bridge.ts:1263-1278`), calls store methods directly (`bridge.ts:212,227-239,410,429,721,741,744,1015`), and writes files (`bridge.ts:392,409`). The renderer holds per-kind legal guidance text (`WorkspaceViews.tsx:86-111`), computes the filing confirmation gate by hash comparison (`Work.tsx:373`), enforces the impugned-judgment eligibility rule (`Work.tsx:117`), maps relation types (`MatterProfile.tsx:196`), defines the chronology filter (`Notebook.tsx:201,285`), and intercepts `/btw` before the agent sees it (`ChatDock.tsx:424-429`).

**Cause.** The one-handler-per-action pattern (`bridge.ts:3` header) placed the decision at the seam, because no named operation existed between the interface and the stores. "No business logic" was enforced for *writes* only; read-side filtering, gating and legal copy were never assigned an owner.

**Boundary that failed.** Interface (IPC handler, React view) versus operation (a named piece of application work). Decision 3 said "no business logic" for the renderer but never defined the seam, so the seam grew the logic.

**Why it was missed.** No test distinguishes a decision from a display. E2e asserts outcomes; the outcomes were correct.

**Category.** Architecture; missing policy (the unexamined scope of decision 3).

**Consequences.** `[observed]` The same rule now lives twice in verified cases: the filing gate is enforced in `portal.ts:245-275` and recomputed in `Work.tsx:373`; the tab vocabulary disagrees across three files (15/10/9, audit 4.11). `[projected]` A rule fixed in one copy and not the other fails silently — the renderer can display "confirmed" while main's state differs.

**Missing rule.** **R-2.** An interface handler routes to a named operation and renders its result. Every decision — what qualifies, what is confirmed, what the options are — is owned outside all interfaces, once.

#### F-3. The agent runtime is also the registry, the operations and the record

**Symptom.** `agent.ts` (~3.1k lines) holds the tool allowlist (`agent.ts:89-192`), the port definitions for the whole main process (`agent.ts:206-339`), model runtime and credentials (`agent.ts:352-365,793-970`), conversation persistence (`agent.ts:437-519,2826-2853`), every tool definition inline in `start()` (`agent.ts:1099-2015`), plan and handoff state (`agent.ts:2133-2173,2296-2308`), turn orchestration and AG-UI translation (`agent.ts:2855-3212`), trace and cost (`agent.ts:598-614,2990-3013`), and the system prompt, which states the SC-AOR identity and domain rules (`agent.ts:388-427`). Tool handlers perform business operations: `import_case_documents` downloads and rebuilds (`agent.ts:1269-1285`), `run_agent` synthesizes a workflow definition in the handler (`agent.ts:2530-2546`), `browser_read` opens review items (`agent.ts:1792-1813`).

**Cause.** The harness was the first generic surface, so each phase's new capability was added to it. There was no operations layer for a tool to call, so the tool became the operation.

**Boundary that failed.** Three boundaries at once: runtime (how a turn executes) versus registry (what can be called) versus operation (what the call does). None separates.

**Why it was missed.** Agent tests use the real class over a scripted model and pass; behaviour is correct while the file absorbs every phase (50 modifications).

**Category.** Architecture.

**Consequences.** `[observed]` Replacing or upgrading the runtime (Pi 1.5.2 is pinned, `package.json:49-50`) means rewriting capabilities, persistence formats and prompt content that live in the same file as the session loop. The domain identity ("Advocate-on-Record of the Supreme Court of India", `agent.ts:390`) is embedded in runtime code, so a practice-area change is a runtime-code change.

**Missing rule.** **R-3.** A tool definition declares its inputs and delegates to a named operation. The runtime owns no business operation, no legal text and no domain identity.

#### F-4. The UI shell owns every feature's state

**Symptom.** `App.tsx` holds 30 `useState` hooks including matters, sources, events, jobs, review items, notebook, drafts and open-document context (`App.tsx:157-200`); fans out six API calls on refresh with a hand-rolled staleness counter (`App.tsx:207-215,163`); switches 13 view branches (`App.tsx:529-784`); passes 19 props, 12 of them ReactNodes, to the matter view (`App.tsx:650-752`). No router, no context, no store (grep: zero matches). Chat state is held twice — main persists it; `ChatDock` keeps a live copy with its own reducer (`ChatDock.tsx:269-398`), and `FirmChat` duplicates the same machinery (`FirmChat.tsx:40-72`).

**Cause.** The shell predates every feature, and no boundary ever said which state belongs to which feature. New panels added their data to the only state owner that existed.

**Boundary that failed.** Application shell (navigation, active context) versus feature state. The boundary is stated nowhere, so the shell grew to be the single owner.

**Why it was missed.** Every e2e test passes through the shell, so the shell's correctness is the most-tested and least-questioned code in the repository.

**Category.** Architecture.

**Consequences.** `[observed]` Every feature change touches `App.tsx` (27 modifications); the tab vocabulary drifts because three files each restate it; an error-scrubbing regex is repeated in 9 renderer files.

**Missing rule.** **R-4.** The shell owns navigation and the active context, nothing else. Feature state lives in the feature; data shared across features passes through a declared contract, not a prop chain.

### Group B — Domain model

#### F-5. The proceeding has no record; the first workflow became the spine

**Symptom.** A matter holds one proceeding: one TEXT field on a one-row `matter_profile` (`practice.ts:35-47`) and one row in `filing_target` (`filing-checks.ts:11-18`). No proceeding table exists in any store. SLP is privileged in ten verified paths (audit 4.5): the SLP pack is the data default (`packs/slp.json:7`, `lib/packs/index.ts:221-222`); the generic DraftKind `petition` renders SLP text (`drafts.ts:436-455`) and `condonation` the SLP application (`drafts.ts:456-469`); every `petition` draft gets the SLP prayer check (`drafts.ts:894-897`); filing compliance demands an impugned judgment for every proceeding (`lib/filing/index.ts:87-88`); the classifier, stage lists, agent prompt and Studio persona are SC-first (audit 4.5). Meanwhile the code comments say "the core holds no SLP constant" (`index.ts:729`, `filing.ts:33`) while `drafts.ts:29` imports SLP generators.

**Cause.** The first product surface was one SLP workflow before one court. It was built directly into the matter's own fields and the drafting kinds, because the concept that should have carried it — a proceeding record — did not exist. Generalization was then impossible without breaking the fields the SLP flow already occupied: the generic name "petition" was taken by a specific proceeding type, so every later petition is an SLP unless made otherwise.

**Boundary that failed.** Matter (the advocate's work record) versus proceeding (a case in a court) versus workflow configuration (how one proceeding type is served). The three collapsed into one row.

**Why it was missed.** The e2e suite drives the SLP happy path. No test asks for a matter with two proceedings, or for a `petition` that is not an SLP; neither is representable, so neither was ever attempted.

**Category.** Data model.

**Consequences.** `[observed]` The product's stated scope (all Indian courts, all litigation) is unreachable in the model: a matter cannot hold a second proceeding, and a new court needs code changes (`COURT_FORMATS` contains exactly one court, `drafting/documents.ts:522-524`). The identity drift is visible in `package.json:5` ("for Supreme Court Advocates-on-Record") and `agent.ts:390`. Case numbers and diary numbers are free TEXT and event JSON (`work.ts:39-40`, `portal.ts:238`), so no proceeding fact can be checked for shape or uniqueness.

**Missing rule.** **R-5.** Every concept the product names — matter, proceeding, court, case type, stage — has a record with one owner. A workflow-specific artefact never occupies a generic concept's name.

#### F-6. Provenance integrity is optional

**Symptom.** An `anchor` table exists, written by ingest with geometry and text (`index.ts:1132-1133`), and is a foreign key in exactly one table (`notebook_event`, `index.ts:169`). Everywhere else the anchor id is free TEXT inserted verbatim: `fact.anchor_id` (`evidence.ts:40,347-348`), `document_part` (`evidence.ts:78`), `record_cell` (`work.ts:204`), `forum_clause`, `foreign_element`, memory. The agent's `propose_fact` silently degrades a missing anchor to null (`index.ts:950`). The integrity inspector checks anchor *shape* by regex, not existence (`audit.ts:128`).

**Cause.** Anchors were added table by table as features arrived. The last table got the foreign key; the earlier ones were never retrofitted, and no rule required it.

**Boundary that failed.** Reference integrity between derived records and the records they cite. The guarantee exists as a comment ("The source's SHA-256, so the chain names the bytes", `shared/evidence.ts:45-46`) and is enforced only where the newest code happened to run.

**Why it was missed.** No test inserts a fact with a fabricated anchor; the inspector's regex passes any well-shaped string.

**Category.** Data model.

**Consequences.** `[projected]` A fact, a document part or a record cell can cite a line that does not exist. Nothing detects it at write time; the hash chain proves only that the write happened, not that the reference resolves. For a litigation tool whose core promise is provenance, the weakest seam is exactly where the promise is quoted.

**Missing rule.** **R-6.** A reference to a record is validated by that record's owner at write time. A write with an unresolvable reference fails.

#### F-7. Court generalization stopped at the adapter

**Symptom.** The adapter framework is sound and is data (audit 6.7). But the core still names courts in code: generic filing compliance always names the Supreme Court registry (`lib/filing/index.ts:112-118`); `COURT_FORMATS` holds one court (`drafting/documents.ts:522-524`); binding logic regex-matches "supreme" (`lib/authority/binding.ts:35-36`); the advocate graph sniffs court names to ids (`advocate-store/graph.ts:34-38`); the judgment corpus is an SC-only bucket (`research-sources/aws.ts:12`); the quick citation check is INSC-only (`matter-store/authority2.ts:192-194`); provenance classifies `.gov.in` domains as official (`verification/provenance.ts:54`); the Studio persona and rehearsal are Supreme-Court-specific (`lib/studio/index.ts:97`, `rehearsal.ts:61`); the court directory itself is an in-code list (`court-directory/index.ts:83-102`).

**Cause.** The adapter layer was built (phase 2) and then each later phase needed "the current court" somewhere — and reached for code, because no general capability-and-format channel existed from adapter data into those consumers.

**Boundary that failed.** The adapter's declared capabilities were never made the *only* route by which court-specific behaviour reaches the core. The data path and the code path both stayed open, and the code path was shorter.

**Why it was missed.** Three courts ship (`adapters/`), and all three defaults are SC/Delhi (questions.md Q-1). The hard-coded paths and the adapter data agreed, so nothing contradicted — until a fourth court arrives, and no test adds one.

**Category.** Architecture; data model.

**Consequences.** `[observed]` Supporting a new court requires edits across verification, drafting, authority, research sources, studio prompts and the directory — every place the audit listed. `[projected]` A fourth court will produce mixed behaviour: adapter-supplied checklists alongside SC-defaulted compliance and formats.

**Missing rule.** **R-7.** Court-specific behaviour reaches the core only as declared adapter data — capabilities, formats, rules, limitation. Code branches and prompt text that name a court are defects.

#### F-8. Value domains are free text at the layer seams

**Symptom.** The classifier emits a display-name court ("Supreme Court of India", `classification/index.ts:62`) that the filing layer rejects because it requires a directory id (`index.ts:933-934`). Case type is free text checked only as non-empty (`index.ts:934-935`). The diary number exists only inside event JSON (`portal.ts:238`). The renderer maps a detection basis to a legal relation type (`MatterProfile.tsx:196`). The classifier's `parties` and `basis` are produced and consumed by nothing (`bridge.ts:1013-1027`).

**Cause.** Each seam evolved its own vocabulary for the same concept, and nothing reconciled them. Strings are the path of least resistance between two modules, and TypeScript cannot check a domain vocabulary that was never written down.

**Boundary that failed.** The domain value (a court, a case type, a relation) versus its string rendering in one layer. The value was never given a type, so every seam invented a spelling.

**Why it was missed.** Every layer works in isolation; tests per layer pass. The mismatch appears only on the path classifier → filing, which no test drives with the classifier's own output.

**Category.** Data model; architecture.

**Consequences.** `[observed]` The classification proposal can be applied and then fail downstream at filing time, with no error at apply time. Derived fields are produced that no consumer validates — the audit's "incomplete matter proposal schema" concern.

**Missing rule.** **R-8.** Every seam carries a typed domain value. Free text is a rendering concern at the outermost edge, never an interchange format.

### Group C — Trust, permission, and external state

#### F-9. Permission is declared ten times

**Symptom.** At least ten separate allowlists (audit 4.4): `AGENT_TOOLS`, `FIRM_TOOLS`, `PLAN_TOOLS`, `SIDE_TOOLS`, Pi's built-in names duplicated in two files that must stay in sync (`pi-extensions.ts:29` and `tool-policy.ts:26`), read-only/sequential hints, per-skill `permittedTools`, `NEVER_IN_A_SKILL`, the policy file, and the hard start check (`agent.ts:2691-2700`).

**Cause.** Each session kind got its own list because the lists were per-session facts, not projections of one capability set. Nothing computed "what a helper may do" from "what exists and what it requires" — each was restated.

**Boundary that failed.** A single capability authority. The hard start check (`agent.ts:2691-2696`) verifies each session's list against *itself*, which cannot detect drift between lists.

**Why it was missed.** Drift is only detectable by comparing lists, and no test compares them.

**Category.** Architecture; missing policy.

**Consequences.** `[projected]` A new tool added to `AGENT_TOOLS` but not to the skill validator's expectations, or a builtin renamed in one of the two duplicated files, yields a session that either exposes or hides a capability inconsistently — with no failing signal anywhere. The e2e inventory test (`app.spec.ts:267-378`) snapshots today's list and would have to be edited in the same commit to stay green, so it enforces stasis, not coherence.

**Missing rule.** **R-9.** Capabilities and their permissions are declared once. Per-session and per-skill subsets are derived, never restated. Two copies of the same allowlist are a defect.

#### F-10. Policy integrity fails open at the source

**Symptom.** `PolicyStore.read()` swallows any read or parse error and returns the default allow-all (`tool-policy.ts:130-136`); `cleanPolicy` never throws (`tool-policy.ts:39-44`). The hook layer fails closed only on an unexpected throw (`tool-policy.ts:270-276`). The header comment claims "An error in the hook blocks the call (fail closed)" (`tool-policy.ts:9`) — true for the hook, false for the file.

**Cause.** Fail-closed was implemented at the point where decisions are made, and the source of the policy was left with a convenience default. The two layers answer different questions and only one was designed.

**Boundary that failed.** Policy *source* integrity versus policy *decision* integrity. The second exists and is tested; the first fails open.

**Why it was missed.** The tests cover corrupt rules (values cleaned to defaults) and hook errors — no test corrupts or deletes the file itself.

**Category.** Implementation; missing policy (the fail-closed requirement was stated for one layer only).

**Consequences.** `[projected]` A truncated or hand-edited `tool-policy.json` yields `default: "allow"` for every tool without an in-code fixed denial. The in-code fixed denials survive (`tool-policy.ts:82-85`), so the worst case is bounded — but the advocate's configured denials and asks vanish silently, which is precisely the corruption case the requirement names.

**Missing rule.** **R-10.** An unreadable, missing or invalid policy source is a deny for everything, with a visible error. A test proves it by corrupting the source.

#### F-11. The actor is an unauthenticated string

**Symptom.** `WriteContext.actor` is a caller-supplied string (`shared/records.ts:58-61`). The bridge hard-codes `{ actor: "advocate" }` for all renderer IPC (`bridge.ts:720-737`); the agent passes `{ actor: "agent" }` (`index.ts:950-951`). Human-only store methods trust it (`evidence.ts:353-361`). Nothing verifies it anywhere.

**Cause.** A single-user desktop application never needed the check, and the assumption was never written down as a decision with its consequences. The trust model is implicit in the code instead of explicit in the policy.

**Boundary that failed.** The authority boundary. It was replaced by a convention: callers are trusted to label themselves.

**Why it was missed.** From inside the process the convention holds; every test is an in-process caller. The audit found no path where the renderer can choose an actor — the risk is not the current UI, it is that the guarantee rests on nothing.

**Category.** Missing policy; architecture.

**Consequences.** `[projected]` Every "human-only" guarantee in the system — fact confirmation, filing confirmation, supersession — is only as strong as an unverified string set by whichever code runs in-process. Any future surface that can pass an actor (a CLI, an extension host, a workflow step) inherits advocate authority by default unless each one remembers to self-limit. The extension system already runs arbitrary code in-process (`WorkspaceViews.tsx:294`).

**Missing rule.** **R-11.** The authority of an action is established by the boundary that receives it, not by a caller-supplied label. The trust model — who may claim to be the advocate, and on what grounds — is a written, accepted decision, not a code habit.

#### F-12. External session state has no matter scope

**Symptom.** The portal: one window, one mutable `matterId`, one shared `persist:oa-portal` partition for all matters (`portal.ts:46-47,63-72,79`); agent portal tools act on the current window with no matter parameter (`portal.ts:148-194`); downloads bind to whichever matter is current when the download starts (`portal.ts:100`). The browser: a global tab map, one mutable `matterId`, per-tab (not per-matter) partitions for agent tabs (`browser.ts:64,70,141`), agent tools resolve any tab id the model supplies (`browser.ts:484-489`).

**Cause.** The first matter was the only matter. Session state was built as application-global because nothing framed the question "whose session is this?"

**Boundary that failed.** Matter isolation for external state. RAG retrieval has the boundary and the tests (`rag-skeleton.test.ts:149-170`); portal and browser never got it.

**Why it was missed.** Cross-matter isolation is tested where it was designed (RAG) and untested where it was not. No test opens two matters' portals in one run.

**Category.** Architecture.

**Consequences.** `[projected]` Court sign-ins and cookies from matter A's portal persist into matter B's window; a concurrent download while the other matter is current files into the wrong matter's folder — the mechanism is verified in code (`portal.ts:100`). With one advocate working one portal at a time the exposure is contained; the code nonetheless permits what the product rule forbids.

**Missing rule.** **R-12.** State that acts on a matter belongs to that matter's context, or is explicitly declared shared with a written guard. A page, tab, download or credential created for one matter is not reachable from another matter's agent without an explicit hand-over.

### Group D — Contracts and enforcement

#### F-13. Contracts are duplicated and only convention-synced

**Symptom.** The IPC contract exists three times: the `OpenAdvoApi` interface (`shared/api.ts`), the invoke strings (`preload/index.ts`), the handle strings (`bridge.ts`) — with only an e2e inventory snapshot as a guard (`app.spec.ts:193-257`). Pi's built-in tool names exist twice (`pi-extensions.ts:29`, `tool-policy.ts:26`). The matter tab vocabulary exists three times, disagreeing (15/10/9). One error-scrubbing regex is repeated in 9 renderer files.

**Cause.** Each copy was written for a legitimate local reason (typing, transport, registration), and the sync was left to discipline. When a contract lives in files that a human or an agent must edit together, the sync eventually fails; here it already disagrees in one instance (tab vocabulary).

**Boundary that failed.** Single-source-of-truth for a contract. The three-copy state is not an accident; it is the pattern, and the pattern produces drift by design.

**Why it was missed.** The inventory test asserts the *union* of exposed keys, which stays green while copies diverge in vocabulary, because it never compares one copy against another.

**Category.** Architecture.

**Consequences.** `[observed]` Tab-vocabulary divergence exists today. `[projected]` Every new bridge function must be edited in three places plus the snapshot; a miss is silent — the function exists but is untyped, or typed but unhandled.

**Missing rule.** **R-13.** Each contract has one source. Every other copy is generated from it, or checked by a test that fails on divergence.

#### F-14. Documentation is the enforcement mechanism — and it drifts

**Symptom.** Fourteen internal doc contradictions and stale claims (audit 4.13, C1-C14): onboarding is four steps in three docs and five in two; phase counts sum to 164 against 165; the single-caller claim is false; the "no SLP constant" comments are false; claimed spike files are absent; `new-matter-flow.md` is unregistered and mis-cites a frozen decision; no phase is owner-exited as done.

**Cause.** The repository's rules are excellent prose, and prose cannot fail a build. The repo's own precedence rule ("when a document and the code disagree, follow the code", `docs/README.md:28`) concedes the mechanism: code is the authority, and docs are advisory. Advisory docs drift when no comparison runs.

**Boundary that failed.** The doc-to-code comparison. It is done manually, session by session, and the audit needed to catalogue fourteen drifts in one pass — drift that accumulated while every phase reported success.

**Why it was missed.** Reviews are conducted by the same agents that write the code and the docs in one session; the mismatch is invisible inside any single session, and nothing re-reads the pair afterwards.

**Category.** Process; missing policy.

**Consequences.** `[observed]` The cost is paid at every onboarding and every audit: stage 1 spent much of its effort separating claim from code — this document and the audit exist partly because the doc layer could not be trusted as a map. A frozen decision was mis-cited by the newest proposal.

**Missing rule.** **R-14.** A boundary that matters is enforced by a check that runs with the tests. Prose guides; checks decide. A document's claim about code is either generated from the code or tested against it, or it is labelled unverified.

#### F-15. Tests prove behaviour, not structure

**Symptom.** 419 passing behaviour tests coexist with every failure in this file. No test enforces import direction, single-writer callers, contract agreement, capability-list coherence, or policy-source fail-closed. `.oxlintrc.json` configures generic lint and turns several checks off; the import plugin is enabled with no import rule (audit 4.12). No coverage tooling exists.

**Cause.** The suite grew from features; each test asks "does this work", never "is this still shaped as decided". Structure was documented (repo-map, decisions, specs) rather than tested, so structure was free to move.

**Boundary that failed.** The verification boundary between claims and code — the same boundary as F-14, seen from the test side. The renderer/import split in tsconfig is the only structural rule that exists, and it exists by accident of types.

**Why it was missed.** Green is the metric; green measures the wrong axis. Nothing ever failed, so nothing was investigated.

**Category.** Architecture (test); missing policy.

**Consequences.** `[observed]` This is the central observed fact of stage 1: a healthy suite and an eroded architecture, simultaneously, for months (all phases 1-11 "built" while the five wiring files accumulated 231 modifications).

**Missing rule.** **R-15.** The suite contains structural tests that fail when a boundary moves: import direction, contract divergence, capability coherence, fail-closed policy. Green means behaviour *and* structure hold.

#### F-16. Long-running work has no recovery model

**Symptom.** No checkpoint code exists (grep: zero matches). Workflow runs cannot resume (`workflow-runs.ts:54,65,79-82`). A crashed run leaves `run_start` with no `run_end`, rendered "running" forever (`jobs.ts:17-18`), its usage lost (`agent.ts:3031`). Trace and usage writes are best-effort `.catch(() => undefined)` (`agent.ts:2396,2622,2994`). Skill runs resume; helpers are marked interrupted (`agent.ts:2895-2907`, `helpers.ts:179-219`, `skill-runner.ts:30-35`).

**Cause.** Recovery was equated with chat continuation (Pi session files), which is the one recovery path that came for free. Runs and workflows record their steps but were never given states that a restart could reconcile.

**Boundary that failed.** Run-state ownership. The application records work but owns no recovery semantics; the runtime's session-file continuation silently stood in for it.

**Why it was missed.** Nothing fails at crash time: no test kills the process mid-run and restarts; the "running forever" row is cosmetic until someone reads it.

**Category.** Architecture; missing policy.

**Consequences.** `[projected]` Any long agent run or workflow that dies — power loss, crash, forced quit — ends in one of two states: a permanently "running" row, or a silently lost result with no usage record. For work measured in tens of minutes (skill timeout is 15 minutes, `skill-runner.ts:28`), this is a real cost the first time it happens, and invisible in every test.

**Missing rule.** **R-16.** Recorded long-running work has defined states — running, interrupted, failed, completed — and an owner that reconciles unfinished states at start-up. Best-effort writes are labelled as such and never hold the only copy of a record.

### Group E — A smaller observation

#### F-17. Shared technical code is owned by the first domain that wrote it

**Symptom.** The hash-chain algorithm lives in the matter store and is imported by the other three stores (`store-chain/index.ts:7` imports from `matter-store/audit.ts`). The matter store has an internal five-file runtime import cycle (`index.ts ⇄ work.ts ⇄ evidence.ts ⇄ studio.ts ⇄ research-plan.ts`). `LawStore` writes chained events but exposes no verification (`law-store` has no `verifyChain`).

**Cause.** The first store wrote the pattern; the others imported it because it worked. Nothing asked who *should* own a mechanism shared by all stores.

**Boundary that failed.** A shared foundation versus domain code. The matter store became the de facto shared kernel for exactly one mechanism — the outcome the assignment warns against ("do not create a giant shared kernel") arrived anyway, from below.

**Why it was missed.** The import is harmless at runtime and the chain works; the cost is directional — every store now depends on the matter store's internals, and the matter store cannot refactor its audit module without three consumers.

**Category.** Architecture (minor today; structural).

**Consequences.** `[observed]` One store's verification is missing (`LawStore`) while three others have it — the asymmetry is the visible cost of an unowned shared mechanism.

**Missing rule.** **R-17.** Mechanisms shared by several domains are owned by a shared foundation. A domain never owns another domain's plumbing, and no store imports another store's internals.

## 3. Consequences in aggregate

**Maintainability.** `[observed]` The wiring layer absorbed 231 modifications across five files; every feature change passes through at least two of them. Contracts rest in three copies; permissions in ten lists; one error-regex in nine files. The cost of any change is proportional to how many restatements it must touch — which is why the repository became difficult to maintain, per the owner's own report and the churn numbers.

**Product capability.** `[observed]` Four ceilings are facts of the model, not effort: a matter cannot hold a second proceeding; a `petition` that is not an SLP is not representable; a second court format does not exist (`COURT_FORMATS` has one entry); a crashed run cannot resume. No amount of implementation inside the current model lifts them.

**Trust posture.** `[projected, mechanisms verified]` Four mechanisms permit what the product rules forbid: policy corruption fails open (bounded by fixed denials); the actor label is unauthenticated; portal and browser state cross matters; anchors can be fabricated. None is an observed incident; each is a standing exposure, and each sits precisely on a rule the documentation states and the code does not enforce.

**What these failures are not.** They are not a verdict on the stack. The audit's section 6 lists ten verified strengths — store chains, evidence integrity, the filing gate, tested permission behaviour, adapter-as-data, sandbox discipline. Those hold *because* someone wrote them as code with tests, which is the exception this file generalizes into rules.

## 4. Why the process missed all of it

The repository's review mechanism is prose rules plus a single agent-committer session flow (`docs/agent-guide.md` recipes; all recent commits by one author). That mechanism is not careless — the recipes are correct, the lessons in AGENTS.md are candid (L2: "Stand-ins were counted as done"), and the behaviour suite is genuinely good. It fails at exactly one thing: **nothing compares a claim with the code after the session that wrote both has ended.** Every failure in this file was written and accepted in a session where the code worked and the doc said it was fine. Drift needs time and a second look; the process has neither.

That is also why the failures cluster: they are the places where prose was the only enforcement. Wherever code enforced (triggers, CHECK constraints, hash chains, fixed denials, the filing gate), the audit found strength. Wherever prose enforced (one writer, no SLP constant, no renderer logic, contract agreement), the audit found drift. The correlation across all seventeen failures is exact.

## 5. The rules, collected

| Failure | Missing rule |
|---|---|
| F-1 | R-1 The entry point assembles and owns nothing. |
| F-2 | R-2 Interfaces route and render; decisions are named operations owned once. |
| F-3 | R-3 Tools declare and delegate; the runtime owns no operation, no legal text, no identity. |
| F-4 | R-4 The UI shell owns navigation and active context only. |
| F-5 | R-5 Every named concept has a record with one owner; workflow artefacts never take generic names. |
| F-6 | R-6 A reference to a record is validated by its owner at write time. |
| F-7 | R-7 Court-specific behaviour enters the core only as declared adapter data. |
| F-8 | R-8 Seams carry typed domain values, never free text. |
| F-9 | R-9 Capabilities and permissions are declared once; subsets derive. |
| F-10 | R-10 Unreadable or invalid policy is deny, with a visible error, proven by a test. |
| F-11 | R-11 Authority is established by the receiving boundary; the trust model is a written decision. |
| F-12 | R-12 State that acts on a matter belongs to that matter, or is declared shared with a guard. |
| F-13 | R-13 Each contract has one source; copies are generated or divergence-tested. |
| F-14 | R-14 Boundaries that matter are enforced by checks that run in CI; prose guides, checks decide. |
| F-15 | R-15 The suite contains structural tests; green means behaviour and structure hold. |
| F-16 | R-16 Long-running work has defined recovery states and a start-up reconciler. |
| F-17 | R-17 Shared mechanisms live in a shared foundation; domains never import each other's plumbing. |

These seventeen rules are constraints, not a design. A later stage must propose the smallest architecture that satisfies them, and the proposal is not free to rename or relax a rule without saying so.

## 6. What Stage 2 does not conclude

1. **No stack verdict.** Nothing here condemns Electron, React, Pi, or SQLite. The audit found the store layer, the chains and the gates sound. The failures are ownership and enforcement failures; they would recur on any stack built the same way.
2. **Large files were never the diagnosis.** Splitting `agent.ts` or `index.ts` into smaller files without moving ownership would keep every failure. The rules above name owners, not sizes.
3. **No architecture is proposed.** No module boundaries, layers, packages or frameworks are recommended in this file. The rules are the input to Stage 3, which must satisfy them and must show how.
4. **The audit's open questions stand.** AQ-1 (trust model) is the decision F-11 depends on; AQ-2 (multi-proceeding) is the decision F-5 depends on; AQ-3 (run-state ownership) governs R-16; AQ-4 (portal isolation) governs R-12. Stage 3 cannot resolve them silently: each is the owner's call, and each changes the shape of the domain boundaries that Stage 3 must propose.

---

*Grounded in [audit.md](audit.md) (verified facts, commit `26ac806`). Commands and results: `.agents/logs/2026-11-20-stage1-audit.md`. This stage ran no new commands; it reorganizes audited evidence into causes and consequences.*

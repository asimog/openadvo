# Greenfield execution plan

Status: **proposed for the owner's acceptance** (2026-11-20). Order 19 of [the series](README.md). This file owns four things, and nothing else: **the road**, **the repository mechanics**, **the coverage of the product catalogue**, and **the gates**. It does not restate [phases.md](phases.md), [boundaries.md](boundaries.md), [rules.md](rules.md), [contracts.md](contracts.md) or [system-architecture.md](system-architecture.md). Each fact stays with its owner; this plan links to it.

Accepting this plan accepts the series as the build doctrine: the eleven domains, the twelve phases, the thirty rules, the contracts, the runtime decision, and the answered decisions DQ-1 to DQ-9. It adds the mechanics the series leaves open, and it names the seven places where the series is silent.

## 1. The road

Owner's instruction (2026-11-20): *"make a plan for the greenfield rewrite of this repo."* The fork in [executive-report.md](executive-report.md) section 6.1 is closed: **greenfield**. The strangler refactor in `docs/moduleaudit/` is not taken. That series stays as evidence for what the old app does, not as a build order.

What greenfield means here:

1. The new code is written fresh against the series' contracts. No file is refactored into it, and no old module is moved into it.
2. The old application stays buildable and installed until the cutover. It is the owner's working tool for existing matters ([DQ-3](decisions.md): no migration).
3. Data may be carried; code may not. Court adapters, packs, skill files and vendored assets are data. Every line of TypeScript is rewritten.

The rewrite is one repository, one application at a time. It is not a second product, a fork, or a package split. [repo-structure.md](repo-structure.md) section 4 stays true.

## 2. Where the new code lives

**Recommendation: build the new application in `v2/`, inside this repository, with its own manifest.** The folder name is temporary. It disappears at the cutover.

```
openadvo/
  src/ ...                     the old application — frozen except for fixes
  tests/ ...                   the old tests
  v2/
    package.json               name: openadvo-v2; own dependencies and lock file
    tsconfig.json
    src/                       foundation, domains, application, interfaces/cli,
                               infrastructure  (the tree of repo-structure.md)
    tests/                     unit, structural, e2e
    bin/openadvo.ts            the CLI entry
  docs/                        unchanged
  .agents/                     unchanged
```

The inner tree follows [repo-structure.md](repo-structure.md) exactly. Only its root moves, and only until the cutover.

### 2.1 Why a separate manifest

1. **The old app's dependencies must not constrain the new one.** Today's manifest carries Electron, Pi, Euro-Office tooling and the renderer stack. The new app needs none of that before phase 9, and phase 6 must not add LangGraph to the application that ships today.
2. **The import-boundary test gets a clean subject.** It walks `v2/src` only, so the old tree's known violations cannot mask a new one, and a rule can assert that no `v2` file imports from `src/`.
3. **Type checking stays honest.** One tsconfig per application. The old app keeps its two; the new app starts with one and gains `tsconfig.web.json` at phase 9.
4. **CI can fail separately.** A red structural test in `v2` must not block a fix to the app in use, and the reverse must not hide it.
5. **The cutover is a file move, not a merge.** At cutover, `v2/package.json`, `v2/tsconfig.json`, `v2/src`, `v2/tests`, `v2/bin` move to the root; the old ones are deleted. No source is merged, because no source is shared.

### 2.2 Alternatives rejected

- **A separate repository.** Clean, but it copies the doctrine (`AGENTS.md`, `docs/`, `.agents/`) and the carry assets, and then the two copies drift. The owner works in one repository.
- **Replace `src/` in place at phase 1.** The old app would stop building on the first commit, and a fix to the app the owner uses for live matters would become impossible.
- **A folder inside `src/`.** One manifest still carries Electron and Pi for a CLI-only tree, and the old tree's violations sit inside the test subject.

### 2.3 The old tree until cutover

- Bug fixes only. No feature work. A fix lands with its test, in the old test folders.
- No new dependency. The old manifest changes only for a security fix.
- The owner's live matters stay in the installed application, pinned at 1.2.0. The installed copy does not depend on the repository.

### 2.4 Data separation

The new application never reads or writes the old application's data folder. The CLI resolves its own root (`openadvo-v2` under the platform's app-data folder) and takes `--data-dir` to override it. A test asserts the default path differs from the old one.

### 2.5 The carry list

Only these may be copied into `v2/`, each with its source named in the phase that copies it:

| Kind | What | Copied at |
|---|---|---|
| Court adapter data | `adapters/in-sc`, `in-hc-delhi`, `in-dj-delhi` — JSON, rewritten to the [adapter contract](contracts.md) section 5 | phase 5 |
| Practice packs | `packs/*.json`, after the SLP decoupling | phase 7 |
| Skill files | `skills/sk-*` (`SKILL.md`, `review.json`) — if the owner keeps the skills model (question 1) | phase 8 |
| Vendored assets | Euro-Office, OCR models, `ulos` — unmodified, behind one module each | the phase that needs them |
| Fixtures | A redacted fixture brief for tests | phase 3 |

Nothing else. No old module, no old test, no old config.

### 2.6 CI

The existing `ci` job stays as it is. A second job, `v2`, runs on the same two operating systems: `npm ci` inside `v2/`, type check, lint, unit tests, structural tests. Playwright joins at phase 9, when a desktop surface exists.

### 2.7 Cutover

Cutover is one commit that moves the new app to the repository root and deletes the old `src/`, `tests/`, old configs and old packaging. It happens when all three conditions hold:

1. The owner completed a real matter end to end on the new application: matter, two proceedings, documents, facts, a draft, a prepared filing set.
2. The owner's practice no longer needs the old application for new work. Old matters stay readable in the installed copy.
3. The owner says so.

**Default: after phase 10's exit.** Then phase 11 builds in the merged tree. The default moves only by the owner's instruction.

At cutover, this section's layout rule is folded into [repo-map.md](../repo-map.md), which keeps owning folders and write boundaries.

## 3. The gates

| Gate | What it is | Who closes it |
|---|---|---|
| **A — acceptance** | This plan, reviewed and approved | The owner, in the review of this file |
| **B — decision amendments** | The nine amendments in section 4, applied to [decisions.md](../decisions.md) with the owner's wording and date | The owner; the agent drafts the wording |
| **C — phase 1** | One-page spec in `docs/rewrite/specs/`, then the build in the same piece of work (L1) | The agent builds; the owner accepts the exit |
| **D — each phase** | Spec, build, tests, owner exit on a real brief | The owner, at the exit |
| **E — cutover** | The three conditions of section 2.7 | The owner |

### 3.1 The method inside a phase

- The spec is written when the phase starts, at the depth the phase needs. It names the files, the tests, the exit and the exclusions.
- Between the steps of a phase: type check and unit plus structural tests only. The end-to-end suite runs once, at the phase's end ([agent-guide.md](../agent-guide.md) section 8.4).
- A red structural test is never skipped or deleted ([rules.md](rules.md) rule 21).
- The owner's exit is recorded in `.agents/logs/` with the commands run and the artefacts produced. An exit not performed means the phase is not done, whatever the tests say (L3).
- Documents change in the same commit as the code they describe (rule 29).

## 4. The frozen decisions the road changes

[decisions.md](../decisions.md) is frozen. Its own rule says the owner may overrule an older decision, in the owner's words, dated. This plan does not reopen them; it asks the owner to amend nine, and it records the conflict that each amendment closes. The wording below is a draft for the owner to accept, change or refuse.

| No. | Today | The conflict | Proposed wording | Needed by |
|---|---|---|---|---|
| 2 | The agent is Pi, embedded through its SDK | The engine is LangGraph.js behind the owned interface ([agent-runtime.md](agent-runtime.md)); Pi is the fallback | *The agent runs on an engine behind an OpenAdvo-owned execution interface, selected from the LangChain family in TypeScript (LangGraph.js first), with Pi kept as the fallback until the agent phase's exit proves the integration. The agent gets the tools the capability catalog allows, and no shell tool and no file-write tool.* | phase 6 |
| 4 | Each store has one writer; the matter store is the single writer of matter facts | The rewrite states one writer module per table, and several domains share `matter.db` ([boundaries.md](boundaries.md) section 6) | *One writer module per table. A domain writes only its own tables and reads others through their query operations. A matter folder and its `matter.db` stay one portable, archivable unit.* | phase 1 |
| 7 | The Pi session records agent activity | The agent checkpointer and session files hold execution state only ([DQ-4](decisions.md)) | *The agent runtime's session and checkpoint files record agent activity. They are never legal records. The stores record case facts. They link by ids only.* | phase 6 |
| 12 | Four stores; `advocate.db` holds profile, preferences, memory, library, workflows, agents, triggers, integrations | The rewrite trims the advocate store and moves practice memory to the research domain ([boundaries.md](boundaries.md) section 3) | *Four stores stay: `matter.db` per matter, `corpus.db`, `intel.db`, `advocate.db`. Each store's tables are owned as [boundaries.md](boundaries.md) section 3 states. `advocate.db` holds identity, profile and preferences. Practice memory lives in the research domain's store.* | phase 2 |
| 20 | Thirteen phases, per [build-plan.md](../build-plan.md) | The new application follows the twelve phases of [phases.md](phases.md) | *The build order for the new application is the twelve phases of [phases.md](phases.md). [build-plan.md](../build-plan.md) governs the old application only, until the cutover.* | phase 1 |
| 21 | Pi extensions; the advocate can add extensions | The new application has no extension system; the catalog is the only tool surface ([boundaries.md](boundaries.md) section 4) | *The new application has no extension system. The capability catalog is the only tool surface. Pi extensions remain with the old application.* | phase 6 |
| 22 | `PI_CODING_AGENT_DIR` points at the application's Pi folder | The new runtime keeps its own files per matter | *The new application keeps its runtime session and checkpoint files in each matter's chat folder. It does not read or write the old application's Pi folder.* | phase 6 |
| 23 | The tool policy: allow by default, fixed denials, ask cards | The rewrite enforces from the catalog, and unreadable policy is deny ([rules.md](rules.md) rule 12) | *The tool policy is enforced in application coordination: the capability catalog decides, and unreadable or invalid policy is deny, with a visible error.* | phase 1 |
| 25 | Filing-ready, not filed; filing on a portal by the agent is the last phase | [DQ-6](decisions.md) makes submission human-only | *The agent prepares and verifies filings. The advocate alone submits. The two confirmations stay, human-only, bound to the payload hash.* | phase 10 |

Decisions 3, 6, 10, 11, 13, 16, 17, 18, 19, 24 and 26 do not conflict and stay as written. Decision 5 stays true and is extended: a human-only action is still a named operation and never an agent tool, and the CLI is a second human surface ([DQ-9](decisions.md)). Three decisions are not conflicts but gaps: decision 8 has no phase (question 2), decisions 14 and 15 have no home (question 1), and decision 9 holds except its `safeStorage` clause, which the CLI cannot keep (gap 7).

## 5. What wave 1 covers

Wave 1 is phases 1 to 11. It rebuilds the **litigation core**: matter to factual record, courts, agent, drafting, workflow recovery, desktop, filing preparation and the research base. It is **not** the 165-feature catalogue of [features.md](../features.md). It touches about a third of the catalogue, and several of those only partly. The owner should see this before phase 1, not after phase 11.

| Catalogue section | Wave 1 builds | Not in wave 1 |
|---|---|---|
| A. Onboarding and profile | — | All of it. The Advocate domain has no phase either (gap 1) |
| B. Court intelligence and filing readiness | Directory, sources, case types, stages, limitation, three adapters (5); filing sets, checks, the two confirmations, human-only submit (10) | Pack checks and diffs, the dashboard, the pack editor, defect replies, paper book and signed manifest unless named in phase 10 |
| C. Matters | Matter and proceeding records, parties, instructions, related matters, archive (2) | Intake from email, voice, order or cause list; the overview; related-matter detection |
| D. Jurisdiction and temporal law | — | All: the jurisdiction report, governing-date law, forum clauses, foreign elements, the wrong-forum guard |
| E. Corpus and authority | Judgments, statutes with versions and in-force checks, propositions, citation verification (11) | The advocate's research-service connectors (E8) |
| F. Memory | — | All. Practice memory arrives in 11 as propose-only; the typed memory model is gap 6 |
| G. Graphs and indexes | The corpus queries phase 11 needs | The three graphs, vectors, hybrid retrieval, graph questions |
| H. Documents and evidence | Intake, versions, pages, anchors, OCR, duplicates, evidence records (3); extraction of candidate facts (4) | Audio and video, signature and seal detection, legal structure, record tables, the vault, OCR comparison |
| I. Context assembly | — | All (gap 3) |
| J. Research | Corpus queries, statutes, authorities (11) | Search modes, research plans, analysis, adverse authority, deliverables, history |
| K. Argument, strategy and hearings | — | All |
| L. Drafting and editor | Drafts, revisions, templates from pack data, validation against the factual record (7) | Tracked changes, comparison, the citation preference, the witness rule, the editor (gap 5) |
| M. Knowledge library | Practice memory, propose-only (11) | Library ingestion, precedent status, outcome records |
| N. Skills, workflows and agents | Workflow execution with run states and the reconciler (8) | The skills registry and runner, the skill library and its review, skill import, the workflow builder (gap 2) |
| O. Harness controls | Planner and subagent as catalog tools, approvals, run states, model providers (6) | Roles, the evaluator gate, budget, the jobs view, side questions, the firm agent |
| P. Verification | Draft validation (7); citation and statute checks (11) | Grounding, provenance tags, procedure and fact checks, markers, the reviewer note, the injection scan, the AI-use disclosure unless named in phase 10 |
| R. Review inbox and dashboard | The review queue (4, generalised in 8) | The dashboard and the full inbox, unless named in phase 9 |
| S. Court operations | Adapters that declare capabilities (5); the per-matter portal (10) | Case status, orders, cause lists, monitoring, alerts, triggers, the browser, MCP, Playwright scripts |
| T. Portal filing by the agent | A prepared set only | Submission by the agent, refused ([DQ-6](decisions.md)) |
| U. Communications | — | All |
| W. Collaboration | — | All ([DQ-2](decisions.md)) |
| Y. Integrations | Model providers (6) | Manifests, calendar, cloud storage, the Word round trip |
| Z. Foundation | Stores with chains, policy, catalogue, packs, navigation (1, 2, 5, 8, 9) | — |

Wave 2 is not planned here. When phase 11 ends, the remaining catalogue is planned again from [features.md](../features.md), one section at a time, under the same phase discipline. Ideas that arrive before then go to [parking.md](../parking.md) (L6).

### 5.1 The seven gaps this plan names

These are not deferrals. Each one is a hole in the series that must be filled at a named point.

1. **The Advocate domain has no phase.** `Actor.advocateId` exists from phase 1 ([contracts.md](contracts.md) section 1), and scope construction needs the advocate record. Put the domain and its app-store tables in phase 2's scope, or in phase 1's store shell. Phase 2's spec decides, and [phases.md](phases.md) is amended then.
2. **The skills model has no home.** Decision 14 makes a skill the unit of work, and 165 skill files exist. The new plan has capabilities and workflows only. Question 1 settles it before phase 6.
3. **Context assembly is unscoped.** [agent-runtime.md](agent-runtime.md) says context management is ours, and [features.md](../features.md) I1 owns it. No phase names it. Phase 6's spec must scope it, or it will accrete in the agent layer — the failure F-3 names.
4. **The browser has infrastructure but no phase.** [DQ-7](decisions.md) answers its scope; [system-architecture.md](system-architecture.md) section 1 declares it. Phase 9's spec names it with its guards, or it is declared wave 2 and DQ-7's guards then bind the portal alone.
5. **The editor has no phase.** Decision 8 names Euro-Office, and `resources/euro-office` holds it. Question 2 settles it.
6. **Memory has no record model.** The rewrite has facts, decisions and propose-only practice memory. It has no answer to the catalogue's typed memory (F1 to F6). Phase 4's spec names what a matter remembers, and phase 11's spec names what the advocate remembers.
7. **Credentials have no CLI home.** Decision 9 sends secrets through Electron `safeStorage`, and the CLI runs model calls from phase 6, before Electron exists. Phase 6's spec names where model credentials live for a CLI run: the OS key store through one module, or the old application's store, named as a known exposure until phase 9 (L2: nothing pretends).

## 6. Questions for the owner

The defaults below apply until the owner answers. Questions 1 and 2 bind phases 6 and later. Question 5 must be answered before phase 1 starts: an agent that follows `decisions.md` unamended would build the old plan.

:::question
The new architecture has no place for skills. Decision 14 makes a skill the unit of work, and 165 skill files exist in the repository. The new plan has capabilities and workflows, but nothing that holds a skill's inputs, permitted tools, checks and approval points.

- [ ] Carry the skills model into the new architecture — a versioned file, run through the catalog, checks and approval points intact
- [ ] Replace skills with workflow definitions — capabilities plus ordering, no separate skill file
- [ ] Decide at phase 8, when workflow execution starts

Recommended: Carry the skills model into the new architecture
:::

:::question
The editor is in decision 8 (Euro-Office, vendored, never modified), and no rewrite phase builds one. Without it, a draft opens in Word or the system PDF app, not inside Open Advocate.

- [ ] Wave 2 phase, after phase 11 — the core lands first, the editor follows
- [ ] Drop the embedded editor — drafts and PDFs open in the system application
- [ ] Decide when phase 7's drafting exit shows what the advocate actually needs

Recommended: Wave 2 phase, after phase 11
:::

:::question
The old application stays in the repository during the rewrite, in `src/`. This decides what may still change there. The installed 1.2.0 copy is unaffected either way.

- [ ] Keep it fixable — bug fixes with tests, no features, no new dependency
- [ ] Freeze it at the first `v2` commit — no changes at all, the installed copy is the tool

Recommended: Keep it fixable
:::

:::question
The cutover is the commit that deletes the old tree and moves `v2/` to the root. It happens when a real matter has run end to end on the new app, the practice no longer needs the old app, and you say so.

- [ ] Default after phase 10's exit — filing preparation is in, research follows in the merged tree
- [ ] After phase 9's exit — the desktop arrives, and the practice moves earlier
- [ ] You decide at each phase's exit, with no default

Recommended: Default after phase 10's exit
:::

:::question
Nine frozen decisions conflict with the new architecture: 2, 4, 7, 12, 20, 21, 22, 23 and 25. Section 4 carries the proposed wording for each. Until they are amended, an agent reading `decisions.md` must follow the old rule.

- [ ] Apply all nine now, dated, with the wording in section 4
- [ ] Apply each one when its phase starts
- [ ] Apply them now, but the owner edits the wording first

Recommended: Apply all nine now
:::

## 7. On acceptance

1. The nine amendments are written into [decisions.md](../decisions.md), each with its date and the owner's wording. No other decision changes.
2. [phases.md](phases.md) gains one line for the Advocate domain, when phase 2's spec places it (gap 1).
3. Phase 1's spec is written in `docs/rewrite/specs/`, and phase 1 is built in the same piece of work (L1). Its exit is structural: the chain round-trips, the boundary test is green, and the same test fails on a planted violation.
4. Every phase's exit is recorded in `.agents/logs/`, and the owner's exit is the only definition of done (L3).

## 8. What this plan does not do

- It does not change the architecture, the domains, the rules or the phases. Those remain with their owners.
- It does not reorder features or claim parity with the old application.
- It does not build anything. Phase 1 starts at gate C, with its spec (L1).

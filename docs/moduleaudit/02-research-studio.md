# Module report: Research Studio

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: the matter Studio, the shared law search outside a matter, the argument studio, the research plans, the saved authorities and provisions, the research log, and the evidence/authority checks that feed drafting.

## 1. Current owner and data

The module is split across four owners:

| Part | Owner | Data |
|---|---|---|
| Studio screen | `src/renderer/src/Studio.tsx` | View state only |
| Research hub | `src/main/studio.ts` (`ResearchHub`) | `corpus.db`, `matter.db` authorities/provisions |
| Argument studio | `src/main/studio.ts` (`ArgumentStudio`) | `matter.db` `studio` tables |
| Research records | `src/main/research.ts` (`Research`) | `matter.db` issues, authorities, memoranda, citation checks, attestations, adverse review |
| Shared law search | `src/renderer/src/ResearchPage.tsx`, `LawPart` | `corpus.db`, no matter facts |
| Retrieval | `src/lib/knowledge/`, `src/lib/law-store/`, `src/lib/legal-corpus/` | `corpus.db` |

The Studio is matter-bound. `ResearchPage` is the only outside-matter surface: it shows a shared law search, the open matters and a law-only cross-matter history.

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Seven Studio tabs | Implemented | `Studio.tsx:81-88` | Conference, Strategy, Law library, Search, Arguments, Rehearsal, Research log |
| Matter research context | Partial | `ArgumentStudio.context` | Reads issues, authorities, facts, drafts; no proceeding |
| Shared law search outside a matter | Implemented | `LawPart` with `matterId=""` | Statutory and procedure search |
| Cross-matter research history | Implemented | `ResearchPage.tsx:42-70` | Law only; result counts, no query text |
| Law library search | Implemented | `ResearchHub.searchKnowledge` | Seven scopes, FTS, vector, graph, coverage |
| Source discovery and read | Implemented | `ResearchHub.search`, `read` | India Code, AWS, Indian Kanoon fallback, web |
| Save judgment as authority | Implemented | `ResearchHub.saveJudgment` | Writes `work.addAuthority` |
| Save provision | Implemented | `ResearchHub.saveProvision` | Writes `studio.addProvision` |
| Research plans | Implemented | `research-plan.ts`, `Studio.tsx:487` | Steps, modes, scopes, coverage |
| Issues | Implemented | `Research.addIssue`, `decideIssue` | Candidate, accepted, rejected |
| Authorities | Implemented | `Research.addAuthority`, `decideAuthority` | Role, paragraph, proposition |
| Memoranda | Implemented | `ResearchHub.writeResearchMemo` | Verified quotes, adverse, coverage |
| Adverse search | Implemented | `ResearchHub.adverseSearch` | Overruled, doubted, distinguished, contrary |
| Citation checks | Implemented | `Research.checkCitations`, `ulos` | Neutral citations; reporter-only reported |
| Attestations | Implemented | `Research.attestCitation` | Never shown as verified |
| Argument loop | Implemented | `ArgumentStudio.start` | Generators, critic, rejected arguments |
| Theory and elements | Implemented | `Studio.tsx:111-240`, `studio` tables | Candidate and accepted |
| Support and voice | Implemented | `StudioPanels.tsx`, `studio.assessAuthority` | Human confirmation |
| Treatment and challenge | Implemented | `studio` tables | Follows, distinguishes, overrules |
| Rehearsal and dissent | Implemented | `ArgumentStudio.rehearse`, `askDissent` | Candidate questions and split answers |
| Research log | Implemented | `getResearchLog` | Matter events |
| Provenance display | Library-only | `verification/provenance.ts` | Tested, not wired |
| No-matter research project | Missing | `ResearchPage` only | No workspace store or notes |
| Research task queue | Missing | In-process loops | Restart interrupts |
| Gold set or evaluation | Missing | Fixture tests only | No measured accuracy |

## 3. Current flow

```text
Question → LawPart / Studio Search
  → ResearchHub.searchKnowledge
  → KnowledgeRegistry (statute, procedure, research, matter, firm, advocate, session)
  → hits with coverage
  → open source → read judgment/provision
  → save authority/provision to the matter
  → argument loop / memo / draft citation
  → Research.checkCitations
  → legal blockers in the draft gate
```

The argument loop is separate:

```text
Issue + facts + authorities + drafts
  → generators (support and adverse)
  → critic (schema, grounding, authority, rejection reasons)
  → accepted/rejected argument records
  → theory and elements
  → rehearsal and dissent
```

## 4. Problems

### P-01: The Studio is a bundle of seven tools, not one workspace

**Evidence.** `StudioView` renders seven tabs; each tab has its own load, state and write paths. Strategy writes theories; Arguments writes arguments; Rehearsal writes questions; Search writes authorities; Law library writes provisions; Conference is a chat; Log reads events.

**Effect.** The advocate moves between panels with no shared research object. An issue selected in Arguments is not the issue in Search. A saved authority does not show its support, voice, treatment and citation check in one place.

**Target.** One `ResearchWorkspace` per matter (or none for a standalone project). Issues, plans, authorities, passages, arguments, theories, rehearsals and memos are records in that workspace. The tabs are views over the same records.

### P-02: There is no standalone research workspace

**Evidence.** `ResearchPage.tsx` is a shared law search, a list of matters and a law-only history. It has no project store, notes, saved authorities or drafts. The untracked `docs/specs/new-matter-flow.md` proposes one, but it is not built.

**Effect.** A question that starts before a matter has no home. The advocate either creates a fake matter (mixing client facts with law) or loses the work.

**Target.** A `ResearchWorkspace` with law-only scope, stored in `advocate.db`, no matter id. It can send law references to a matter later. It never holds client facts.

### P-03: Research context is not proceeding-aware

**Evidence.** `ArgumentStudio.context` reads issues, authorities, facts and drafts. `Research` has no `proceedingId`. `searchKnowledge` takes an optional court and date; the procedure adapter filters by court only when the query supplies one. `studio.ts:159-168` uses the profile court and governing date for binding, not for retrieval.

**Effect.** The same query can mix a civil appeal rule with a criminal appeal issue. The binding label can use the matter's free-text court, not the proceeding's forum.

**Target.** `ResearchContext` resolves from the proceeding: forum, type, stage, date basis, applicable rules, issues, accepted/disputed facts, relief, authorities. A procedure search requires a forum and a date, or returns `partial` with the missing context.

### P-04: Two authority write paths

**Evidence.** `Research.addAuthority` and `ResearchHub.saveJudgment` both write `work.addAuthority`. They have different duplicate checks and different role defaults.

**Effect.** Duplicate authorities, different checks, and a support/voice assessment that may attach to one row while the draft uses another.

**Target.** One `AuthorityService` owns the record, the duplicate rule, the citation check and the support/voice assessment. `Research` and `Studio` call it.

### P-05: The research plan is a side record

**Evidence.** `research-plan.ts` stores steps and coverage. The Studio shows plans, but the argument loop, memo and draft do not consume the plan's status or coverage.

**Effect.** The plan is a document, not a control. A memo can be written without the plan's steps being done.

**Target.** A research task consumes the plan. A memo names the plan, the completed steps and the coverage. A draft blocker can require a completed plan for a legal issue.

### P-06: Provenance is not visible

**Evidence.** `verification/provenance.ts` computes citation, fact and provision provenance. Tests exist. No main or renderer module calls it.

**Effect.** The advocate sees a citation and a check outcome, but not whether it is a court copy, a secondary source, a client file or an attested record.

**Target.** Every authority, provision and fact shows a provenance label and a source link. The memo and the draft use the same label.

### P-07: No evaluation and no no-matter boundary test

**Evidence.** Tests cover retrieval, quote, memo and argument shape. There is no gold set, no precision/recall measurement and no test that a no-matter search cannot read a matter.

**Effect.** The module can be structurally correct and legally wrong. The cross-matter boundary is a promise in the UI, not a test.

**Target.** A scenario set with known answers; a no-matter adapter that refuses any matter id; coverage and provenance metrics.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `ResearchWorkspace` | A matter workspace or a standalone law-only project |
| `ResearchQuestion` | The question, its scope and its status |
| `Issue` | A legal issue, linked to a proceeding |
| `ResearchPlan` | Steps, modes, scopes, coverage and status |
| `SearchRun` | One query, its scopes, hits, coverage and time |
| `AuthorityRecord` | Citation, passage, proposition, role, support, voice, treatment, status |
| `ProvisionRecord` | Instrument, provision, version, in-force state, source |
| `ArgumentRecord` | Ground, claim, reasoning, authorities, stance, status |
| `TheoryRecord` | Case theory, burden, standard, elements |
| `Rehearsal` | Questions, attacks and answers |
| `Memorandum` | Verified quotes, analysis, adverse, coverage, open questions |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `ResearchService` | Issues, plans, search runs, authorities, provisions, citations, memos | `LawService`, `ProcedureService`, `EvidenceService`, `DraftingService` |
| `ArgumentService` | Theories, arguments, elements, rehearsals, dissents | `ResearchService`, `EvidenceService` |
| `WorkspaceService` | Matter and standalone workspaces, notes, saved law | `ResearchService`, `advocate.db` |
| `StudioView` | Presentation and commands | `ResearchService`, `ArgumentService` |

### 5.3 Contracts

```ts
interface ResearchService {
  addIssue(workspaceId: string, input: IssueInput): Promise<Issue>;
  plan(workspaceId: string, input: PlanInput): Promise<ResearchPlan>;
  search(workspaceId: string, query: string, opts: SearchOptions): Promise<SearchRun>;
  openSource(hitId: string): Promise<SourcePassage>;
  saveAuthority(workspaceId: string, input: AuthorityInput): Promise<AuthorityRecord>;
  assessAuthority(authorityId: string, field: "support" | "voice", value: string, basis: string): Promise<Assessment>;
  checkCitation(workspaceId: string, citation: string): Promise<CitationCheck>;
  writeMemo(workspaceId: string, input: MemoInput): Promise<Memorandum>;
  blockers(workspaceId: string, draftId: string): Promise<Blocker[]>;
}

interface ArgumentService {
  start(workspaceId: string, issueId: string, opts: ArgumentOptions): Promise<ArgumentRun>;
  decideArgument(argumentId: string, decision: "accepted" | "rejected", reason: string): Promise<ArgumentRecord>;
  rehearse(workspaceId: string): Promise<Rehearsal>;
  dissent(workspaceId: string, question: string): Promise<DissentResult>;
}
```

### 5.4 The workspace boundary

A `ResearchWorkspace` has one of two scopes:

- `matter` — linked to one matter; may read that matter's facts, evidence and drafts.
- `law` — no matter; may read only public law and approved advocate knowledge.

The scope check runs before retrieval. A law workspace cannot name a matter id. A matter workspace cannot read another matter. The standalone workspace can send law references to a matter, but not notes that may contain client facts.

### 5.5 The Studio information architecture

| Tab | Records it shows | Writes it allows |
|---|---|---|
| Question | The workspace question, issues and plan | Question, issue, plan |
| Search | Search runs, hits, coverage | Save authority/provision |
| Authorities | Saved authorities, support, voice, treatment, checks | Assess, adopt, reject, attest |
| Arguments | Theories, elements, arguments, rejections | Accept, reject, edit |
| Rehearsal | Questions, attacks, dissent | Decide |
| Memo | Memoranda, verified quotes, coverage | Write, edit, approve |
| Log | Search and decision history | None |

Conference is not a tab. It is the chat dock, which already exists. The Studio shows records; the chat shows the conversation.

## 6. Boundaries

- The Studio owns presentation and workspace state. It does not own retrieval, citation checking or authority records.
- `ResearchService` owns legal research records. It does not write drafts or filing sets.
- `ArgumentService` owns arguments and theories. It does not write authorities; it asks `ResearchService`.
- `LawService` owns law text and versions. It does not hold matter facts.
- `ProcedureService` owns applicable rules. It does not hold authorities.
- The agent calls research tools; it does not write a memo body without verified quotes.

## 7. Migration

1. Create `ResearchService` and `ArgumentService` behind the current bridge.
2. Move `Research` and `ResearchHub` authority writes into `AuthorityService`.
3. Add `ResearchWorkspace` and the `law` scope. Reuse `ResearchPage` as its first view.
4. Add `proceedingId` to issues, plans and search runs.
5. Add `Provenance` to the authority and provision views.
6. Add a research queue for indexing, argument loops and memo generation.
7. Split `Studio.tsx` into view components fed by view models. No new legal logic in the renderer.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| RS-01 | A law workspace searches law | No matter id is opened; coverage is shown |
| RS-02 | A law workspace tries a matter id | Refused before retrieval |
| RS-03 | A matter workspace searches procedure | The forum and date come from the proceeding, not the profile string |
| RS-04 | The same query in two matters | Different context, no cross-matter facts |
| RS-05 | Save an authority twice | One record, one duplicate reason |
| RS-06 | Support and voice are unconfirmed | The draft is blocked in legal review |
| RS-07 | A quote is not in the source | The memo refuses it |
| RS-08 | A memo without coverage | Refused or marked incomplete |
| RS-09 | A plan has an unfinished step | The memo names it |
| RS-10 | Provenance | Every saved authority shows its source label |

## 9. Recommendation

**Refactor the Studio into a workspace over two services.** Keep the current panels and the argument loop. Replace the two authority writers with one. Add the law-only workspace. Make the proceeding the research context. Wire provenance. Do not add a new agent framework; the Studio is an application surface, not an agent.

## Appendix: evidence map

- `src/renderer/src/Studio.tsx` — seven tabs, strategy, law, sources, arguments, log.
- `src/renderer/src/ResearchPage.tsx` — outside-matter search and history.
- `src/main/studio.ts` — `ResearchHub`, `ArgumentStudio`, search, save, memo, quick check, statute rows.
- `src/main/research.ts` — issues, authorities, memoranda, citations, attestations, blockers.
- `src/lib/knowledge/` — registry, adapters, fusion, coverage, quote.
- `src/lib/law-store/` — instruments, provisions, versions, events, in-force.
- `src/lib/authority/binding.ts` — binding effect.
- `src/lib/research-workflow/index.ts` — memo composition, adverse queries, coverage.
- `src/lib/verification/provenance.ts` — provenance library, not wired.

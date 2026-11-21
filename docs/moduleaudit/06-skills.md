# Module report: skills

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: the skill format, the built-in and advocate skill libraries, the registry, the skill runner, the skill review, the skill import, role and tool scopes, report cards, and the tests that stand in for a gold set.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Skill format and registry | `src/lib/skills/index.ts` | `SKILL.md` frontmatter and body |
| Roles and tool scopes | `src/lib/skills/roles.ts` | Role table, human-only and never-in-a-skill patterns |
| Review | `src/lib/skills/review.ts` | `review.json` beside each skill |
| Runner | `src/main/skill-runner.ts` | `matter.db` `skill_run`, `context_package` |
| Loader | `src/main/skills.ts` | Built-in and advocate folders |
| Import | `src/main/skill-import.ts` | Advocate skill folder |
| Library tests | `src/lib/skills/skill-tests.ts` | Fixture briefs |
| Skill files | `skills/sk-*` | 140 skill folders |
| UI | `src/renderer/src/Pages.tsx`, `Builders.tsx` | Skills page and builder |

A skill is a versioned `SKILL.md` with frontmatter: id, version, title, description, role, packs, courts, proceedings, inputs, required context, permitted tools, output, checks, approval points, budget, package type, question type, tests and author.

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| 140 skill folders | Implemented | `skills/sk-*` | Broad library |
| SK-nnn id and version | Implemented | `checkSkill` | `SK-\d{3}`, `n.n.n` |
| Role and tool scope | Implemented | `ROLE_TABLE`, `checkSkill` | A skill may use only its role's tools |
| Human-only rejection | Implemented | `HUMAN_ONLY_PATTERN` | Build-time refusal |
| Never-in-a-skill rejection | Implemented | `NEVER_IN_A_SKILL` | Build-time refusal |
| Pack, court, proceeding fields | Partial | `packs`, `courts`, `proceedings` | Proceeding is parsed, not enforced |
| Required context | Implemented | `required_context`, context package | Budgeted |
| Permitted tools | Implemented | runner scoped session | Tool policy still applies |
| Output shapes | Implemented | `OUTPUT_SHAPES`, gate | Schema check |
| Checks | Partial | `schema`, `anchors`, `no_unverified_claims`, `severity_floor` | Only four |
| Approval points | Implemented | `before_start`, `before_write` | Runner stops |
| Budget and timeout | Implemented | `SKILL_LIMITS` | 15 min, 2 retries, 80k default |
| Report card | Implemented | `ReportCard`, chat card | State, checks, tools, tokens, cost |
| Resume | Implemented | interrupted run | One run |
| Skill import | Implemented | `SkillImport` | Preview and install |
| 13-parameter review | Implemented | `reviewSkill` | Score 0-26 |
| Three legal failure modes | Implemented | `legalFailureModes` | Invented record, unsupported law, decided for advocate |
| Review record version check | Implemented | `checkSkill` | Version mismatch = review needed |
| Fixture tests | Implemented | `skill-tests.ts` | Three fixtures, not a gold set |
| Proceeding scope enforcement | Missing | Runner ignores `proceedings` | A writ skill can run on a writ appeal |
| Skill dependency graph | Missing | No field | A skill cannot declare a prerequisite |
| Runtime schema validation | Partial | gate checks output shape | No full JSON schema |
| Execution replay | Missing | Trace only | No deterministic replay |
| Cost attribution by skill | Implemented | `agent.usage`, report card | Per run |

## 3. Current flow

```text
SKILL.md
  → loadSkillDir
  → checkSkill (frontmatter, role, tools, review record)
  → buildRegistry (highest version wins)
  → Matter Agent sees the skill list in its prompt
  → run_skill(skill, request, reason, pinned)
      → refusals: plan pending, wrong court, wrong pack, budget
      → context package (matter records + rules + preferences + precedents)
      → scoped Pi session with only the skill's tools
      → output gate: schema, anchors, claims, severity
      → at most two rewrites
      → report card + skill_run record
```

## 4. Problems

### S-01: The skill names a proceeding, but the runner does not enforce it

**Evidence.** `checkSkill` reads `proceedings`; `SkillSummary` holds it. `SkillRunner.run` checks `courts` and `packs`, not `proceedings`. `skillPackRefusal` is the only scope gate.

**Effect.** A skill written for a writ petition can run on a writ appeal, a criminal revision or another proceeding in the same pack. A skill written for SLP(C) can run on SLP(Cr).

**Target.** A typed `SkillScope` with proceeding types, forum kinds, stage keys and practice areas. The runner refuses on any mismatch. An unknown proceeding refuses a scope-specific skill.

### S-02: The pack is the real scope, and it is a content bundle

**Evidence.** `packs: [writ]`, `packs: [slp]`, `packs: [criminal]`. The pack gate refuses a skill outside the matter's pack. The pack itself mixes practice, court, proceeding and filing.

**Effect.** A skill's scope is a content bundle, not a legal type. When the pack changes, the skill gate changes. A new court with the same proceeding needs a new pack.

**Target.** A skill scopes itself to a `proceedingTypeId`, a `forumKind`, a `stageKey` and a `practiceAreaId`. No pack. The resolver supplies the practice content.

### S-03: The library is broad but unmeasured

**Evidence.** 140 skills. The tests use three fixture briefs. The review is a static document score. There is no gold set, no measured output quality and no regression set for a new model or prompt.

**Effect.** A skill can pass its review and fail on a real brief. A model change can degrade every skill without a failing test.

**Target.** A three-tier test set: fixture, scenario, and a small owner-approved gold set per practice area. Measure schema pass, anchor rate, legal failure modes and reviewer time. A model change runs the set before release.

### S-04: The role table is both a scope and a permission

**Evidence.** `ROLE_TABLE` defines the tools for each role. `checkSkill` rejects a tool outside the role. The runner also applies the tool policy.

**Effect.** A skill cannot use a safe tool that the role table omits, even if the contract is valid. The role table duplicates the service contract.

**Target.** The role table states the default tool set. A skill may name a service contract (`ResearchService.read`, `DocumentService.read`) and the tool is generated from the contract. The permission service remains the final gate.

### S-05: Skill outputs are loosely typed

**Evidence.** `OUTPUT_TYPES` include draft, report, chart, record. `OUTPUT_SHAPES` is a text instruction to the model, not a JSON schema. The gate checks shape by parsing and required fields; the exact schema is not enforced.

**Effect.** A skill can return a plausible object that misses a field. The draft or memo path then handles it defensively.

**Target.** A JSON Schema per output type, versioned. The gate validates the schema. A skill can extend the schema with a named `outputSchemaId`.

### S-06: No dependency or ordering contract

**Evidence.** A skill names inputs and required context, but not "requires SK-008" or "requires a confirmed issue". The workflow can order steps, but a skill run on its own can start before its inputs exist.

**Effect.** A drafting skill can run before the record is confirmed. The runner refuses only on context package or anchors, not on a legal prerequisite.

**Target.** A skill declares `requires`: record states, confirmed facts, accepted issues, adopted authorities, a rule selection, a filing profile. The runner checks them and returns a precise refusal.

### S-07: Review is a document, not a gate on quality

**Evidence.** `reviewSkill` scores 13 parameters and three legal failure modes. A built-in skill cannot run without a matching review record. The review is static and does not test the model output.

**Effect.** The score measures the writing of the skill, not its performance. A high score can hide a weak prompt.

**Target.** Keep the review as a design check. Add a runtime report card and a scenario score. A skill is "reviewed" only when both the design record and the scenario set pass.

## 5. Greenfield target

### 5.1 Entities

| Entity | Fields |
|---|---|
| `SkillDefinition` | id, version, title, description, role, scope, inputs, requires, permitted contracts, output schema, checks, approvals, budget, tests, body |
| `SkillScope` | proceedingTypes, forumKinds, stageKeys, practiceAreas, caseNatures |
| `SkillRequirement` | record state, confirmed fact, accepted issue, adopted authority, rule selected, filing profile |
| `SkillReview` | 13 parameters, failure modes, scenario results, reviewer, date |
| `SkillRun` | id, skill version, request, package, state, checks, output, usage, report |
| `SkillSet` | A named bundle of skills for a practice or a workflow |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `SkillRegistry` | Definitions, versions, scope, review | `skills/`, `advocate.db` |
| `SkillRuntime` | One run, context, tools, gate, retries | `AgentRuntime`, `ContextService`, `PermissionService` |
| `SkillReviewService` | Design review and scenario results | `SkillRegistry`, test fixtures |
| `SkillImportService` | Import, preview, install | `SkillRegistry` |

### 5.3 Contracts

```ts
interface SkillRegistry {
  list(): Promise<SkillSummary[]>;
  get(id: string): Promise<SkillDefinition | null>;
  resolve(scope: SkillScope): Promise<SkillDefinition[]>;
  install(input: SkillInstallInput): Promise<SkillDefinition>;
}

interface SkillRuntime {
  run(input: {
    skillId: string;
    matterId: string;
    request: string;
    pinned: string[];
    reason: string;
  }): Promise<ReportCard>;
}

interface SkillScope {
  proceedingTypes: string[];
  forumKinds: string[];
  stageKeys: string[];
  practiceAreas: string[];
  caseNatures: Array<"civil" | "criminal" | "mixed">;
}
```

### 5.4 The refusal rule

A skill refuses when:

- the proceeding type is unknown and the skill names one;
- the proceeding type is different;
- the forum kind is different;
- the stage is outside the skill's stage set;
- a required record state is missing;
- a required confirmed fact, accepted issue or adopted authority is missing;
- the budget is used;
- the plan is pending approval.

A general skill with an empty scope may run on an unknown context, with a notice. A scope-specific skill does not.

### 5.5 The review rule

A skill is approved when:

1. The 13-parameter design review has no legal failure mode.
2. The fixture test passes.
3. The scenario test passes on the current model.
4. The owner has used it on one real brief and accepted the result.

The third and fourth are new. They turn the review from a document into a measured gate.

## 6. Boundaries

- `SkillRegistry` owns definitions. It does not run them.
- `SkillRuntime` owns one run. It does not own the session or the model.
- `AgentRuntime` owns the session. It does not own the skill's scope.
- `ContextService` owns the package. It does not choose the skill.
- `PermissionService` owns the final tool decision. The skill cannot loosen it.
- `WorkflowService` orders skills. It does not redefine their scope.

## 7. Migration

1. Add `SkillScope` and `requires` to the frontmatter, with defaults from the current packs/courts/proceedings.
2. Make the runner enforce the scope. Add negative tests.
3. Replace the pack gate with the proceeding/forum/stage gate.
4. Add JSON schemas per output type.
5. Add a scenario set and a report card score.
6. Split the role table from the service contract. Keep the role as a default.
7. Rename the library's `packs` field to `practiceAreas` after the proceeding model lands.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| SK-01 | A writ skill on a writ appeal | Refused with the type mismatch |
| SK-02 | An SLP(C) skill on SLP(Cr) | Refused |
| SK-03 | A general skill on an unknown matter | Runs with a notice |
| SK-04 | A skill whose required issue is missing | Refused with the missing requirement |
| SK-05 | A skill output misses a schema field | Gate fails; no draft |
| SK-06 | A skill names a human-only tool | Registry refuses |
| SK-07 | A skill names a tool outside its role | Registry refuses |
| SK-08 | A review record for another version | Review needed; run refused |
| SK-09 | A model change | The scenario set runs; a regression fails |
| SK-10 | A skill run over budget | Refused before the model call |

## 9. Recommendation

**Keep the skill format and runner; replace the pack gate with a typed scope.** Add `requires`, JSON schemas, a scenario set and a measured review. Do not grow a second agent framework. A skill is one bounded task, not a workflow and not a practice pack.

## Appendix: evidence map

- `src/lib/skills/index.ts` — format, registry, shadowing.
- `src/lib/skills/roles.ts` — role table, human-only and never-in-a-skill.
- `src/lib/skills/review.ts` — 13 parameters, legal failure modes.
- `src/main/skill-runner.ts` — refusals, package, tools, gate, retries, report.
- `src/main/skill-import.ts` — import and preview.
- `src/lib/skills/skill-tests.ts` — fixture tests.
- `skills/` — 140 skill folders.
- `src/renderer/src/Pages.tsx` — skills page.

# Spec: harness and stores (phase 1)

Status: started 2026-11-15 (owner's instruction: "implement Phase 1: Harness and stores"). The phase, its scope and its exit are in [../build-plan.md](../build-plan.md) section 2. The features are in [../features.md](../features.md). The agent kinds are in [agent-framework.md](agent-framework.md); this spec adds the skill run and the side question.

## 1. Features and where each is built

| Feature | Built in | What the advocate sees |
|---|---|---|
| G5 | `src/lib/matter-store/audit.ts` (Find, built); `searchAll` in `src/main/index.ts` | The command bar searches every open matter and the judgment index. The agent's Find stays inside its own matter. |
| I1 | `src/lib/context-package/` (the library); `src/main/context-assembly.ts` (retrieval) | The package view of each skill run: what was included, what was left out, and why. |
| N1 | `src/lib/skills/` (format, checks, roles); `src/main/skills.ts` (discovery); `skills/` (built-in skills) | Workflows & Skills: every skill with its version, role, tools, checks and approval points. |
| N2 | `src/main/skill-runner.ts`; the tool `run_skill` | A report card in the chat for each run. |
| N3 | `src/renderer/src/ChatDock.tsx`; `send` in `src/main/agent.ts` | `/` lists skills and commands; `@` adds a record; a plain request lets the agent pick the skill and say which. |
| O1 | `src/main/plan.ts`, `PlanCard` | A plan for long work waits for "Approve plan". Skill runs wait too. |
| O2 | `src/lib/skills/roles.ts` | The role of each skill, and the tools each role may have. |
| O3 | `src/main/skill-runner.ts` | Several `run_skill` calls in one message run at the same time. A run cut off by a restart shows as interrupted, and Resume continues it from its session file. |
| O4 | `src/lib/skills/gate.ts` | At most two rewrites. Then a review item "Skill run needs review". |
| O6 | The matter budget (built); `budget_tokens` per skill | A run that passes its budget stops with the reason. |
| O7 | `src/renderer/src/Jobs.tsx` | The Jobs tab beside Chat and Context: every chat run, helper and skill run, its state, cost, package and report card. |
| O8 | The question queue (built); approval points of a skill | An approval card at each approval point. |
| O9 | `src/main/side-questions.ts`; `SidePanel` | The Side question action and `/btw`. A read-only thread beside the chat; "Bring into chat" puts a quote into the composer. |
| O10 | Built ([agent-framework.md](agent-framework.md) section 2.1) | — |
| Q2 | `src/main/skill-runner.ts`, `src/main/context-assembly.ts`, `src/main/tool-policy.ts` | A run gets only its skill's tools, through the tool policy. Retrieval refuses records of another matter. |
| Q4 | `src/lib/advocate-store/`, `src/lib/intel-store/` | The advocate profile page; Court Intelligence lists sources and their freshness; Diagnostics checks both chains. |
| Q5 | `src/renderer/src/AppNav.tsx` | The left pane of [../advocate-workflow.md](../advocate-workflow.md) section 3. A view that is not built says so and names its phase. |
| R1 | `src/renderer/src/V3.tsx` `ReviewInbox`; `inbox:all` | Review Inbox in the left pane: one queue across matters, "blocks the work" first, keyboard operable. |
| Y4 | Pi providers (built) | Embeddings and reranking are not built. The vector-index spike decides them before phase 5. |
| Y5 | Built | — |

## 2. Skills

A skill is a folder with `SKILL.md`: Pi's skill file (name and description in the frontmatter, the instructions in the body) with Open Advocate's fields added ([../skills.md](../skills.md) section 1). The frontmatter keys are `id`, `version`, `title`, `role`, `packs`, `courts`, `proceedings`, `inputs`, `required_context`, `permitted_tools`, `output`, `checks`, `approval_points`, `budget_tokens`, `package_type`, `question_type`, `tests` and `author`.

- **Where.** Built-in skills are in `skills/` of the application. The advocate's own skills are in `<userData>/skills/`. The registry lists both. When both have the same id, both versions are listed and the higher version runs.
- **Checks at load.** A skill whose permitted tools include a tool the agent does not have, a tool outside its role's scope, a human-only action, or an unknown output type is listed with its error and cannot run.
- **The phase 1 skills.** Four built-in skills at version 0.1.0 (SK-008, SK-011, SK-012 and SK-027), built on the current tools. Phase 8 reviewed them with the rest of the library and they are version 1.0.0 (feature N6; [practice-packs.md](practice-packs.md) section 4).

## 3. The context package (I1)

[../architecture.md](../architecture.md) section 5 owns the pipeline. As built:

1. **Classify.** The skill's `package_type` and `question_type`, or the words of the request when the skill names none.
2. **Retrieve.** One retriever per kind in `required_context`: `sources`, `lines` (Find over the request's words), `events`, `conflicts`, `issues`, `authorities`, `drafts`, `memory`. Items pinned with `@` are added first. The scope check runs before retrieval: an item of another matter is excluded with the reason "another matter".
3. **Rank.** The policy of the question type sets the order of the item kinds. Inside a kind: pinned, then verified or confirmed, then by relevance and date.
4. **Fit.** Duplicates are removed (same id, or the same text). Long items are shortened with their anchors kept. Both sides of a conflict go in together or stay out together. The budget is in tokens (four characters a token).
5. **Flag.** A stale, superseded or disputed item keeps its flag inside the package.
6. **Record.** `context_package` in `matter.db`: the id, the skill and its version, the hash, the tokens, the budget, the included ids and the excluded ids with the reason.
7. **Cache.** The same skill, version, items and budget give the same hash. The run reuses the recorded package and says so.

## 4. The skill run (N2, O3, O4, O6, O8, Q2)

1. The Matter Agent calls `run_skill` with the skill id, the request, the reason it picked the skill, and any pinned ids. A `/` command puts the same call to the agent.
2. The runner refuses a run when the skill has an error, when a plan waits for approval, or when the matter's budget is used.
3. It builds the package, then starts a Pi session in `<matter>/chat/skills/<run id>/` with the skill's prompt, the package and only the permitted tools. Each tool call runs through the Matter Agent's `executeTool`, so the tool policy decides it.
4. An approval point `before_write` asks the advocate before the first writing tool of the run.
5. The output is one JSON block of the skill's output type. The gate checks the schema and the skill's checks. A failure sends the defects back to the same session. After two rewrites the run ends as "needs review" and opens a review item.
6. A model error is retried twice. A run stops at its timeout (15 minutes by default), at its budget, or on Stop.
7. The report card is stored in `skill_run` in `matter.db` and shown in the chat: state, attempts, checks (passed, failed or not available), tokens, cost, time, tools used, the package, and what the run could not read.
8. At start, a run left "running" by a restart becomes "interrupted". Resume asks the Matter Agent to call `run_skill` with `resume`, and the run continues its own session file with the recorded package.

Checks available in phase 1: `schema`, `anchors` (every anchor names a record of the matter), `no_unverified_claims` (an item that says "verified" names a validator result). Any other check name reports "not available yet" and never "passed".

## 5. Side questions (O9)

[../harness-build.md](../harness-build.md) HB-1 owns the design. As built: an in-memory Pi session per thread, on the chat's model, with the reading tools of the Matter Agent only. Each call checks the tool policy first. The prompt holds the last 40 messages of the main chat and the open view, copied once. Threads last for the window session.

### 5.1 Conversations and chat controls

A matter has many conversations. `chat/conversations.json` holds the list; each conversation has its own messages file under `chat/conversations/` and its own Pi session file. New conversation, switch and rename are bridge functions; the Sessions menu in the chat and the Jobs tab both list the conversations. A conversation with no session file and no messages never continues another one's session.

The chat shows the model's reasoning in a folded block, and each tool call carries its arguments and its result in a folded "What the agent did" list. Stop is always in the dock header; it is disabled when nothing runs. The right-click menu offers cut, copy, paste, select all and "Add to context"; that last item inserts the selection into the chat composer and sends nothing.

## 6. The stores (Q4)

Each store has one writer module and its own hash-chained `event` table, checked like `matter.db` ([../architecture.md](../architecture.md) section 3).

- `advocate.db`: `profile` (key and value), `preference` (proposed, approved or rejected, with the reason it applies), `memory` (the typed records of [../architecture.md](../architecture.md) section 6). Only the advocate approves a preference or confirms a memory record.
- `intel.db`: `source` (`source_url`, `owner`, `retrieved_at`, `checked_by`, `valid_from`, `valid_until`, `access_method`, `reliability`, `check_days`). A row past its check interval is "stale since <date>"; a check on it is "unconfirmed".

## 7. Tests

| Test | Checks |
|---|---|
| `tests/unit/skills.test.ts` | The format, the load errors, versions, roles, the gate |
| `tests/unit/context-package.test.ts` | Ranking by question type, duplicates, the budget, anchors kept, conflicts together, flags, the record, the cache |
| `tests/unit/stores.test.ts` | Both stores, their chains, human-only writes, freshness |
| `tests/unit/skill-runner.test.ts` | A run with the faux model: the scoped tools, the policy, the package record, a rewrite, "needs review" after two, the budget, parallel runs, resume |
| `tests/unit/side-questions.test.ts` | No writing tool; the main conversation does not change |
| `tests/e2e/phase1.spec.ts` | The exit path with the scripted model: the plan card and its approval, a skill run with its report card, a side question brought into the chat, the Jobs tab with the package, the navigation and the Review Inbox |

## 8. Done

The owner runs the phase exit of [../build-plan.md](../build-plan.md) on a real matter (lesson L3).

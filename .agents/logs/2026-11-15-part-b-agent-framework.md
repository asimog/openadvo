# Part B: defects, overlaps and the agent framework

Date: 2026-11-15. Base: `main` at `25821e7`. Owner's instruction: do part B now; fix the defects; find the overlaps; define the agent framework (a Firm Agent, a Matter Agent, helper primitives, who may start whom, broad roles, compaction per kind) from the Pi reference and the reported lessons; do not build helpers for everything.

## 1. What was done

| Item | Result | Files |
|---|---|---|
| Knowledge layers decoupled | Moved to their own parked assessment. Q-8 closed with the owner's answer: the firm knowledgebase is what the advocate uploads (templates, memos, workflows, playbooks); a solo practitioner is a firm. | `.agents/logs/2026-11-15-knowledge-layers-assessment.md`, `docs/parking.md`, `docs/questions.md` |
| Framework spec | Agent kinds, what a helper is, helper types, spawn rights, runs and observation, tool rules, context strategy per kind, checks. | `docs/specs/agent-framework.md` |
| B1-1 (H-33, H-25) | One listener per session; a run starts on `agent_start` and ends on `agent_settled`. | `src/main/agent.ts` (`listen`, `beginRun`, `finishRun`, `send`) |
| B1-2 (H-34) | Stop calls pi-subagent-manager's `agent_status` and `agent_stop`; the notice says how many helpers stopped. Stop on an idle chat stops running helpers too. | `src/main/agent.ts` (`stopHelpers`, `stop`) |
| B1-4 (H-35) | Every write records `<session id>`, or `<session id>/<parent call id>` for a nested call. `propose_issue`, `add_authority`, `write_memorandum` now record a session id. | `src/main/agent.ts` (`actorId`), `src/main/agent-work.ts` |
| B1-5 (H-38) | The `ask` comment corrected. | `src/main/pi-extensions.ts` |
| B1-6 (H-39) | Long select options wrap inside their buttons. | `src/renderer/src/app.css` |
| Studio failures (H-36) | A refused or failed Studio call throws; Pi reports an error. | `src/main/studio-tools.ts` |
| A4 tool fixes (H-37) | 10 `StringEnum` choices; `readOnlyHint` on 12 reading tools; `executionMode: "sequential"` on 11 writers; Stop ends a call at once; long results cut at 2000 lines / 50 KB with a hint (this replaces the "truncate" fix and is B-I4). | `src/main/agent.ts` (`harden`, `choice`, `boundText`, `untilAborted`) |
| Run trace (H-40, B-I2) | `chat/trace.jsonl`: run start, each finished tool call (tool, call id, parent call id, ms, error, characters), compaction, run end. No arguments or results. | `src/main/agent.ts` (`trace`) |
| Context strategy per kind (H-22) | `context` hook clears old tool results; `session_before_compact` writes the summary in the kind's form with the session's model; `keepRecentTokens` per kind. Built for the Matter Agent; the Firm Agent's values are in the table for when it is built. | `src/main/agent-context.ts` |
| Helper types (H-41) | `legal-research` (may start `record-reader`), `record-reader`, `critic`, `drafter`; the six coding types get no tools; `maxLevels` 3, `maxConcurrent` 4, `maxThreads` 24. | `src/main/helper-types.ts`, `src/main/pi-extensions.ts` |
| B2 overlaps | One owner per job. | `docs/harness-build.md` section 1.6 |
| Docs | Architecture section 7 (agent kinds); feature O10 (Firm Agent, phase 1); harness-hardening H-25 built and section 6 (H-33 to H-43); harness-build section 1.4; specs README. | `docs/` |

Pi features used, not rebuilt: session events (`agent_start`, `agent_settled`, `tool_execution_end` with `parentToolCallId`), nested call ids (`nested-tool-calls.ts`), `sendCustomMessage`, the `context` hook, `session_before_compact` (from `examples/extensions/custom-compaction.ts`), `compaction.keepRecentTokens`, `truncateHead`, `StringEnum`, tool `annotations` and `executionMode`. pi-subagent-manager: agent files, `toolFiltering`, `maxLevels`, `maxConcurrent`, `maxThreads`, `agent_status`, `agent_stop`.

## 2. The framework in short

| Kind | Status | Context strategy |
|---|---|---|
| Firm Agent (O10) | Specified; not built (its session, tools and Home chat are a piece of work of their own, lesson L5). Nothing in the window offers it. | Clear all but the last 3 results above 30 % of the window; keep 12,000 recent tokens; summary by matter id |
| Matter Agent | Built (the matter chat) | Clear all but the last 6 results over 2,000 characters above 50 %; never `read_matter_memory`; keep 30,000 recent tokens; six-part matter summary |
| Helper | Built (pi-subagent-manager with four types) | None beyond Pi's default; result capped by the prompt |
| Skill run | Planned (N2) | Per skill |

Spawn rights: the Firm and Matter Agents start helpers; only `legal-research` starts helpers, and only `record-reader` (a prompt rule: pi-subagent-manager has no per-type spawn list; depth is enforced by `maxLevels`).

Sources applied: context engineering (smallest high-signal set; hybrid retrieval for legal work; compaction tuned for recall; tool-result clearing as the lightest compaction); writing tools for agents (clear purpose, truncation with guidance, errors that say what to do, annotations); the platform docs on context editing (`trigger`, `keep`, `exclude_tools`, clearing only when it pays because it breaks the cached prefix) and on managing tool context (tool search, programmatic calling, caching, editing each for its own pressure); the multi-agent research system (brief per worker, condensed results, effort scaled to the task, ~15× tokens); harness design (separate critic; remove parts that bear no load).

## 3. Commands and results

| Command | Result |
|---|---|
| `node --test --test-timeout=15000 tests/unit/agent-runs.test.ts` before the fix | B1-1 "timed out waiting for the run to finish"; B1-2 timed out; B1-4 actors `[undefined, undefined]`; Studio test timed out; stuck tool test timed out; tool rules: `readOnlyHint` undefined |
| `node --test tests/unit/agent-runs.test.ts tests/unit/agent.test.ts` after | tests 10, pass 10, fail 0 |
| `node --test tests/unit/agent-context.test.ts` | tests 5, pass 5, fail 0 |
| `node --test --test-name-pattern="helper-agent policy" tests/unit/pi-extensions.test.ts` | pass 1, fail 0 |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | tests 132, pass 129, fail 0, skipped 3, exit 0 (was 121 / 118 / 0 / 3) |
| Link check (agent-guide 9.1) | no broken link |
| Feature id check (agent-guide 9.1) | 170 features, no gap, no later-phase dependency |

## 4. End-to-end

| Command | Result |
|---|---|
| `npm run build`; `npx playwright test` (first run) | 3 bundles built. 22 passed, 1 failed, 2 skipped. Failed: `extensions.spec.ts:85` (H-12): "Working…" was not shown while `/checklist clear` waited on its question. Cause: `send()` started the window's run only after the command ended. |
| Fix: `send()` begins the run before `prompt()`; Pi's `agent_start` joins it; the listener begins only runs nobody sent (a helper's result) | agent tests 10 of 10 pass |
| `npm run typecheck`; `npm run test:unit`; `npm run build`; `npx playwright test` (second run) | typecheck exit 0; unit tests 132, pass 129, fail 0, skipped 3; 3 bundles built; end-to-end 23 passed, 0 failed, 2 skipped (live-model tests), 2.6 min |
| `test-results/extension-question-select.png` | Each long option of the select question wraps in full inside its button (H-39). |

## 5. Not verified

- A helper with a live model: its start, its result as its own run, Stop of a real thread. The tests use a stand-in extension with the same tool names and result shape as pi-subagent-manager 1.9.0.
- The custom compaction summary with a real model. The tests check the prompt form and that the hook is loaded, not a real summary.
- Tool-result clearing in a long live session (the unit test checks the function and that the hook is loaded).

## 6. Next

1. A live run on a real brief (lesson L3): the Matter Agent starts a `legal-research` helper; its result arrives as its own run; Stop ends both.
2. H-42: the B3 caller-identity spike, then one adapter per bundled extension (each its own phase).
3. H-43: the Firm Agent (O10), with its Home chat.
4. Then H-14, the `/` list.

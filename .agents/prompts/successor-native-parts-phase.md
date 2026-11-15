# Successor prompt: finish the native-parts phase

You are the lead engineer of `C:\dev\openadvo`. Read `AGENTS.md`, then `.agents/prompts/native-parts-phase.md` (the owner's scope for this phase; it governs), then `.agents/logs/2026-11-15-native-parts-gaps.md` (the gap list). New owner decisions overrule old ones (top of `docs/decisions.md`).

## 1. State at hand-over (2026-11-15, usage ran out mid-phase)

Committed and tested before this phase: tool policy (allow/ask/deny, fixed denials, approval card, review log, Settings → Tool permissions), foreground helpers (`start_helper`, four types, spawn rights, 4 at once, Stop), plan v1, context meter, Compact now, Firm Agent, placeholder extension, run trace, context strategy per agent kind. The seven bundled packages are gone.

**The last commit is work in progress ("WIP: native parts phase").** Verify with `npm run typecheck` first. In it:
- Done, not yet tested end to end: `src/main/test-model.ts` (scripted faux model under `OPENADVO_TEST=1`; hooks `setModelScript`, `releaseModel`, `modelSeen` in `src/main/index.ts`); plan v2 in `src/main/plan.ts` (transitions, dependencies, 3 subtasks, tags, `addItem`, text line per change, survives a new conversation, "add to the plan: …" in `Agent.send`, `planGuidance` with the `planStrength` setting); `PlanPanel` and `StatusLine` in `src/renderer/src/PlanCard.tsx` (Astryx Collapsible, ProgressBar, List, StatusDot, Badge; inline steer field, because Electron has no `window.prompt`); `HelperView`, `HELPERS_EVENT` in `src/shared/api.ts`.
- **Declared but not implemented** (the window calls them; main has no handler yet): `stopHelper`, `steerHelper`, `useHelperResults`, `getPlanStrength`, `setPlanStrength`, `costCsv` (preload channels `helpers:stop`, `helpers:steer`, `helpers:use-results`, `plan:strength:get|set`, `cost:csv`). Add the handlers first, or the buttons fail.

## 2. Build plan, in order

1. **Helper runtime v2** (`src/main/helpers.ts`): a `HelperManager` per conversation. Background jobs (`background: true` returns a job id); fork context (pass the parent's last ~30k characters of conversation as a frozen block); `helper_update` (text line in the parent chat); `helper_ask` (returns with `terminate: true`; the parent answers with `steer_helper`, which resumes the same session); `steer_helper` / advocate Steer (Pi `session.steer`); `stop_helper` / advocate Stop; Stop on the chat stops all; 5-minute foreground wait then it turns into a background job; paged output `helper_output` (8,000-character pages, no cut); results wait — delivered with the advocate's next message or "Use results", never by `triggerTurn`; Final Recap (one notice when the last background helper finishes); `helpers.json` + `helpers/<id>.txt` partial output; on reopen a running helper shows as interrupted; session file per helper under `chat/helpers/` (`SessionManager.create`); cost per helper via `host.recordUsage` with cache reads/writes; names from the task. Test timeouts from `OPENADVO_TEST_HELPER_TIMEOUT_MS`, `OPENADVO_TEST_HELPER_WAIT_MS`, `OPENADVO_TEST_APPROVAL_TIMEOUT_MS` (only when `OPENADVO_TEST=1`). Check that `ctx.executeTool` still works after the `start_helper` call returned (background); pi-subagent-manager relied on it.
2. **Policy gaps:** hide denied tools before the run (`setActiveTools`); fail closed (catch in the hook → block + log); party-name rule for `web_search`/`web_fetch` (parties from the matter store); MCP rules (`mcp__<server>__*` patterns); card shows the query, URL or field; one approval at a time; 10-minute timeout for background helpers; `policy` lines in `trace.jsonl`; Settings rows for MCP and the party rule.
3. **Context:** summarise old tool results once at the final answer (skip when not shorter), refs `t1…`, `recall_result` tool; `/context` text breakdown (estimates, say so).
4. **Cost:** trace input/output/cache/hit % = cacheRead / (input + cacheRead + cacheWrite); a text line after each run; `/cost` table; CSV export from the matter page (`costCsv`).
5. **Settings:** plan strength radio.
6. **Parking:** pi-context-decisions design (relevant skills only, keep earlier picks, always-allowed list, no filtering below 8 skills, pick history, re-pick rule) against N1–N3.
7. **E2E only** (owner): `native-policy.spec.ts`, `native-helpers.spec.ts`, `native-plan.spec.ts`, `native-context.spec.ts`; each under a minute with the scripted model. Run `npm run typecheck`, `npm run build` and only those files. No new unit tests; do not run full suites.
8. Docs: update `docs/specs/native-harness-parts.md` to what is built, `harness-build.md`, `harness-hardening.md`, `repo-map.md`; report in `.agents/logs/<date>-native-parts.md`.

## 3. Concepts to apply (from the sources studied; see `.agents/logs/2026-11-15-harness-lessons-and-knowledge-layers.md`)

- Smallest high-signal context; hybrid retrieval for legal work (stable records up front, tools for the rest).
- Tool-result clearing as the lightest compaction; clear only when it pays (it breaks the prompt cache); summaries keep anchors and a ref to the original.
- Compaction tuned for recall first; the matter summary form (six parts); recoverable from the session file.
- Helpers: explicit brief (objective, sources, output, limits), condensed results with record ids, effort scaled to the task, never start a turn, parent owns limits/Stop/timeouts.
- Observable runtime: one listener per session (`agent_start` → `agent_settled`), `trace.jsonl`, cost and cache per run.
- Approval through the harness, not inside tools; discovery is not permission.
- Text by default; controls only where the advocate acts; one pinned status line.
- Session start (`npm run session:start`) and clean handoff (`.agents/templates/session-handoff.md`).

## 4. Not verified anywhere yet

Live model runs of: helpers, approvals, plan, compaction, the Firm Agent. The owner's exit (L3): a real brief with a plan, a background helper, an approval card and `/cost`.

`resources/pi-extensions/` can be deleted. `.agents/memory-rag-assessment.md` belongs to another session; do not commit it.

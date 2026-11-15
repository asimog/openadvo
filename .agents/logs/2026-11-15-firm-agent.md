# The Firm Agent (feature O10, H-43)

Date: 2026-11-15. Base: `main` at `07334c3`. Owner's instruction: "Build Firm Agent". Spec: `docs/specs/agent-framework.md` sections 2 and 2.1.

## What was built

| Part | Files |
|---|---|
| The Firm Agent's tools and prompt: `list_matters`, `matter_overview`, `list_hearings`, `list_workflows`, `read_workflow` (read-only), `propose_matter_instruction` | `src/main/firm-agent.ts` |
| One `open()` for both agent kinds (tools, prompt, required tools, context strategy, extensions, listener); `startFirm()`; handoffs stored in `handoffs.json` and sent as `FIRM_HANDOFFS_EVENT`; `closeFirmHandoff()`; a test-only `callToolForTest()` | `src/main/agent.ts` |
| `FIRM_AGENT_ID` (`firm:agent`), `FirmHandoff`, `FIRM_HANDOFFS_EVENT`, `ChatState.handoffs`, bridge `closeFirmHandoff` | `src/shared/api.ts`, `src/preload/index.ts` |
| Host: the firm folder in user data, no matter store or budget for the Firm Agent, usage in `usage.jsonl`, the firm data from the docket, the Review Inbox, the hearings and the workflows; IPC `firm:close-handoff`; test hook `callAgentTool` | `src/main/index.ts` |
| The Firm Agent panel on Home | `src/renderer/src/FirmChat.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/app.css`; `Message` exported from `ChatDock.tsx` |
| Tests | `tests/unit/firm-agent.test.ts` (6), `tests/e2e/firm.spec.ts` (1); `tests/e2e/app.spec.ts` bridge list |
| Docs | `docs/specs/agent-framework.md` 2.1 and checks; `docs/harness-hardening.md` H-43 built; `docs/repo-map.md` the `firm-agent/` folder |

Pi features used: the same session, extension, compaction and `context` hook path as the Matter Agent, with the firm strategy of `CONTEXT_STRATEGY.firm`. No new Pi part.

What the Firm Agent cannot do, by design: read a matter's documents, Notebook, drafts or research; write any store; send anything to a matter. Not available yet: the Knowledge Library and advocate memory (Q4); its prompt and the panel say so.

## Commands and results

| Command | Result |
|---|---|
| `node --test tests/unit/firm-agent.test.ts` before the code | fails: module `src/main/firm-agent.ts` not found |
| `node --test tests/unit/firm-agent.test.ts tests/unit/agent-runs.test.ts tests/unit/agent.test.ts` after | tests 16, pass 16, fail 0 |
| `npm run typecheck` | exit 0 (node and web) |
| `npm run build` | 3 bundles built |
| `npx playwright test tests/e2e/firm.spec.ts` | 1 passed |
| `npm run test:unit` | tests 138, pass 135, fail 0, skipped 3, exit 0 |
| `npx playwright test` (first full run, 4.3 min) | 22 passed, 2 failed, 2 skipped. Failed: `step2.spec.ts:46` (dropped PDF) and `v3.spec.ts:23` (progress, inbox, command bar). The error text was not kept. |
| `npx playwright test tests/e2e/v3.spec.ts tests/e2e/step2.spec.ts` | 2 passed |
| `npx playwright test` (second full run, 2.7 min) | 24 passed, 0 failed, 2 skipped |

Evidence: `test-results/firm-agent-home.png` (Home with the Firm Agent panel and a handoff card).

## Not verified

- Why `step2` and `v3` failed once in the first full run. They passed alone and in the second full run. The first run was 1.6 minutes slower, so a timing failure under load is likely, but this is not shown.
- The Firm Agent with a live model: its answers to firm questions and its choice of when to propose a handoff. The tests run its tools through their own code, with no model.

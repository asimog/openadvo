# Pi SDK and agent integration: review (2026-11-15)

Read only. No code changed. No tests run.

## Evidence read

- `package.json`: `@earendil-works/pi-coding-agent` 1.5.2 and `@earendil-works/pi-ai` 1.5.2, pinned exact.
- `package-lock.json`: pi-coding-agent also installs pi-agent-core, pi-codemode, pi-mcp, pi-tui, pi-schema, pi-telemetry (all 1.5.2).
- `src/main/agent.ts` (1131 lines): the only file that imports the Pi SDK.
- `src/main/index.ts:146,277,591-598,709,834-873`: the wiring.
- `src/main/studio.ts:327-334,389-410,487`: direct model calls.
- `src/lib/workflows/index.ts`: workflows.
- `node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`, `docs/mcp.md`, `docs/codemode.md`, `docs/settings.md:166-172`, `dist/core/sdk.d.ts:10-65`, `dist/core/model-runtime.d.ts:4-20`, `dist/config.js:510-516`.
- `tests/e2e/app.spec.ts:218-300`, `tests/e2e/v1.spec.ts:80`.
- `docs/engineering.md` EC-3 and EC-7, `docs/architecture.md:20,37,59-90`, `docs/decisions.md:33-34,61,73`, `docs/skills.md`.

## Pi SDK surface used

| SDK item | Use | Where |
|---|---|---|
| `createAgentSession` | One session per open matter | `agent.ts:959-970` |
| custom `ResourceLoader` | Returns no extensions, skills, prompts, themes or AGENTS files; supplies the system prompt | `agent.ts:330-344` |
| `createExtensionRuntime` | Empty runtime for the loader | `agent.ts:332` |
| `SettingsManager.inMemory({ compaction: { enabled: false } })` | Session settings | `agent.ts:966` |
| `SessionManager.create` / `continueRecent` | JSONL session files in `<matter>/chat/pi` | `agent.ts:517,967` |
| `tools` + `customTools` + `defineTool` (typebox) | 43 custom tools; built-ins read, bash, edit, write are off | `agent.ts:68-119,519-956,968-969` |
| `getActiveToolNames` check | Session is disposed and start fails if the active set is not exactly `AGENT_TOOLS` | `agent.ts:971-975` |
| `ModelRuntime.create()` | Credentials and models from `~/.pi/agent` (auth.json, models.json) | `agent.ts:368-372` |
| `resolveCliModel`, `hasConfiguredAuth`, `getAvailable` | Model choice order (EC-7) | `agent.ts:379-400` |
| `SettingsManager.create(appDir, getAgentDir())` | Reads Pi's default provider and model from `~/.pi/agent/settings.json` | `agent.ts:389` |
| `runtime.completeSimple` | One tool-less call for the Studio loop and rehearsal | `agent.ts:406-422` |
| `session.prompt`, `subscribe`, `abort`, `dispose`, `setModel`, `setThinkingLevel` | Chat run, Stop, model and effort pickers | `agent.ts:437-483,1049-1120` |

Events are mapped to AG-UI: text deltas, tool start and end, run start, finish, error, and an interrupt per proposed draft change (`agent.ts:1042-1110`).

## Pi features not used

- Extensions: none load. The loader returns an empty list.
- Pi skills, prompt templates, themes, AGENTS.md / context files: none load.
- MCP, codemode, tool_search: not loaded. The SDK loads them only through `DefaultResourceLoader` extension factories (`sdk.md`, "codemode-mcp").
- Built-in tools (read, bash, edit, write): off, because `tools` is an allowlist (`sdk.d.ts:35-49`).
- `steer`, `followUp`, `AgentSessionRuntime` (fork, switch), compaction: not used.
- Thinking deltas and tool arguments or results are not sent to the window.

## Application "skills" and workflows

- Skills (decision 14, `docs/skills.md`) are not built. No `skills/` folder exists. No skill runner, planner, per-skill session or per-skill tool scope exists. The only code hit for "skill" is the comment at `agent.ts:5`.
- Workflows (`src/lib/workflows`) are prompt text the advocate sends. They grant no tool. Six are built in; the advocate can add custom ones.
- Matter memory is a read tool (`read_matter_memory`) plus a proposal tool (`propose_memory_note`). It is not injected into the system prompt.

## Findings

1. **Race in `send()`.** `state.busy` is tested at `agent.ts:1020` but set only at `agent.ts:1041`, after `await this.host.policy()` at `1025`. Two sends close together both pass the test. The second `session.prompt()` runs while the first streams; the SDK rejects that (`sdk.md`, "Prompting"). Its `finally` then sets `busy = false`, emits `RUN_ERROR` and writes `messages.json` while the first run still works. `index.ts:598` calls `void agent.send(...)`, so nothing serialises the calls.
2. **Conversation grows without limit.** Compaction is off (`agent.ts:966`) and `continueRecent` reopens the full history after each restart (`agent.ts:967`). When the history exceeds the model's window, every run fails with `RUN_ERROR` until the advocate starts a new conversation. No message says why.
3. **Model choice is cached for the process.** `this.selected` (`agent.ts:380`) keeps its first result. If no model has credentials at the first call, the result is `undefined` until a restart or a pick in the model picker.
4. **System prompt contradicts the tools.** `agent.ts:199` says "Your tools are read only", and later lines describe write and filing tools (`propose_*`, `fill_record_cell`, `upload_filing_file`, `submit_filing`).
5. **One flat tool set.** Every matter session always has all 43 tools, including the portal and filing tools. Scoping exists only as the single allowlist. Filing safety relies on the host checks (two confirmations bound to the payload hash), not on the tool scope.
6. **Pi install telemetry is at its default.** The in-memory settings do not set `enableInstallTelemetry`, so it is `true` (`settings-defaults.js:31`). Pi's docs say it sends "selected provider attribution headers" (`settings.md:171`). Fact only; not evaluated.

What works as intended:

- The tool allowlist is enforced at start and checked by an offline e2e test (`app.spec.ts:218`).
- Confidential matters: chat refuses a non-local model (`agent.ts:1026`), the Studio refuses one (`studio.ts:331`), and web search is off (`studio.ts:151`).
- Token budget: checked before a chat run and between Studio loop steps; usage is recorded as a matter event.
- A failed model call becomes `RUN_ERROR`, not silence (`agent.ts:1062-1064`).

## Mismatches between instruction files and code

- `agent.ts:190` says the agent dir is "never the owner's ~/.pi". Credentials, models and the Pi default model are read from `~/.pi/agent` (`agent.ts:370,389`; `model-runtime.d.ts:5-7`). Session files and settings use `<userData>/pi-agent`. Decision 16 asks for Pi's own credentials, so the comment is the part that is wrong.
- `docs/architecture.md:87-90` describes per-skill sessions, a planner, a skill runner and a policy module. The code has none of them (accepted plan, not built).
- `docs/decisions.md:61` says "five built-in SLP workflows". `src/lib/workflows/index.ts` has six.

## Tests

- Offline: `tests/e2e/app.spec.ts:218` (exact tool list, session id recorded), `tests/e2e/v1.spec.ts:80`.
- Live, need `OPENADVO_LIVE_MODEL`: `app.spec.ts:277`, `app.spec.ts:295`.
- No unit test covers the `Agent` class (send, stop, busy, model choice).

## Pi monorepo comparison (github.com/earendil-works/pi, packages/)

Commands: `gh api repos/earendil-works/pi/contents/packages`, `gh api .../packages/<p>/package.json`, `.../README.md`, `.../CHANGELOG.md`, `gh api repos/earendil-works/pi/compare/v1.5.2...main`, `npm view <pkg> version`.

- Latest release v1.5.2 (2026-11-10). The app pins 1.5.2. `main` is 228 commits ahead, unreleased.
- In the lockfile (via pi-coding-agent): pi-agent-core, pi-ai, pi-codemode, pi-mcp, pi-schema, pi-telemetry, pi-tui.
- Not installed: `@earendil-works/pi-durable` 1.5.2 (README: "Experimental. The API changes without notice"), `@earendil-works/chord` 1.5.2, `@earendil-works/pi-env` 1.5.2. `pi-evals` is private (not on npm).
- pi-durable README covers: persist and resume mid-turn, busy conversations, compaction, reset and handoff, forks, abort and subagents, child tasks, task graph, hooks, gates, usage and cost. Its Unreleased section has breaking changes (tool `execute()` may park; `RunEndTask` renamed `HookTask`).
- Unreleased fixes in packages the app uses: abort mid-batch leaves skipped tool calls without a result (agent, #9986); "Connection closed." and socket-code errors not retried (ai, #12064, #12128); non-strict Anthropic tool schemas drop root `additionalProperties` (ai, #12067).
- Adopting pi-durable or chord would replace the base named in EC-3 (`docs/engineering.md`). That is the owner's decision.

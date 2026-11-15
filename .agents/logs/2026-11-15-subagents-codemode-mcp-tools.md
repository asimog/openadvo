# A5 report: Pi reference, codemode/MCP, helper agents, custom tools; Part B assessment

Date: 2026-11-15. Base: `main` at `b3ee18c`. No product code changed in this piece of work.

## Terms (helper agent and subagent)

- **Helper agent** (the word in `docs/`) and **subagent** (Pi's and pi-subagent-manager's word, and code names such as `writeSubagentPolicy`) are the same thing: a Pi session that the main chat agent starts with `agent_spawn`, in the same process.
- A **skill run** (planned, N2, O1, O3) is a different thing: a session that the harness starts for one skill, with that skill's tool scope.
- Proposal: add a row to `docs/decisions.md` section 4 ("Names in the code"): `subagent` → helper agent. Not done yet.

## A1. Pi reference folder

- `git ls-remote --tags https://github.com/earendil-works/pi` → `v1.5.2` = `b4afdddf44e059c67ccf5097e5317d913521b470`.
- `git clone --branch v1.5.2 --depth 1 … C:\dev\pireference` → OK, commit dated 2026-11-10. Matches the pin `@earendil-works/pi-coding-agent` 1.5.2 in `package.json`.
- `C:\dev\pireference\REFERENCE.md` written. Not done yet: the row in `docs/repo-map.md` and the read rule in `docs/agent-guide.md` §1 and `AGENTS.md`.

## A3. Codemode, tool search, MCP

Probe: `node scratchpad/probe-a3.ts` (our `PiExtensions.loader()`, the bundled extensions, a faux model). Results:

| Question | Fact |
|---|---|
| Loaded twice? | **No.** 12 extensions load: 7 bundled, `openadvo-policy`, `mcp`, `codemode`, `tool_search`, 1 test factory. Pi's `docs/sdk.md`: "SDK sessions do not load built-in extensions"; adding the three factories is the documented way. The prompt's suspicion is wrong. |
| Active? | `codemode`, `tool_search` and `context_prune` are registered but **not active**. Active: the app tools, 9 `agent_*`, 3 `checklist_*`, `context_tree_query`. |
| `codemode.mode` | Not set (settings return null). The start check (`AGENT_TOOLS`) holds. |
| Codemode hooks | With codemode turned on, a script call to an allowed tool ran and passed the `tool_call` hook with `parentToolCallId`. A tool with a `deny` rule and Pi's built-in `read` were "does not exist" for the script. |
| MCP config | `<agentDir>/mcp.json`, and `<agentDir>/.pi/mcp.json` after project trust (session `cwd` = agentDir). Pi turns codemode on by itself when a server with `codemode` exposure (the default) connects (`autoEnableCodemode`). A stdio server starts a program on the computer and its tools can reach files outside the matter store; the policy allows `mcp: { "*": "allow" }`. Recorded against decisions 2 and 4 as facts only. |
| Helpers | The helper allowlist (`writeSubagentPolicy`) has no `codemode`, `tool_search` or MCP tools, so helpers cannot use them. |
| Window | `/mcp` is a terminal command; H-19 needs a settings view. |

## A2. Helper agents (pi-subagent-manager 1.9.0), from the vendored source

| Topic | Fact (file) |
|---|---|
| Start | In process, `createAgentSession` (`src/orch/runtime.ts:595`). |
| Tools | Copies of the main session's callable tools; each call runs through the main session's `ctx.executeTool` of the `agent_spawn` call (`src/orch/inherited-tools.ts`). So the main session's `tool_call` hooks (guard, pi-permission-system) apply. Nested call ids are `<spawn call id>/<n>`. |
| Handoff out | `wait: false` result arrives with `pi.sendMessage(…, { triggerTurn: true })` (`src/index.ts:404-431`) → a main turn outside `send()`. |
| Stop | Docs (`docs/tools-and-ui.md` §Interrupts): aborting the main turn does **not** stop helpers. Only `agent_stop`, `session_shutdown` and tree/switch/fork stop them. |
| Host control | The host can call `agent_status` / `agent_stop` through `session.extensionRunner.getToolDefinition(name)`; the caller is bound to `/root`. |
| Window data | `agent_status` gives `ThreadView`: path, type, state, task, status, model, output, sessionFile. |

Not done: the Pi `examples/extensions/subagent` example and other npm subagent packages.

## A4. Custom tools against Pi's `docs/extensions.md`

Counts verified by search in `src/main/agent.ts` (36 tools; 37 hits includes the import).

| Guide asks | Code does | Fix (Part B) |
|---|---|---|
| Errors: throw or `isError: true` | No tool in `agent.ts` throws; the 6 `throw` are in other methods. `studio-tools.ts:103` returns "Refused or failed: …" as a normal result. | Studio failures set `isError: true`. Test: the window shows "Tool failed". |
| `promptSnippet` / `promptGuidelines` | 0. With a custom prompt Pi uses it as the preamble and adds no tools or rules sections (`system-prompt.ts:152`). | None needed; keep `systemPrompt()` and the descriptions consistent. |
| `StringEnum` | 10 `Type.Union` of `Type.Literal`. | Replace with `StringEnum`. |
| `annotations` | 0; all tools count as possibly destructive. | `readOnlyHint` on the ~20 reading tools. |
| `executionMode` | 0. `propose_correction` / `propose_paragraph` read the head, then write; the store refuses a stale base (`DOC_STALE_BASE`), so a parallel second call fails rather than losing a change. | `executionMode: "sequential"` on the draft and record writers. |
| `signal` | 0. Stop cannot end a long tool call (web, judgments, argument loop start). | Pass `signal` to the host calls. |
| Truncation (50KB / 2000 lines) | Only `read_source_text` (10 pages) and `read_judgment` (5 pages) limit. `get_chronology`, `read_draft`, `list_research`, `list_record_table`, `list_arguments`, `find_in_matter` are unbounded. | `truncateHead` with a "more" hint. |
| `outputSchema` / `structuredContent` | 0. | Only when codemode is turned on. |
| Session id on writes (decision 7) | `propose_issue`, `add_authority`, `write_memorandum` write with no session id (`agent-work.ts:15`). | Pass the session id. |
| Imports | `Type` from `typebox`; no bundled extension carries its own Pi copy. | None. |

## Part B: short assessment

- **B1 defects.** 1 (helper turn not seen) and 2 (Stop leaves helpers running) are confirmed by the source above. Fix: one listener per session (H-25); Stop calls `agent_status` then `agent_stop` for each running helper. 4 is wider than stated: helper writes can be told apart by the `<spawn id>/<n>` call id, and three work tools record no session id at all. 5 is confirmed (`pi-extensions.ts:135`). 6 not checked.
- **New defect.** Studio failures are reported as successes (A4 row 1).
- **B2 overlaps.** "Built-in extensions loaded twice" is not a conflict; remove it. Add: MCP turns codemode on by itself, which helpers and the start check do not expect.
- **B3.** The adapter plan holds. The caller-identity spike is still needed. It pulls Phase 1 features (O1, O3, O7, O8) into hardening; split it into separate phases (L5) and confirm each against `docs/advocate-workflow.md`.
- **Order.** B1 (1, 2, 4, Studio errors) → A4 fixes → B3 spike → adapters → H-14.

## Evidence

- `scratchpad/probe-a3.ts` (git-ignored) and its output above.
- Tests not re-run in this piece of work.

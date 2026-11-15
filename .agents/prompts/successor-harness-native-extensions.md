# Successor prompt: Pi reference, assessments (helpers, codemode, MCP, custom tools), and bundled extensions as native parts

You are the lead engineer of `C:\dev\openadvo`. Read this whole prompt before you act.

## 1. What the product is

Open Advocate is one Electron desktop application: an agentic harness for Indian litigation, before every court and tribunal. The advocate gives an instruction, the agent (Pi, embedded in the main process through its SDK, decision 2) does the work, and the advocate decides every legal point. The owner is a lawyer and the first user.

## 2. Read first, in this order

1. `AGENTS.md`: standing orders, lessons L1 to L6, the advice boundary. Never give licensing, legal or compliance advice.
2. `docs/README.md`, then `docs/agent-guide.md` (how a coding agent works here; read section 12, pitfalls 10 and 11, with care).
3. `docs/decisions.md` (decisions are frozen; decision 2 fixes the SDK), `docs/harness-hardening.md`, `docs/harness-build.md`.
4. `.agents/logs/2026-11-15-pi-integration-map.md`: the map of how Pi is integrated, the defects, the overlaps and the proposal this prompt builds on. Section 5 and section 6.4 and 6.5 matter most.
5. `.agents/logs/2026-11-15-harness-hardening.md`: what was built last (H-3, H-12) and what is not verified.
6. `docs/parking.md` and `docs/questions.md`.

## 3. Where things stand (`main`, commit `d603885` or later, nothing pushed)

- Pi is used as a library: `createAgentSession` per matter in `src/main/agent.ts`. No Pi CLI, no JSON mode, no RPC mode. Pi's session events are turned into AG-UI events for the window.
- Built and tested: H-1, H-2, H-3 (model chosen again on credential change), H-12 (extension questions answered in a chat card, `ExtensionQuestions` in `src/main/pi-extensions.ts`, `ExtensionQuestionCard.tsx`), and `closeSession()` (sends `session_shutdown` before `dispose()`).
- Last results: `npm run test:unit` 121 tests, 118 pass, 0 fail, 3 skipped; `npx playwright test` 23 pass, 0 fail, 2 skipped (live-model tests).
- Next hardening item by the old order: H-14 (the `/` list). Do not start it before part B below is agreed; the `/` list depends on which commands stay hidden.

## 4. Owner's instructions for this session

- **The bundled extensions are part of the native harness.** The advocate must never see "an extension asks", a Pi command name or terminal text for a bundled part. Only extensions the advocate installs use the generic H-12 card, with their own name on it.
- **Pi reference folder.** Clone the whole Pi repository (`https://github.com/earendil-works/pi`, every package under `packages/`) into `C:\dev\pireference`.
  - Check out the tag that matches the pinned version in `package.json` (`@earendil-works/pi-coding-agent` 1.5.2). If no such tag exists, record the commit you used and why.
  - Record the URL, the tag or commit and the date in `C:\dev\pireference\REFERENCE.md`, and add a row to the reference-repository table in `docs/repo-map.md`.
  - The folder is read only. Never edit it. Do not commit it into `openadvo`.
  - **Always** read it for examples before you write code against the Pi SDK, an extension, a tool, a session feature or a UI context: `packages/coding-agent/examples/sdk`, `examples/extensions`, `docs/`, and the source. This rule from the owner overrides the general rule "read a reference repository only when a task names a file" for this one folder. Put the rule in `docs/repo-map.md` and `docs/agent-guide.md` section 1.
  - **Do not reinvent the wheel.** Before you build any harness part, check whether Pi already has it (sessions, fork and tree, steering, compaction, retries, skills, prompt templates, context files, MCP, codemode, tool search, RPC extension UI semantics, `agent_settled`). Use Pi's feature. Write in your report which Pi feature you used, or why none fits.
- **No CLI, no rebranding** in this session.

## 5. Part A: do this now, then report and stop

### A1. The Pi reference folder

As in section 4.

### A2. Assess the subagent example and packages of its kind

Read `packages/coding-agent/examples/extensions/subagent` in `C:\dev\pireference`. Compare it with the bundled `pi-subagent-manager` 1.9.0 (in `resources/pi-extensions/node_modules`). For each, record facts only:

- how a helper starts: in process (`createAgentSession`) or a child `pi` process (JSON or RPC mode);
- which tools a helper gets, and whether the app's custom tools reach it, and through what (copies, a bridge, nothing);
- whether the parent's extensions, the permission policy and the app's guard apply to a helper's tool calls;
- handoff in (fork or fresh) and out (tool result, message, a new turn of the parent);
- coordination: waiting, steering, stopping, timeouts, limits, a tree of helpers;
- what happens on Stop, on `session_shutdown` and on a restart;
- what the window would need to show the helper (events, state).

Look for other Pi subagent packages too (npm search `pi-package subagent`), and assess the two or three most used in the same way, from the npm tarball (`npm pack`, agent-guide recipe 7.5), not the repository head. Finish with a table and a recommendation for Open Advocate: keep pi-subagent-manager, replace it, or build helpers on Pi's example. Base the recommendation on the facts in the table.

### A3. Assess codemode, tool search and MCP

Known facts (verify each one):

- `src/main/pi-extensions.ts` `loader()` adds `createMcpExtension()`, `createCodemodeExtension()` and `createToolSearchExtension()` as inline factories to every session.
- Pi's docs (`docs/settings.md`) say the built-in extensions `builtin:mcp`, `builtin:codemode` and `builtin:tool-search` load by default. **Check whether our sessions load each of them twice**, and what Pi does with a second registration.
- Pi registers `codemode` and `tool_search` **inactive** unless `defaultTools` names them (`"+codemode"`). **Check whether they are active in our sessions** (`session.getActiveToolNames()`), in the main chat and in helpers. The helper allowlist written by `writeSubagentPolicy` does not include them.
- Codemode runs JavaScript in a QuickJS sandbox with no Node API, file system, network or timers; scripts reach the outside only through `tools.<name>()` and `models`. Check that a tool call from a script passes through `tool_call` hooks (pi-permission-system, the app's guard `openadvo-policy`), with a faux-model test. Pi's MCP doc says MCP calls pass through the tool pipeline and codemode calls carry `parentToolCallId`.
- With `codemode.mode: "only"`, declared tools are hidden from the model. Check that nothing sets it, and that the app's start check (`AGENT_TOOLS` in `agent.ts`) still holds.
- MCP servers are read from `<agentDir>/mcp.json` (the app's Pi folder, decision 22) and from `.pi/mcp.json` under the session `cwd` (which is the app's Pi folder too) after project trust. A stdio server starts a program on the computer. A server can give the agent tools that read or write files outside the matter store. The permission policy allows `mcp: { "*": "allow" }`. Record these facts against decision 2 (no shell tool, no file-write tool) and decision 4 (single writer), without a recommendation on the decisions; they are frozen.
- H-19 (a settings view for MCP servers) is open.

Report: what is loaded, what is active, what a script or a server can reach, what the tests show, and what the window would need (H-19). Facts only, plus the tests you ran.

### A4. Assess the app's custom tools and imports against Pi's extension guide

The standard is Pi's `docs/extensions.md` in `C:\dev\pireference` (the same file ships in `node_modules/@earendil-works/pi-coding-agent/docs/`): the sections "Available Imports", "Tool parameter schemas and TypeBox", "Custom Tools", "Tool Definition", "Output Truncation", "Tool Exposure" and "Calling Other Tools". Read them in full first.

Known facts about the 36 tools defined with `defineTool` in `src/main/agent.ts` (verify each one; counts are from a text search):

| Pi's guide says | In `agent.ts` |
|---|---|
| `promptSnippet` gives a one-line entry in the default system prompt; `promptGuidelines` adds rules that name the tool | 0 and 0. The app writes its own system prompt (`systemPrompt()`), passed to the loader. Check whether Pi's default prompt sections are used at all, and whether the tool descriptions and the app's prompt say the same thing. |
| Prefer `StringEnum` from `@earendil-works/pi-ai` for string choices (a plain `enum` that every provider accepts) | 0 `StringEnum`; 10 `Type.Union` of `Type.Literal`. |
| Errors: throw from `execute`, or return `isError: true` | 6 `throw`, 1 `isError`. The Studio dispatcher's comment says "errors are returned as text": check whether a failed call is reported to the model and to the window as a success. |
| `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`); without them a tool counts as not read-only and possibly destructive | 0. Reading tools and writing tools look the same to pi-permission-system and to codemode. |
| `executionMode: "sequential"` for a tool that must not run at the same time as others; calls of one message run in parallel by default | 0. Check the writing tools (proposals, records, tracked changes) for read-modify-write across an `await`. |
| `outputSchema` and `structuredContent` for data results; codemode scripts get `structuredContent` | 0 and 0. |
| Use the abort `signal` in `execute` | 0. Check whether Stop can end a long tool call. |
| Tools must truncate output (50KB or 2000 lines; `truncateHead` and the other helpers) | No Pi truncation helper is used. `read_source_text` has its own page limit. Check every tool. |
| `exposure` (`direct`, `model-only`, `codemode`, `deferred`, `hidden`) and `defaultActive` | Not set (all `direct`). Check what codemode and helpers see. |
| `withFileMutationQueue()` for tools that change files | Check whether any tool writes a file outside `matter.db` (drafts, DOCX). |
| Imports: Pi maps `@earendil-works/pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui` and `typebox` to its own copies for extensions; import `Type` from `typebox` | `agent.ts` imports `Type` from `typebox`. No bundled extension carries its own copy of Pi's packages under `resources/pi-extensions/node_modules`. Check the inline factories in `pi-extensions.ts`, and that the app and the extensions share one copy of each Pi class at run time. |

Also check: labels and descriptions (plain, and each names what it reads, what it writes and what it may not do, as `docs/agent-guide.md` recipe 7.2 asks); the parameter schemas against pi-schema's rules (no `Type.Refine`, no codecs, coercion of loose arguments); `details` with the same type across all results of a tool; `usage` for tools that make nested model calls (the argument loop and the Studio tools).

Report a table: tool, what Pi's guide asks, what the code does, the fix. Write the fixes as part B items. Do not change the tools in part A.

### A5. Report

Write `.agents/logs/<date>-subagents-codemode-mcp-tools.md`: what you did, the commands and their results, the evidence paths, and the tables of A2, A3 and A4. Then stop and tell the owner in plain words what you found. Do not start part B until the owner says so.

## 5a. Status (2026-11-15)

A1, A3 and A4 are done, and part of A2 is done. Read `.agents/logs/2026-11-15-subagents-codemode-mcp-tools.md` first. In short:
- The built-in extensions are **not** loaded twice. Drop that check.
- Helper agent = subagent: the same thing. A skill run is different.
- Still open: A2 for Pi's subagent example and the npm packages; the repo-map and agent-guide rows for `C:\dev\pireference`; the terms row in `decisions.md` section 4.
- Part B order: B1 (1, 2, 4, and Studio failures reported as success) → A4 fixes → B3 spike → adapters → H-14. Each B3 adapter is its own phase (L5). Done means the owner runs a real brief (L3).

**Update (2026-11-15, later).** Read `.agents/logs/2026-11-15-harness-lessons-and-knowledge-layers.md`. Part A is complete:
- A2 is done for Pi's example and the npm packages. Recommendation: keep pi-subagent-manager; it is the only one where the app's tools and guard reach a helper.
- The repo-map row, the agent-guide rule for `C:\dev\pireference`, and the terms row in `decisions.md` section 4 are written.
- New for coding agents: `npm run session:start` at the start of every session; the handoff template `.agents/templates/session-handoff.md` and the clean-state list (`docs/agent-guide.md` section 13) at the end.
- New part B items B-I1 (matter brief at session start), B-I2 (run trace `chat/trace.jsonl`), B-I3 (matter handoff note), B-I4 (bounded long tool results; replaces the A4 truncation fix), B-I5 (spawn limit and deadline). B-I2 goes with the one listener per session (B3 part 2, H-25).
- The eight knowledge layers are mapped onto the frozen stores (report section 4). Q-8 (firm knowledgebase) is open; compiled pages are parked.
- Part B still waits for the owner.

**Update (2026-11-15, part B).** The owner started part B. Read `.agents/logs/2026-11-15-part-b-agent-framework.md` and `docs/specs/agent-framework.md` first. Built and tested: B1 defects 1, 2, 4, 5, 6 and the Studio error (H-33 to H-39), the A4 tool fixes, the run trace, the Matter Agent's context strategy, the four helper types, the B2 owners (`docs/harness-build.md` section 1.6). Open, in this order: a live run on a real brief; H-14. H-42 is built as native code, not adapters (owner, 2026-11-15): read `.agents/logs/2026-11-15-native-harness-parts.md` and `docs/specs/native-harness-parts.md`; part B3 below is superseded. H-43 (the Firm Agent, O10) is built: read `.agents/logs/2026-11-15-firm-agent.md`. The knowledge layers are parked; do not take scope from them.

## 6. Part B: build only after the owner says so

### B1. Defects to fix (found by reading the code; not run with a live model)

1. A helper started with `wait: false` starts a new main-agent turn by itself (`pi.sendMessage(..., { triggerTurn: true })`). `agent.ts` listens to Pi events only inside `send()`. So the window does not show that turn, `messages.json` does not keep it, its usage is not recorded, and the chat is not marked busy.
2. Stop calls `session.abort()`. Per pi-subagent-manager's docs, aborting the main turn does not stop helpers. The window says "Stopped by the advocate." while helpers may still run.
3. Helpers cannot be seen in the window; their widget and tree are drawn for Pi's terminal.
4. A helper's tool calls run through the parent's tools, so its writes carry the main session's id. The record cannot tell a helper's write from the main agent's.
5. The comment on `writePermissionPolicy` in `src/main/pi-extensions.ts` still says an "ask" gets the default answer. Since H-12 it is a question.
6. Long options of a select question are cut off on narrow buttons in the chat card (`ExtensionQuestionCard.tsx`); see `.agents/logs/2026-11-15-harness-hardening/extension-question-select.png`.

Write a failing test first for each of 1 to 4.

Add the custom-tool fixes from A4 here, each with a test (for example: a failed Studio call reaches the model and the window as a failure; a reading tool carries `readOnlyHint`; Stop ends a long tool call).

### B2. Overlaps between the bundled extensions and the plan

No command name or tool name is registered twice (`/agents`, `/decisions`, `/checklist`, `/pruner`, `/context`, `/cache`, `/permission-system`). The overlaps:

| Overlap | Facts |
|---|---|
| Active tool list | `setActiveTools` is called by pi-context-decisions (6 places), pi-context-prune (6), pi-subagent-manager (1), pi-permission-system (1). The app checks the active tools only when a session starts. |
| Skill and tool choice | pi-context-decisions chooses skills and can filter tools. It is inert until a decision model is chosen; tool filtering is off by default. The plan's skill registry and tool scope per skill (N1 to N3, Q2, H-5) do the same job. When a decision model is set, it can call OpenAI, OpenRouter or TypeSafe. |
| Context size | Pi's compaction is on (H-2). pi-context-prune is off by default (`enabled: false`); when on, the model sees summaries of earlier tool outputs instead of the outputs. |
| Plans and tasks | pi-checklist keeps a task list; the planner's plan card (O1) is planned. |
| Delegation | pi-subagent-manager starts helpers; the planner, parallel runs and the skill runner (O1, O3, N2) are planned. Its README says two subagent extensions clash on `/agents`. |
| Permission layers | The app's guard, pi-permission-system, and each helper type's allowlist. Helpers load no extension (`subagentExtensions: false`); whether pi-permission-system checks a helper's tool calls is not verified. |
| Built-in extensions | Possibly loaded twice (A3). |

For each overlap, propose which part owns the job, so that one job has one owner (as one fact has one owning file).

### B3. The bundled extensions as native parts

1. **Know who asks.** Pi gives one UI object to every extension of a session (`ExtensionRunner.createContext` returns the same `uiContext`). At load, wrap each extension's handlers, commands and tools (`DefaultResourceLoader` `extensionsOverride`, which pi-subagent-manager also uses) so that they run inside an `AsyncLocalStorage` that holds the extension's id. `extensionUi` reads the id. **Start with a spike** that proves the id survives every `await` from a handler to `ui.select`, for a command, an event handler and a tool. Check first whether Pi in `C:\dev\pireference` already offers a way to know the calling extension.
2. **One listener per session, not per `send()`.** A run starts on Pi's `agent_start` and ends on `agent_settled`. This fixes defect 1 and is H-25. Stop also stops the matter's helpers (defect 2). Helper writes carry the helper's own id (defect 4).
3. **One adapter per bundled extension.** Each UI call of a bundled extension maps to a native form, or the app answers it, or it is dropped. Extensions that show state are drawn from their state or tool results, never from their text screens. Their settings are written by the app, as `writePermissionPolicy` and `writeSubagentPolicy` do now. Their commands are not listed in `/`.

   | Bundled extension | Native form | Feature |
   |---|---|---|
   | pi-permission-system | An approval: "The agent wants to use <tool name in plain words>. Allow once / Allow for this conversation / Refuse / Refuse and say why". Rules edited in Settings, written by the app. | O8, Q2 |
   | pi-checklist | The checklist is the plan card in the chat. "Clear" is a button with the app's own confirmation. | O1 |
   | pi-subagent-manager | Helpers in the Jobs view, with Steer and Stop. Its dialogs are never shown. | O3, O7 |
   | pi-context-usage, pi-cache-graph | A context meter in the chat header, from the session's numbers. | O7 |
   | pi-context-prune, pi-context-decisions | Settings fields written by the app. "Prune now" joins the Compact action. | H-22 |

   The permission example: pi-permission-system 42.0.0 asks `ui.select("Permission Required\ntool : <name>\nrule : *", ["Yes", "Yes, allow tool \"<name>\" for this session", "No", "No, provide reason"])`. The adapter reads the tool name, shows the app's approval card, and maps the advocate's answer back to the extension's own option string.
4. **A completeness test.** It lists every `ctx.ui` call in the pinned vendored bundled extensions and fails when one has no adapter. A new extension version that changes a title or an option fails the test before it ships.
5. **Fallback.** A bundled UI call with no adapter at run time shows the generic card and writes a log entry. It is never answered silently.
6. Then H-14: the `/` list shows the advocate's skills (N3), workflows and installed extensions' commands; bundled commands are not listed.

Specify each part in `docs/specs/` when its work starts, at the depth it needs (lesson L1), and build it in the same piece of work (L5). Update `docs/harness-hardening.md` and `docs/harness-build.md` as items are built.

## 7. Not verified (carry these forward)

- A helper agent with a live model: does it get the app's tools, and are its calls checked by pi-permission-system?
- A permission `ask` from a helper forwarded to the main window through pi-permission-system's forwarding socket.
- H-3 sign-in with a real provider (tested with a faux provider only).

## 8. How to work

- Say in one line what you will do before you start. Give a one-line update every few steps. Close with a short recap that stands alone.
- Write in Simplified Technical English. Facts first. No terms you made up.
- Run the checks of `docs/agent-guide.md` section 8.4 and report the commands with their counts and exit codes. Never write "tests pass" without the output.
- Commit in small steps with clear messages. Push nothing.
- Session records go in `.agents/logs/`. Record commands, results and evidence paths, not reasoning.

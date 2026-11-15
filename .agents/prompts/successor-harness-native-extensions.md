# Successor prompt: Pi reference, assessments, and bundled extensions as native parts

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

### A4. Report

Write `.agents/logs/<date>-subagents-codemode-mcp.md`: what you did, the commands and their results, the evidence paths, and the tables of A2 and A3. Then stop and tell the owner in plain words what you found. Do not start part B until the owner says so.

## 6. Part B: build only after the owner says so

### B1. Defects to fix (found by reading the code; not run with a live model)

1. A helper started with `wait: false` starts a new main-agent turn by itself (`pi.sendMessage(..., { triggerTurn: true })`). `agent.ts` listens to Pi events only inside `send()`. So the window does not show that turn, `messages.json` does not keep it, its usage is not recorded, and the chat is not marked busy.
2. Stop calls `session.abort()`. Per pi-subagent-manager's docs, aborting the main turn does not stop helpers. The window says "Stopped by the advocate." while helpers may still run.
3. Helpers cannot be seen in the window; their widget and tree are drawn for Pi's terminal.
4. A helper's tool calls run through the parent's tools, so its writes carry the main session's id. The record cannot tell a helper's write from the main agent's.
5. The comment on `writePermissionPolicy` in `src/main/pi-extensions.ts` still says an "ask" gets the default answer. Since H-12 it is a question.
6. Long options of a select question are cut off on narrow buttons in the chat card (`ExtensionQuestionCard.tsx`); see `.agents/logs/2026-11-15-harness-hardening/extension-question-select.png`.

Write a failing test first for each of 1 to 4.

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

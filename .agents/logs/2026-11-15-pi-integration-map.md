# Pi integration map, and bundled extensions as native parts

Date: 2026-11-15. Owner's questions: how Pi is integrated (SDK or CLI, JSON events, RPC commands, the SDK examples), how extensions are used, how helper agents get tools and hand back work, and how bundled extensions should appear. Assessment only. Nothing was built.

Sources read: docs.pi.dev `cli-integration`, `json`, `rpc-commands`, the `rpc-extension-ui` text the owner pasted, the list of `packages/coding-agent/examples/sdk`, `src/main/agent.ts`, `src/main/pi-extensions.ts`, and the vendored `pi-subagent-manager` 1.9.0 and `@earendil-works/pi-coding-agent` 1.5.2.

## 1. How Pi is integrated

Open Advocate uses the **SDK, in process**. The Electron main process imports `@earendil-works/pi-coding-agent` and calls `createAgentSession` once per matter (`src/main/agent.ts`, `Agent.start`). No `pi` CLI runs. No subprocess. No JSON mode. No RPC mode.

| Pi integration | What it is | Used here |
|---|---|---|
| SDK | `createAgentSession` in our own Node process; direct objects and callbacks | Yes |
| Print (`pi --print`) | One run in a child process; final text on stdout | No |
| JSON (`pi --mode json`) | One run in a child process; JSONL events on stdout | No |
| RPC (`pi --mode rpc`, or `RpcClient`) | Long-lived child process; JSONL commands on stdin, responses and events on stdout | No |

### 1.1 Events

Pi's SDK events (`session.subscribe`) are the same events that JSON and RPC modes print, before they are written as JSONL. `agent.ts` subscribes only inside `send()` and turns four of them into AG-UI events for the window:

| Pi event | AG-UI event in the window |
|---|---|
| `message_update` with `text_delta` | `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT` |
| `message_end` | `TEXT_MESSAGE_END`; usage; a failed model call becomes `RUN_ERROR` |
| `tool_execution_start` | `TOOL_CALL_START` ("Used tool: name") |
| `tool_execution_end` | `TOOL_CALL_END` |

Not used yet: thinking deltas, tool arguments and results (H-24), `agent_settled` (H-25), compaction events (H-22), `queue_update`, retry events.

### 1.2 Commands

The RPC commands are, in the SDK, method calls on the session. Used: `prompt` (`session.prompt`), `follow_up` (`session.followUp`), `abort` (`session.abort`), `set_model`, `set_thinking_level`, `new_session` (a new `SessionManager`). Not used: `steer` (H-20), `compact` (H-22), `fork`, `get_tree`, `switch_session`, `clone` (H-23), `get_commands` (H-14), `get_session_stats`, `export_html`, `bash` (off by decision 2).

### 1.3 The SDK examples

No example file was copied. The code uses the same API calls as these examples:

| Example | Same calls in our code |
|---|---|
| 06-extensions | Extensions loaded by `DefaultResourceLoader`, plus inline factories (`openadvo-policy` guard) |
| 09-api-keys-and-oauth | `ModelRuntime.create({ authPath, modelsPath })` on the owner's Pi folder |
| 10-settings | `settingsManager.applyOverrides({ compaction: { enabled: true } })` |
| 11-sessions | `SessionManager.continueRecent` / `create`: one file session per matter |
| 12-full-control | Own system prompt; `noTools: "builtin"`; `customTools` = the app's tools; a stub loader in tests |
| 14-codemode-mcp | `createMcpExtension`, `createCodemodeExtension`, `createToolSearchExtension` |

Not used: 13-session-runtime (H-15). 04, 07 and 08 (skills, context files, prompt templates): discovery only (H-16 to H-18).

### 1.4 RPC extension UI

In RPC mode, Pi turns `ctx.ui` calls into `extension_ui_request` lines on stdout. Dialogs (`select`, `confirm`, `input`, `editor`) wait for an `extension_ui_response` on stdin with the same `id`. Notices and status lines expect no response. Pi resolves a dialog with its default answer when its `timeout` ends.

Open Advocate runs no RPC process. It gives the session its own `ExtensionUIContext` object (`extensionUi` in `src/main/pi-extensions.ts`) and binds with `mode: "rpc"`, so extensions behave as they do under an RPC client. H-12 is the in-process form of that subprotocol: a question is the request; `answerExtensionQuestion` is the response; AG-UI over IPC replaces stdin and stdout. Differences from Pi's RPC client: `custom()` is drawn once as text (RPC returns `undefined`); text widgets become status lines; `setTitle` and `set_editor_text` are ignored.

## 2. Extensions

Every matter session loads, through one `DefaultResourceLoader`:

- the inline factories: `openadvo-policy` (blocks Pi's built-in tools), `mcp`, `codemode`, `tool_search`;
- the seven bundled extensions from `resources/pi-extensions` that are turned on;
- the packages the advocate added (Settings → Pi extensions) and files in the app's Pi folder.

Pi gives **one** UI object to every extension of a session. A question does not say which extension asked it.

## 3. Helper agents (pi-subagent-manager)

| Topic | How it works |
|---|---|
| Start | The main agent calls `agent_spawn { path, type, task, wait }`. `/agents fork:<type>` or `fresh:<type>` starts one from the chat. |
| Where it runs | In the same process. The extension calls `createAgentSession` for the child, with the same `ModelRuntime`. |
| Model | The parent's model (`models: null` in the type files the app writes). |
| Tools | `writeSubagentPolicy` writes six type files: allow = every app tool + the manager's control tools; block = Pi's built-in tools. The child gets copies of the parent's tools; each call runs in the **parent's** tool pipeline through a bridge. `subagentExtensions: false`, so a child loads no extension. |
| Handoff in | `fork:` gives the child the parent's conversation; `fresh:` gives only the task. The child's system prompt is its type's instructions plus its path. |
| Handoff out | The child's final answer. With `wait: true` it is the result of `agent_spawn` or `agent_wait`. With `wait: false` it arrives as a message that **starts a new turn** of the main agent (`pi.sendMessage(..., { triggerTurn: true })`). `agent_output` pages a long answer. |
| Coordination | A tree of paths (`/root/...`). Only `architect` may start children among the bundled types. Shared limits on depth and number. `agent_steer` adds direction or resumes; `agent_update` reports progress; `agent_pause` keeps work without an answer; `agent_stop` stops a subtree; a `timeoutMs` (30 s to 5 min) wakes the parent but does not stop the child. |
| Permission questions | pi-permission-system opens a forwarding socket in a session with a UI, so a helper's questions can reach the main window. Not verified with a live model. |
| Durable work | None across a restart. `pi-durable` is not installed (H-29). |

## 4. Defects and gaps found (from the code; not run with a live model)

1. A helper started with `wait: false` starts a main-agent turn outside `send()`. `agent.ts` listens to Pi events only inside `send()`. So the window does not show that turn, `messages.json` does not keep it, its usage is not recorded, and the chat is not marked busy.
2. Stop calls `session.abort()`. Pi's docs for pi-subagent-manager say an abort of the main turn does not stop helpers. The window says "Stopped by the advocate." while helpers can still run.
3. Helpers are not visible in the window. Their widget and tree are drawn for Pi's terminal.
4. A helper's tool calls run through the parent's tools, so its writes carry the main session's id. The record cannot tell a helper's write from the main agent's.
5. The comment on `writePermissionPolicy` in `src/main/pi-extensions.ts` still says an "ask" gets the default answer. Since H-12 it is a question.

## 5. Proposal: bundled extensions are native parts of the harness

Rule: the advocate never sees "an extension", a Pi command name or terminal text for a bundled part. Only extensions the advocate installed use the generic H-12 card, with their name on it.

1. **Know who asks.** Wrap each loaded extension's handlers, commands and tools at load time (`DefaultResourceLoader` `extensionsOverride`, which pi-subagent-manager also uses) and run them inside an `AsyncLocalStorage` that holds the extension's id. `extensionUi` reads the id. A spike must confirm it.
2. **One adapter per bundled extension.** Each UI call of a bundled extension maps to a native form, or the app answers it, or it is dropped. A test lists every `ctx.ui` call in the vendored sources and fails when one has no adapter.

   | Bundled extension | Native form | Feature |
   |---|---|---|
   | pi-permission-system | An approval: "The agent wants to use <tool name in plain words>. Allow once / Allow for this conversation / Refuse / Refuse and say why". Rules edited in Settings, written by the app. | O8, Q2 |
   | pi-checklist | The checklist is the plan card in the chat. Its commands are not listed. "Clear" is a button with the app's own confirmation. | O1 |
   | pi-subagent-manager | Helpers in the Jobs view with Steer and Stop. Its settings dialogs are never shown; the app writes its files, as now. | O3, O7 |
   | pi-context-usage, pi-cache-graph | A context meter in the chat header, from the session's numbers. | O7 |
   | pi-context-prune, pi-context-decisions | Settings fields written by the app. "Prune now" joins the Compact action. | H-22 |

3. **The `/` list (H-14)** shows the advocate's skills (N3), workflows and installed extensions' commands. Bundled commands are not listed.
4. **One listener per session**, not per `send()`. A run starts on Pi's `agent_start` and ends on `agent_settled`. This fixes defect 1 and is H-25. Stop also stops the helpers of the matter (defect 2). Helper writes carry the helper's own id (defect 4).

Suggested order: the spike for item 1 and the listener of item 4; then the permission approval; then the checklist plan card and the Jobs view (Phase 1 features O1 and O7); then the settings fields; then H-14.

## 6. Follow-up questions (same date)

### 6.1 SDK or CLI

Decision 2 (frozen) says the agent is Pi embedded through its SDK. Facts that bear on it:

| Need of Open Advocate | SDK in the main process | Pi CLI as a child process (JSON or RPC) |
|---|---|---|
| Tools that write `matter.db` through `MatterStore` (single writer, decision 4) | Direct calls | The tools run in the child; they must call back to the app, or open the store from a second process |
| Many matters open | One process, one session per matter | One child process per open matter |
| System prompt, resource loader, explicit credential paths, start check of active tools | Objects we construct and read | Command-line flags and RPC commands only |
| Questions and approvals | Direct objects (H-12) | `extension_ui_request` / `extension_ui_response` lines |
| Events | Full events, with cumulative snapshots | JSONL; `message_update` loses its snapshots |
| Shipping | Pi is a library inside Electron's Node | Ship and start a Pi program; manage its processes |
| Isolation | An extension's crash or leak is inside the app | A crash ends only the child; Stop can end the process |
| Runs without the window | Needs our own entry point | Available |

### 6.2 A rebranded Pi CLI

- Pi reads `piConfig` from its own `package.json` when it loads (`dist/config.js`): `APP_NAME`, `CONFIG_DIR_NAME` (default `.pi`), `ENV_AGENT_DIR` = `<NAME>_CODING_AGENT_DIR`. So a rebrand edits Pi's package: a source fork, or a patch of the installed package.
- Bundled extensions name Pi's paths themselves: `PI_CODING_AGENT_DIR` appears 5 times in pi-checklist and once in pi-context-decisions; literal `.pi/` paths appear in six of the seven. After a rebrand, Pi would read `OPENADVO_CODING_AGENT_DIR` and those extensions would still read `PI_CODING_AGENT_DIR`.
- In the SDK, the advocate sees no Pi name unless the app's own text shows it. The app text that names Pi today: the "Sign in to a model provider with Pi first" notice, and Settings → Pi extensions. Sign-in itself needs Pi's program today (decision 16 reads `~/.pi/agent`). Parked: sign-in inside the window.
- Parked: an `openadvo` command for runs without the window, on the same SDK harness code. `agent.ts` and `pi-extensions.ts` already have no Electron import.

### 6.3 Helper agents and subagents

Same thing. "Subagent" is pi-subagent-manager's word; "helper agent" is the word in `docs/` and the code comments. Planned features that also start or scope Pi sessions: the skill runner (N2: one scoped session per skill run), the planner and parallel runs (O1, O3), and side questions (O9).

### 6.4 Overlaps between the bundled extensions and the plan

No command name or tool name is registered twice (`/agents`, `/decisions`, `/checklist`, `/pruner`, `/context`, `/cache`, `/permission-system`).

| Overlap | Facts |
|---|---|
| Active tool list | `setActiveTools` is called by pi-context-decisions (6 places), pi-context-prune (6), pi-subagent-manager (1), pi-permission-system (1). The app checks the active tools only when a session starts. |
| Skill and tool choice | pi-context-decisions chooses skills and can filter tools; it is inert until a decision model is chosen, and tool filtering is off by default. The plan's skill registry and tool scope per skill (N1 to N3, Q2, H-5) do the same job. |
| Context size | Pi's compaction is on (H-2). pi-context-prune is off by default (`enabled: false`); when on, the model sees summaries of earlier tool outputs instead of the outputs. |
| Plans and tasks | pi-checklist keeps a task list; the planner's plan card (O1) is planned. |
| Delegation | pi-subagent-manager starts helpers; the planner and skill runner (O1, O3, N2) are planned. Its README says two subagent extensions clash on `/agents`. |
| Permission layers | The app's guard, pi-permission-system, and each helper type's allowlist. Helpers load no extension (`subagentExtensions: false`); whether pi-permission-system checks a helper's tool calls is not verified. |

### 6.5 How a native form works (permission example)

1. At load, each bundled extension's handlers, commands and tools run inside an `AsyncLocalStorage` that holds the extension's id.
2. The agent calls a tool with an `ask` rule. pi-permission-system 42.0.0 calls `ui.select("Permission Required\ntool : <name>\nrule : *", ["Yes", "Yes, allow tool \"<name>\" for this session", "No", "No, provide reason"])`.
3. `extensionUi` reads the id. The adapter for pi-permission-system reads the tool name and builds the app's approval: the tool's plain label, the matter, and four answers.
4. The window shows the app's approval card.
5. The advocate's answer maps back to the extension's own option string.
6. A test runs the adapter on every `ctx.ui` call in the pinned vendored version. A new version that changes a title or an option fails the test before it ships.

Extensions that show state (pi-checklist, pi-context-usage, pi-cache-graph, the helper widget) are drawn from their state or their tool results, not from their text screens. Their settings are written by the app, as `writePermissionPolicy` and `writeSubagentPolicy` do now.

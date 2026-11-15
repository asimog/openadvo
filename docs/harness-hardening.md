# Harness hardening

Owner's instruction, 2026-11-15: make every Pi feature available, add extension support so the advocate can add Pi extensions, install six named extensions, and keep a separate hardening plan. This file owns the hardening items (ids H-n), the extension policy, and the status of each Pi feature in Open Advocate. The evidence is the Pi SDK review in [../.agents/logs/2026-11-15-pi-sdk-review.md](../.agents/logs/2026-11-15-pi-sdk-review.md).

Status words: **built** (in the code and tested), **open** (planned, not built), **owner** (needs an owner decision first).

## 1. Defects from the review

| Id | Defect | Fix | Status |
|---|---|---|---|
| H-1 | Two quick sends could start two runs: `busy` was set after an await. | `send()` sets `busy` before the first await and clears it on every early return. A message sent during a run becomes a Pi follow-up. | built |
| H-2 | The conversation grew without limit: compaction was off. | Compaction is on (Pi's default) for every session. | built |
| H-3 | The first model choice was kept until restart, so "no model" stayed until restart. | Resolve the model again when the cached result is empty, and when credentials change. | open |
| H-4 | The system prompt said "Your tools are read only" and then listed write and filing tools. | The prompt now says that the writing tools make only proposals, records or filing steps. | built |
| H-5 | Every session has every tool, including the portal and filing tools. | A tool scope per skill run (features N3, Q2). The chat session keeps the filing tools behind the two confirmations. | open |
| H-6 | Pi's install telemetry is at its default (on). Pi's docs say it sends provider attribution headers. | A setting in the window that shows the value and lets the advocate change it. Fact only; no recommendation. | open |
| H-7 | A code comment said the agent never uses `~/.pi`. Credentials and models do come from `~/.pi/agent` (decision 16). | Comment corrected in `src/main/agent.ts`. | built |
| H-8 | `decisions.md` said five built-in workflows. The code has six. | Corrected in [decisions.md](decisions.md). | built |

## 2. Pi features in Open Advocate

| Id | Pi feature | In Open Advocate | Status |
|---|---|---|---|
| H-10 | Extensions (`DefaultResourceLoader`) | Every non-confidential session loads the enabled bundled extensions, the packages the advocate added, and extensions in the application's Pi folder. | built |
| H-11 | Packages (`DefaultPackageManager`) | Settings → Pi extensions: add from npm, git, a URL or a folder; remove; turn a bundled extension on or off. A change reopens idle conversations. | built |
| H-12 | Extension UI: `notify`, `setStatus`, text `setWidget`, `custom` | A notice in the matter's chat; status lines above the chat log; a terminal screen rendered once as text. | built |
| H-13 | Extension UI: `select`, `confirm`, `input`, `editor` | Each question becomes an AG-UI interrupt that the advocate answers in the chat. Until then, the question gets its default answer and a notice says so. | open |
| H-14 | Extension commands (`/name`) | Typed in the chat, they run through `session.prompt`, with or without a model. | built |
| H-15 | Command list in the composer | `/` lists extension commands, Pi skills and prompt templates (with feature N4). | open |
| H-16 | Command actions: new session, fork, tree navigation, switch session | Bind `commandContextActions` through `AgentSessionRuntime`, so an extension command can fork or start a conversation. | open |
| H-17 | Pi skills (`SKILL.md`) | Discovered from the application's Pi folder. Open Advocate's own skills (decision 14) are built as Pi skills plus a tool scope per skill (H-5). | discovery built; app skills open |
| H-18 | Prompt templates | Discovered from the application's Pi folder. The built-in workflows move to prompt templates. | discovery built; move open |
| H-19 | Context files (`AGENTS.md`) | Discovered from the application's Pi folder. A per-matter context file (matter memory) is added to the prompt. | discovery built; matter file open |
| H-20 | MCP, codemode, tool search | Loaded for non-confidential matters. A settings view for MCP servers. | loaded built; settings open |
| H-21 | Steering (`steer`) | A Steer action beside Stop: the message enters after the current tool calls. | open |
| H-22 | Follow-up (`followUp`) | A message sent during a run is queued as a follow-up. | built |
| H-23 | Compaction | Automatic compaction on. A manual "Compact" action, and a notice when compaction runs. | automatic built; rest open |
| H-24 | Session tree, fork, branch, import and export | The chat history as a tree, fork from a message, return to a branch. | open |
| H-25 | Thinking deltas, tool arguments and results | Shown in the chat, folded by default. | open |
| H-26 | Retry settings and `agent_settled` | The run ends on `agent_settled`, so retries and queued work finish before the window says "done". | open |
| H-27 | Scoped models and a model per role | With feature O7. | open |
| H-28 | Pi themes | Not used: themes style Pi's terminal interface. Extensions get Pi's dark theme for text they render. | not applicable |
| H-29 | Pi's built-in tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls` | Off in every session and every helper agent (section 3). Turning them on would reverse decision 2 and let a tool write outside the matter store (decision 4). | owner |
| H-30 | `pi-durable`, `chord` | Not installed. pi-durable's README calls it experimental, with an API that changes without notice. | owner |
| H-31 | Fixes on Pi `main` not yet released (abort mid-batch, "Connection closed" retries, tool schemas) | Upgrade the pinned version when Pi releases them, and run the tests of section 4. | open |

## 3. Extension policy

1. **Bundled extensions.** These six are vendored by `npm run vendor:extensions`, at exact npm versions. The script checks each registry integrity hash in `scripts/pi-extensions.manifest.json`. They install with no install scripts and no peer packages.

   | Extension | Version | Adds |
   |---|---|---|
   | pi-subagent-manager | 1.9.0 | Helper agents in parallel. Tools `agent_spawn`, `agent_wait`, `agent_steer` and others; command `/agents`. |
   | pi-context-decisions | 4.0.0 | Picks which Pi skills to show the model for the task. Command `/decisions`. |
   | pi-checklist | 3.3.0 | A task checklist for the session. Tools `checklist_create`, `checklist_read`, `checklist_update`; command `/checklist`. |
   | pi-context-prune | 2.2.0 | Summarises finished tool output and prunes it from the context. Tools `context_tree_query`, `context_prune`; command `/pruner`. |
   | pi-context-usage | 2.1.0 | Command `/context`: what fills the context window. |
   | pi-cache-graph | 1.2.1 | Command `/cache`: cache use over the session. |

2. **Added extensions.** The advocate adds them in Settings. Pi's package manager installs them in the application's Pi folder and records them in its `settings.json`. npm and git sources need npm or git on the computer. A local folder always works. The panel says that an extension runs code on the computer, and Pi's own docs say to review a package's source before install.
3. **Pi's built-in tools stay off.** Sessions start with `noTools: "builtin"` and an exclude list. A host guard extension blocks any call to a built-in tool. The start check refuses a session that has a built-in tool, or that lacks one of the application's tools.
4. **Helper agents (pi-subagent-manager).** On every start, the application writes a policy into its Pi folder: `toolFiltering: "allowed"`, no extension reloads inside helpers, and no housekeeping model. It also writes an overlay for each bundled agent type, which allows only the application's tools and the manager's controls, blocks Pi's built-in tools, and inherits the chat's model.
5. **Confidential matters (hard rule 9).** A confidential matter's session loads only the host guard: no extension, no MCP, no codemode. A session that opened with extensions refuses to run if the matter later becomes confidential, and asks for a new conversation.
6. **Facts recorded, not evaluated:**
   - pi-context-prune and pi-checklist keep their preferences under Pi's agent folder, which is `~/.pi/agent` unless `PI_CODING_AGENT_DIR` is set. They share those files with the owner's own Pi.
   - pi-context-prune's summariser uses the chat's model unless its settings name another.
   - pi-context-decisions has no decision model until one is configured.
   - pi-subagent-manager's bundled agent types name coding models in `modelSuggestions`. The overlay sets `models: null`, so helpers use the chat's model.
7. **What does not work in the window:** interactive terminal screens (dialogs and editors inside `/agents`, `/checklist` and `/pruner`). They show once as text, or as a notice that they need Pi's terminal interface (H-13).

## 4. Tests

| Test | Checks | Command |
|---|---|---|
| `tests/unit/pi-extensions.test.ts` | The six load with no error, with their tools and commands; a confidential matter loads only the guard; a session has no built-in tool; a bundled extension turns off; the helper policy files. | `node --test tests/unit/pi-extensions.test.ts` |
| `tests/e2e/extensions.spec.ts` | Settings lists the six and turns one off and on; `/context` typed in a matter's chat shows its report. | `npx playwright test tests/e2e/extensions.spec.ts` |
| `tests/e2e/app.spec.ts` | The bridge functions; the session has every application tool, no built-in tool, and the bundled extension tools. | `npx playwright test tests/e2e/app.spec.ts` |

Still needed: a unit test of the `Agent` class (two quick sends, follow-up, model re-resolution: H-1, H-3), and a live test of a helper agent with a real model.

## 5. Order

1. H-3, then the `Agent` unit test.
2. H-13 and H-15: questions from extensions, and the `/` list.
3. H-21, H-23, H-25, H-26: steering, compaction actions, run detail, settled runs.
4. H-17, H-18, H-19 with Phase 1 features N1 to N4: the skill registry on Pi skills, workflows as prompt templates, the matter context file.
5. H-5 with the skill runner.
6. H-16, H-24: session runtime, fork and tree.
7. H-20, H-6: MCP servers and telemetry in Settings.
8. H-31 at each Pi release.

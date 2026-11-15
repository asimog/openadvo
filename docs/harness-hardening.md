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
| H-10 | Extensions (`DefaultResourceLoader`) | Every session loads the enabled bundled extensions, the packages the advocate added, and extensions in the application's Pi folder. | built |
| H-11 | Packages (`DefaultPackageManager`) | Settings → Pi extensions: add from npm, git, a URL or a folder; remove; turn a bundled extension on or off. A change reopens idle conversations. | built |
| H-12 | Extension UI: `notify`, `setStatus`, text `setWidget`, `custom` | A notice in the matter's chat; status lines above the chat log; a terminal screen rendered once as text. | built |
| H-13 | Extension UI: `select`, `confirm`, `input`, `editor` | Each question becomes an AG-UI interrupt that the advocate answers in the chat. Until then, the question gets its default answer and a notice says so. | open |
| H-14 | Extension commands (`/name`) | Typed in the chat, they run through `session.prompt`, with or without a model. | built |
| H-15 | Command list in the composer | `/` lists extension commands, Pi skills and prompt templates (with feature N4). | open |
| H-16 | Command actions: new session, fork, tree navigation, switch session | Bind `commandContextActions` through `AgentSessionRuntime`, so an extension command can fork or start a conversation. | open |
| H-17 | Pi skills (`SKILL.md`) | Discovered from the application's Pi folder. Open Advocate's own skills (decision 14) are built as Pi skills plus a tool scope per skill (H-5). | discovery built; app skills open |
| H-18 | Prompt templates | Discovered from the application's Pi folder. The built-in workflows move to prompt templates. | discovery built; move open |
| H-19 | Context files (`AGENTS.md`) | Discovered from the application's Pi folder. A per-matter context file (matter memory) is added to the prompt. | discovery built; matter file open |
| H-20 | MCP, codemode, tool search | Loaded in every session. A settings view for MCP servers. | loaded built; settings open |
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
| H-32 | Side questions (replaces pi-btw) | [harness-build.md](harness-build.md) HB-1. | open |
| H-33 | Browser for the advocate and the agent | [harness-build.md](harness-build.md) HB-2. | open |
| H-31 | Fixes on Pi `main` not yet released (abort mid-batch, "Connection closed" retries, tool schemas) | Upgrade the pinned version when Pi releases them, and run the tests of section 4. | open |

## 3. Extension policy

The extension policy, the bundled extensions, the permission policy and the helper-agent policy are in [harness-build.md](harness-build.md) section 1.

## 4. Tests

| Test | Checks | Command |
|---|---|---|
| `tests/unit/pi-extensions.test.ts` | The seven load with no error, with their tools and commands; the permission policy and its repair on start; with a faux model, an allowed tool runs, a denied tool is withheld, a credential path is refused and logged in the app's folder; a bundled extension turns off; the helper policy files. | `node --test tests/unit/pi-extensions.test.ts` |
| `tests/e2e/extensions.spec.ts` | Settings lists the seven and turns one off and on; the app writes the permission policy in its own Pi folder and sets `PI_CODING_AGENT_DIR` there; `/context` typed in a matter's chat shows its report. | `npx playwright test tests/e2e/extensions.spec.ts` |
| `tests/e2e/app.spec.ts` | The bridge functions; the session has every application tool, no built-in tool, and the bundled extension tools. | `npx playwright test tests/e2e/app.spec.ts` |

Still needed: a unit test of the `Agent` class (two quick sends, follow-up, model re-resolution: H-1, H-3), and a live test of a helper agent with a real model.

## 5. Order

1. H-3, then the `Agent` unit test.
2. H-13 and H-15: questions from extensions (this also turns pi-permission-system `ask` rules into real questions), and the `/` list.
3. HB-1 side questions and HB-2 browser, in the order of [harness-build.md](harness-build.md).
4. H-21, H-23, H-25, H-26: steering, compaction actions, run detail, settled runs.
5. H-17, H-18, H-19 with Phase 1 features N1 to N4: the skill registry on Pi skills, workflows as prompt templates, the matter context file.
6. H-5 with the skill runner.
7. H-16, H-24: session runtime, fork and tree.
8. H-20, H-6: MCP servers and telemetry in Settings.
9. H-31 at each Pi release.

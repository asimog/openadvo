# Harness hardening

Owner's instruction, 2026-11-15: make every Pi feature available, add extension support so the advocate can add Pi extensions, install six named extensions, and keep a separate hardening plan. This file owns the hardening items (ids H-n), the extension policy, and the status of each Pi feature in Open Advocate. The evidence is the Pi SDK review in [../.agents/logs/2026-11-15-pi-sdk-review.md](../.agents/logs/2026-11-15-pi-sdk-review.md).

Status words: **built** (in the code and tested), **open** (planned, not built), **owner** (needs an owner decision first).

## 1. Defects from the review

| Id | Defect | Fix | Status |
|---|---|---|---|
| H-1 | Two quick sends could start two runs: `busy` was set after an await. | `send()` sets `busy` before the first await and clears it on every early return. A message sent during a run becomes a Pi follow-up. | built |
| H-2 | The conversation grew without limit: compaction was off. | Compaction is on (Pi's default) for every session. | built |
| H-3 | The first model choice was kept until restart, so "no model" stayed until restart. With no model, Pi's agent holds a stand-in model named `unknown/unknown`, so the "no model" check never matched. | "No model" is never cached. A change in the size or time of `auth.json` or `models.json` makes Pi read them again and the model is chosen again. An open session with no model, or with a model whose provider lost its credentials, takes the current model before its next run, with a notice in the chat. The stand-in model counts as no model. | built |
| H-4 | The system prompt said "Your tools are read only" and then listed write and filing tools. | The prompt now says that the writing tools make only proposals, records or filing steps. | built |
| H-5 | Every session has every tool, including the portal and filing tools. | A tool scope per skill run (features N2, Q2): a run gets only its skill's tools, through the tool policy; no skill may have a portal or filing tool. The chat session keeps the filing tools behind the two confirmations. | built |
| H-6 | Pi's install telemetry is at its default (on). Pi's docs say it sends provider attribution headers. | A setting in the window that shows the value and lets the advocate change it. Fact only; no recommendation. | open |
| H-7 | A code comment said the agent never uses `~/.pi`. Credentials and models do come from `~/.pi/agent` (decision 16). | Comment corrected in `src/main/agent.ts`. | built |
| H-8 | `decisions.md` said five built-in workflows. The code has six. | Corrected in [decisions.md](decisions.md). | built |

## 2. Pi features in Open Advocate

| Id | Pi feature | In Open Advocate | Status |
|---|---|---|---|
| H-9 | Extensions (`DefaultResourceLoader`) | Every session loads the enabled bundled extensions, the packages the advocate added, and extensions in the application's Pi folder. | built |
| H-10 | Packages (`DefaultPackageManager`) | Settings → Pi extensions: add from npm, git, a URL or a folder; remove; turn a bundled extension on or off. A change reopens idle conversations. | built |
| H-11 | Extension UI: `notify`, `setStatus`, text `setWidget`, `custom` | A notice in the conversation; status lines above the chat log; a terminal screen rendered once as text. | built |
| H-12 | Extension UI: `select`, `confirm`, `input`, `editor` | Each question is an AG-UI interrupt object, sent in the CUSTOM event `EXTENSION_QUESTIONS_EVENT`, because the run waits in the middle for the answer. A card in the chat takes the answer (`answerExtensionQuestion`). Dismiss, Stop, a new conversation, the extension's abort signal or its timeout give the default answer; a notice says when time ran out. The tool policy's `ask` rule uses the same queue, as an approval card. Sessions are closed with `session_shutdown`, so extensions close their sockets. | built |
| H-13 | Extension commands (`/name`) | Typed in the chat, they run through `session.prompt`, with or without a model. | built |
| H-14 | Command list in the composer | `/` lists Open Advocate's skills and the typed commands (`/btw`, `/context`, `/cost`) (feature N3). Pi extension commands, Pi skills and prompt templates are not listed yet. | skills built; extension commands open |
| H-15 | Command actions: new session, fork, tree navigation, switch session | Bind `commandContextActions` through `AgentSessionRuntime`, so an extension command can fork or start a conversation. | open |
| H-16 | Pi skills (`SKILL.md`) | Discovered from the application's Pi folder. Open Advocate's own skills (decision 14) are Pi skill files with Open Advocate's fields, read with Pi's frontmatter parser, plus a tool scope per skill (H-5). | built |
| H-17 | Prompt templates | Discovered from the application's Pi folder. The built-in workflows move to prompt templates. | discovery built; move open |
| H-18 | Context files (`AGENTS.md`) | Discovered from the application's Pi folder. A per-matter context file (matter memory) is added to the prompt. | discovery built; matter file open |
| H-19 | MCP, codemode, tool search | Loaded in every session. Rules per MCP server and per MCP tool in the policy; one Settings row per server in `mcp.json` and one for every MCP tool. A full server manager view is open. | loaded and policy built; manager view open |
| H-20 | Steering (`steer`) | A Steer action beside Stop: the message enters after the current tool calls. Helpers have Steer from the status line and through `steer_helper`; the Matter Agent's own steer is open. | helper steer built; agent steer open |
| H-21 | Follow-up (`followUp`) | A message sent during a run is queued as a follow-up. | built |
| H-22 | Compaction | Automatic compaction on, with a strategy per agent kind: tool-result clearing, summaries with refs and a summary form ([specs/agent-framework.md](specs/agent-framework.md) section 7). Compact now in the status line. A notice when automatic compaction runs is open. | manual and per kind built; automatic notice open |
| H-23 | Session tree, fork, branch, import and export | The chat history as a tree, fork from a message, return to a branch. | open |
| H-24 | Thinking deltas, tool arguments and results | Shown in the chat, folded by default. | open |
| H-25 | Retry settings and `agent_settled` | One listener per session: a run starts on `agent_start` and ends on `agent_settled`, so retries, queued work and turns that a helper's result starts are runs the window sees. | built |
| H-26 | Scoped models and a model per role | With feature O5. | open |
| H-27 | Pi themes | Not used: themes style Pi's terminal interface. Extensions get Pi's dark theme for text they render. | not applicable |
| H-28 | Pi's built-in tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls` | Off in every session and every helper agent (section 3). Turning them on would reverse decision 2 and let a tool write outside the matter store (decision 4). | owner |
| H-29 | `pi-durable`, `chord` | Not installed. pi-durable's README calls it experimental, with an API that changes without notice. | owner |
| H-30 | Side questions | [harness-build.md](harness-build.md) HB-1; feature O9. | built |
| H-31 | Browser for the advocate and the agent | [harness-build.md](harness-build.md) HB-2; features S10 to S12. | open |
| H-32 | Fixes on Pi `main` not yet released (abort mid-batch, "Connection closed" retries, tool schemas) | Upgrade the pinned version when Pi releases them, and run the tests of section 4. | open |

## 3. Extension policy

The extension policy, the bundled extensions, the permission policy and the helper-agent policy are in [harness-build.md](harness-build.md) section 1.

## 4. Tests

| Test | Checks | Command |
|---|---|---|
| `tests/unit/pi-extensions.test.ts` | The placeholder is the only bundled extension, with one command and no tool; it turns off; its notice and question reach the chat; no name of the seven former packages is left in the code. | `node --test tests/unit/pi-extensions.test.ts` |
| `tests/e2e/extensions.spec.ts` | Settings lists the placeholder and turns it off and on; Tool permissions saves a rule to the policy file; `/placeholder` and `/placeholder ask` in a matter's chat; Yes, Dismiss, a wrong answer refused, Stop closes a waiting question. | `npx playwright test tests/e2e/extensions.spec.ts` |
| `tests/unit/extension-questions.test.ts` | Extension questions: the interrupt shape, the answer checks, the extension's own option string, dismiss, timeout with a notice, abort, and cancel. | `node --test tests/unit/extension-questions.test.ts` |
| `tests/unit/agent.test.ts` | The `Agent` class with a faux model: no model at first, then sign-in gives the open session the model with no restart; removing the credentials empties the model list; two quick sends start one run; a message sent during a run is a follow-up that the model reads in the same run. | `node --test tests/unit/agent.test.ts` |
| `tests/unit/agent-runs.test.ts` | With a faux model: a turn that an extension starts is a run (shown, saved, counted); a nested write carries `<session id>/<parent call id>`; a failed Studio call is an error and the trace records it; Stop ends a tool call that does not return; long results are cut with a hint; reading tools are read-only, writers sequential; the context strategy is loaded. | `node --test tests/unit/agent-runs.test.ts` |
| `tests/unit/tool-policy.test.ts` | Rules and fixed denials; MCP rules; the policy file; deny with a log that has no arguments; ask with each answer; Stop refuses a waiting call. | `node --test tests/unit/tool-policy.test.ts` |
| `tests/unit/helpers.test.ts` | A helper's tools, nested ids and result; the policy on helper calls; parallel helpers and the limit; spawn rights; Stop. | `node --test tests/unit/helpers.test.ts` |
| `tests/unit/plan.test.ts` | The plan; the context meter; Compact now. | `node --test tests/unit/plan.test.ts` |
| `tests/unit/agent-context.test.ts` | Tool-result clearing per agent kind and the matter summary form. | `node --test tests/unit/agent-context.test.ts` |
| `tests/e2e/native-policy.spec.ts` | A deny with a text line and a trace line; the tool hidden next time; an ask with the query and each choice; one approval at a time; the party rule on and off; the background-helper timeout; Settings saves a rule. | `npx playwright test tests/e2e/native-policy.spec.ts` |
| `tests/e2e/native-helpers.spec.ts` | A foreground helper's progress and result; a background helper using the parent's tools; two background helpers and one Final Recap; Use results; Steer and Stop; Stop on the chat; the wait limit; an interruption after a restart. | `npx playwright test tests/e2e/native-helpers.spec.ts` |
| `tests/e2e/native-plan.spec.ts` | The panel, statuses, dependencies, subtasks, tags; the fold; Clear plan; the rules; an item added by typing; the strength setting; a restart. | `npx playwright test tests/e2e/native-plan.spec.ts` |
| `tests/e2e/native-context.spec.ts` | `/context`, `/cost`, the run's cost line; a summary with a ref recalled by `recall_result`; Compact now; the CSV. | `npx playwright test tests/e2e/native-context.spec.ts` |
| `tests/e2e/app.spec.ts` | The bridge functions; the session has every application tool, no built-in tool, and the bundled extension tools. | `npx playwright test tests/e2e/app.spec.ts` |
| `tests/unit/skill-runner.test.ts`, `tests/unit/side-questions.test.ts` | Skill runs with a faux model: the scoped tools (H-5), the gate, approval points, refusals, parallel runs, resume; a side thread with reading tools only. | `node --test tests/unit/skill-runner.test.ts tests/unit/side-questions.test.ts` |
| `tests/e2e/phase1.spec.ts` | The phase 1 exit path in the window, the navigation and the Review Inbox ([specs/harness-and-stores.md](specs/harness-and-stores.md) section 7). | `npx playwright test tests/e2e/phase1.spec.ts` |

Still needed: live model runs of the helpers, the approvals, the plan, the summaries and the Firm Agent, and the owner's exit (lesson L3).

## 5. Order

1. H-14: the `/` list, after the B3 adapters (section 6).
2. HB-1 side questions and HB-2 browser, in the order of [harness-build.md](harness-build.md).
3. H-20, H-22, H-24, H-25: steering, compaction actions, run detail, settled runs.
4. H-16, H-17, H-18 with features N1 to N3: the skill registry on Pi skills, workflows as prompt templates, the matter context file.
5. H-5 with the skill runner.
6. H-15, H-23: session runtime, fork and tree.
7. H-19, H-6: MCP servers and telemetry in Settings.
8. H-32 at each Pi release.

## 6. Part B: defects and the agent framework

From the part B work of 2026-11-15 ([../.agents/logs/2026-11-15-part-b-agent-framework.md](../.agents/logs/2026-11-15-part-b-agent-framework.md)). The framework is specified in [specs/agent-framework.md](specs/agent-framework.md).

| Id | Defect or item | Fix | Status |
|---|---|---|---|
| H-33 | A helper started with `wait: false` starts a main turn by itself; the window did not see it, did not save it and did not count its usage. | H-25: one listener per session. | built |
| H-34 | Stop aborted the main turn only; helpers kept running. | Stop on the chat stops every helper, foreground or background, and the notice says how many. A helper's own Stop and Steer are in the status line's menu. | built |
| H-35 | A helper's writes carried the main session's id; `propose_issue`, `add_authority` and the memorandum write carried none. | Every write records `<session id>`, or `<session id>/<parent call id>` for a call made by another tool. | built |
| H-36 | A failed Studio call was returned as text, so the model and the window saw a success. | The call throws; Pi reports an error. | built |
| H-37 | The tools did not follow Pi's extension guide. | `StringEnum`, `readOnlyHint`, `executionMode: "sequential"`, Stop ends a call at once, long results cut at Pi's limits with a hint. | built |
| H-38 | The comment on `writePermissionPolicy` said an `ask` gets the default answer. | Corrected: it is a question. | built |
| H-39 | Long options of a select question were cut off on narrow buttons. | Options wrap inside their buttons. | built |
| H-40 | The run trace: what each run did, for the Jobs view and tests. | `chat/trace.jsonl`, one line per run start, tool call, compaction and run end; no arguments or results. | built |
| H-41 | Helper types for coding work with every application tool. | Four Open Advocate types with their own allowlists and limits, run natively. | built |
| H-42 | The bundled extensions as native parts. | The owner chose native code over adapters: the tool policy with deny-hiding, the party rule and MCP rules; helpers with background jobs, fork context, Steer, Stop and Final Recap; the plan panel; the context meter, summaries and `recall_result`; cost, `/cost` and the CSV; a placeholder extension ([specs/native-harness-parts.md](specs/native-harness-parts.md)). | built |
| H-43 | The Firm Agent (feature O10). | Its own session and folder, six firm tools, the firm context strategy, handoffs through the advocate, the panel on Home ([specs/agent-framework.md](specs/agent-framework.md) section 2.1). | built |

# Harness build

Owner's instructions, 2026-11-15. This file owns how the agent harness is built:
- the Pi folders and credentials;
- the extensions;
- the native harness parts: the tool policy, the helpers, the plan and the context meter;
- the extension interface in the window;
- HB-1 (side questions, built) and HB-2 A (the built-in browser, built).

The defect list and the status of each Pi feature are in [harness-hardening.md](harness-hardening.md). The decisions are 22 to 25 in [decisions.md](decisions.md).

## 1. How the harness is built today

### 1.1 Pi in the application

- Pi (`@earendil-works/pi-coding-agent` 1.5.2) runs in the Electron main process. One session per open matter, saved in `<matter>/chat/pi` (`src/main/agent.ts`).
- **Pi's agent folder is the application's own folder,** `<userData>/pi-agent` (decision 22). At start, `src/main/index.ts` reads the owner's Pi folder first (normally `~/.pi/agent`). It then sets `PI_CODING_AGENT_DIR` to the application's folder. Every extension that uses Pi's `getAgentDir()` therefore keeps its settings and logs in the application's folder.
- **Model credentials and models** are still read from the owner's Pi folder (decision 16): `ModelRuntime.create({ authPath: <owner>/auth.json, modelsPath: <owner>/models.json })`. Pi's default model is read from `<owner>/settings.json`.
- **Resources.** Each session uses Pi's `DefaultResourceLoader` in the application's folder, with a file-backed `SettingsManager`. It loads:
  - the bundled placeholder and the packages the advocate added;
  - Pi skills, prompt templates and context files;
  - MCP, codemode and tool search.
- **Tools.** `noTools: "builtin"` and an exclude list keep Pi's built-in tools (`read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`, `ls`) off. The application's own tools come in as `customTools`. The start check refuses a session that lacks one of the application's tools or has a built-in tool.
- **Run behaviour.** Compaction is on. A message sent while the agent works is queued as a Pi follow-up. An extension command (`/name`) runs with or without a model. The token budget per matter still applies.
- **No confidential distinction** (decision 24). Every matter uses the chosen model, loads the extensions and may search the web. The matter store keeps a `confidential` column that nothing reads.

### 1.2 Extensions

- **Bundled.** Each folder of `extensions/` in the application is a Pi package. Today there is one: `extensions/placeholder` (`openadvo-placeholder` 1.0.0). It adds the command `/placeholder` and no tool, so it adds nothing to any context. It tests the extension system: loading, a command, a notice, a question, and turning a bundled extension off ([specs/native-harness-parts.md](specs/native-harness-parts.md) section 6). The build ships `extensions/` beside the application code (`electron-builder.yml`).
- **Added.** The advocate adds packages in Settings → Pi extensions, from npm, git, a URL or a folder. Pi's package manager installs them in the application's folder and records them in its `settings.json`. npm and git sources need npm or git on the computer. A change reopens idle conversations.
- **Not bundled any more.** The seven packages bundled until 2026-11-15 became native parts or were dropped (section 1.3). @narumitw/pi-btw was assessed and removed earlier: outside Pi's terminal it only answers "/btw requires interactive TUI mode". HB-1 provides side questions instead.

### 1.3 Native harness parts

The specification is [specs/native-harness-parts.md](specs/native-harness-parts.md); the agent kinds are in [specs/agent-framework.md](specs/agent-framework.md).

| Part | Code | Where the advocate sees it |
|---|---|---|
| Tool policy (decision 23): allow, ask or deny per tool; deny hides a tool; built-in tools and credential paths always denied; party-name and MCP rules; review log; trace lines | `src/main/tool-policy.ts`; the hook `openadvo-policy` in every session | Settings → Tool permissions; an approval card with the query, URL or field |
| Helpers: four types, foreground and background jobs, fork context, progress, questions, Steer, Stop, paged output, waiting results, Final Recap, restart record, cost | `src/main/helpers.ts`, `src/main/helper-types.ts`; the tools `start_helper`, `helper_output`, `stop_helper`, `steer_helper`; `HelperActivity` in `src/renderer/src/ChatActivity.tsx` | One card per helper in the chat, with its own tool calls; the status line's Helpers menu; Use results |
| Plan: the agent's task list for long work, with dependencies, subtasks and tags | `src/main/plan.ts`; the tools `plan_set`, `plan_update` | The plan panel above the chat; its fold to the status line; Clear plan; Settings → Plan |
| Context meter, cache and cost, Compact now | `Agent.setMeter`, `Agent.compact`, `contextReport`, `costReport`, `costCsv`, `costSummaryFromTrace` in `src/main/agent.ts`; `ContextPanel` in `src/renderer/src/ChatActivity.tsx` | The Context tab (OpenCode style); `/context`; `/cost`; "Export cost CSV" |
| Context strategy per agent kind: tool-result clearing, summaries with refs, `recall_result`, and the summary form | `src/main/agent-context.ts` | A text line when results are summarised |

**Policy file.** `<userData>/tool-policy.json`, written with defaults on first start: `{ "default": "allow", "tools": {} }`. The review log is `<userData>/logs/tool-policy.jsonl`: every deny and every ask with its answer, never the arguments. Pi's built-in tools and a call whose arguments name `auth.json`, `.env`, `.ssh/`, `manifest-signing.key` or `models.json` are refused whatever the file says. A deny also hides the tool when a conversation opens. An MCP tool has the rule `mcp__<server>__*` (or `mcp__*`); Settings lists one row for each server in `<userData>/pi-agent/mcp.json` and one for every MCP tool.

**Helper files.** `<matter>/chat/helpers.json` records each helper. `<matter>/chat/helpers/<id>.txt` holds its partial or full output. Each helper's Pi session is a file under `<matter>/chat/helpers/`. On reopen, a helper that was running shows as interrupted and never restarts.

**Cost.** `chat/trace.jsonl` has a `run_end` line per run and a `helper_end` line per helper, with input, output, cache reads, cache writes, the hit percentage and the cost. `/cost` and "Export cost CSV" read those lines.

### 1.4 One owner for each job

| Job | Owner |
|---|---|
| Which tools may run | The tool policy (section 1.3). Helper calls pass the same hook. |
| Which skill and which tools a task gets | The skill registry and the tool scope per skill (N1 to N3, Q2, H-5): `src/main/skills.ts`, `src/lib/skills/`, `src/main/skill-runner.ts`. |
| Context size | Pi's compaction with the strategy per agent kind; summaries of old tool results with refs; Compact now. |
| Plans and tasks | The plan (`plan_set`, `plan_update`); the planner (O1) builds on it. |
| Delegation | Native helpers (`start_helper`), foreground or background. Skill runs and the planner are not helpers. |
| Codemode and MCP | Pi's built-in extensions; codemode turns on by itself when an MCP server with codemode exposure connects. Helper types do not include `codemode` or MCP tools. MCP calls follow the policy's MCP rules. |
| What a run did | The run trace `chat/trace.jsonl`, the Context tab, `/context` and `/cost`. |

### 1.5 The extension interface in the window

Extensions bind with `mode: "rpc"` and the application's UI context (`extensionUi` in `src/main/pi-extensions.ts`):

| Extension call | In the window |
|---|---|
| `notify` | A notice in the conversation (multi-line notices keep their lines) |
| `setStatus` and a text `setWidget` | Status lines above the chat log |
| `custom` (a terminal screen) | Rendered once at 100 columns as text. It cannot be operated. |
| `select`, `confirm`, `input`, `editor` | A question card, "An extension asks"; the extension waits for the answer. Dismiss, Stop or a timeout gives the default answer (H-12). The tool policy's approvals use the same queue with the card "Approval needed". |

### 1.6 Files

| Path | Holds |
|---|---|
| `src/main/agent.ts` | Sessions of both agent kinds, the start check, send, follow-up, the run listener, the meter, the plan wiring, the helper wiring, `/context`, `/cost`, the CSV, `reloadIdle` |
| `src/main/tool-policy.ts`, `helpers.ts`, `helper-types.ts`, `plan.ts`, `agent-context.ts`, `firm-agent.ts` | The native harness parts |
| `src/main/pi-extensions.ts` | Loader, package manager, the extension UI context |
| `src/main/index.ts` | `claimPiAgentDir`, the managers, the bridge functions |
| `src/renderer/src/ChatActivity.tsx` | Tool-call groups, the helper card, the Context tab and its usage ring |
| `extensions/placeholder/` | The placeholder extension |
| `<userData>/tool-policy.json`, `<userData>/logs/tool-policy.jsonl` | The tool policy and its review log |
| `<userData>/pi-agent/` | `settings.json`, `npm/` and `git/` (added packages), and the added extensions' own files |

## 2. HB-1: side questions (built; feature O9, phase 1)

The replacement for pi-btw, built in the window.

- **Start.** A "Side question" action in the chat dock, or `/btw <question>` typed in the chat.
- **Session.** A separate Pi session in memory (`SessionManager.inMemory()`) on the chat's model, using the same loader as the main session.
- **Tools.** Read tools only: sources, Notebook, drafts, research, Find. No proposal, record, portal or filing tool, so a side question cannot change the matter. Enforced by the session's tool list and by the tool policy.
- **Context.** The main conversation's recent messages and the open view, copied in read-only. The main conversation does not change.
- **Panel.** The side thread shows beside the chat, with follow-up questions inside it.
- **Bring into chat.** Puts the answer, or a selected part, into the main composer as a quote. The advocate sends it or not.
- **Discard** ends the thread. Threads last for the window session. Keeping them under `<matter>/chat/side/` is an owner choice.
- **As built:** `src/main/side-questions.ts` and `SidePanel` in `src/renderer/src/Harness.tsx`. The tools are the reading tools of `SIDE_TOOLS`; the web tools are not among them. A call the tool policy would ask about is refused, because a side thread never asks.
- **Tests:**
  - a unit test with the faux model: the side session has no writing tool, and the main session's messages do not change;
  - an end-to-end test: open a side question, bring it into the chat.

## 3. HB-2: browser: A built, B and C planned (features S10, S11, S12)

The assessment is in [../.agents/logs/2026-11-15-browser-and-harness-assessment.md](../.agents/logs/2026-11-15-browser-and-harness-assessment.md). A is built in phase 3; B and C are phase 9.

### 3.1 A: the built-in browser (one engine, two kinds of browsing; S10, phase 3, built)

It also carries the import of the advocate's case list from eCourts and court portals (feature A9) and adding an existing matter by its CNR (C2).

- **Engine.** Electron's Chromium, already in the application (Electron 45.3.2, Chromium 156).
- **Advocate browser:**
  - a tabbed right pane in the application window (`WebContentsView`), with the Matter tab, browser tabs, a new tab, an address bar, back, forward, reload, a bookmark star, a bookmarks bar and a new-tab page;
  - its own persistent profile (`persist:oa-browser`), so the advocate's sign-ins stay;
  - bookmarks in `<userData>/browser-bookmarks.json` and the last 50 pages in `<userData>/browser-history.json`;
  - downloads become sources of the open matter, with their address recorded;
  - the advocate signs in and solves every CAPTCHA.
- **Agent pages:**
  - hidden pages in the same engine, each in its own temporary partition, so they never see the advocate's cookies;
  - "Hand to advocate" shows a hidden page as a visible tab, keeping its state, when it needs a login or a CAPTCHA;
  - the agent acts in the advocate's browser only on a tab the advocate hands over, or on an "agent tab" the advocate can watch.
- **Control.** `webContents.debugger` (Chrome DevTools Protocol, in-process, no port opened). The agent tools follow agent-browser's design:
  - `browser_tabs`, `browser_open`, `browser_navigate`, `browser_snapshot` (accessibility tree with `@e1` refs, with a DOM outline for a hidden page);
  - `browser_click`, `browser_fill`, `browser_read`, `browser_screenshot`, `browser_wait`;
  - `browser_download_to_matter`, `browser_hand_to_advocate`, `browser_close`.
- **Guards.** From the court portal window:
  - a submit control only through `submit_filing` after both confirmations;
  - uploads only from the newest filing set;
  - tool-policy rules on every `browser_*` tool.
- **The court portal window** stays a separate window for filing until phase 13. It keeps its origin list and its two confirmations. The built-in browser is the general browser; it does not carry the filing guards. Moving the portal onto it is part of phase 13.
- **Not used:** a remote debugging port with Playwright `connectOverCDP` into the application. It would expose every application window to any local program.

### 3.2 B: agent-browser through MCP (S11, phase 9)

- **What.** vercel-labs/agent-browser (Rust, Apache-2.0), with a Windows x64 build. `agent-browser mcp` runs an MCP server over stdio. The application's Pi already loads MCP.
- **Use.** Heavy or parallel background browsing that should not run inside the application process.
- **Build:**
  - vendor the binary, pinned by version and SHA-256, like the other vendored parts;
  - register it as an MCP server in the application's Pi settings;
  - tool-policy rules decide which of its tools the agent may call;
  - it uses its own browser profile, never the advocate's.
- **To settle in a spike:** Chrome for Testing (a large download) against attaching to a hidden Electron page; behaviour on Windows.

### 3.3 C: Playwright scripts (S12, phase 9)

- **What.** Fixed, testable scripts per court for scheduled work: cause lists, case status, new orders (features S2 to S5).
- **Where.** `src/lib/court-adapters/<court>/` in TypeScript. A Python Playwright script is allowed where a court needs it, behind the same adapter interface.
- **Browser.** Playwright's own Chromium, headless, with a separate profile per adapter. No sign-ins, unless the advocate hands over a session explicitly.
- **Rules.** Each adapter declares its access method and its freshness (feature S1). No CAPTCHA solving, no bot-detection evasion, nothing against a site's terms.
- **Tests:** recorded fixture pages for each adapter, plus a live check behind `OPENADVO_LIVE_NET=1`.

### 3.4 Order

1. A (built in phase 3): the browser pane, CDP control, the agent tools and the handover. The court portal moves onto it in phase 13.
2. C: one Playwright adapter (Supreme Court case status), then the Delhi High Court and eCourts adapters.
3. B: the agent-browser spike, then vendoring through MCP if it beats A's hidden pages for background work.
4. Later: Obscura or Moli tested against the court sites as a light engine for C.

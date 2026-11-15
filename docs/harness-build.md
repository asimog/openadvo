# Harness build

Owner's instructions, 2026-11-15. This file owns how the agent harness is built:
- the Pi folders and credentials;
- the extensions and their policy;
- the permission system;
- the helper agents;
- the extension interface in the window;
- the planned builds HB-1 (side questions) and HB-2 (browser).

The defect list and the status of each Pi feature are in [harness-hardening.md](harness-hardening.md). The decisions are 22 to 25 in [decisions.md](decisions.md).

## 1. How the harness is built today

### 1.1 Pi in the application

- Pi (`@earendil-works/pi-coding-agent` 1.5.2) runs in the Electron main process. One session per open matter, saved in `<matter>/chat/pi` (`src/main/agent.ts`).
- **Pi's agent folder is the application's own folder,** `<userData>/pi-agent` (decision 23). At start, `src/main/index.ts` reads the owner's Pi folder first (normally `~/.pi/agent`). It then sets `PI_CODING_AGENT_DIR` to the application's folder. Every extension that uses Pi's `getAgentDir()` therefore keeps its settings and logs in the application's folder.
- **Model credentials and models** are still read from the owner's Pi folder (decision 16): `ModelRuntime.create({ authPath: <owner>/auth.json, modelsPath: <owner>/models.json })`. Pi's default model is read from `<owner>/settings.json`.
- **Resources.** Each session uses Pi's `DefaultResourceLoader` in the application's folder, with a file-backed `SettingsManager`. It loads:
  - the bundled extensions and the packages the advocate added;
  - Pi skills, prompt templates and context files;
  - MCP, codemode and tool search.
- **Tools.** `noTools: "builtin"` and an exclude list keep Pi's built-in tools (`read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`, `ls`) off. The application's own tools come in as `customTools`. The start check refuses a session that lacks one of the application's tools or has a built-in tool.
- **Run behaviour.** Compaction is on. A message sent while the agent works is queued as a Pi follow-up. An extension command (`/name`) runs with or without a model. The token budget per matter still applies.
- **No confidential distinction** (decision 25). Every matter uses the chosen model, loads the extensions and may search the web. The stored `confidential` column is no longer read, and the setting is gone from the window.

### 1.2 Bundled extensions

`npm run vendor:extensions` installs them from `scripts/pi-extensions.manifest.json`. It uses exact npm versions, checks each registry integrity hash, and runs no install scripts and installs no peer packages. They go into `resources/pi-extensions/`.

| Extension | Version | Adds |
|---|---|---|
| pi-subagent-manager | 1.9.0 | Helper agents in parallel: `agent_spawn`, `agent_wait`, `agent_steer` and others; `/agents` |
| pi-context-decisions | 4.0.0 | Picks which Pi skills the model sees; `/decisions` |
| pi-checklist | 3.3.0 | Task checklist: `checklist_create`, `checklist_read`, `checklist_update`; `/checklist` |
| pi-context-prune | 2.2.0 | Summarises and prunes finished tool output: `context_tree_query`, `context_prune`; `/pruner` |
| pi-context-usage | 2.1.0 | `/context`: what fills the context window |
| pi-cache-graph | 1.2.1 | `/cache`: cache use over the session |
| @gotgenes/pi-permission-system | 42.0.0 | Allow, ask or deny rules for every tool, shell command, MCP server, skill and file path; `/permission-system` |

@narumitw/pi-btw was assessed and removed. Outside Pi's terminal it only answers "/btw requires interactive TUI mode" (`src/btw.ts:275`). HB-1 replaces it.

**Added extensions.** The advocate adds them in Settings → Pi extensions, from npm, git, a URL or a folder. Pi's package manager installs them in the application's folder and records them in its `settings.json`. npm and git sources need npm or git on the computer. A change reopens idle conversations.

### 1.3 The permission policy (decision 24)

- **File:** `<userData>/pi-agent/extensions/pi-permission-system/config.json`. This is pi-permission-system's own global config path, because Pi's agent folder is the application's.
- **Written by** `PiExtensions.writePermissionPolicy()` (`src/main/pi-extensions.ts`). The first start writes the whole file. The advocate may edit it. Every later start puts back the safety rules and keeps everything else:

  | Rule | Value |
  |---|---|
  | `"*"` (any tool) | `allow` |
  | `bash` | `{ "*": "deny" }` |
  | `read`, `powershell`, `edit`, `write`, `grep`, `find`, `ls` | `deny` |
  | `path` | `"*": "allow"`, with `deny` for `*auth.json`, `*.env`, `*.env.*`, `*/.ssh/*`, `*manifest-signing.key`, `*models.json` |
  | `mcp`, `skill` | `{ "*": "allow" }` |
  | `external_directory` | `allow` |
  | `yoloMode` | `false` (put back on every start) |
  | `permissionReviewLog` | `true` |
  | `debugLog` | `false` |

- **Why allow by default.** In the window, an "ask" gets the default answer until extension questions reach the chat (harness-hardening H-13). So an `ask` acts as `deny`. The advocate may add `ask` or `deny` rules for chosen tools.
- **Logs.** The review log is written to `<userData>/pi-agent/extensions/pi-permission-system/logs/`, never to `~/.pi/agent`.
- **What the test shows** (`tests/unit/pi-extensions.test.ts`, with a scripted faux model):
  - an allowed tool runs;
  - a tool with a `deny` rule is withheld ("Tool … not found");
  - a call with a credential path is refused with "Denied by policy: 'path' … (rule '*auth.json')";
  - the block is in the review log in the application's folder.
- **Two layers.** Pi's built-in tools are also blocked by the application's own guard extension (`openadvo-policy`) and by the start check. pi-permission-system is a second layer, not the only one.

### 1.4 Helper agents (pi-subagent-manager)

On every start, the application writes `<userData>/pi-agent/subagent-manager/settings.json` with:
- `toolFiltering: "allowed"`;
- `subagentExtensions: false`;
- `housekeepingEnabled: false`.

It also writes an overlay per bundled agent type (`architect`, `coder`, `researcher`, `reviewer`, `tasker`, `writer`). Each overlay allows only the application's tools and the manager's controls, blocks Pi's built-in tools, and sets `models: null`, so helpers use the chat's model.

Not yet verified with a live model: whether helpers receive the application's custom tools.

### 1.5 The extension interface in the window

Extensions bind with `mode: "rpc"` and the application's UI context (`extensionUi` in `src/main/pi-extensions.ts`):

| Extension call | In the window |
|---|---|
| `notify` | A notice in the matter's chat (multi-line notices keep their lines) |
| `setStatus` and a text `setWidget` | Status lines above the chat log |
| `custom` (a terminal screen) | Rendered once at 100 columns as text. It cannot be operated. |
| `select`, `confirm`, `input`, `editor` | The default answer, with a notice that says so (H-13) |

### 1.6 Files

| Path | Holds |
|---|---|
| `src/main/agent.ts` | Sessions, tools, the start check, send, follow-up, `reloadIdle` |
| `src/main/pi-extensions.ts` | Loader, package manager, guard, permission and helper policies, UI context |
| `src/main/index.ts` | `claimPiAgentDir`, the manager, the bridge functions |
| `scripts/vendor-pi-extensions.ts`, `scripts/pi-extensions.manifest.json` | Vendoring |
| `<userData>/pi-agent/` | `settings.json`, `npm/` and `git/` (added packages), `extensions/pi-permission-system/` (policy, logs), `subagent-manager/`, and the extensions' own preference files |

## 2. HB-1: side questions (planned; feature O11, phase 1)

The replacement for pi-btw, built in the window.

- **Start.** A "Side question" action in the chat dock, or `/btw <question>` typed in the chat.
- **Session.** A separate Pi session in memory (`SessionManager.inMemory()`) on the chat's model, using the same loader as the main session.
- **Tools.** Read tools only: sources, Notebook, drafts, research, Find. No proposal, record, portal or filing tool, so a side question cannot change the matter. Enforced by the session's tool list and by a pi-permission-system agent override.
- **Context.** The main conversation's recent messages and the open view, copied in read-only. The main conversation does not change.
- **Panel.** The side thread shows beside the chat, with follow-up questions inside it.
- **Bring into chat.** Puts the answer, or a selected part, into the main composer as a quote. The advocate sends it or not.
- **Discard** ends the thread. Threads last for the window session. Keeping them under `<matter>/chat/side/` is an owner choice.
- **Tests:**
  - a unit test with the faux model: the side session has no writing tool, and the main session's messages do not change;
  - an end-to-end test: open a side question, bring it into the chat.

## 3. HB-2: browser (planned): option A, plus agent-browser through MCP, plus Playwright scripts (features S12, S13, S14)

The assessment is in [../.agents/logs/2026-11-15-browser-and-harness-assessment.md](../.agents/logs/2026-11-15-browser-and-harness-assessment.md).

### 3.1 A: the built-in browser (one engine, two kinds of browsing; S12, phase 1)

It also carries the import of the advocate's case list from eCourts and court portals (feature A12) and adding an existing matter by its CNR (C10).

- **Engine.** Electron's Chromium, already in the application (Electron 45.3.2, Chromium 156).
- **Advocate browser:**
  - a tabbed pane in the application window (`WebContentsView`), with an address bar, back and forward;
  - its own persistent profile (`persist:oa-browser`), so the advocate's sign-ins stay;
  - downloads become sources of the open matter, with their address recorded;
  - the advocate signs in and solves every CAPTCHA.
- **Agent pages:**
  - hidden pages in the same engine, each in its own temporary partition, so they never see the advocate's cookies;
  - "Hand to advocate" moves a hidden page into a visible tab when it needs a login or a CAPTCHA;
  - the agent acts in the advocate's browser only on a tab the advocate hands over, or on an "agent tab" the advocate can watch.
- **Control.** `webContents.debugger` (Chrome DevTools Protocol, in-process, no port opened). The agent tools follow agent-browser's design:
  - `browser_open`, `browser_snapshot` (accessibility tree with `@e1` refs);
  - `browser_click`, `browser_fill`, `browser_read`, `browser_screenshot`, `browser_wait`;
  - `browser_download_to_matter`, `browser_hand_to_advocate`.
- **Guards.** From the court portal window:
  - a submit control only through `submit_filing` after both confirmations;
  - uploads only from the newest filing set;
  - pi-permission-system rules on every `browser_*` tool.
- **The court portal window** becomes a tab profile of this browser, keeping its origin list for filing.
- **Not used:** a remote debugging port with Playwright `connectOverCDP` into the application. It would expose every application window to any local program.

### 3.2 B: agent-browser through MCP (S13, phase 3)

- **What.** vercel-labs/agent-browser (Rust, Apache-2.0), with a Windows x64 build. `agent-browser mcp` runs an MCP server over stdio. The application's Pi already loads MCP.
- **Use.** Heavy or parallel background browsing that should not run inside the application process.
- **Build:**
  - vendor the binary, pinned by version and SHA-256, like the other vendored parts;
  - register it as an MCP server in the application's Pi settings;
  - pi-permission-system `mcp` rules decide which of its tools the agent gets;
  - it uses its own browser profile, never the advocate's.
- **To settle in a spike:** Chrome for Testing (a large download) against attaching to a hidden Electron page; behaviour on Windows.

### 3.3 C: Playwright scripts (S14, phase 3)

- **What.** Fixed, testable scripts per court for scheduled work: cause lists, case status, new orders (features S2 to S5).
- **Where.** `src/lib/court-adapters/<court>/` in TypeScript. A Python Playwright script is allowed where a court needs it, behind the same adapter interface.
- **Browser.** Playwright's own Chromium, headless, with a separate profile per adapter. No sign-ins, unless the advocate hands over a session explicitly.
- **Rules.** Each adapter declares its access method and its freshness (feature S1). No CAPTCHA solving, no bot-detection evasion, nothing against a site's terms.
- **Tests:** recorded fixture pages for each adapter, plus a live check behind `OPENADVO_LIVE_NET=1`.

### 3.4 Order

1. A: the browser pane, CDP control, the agent tools and the handover. Move the court portal onto it.
2. C: one Playwright adapter (Supreme Court case status), then the Delhi High Court and eCourts adapters.
3. B: the agent-browser spike, then vendoring through MCP if it beats A's hidden pages for background work.
4. Later: Obscura or Moli tested against the court sites as a light engine for C.

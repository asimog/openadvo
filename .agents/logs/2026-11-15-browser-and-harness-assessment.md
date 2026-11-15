# Assessment: confidentiality removal, pi-permission-system, a side-question system, and browsers

Date: 2026-11-15. Owner's request: assess first, build nothing yet. Remove the confidential distinction; use pi-permission-system; keep pi-btw only if it works in the app, else remove it and build our own; explain the current browser; options for an advocate browser that the agent can also drive, plus a headless browser for the agent; assess agent-browser, Lexmount, ego lite, Obscura and agent-desktop. No code changed in this step.

## 1. Removing the confidential distinction

Where it lives now:
- **Flag:** `matter_policy.confidential` in each `matter.db` (`src/lib/matter-store/practice.ts`). The same row holds the token budget.
- **Setting:** checkbox in the matter's Practice section (`src/renderer/src/Practice.tsx:121`).
- **Chat:** non-local models refused; refused if the flag was set after extensions loaded (`src/main/agent.ts`).
- **Extensions:** a confidential session loads only the host guard (`src/main/pi-extensions.ts`, `loader`).
- **Studio:** web search refused (`src/main/studio.ts:151`); argument loop and rehearsal refuse non-local models (`studio.ts:331`).
- **Tests:** `tests/e2e/v5.spec.ts:350`, `tests/unit/v5-practice.test.ts:31`, `tests/unit/pi-extensions.test.ts:43`.
- **Docs:** product hard rule 9, decision 19, architecture, engineering, features, harness-hardening section 3.

What removal means:
- Every matter uses the chosen model, loads the extensions, and can search the web.
- The budget stays, because it is a separate field in the same row.
- The stored `confidential` column can stay and be ignored, so no migration is needed. The checkbox, the four checks and `isLocalModel` go. Tests and docs change.
- Size: small.
- Hard rule 9 and decision 19 are reversed by the owner's instruction. Record it as a new decision.

## 2. pi-permission-system (42.0.0)

Facts from its source:
- **No config.** Every tool falls under `"*"`, and an omitted `"*"` means `"ask"` (`src/config/config-schema.ts`). In the window an ask gets the default answer, so with no config every app tool would be refused.
- **Config files:**
  - global: `getAgentDir()/extensions/pi-permission-system/config.json`, which is the owner's `~/.pi/agent`;
  - project: `<cwd>/.pi/extensions/pi-permission-system/config.json`. The app's `cwd` is its own Pi folder. Project config loads only if the project is trusted. A host sets this with `SettingsManager.setProjectTrusted(true)`.
- **Logs.** It writes a review log, and optionally a debug log, under `getAgentDir()/extensions/pi-permission-system/logs`, which is the owner's `~/.pi/agent`.
- **Load test.** It loads in the app (probe run: command `permission-system`; no load error) even though `npm install --ignore-scripts` skipped its native `tree-sitter-bash` build.

What can be done (size: small, after one check):
- Write a host-owned project config in the app's Pi folder and mark that folder trusted.
- Policy: `"*": "allow"`; `bash` and Pi's built-in tools `deny`; `path` deny for credential files (`auth.json`, `.env`, `~/.ssh/*`); MCP and skills `allow`. Optionally `ask` for chosen tools, such as `submit_filing` or `web_fetch`.
- Turn off `permissionReviewLog` and `debugLog` in that config, or move Pi's agent folder (section 6), so matter text never lands in `~/.pi/agent`.
- To check while building: that runtime knobs such as the log switches are honoured in project config, and that the app's tools pass with `"*": "allow"`.
- Until H-13 (extension questions in the chat) is built, every `ask` acts as `deny`. After H-13, an ask becomes a Keep or Deny card in the chat.

## 3. pi-btw (0.63.8) and a native side-question system

- pi-btw cannot work in the app. `src/btw.ts:275`: when `ctx.mode !== "tui"` it notifies "/btw requires interactive TUI mode" and returns. Binding `mode: "tui"` would not help, because its whole interface is terminal panes drawn with pi-tui. **Remove it** (manifest entry and the vendored copy).
- **Native design ("Side question").** A "Side question" action in the chat dock, also `/btw <question>`, opens a side thread beside the main chat:
  - It runs a separate Pi session in memory (`SessionManager.inMemory()`), on the chat's model.
  - It gets the read tools only (sources, Notebook, drafts, research, Find). It gets no proposal, filing or portal tools, so a side question cannot change the matter.
  - Context: the main conversation's recent messages and the open view, copied in read-only. Nothing is written back to the main conversation.
  - Actions on an answer: "Bring into chat" puts the answer, or a part of it, into the main composer as a quote for the advocate to send. "Discard" drops the thread.
  - Side threads are kept for the session only, or saved under `chat/side/` if the owner wants them kept.
  - Size: medium. It uses the existing Agent class, the tool definitions and the chat dock.

## 4. The browser in the app today

- **Engine.** Electron 45.3.2 embeds Chromium 156.0.8078.100 (Node 24.22.2). No separate browser is installed.
- **The court portal window** (`src/main/portal.ts`):
  - It is a separate `BrowserWindow` with its own persistent session (`persist:oa-portal`), no Node integration and no preload.
  - It may show only `www.sci.gov.in`, `sci.gov.in`, `main.sci.gov.in`, `efiling.sci.gov.in` and `services.ecourts.gov.in`. Other navigation and pop-ups are refused.
  - A downloaded PDF becomes a source of the open matter, with its URL as provenance.
  - The agent drives it through `executeJavaScript` (read text, fill, click by CSS selector). A submit control is refused except through `submit_filing` after two confirmations. The advocate signs in and solves CAPTCHAs.
- **The editor view** (Euro-Office) is a sandboxed web view, not a browser.
- **`web_search` and `web_fetch`** are plain HTTP requests from the main process. They run no page scripts and use no sign-in.
- **Limits:**
  - no general browsing, no tabs, no address bar;
  - no High Court sites outside the list, and no SCC Online, Manupatra or Indian Kanoon;
  - control through injected JavaScript produces untrusted events, CSS selectors break easily, and there is no accessibility snapshot, screenshot or network view.

## 5. Browser options

### 5.1 The candidates

| Tool | What it is | Runs where | Control | Windows | Licence, activity | Fit |
|---|---|---|---|---|---|---|
| Electron's own Chromium (in the app) | The engine already shipped | In-process; visible (`WebContentsView`) or hidden (`show: false`, offscreen) | `webContents.debugger` gives the full Chrome DevTools Protocol in-process, with no port opened: trusted input, accessibility tree, screenshots, network, downloads | Yes | MIT (Electron) | Best base for the advocate browser and for most agent work. Playwright's API cannot attach to it without a debugging port. |
| agent-browser (vercel-labs) | Rust CLI and daemon for agents: accessibility snapshots with `@e1` refs, click and fill by ref, screenshot, PDF, network, tabs; MCP server mode | Separate process; drives Chrome for Testing, Lightpanda, or any Chrome over CDP (`--cdp`) | CLI, or MCP (`agent-browser mcp`); the app's Pi already loads MCP | x64 `.exe` in v0.43.0 | Apache-2.0; 51k stars; pushed 2026-11-15 | Good optional headless engine through MCP. Its snapshot-and-ref design is the model for the app's own tools. Chrome for Testing is a large download. |
| Obscura (h4ckf0r0day) | Rust headless engine with V8 and CDP; claims Puppeteer and Playwright work; about 30 MB memory; new native rendering, screenshots, PDFs | Separate process | CDP (Playwright `connectOverCDP`, Puppeteer) | x86_64 build | Apache-2.0; 35k stars; v0.2.7, 2026-11-13 | Light and fast for public pages. It is not Chromium, so site compatibility is unproven, which matters for court portals. Its `-stealth` builds exist for evading bot detection; use only the default build (product rule 7). |
| Moli (Lexmount) | Rust headless browser for agents: fetch, extract, search, automation; on-demand layout | Local binary; also Lexmount's hosted Cloud Browser | CLI, CDP, WebDriver Classic, WebDriver BiDi | x86_64 and ARM64 `.zip` | Apache-2.0; 24k stars; v1.1.24, 2026-11-12 | Same role as Obscura. The cloud service runs pages, and with them any matter text, on Lexmount's servers; its data notice was not read. |
| ego lite (Citro Labs) | A separate desktop browser shared by a person and agents; each agent works in its own "Space"; can import Chrome logins | Local app (macOS, Windows) | `ego-browser` skill: the agent runs shell commands that execute in-page JavaScript | Yes | The skill repository is MIT; the browser itself is a separate free download (licence not stated) | Its "Spaces" model is the right idea. But it is another application outside the app window, and the agent drives it through shell commands, which are off. Take the idea, not the product. |
| agent-desktop (vercel-labs) | Computer use through the operating system's accessibility tree: snapshot any desktop app, click by ref, type, clipboard | Separate CLI; headless by default (no pointer movement); `--headed` for physical input | CLI JSON | x86_64 and ARM64 | Apache-2.0; 24k stars; v1.3.1, 2026-11-13 | Not a browser. It could let the agent operate other desktop programs (Word, a DSC signing utility, the advocate's own Chrome). Its README warns that snapshots can contain private desktop content. High reach and high risk. Not now. |
| Playwright with its own Chromium | Mature automation library (TypeScript, Python, .NET, Java) | Separate headless browser process | Playwright API | Yes | Apache-2.0; already a dev dependency (1.65.0) for tests | Strong for scripted, repeatable jobs (cause-list and case-status adapters, S2 and S3). The browser download is large. |

### 5.2 One browser or two?

Two jobs need different things:

| Need | Advocate browser (with the agent) | Agent's own headless browser |
|---|---|---|
| Seen by the advocate | Yes, in the app window | No |
| Sign-ins | The advocate's, kept in their own profile | None, or a separate profile per task |
| CAPTCHA, login, final submit | The advocate | Never. It hands the page to the advocate. |
| Typical work | Portals, research subscriptions, e-filing, "act on this page" | Background research, cause lists, case status, monitoring, many pages in parallel |
| Runs when the advocate is away | No | Yes |

The answer is **one engine with two kinds of browsing context, plus an optional external engine**, rather than two different browser products:

- **Advocate browser.** A tabbed browser pane in the app window (`WebContentsView`) with its own persistent profile. The agent acts only on a tab the advocate hands over, or on an "agent tab" the advocate can watch. All the portal's guards carry over: the submit guard, downloads into the matter with provenance, and no CAPTCHA solving.
- **Agent contexts.** Hidden pages in the same engine, each in its own temporary partition, so they never see the advocate's cookies. A "Hand to advocate" step moves a hidden page into a visible tab when it needs a login or a CAPTCHA. This is ego lite's "Spaces" idea, built in.
- **One control layer for both.** The main process holds `webContents.debugger` (CDP) sessions. Agent tools follow agent-browser's design: an accessibility snapshot with refs, then `click`, `fill`, `read`, `screenshot`, `download_to_matter`, `wait`. The portal's `executeJavaScript` control is replaced.
- **Optional external engine.** agent-browser through MCP, or Playwright with its own Chromium, for heavy scheduled jobs (monitoring many courts). Obscura or Moli can replace Chromium there later if they prove compatible with Indian court sites.

Why not a remote-debugging port with Playwright `connectOverCDP` into the app? It would expose every app window (the main UI, the editor, the portal) to any program on the computer that finds the port. In-process `webContents.debugger` gives the same protocol with no open port.

### 5.3 Options

| Option | What | Pros | Cons | Size |
|---|---|---|---|---|
| A. Built-in, one engine, two kinds of context (recommended) | Tabbed advocate browser plus hidden agent contexts on Electron's Chromium, controlled through CDP in-process | No new binary; one profile model; handover between agent and advocate; all guards in one place; works offline | The app owns the tool layer; hidden pages run inside the app's process | Large: browser pane, CDP tool layer, partitions, handover |
| B. A plus agent-browser through MCP | Option A, plus agent-browser for background jobs | Mature agent snapshot tooling; parallel, separate process; already reachable because Pi loads MCP | An extra binary and Chrome for Testing to vendor; a second profile store | A, plus small |
| C. A plus Playwright jobs | Option A, plus Playwright scripts (TypeScript or Python) for court adapters and monitoring | Deterministic, testable scrapers; Playwright is already in the repository | A large browser download; scripts per court | A, plus medium per court |
| D. External shared browser (ego lite) | The advocate and the agent share ego lite outside the app | Nothing to build | Outside the app window and its guards; needs shell commands; a closed browser | Small, but conflicts with the app's rules |
| E. Cloud browser (Lexmount) | Hosted browsers controlled by Playwright over CDP | Scale, proxies | Pages and matter context leave the computer; a vendor account; cost | Small |
| F. Lightweight headless engine (Obscura or Moli) as the agent browser | A Rust engine through CDP | Fast and small | Not Chromium: compatibility with court sites unproven; Obscura's stealth builds conflict with rule 7 | Small, plus a test spike |

Recommendation: A first, then B or C for scheduled monitoring (Phase 3, S3 to S5). Spike F against the Supreme Court, Delhi High Court and eCourts sites before relying on it. Not D or E. Keep agent-desktop out until there is a named desktop program the agent must operate.

## 6. A related fix: Pi's agent folder

Several extensions use Pi's `getAgentDir()`, which is the owner's `~/.pi/agent` unless `PI_CODING_AGENT_DIR` is set: pi-permission-system (config, logs), pi-context-prune, pi-checklist and pi-memory. Setting `PI_CODING_AGENT_DIR` to the app's own Pi folder at start would keep all extension files inside the app. Model credentials would then be read with explicit paths, `ModelRuntime.create({ authPath, modelsPath })` pointed at `~/.pi/agent`, so decision 16 still holds. To check while building: the models store path and Pi's default-model lookup (`SettingsManager.create(..., getAgentDir())` in `agent.ts`).

## 7. State of the repository

- `scripts/pi-extensions.manifest.json` has two new entries (pi-permission-system, pi-btw). Not committed.
- `resources/pi-extensions/` already contains both, and the app loads them in the next conversation. With no config, pi-permission-system would refuse the app's tools there.
- Recommended first build step: the permission config (section 2), and remove pi-btw (section 3).

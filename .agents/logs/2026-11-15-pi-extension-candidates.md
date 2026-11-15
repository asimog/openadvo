# Pi extension candidates: assessment

Date: 2026-11-15. Owner's request: assess pi-goal-x, cc-safety-net, @juicesharp/rpiv-ask-user-question, @plannotator/pi-extension, pi-memory and pi-fabric, and find other extensions worth bundling. Nothing was installed or changed in the code.

## Method

- `npm view <pkg> name version description license repository.url dependencies peerDependencies pi time.modified`.
- `npm pack <pkg>` into the scratchpad, unpacked, with no install and no scripts run. Then a scan for registered tools, commands, events, `child_process`, network calls, and `ctx.ui` calls. READMEs read.
- Weekly downloads from `api.npmjs.org/downloads/point/last-week/<pkg>`.
- `npm search` for Pi packages by topic: permission, sandbox, plan, review, pdf, docx, web search, ask user, guard, todo, citation, handoff, rewind.

The deciding fact for this application: extensions run with `mode: "rpc"` and no terminal. Tools, notices, status lines and text widgets work. `select`, `confirm`, `input` and `editor` questions get their default answer until H-13 is built. Terminal screens (`ctx.ui.custom`) show once as text and cannot be operated. Pi's built-in file and shell tools are off.

## The six named packages

| Package | Version, updated, downloads/week | What it does | Fit | Verdict |
|---|---|---|---|---|
| pi-goal-x | 0.34.1, 2026-10-27, 6,815 | `/goal`: plans a goal with you, keeps tasks and progress across sessions, keeps working while the goal is active, and can submit the result to a separate completion auditor model. Tools `create_goal`, `get_goal`, `update_goal`, `submit_goal_oracle_advice`. | The idea fits long litigation tasks with completion requirements ("bail application ready to file, every ground anchored"). But drafting a goal uses `select` (14 calls), `input` (7) and `custom` (8). In the window these get default answers. The auditor model is chosen in a terminal picker. | Not now. Reassess after H-13. |
| cc-safety-net | 2.7.13, 2026-11-14, 49,920 | Blocks destructive shell commands and access to secret files. Peer dependencies are OpenCode plugin packages. The Pi entry adds a command and a tool-call hook. | It guards `bash` and file tools. With those off, it has nothing to guard. | No. Only relevant if Pi's built-in tools are turned on, and then the permission system below is the stronger choice. |
| @juicesharp/rpiv-ask-user-question | 2.15.0, 2026-10-24, 40,210 | A tool the model uses to ask the user a structured question with typed options, instead of guessing. | The idea fits hard rule 1 (the advocate decides) very well. The whole interaction is a terminal screen (`custom` 8, `onTerminalInput` 4), so in the window the question shows once and cannot be answered, even after H-13. | No. Build the same idea as an application tool, `ask_advocate`, answered through an AG-UI interrupt in the chat (with H-13). |
| @plannotator/pi-extension | 0.28.65, 2026-11-15, 22,108 | Plan mode with a browser page for annotating and approving plans; annotates messages; reviews code and pull requests (`gh`, `glab`). 362 files. It spawns other agent programs (Claude Agent SDK, Codex app server), serves a local web page, and reloads itself after updates. | Built for code review. It opens its own browser server outside the window, and runs other agent programs. Plan approval in the window is feature Q4 (plan card) and draft review is the editor. | No. |
| pi-memory | 0.4.2, 2026-08-11, 19,549 | Markdown memory in `~/.pi/agent/memory/` (long-term file, daily logs, scratchpad), semantic search through the external `qmd` program (`child_process`). Tools `memory_write`, `memory_read`, `memory_search` and others. | One global memory for every session. That would carry facts from one matter into another, keep matter text outside the matter folder, and write memory without the advocate confirming it. All three conflict with architecture section 6. | No. Typed memory (features F1 to F8) covers this. |
| pi-fabric | 0.137.0, 2026-11-14, 9,920 | A programmable tool and agent runtime: a Python runtime, QuickJS, an MCP bridge, process spawning. It depends on pi-durable and chord, and carries its own copy of pi-coding-agent 1.5.0. 1,739 files. | It overlaps codemode, MCP and the helper agents. It depends on pi-durable, which its own README calls experimental (H-30). Very large. | No. Reassess only if pi-durable is adopted. |

## Other packages found

| Package | Version, updated, downloads/week | What it does | Verdict |
|---|---|---|---|
| @gotgenes/pi-permission-system | 42.0.0, 2026-10-28, 10,292 | Allow, ask or deny rules for every tool, bash command pattern, MCP server and tool, skill and file path. Hides denied tools before the run. Fails closed. Forwards "ask" prompts from helper agents. | The best candidate. Useful now for MCP and skill gating. Its "ask" rules need dialogs (H-13). It is a precondition if Pi's built-in tools are ever turned on. Bundle after H-13. |
| pi-web-access | 0.47.0, 2026-11-05, 285,156 | Web search through many providers (zero-config through Exa), page fetch, PDF extraction, video understanding, GitHub cloning. | It duplicates the application's `web_search` and `web_fetch`. Its queries go to third-party providers by default and are not written to the matter's research log. GitHub cloning needs file tools. Not bundled; an advocate can add it. |
| @narumitw/pi-btw | 0.63.8, 2026-11-11, 7,100 | `/btw`: a side question in a separate thread that does not enter the main conversation. | A good idea for an advocate (a quick side question mid-task). It is built as terminal panes. Build natively later. |
| @juicesharp/rpiv-todo, @nredd/pi-todo | 2.15.0, 16,251 / — | A model to-do list as a live terminal overlay. | pi-checklist already gives this, and its tools work in the window. No. |
| pi-ask-user, @adeildo/pi-ask-permission | 0.17.2, 3,179 / 6.1.0, 610 | Ask-user and permission dialogs in the terminal. | Terminal screens. No. |
| pi-sessions, pi-handoff | 0.23.1, 1,141 / 1.1.9, 95 | Search, ask and hand off across sessions. | Searching across sessions crosses matters. No. |
| pi-rewind, pi-rewind-hook | 0.5.0, 269 / — | File checkpoints and rewind through git. | Needs file tools and git. The matter store already keeps every revision. No. |
| pi-read-guard | 0.1.14, 340 | Stops huge reads by the built-in `read` tool. | `read` is off. No. |

## Pattern

Most Pi extensions are built for coding in a terminal. They fall into three groups for this application:

1. Extensions that work through tools and need no dialog: the six bundled now.
2. Extensions that need dialogs: pi-goal-x and pi-permission-system. They become usable when extension questions reach the chat (H-13).
3. Extensions that need file or shell tools, a terminal screen, or global storage: cc-safety-net, rpiv-ask-user-question, Plannotator, pi-memory, pi-fabric, pi-rewind and others. These do not fit unless the application changes, and some ideas are better built natively (`ask_advocate`, `/btw`).

## Not verified

Whether pi-subagent-manager's helper agents receive the application's own tools. Its docs say that main-session tools are bridged to helpers, but that "other custom model-only tools fail closed". The application's 43 tools are SDK custom tools. A live run with a model is needed to see which case applies.

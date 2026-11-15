# Agent guide

This file owns how a coding agent works on Open Advocate: setup, commands, the code's patterns, recipes for common changes, testing, verification, the rules for these documents, and how to work with the owner. What the product is and what to build are in the other documents. Start at [README.md](README.md).

The standing orders in [../AGENTS.md](../AGENTS.md) come first. This guide does not repeat them; it tells you how to follow them.

## 1. Read first

Read these in this order before you change anything:

1. [../AGENTS.md](../AGENTS.md): standing orders, lessons L1 to L6, the advice boundary.
2. [product.md](product.md), [advocate-workflow.md](advocate-workflow.md) and [decisions.md](decisions.md): what the product is, what the advocate sees, and what is frozen.
3. [build-plan.md](build-plan.md) and [features.md](features.md): the phase you work on and its feature ids.
4. [architecture.md](architecture.md), [harness-build.md](harness-build.md), [harness-hardening.md](harness-hardening.md) and [engineering.md](engineering.md): how it is built.
5. [repo-map.md](repo-map.md): where everything is, and what you may write.
6. [questions.md](questions.md): open questions, and the default to use until the owner answers.
7. The newest notes in `../.agents/logs/`, starting with the file named `*-notes-for-agents.md`.

When a document and the code disagree, the code is right. Report each mismatch to the owner and in your session record.

**Start every work session with `npm run session:start`.** It prints the Node version, the branch, the working tree, the vendored parts, the Pi reference folder, the newest successor prompt and logs, and runs the type check. Add `-- --unit` for the unit tests. It exits non-zero when the project cannot be checked. If the working tree is not clean, find out what the last session left before you change anything.

**Before you write code against Pi** (the SDK, an extension, a tool, a session feature, a UI context), read the Pi reference folder `C:\dev\pireference` ([repo-map.md](repo-map.md), reference repositories). Check whether Pi already has the part you need, and use it. Write in your session record which Pi feature you used, or why none fits.

## 2. The machine

- Windows 10 x64. Two shells are available: Git Bash (POSIX) and PowerShell 7. Use forward slashes in Git Bash. Quote paths with spaces.
- Node 22.19 or later (`package.json` `engines`). The development machine runs Node 24. Node runs TypeScript files directly by stripping the types, so `node file.ts` works for scripts and unit tests.
- Electron 45.3.2, with Chromium 156 and Node 24.22 inside. Check with:

  ```bash
  ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe -p "process.versions.chrome+' node '+process.versions.node"
  ```

- Keep temporary files outside the repository, or in `scratchpad/` at the repository root, which git ignores.
- Never set `ELECTRON_RUN_AS_NODE` in the environment of a test run. It stops the application from starting as Electron. `tests/e2e/env.ts` removes it.

## 3. Setup from a clean clone

```bash
npm install
npm run vendor
npm run vendor:ulos
npm run vendor:voice
npm run vendor:ocr
npm run build
npm start
```

| Command | Fetches | Needs |
|---|---|---|
| `npm run vendor` | The Euro-Office release (editors, converter, fonts, dictionaries), checked by SHA-256 against `scripts/euro-office.manifest.json` | Network, or `--from <file>` with a local copy |
| `npm run vendor:ulos` | The `ulos` citation validator and its court database | `C:\dev\ulosadvo`, or `ULOS_SRC` |
| `npm run vendor:voice` | The Whisper speech model | Network; `VOICE_REVISION` pins a revision |
| `npm run vendor:ocr` | The PP-OCR models, checked by SHA-256 | Network |

Vendored parts go into `resources/` and are never committed. Tests that need a vendored part skip with a message when it is missing. Vendor it, and run the tests again.

The agent uses the model credentials of the owner's Pi (`~/.pi/agent/auth.json`). Never open, copy or print that file. If no model has credentials, the chat says so. Extension commands (`/name`) still run.

## 4. Commands

| Command | Does |
|---|---|
| `npm run dev` | Starts the application with hot reload (electron-vite) |
| `npm run build` | Builds main, preload and renderer into `out/`. Check that "built in" appears three times. |
| `npm start` | Runs the built application |
| `npm run typecheck` | `tsc` over the Node and web projects (`tsconfig.node.json`, `tsconfig.web.json`) |
| `npm run test:unit` | `node --test` over `tests/unit/**/*.test.ts` |
| `npm run test:e2e` | Playwright against the built application (`playwright.config.ts`: one worker, 120 s per test) |
| `npm test` | Unit tests, build, end-to-end tests |
| `npm run session:start` | The start check of a work session (section 1); `-- --unit` adds the unit tests, `-- --quick` skips the type check |
| `npm run dist` | The folder to install, in `release/<platform>-unpacked/` (`electron-builder.yml`) |

Run long suites in the background and read their output when they finish. The full end-to-end suite takes about three minutes.

## 5. Environment variables

| Variable | Effect |
|---|---|
| `OPENADVO_HOME` | The matters root, instead of `<Documents>/Open Advocate/Matters` |
| `OPENADVO_USER_DATA` | The user data folder (settings, corpus, the application's Pi folder) |
| `OPENADVO_TEST=1` | Exposes the read-only test hooks (`globalThis.__openadvoTest`) |
| `OPENADVO_RESOURCES` | The vendored resources folder, instead of `<app>/resources` |
| `OPENADVO_EO_ROOT` | The Euro-Office folder, instead of `resources/euro-office/<platform>` |
| `OPENADVO_PORTAL_URL` | A local court-portal page for tests; the portal window then allows only its origin |
| `OPENADVO_MODEL` | The model, as `provider/model`; it wins over the saved choice |
| `OPENADVO_LIVE_MODEL` | Turns on the end-to-end tests that call a real model |
| `OPENADVO_LIVE_NET=1` | Turns on the tests that reach AWS Open Data, India Code and the web |
| `PI_CODING_AGENT_DIR` | Pi's agent folder. The application sets it to `<userData>/pi-agent` at start. Unit tests set it to a temporary folder. |
| `ULOS_SRC`, `VOICE_REVISION` | Sources for the vendor scripts |

## 6. The code

### 6.1 Layout and boundaries

| Folder | Holds | Rule |
|---|---|---|
| `src/main/` | The Electron main process: window, bridge handlers, the agent, the modules that call the libraries | The only place with file access and Pi |
| `src/preload/index.ts` | The bridge: named functions exposed as `window.openadvo` | Every function is listed in `src/shared/api.ts` `OpenAdvoApi` |
| `src/renderer/src/` | React views with Astryx components and `@heroicons/react` icons | No business logic, no file access (decision 3) |
| `src/lib/` | Plain domain libraries | No Electron import, no Pi import (decision 6) |
| `src/shared/` | Types shared by main, preload and renderer | No side effects |
| `src/editor-host/` | The host page of the Euro-Office editors | Vendored editor files are never modified |

Key files:

| File | Holds |
|---|---|
| `src/main/index.ts` | Start-up (`claimPiAgentDir`, stores, the agent, the extension manager), every `handle(...)` bridge handler, the test hooks |
| `src/main/agent.ts` | One Pi session per matter, the application's agent tools (`AGENT_TOOLS`), the system prompt, the start check, `send`, `stop`, `reloadIdle` |
| `src/main/pi-extensions.ts` | The resource loader, bundled and added extensions, the extension UI context |
| `src/main/tool-policy.ts` | The tool policy: rules, deny-hiding, the party rule, MCP rules, the approval queue and the review log |
| `src/main/helpers.ts`, `src/main/helper-types.ts` | The helper runtime: foreground and background jobs, Steer, Stop, results, the Final Recap, the files |
| `src/main/plan.ts`, `src/main/agent-context.ts` | The plan rules; the context strategy, the summaries with refs and the summary form |
| `src/main/test-model.ts` | The scripted model for end-to-end tests (only under `OPENADVO_TEST=1`) |
| `src/main/skills.ts`, `src/lib/skills/` | The skill registry: discovery of `SKILL.md` files, their checks, the roles and the evaluator gate (N1, O2, O4) |
| `src/main/skill-runner.ts`, `src/main/context-assembly.ts`, `src/lib/context-package/` | A skill run, retrieval and the context package (N2, I1) |
| `src/main/side-questions.ts` | Side questions (O9) |
| `src/main/harness-bridge.ts` | The bridge functions of phase 1 |
| `src/lib/advocate-store/`, `src/lib/intel-store/`, `src/lib/store-chain/` | `advocate.db`, `intel.db` and their hash chain (Q4) |
| `src/main/matters.ts` | The only caller of the matter store (decision 4) |
| `src/lib/matter-store/` | `matter.db`: schema, writes, the hash-chained event record, refusals, Find |
| `src/main/portal.ts` | The court-portal window, its origin list and the filing guards |
| `src/main/studio.ts`, `src/main/research.ts` | Research sources, the argument loop and rehearsal |

### 6.2 Patterns to keep

- **Single writer.** Every write to a matter goes through `MatterStore` methods with a `WriteContext` (`{ actor, sessionId }`). A human-only write calls `this.human(ctx, "...")`, which throws `MatterStoreError("HUMAN_ONLY", ...)` for any actor except `advocate`. Each write appends an event (`appendEvent`) to the hash-chained record.
- **Errors.** Throw `MatterStoreError(code, message)` with a stable upper-case code. Bridge handlers record a refused request in the matter's refusal table (`handle` in `src/main/index.ts`).
- **Human-only actions** (confirm, keep or undo, approve, decide) are bridge functions, never agent tools (decision 5).
- **Agent writes** are proposals, records or candidates. The advocate decides each one.
- **The agent stream** is AG-UI events over IPC. Messages from the application are `CUSTOM` events named `CHAT_MESSAGE_EVENT`. Status lines of extensions are `EXTENSION_STATUS_EVENT` (`src/shared/api.ts`).
- **Nothing pretends** (lesson L2). A feature that does not work yet says so on screen.

## 7. Recipes

### 7.1 Add a bridge function

1. Add the method to `OpenAdvoApi` in `src/shared/api.ts`, with a one-line comment.
2. Add it to `api` in `src/preload/index.ts`: `name: (...) => ipcRenderer.invoke("area:verb", ...)`.
3. Add `handle("area:verb", (...) => ...)` in `registerBridge()` in `src/main/index.ts`. Validate the arguments there.
4. Use it in the renderer through `const api = window.openadvo`.
5. Add the name to the exact list in the test "the renderer has no file or Node access; the bridge exposes only named functions" in `tests/e2e/app.spec.ts`. That test fails until you do.

### 7.2 Add an agent tool

1. Define it with `defineTool` (TypeBox parameters) inside `Agent.start()` in `src/main/agent.ts`, next to the tools of the same area.
2. Add its name to `AGENT_TOOLS` and the definition to `customTools`. The start check refuses a session that lacks a listed tool.
3. Describe it in `systemPrompt()`: what it reads, what it writes, what it may not do.
4. Writes go through the host with `{ actor: "agent", sessionId }`.
5. Add the name to the tool list in the test "the agent session has our tools, no built-in Pi tool, and its id is recorded" in `tests/e2e/app.spec.ts`.
6. The permission policy allows every tool by default. Add a `deny` or `ask` rule in `writePermissionPolicy()` only if the tool needs one. An `ask` stops each call until the advocate answers in the chat (harness-hardening H-12).

### 7.3 Add a table or a column to `matter.db`

1. Put the `CREATE TABLE IF NOT EXISTS ...` statements in a `*_SCHEMA` constant in the module's file under `src/lib/matter-store/`, and `db.exec` it where the store opens (`src/lib/matter-store/index.ts`, next to the other schemas).
2. A new column on an existing table: read the table's `sql` from `sqlite_master`, and run `ALTER TABLE ... ADD COLUMN ...` only if the column is missing. Copy the existing examples in the same function.
3. Write through `MatterStore` methods only. Add an event type for each write.
4. Add a unit test in `tests/unit/` that opens a store in a temporary folder.

### 7.4 Add a view

- Use Astryx components and `@heroicons/react` icons. No second component library (EC-1).
- Styles go in `src/renderer/src/app.css`.
- The navigation follows [advocate-workflow.md](advocate-workflow.md) section 3.
- Test it end to end: launch the application, use the view as the advocate would, and assert on visible text and test ids.

### 7.5 Change a native harness part, or the placeholder extension

- The harness parts that were bundled Pi extensions are native code ([specs/native-harness-parts.md](specs/native-harness-parts.md)). Change them as code: a failing test first in `tests/unit/` (the faux-model fixture is `tests/unit/agent-fixture.ts`), then the change.
- Before you add a harness part, check whether Pi already has it, in `C:\dev\pireference` (section 1). Before you add a bundled extension back, ask the owner: decision 21 makes the harness parts native.
- The placeholder (`extensions/placeholder`) registers no tool on purpose. Keep it free of tools, reads and writes; it tests the extension system only.
- A tool the agent should not call without approval gets an `ask` rule in the tool policy, not a question inside the tool.

### 7.6 Add a skill

1. Add a folder under `skills/` with `SKILL.md`. The frontmatter fields are in [specs/harness-and-stores.md](specs/harness-and-stores.md) section 2.
2. Name only tools of the skill's role ([../src/lib/skills/roles.ts](../src/lib/skills/roles.ts)). The registry refuses a human-only action, a portal or filing tool, or a tool the agent does not have.
3. Check that it loads: the test "the built-in skills load with no error" in `tests/unit/skills.test.ts` lists the built-in ids. Add the new id there.

### 7.7 Add a vendored part

Follow `scripts/vendor-*.ts`:
- pin the version;
- check SHA-256 or the integrity hash;
- exit non-zero on any failure;
- write a lock file.

Then add the folder to `.gitignore` and to `files` in `electron-builder.yml`, and add a row to [engineering.md](engineering.md) section 2.

## 8. Testing

### 8.1 Unit tests

- `node:test` with `node:assert/strict`, one file per area in `tests/unit/`.
- Libraries under `src/lib/` are tested directly. Main-process modules that do not import Electron (`agent.ts`, `pi-extensions.ts`) can be tested directly too.
- Use temporary folders (`mkdtempSync(path.join(tmpdir(), "..."))`). Never touch the owner's folders.

### 8.2 Agent behaviour without a model

Use pi-ai's faux provider. The pattern is in `tests/unit/pi-extensions.test.ts`:

1. `const core = createFauxCore({ provider: "faux-test", models: [{ id: "m" }] })`.
2. Register it in an inline extension factory: `pi.registerProvider("faux-test", { name, baseUrl: "http://localhost", apiKey: "test", api: core.api, streamSimple: core.streamSimple, models: core.models.map((m) => ({ ...m, type: "chat" })) })`.
3. Create the session with a `ModelRuntime` whose `authPath` is in the temporary folder. Then call `session.setModel(modelRuntime.getModel("faux-test", "m"))`.
4. Script the responses: `core.setResponses([fauxAssistantMessage([fauxToolCall("tool_name", {...})], { stopReason: "toolUse" }), fauxAssistantMessage("done")])`.
5. `await session.prompt("...")`, and assert on `tool_execution_end` events and on what the tools did.

### 8.3 End-to-end tests

- Playwright `_electron.launch({ args: [repo], env: appEnv({ OPENADVO_HOME, OPENADVO_USER_DATA, OPENADVO_TEST: "1" }) })`, with fresh temporary folders per test. See `launch()` in `tests/e2e/app.spec.ts`.
- Run `npm run build` first. The tests run the built `out/`, not the source.
- Read-only hooks in the main process (`app.evaluate(() => globalThis.__openadvoTest...)`):
  - `agentToolNames`, `agentSessionId`, `mattersRoot`, `ingestIdle`;
  - `proposeCorrection`, `work`, `fillRecordCell`, `readMemoryAsAgent`, `proposeMemoryAsAgent`;
  - `setResearchFixtures`, `runStudioScripted`, `studioTool`, `checkReminders`, `recordUsageForTest`, `rehearseScripted`;
  - `importEml`, `portalContentsUrl`, `portalEval`.
- Bridge functions are called from the page with `page.evaluate(() => globalThis.openadvo.<name>(...))`.
- A screenshot for evidence: `page.screenshot({ path: "test-results/<name>.png" })`, then look at it.
- Skips: the live-model tests need `OPENADVO_LIVE_MODEL`; `dist.spec.ts` needs `npm run dist`; tests of vendored parts need the vendor scripts.

### 8.4 What to run

| Change | Run |
|---|---|
| Any code | `npm run typecheck` |
| A library or the agent | `npm run test:unit`, or the one file with `node --test tests/unit/<file>.test.ts` |
| A bridge function, a view, start-up | `npm run build`, then the affected `npx playwright test tests/e2e/<file>.spec.ts` |
| Before you report a piece of work as finished | The full unit and end-to-end suites |

Report the commands and their results: counts of tests passed, failed and skipped, and exit codes. Never write "tests pass" without the output behind it.

## 9. Documents

- **One owner per fact.** The owners are listed in [README.md](README.md). Link to the owner; do not copy the fact.
- **Clean numbering.** Ids in [features.md](features.md) run without gaps within each letter. Decisions, rulings, hard rules and hardening items run without gaps too. When you merge, remove or add an item:
  - renumber;
  - update every reference in `docs/` and in code comments;
  - never leave "was X" notes or history in the documents.

  Lessons L1 to L6 in `AGENTS.md` use the same pattern as feature group L, so leave them out of any automatic id change.
- **Phases.** Each feature's phase is in the Ph column of [features.md](features.md). The scope lines in [build-plan.md](build-plan.md) must list exactly the features of each phase, and no feature may need a feature of a later phase. Check both after every change (section 9.1).
- **Writing.** Simplified Technical English: short sentences, one idea per sentence, active voice, the same word for the same thing.
- **History** lives in git and in `../.agents/logs/`, not in `docs/`. `docs/archive/` holds superseded documents and governs nothing.

### 9.1 Checks

Relative links resolve:

```bash
for f in AGENTS.md README.md $(find docs -name '*.md' -not -path 'docs/archive/*'); do d=$(dirname "$f"); grep -oE '\][(][^)#]+' "$f" | sed 's/^\][(]//' | grep -vE '^https?:' | while read l; do [ -e "$d/$l" ] || echo "BROKEN $f -> $l"; done; done
```

Feature ids, gaps and phase order:

```bash
python - <<'PY'
import re
s = open("docs/features.md", encoding="utf-8").read()
rows = {m.group(1): (int(m.group(2)), m.group(3)) for m in re.finditer(r"^\| ([A-Z][0-9]+) \| .*? \| (\d+) \| [^|]*? \| [^|]*? \| ([^|]*?) \|$", s, re.M)}
for L in sorted({i[0] for i in rows}):
    n = sorted(int(i[1:]) for i in rows if i[0] == L)
    if n != list(range(1, len(n) + 1)): print("gap in", L, n)
for i, (ph, needs) in rows.items():
    for x in re.findall(r"\b[A-Z][0-9]+\b", needs):
        if x not in rows or rows[x][0] > ph: print(i, "needs", x)
print(len(rows), "features")
PY
```

## 10. Working with the owner

- The owner is an advocate. Never give legal, licensing or compliance advice. Record licence facts as facts when a task asks for them.
- **Assess or build.** When the owner asks for an assessment, assess and stop. Build only when the owner says so.
- **Say what you will do** in one line before you start. Give a one-line update every few steps. End with a short recap that stands alone: what you found, what you did, what is next.
- **Ask only for the owner's decisions.** Use the default in [questions.md](questions.md) for everything else, and add a new question there with its default.
- **Ideas outside the current phase** go to [parking.md](parking.md).
- **If the owner stops a command,** check what it changed (the working tree, `resources/`, the user data folders) before you continue. A stopped command may have finished.
- **Commits.** Small commits with clear messages, and the commit trailer your harness requires. Push nothing unless the owner asks.
- **Session records.** One file per piece of work in `../.agents/logs/<date>-<topic>.md`: what was done, the commands run and their results, and the evidence paths. No reasoning.

## 11. Boundaries

- Never read, copy or print secrets: `~/.pi/agent/auth.json`, `.env` files, keys, installed agent data.
- The reference repositories listed in [repo-map.md](repo-map.md) are read only. Read a file there only when a task names it.
- Vendored Euro-Office files are never modified.
- Pi's built-in tools stay off in every session and every helper agent (decision 2, harness-hardening H-28).
- The application never solves a CAPTCHA, never holds court credentials, never submits a filing on its own, and never uses a bot-detection evasion build of any browser engine.
- Automation never shows modal dialogs. A headless run writes errors to a log and exits non-zero.

## 12. Known pitfalls

1. **Escaped newlines in scripted edits.** A Python string with `"\n"` written into TypeScript becomes a real line break and breaks the build. Use the Edit tool, or `String.fromCharCode(10)`.
2. **A renderer build failure after two successes.** `npm run build` builds three bundles. Count the "built in" lines, or read the whole output.
3. **Tool order.** Pi's active tool list is not in a fixed order. Compare sorted lists.
4. **Extension tools in tool lists.** The session's tools include the tools of Pi's built-in MCP, codemode and tool-search extensions. Tests filter them with `EXTENSION_TOOL` in `tests/e2e/app.spec.ts`.
5. **A refused tool.** The tool policy refuses a call in Pi's `tool_call` hook: the model gets the refusal as an error result. A tool with a deny rule is also hidden when the conversation opens, so a test of the refusal itself must set the rule after the conversation opened, or call the tool through `ctx.executeTool`.
6. **The scripted model.** End-to-end tests set `OPENADVO_TEST=1` and call `__openadvoTest.setModelScript({ agent: [...], helper: [...], skill: [...], side: [...] })`. A request goes to the queue whose marker is in its prompt (helper, skill run, side question; else agent). Each queue gives one step per model request; `hold` waits for `releaseModel(name)`. `modelSeen()` returns the requests. The test timeouts `OPENADVO_TEST_HELPER_TIMEOUT_MS`, `OPENADVO_TEST_HELPER_WAIT_MS` and `OPENADVO_TEST_APPROVAL_TIMEOUT_MS` apply only under `OPENADVO_TEST=1`.
6. **`getAgentDir()`.** Set `PI_CODING_AGENT_DIR` before loading extensions in a test. Otherwise their files land in the owner's `~/.pi/agent`.
7. **npm from Node on Windows.** Start npm with `spawnSync("npm", args, { shell: true })`, as `src/main/pi-extensions.ts` does for an added package. Node prints a deprecation warning (DEP0190) for this; the arguments are fixed strings, so it is safe here.
8. **Heredocs with apostrophes.** The shell can reject a long heredoc that contains `'`. Write the script to a file and run the file.
9. **Merged ids.** When you merge features, map the merged id to its survivor in every document, not only in the catalogue.
10. **Pi's stand-in model.** A session with no model holds a stand-in named `unknown/unknown`, so `session.model` is never empty. Use `sessionModel()` in `src/main/agent.ts`.
11. **Closing a session.** Pi's `session.dispose()` does not send `session_shutdown`, so extensions keep their sockets open and a test process never exits. Close sessions with `closeSession()` in `src/main/agent.ts`.

## 13. Checklists

**Before a phase starts:**
- the phase's features and exit, read in [build-plan.md](build-plan.md);
- the module's spec in [specs/](specs/), with feature ids, inputs, outputs, checks and the owner's exit task;
- the spikes the phase needs, done, with a result file in `spikes/`.

**A module is done when:**
- every feature in its scope works in the window;
- its unit and end-to-end tests pass, with the output recorded;
- the owning documents are updated, with clean numbering;
- the owner has completed the phase exit on a real brief (lesson L3).

**Before a session ends (clean state):**
- `npm run session:start -- --unit` exits 0, and the suites of section 8.4 that apply were run, with the output recorded;
- no debug output, temporary files or commented-out code is left in the diff;
- everything is committed;
- the handoff is written from [../.agents/templates/session-handoff.md](../.agents/templates/session-handoff.md): what is verified, what changed, what is broken or not verified, the next step with what counts as done, and the commands. It goes into the successor prompt in `../.agents/prompts/`.

**Before each commit:**
- `npm run typecheck`, and the tests for what changed;
- the link and id checks (section 9.1), if docs changed;
- no secrets, no vendored files, no `scratchpad/` content in the diff (`git status`);
- the session record written.

# Prompt: continue implementing the specs, with screenshots

Copy the prompt into a fresh agent session (Sonnet 5.5 or another coding model), one session per build step. Replace `{STEP}` and `{SCOPE}`, or keep the filled example at the end, which is the next step after the initial commits.

## Prompt

```text
You are continuing the implementation of Open Advocate, a Rust desktop application for Indian advocates. The design is settled. Build what the specs say, test it, run the app, look at it, and report. Do not redesign.

WHERE THINGS STAND
The repository is github.com/asimog/openadvo, branch main. Already built and tested (46 tests, fmt and clippy clean):
- crates/oa-types, oa-store, oa-kernel: matters, registry, settings, jobs, the hash-chained ledger, the single commit path, evidence and blob store, draft revision graph with checkpoints and restore, approvals bound to a revision.
- crates/oa-protocol, oa-control, oa-client: the control protocol over a Windows named pipe. The kernel decides each connection's origin; a process in the harness Job Object is always `harness`.
- crates/oa-cli: the `oa` binary (in-process kernel by default, `--connect` for a running kernel, `oa kernel serve`, `oa schema`, `oa call`).
- crates/oa-shell: the egui window. Matters sidebar, matter pane, review inbox, Ctrl+K command list, status bar. It starts `oa kernel serve` when none is running.
- scripts/screenshot-shell.ps1: runs the shell against a throwaway workspace and saves a PNG of its window.

TASK
Build step: {STEP}
Scope: {SCOPE}

READ FIRST, IN THIS ORDER, AND NOTHING ELSE UNTIL YOU NEED IT
1. AGENTS.md and CLAUDE.md.
2. docs/specs/README.md, including "GUI conventions shared by every group".
3. The spec or specs named in the scope, whole.
4. docs/decisions.md sections 2 and 3, and only the ids your spec lists (grep for them).
5. The crates you will change. Read their lib.rs and the tests first.
Do not read docs/report.md. Do not read the Macro reference.

HOW TO WORK
- CLI first, then GUI. A view is a client of commands that already exist and are tested. Never give a view logic the CLI cannot reach.
- Every item in a view opens the Inspector (A16). Every query command gets a view (A-AC-16). Keep view logic in plain, egui-free model code that unit tests can reach, as crates/oa-shell/src/model.rs does.
- Every [AUTO] acceptance criterion in scope gets a test named with its id. Never weaken, skip or delete a test, or add a lint suppression, to get to green.
- Keep the wgpu renderer (`eframe::Renderer::Wgpu`). The glow renderer draws a black window on the development machine.
- If a spec is ambiguous or two documents disagree, stop and ask. If code depends on an open question (OQ-xx), use its working decision and say so.

RUN THE APP AND LOOK AT IT
A view is not done until you have looked at a screenshot of it. A process that is running proves nothing: the first shell build ran for minutes with a black window and passed a liveness check.

1. Build: `cargo build -p oa-shell -p oa-cli`.
2. Capture the live window, from PowerShell:
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\screenshot-shell.ps1 -Seed -Out target\screenshots\<name>.png
   -Seed creates three matters first. -WaitSeconds sets how long to wait after the window appears. -Keep leaves the shell running. -Args passes arguments to oa-shell.
3. Open the PNG with your file-reading tool and look at it. Check it against the spec's GUI table: every listed view is present, labels are readable, nothing is clipped, the status bar is visible, empty and error states say what they mean.
4. To capture a state the live app cannot reach on demand (an error, a long list, a disputed token), add it to the view's gallery (A17): `oa-shell --gallery <view>` renders the view in fixture states with no kernel. Add `--screenshot <png>` to the gallery mode using eframe's own capture (`egui::ViewportCommand::Screenshot`, answered by an `egui::Event::Screenshot` with the image), so galleries capture without the screen. Check the eframe 0.31 docs for the exact types before writing it.
5. Drive interactions through the CLI where you can (`oa --connect ...` changes state, then capture again). Where only clicking can show it, describe the click in the report and ask the user to confirm, or use the computer-use tools if this session has them.
6. Put every screenshot you rely on in target/screenshots/ (it is gitignored) and list them in the report.

A CLEAN MACHINE
The development machine is Windows 10 Home, which has neither Windows Sandbox nor Hyper-V. Do not install VirtualBox, VMware or any hypervisor without asking.
- For a clean-machine check, add a GitHub Actions workflow at .github/workflows/windows.yml on `windows-latest` that runs `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --all -- --check`, builds the shell, runs scripts/screenshot-shell.ps1 -Seed, and uploads target/screenshots as an artifact. The runner has no GPU, so wgpu falls back to a software adapter; if the capture is black there, say so rather than hide it.
- Pushing the workflow is an outward action. Ask before pushing.

DONE MEANS
- Every [AUTO] criterion in scope has a passing test named with its id.
- `cargo test --workspace`, `cargo fmt --all -- --check` and `cargo clippy --workspace --all-targets -- -D warnings` pass.
- Every view in scope has a screenshot you have looked at, live or from its gallery.
- No commit and no push unless I ask.

REPORT
1. A table of acceptance criteria in scope: id, test name, pass or fail.
2. A table of views in scope: view, screenshot path, what you checked, anything wrong you saw.
3. The [HUMAN] criteria still needing a person, including the clicks you could not drive.
4. Stubs created, and which group will replace each.
5. Open questions hit, and the working decision used.
6. Anything in a spec you think is wrong, with the line.
```

## Filled example: finish the spec A shell, and the queries it needs

```text
Build step: finish the spec A window, and the C and E queries its views need.
Scope:
- C17 link index and `oa inspect <id>`, `oa links out|in <id>` (spec C rules 18 and 19, criteria C-AC-20 and C-AC-21).
- `oa find` (spec E rule 10, criterion E-AC-11).
- The Inspector (A16) on every item of every existing view, built on `oa inspect` (spec A rule 14, criterion A-AC-17).
- Pane layout with three splits and back and forward history (A02, spec A rule 16, criterion A-AC-18).
- The review inbox split into Signal and Noise, keyboard operable (spec A rule 17, criterion A-AC-19).
- The command bar ranked by frecency, issuing only registered commands (spec A rule 18).
- The view registry and the parity test (spec A rule 15, criterion A-AC-16).
- Galleries with `--gallery <view>` and `--screenshot <png>` (A17, criterion A-AC-22).
- The status bar showing the decided origin and kernel connection loss within 2 seconds (A-AC-20).
- Views for the existing kernel queries: ledger timeline, evidence, draft history, approvals board, rejected writes, jobs, settings (spec C GUI table, criteria C-AC-17 to C-AC-19).
Out of scope: the Notebook, viewer and agent panes (H, J, D), voice, browser and desktop control.
```

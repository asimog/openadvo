# Agent instructions

Open Advocate is an agent-operated litigation workspace for Indian advocates, built as one Rust desktop application. The design is settled in `docs/`. The implementation is large, so read only what your task needs.

## Ignored folders

`.kilo/` and `.pstack-build/` hold tool configuration and tool build output. They are not part of the product.

- Do not read, search, index, modify or delete anything in them.
- They are listed in `.gitignore`. Never commit them.
- Access them only when the user explicitly tells you to.

## Read only what the task needs

Loading all the docs fills the context with material the task does not use, and the parts that matter get lost. Follow this order and stop as soon as you have what you need.

1. **Find the component group.** Every task belongs to one or more groups, A to R, or U for the validator. The ids are in `docs/component-map.md` (for example `G07`, `K14`). Use grep for the id, and do not read the whole map.
2. **Read `docs/specs/README.md`.** It holds the build order and the conventions every spec shares: command classes, CLI output and exit codes, identifiers, time, the five test kinds and their status words, and the GUI conventions.
3. **Read the one spec for your group**, in `docs/specs/`. Its status line and the status column of its tests say what is done and what remains. Read a second spec only when yours names it under "Depends on" and you need its interface.
4. **Look up decisions by id, do not read the whole file.** Each spec lists the decision ids it implements (`RQ-xx`, `X-xx`, `H-xx`, `L-xx`, `OQ-xx`, `PH-xx`, `P1` to `P9`). Grep `docs/decisions.md` for those ids. Read `docs/decisions.md` section 3 (terms) once per session.
5. **Read `docs/architecture.md` only for cross-group work**, and then only the section you need (processes, storage, the window, the build order). The advocate's workflow is in `docs/advocate-workflow.md`; read the section you need.
6. **Read `docs/ULOSarchitecture.md` only for group U or K**, the validator and the verification adapter.
7. **Do not read `docs/archive/`** unless the user asks why a decision was made. It holds the question history and the phase 1 build reports, and governs nothing.

Other habits that keep the context clean:

- Work on one component group per session. When you finish a group, start a fresh session for the next one rather than carrying the old context.
- Use grep with ids and read files in ranges. Do not open a large file whole to find one row.
- Delegate wide searches to a sub-agent and keep only its conclusion.
- Do not copy spec text into code comments. Reference the acceptance criterion id instead, for example `// G-AC-03`.
- If a summary of earlier work is in your context, trust the ids in it and re-read the cited spec lines, not the whole doc.

## Which document wins

`docs/decisions.md` governs. Then the spec for the group. Then `docs/architecture.md`, `docs/component-map.md` and `docs/advocate-workflow.md`. `docs/ULOSarchitecture.md` governs the standard. `docs/archive/` governs nothing. If two documents disagree, stop and tell the user. Do not pick one silently.

## Rules every change must keep

These are settled. Do not trade them away to make something work.

- **Stack.** Rust. egui and winit for the shell. No Tauri, no TypeScript, no Electron.
- **CLI first.** Every capability is a set of typed control commands, usable from the `oa` CLI before it has a view. The window is a client of the same protocol and depends on `oa-protocol`, never on the kernel.
- **The kernel is the only writer** of canonical state. The harness and every capability propose through the kernel's single commit path.
- **Human-only commands.** Approvals, filing confirmations, review-item skips, OCR decisions, typed copies, voice and limitation confirmations, attestations and browser attachment are `human` class. The kernel refuses them from the harness. Never add a path that lets the agent issue one.
- **One validator.** `ulos` is a separate binary, deterministic, with no model. Verification records come only from it. The verification adapter holds no check code. Only the Supreme Court portal, through `ulos`, verifies a citation. The AWS catalogue is outside the standard, for research and the quick check only.
- **Separate processes.** The harness, each OCR engine, each browser profile, WordCraft, PdfCraft and `ulos` run as their own supervised processes.
- **Full integration.** Production uses the real vendored dependency. A stand-in exists only as a test double in tests, behind a seam with a real adapter. Never ship a stub.
- **The window.** A collapsible left pane, the chat pane (the one orchestrator), and the view pane with one to three splits. No status bar. Every view draws through the UI module, and every human-class control through its human control.
- **DOCX, then PDF/A.** Drafting and verification happen on DOCX. The approved DOCX is converted to PDF/A for filing, the conversion is checked against the DOCX, and the PDF is never edited.
- **Everything is inspectable.** Every query command has a GUI view, and every item in a view opens the Inspector. A new query without a view, or a view item the Inspector cannot open, is not done (P9, docs/specs/README.md "GUI conventions").
- **Honest states.** Never show `verified` for anything the validator did not verify. Never retry an external effect whose outcome is `unknown` before reconciling it.
- **Vocabulary.** Use the terms in `docs/decisions.md` section 3: "matter workspace", "draft", "verification proof", "verified" only for a validator outcome.

## Tests

- Every test row in a spec (acceptance, GUI, visual, end to end, contract) gets a test whose name contains its id in snake case, for example `g_ac_03_date_digit_mismatch_disputes` or `a_gui_01_collapsing_the_view_pane`.
- A row is `done` only when its test passes against the real dependency. Update the row's status, and the spec's status line, in the same change as the code.
- List the `[HUMAN]` criteria a change touches in its summary, so a person can review them.
- Never weaken, skip or delete a test, loosen a threshold, or add a suppression to get to green. If a test is wrong, say so and ask.
- Kill tests, the loop conformance fixtures and every contract test are release gates. Run them for any change in groups C, D, G, J, K, L, M or Q.

## Changing the docs

- A design change goes into `docs/decisions.md` first, then into the spec and the other docs it touches, in the same change.
- One copy of each fact. The workflow lives only in `docs/advocate-workflow.md`, the build order only in `docs/architecture.md` and `docs/specs/README.md`, and status only in the specs.
- Docs state the current design. Do not write what changed, when, or why into a doc; that goes in `decisions.tsv` and the commit message.
- Do not settle an open question (`OQ-xx`) on your own. Code against its working decision, and tell the user when the code depends on it.
- Keep ids stable. New items take the next free id. Never renumber.
- No em dashes, no curly quotes.
- Append a row to `decisions.tsv` for each design decision or doc change you make: UTC time, kind, what, why, evidence, status, tab separated.

## Git

- Commit only when the user asks. The main branch is `main`.
- Never commit `.kilo/`, `.pstack-build/`, secrets, or matter data.

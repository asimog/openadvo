# Prompt template: implement one spec

Copy the template into a fresh agent session, one session per component group. Replace every `{PLACEHOLDER}`. A filled example for spec A is at the end.

## Template

```text
You are implementing one component group of Open Advocate, a Rust desktop application. The design is settled. Your job is to build what the spec says, test it, and report. Do not redesign.

TASK
Implement {SCOPE_IDS} from docs/specs/{SPEC_FILE}.
Out of scope for this session: {OUT_OF_SCOPE}.

READ FIRST, IN THIS ORDER, AND NOTHING ELSE UNTIL YOU NEED IT
1. AGENTS.md (the repo rules, including the reading order).
2. docs/specs/README.md (shared conventions: command classes, CLI output, exit codes, identifiers, time, test tags).
3. docs/specs/{SPEC_FILE} (your spec).
4. docs/decisions.md section 3 (terms) and section 2 (principles P1 to P8).
5. Only the decision ids your spec lists under "Decisions implemented": grep docs/decisions.md for each id and read that row.
Do not read docs/report.md. Do not read other specs unless your spec's "Depends on" names them and you need an interface. If you do, read only the CLI and Rules sections of that spec.

DEPENDENCIES
{DEPENDENCIES}
Where a dependency is not built yet, put a trait at the boundary and a minimal implementation behind it, and list it in your report as a stub. Do not implement another group's rules inside this group.

HOW TO WORK
- CLI first. Every command in the spec's CLI table is an `oa` subcommand before any pane exists. The spec's GUI section comes after its commands, and follows the GUI conventions in docs/specs/README.md: every query has a view, and every item opens the Inspector. `--json` gives one JSON object per line on stdout and nothing else. Use the exit codes in docs/specs/README.md.
- Every command has exactly one class: query, internal, external or human. internal and external commands take an idempotency key. human commands are refused on harness connections.
- Rules in the spec are normative. Each numbered rule must be traceable to code and, where it is testable, to a test.
- Every [AUTO] acceptance criterion in scope gets an automated test whose name contains the criterion id, for example `a_ac_01_create_order_survives_kill`.
- Never weaken, skip or delete a test, loosen a threshold, or add a lint suppression to get to green. If a criterion looks wrong or impossible, stop and say so.
- If the spec is ambiguous or two documents disagree, stop and ask. Do not pick silently. If the code depends on an open question (OQ-xx), use its working decision and note it.
- Keep each crate small and its public interface narrow. Domain code depends on repository traits, never on rusqlite or raw paths (spec R).
- Rust stable, cargo workspace, `cargo fmt` and `cargo clippy -- -D warnings` clean. No Tauri, no TypeScript, no Electron.
- Windows 10 is the first target. Paths may contain spaces and non-ASCII characters.

PLAN BEFORE CODE
Before writing code, reply with a short plan: the crates and modules you will create or touch, the commands you will implement, the acceptance criteria you will cover, the stubs you will need, and any question. Wait for approval.

DONE MEANS
- Every command in scope works from the `oa` CLI with --json.
- Every [AUTO] criterion in scope has a passing test named with its id.
- `cargo test`, `cargo fmt --check` and `cargo clippy -- -D warnings` pass.
- No commit unless I ask.

REPORT
End with:
1. A table of acceptance criteria in scope: id, test name, pass or fail.
2. The [HUMAN] criteria in scope that a person must still check.
3. Stubs created, and which group will replace each.
4. Open questions you hit, and the working decision you used.
5. Anything in the spec you think is wrong, with the line.
```

## Filled example: spec A, first session

Spec A depends on the kernel (C) and the stores (E), which do not exist yet. Build order step 1 builds the minimum of all three behind traits, as CLI commands, with no window. The panes in A come after the control protocol (spec B).

```text
You are implementing one component group of Open Advocate, a Rust desktop application. The design is settled. Your job is to build what the spec says, test it, and report. Do not redesign.

TASK
Implement the CLI-only part of spec A (shell and workspace), which is build order step 1 in docs/component-map.md:
- A03 workspace and matter creation: `oa workspace init`, `oa matter create`, `oa matter list`, `oa matter open`, `oa matter archive`, `oa matter rename`, `oa registry rescan`.
- A10 settings, firm layer only: `oa settings get`, `oa settings set`, with the legal layer read only.
- A11 long jobs: the job record, progress and cancel, enough for A-AC-12.
- Spec A rules 1, 2, 3, 4, 5 and 10.
- Acceptance criteria A-AC-01, A-AC-02, A-AC-03 (the scan part only, no panes), A-AC-04, A-AC-05, A-AC-10, A-AC-12, A-AC-14.
- Create the cargo workspace. There is no code in the repository yet.

Out of scope for this session: every pane and the window (A01, A02, A04 to A09, A12 to A15), the control protocol (spec B), the harness (spec D). Commands run in-process from the `oa` binary for now, behind a client trait that spec B will later back with the named pipe.

READ FIRST, IN THIS ORDER, AND NOTHING ELSE UNTIL YOU NEED IT
1. AGENTS.md (the repo rules, including the reading order).
2. docs/specs/README.md (shared conventions: command classes, CLI output, exit codes, identifiers, time, test tags).
3. docs/specs/A-shell-workspace.md (your spec).
4. docs/decisions.md section 3 (terms) and section 2 (principles P1 to P8).
5. Only the decision ids your spec lists under "Decisions implemented": grep docs/decisions.md for each id and read that row.
6. The "Workspace layout on disk" section of docs/component-map.md.
Do not read docs/report.md. Read other specs only where named below, and only their CLI and Rules sections.

DEPENDENCIES
- Spec C (kernel), minimum only: C01 single commit path, C03 workspace registry, C07 ledger with genesis event, per-matter sequence and hash chain, C13 rejected-write audit table. Read the Rules section of docs/specs/C-kernel.md, rules 1, 3, 5, 12 and 17.
- Spec E (stores), minimum only: E01 `registry.db` and `matter.db` with migrations, `firm.db` with just the contacts table A-AC-05 needs. Read the Files table and rules 1 and 2 of docs/specs/E-stores.md.
- Spec R: domain code depends on repository traits. Read the rules of docs/specs/R-cloud-seams.md.
- Connection origin (`ui`, `cli`, `harness`, `test`): spec B rule 3. For now the origin is a parameter of the in-process client, so A-AC-04 can be tested with origin `harness`.
Where a dependency is not built yet, put a trait at the boundary and a minimal implementation behind it, and list it in your report as a stub. Do not implement another group's rules inside this group.

HOW TO WORK
- CLI first. Every command in the spec's CLI table is an `oa` subcommand before any pane exists. The spec's GUI section comes after its commands, and follows the GUI conventions in docs/specs/README.md: every query has a view, and every item opens the Inspector. `--json` gives one JSON object per line on stdout and nothing else. Use the exit codes in docs/specs/README.md.
- Every command has exactly one class: query, internal, external or human. internal and external commands take an idempotency key. human commands are refused on harness connections.
- Rules in the spec are normative. Each numbered rule must be traceable to code and, where it is testable, to a test.
- Every [AUTO] acceptance criterion in scope gets an automated test whose name contains the criterion id, for example `a_ac_01_create_order_survives_kill`.
- A-AC-01 and the kernel's atomicity need fault injection: add a test-only hook that aborts between steps, so a test can kill the operation between any two steps.
- A-AC-14 is a docs check: a test that compares sections 1 to 12 of docs/architecture.md and docs/advocate-workflow.md after stripping heading markers and blank lines.
- Never weaken, skip or delete a test, loosen a threshold, or add a lint suppression to get to green. If a criterion looks wrong or impossible, stop and say so.
- If the spec is ambiguous or two documents disagree, stop and ask. Do not pick silently. If the code depends on an open question (OQ-xx), use its working decision and note it.
- Keep each crate small and its public interface narrow. Domain code depends on repository traits, never on rusqlite or raw paths (spec R).
- Rust stable, cargo workspace, `cargo fmt` and `cargo clippy -- -D warnings` clean. No Tauri, no TypeScript, no Electron.
- Windows 10 is the first target. Paths may contain spaces and non-ASCII characters. Test with such a path.

PLAN BEFORE CODE
Before writing code, reply with a short plan: the crates and modules you will create, the commands you will implement, the acceptance criteria you will cover, the stubs you will need, and any question. Wait for approval.

DONE MEANS
- Every command in scope works from the `oa` CLI with --json.
- Every [AUTO] criterion in scope has a passing test named with its id.
- `cargo test`, `cargo fmt --check` and `cargo clippy -- -D warnings` pass.
- No commit unless I ask.

REPORT
End with:
1. A table of acceptance criteria in scope: id, test name, pass or fail.
2. The [HUMAN] criteria in scope that a person must still check.
3. Stubs created, and which group will replace each.
4. Open questions you hit, and the working decision you used.
5. Anything in the spec you think is wrong, with the line.
```

## Filling the template for later groups

| Placeholder | How to fill it |
|---|---|
| `{SPEC_FILE}` | The spec's file name in `docs/specs/` |
| `{SCOPE_IDS}` | The component ids and acceptance criteria for this session. Follow the build order in `docs/component-map.md`, and keep one session to what fits one build step |
| `{OUT_OF_SCOPE}` | The rest of the group, named by id, so the agent does not wander into it |
| `{DEPENDENCIES}` | Each group from the spec's "Depends on" list: whether it is built, and if not, which of its rules the stub must honour, by number |

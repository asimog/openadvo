# Prompt template: implement one spec

Copy the template into a fresh session, one session per component group. Replace every `{PLACEHOLDER}`.

```text
You are implementing one component group of Open Advocate, a Rust desktop application. The design is settled. Build what the spec says, test it, and report. Do not redesign.

TASK
Implement {SCOPE} from docs/specs/{SPEC_FILE}: every row whose status is `remaining` in scope.
Out of scope: {OUT_OF_SCOPE}.

READ FIRST, IN THIS ORDER, AND NOTHING ELSE UNTIL YOU NEED IT
1. AGENTS.md.
2. docs/specs/README.md: conventions, test kinds, status words, GUI conventions.
3. docs/specs/{SPEC_FILE}.
4. docs/decisions.md section 3 (terms), then only the decision ids the spec lists: grep each id.
Read another spec only if yours names it under "Depends on" and you need its interface, and then only its CLI and Rules.

HOW TO WORK
- CLI first. Every command in the spec's CLI table works from `oa`, with `--json`, before its view.
- Full integration. Production code uses the real dependency. A stand-in is allowed only as a test double behind a seam that has a real adapter. If a dependency is not built yet, stop and say so; do not ship a stub (PH-06).
- Views live in the view pane, draw through the UI module (`oa-shell/src/ui/`), and depend on `oa-protocol`, never the kernel. Every human-class control uses the UI module's human control.
- Every test in the spec's Tests section that is in scope gets a test whose name contains its id in snake case: acceptance (`g_ac_03_...`), GUI (`g_gui_01_...`), visual (`g_vis_01_...`), end to end (`g_e2e_01_...`), contract (`g_ct_01_...`).
- Never weaken, skip or delete a test, loosen a threshold, or add a suppression to get to green. If a criterion looks wrong, stop and say so.
- If the spec is ambiguous or two documents disagree, stop and ask. If the code depends on an open question (OQ-xx), use its working decision and say so.
- `cargo test`, `cargo fmt --check` and `cargo clippy -- -D warnings` pass. Run the release gates in docs/specs/README.md when the group is C, D, G, J, K, L, M or Q.

PLAN BEFORE CODE
Reply first with a short plan: crates and modules touched, commands, tests by id, vendored dependencies needed, questions. Wait for approval.

DONE MEANS
- Every test in scope passes against the real dependency.
- The spec's status line and each test row's status are updated in the same change. Nothing else in the docs records what changed.
- No commit unless asked.

REPORT
1. Tests in scope: id, test name, pass or fail.
2. [HUMAN] criteria in scope that a person must still check.
3. Open questions hit and the working decision used.
4. Anything in the spec you think is wrong, with the line.
```

| Placeholder | How to fill it |
|---|---|
| `{SPEC_FILE}` | The spec's file name in `docs/specs/` |
| `{SCOPE}` | Component ids and test ids for this session, from one build step in docs/specs/README.md |
| `{OUT_OF_SCOPE}` | The rest of the group, by id |

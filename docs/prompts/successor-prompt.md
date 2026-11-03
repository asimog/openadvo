# Successor prompt: continue Open Advocate, specs F to J

Paste into a fresh session. Goal: implement specs A to J, push to main between groups, write reports, pick best choices, do not stop. Read AGENTS.md, CLAUDE.md, docs/specs/README.md and docs/prompts/continue-implementation.md first.

## State at handover (main is pushed up to commit 4992167)

Done and tested (106 tests, fmt and clippy clean at that commit):
- C and E queries: `oa inspect`, `oa links out|in` (derived from the ledger, crates/oa-kernel/src/links.rs), `oa find` (find.rs), `settings.list`, `approval.list`. Tests c_ac_19/20/21, e_ac_11, a_ac_21.
- A shell (crates/oa-shell): left sidebar with the inbox minimized, no right panel; views registry (views.rs) with parity test A-AC-16; Inspector drawer; pane splits and history (layout.rs); command bar with frecency (bar.rs); connection monitor (conn.rs); galleries with `--gallery <view> --screenshot <png>` (gallery.rs). Screenshots in target/screenshots (gitignored): gallery-*.png and live-shell.png, all looked at.
- D harness: crates/oa-session (SessionStore trait, MemSession), crates/oa-harness (the one turn loop in runner.rs, tools/policy, router, context manifests, replay, playbooks, supervision), SQLite session in crates/oa-store/src/session.rs, CLI `oa agent|tools|playbook|services` (crates/oa-cli/src/harness_cmds.rs, CLI-local until D15). D-AC-01 to 21 AUTO covered, C-AC-03 and D-AC-11 in oa-repo-checks.
- decisions.tsv has rows for each design choice made.

In progress, uncommitted: crates/oa-capture (Cargo.toml, fixtures/sc_case_ok.html, sc_case_changed.html, sc_captcha.html) and the workspace entry in Cargo.toml. No src yet. Either finish or `git checkout Cargo.toml` and delete the crate.

## Plan for F (spec docs/specs/F-capture-ingest.md)

1. oa-capture src: formats (magic bytes, encrypted PDF via /Encrypt, macro flag via vbaProject.bin, renamed .pdf that is DOCX), classify, court codes `{scheme,code,label}` round trip, fixture portal adapter (parse `id="case-orders"`, else `adapter_degraded`), driver with a BrowserPort trait (never types into the CAPTCHA, state `captcha_pending`, one solve reused), email triage that can only propose imports, text fingerprint.
2. oa-store: migration for `captures` and `ingest` tables, MatterWrite variants, trait methods.
3. Kernel: `capture.commit` accepted only for a new Origin::Capture (never produced by the pipe, so harness is refused and audited, F-AC-03); evidence.add also detects format and writes an ingest row; `ingest.set_text`; queries `capture.status`, `ingest.status`, `evidence.duplicates`, `codebook.show`, `adapter.health`. Tests F-AC-01, 02, 03, 06, 07, 10, 13.
4. CLI: `oa import`, `oa capture status`, `oa ingest status`, `oa codebook show`.
5. Shell: a view for each new query (parity test fails otherwise), inbox sources for encrypted files, possible duplicates and degraded adapters (F-AC-15), gallery fixtures, screenshots.

## Then G, H, I, J

Same method: read the spec, build pure logic and kernel/CLI first, then views with galleries and looked-at screenshots, a test named with each [AUTO] criterion id, honest stubs listed (real OCR engines, browser, provider adapters, Word editing need human or later work). Commit and push after each group.

## Known gotchas

- Large bash heredocs failed repeatedly in this environment. Write files with the Write tool and edit with small Python scripts saved to the scratchpad.
- `git add -A` is fine; .kilo and .pstack-build are ignored. Do not commit the planned .github/workflows/windows.yml without asking (outward action); it is not written yet.
- Never weaken tests or add lint suppressions. Fix clippy by refactoring (e.g. type aliases).
- Open questions used with working decisions: OQ-14 (restricted matters stay local), approval.decide from origin ui skips the terminal prompt (review with H-09). The SLP playbook stages come from advocate-workflow.md section 1.

## Report owed

Write docs/build-report.md: AC table (id, test, pass), views table (screenshot path, what was checked), [HUMAN] criteria, stubs and the group that replaces each (provider adapter D03, supervisor D15, real portal selectors M, OCR G), open questions, spec issues.

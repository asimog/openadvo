# Build report: spec F, capture and ingest

Build step 4. Main is pushed with this report. The next group is G (OCR and
document intelligence); F hands each file to it through the ingest row.

## Acceptance criteria in scope

| ID | Test | Result |
|---|---|---|
| F-AC-01 | `f_ac_01_import_and_capture_of_the_same_bytes_is_one_blob_with_two_origins` | pass |
| F-AC-02 | `f_ac_02_a_capture_record_holds_the_urls_time_hash_profile_and_gesture` | pass |
| F-AC-03 | `f_ac_03_a_capture_record_from_a_harness_connection_is_refused_and_audited` | pass |
| F-AC-04 | `f_ac_04_a_captcha_pauses_capture_and_no_automation_types_into_it` | pass |
| F-AC-05 | `f_ac_05_one_solved_session_captures_the_listing_and_all_orders` | pass |
| F-AC-06 | `f_ac_06_a_renamed_pdf_that_is_really_a_docx_is_ingested_as_docx` | pass |
| F-AC-07 | `f_ac_07_an_encrypted_pdf_is_blocked_after_hashing_and_gets_a_review_item` | pass |
| F-AC-08 | `f_ac_08_a_changed_fixture_shape_fails_the_contract_and_degrades_health` | pass |
| F-AC-09 | `f_ac_09_email_text_cannot_change_permissions_or_file_a_petition` | pass |
| F-AC-10 | `f_ac_10_two_scans_with_the_same_ocr_text_are_a_duplicate_review_and_both_kept` | pass |
| F-AC-11 | `f_ac_11_a_case_type_code_round_trips_with_its_verbatim_label` | pass |
| F-AC-12 | release check against the live portal for three real cases | **HUMAN**, not run |
| F-AC-13 | `f_ac_13_every_evidence_entrys_inspector_shows_its_capture_record_and_hash` | pass |
| F-AC-14 | `f_ac_14_a_captcha_wait_appears_in_the_capture_queue_immediately` | pass |
| F-AC-15 | `f_ac_15_a_degraded_adapter_is_signal_in_the_inbox` and `f_ac_15_a_degraded_adapter_is_a_banner_in_the_capture_queue` | pass |

The contract test for the fixture portal also runs as
`f_ac_08_a_changed_fixture_shape_fails_the_contract_and_degrades_health`, and the
email-only-proposes rule as
`f_ac_09_email_text_cannot_change_permissions_or_file_a_petition`.

## Views in scope

| View | Screenshot | What was checked |
|---|---|---|
| Capture queue | `target/screenshots/gallery-capture-queue.png` | Pending and CAPTCHA rows, failure reason, degraded-adapter banner. Empty state in the Empty gallery. |
| Inbox triage | `target/screenshots/gallery-ingest.png` | Document, format, readability, status and message; blocked encrypted row in the Disputed gallery. |
| Duplicates | `target/screenshots/gallery-duplicates.png` | Same-text kind, fingerprint and both kept scans side by side. |
| Court codebook | `target/screenshots/gallery-codebook.png` | Scheme, list version, code and verbatim label. |
| Adapter health | `target/screenshots/gallery-adapters.png` | Contract, runtime and detail; degraded banner. |
| Live shell | `target/screenshots/live-shell.png` | One left sidebar with matters and views, workspace table on the right, status bar visible. |

All five galleries render without a kernel. Each row opens the Inspector.

## [HUMAN] criteria still needing a person

- F-AC-12: capture against the live Supreme Court portal for three real cases.
  The visible browser and download interception are spec M; until then the
  driver is tested against the recorded fixture portal only.
- A real CAPTCHA solve in the visible browser and the recorded gesture. The
  fixture proves the driver focuses the browser and sends no input to the
  CAPTCHA field.
- OQ-13: choosing the first IMAP-compatible provider account. The working
  decision is one IMAP-compatible path, read only; the connector itself is not
  built here.

## Stubs and the group that replaces each

| Stub | Replaced by |
|---|---|
| Fixture portal adapter and fixture `BrowserPort` | M: the real visible browser and download interceptor |
| Real OCR text and document intelligence | G: ingestion hands each file to document intelligence |
| Email connector | OQ-13 decision and the later email adapter; F only triages text and proposes imports |
| Live portal contract test in CI | M and the release check; F runs the contract against recorded fixtures |

## Open questions hit

- OQ-13 (email providers): used the working decision "one IMAP-compatible path,
  read only". Email bodies and attachment text cannot change a permission or
  start a filing; only an import proposal is produced.
- L-07/RQ-64: capture records are created only by the browser supervisor. The
  control pipe never produces `Origin::Capture`, so a client or harness attempt
  is refused and audited.

## Spec issues

- The CLI table lists no command that creates a capture record. The browser
  supervisor needs one, so `capture.commit` is registered as an internal
  command and refused to every origin except `Origin::Capture`. It is not
  advertised as an advocate CLI command.
- The GUI table lists a Capture record view but no query command for one. The
  record is reachable through the Inspector on its evidence entry
  (`inspect`); a dedicated view can be added when M provides the browser
  handoff actions.


# Build report: spec G, OCR and document intelligence

Build step 5 (commit 869cd46), followed by a review pass. The OCR engines are
stubs across a real process boundary. Tesseract and PaddleOCR are not vendored
yet.

## Acceptance criteria in scope

| ID | Test | Result | Note |
|---|---|---|---|
| G-AC-01 | `g_ac_01_killing_an_engine_is_a_recorded_failure_not_a_panic` | pass | The engine exits by itself (fail_mode crash). No test kills it from outside, and no review item is asserted. |
| G-AC-02 | `g_ac_02_a_hanging_engine_is_killed_at_the_timeout` | pass | Tests the timeout kill. There is no malformed-image fuzz fixture yet. **Gap.** |
| G-AC-03 to 06 | `g_ac_03` .. `g_ac_06` (oa-ocr unit tests) | pass | |
| G-AC-07 | `g_ac_07_a_disputed_date_stays_open_until_the_advocate_decides` | pass | No Factual Matrix exists yet (spec H). Entities on open disputes are now marked `disputed`. H must refuse to confirm them. |
| G-AC-08 | `g_ac_08_ocr_decide_from_a_harness_connection_is_refused` | pass | |
| G-AC-09, 10 | `g_ac_09`, `g_ac_10` (oa-ocr) | pass | Library level only. `extract.entities` in the kernel still uses no header or portal anchor. |
| G-AC-11 to 14 | `g_ac_11` .. `g_ac_14` (oa-ocr) | pass | G-AC-12 is also covered end to end by `a_rerun_keeps_decisions_and_maps_old_line_hashes`. |
| G-AC-15 | `g_ac_15_the_review_view_shows_both_readings_and_the_decision_columns` | pass | [HUMAN] half: a decision is one action in the window. |
| G-AC-16 | `g_ac_16_*` (kernel and shell) | pass | |
| G-AC-17 | `g_ac_17_*` (kernel, shell, inbox) | pass | |

## Review findings fixed

- A line read by only one OCR engine was compared with itself and marked
  `agreed`. It is now disputed in full with reason `one_engine_empty`. Only a
  pdfium text-layer line may stand on one reading.
- Readings were assigned to a and b by arrival order. Reading a is now always
  Tesseract and reading b PaddleOCR.
- A re-run threw away every decision and typed copy, and kept no old line
  hashes. It now keeps unchanged decisions and typed copies, moves replaced
  lines to `superseded`, and records old-to-new hashes (`supersedes` in
  `ocr.lines`).
- `ocr.decide` could overwrite an earlier decision, accepted any reading word,
  and never lowered the document's dispute count or state. All three are fixed.
- The CLI took `--a`/`--b`, so `typed` could not be reached. It now takes
  `--reading a|b|typed` as the spec table says.
- The Pipeline view showed page counts from one document's lines. The new query
  `ocr.pipeline` gives each document's state, pages, open disputes and engine
  failures. Screenshot: `target/screenshots/gallery-ocr-pipeline.png`.

## Still open

- Party names are not passed to the agreement engine in the kernel (no party
  store until H). G-AC-05 holds in the library but not end to end.
- Engine failures and disputes do not yet create review items in an inbox
  queue of their own. The inbox reads open disputes directly.
- Real engines (vendored Tesseract and PaddleOCR), pdfium rasterising and the
  gold set run in CI are still to come (spec Q builds them).


# Build report: spec H, the Notebook

Build step 6, on top of the G review commit 051c43f. Nothing is committed.
New crate `oa-notebook` (pure logic), a `matter.db` migration, the kernel
module `notebook.rs`, `oa notebook ...` and `oa trace`, and six shell views.

## Acceptance criteria in scope

| ID | Test | Result | Note |
|---|---|---|---|
| H-AC-01 | `h_ac_01_every_item_in_the_fixture_matter_has_an_anchor_resolving_to_a_blob_region`, `h_ac_01_an_unresolved_anchor_is_refused_and_audited` | pass | |
| H-AC-02 | `h_ac_02_a_client_item_is_tagged_and_never_in_the_ulos_n_bundle` (kernel), `h_ac_02_client_items_never_enter_the_ulos_n_bundle` (oa-notebook), `h_ac_02_a_client_item_shows_supplied_by_client_and_never_verified` (shell) | pass | K builds the real bundle; it must use `oa_notebook::ulos_n_bundle`. |
| H-AC-03 | `h_ac_03_excluding_an_event_leaves_it_in_other_views_and_in_the_facts`, `h_ac_03_*` (oa-notebook) | pass | |
| H-AC-04 | `h_ac_04_two_documents_with_different_dates_for_one_order_raise_one_conflict`, `h_ac_04_*` (oa-notebook) | pass | |
| H-AC-05 | `h_ac_05_ready_is_false_while_a_job_runs_or_a_review_item_is_open` | pass | |
| H-AC-06 | `h_ac_06_skip_and_confirm_from_a_harness_connection_are_refused` | pass | Also covers `notebook.confirm` and `notebook.date_anchor`. |
| H-AC-07 | `h_ac_07_the_list_of_dates_leaves_out_disputed_inferred_unconfirmed_and_unresolved_dates`, `h_ac_07_*` (oa-notebook) | pass | Tested on the eligibility filter (`--for-prose`). The generator is J10. |
| H-AC-08 | `h_ac_08_a_correction_leaves_the_earlier_version_readable` | pass | |
| H-AC-09 | `h_ac_09_the_impugned_order_round_trips_to_the_lower_court_search`, `h_ac_09_*` (oa-notebook) | pass | Against a fixture page added in this step (stub). |
| H-AC-10 | none | [HUMAN] | |
| H-AC-11 | `h_ac_11_each_readiness_blocker_opens_its_item` (kernel and shell) | pass | |
| H-AC-12 | `h_ac_12_every_item_opens_its_source_peek_and_its_trace_chain` (kernel), `h_ac_12_every_item_row_opens_its_peek_and_then_its_trace` (shell) | pass | The peek is the Inspector record with the anchor region. The highlighted raster region is J's viewer. |
| H-AC-13 | `h_ac_13_excluded_events_show_under_show_excluded_and_stay_in_the_facts` (kernel), `h_ac_13_*` (oa-notebook, shell) | pass | |

G criteria closed end to end through H:

| ID | Test | Result |
|---|---|---|
| G-AC-05 | `g_ac_05_a_party_name_one_character_apart_is_a_dispute_end_to_end` | pass. Parties from the Notebook are passed to `agree` in `ocr.run` and to entity extraction. |
| G-AC-07 | `g_ac_07_a_disputed_date_cannot_be_confirmed_until_the_dispute_is_decided` | pass. Confirm is refused and audited, and a correction cannot clear the dispute. |
| G-AC-10 | `g_ac_10_portal_date_anchors_relative_dates_and_no_anchor_asks_once_per_file` | pass. The header date, then the portal date, then the advocate's answer. One question per file. |

Also `h_cli_notebook_commands_after_ocr` (oa-cli) drives every `oa notebook`
subcommand except `propose` and `correct` through the binary.

## Views in scope

| View | Covers | Screenshot | Checked | Seen wrong |
|---|---|---|---|---|
| Notebook | `notebook.show`, `notebook.item` | `target/screenshots/gallery-notebook.png` | counts per section, item rows with Court portal or Supplied by client, disputed in red, missing CNR banner, empty, loading and error states | none |
| Factual Matrix | `notebook.facts` | `target/screenshots/gallery-facts.png` | date, date type, event, source, method; OCR-disputed row red, confirmed green | At gallery quarter width, the Uncertainty, Conflicts and Status columns are clipped and the table scrolls. A full pane shows them. |
| Chronology | `notebook.chronology` | `target/screenshots/gallery-chronology.png` | view banner, excluded row muted and marked "excluded from synopsis" | The status text of the excluded row is clipped at quarter width. |
| Conflicts | `notebook.conflicts` | `target/screenshots/gallery-conflicts.png` | open red, resolved green, both sources listed | none |
| Readiness | `notebook.ready` | `target/screenshots/gallery-readiness.png` | "Not ready: N blockers" banner, one row per job, ingest, review item and OCR dispute; ready state | none |
| Trace | `trace` | `target/screenshots/gallery-trace.png` | extract, line, page, source hash, original file per anchor; unresolved anchor in red | none |

The screenshots are galleries (fixtures, no kernel). No live-window capture was
taken in this step.

## [HUMAN] criteria still needing a person

- H-AC-10: on a real matter, does the procedural history and Factual Matrix
  match what a lawyer reconstructs by hand?
- The human gestures in the window: "Confirm fact dated ..." on the Factual
  Matrix, "Skip review item: ..." with a reason on Readiness, exclude and restore
  on the Chronology, "Open each source side by side" on Conflicts. These were not
  clicked in this session.
- Keyboard-only operation of the new views (README GUI convention 5).

## Stubs and the group that replaces each

- Lower-court search: a fixture page and `search_lower_court` in `oa-capture`.
  Replaced by the portal adapter (M, with F's contract).
- Source peek: the Inspector record, which carries the anchor's page, line and
  box. The highlighted raster region comes with J's viewer.
- ULOS-N bundle: `oa_notebook::ulos_n_bundle` filters the court-portal
  component. K builds the real bundle (`oa verify notebook`) and U verifies it.
- List of Dates: H supplies the eligible events (`--for-prose`). The generator
  is J10.
- Writers: only the rules extraction writer (`notebook.extract`) and the generic
  `notebook.propose` exist. Procedural-history, authority and work-product
  writers come with I (research) and the portal adapter (M). No model-assisted
  candidates yet.

## Open questions hit

- OQ-04: dates that are not ISO, including the `01-01-1900` placeholder, are
  kept verbatim and sort after real dates. The placeholder is never used as a
  date anchor.

## Spec issues

- The CLI table has no writer or correction commands, but rules 3 and 12 need
  them, and G rule 8 needs a way to record the advocate's date answer. Added
  `notebook.propose`, `notebook.extract`, `notebook.correct` and the human
  command `notebook.date_anchor`.
- Rule 11 names `oa trace`, which spec C lists with C-AC-14 on a petition
  paragraph anchor. Here `trace` takes a Notebook item id. Draft paragraph
  anchors wait for J.
- Rule 1 says one item kind per section, but H must hold the parties, and the
  impugned order has no anchor. Parties are a second kind in procedural history.
  The impugned order is a matter-level record.
- The `--status disputed` filter treats disputed as a status. It is derived
  here, not stored, so deciding the OCR dispute clears it with no Notebook
  write.
- F's ingest rows never leave `pending`. Readiness treats a document with an
  OCR record or text as ingested. F should move the row on when ingestion ends.


# Build report: spec J, documents, viewers and editors

Build steps 3, 7 and 9 for J, on top of the Spec H commit 05f7547. New crate
`oa-docs` (pure logic plus the `wordcraft` and `pdfcraft` stub executables), a
`matter.db` migration (`doc_records`), the kernel module `documents.rs` with the
DOCX engine and K seams in `hooks.rs`, `oa draft ...`, `oa view`, `oa filing`,
`oa fidelity`, `oa pdf`, and seven shell views. 236 tests pass (199 before).

The kernel never parses a DOCX. Reads, edits and renders go through the
`DocxEngine` hook: `wordcraft --headless` beside the running executable in the
application, the same handler in process in kernel tests. The process boundary
is tested in `oa-docs` against the built `wordcraft` and `pdfcraft`.

## Acceptance criteria in scope

| ID | Test | Result | Note |
|---|---|---|---|
| J-AC-01 | `j_ac_01_every_generated_paragraph_id_survives_an_edit_of_another_paragraph_in_wordcraft` (oa-docs) | pass | Through the `wordcraft --edit` stub process. |
| J-AC-02 | `j_ac_02_the_headless_engine_replaces_one_paragraph_and_leaves_the_rest_byte_identical` (oa-docs) | pass | Through `wordcraft --headless`. Every other part's raw bytes are equal too. |
| J-AC-03 | `j_ac_03_an_accepted_proposal_is_exactly_one_revision_authored_by_the_agent_turn` (kernel) | pass | Author `agent:turn-7`. A second accept is a conflict. |
| J-AC-04 | `j_ac_04_a_proposal_on_a_stale_base_is_shown_again_and_not_committed` (kernel) | pass | |
| J-AC-05 | `j_ac_05_draft_accept_and_reject_from_a_harness_connection_are_refused` (kernel) | pass | |
| J-AC-06 | `j_ac_06_reverting_the_third_of_five_agent_edits_equals_applying_the_other_four` (kernel) | pass | Compared by paragraph id and paragraph XML hash. |
| J-AC-07 | `j_ac_07_wordcraft_writing_under_a_drafts_folder_is_refused_by_the_boundary` (oa-docs), `j_ac_07_an_editor_file_inside_the_drafts_folder_is_detected_and_refused` (kernel) | pass | The editor boundary refuses the write; the kernel also detects a file that got there and refuses the import, audited. |
| J-AC-08 | `j_ac_08_every_list_of_dates_sentence_carries_an_event_id_and_its_date` (oa-docs) | pass | Library level. `oa draft new --from-notebook` feeds the generator H's `--for-prose` events; no kernel test builds confirmed Notebook events for it. |
| J-AC-09 | `j_ac_09_the_filing_pdf_passes_the_pdfa_check_at_the_configured_part_and_level` (oa-docs) | **partial** | Passes the in-tree structural preflight, not veraPDF. Font embedding and the ICC profile are `not_checked`. Real PDF/A conformance is not claimed. |
| J-AC-10 | `j_ac_10_bookmarks_and_index_page_numbers_match_the_annexure_numbering` (oa-docs) | pass | |
| J-AC-11 | `j_ac_11_a_hosted_window_has_no_taskbar_entry_and_tracks_move_resize_and_minimise` (oa-docs) | pass, model only | The hosting model. No real window is reparented (H-08 spike). |
| J-AC-12 | `j_ac_12_at_a_dpi_change_the_window_scales_or_falls_back_with_a_notice` (oa-docs) | pass, model only | [AUTO+HUMAN]: the human half needs the real hosted window. |
| J-AC-13 | `j_ac_13_the_fidelity_oracle_reports_page_differences_and_fails_above_the_threshold` (oa-docs), `the_fidelity_check_compares_the_engine_with_the_viewer_and_says_word_is_absent` (kernel) | pass | Fixture pages from the SLP template. Word is reported as not compared. |
| J-AC-14 | `j_ac_14_a_wordcraft_crash_keeps_the_working_copy_and_leaves_an_autosave_to_recover` (oa-docs), `j_ac_14_a_crash_with_unsaved_edits_loses_no_revision_and_recovers_the_autosave` (kernel) | pass | The stub process crashes with exit 70 after an autosave. |
| J-AC-15 | none | [HUMAN] | |
| J-AC-16 | none | [HUMAN] | |
| J-AC-17 | `j_ac_17_conversion_of_an_unapproved_or_blocked_revision_exits_1_with_no_pdf` (kernel), `j_cli_documents_commands_through_the_binary` (oa-cli) | pass | Unapproved, blocked gate (a test `DraftChecks`), and approved but no longer the head. |
| J-AC-18 | `j_ac_18_pdfcraft_refuses_to_open_the_filing_pdf_for_editing` (oa-docs), `j_ac_18_pdfcraft_is_refused_the_filing_pdf` (kernel) | pass | |
| J-AC-19 | `j_ac_19_the_conversion_record_links_the_docx_hash_to_the_pdfa_hash_on_disk` (kernel) | pass | Also in the link index. |
| J-AC-20 | `j_ac_20_the_changes_viewer_shows_proposals_wordcraft_saves_and_restores_with_authors` (kernel), `j_ac_20_the_changes_viewer_shows_each_kind_of_change_with_its_author` (shell) | pass | |
| J-AC-21 | `j_ac_21_a_review_note_stays_on_its_paragraph_id_in_later_revisions` (kernel) | pass | Also covers the agent-capability refusal. |
| J-AC-22 | `j_ac_22_the_conversion_comparison_puts_a_failing_paragraph_from_both_sides_together` (oa-docs), `j_ac_22_the_conversion_report_shows_a_failing_paragraph_from_both_sides` (kernel and shell) | pass | The failing case is a rupee sign the standard font cannot write. |
| J-AC-23 | `j_ac_23_the_corpus_regression_reports_no_lost_id_and_no_changed_byte_outside_the_edit` (oa-docs) | pass | A fixture corpus of three generated or hand-built files, including a table, a footnote, an image part and foreign XML. Not real petitions. |

Also: `a_wordcraft_save_on_a_moved_head_becomes_a_proposal_for_the_advocate`
and `an_unreadable_revision_is_shown_unreadable_in_the_viewer` (kernel), and
`j_cli_documents_commands_through_the_binary` (oa-cli), which drives every new
`oa` subcommand except `revert` through the binary and the real `wordcraft`.

## Views in scope

| View | Covers | Screenshot | Checked | Seen wrong |
|---|---|---|---|---|
| Viewer (J01, J02) | `view` | `target/screenshots/gallery-viewer.png` | DOCX paragraphs by id; a PDF's lines by page with the disputed line in red; unreadable revision as an error state | The Page column is blank for DOCX rows. |
| Document viewer (J02) | `draft.paragraphs` | `target/screenshots/gallery-document.png` | id, style, text, event ids, authority ids, note count | At quarter width the Notes column is clipped when an authority id is long. |
| Edit surface (J03) | `draft.proposals` | `target/screenshots/gallery-edit-surface.png` | state before the change so it is never clipped; - and + lines; re-based and WordCraft-import proposals | The Reason column clips at quarter width. |
| Changes (J15) | `draft.changes`, `draft.diff` | `target/screenshots/gallery-changes.png` | kind and author per revision, agent edits marked for revert, review notes under their paragraph, read-only or agent-capability banner | none |
| WordCraft (J05) | `draft.editor_status` | `target/screenshots/gallery-wordcraft.png` | session, working copy, head moved, unimported save, autosave to recover, fallback notice banner | Hosting says "not running" in the live app: no hosted window yet. |
| Fidelity report (J12) | `fidelity.check` | `target/screenshots/gallery-fidelity.png` | renderers with Word "not compared", per-page differences, failing page red, banner | none |
| Conversion report | `filing.conversions` | `target/screenshots/gallery-conversion.png` | PDF/A checks with the stub validator named, `not_checked` muted, DOCX and PDF/A side by side, failing paragraph red, "not for filing" banner | none |

The screenshots are galleries (fixtures, no kernel). No live-window capture was
taken in this step. Before this report the Edit surface clipped its State
column and the Changes fixtures showed identical short hashes; both were fixed
and re-captured.

## [HUMAN] criteria still needing a person

- J-AC-15: typing, IME input and spell check in hosted WordCraft. Needs the real
  WordCraft fork hosted in the pane.
- J-AC-16: does the filing PDF look like a properly prepared Supreme Court paper
  book? Today it is plain Helvetica text pages; it does not yet.
- J-AC-12, human half: a real DPI change with a hosted window.
- The human gestures in the window, not clicked in this session: "Accept proposal
  X on paragraph Y" and "Reject proposal X" on the Edit surface, "Revert agent
  edit ..." and "Add note on paragraph ..." on Changes, "Open the head in
  WordCraft", "Import WordCraft's save as a revision" and "Recover WordCraft's
  autosave as a revision" on the WordCraft pane.
- Keyboard-only operation of the new views (README GUI convention 5).

## Stubs and the group that replaces each

| Stub | Where | Replaced by |
|---|---|---|
| Headless DOCX engine (WordCraft stand-in) | `oa_docs::docx`, `wordcraft --headless` | J itself, when the WordCraft fork is vendored (OQ-01, H-02). The `DocxEngine` request protocol is the seam. |
| Hosted WordCraft application | `wordcraft --edit <docx> --script <ops>` | J with the vendored fork, run by the D15 supervisor. |
| Window reparenting | `oa_docs::host` model only | J with the H-08 spike (Win32 SetParent, owned-window fallback). |
| First-revision writer | `oa_docs::writer` (stand-in for docx-rs) | J, when docx-rs is vendored (Q). |
| PDF/A validation | `oa_docs::pdf::preflight`, named `oa-pdfa-preflight (stub; veraPDF not vendored)` | Q vendors veraPDF; K's conversion check then records its result. |
| PDF text and pages | `oa_docs::pdf::read` for our own PDFs; Helvetica, ASCII only | G01/G02 pdfium for reading; an embedded font for writing (J13, Q). |
| Annexure pages | OCR text per page, not the original page images | J13 with pdfium (G01) merging source PDFs as they are. |
| K draft checks and conversion check | `hooks::StubDraftChecks` (no blockers; text comparison) | K (K06 numbering, the citation gates, the conversion check). |
| Word as a fidelity renderer | reported "not compared" | J12 with Word through COM. |
| PdfCraft | `pdfcraft --view/--edit` stub | J with the vendored PdfCraft fork. |
| Question of law and grounds generators | placeholder paragraphs in the SLP template | J10 with I (research authorities). Spec I is not built. |

No Research Studio (spec I) skeleton was needed. The `sources` part already has
an `authorities` list for I to fill.

## Open questions hit

- OQ-01: WordCraft is treated as vendored source in a hosted process (X-01). Only
  the stub exists.
- OQ-03: the WordCraft engine renders the filing body. Word is only a fidelity
  comparison, and is not wired.

## Spec issues

- The CLI table has no command for the edit surface's list, the Changes viewer,
  the WordCraft pane's state, review notes, revert or the conversion report.
  Added `draft.proposals`, `draft.changes`, `draft.editor_status`, `draft.note`,
  `draft.revert`, `filing.conversions` and `pdf.open_editor`.
- Rule 2 and J-AC-07 name `drafts/<draft id>/`, but the draft store keeps
  revisions in `blobs/` and never creates that folder. The boundary refuses any
  editor write under a matter's `drafts/`, and the kernel treats any file in
  `drafts/<draft id>/` as foreign.
- Rule 12 says "the approved head" without naming the gate. The code uses
  `final_revision`, the gate spec C's tests use. K or L may name another.
- Rule 14 gives the conversion check to K, but J-AC-22 needs its output in J's
  report. The check runs behind the `DraftChecks` seam with a stub comparison.
- J-AC-09 requires veraPDF, and a conforming PDF/A needs an embedded font and an
  ICC output profile. Neither is in the tree, so J-AC-09 is partial.
- The acceptance table lists J-AC-15 and J-AC-16 after J-AC-19. The ids are fine;
  the order is only cosmetic.

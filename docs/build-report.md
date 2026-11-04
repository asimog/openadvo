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

# Build report: spec K, verification adapter (minimal skeleton, deferred)

The adapter is deferred until the ULOS standard and its `ulos` validator
(`C:\dev\ulosadvo`, built separately) are ready. This step adds only a skeleton:
the `oa-verify` crate with the ULOS vocabulary (the four outcomes, the six gate
states, the ULOS checks) and one narrow seam, `Validator::verify(bundle)`, whose
only implementation, `Deferred`, answers `Unavailable`. The kernel's
`VerifyChecks` replaces `StubDraftChecks` as the default `DraftChecks`: every
revision is "Blocked pending source verification" with the deferral reason, so
`oa filing pdf` refuses, and the conversion comparison stays J's. Nothing
produces `verified`. No store table, kernel command, CLI command or view was
added, so A-AC-16 parity is unchanged. 238 tests pass (236 before).

## Acceptance criteria

All K criteria are deferred until ulosadvo is ready. None is faked.

| ID | Status |
|---|---|
| K-AC-01 to K-AC-14, K-AC-17 to K-AC-20 [AUTO] | Deferred until ulosadvo is ready |
| K-AC-15 [HUMAN] | Deferred until ulosadvo is ready |
| K-AC-16 [AUTO+HUMAN] | Deferred until ulosadvo is ready |

Tests added: `oa-verify` `the_deferred_adapter_is_unavailable_and_blocks`, and
`oa-kernel` `the_deferred_verification_adapter_blocks_conversion_and_never_verifies`.

## Views

None. The skeleton adds no query command.

## [HUMAN] criteria touched

None. K-AC-15 and K-AC-16 wait for the adapter.

## Stubs and the group that replaces each

| Stub | Replaced by |
|---|---|
| `oa_verify::Deferred` (every check unavailable) | K, once spec U's `ulos` is ready |
| `oa_kernel::VerifyChecks` (every revision blocked) | K's gate mapping (K08) |
| No Research Studio states (I) | I, then K |

## Release gates

The kill tests and the loop conformance fixtures pass with the workspace. The
`ulos` conformance suite does not exist yet (ulosadvo has no tests).

## Notes for when K resumes

- A fuller implementation was drafted and set aside, not committed: extraction,
  the gate mapping, admission by binary hash and source stamp, limitation, the
  planted-defect corpus and recorded `ulos` runs.
- `ulos` today: `verify-citation` works against fixtures. `verify`,
  `verify-legislation` and `verify-notebook` say "not implemented". When a
  citation is not in the fixtures, `ulos` returns `failed` with the source
  stamped `supreme_court_portal, attempted: false`. That record should name the
  fixture source it actually consulted.
- The ULOS `verificationBundle` schema has one target and a list of requests,
  with no anchors, so K will need its own map from requests to paragraph anchors.
- Spec issues found: decisions 5.3 gives no gate state for loose-pattern review
  items (L-02). Row 1 of 5.3 and rule 9 disagree on an unattested amended
  section (OQ-09 says legal review). And rule 5's automatic re-run on every new
  revision has no named trigger.


# Build report: spec M, the browser

Build step 4 for M, on top of the Spec K skeleton commit 3159515. New crate
`oa-browser` (pure logic, the profile process protocol, the supervisor, F's
`BrowserPort` over a supervised profile, and the `oa-browser-profile`
executable), a `firm.db` migration (`browser_egress`, `browser_downloads`,
`browser_attachments`), the kernel module `browser.rs`, `oa browser ...`, and
three shell views. 274 tests pass (238 before).

Each profile (`matter:<id>`, `filing`, `agent`) runs as its own
`oa-browser-profile` process, started by the kernel's supervisor (D15) with its
own folder. The agent's folder is fresh for each process and deleted when it
stops. Chromium (CEF) is not vendored: the profile process is a stub behind the
real process boundary, as `oa-ocr` does for its engines. It has a real cookie
jar, a real network stack (plain HTTP over TCP), the egress check before any
socket opens, and download interception to disk. It does not render, run
scripts or speak TLS.

## Acceptance criteria in scope

| ID | Test | Result |
|---|---|---|
| M-AC-01 | `m_ac_01_killing_the_agent_process_leaves_the_visible_and_filing_profiles_running` (oa-browser, real processes), `m_ac_01_killing_the_agent_leaves_the_visible_and_filing_profiles_running` (kernel) | pass |
| M-AC-02 | `m_ac_02_the_agent_profile_has_no_cookies_from_a_matter_login` (real processes; the server sees no cookie from the agent, and the agent folder is gone after the run) | pass |
| M-AC-03 | `m_ac_03_the_filing_portal_is_refused_to_the_agent_even_when_allow_listed` (egress), `m_ac_03_the_agent_profile_is_refused_the_filing_portal_even_when_allow_listed` (supervisor, before any process starts), `m_ac_03_the_agent_navigating_to_the_e_filing_portal_is_refused_and_logged` (kernel) | pass |
| M-AC-04 | `m_ac_04_attach_from_a_harness_connection_is_refused` (kernel; also: unattached, the agent cannot drive a matter profile, and never the filing profile) | pass |
| M-AC-05 | `m_ac_05_a_download_in_every_profile_is_hashed_from_the_bytes_on_disk` (real processes), `m_ac_05_a_download_in_any_profile_reaches_the_inbox_with_the_hash_of_the_bytes_on_disk` (kernel: evidence, capture record and blob on disk) | pass |
| M-AC-06 | `m_ac_06_extraction_is_labelled_untrusted_with_url_and_time` (page), `m_ac_06_extracted_text_carries_an_untrusted_label_url_and_time` (kernel) | pass |
| M-AC-07 | `m_ac_07_an_empty_or_missing_allow_list_denies_everything` (egress), `m_ac_07_with_the_allow_list_empty_the_agent_profile_makes_no_network_request` (real processes against a recording server, and kernel) | pass |
| M-AC-08 | `m_ac_08_the_filing_launch_plan_disallows_devtools` (the Chromium policy), `m_ac_08_devtools_cannot_be_opened_in_the_filing_profile` (supervisor and the process itself, and kernel) | pass |
| M-AC-09 | none | [HUMAN] |
| M-AC-10 | `m_ac_10_every_agent_connection_is_logged_with_refused_ones_marked` (real processes), `m_ac_10_the_egress_log_shows_every_agent_connection_with_refused_ones_marked` (kernel), `m_ac_10_the_egress_view_marks_refused_connections_and_filters_by_profile` (shell) | pass |

Also: `m_cli_browser_commands_through_a_served_kernel` drives every
`oa browser` subcommand through the binary against `oa kernel serve`, with real
profile processes; `f_capture_driver_runs_through_a_supervised_profile` runs
F's `CaptureDriver` through a real profile process (the recorded listing, three
orders through the interceptor, the CAPTCHA handoff, and the headless agent
refusing focus); `an_unavailable_browser_reports_dependency_unavailable` and
`a_missing_profile_executable_is_an_honest_unavailable` cover the failure mode.

## Views in scope

| View | Covers | Screenshot | Checked | Seen wrong |
|---|---|---|---|---|
| Browser | `browser.state`, `browser.attachments`, `browser.extract`, `browser.dom`, `browser.screenshot` | `target/screenshots/gallery-browser.png` | one row per profile with state, URL and title; page text rows muted and marked untrusted; amber banner while the agent is attached; crashed agent in red; stub banner naming CEF as not vendored; empty, loading, error states | At quarter width the Detail column (pid, DevTools off) is clipped. A full pane shows it. |
| Downloads | `browser.downloads` | `target/screenshots/gallery-downloads.png` | IST time, profile, file, short hash, bytes, capture record, status; unrouted row amber with its reason; a routed row opens its evidence entry | The unrouted reason is clipped at quarter width. Fixture hashes first rendered as zeros; fixed. |
| Egress log | `browser.egress` | `target/screenshots/gallery-egress.png` | refused rows red with the reason (H-15 for the e-filing host), "3 refused connections" banner, filter buttons by profile | Full matter ids pushed Reason off screen; matter profiles now show `matter:..` and the id tail. The Inspector has the full id. |

The screenshots are galleries (fixtures, no kernel). No live-window capture was
taken in this step. The DOM, screenshot, Open and attach controls are under
the Browser pane (`browser_extras`) and were not clicked.

## [HUMAN] criteria still needing a person

- M-AC-09: the embedded browser behaves like a normal browser for portal use,
  file pickers and print. Not possible until CEF is vendored.
- The human gesture "Let the agent drive the visible browser for matter:<id>"
  and "Detach the agent from ..." in the Browser pane, and the attachment
  banner in a live window. From the CLI, `oa browser attach agent --to
  matter:<id>` asks at the terminal (H-09) and is not confirmed without one.
- F-AC-12 (still open from F): capture against the live portal needs https,
  which needs CEF.
- Keyboard-only operation of the three views (README GUI convention 5).

## Stubs and the group that replaces each

| Stub | Replaced by |
|---|---|
| `oa-browser-profile`: plain HTTP over TCP, no TLS, no rendering, no scripts. https answers `dependency_unavailable` (exit 5) | M, once Q vendors Chromium (CEF) and `agent-browser` |
| Browser pane shows profile state and the extracted page text, not the page; reparenting into the pane with position, size, DPI and focus (M02, H-08) is not built | M's CEF host, with Q |
| `browser.screenshot` returns a stub raster (one bar per text line) | CEF |
| Capture exclusion (M10): the screenshot comes from the profile process and never contains shell overlays, but no window is excluded from OS capture yet | M's CEF host and A (overlay windows) |
| Credentials: `CredentialStore` and the autofill policy (visible profiles only, M08) exist; no keychain backend and no command to save a login | E (E07, the OS keychain) |
| `browser.open` is external but there is no outbox; the effect is recorded in the egress log and the command audit | C and L (the outbox) |
| The agent's run ends only when its process stops; `Kernel::browser_end_agent_run` is the seam | D (the harness calls it at run end) |
| Kernel tests use `InProcessLauncher`, the same handler in process; the process boundary is tested in `oa-browser` and `oa-cli` | none |
| F's fixture `BrowserPort` remains as a test double in `oa-capture`; the real port is `oa_browser::SupervisedPort` | done here |

## Open questions hit

None. No OQ-xx decision was needed.

## Spec issues

- The GUI table has an Egress log view, but the CLI table has no query for it.
  Added `oa browser egress [--profile <p>] [--refused]` (query).
- Rule 9 and M-AC-08 need a way to ask for DevTools. Added
  `oa browser devtools --profile <p>` (internal), refused in the filing
  profile by the supervisor and by the process.
- The pane banner needs the attachment state. Added
  `oa browser attachments` (query).
- `browser.open` is `external` and "goes through the outbox", which does not
  exist yet (see stubs).
- Rule 5 routes every download to "the matter inbox", but the filing and agent
  profiles have no matter. `browser.open` takes `--matter`; without one the
  download is hashed, listed as `unrouted`, and gets no evidence entry.
- The Purpose says the agent operates the filing profile under the advocate's
  confirmations. Spec L builds those confirmations, so until then the harness
  is refused in the filing profile.
- `--profile` is optional in the CLI table with no default. The harness
  defaults to `agent`; the advocate to the profile last opened.
- An attached agent in a matter profile is held to the matter's allow list.
  Only the advocate's own navigation goes beyond it ("allow list per matter
  plus the advocate's own navigation").
- Rule 7 (deny by default, a missing flag fails safe) does not say who may
  change an allow list. `settings.set` on `browser.allow.*` is refused to the
  harness and audited, so the agent cannot widen its own egress.
- Downloads from a browser are captured with the new origin `browser`, added
  to F's known capture origins.

# Build report: spec O, firm data

Build step after 6, on top of the Spec M commit 9259f55. This adds a new
pure-logic crate `oa-firm` (contact kinds, party roles, correspondence kinds,
a contact's matters and roles, and the timeline built from ledger events). It
also adds a `firm.db` migration (migration 4: `contacts` gains `kind`,
`source`, `details`, `updated_at` and `confirmed`), the kernel module
`firm.rs`, eight commands, `oa contacts|parties|timeline|correspondence`, and
three shell views. 292 tests pass (274 before).

Where things live:

- Contacts are in `firm.db`, the same store and the same `FirmStore` trait that
  A's client records and M's browser tables use. No second firm store was made.
- Party roles and the correspondence log are matter records. They go through
  the single commit path (one ledger event plus a `doc_records` row of kind
  `party` or `correspondence`), so the timeline sees them.
- The timeline is `oa_firm::timeline` over the ledger, computed on every
  call. No table holds it.

Matter creation consults O01 for the client (A). `matter.create` with
`ClientSpec::Existing` looks the contact up in `firm.db`, and `ClientSpec::New`
creates a `person` contact after the RQ-87 confirmation, as before. One gap is
closed. `contacts.add` is `internal`, so the agent may add a contact. A
contact the agent added is stored `confirmed = false`. Making it a matter's
client from the harness raises the same RQ-87 pending confirmation as a new
client, and `oa matter confirm` then uses that contact (no duplicate). From
the CLI or the UI it asks for presence and then confirms the contact. An
advocate's `contacts.edit` also confirms it.

## Acceptance criteria in scope

| ID | Test | Result |
|---|---|---|
| O-AC-01 | `o_ac_01_the_timeline_is_a_pure_function_of_the_ledger` (oa-firm), `o_ac_01_deleting_and_rebuilding_the_timeline_gives_the_same_entries` (kernel: two computations equal, one entry per ledger event in order, and no timeline table in `firm.db` or `matter.db`) | pass |
| O-AC-02 | `o_ac_02_a_differing_record_name_shows_both` (oa-firm), `o_ac_02_a_party_whose_record_name_differs_keeps_and_shows_both` (kernel), `o_ac_02_the_parties_view_shows_both_names_when_they_differ` (shell) | pass |
| O-AC-03 | `o_ac_03_no_command_in_this_group_makes_a_network_request` (kernel: every O command runs; no browser profile starts, the egress log stays empty, and `oa-firm` depends only on serde and serde_json) | pass |
| O-AC-04 | none | [HUMAN] |
| O-AC-05 | `o_ac_05_a_contact_lists_every_matter_and_role` (oa-firm), `o_ac_05_a_contact_page_lists_every_matter_and_role_and_the_timeline_opens_in_the_inspector` (kernel: client, petitioner in one matter and respondent in another; every contact-timeline entry and a party row open through `inspect`), `o_ac_05_the_contact_page_lists_every_matter_and_role_and_timeline_rows_open_events` (shell) | pass |

Also tested:

- `rq_87_a_contact_only_the_agent_added_needs_the_new_client_confirmation`.
- `with_firm_data_unavailable_contacts_are_refused_and_matter_work_continues`.
  `firm.db` is replaced by a folder. `contacts.add` and new-client
  `matter.create` answer `unavailable` (exit 5), while `parties.list`,
  `correspondence.log` and `timeline` still work.
- `two_contacts_with_the_same_name_stay_apart`.
- `contacts_add_is_idempotent_and_validates`.
- `o_cli_contacts_parties_timeline_and_correspondence`, through the `oa`
  binary.
- `firm_data_unavailable_is_a_visible_state_in_the_parties_view` and
  `an_unconfirmed_contact_is_marked`, both in the shell.

## Views in scope

| View | Covers | Screenshot | Checked | Seen wrong |
|---|---|---|---|---|
| Contacts | `contacts.list`, `contacts.show` | `target/screenshots/o-contacts-typical.png` (list), `o-contacts-disputed.png` (a contact page) | List: name, kind, "Matters and roles" grouped per matter, details, source for a court, unconfirmed contacts in amber. Page: a banner with kind, details and the count of roles, one row per matter and role with the name in the record, and the matter row opening the matter record | The first page draft put the details under the "Id" header. Fixed: the details moved to the banner. The fixture gave a court an organisation; fixed. |
| Parties | `parties.list` | `o-parties-typical.png`, `o-parties-disputed.png` | Role, a party label showing both names when they differ (amber), contact name, name in the record, contact id. With firm data unavailable, an amber banner and "(contact name unavailable)" | Roles show with underscores (`proforma_respondent`), as stored |
| Timeline | `timeline` | `o-timeline-typical.png`, `o-timeline-disputed.png` | IST time, matter, kind, a one-line summary, actor via origin; calls and meetings in green; a banner says it is computed from the ledger; each row opens `event:<seq>` in the Inspector | none |

A live capture (`target/screenshots/o-live.png`, with -Seed) shows the shell
connected to its kernel. At that window size the new views are below the fold
of the sidebar list. The controls under each view were not clicked:

- Contacts: add, edit, open a matter, timeline.
- Parties: record a party, open a contact.
- Timeline: log correspondence.

## [HUMAN] criteria still needing a person

- O-AC-04: the contact and party views are what an advocate's office expects.
- Clicking the controls above in a live window, and keyboard-only operation
  of the three views (README GUI convention 5).
- The RQ-87 presence prompt for an agent-added contact ("Confirm the client
  ... and create the matter ...") from the CLI and the UI.

## Stubs and the group that replaces each

| Stub | Replaced by |
|---|---|
| Courts and benches are contacts with a free-text `source` (required, for example `codebook:hc/DL`). Nothing yet checks the source against the F12 codebooks or keeps them in step (O rule 4) | O with F, when the codebooks are browsable |
| `firm.db` backup and export (the spec's second assumption, E06) is not built | E (E06) |
| Merging two contacts with the same name (edge case) has no command. They stay apart, which the spec allows | O, when merge is specified |
| The contact timeline selects events whose body names the contact id (matter creation for a client, party roles, correspondence). Other events in the same matters are not included | none, unless the spec wants a wider timeline |

## Open questions hit

None. No OQ-xx decision was needed.

## Spec issues

- The GUI table says the advocate can edit a contact, but the CLI table has no
  edit command. I added `oa contacts edit <id>` (`contacts.edit`, internal). It
  merges: a field you do not give is kept, and an empty value clears it.
- `parties.list` is a query, but the GUI table has no view for it. A-AC-16
  needs one, so I added a Parties view.
- The correspondence log has no query of its own. Its entries appear in the
  timeline and open in the Inspector (`correspondence` records). I added no
  `correspondence list` command.
- `oa timeline <matter|contact>` is ambiguous, because both ids are ULIDs. The
  CLI tries the id as a matter first, then as a contact. `--contact` forces
  the contact reading. The command itself takes `matter` or `contact`.
- RQ-87 says the agent needs a confirmation for a new client. `contacts.add`
  is `internal`, so without the `confirmed` flag the agent could add a
  contact and then name it as an existing client. Please review the flag
  (decisions.tsv row). It implements RQ-87 and changes no decision.
- The failure mode says that with `firm.db` unavailable, "firm data is read
  only". A `firm.db` that cannot be opened cannot be read either. Contact
  commands therefore answer `unavailable`, and the parties view shows names
  from the record with the contact name marked unavailable. Matter creation
  also needs the workspace root, which lives in `firm.db` (spec A), so every
  `matter.create` is refused in that state, not only one for a new client.

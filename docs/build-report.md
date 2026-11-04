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

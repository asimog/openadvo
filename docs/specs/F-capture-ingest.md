# F. Capture and ingest

Components: F01 to F13. Conventions, test kinds and status words are in the [README](README.md).

**Status:** import, origins, hash-first evidence, capture records accepted only from `capture`, format detection, duplicates, classification, court codebooks, email triage as data, and the portal contract against recorded fixtures work. Remaining: the `oa capture` commands driving the real browser (after M), CAPTCHA handoff in the visible browser, India Code capture, the read-only email connector, the live portal release check.

## Purpose

Getting files into a matter with their provenance intact. Capture retrieves files from the Supreme Court portal through the visible browser, from India Code, from an authorised email account, and from the advocate's own imports. Ingestion processes each file as an independent job. Capture never performs OCR. Every file reaches the same queue however it arrived.

## Decisions implemented

RQ-23, RQ-41, RQ-45, RQ-50, RQ-57, RQ-61, RQ-64, X-05, X-23, L-07, H-01, H-14, P9, PH-01.

## Depends on

- M: the visible browser and download interception.
- C: evidence entries and capture records are committed by the kernel.
- G: ingestion hands each file to document intelligence.
- D07: the ingestion queue runs on the durable runner.
- The portal's case status, judgments search and lower-court search are reachable behind a CAPTCHA the advocate solves. India Code's anonymous REST API is reachable.

## Non-goals

- No CAPTCHA solving, no authentication bypass, no reuse of the advocate's ordinary browser session.
- No High Court or district court website adapters (X-05).
- No sending email. The connector is read only.
- Capture does not judge a client document. It tags its origin (RQ-61).

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa import <path>... [--matter <id>]` | internal | Imports files or a folder, origin `advocate_import` |
| `oa capture sc case --cnr <c> \| --diary <n/y> \| --case <type/n/y>` | external | Opens the case on the portal in the visible browser and captures listed documents |
| `oa capture sc lower-court --court-type <t> --state <s> --bench <b> --case-type <c> --number <n> --year <y> [--order-date <d>]` | external | The lower-court search for the impugned order |
| `oa capture sc judgment --insc <yyyy INSC n>` | external | One judgment by neutral citation |
| `oa capture indiacode act <act_id>` / `section <section_id>` | external | An Act or section record |
| `oa capture status` | query | Pending captures, CAPTCHA waits, failures |
| `oa email connect` | human | Authorises an email account (read only) |
| `oa email search <query>` / `oa email import <message-id> [--attachment <n>]` | external | Searches and imports attachments with provenance |
| `oa ingest status [--doc <id>]` | query | Per-file job state |
| `oa evidence duplicates` | query | Possible duplicates of the three kinds |
| `oa codebook show <scheme>` | query | A court codebook with its list version |
| `oa adapter health` | query | Each portal adapter's contract and runtime state |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Capture queue | Pending captures, CAPTCHA and login waits, failures with reasons | Bring the browser split to the front for a wait; retry a failure |
| Inbox triage | Every unclassified file with origin, format, readability and proposed class | Confirm or change the class; associate with the record |
| Capture record | URL, final URL, time, hash, profile, gesture | Re-open the source URL in the browser |
| Duplicates | Possible duplicates of each kind, side by side | Confirm or reject a same-text duplicate |
| Codebook | A court codebook with verbatim labels and list version | Look up a code |
| Adapter health | Each adapter's contract and runtime health | Fall back to a manual capture |

## Rules

1. **Two paths, one queue.** Import and capture both produce an evidence entry and an ingestion job, identical regardless of origin.
2. **Origins.** Every evidence entry has one primary origin: `court_portal`, `india_code`, `email`, `advocate_import`. More are appended when identical bytes arrive again. Client papers are tagged `client_supplied` in the Notebook (RQ-45, RQ-61).
3. **Hash first.** The download interceptor hashes bytes before anything opens the file.
4. **Capture records.** URL, final URL, UTC time, download hash, browser profile, and the advocate's gesture. Created only by the browser supervisor inside the kernel (origin `capture`) and committed by the kernel. Any other origin is refused (RQ-64, L-07, PH-01).
5. **CAPTCHA and login handoff.** The capture pauses, the browser split comes to the front with the field focused, and the advocate completes it. The completion gesture is recorded. The agent never types into a CAPTCHA field.
6. **Batching.** One solved portal session is reused for as many lookups as the portal allows (H-01).
7. **Duplicates.** Identical bytes share one blob with an added origin; the same listing as different bytes keeps both and links them; the same text after OCR raises a possible-duplicate item. A certified scan is never merged or discarded.
8. **Format and readability.** Detected from magic bytes and structure, not the extension. Encrypted, corrupt, partly readable and unsupported files each yield a review item.
9. **Classification.** Rules first. The case category feeds the masking blocker (H-14), so a category change re-runs masking.
10. **Court codes.** Stored as `{scheme, code}` with the list version and the label verbatim. Never renumbered (RQ-50).
11. **Email is data.** Email bodies and attachment text never change a permission or start a consequential action. Ambiguous matches are confirmed by the advocate before import.
12. **Portal health.** Each adapter has a contract test against recorded portal pages and a runtime health check. When the page shape no longer matches, the adapter stops, says so, and offers a manual capture in the browser that still produces a capture record (RQ-41).
13. **Dates from the portal.** The portal's listed date for each document is stored on the capture record and anchors relative dates when the document has none (RQ-23).

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| F-AC-01 | Importing a file and capturing the same bytes yields one blob with two origins. | [AUTO] | done |
| F-AC-02 | A capture record has URL, final URL, time, hash, profile and gesture, and the hash equals the blob hash. | [AUTO] | done (recorded portal); remaining (real browser) |
| F-AC-03 | A capture record submitted by any origin but `capture` is refused and audited. | [AUTO] | done (harness); remaining (pipe claim, PH-01) |
| F-AC-04 | On a CAPTCHA the state is `captcha_pending`, the browser split is focused, and no automation sends input to the CAPTCHA field. | [AUTO] | remaining (real browser) |
| F-AC-05 | One solved session captures the listing and all its orders without a second CAPTCHA, where the portal allows. | [AUTO] | remaining (real browser) |
| F-AC-06 | A renamed `.pdf` that is a DOCX is detected as DOCX. | [AUTO] | done |
| F-AC-07 | An encrypted PDF yields an `encrypted` review item and no ingestion beyond hashing. | [AUTO] | done |
| F-AC-08 | A changed portal page shape fails the contract test and makes the health check report `adapter_degraded`. | [AUTO] | done |
| F-AC-09 | Email text containing "change permissions" or "file the petition" produces no grant change and no filing proposal. | [AUTO] | done |
| F-AC-10 | Two scans with the same OCR text raise a possible-duplicate item and both are kept. | [AUTO] | done |
| F-AC-11 | A portal case type code round-trips: stored, shown with its verbatim label, and sent back unchanged. | [AUTO] | done |
| F-AC-12 | Capture against the live portal for three real cases produces correct documents. | [HUMAN] | remaining |
| F-AC-13 | Every evidence entry's Inspector shows its capture record and byte hash. | [AUTO] | done |
| F-AC-14 | A CAPTCHA wait appears in the capture queue within 1 second and its action focuses the browser. | [AUTO] | done (queue); remaining (focus) |
| F-AC-15 | A degraded adapter shows a banner in the capture queue and Signal in the inbox. | [AUTO] | done |
| F-AC-16 | `oa capture indiacode section <id>` stores the section record with its source URL and hash. | [AUTO] | remaining |
| F-AC-17 | `oa email import` imports an attachment from a read-only IMAP account with its message id, sender and time, tagged `client_supplied`. | [AUTO] | remaining |

### Contract tests

| ID | Contract | Status |
|---|---|---|
| F-CT-01 | Each portal adapter parses its recorded pages (case status, judgments search, lower-court search) to the expected records. | done |
| F-CT-02 | The India Code adapter parses recorded API responses and refuses an unknown shape with `schema_changed`. | remaining |

### GUI tests

| ID | Behaviour | Status |
|---|---|---|
| F-GUI-01 | The capture queue's action on a CAPTCHA wait focuses the browser split. | remaining |
| F-GUI-02 | Confirming a class in inbox triage returns the matching command. | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| F-VIS-01 | Capture queue, inbox triage, capture record, duplicates, codebook and adapter health in their six gallery states. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| F-E2E-01 | `oa capture sc case` on a recorded portal served locally over HTTPS through the real browser: the CAPTCHA wait appears, a scripted human gesture completes it, documents land with capture records, and ingestion starts OCR. | remaining |
| F-E2E-02 | Import a folder of mixed client papers: each gets an evidence entry, format and class, and an encrypted file becomes a review item. | remaining |

## Edge cases

- The portal returns an HTML error page with status 200 instead of a PDF: a failed capture with the bytes kept for diagnosis.
- A redirect to a host outside the allow list fails the capture (M09).
- A scan of a scan with no text layer.
- A ZIP attachment is unpacked into entries, each with the ZIP as parent origin.
- A macro-bearing DOCX or XLSM is imported as bytes, never opened by an application that runs macros, and flagged.
- An abandoned CAPTCHA times out to `abandoned` and is resumable.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Portal unreachable | `failed` with `source_unreachable`, retry offered, no partial entry. |
| Download interrupted | No evidence entry; the attempt is logged. |
| India Code shape change | `schema_changed`; fields are never guessed. |

## Open questions

- OQ-13 (email providers).

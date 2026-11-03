# F. Capture and ingest

Components: F01 to F13. See [README](README.md) for tags and conventions.

## Purpose

Getting files into a matter with their provenance intact. Capture retrieves or imports files: from the Supreme Court portal through the visible browser, from India Code, from an authorised email account, and from the advocate's own imports. Ingestion then processes each file as an independent job. Capture never performs OCR. Every file reaches the same queue however it arrived.

## Decisions implemented

RQ-23, RQ-41, RQ-45, RQ-50, RQ-57, RQ-61, RQ-64, X-05, X-23, L-07, H-01, H-14.

## Depends on

- M (the visible browser and download interception).
- C (evidence entries and capture records are committed by the kernel).
- G (ingestion hands each file to document intelligence).
- D07 (the ingestion queue, F09, runs on the durable runner).

## Assumptions

- The Supreme Court portal's case status, judgments search and lower-court search are reachable and protected by a CAPTCHA the advocate solves.
- The High Court judgment and orders of the impugned case are reachable through the portal's lower-court search. High Court websites are out of scope for the first release (X-05).
- India Code's anonymous REST API is reachable.

## Non-goals

- No CAPTCHA solving, no authentication bypass, no reuse of the advocate's ordinary browser session.
- No High Court or district court website adapters in the first release.
- No sending email. The connector is read only.
- Capture does not classify a client document as unverifiable. It tags its origin (RQ-61).

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa import <path>... [--matter <id>]` | internal | Imports files or a folder into the inbox, origin `advocate_import` |
| `oa capture sc case --cnr <c> | --diary <n/y> | --case <type/n/y>` | external | Opens the case on the portal in the visible browser and captures listed documents |
| `oa capture sc lower-court --court-type <t> --state <s> --bench <b> --case-type <c> --number <n> --year <y> [--order-date <d>]` | external | The lower-court search for the impugned order |
| `oa capture sc judgment --insc <yyyy INSC n>` | external | Captures one judgment by neutral citation |
| `oa capture indiacode act <act_id>` / `section <section_id>` | external | Fetches an Act or section record |
| `oa capture status` | query | Pending captures, CAPTCHA waits, failures |
| `oa email connect` | human | Authorises an email account |
| `oa email search <query>` / `oa email import <message-id> [--attachment <n>]` | external | Searches and imports attachments with provenance |
| `oa ingest status [--doc <id>]` | query | Per-file job state |
| `oa codebook show <scheme>` | query | A court codebook with its list version |

## Rules

1. **Two paths, one queue.** Import and capture both produce an evidence entry and an ingestion job. The job is identical regardless of origin (workflow details A).
2. **Origins.** Every evidence entry has exactly one primary origin: `court_portal`, `india_code`, `email`, `advocate_import`. Additional origins are appended when identical bytes arrive again. Files supplied by or for the client (email attachments, advocate imports of client papers) are tagged `client_supplied` in the Notebook (RQ-45, RQ-61).
3. **Hash first.** The download interceptor (F06, M04) hashes bytes before anything opens the file.
4. **Capture records.** A capture record holds the URL, the final URL after redirects, the UTC time, the download hash, the browser profile, and the advocate's gesture (the user input event that started or authorised the capture). Capture records are created only by the browser supervisor and committed by the kernel. A capture record proposed by the harness is refused (RQ-64, L-07).
5. **CAPTCHA and login handoff.** When the portal presents a CAPTCHA or login, the capture pauses, the visible browser comes to the front with the field focused, and the advocate completes it. The completion gesture is recorded. The agent never types into a CAPTCHA field (F07).
6. **Batching.** One solved portal session is reused for as many lookups as the portal allows before it asks again, to bound the number of CAPTCHA solves (H-01).
7. **Duplicates.** Three layers, one decision each (F02): identical bytes share one blob with an added origin; the same court listing captured as different bytes keeps both and links them; the same text after OCR raises a possible-duplicate review item for the advocate. A certified scan is never merged or discarded.
8. **Format and readability.** F10 detects the actual format from magic bytes and structure, not the extension, and marks encrypted, corrupt, partially readable and unsupported files. Each yields a review item, never a silent skip.
9. **Classification.** F11 assigns a document type and legal category by rules first. A wrong class costs a review item, not a reroute. The case category feeds the masking blocker (H-14), so a category change re-runs masking.
10. **Court codes.** Case types, stages, disposal types and subject categories are stored as `{scheme, code}` with the scheme naming the court and the list version, and the label verbatim. Never renumbered (RQ-50).
11. **Email is data.** Email bodies and attachment text never change a permission or start a consequential action. Ambiguous matches are presented for the advocate to confirm before import (F08).
12. **Portal health.** Each portal adapter has a contract test in CI against recorded fixtures, and a runtime health check. When the page shape no longer matches, the adapter stops, says so, and offers the advocate a manual capture in the visible browser that still produces a capture record (RQ-41).
13. **Dates from the portal.** The portal's listed date for each captured document is stored on the capture record. It anchors relative dates when the document has no header date (RQ-23).

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| F-AC-01 | Importing a file and capturing the same bytes from the portal yields one blob with two origins. | [AUTO] |
| F-AC-02 | A capture record contains URL, final URL, time, hash, profile and gesture, and the hash equals the blob hash. | [AUTO] (fixture portal) |
| F-AC-03 | A capture record submitted through a harness connection is refused and audited. | [AUTO] |
| F-AC-04 | When the fixture portal shows a CAPTCHA, the capture state is `captcha_pending`, the browser is focused, and no input is sent to the CAPTCHA field by any automation. | [AUTO] |
| F-AC-05 | One solved session captures at least the case listing and all its order documents without a second CAPTCHA, where the fixture portal allows it. | [AUTO] |
| F-AC-06 | A renamed `.pdf` that is really a DOCX is detected as DOCX. | [AUTO] |
| F-AC-07 | An encrypted PDF yields an `encrypted` review item and no ingestion beyond hashing. | [AUTO] |
| F-AC-08 | Changing the fixture portal's HTML shape fails the contract test in CI and makes the runtime health check report `adapter_degraded`. | [AUTO] |
| F-AC-09 | Email text containing "change permissions" or "file the petition" produces no grant change and no filing proposal. | [AUTO] |
| F-AC-10 | Two scans with the same OCR text produce a possible-duplicate review item and are both kept. | [AUTO] |
| F-AC-11 | A case type code from the portal round-trips: stored, displayed with its verbatim label, and sent back to the portal search unchanged. | [AUTO] |
| F-AC-12 | Capture against the live portal for three real cases produces correct documents. | [HUMAN] (release check) |

## Edge cases

- The portal returns an HTML error page with a 200 status instead of a PDF. Detected by format check, recorded as a failed capture with the bytes kept for diagnosis.
- A redirect to a different host. Recorded in the final URL. A host outside the allow list fails the capture (M09).
- A captured PDF that is a scan of a scan, with no text layer.
- A ZIP attachment in email. Unpacked into separate entries, each with the ZIP as its parent origin.
- A macro-bearing DOCX or XLSM. Imported as bytes, never opened by an application that runs macros, and flagged.
- The advocate abandons a CAPTCHA. The capture times out to `abandoned` after the configured wait and is resumable.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Portal unreachable | Capture `failed` with `source_unreachable`, retry offered. No partial evidence entry. |
| Download interrupted | No evidence entry. The temporary file is discarded and the attempt logged in `captures/`. |
| India Code schema change | The adapter refuses unknown shapes with `schema_changed`, never guesses fields. |

## Observable outcomes

- Each file in the inbox shows its origin, capture record and ingestion state.
- The review inbox shows every format problem, possible duplicate and degraded adapter.
- `oa capture status` lists every pending CAPTCHA wait.

## Open questions

- OQ-13 (email providers).

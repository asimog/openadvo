# G. OCR and document intelligence

Components: G01 to G13. See [README](README.md) for tags and conventions.

## Purpose

Turning each source document into text the rest of the system can point at, without ever pretending a reading is certain when it is not. pdfium rasterises and extracts born-digital text. Two OCR engines, Tesseract and PaddleOCR, read every image page independently, each in its own process. An agreement engine compares their readings, marks disputed text, and stops disputed facts from propagating. Every line has a canonical shape that anchors point at.

## Decisions implemented

RQ-22, RQ-23, RQ-82, RQ-84, RQ-85, C-8, P7, L-06, L-15, H-07, H-10.

## Depends on

- C (line records, review items and disputes are committed by the kernel).
- D15 (the supervisor runs each OCR engine as a child process).
- F (ingestion hands over each file).
- H (extracted entities feed the Notebook).

## Assumptions

- Tesseract and PaddleOCR PP-OCRv5 are vendored into our tree, built by our CI, and run as separate executables with structured output (hOCR or ALTO for Tesseract, JSON for PaddleOCR).
- Both have Devanagari and English models bundled (H-10).
- pdfium is the one rasteriser for the viewer, the OCR input and anchor geometry (RQ-82).

## Non-goals

- No OCR model inside the window, kernel or harness process (C-8).
- No confidence-weighted choice between readings. Confidence is recorded, never used to pick a winner.
- No handwriting recognition claim. Handwritten pages go to the typed-copy path.
- No layout model in the first release. Layout is rules over boxes, and a model is added only if the rules lose on the gold set.

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa ocr run <doc> [--pages <range>]` | internal | Runs both engines on the pages and the agreement engine |
| `oa ocr lines <doc> --page <n>` | query | Canonical lines with both readings and agreement state |
| `oa ocr disputes [--doc <id>]` | query | Open disputes |
| `oa ocr decide <dispute> --reading <a|b|typed> [--text <t>]` | human | The advocate resolves a dispute |
| `oa ocr typed-copy <doc> --page <n> --file <txt>` | human | Records a typed copy for a handwritten page, with the typist |
| `oa extract entities <doc>` | query | Dates, case numbers, CNRs, parties, amounts, provisions, citations, negations with anchors |
| `oa ocr engines` | query | Engine versions, model hashes, health |
| `ocr-tesseract` / `ocr-paddle` | separate executables | Each reads a raster on stdin or by path and writes structured output. Runnable alone for testing |

## Rules

1. **One rasteriser.** Every page image comes from pdfium at a fixed DPI per profile. The raster hash is recorded. Viewer rectangles, OCR boxes and highlight boxes are all in that raster's coordinate space.
2. **Born-digital first.** Where a page has a usable text layer, its characters and boxes come from pdfium (G02) and OCR is skipped for that page. Whether a text layer is usable is a recorded rule, not a guess.
3. **Two engines, separately.** Every image page goes to both engines, each in its own process, each given the pdfium raster directly. Any pre-processing (deskew, binarise) is per engine and recorded. No shared step sits between the raster and both engines (L-15).
4. **Canonical line.** Each line record holds page, raster hash, line index, box, the text of each reading, each engine's confidence, engine and model versions, normalisation version, and a line hash. Anchors point at line hashes and boxes (G06).
5. **Agreement.** Normalise both readings (Unicode NFC, whitespace collapse, line-end hyphen join, Devanagari digits to ASCII), tokenise, classify tokens. Critical tokens (digits in any form, dates, amounts, years, case numbers, section and paragraph numbers, citations, party names, statutory provision names, negations) must match exactly. Prose tokens must be within the versioned edit-distance threshold. Any critical mismatch disputes the token and the fact it belongs to (RQ-22, decisions 5.4).
6. **Disputes stop propagation.** A disputed token cannot become a confirmed Notebook fact, a verified date, or a sentence in a generated section until the advocate decides it. It may appear in the Notebook marked disputed.
7. **Decisions are human.** `oa ocr decide` and `oa ocr typed-copy` are `human` class. The decider or typist is recorded (L-06).
8. **Dates.** Recognise explicit Indian date forms first (12.03.2019, 12-03-2019, 12/03/2019, 12th March 2019, March 12, 2019, Devanagari forms). Relative dates ("on the next day", "thereafter") resolve only against an anchor: the document's header date; else the portal's date for the document (RQ-23); else the advocate's answer. A conflict between header and portal dates asks the advocate. Vague expressions never become dates. Each date is `explicit`, `inferred` or `unresolved`, with time of day when stated.
9. **Entities.** G09 extracts dates, relative dates, case numbers, CNRs, party names, amounts, statutory provisions, citations and negations, by rules first with a model assist whose suggestions are marked as such. Each entity carries its anchor.
10. **Re-OCR is an event.** Running OCR again with a new engine version creates new line versions. Anchors on the old lines stay resolvable, and a mapping from old to new line hashes is recorded (G08).
11. **Pipeline.** Each document moves through its own states (`queued`, `rasterising`, `reading`, `agreeing`, `extracting`, `done`, `needs_review`, `failed`) with no global pause between stages (G10).
12. **Gold set.** A fixed gold set of pages with lawyer-checked text gates any engine, model, threshold or normalisation change. A change that lowers critical-token accuracy fails CI (G13).

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| G-AC-01 | Both engines run as separate OS processes. Killing one mid-page yields a `raised` tool failure and a review item, and the window, kernel and harness stay up. | [AUTO] |
| G-AC-02 | A malformed image that crashes an engine produces a review item, not a crash of any other process. | [AUTO] (fuzz fixtures) |
| G-AC-03 | Readings "12.03.2019" and "12.08.2019" produce a dispute on the date token. | [AUTO] |
| G-AC-04 | Readings "respondent" and "respondcnt" in prose produce no dispute. | [AUTO] |
| G-AC-05 | Readings differing only in a party name by one character produce a dispute. | [AUTO] |
| G-AC-06 | Readings "not" and "nut" in a negation position produce a dispute. | [AUTO] |
| G-AC-07 | A disputed date cannot be confirmed into the Factual Matrix through any command until decided. | [AUTO] |
| G-AC-08 | `oa ocr decide` from a harness connection is refused. | [AUTO] |
| G-AC-09 | "thereafter" produces no date. "on the next day" in a document with header date 10.01.2020 produces 11.01.2020 marked `inferred`. | [AUTO] |
| G-AC-10 | A document with no header date captured from the portal anchors relative dates on the portal's listed date. A document with neither raises one question to the advocate. | [AUTO] |
| G-AC-11 | Highlight boxes from an anchor land on the same word in the viewer raster as the OCR box, within one pixel. | [AUTO] |
| G-AC-12 | Re-running OCR with a new engine version keeps every existing anchor resolvable. | [AUTO] |
| G-AC-13 | The gold set critical-token accuracy is reported per engine and for the agreed output, and CI fails on regression. | [AUTO] |
| G-AC-14 | A 1,500 page scanned record completes without exhausting memory, processing pages in bounded batches. | [AUTO] |
| G-AC-15 | The review screen shows the page image region, both readings and the decision actions in one view, and a decision is one action. | [AUTO+HUMAN] |

## Edge cases

- Mixed English and Devanagari on one line.
- Stamps, seals and signatures overlapping text.
- Two-column judgments and tables of dates.
- A rotated page, a page upside down.
- One engine returns nothing for a page the other reads well. Every line is disputed for that page, and the review item says one engine failed.
- Indian number grouping (1,50,000) versus Western grouping (150,000) for the same amount. Normalised to digits before the exact comparison; the displayed form is kept.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Engine hangs | Killed at the page timeout, the page is `needs_review` with `engine_timeout`. |
| Both engines fail on a page | The page is `unreadable`, with the image shown for a typed copy. |
| pdfium cannot open a PDF | The document is `failed` with the reason. The blob is kept. |

## Observable outcomes

- Each document shows its pipeline state and dispute count.
- Each disputed token is highlighted in the viewer and listed in the review inbox.
- `oa ocr engines` shows both engines healthy with their versions.

## Open questions

None local.

# G. OCR and document intelligence

Components: G01 to G13. Conventions, test kinds and status words are in the [README](README.md).

**Status:** vendored pdfium, Tesseract and PaddleOCR with contract tests (Q08 steps 1 to 3), the real `ocr-tesseract` and `ocr-paddle` processes, supervisor process boundaries, born-digital text layer extraction from pdfium, gold set harness, 1,500 page bounded batch processing, and end-to-end flows are done. Remaining: GUI and visual tests, and the human sign-off on the full production gold set.

## Purpose

Turning each source document into text the rest of the system can point at, without pretending a reading is certain when it is not. pdfium rasterises and extracts born-digital text. Tesseract and PaddleOCR read every image page independently, each in its own process. The agreement engine compares their readings, marks disputed text, and stops disputed facts from propagating. Every line has a canonical shape that anchors point at.

## Decisions implemented

RQ-22, RQ-23, RQ-82, RQ-84, RQ-85, C-8, P7, L-06, L-15, H-07, H-10, P9, PH-06.

## Depends on

- C: lines, review items and disputes are committed by the kernel.
- D15: the supervisor runs each engine process.
- F: ingestion hands over each file. H: extracted entities feed the Notebook.
- Q08: the vendored engines.

## Vendored dependencies

| Dependency | Runs as | Interface |
|---|---|---|
| pdfium | Library in a worker process, never the window | Open, page count, rasterise at a DPI, text layer with character boxes |
| Tesseract, English and Devanagari | `ocr-tesseract` process | A raster in, hOCR or ALTO lines with boxes and confidences out |
| PaddleOCR PP-OCRv5 | `ocr-paddle` process | A raster in, JSON lines with boxes and confidences out |

## Non-goals

- No OCR model in the window, kernel or harness process (C-8).
- No confidence-weighted choice between readings. Confidence is recorded, never used to pick a winner.
- No handwriting recognition. Handwritten pages go to the typed-copy path.
- No layout model. Layout is rules over boxes.

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa ocr run <doc> [--pages <range>]` | internal | Runs both engines and the agreement engine |
| `oa ocr pipeline [--doc <id>]` | query | Each document's state, pages and dispute count |
| `oa ocr lines <doc> --page <n>` | query | Canonical lines with both readings and agreement state |
| `oa ocr disputes [--doc <id>]` | query | Open disputes |
| `oa ocr decide <dispute> --reading <a\|b\|typed> [--text <t>]` | human | The advocate resolves a dispute |
| `oa ocr typed-copy <doc> --page <n> --file <txt>` | human | A typed copy for a handwritten page, with the typist |
| `oa extract entities <doc>` | query | Dates, case numbers, CNRs, parties, amounts, provisions, citations, negations with anchors |
| `oa ocr engines` | query | Engine versions, model hashes, health, gold-set accuracy |
| `ocr-tesseract` / `ocr-paddle` | separate executables | Read a raster by path and write structured output. Runnable alone |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| OCR review (G11) | The page image region, both readings, disagreeing tokens highlighted by class | Decide a dispute or enter a typed copy (human control) |
| Pipeline | Each document's state, pages and dispute count | Re-run OCR on pages |
| Line inspector | Line hash, raster hash, boxes, both readings, confidences, engine and model versions, normalisation version | Compare readings |
| Engines | Both engines' health and versions, and gold-set accuracy | Open the gold-set report |
| Entities | Extracted entities with anchors, model-assisted ones marked | Open the anchor in the viewer |

## Rules

1. **One rasteriser.** Every page image comes from pdfium at a fixed DPI per profile. The raster hash is recorded. Viewer rectangles, OCR boxes and highlights share that coordinate space.
2. **Born-digital first.** Where a page has a usable text layer, characters and boxes come from pdfium (G02) and OCR is skipped. Usability is a recorded rule.
3. **Two engines, separately.** Every image page goes to both engines, each in its own process, each given the pdfium raster directly. Any pre-processing is per engine and recorded (L-15).
4. **Canonical line.** Page, raster hash, line index, box, each reading's text and confidence, engine and model versions, normalisation version, line hash. Anchors point at line hashes and boxes (G06).
5. **Agreement.** Normalise (NFC, whitespace collapse, line-end hyphen join, Devanagari digits to ASCII), tokenise, classify. Critical tokens (digits, dates, amounts, years, case numbers, section and paragraph numbers, citations, party names, provision names, negations) must match exactly. Prose tokens must be within the versioned edit-distance threshold. A critical mismatch disputes the token and its fact (RQ-22).
6. **Disputes stop propagation.** A disputed token cannot become a confirmed Notebook fact, a verified date or a sentence in a generated section until decided. It may appear marked disputed. The harness context marks it (D).
7. **Decisions are human.** `oa ocr decide` and `oa ocr typed-copy` are `human` class, and the decider or typist is recorded (L-06).
8. **Dates.** Explicit Indian forms first (12.03.2019, 12-03-2019, 12/03/2019, 12th March 2019, March 12, 2019, Devanagari). Relative dates resolve only against the header date, else the portal's date (RQ-23), else the advocate's answer. Vague expressions never become dates. Each date is `explicit`, `inferred` or `unresolved`.
9. **Entities.** Rules first, with a model assist whose suggestions are marked. Each entity carries its anchor.
10. **Re-OCR is an event.** A new engine version creates new line versions; old anchors stay resolvable through a recorded old-to-new mapping (G08).
11. **Pipeline.** Each document moves through `queued`, `rasterising`, `reading`, `agreeing`, `extracting`, `done`, `needs_review`, `failed`, with no global pause (G10).
12. **Gold set.** A fixed set of lawyer-checked pages gates any engine, model, threshold or normalisation change. Lower critical-token accuracy fails CI (G13).
13. **Real engines only.** Production runs the vendored engines. The stand-in engine exists only in tests.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| G-AC-01 | Both engines run as separate processes. Killing one mid-page yields a `raised` tool failure and a review item; the window, kernel and harness stay up. | [AUTO] | done |
| G-AC-02 | A malformed image that crashes an engine produces a review item and no other crash. | [AUTO] | done |
| G-AC-03 | Readings "12.03.2019" and "12.08.2019" dispute the date token. | [AUTO] | done |
| G-AC-04 | "respondent" and "respondcnt" in prose produce no dispute. | [AUTO] | done |
| G-AC-05 | A one-character difference in a party name disputes. | [AUTO] | done |
| G-AC-06 | "not" and "nut" in a negation position dispute. | [AUTO] | done |
| G-AC-07 | A disputed date cannot be confirmed into the Factual Matrix by any command until decided. | [AUTO] | done |
| G-AC-08 | `oa ocr decide` from a harness connection is refused. | [AUTO] | done |
| G-AC-09 | "thereafter" produces no date; "on the next day" with header date 10.01.2020 gives 11.01.2020, `inferred`. | [AUTO] | done |
| G-AC-10 | With no header date, a portal capture anchors on the portal's date; with neither, one question goes to the advocate. | [AUTO] | done |
| G-AC-11 | Highlight boxes land on the same word in the viewer raster as the OCR box, within one pixel. | [AUTO] | done |
| G-AC-12 | Re-running OCR with a new engine version keeps every anchor resolvable. | [AUTO] | done |
| G-AC-13 | Gold-set critical-token accuracy is reported per engine and for the agreed output, and CI fails on regression. | [AUTO] | done (auto); remaining (human) |
| G-AC-14 | A 1,500 page scanned record completes in bounded batches without exhausting memory. | [AUTO] | done |
| G-AC-15 | The review screen shows the image region, both readings and the decision actions in one view; a decision is one action. | [AUTO+HUMAN] | done (auto); remaining (human) |
| G-AC-16 | The line inspector shows both readings, confidences, engine versions and normalisation version. | [AUTO] | done |
| G-AC-17 | Every disputed token is highlighted in the viewer and links to its review item. | [AUTO] | done |
| G-AC-18 | A born-digital PDF page is read from its text layer and not sent to OCR. | [AUTO] | done |

### Contract tests

| ID | Contract | Status |
|---|---|---|
| G-CT-01 | pdfium opens the PDF corpus (scanned, born-digital, rotated, encrypted, damaged) and reports page counts and errors as expected. | done |
| G-CT-02 | pdfium rasterises a fixed page at the profile DPI to the recorded raster hash. | done |
| G-CT-03 | pdfium's text layer for a born-digital page gives the expected characters and boxes. | done |
| G-CT-04 | `ocr-tesseract` reads the English fixture pages to expected lines within the recorded accuracy. | done |
| G-CT-05 | `ocr-tesseract` reads Devanagari and mixed-script fixture pages within the recorded accuracy. | done |
| G-CT-06 | `ocr-paddle` reads the English fixture pages within the recorded accuracy. | done |
| G-CT-07 | `ocr-paddle` reads Devanagari and mixed-script fixture pages within the recorded accuracy. | done |

### GUI tests

| ID | Behaviour | Status |
|---|---|---|
| G-GUI-01 | In OCR review, choosing a reading draws through the human control and returns `ocr.decide` with that reading. | remaining |
| G-GUI-02 | Re-run in the pipeline view issues `ocr.run` for the selected pages only. | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| G-VIS-01 | OCR review, pipeline, line inspector, engines and entities in their six gallery states, including Devanagari lines. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| G-E2E-01 | Import a scanned two-column judgment: both real engines run, a planted date mismatch becomes a dispute in the inbox, the advocate decides it in the window, and the Notebook date becomes confirmable. | done |
| G-E2E-02 | Kill `ocr-paddle` mid-document: the page shows `needs_review`, the supervisor restarts the engine, and a re-run completes. | done |

## Edge cases

- Mixed English and Devanagari on one line.
- Stamps, seals and signatures over text.
- Two-column judgments and tables of dates.
- Rotated and upside-down pages.
- One engine returns nothing for a page the other reads: every line is disputed and the item says one engine failed.
- Indian number grouping (1,50,000) versus Western (150,000): normalised to digits for comparison; the displayed form is kept.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Engine hangs | Killed at the page timeout; the page is `needs_review` with `engine_timeout`. |
| Both engines fail on a page | The page is `unreadable`, with the image shown for a typed copy. |
| pdfium cannot open a PDF | The document is `failed` with the reason. The blob is kept. |
| An engine binary is missing or its hash is wrong | `dependency_unavailable`; OCR does not run on one engine alone. |

## Open questions

None.

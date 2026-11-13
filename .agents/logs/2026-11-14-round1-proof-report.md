# Round 1 proof run on a real brief

Date: 2026-11-14. Repository: `C:\dev\openadvo`, commit `e667d6b` plus this evidence. Nothing pushed.

This run does the round 1 proof tasks of build steps 1 to 4 on a real brief from the owner's test corpus `C:\dev\DOCSTEST` (the owner provided that folder for testing). The commands and results are below. The machine decisions that the proof run had to make (confirm an event, resolve a conflict) are recorded as the **test operator's** choices; the legal decisions remain the owner's.

## The brief

`C:\dev\DOCSTEST\SLPs\SHANKAR TELI`:

| Source | Pages |
|---|---|
| `CRA_2392_2008_Judgement_18-Oct-2019.pdf` (the impugned judgment) | 11 |
| `Atmaram_and_Ors_vs_State_of_Madhya_Pradesh_1005201s120333COM503984.pdf` | 11 |
| `AGAINST Gurmukh_Singh_vs_State_of_Haryana_25082009__SCs091541COM505229.pdf` | 7 |
| `The_State_of_Rajasthan_vs_Kanhaiya_Lal_10042019__SSC20191704191116222COM575205.pdf` | 6 |
| `State_of_Rajasthan_vs_Islam_and_Ors_24052011__SCs110597COM442844.pdf` | 5 |
| `AFFIDAVITS FACTS\Delhi-IndbCh.pdf` (a real scanned page, for the OCR branch of step 2) | 1 |

The folder's own `SHANKAR TELI SLP.docx` was read as the reference for the List of Dates only; the application ingests PDFs, so it was not added to the matter.

## Step 1 — matter, sources, hashes

- One matter, `Shankar Teli v. State of Madhya Pradesh`.
- Six sources added; every source has a SHA-256, a size and status `ok` after ingestion. Examples: CRA 2392 `89a6495e…`, Atmaram `5127e304…`, Islam `ffcd9ed8…`, Gurmukh `b7062422…`, Kanhaiya Lal `86f05f1c…`, Delhi `df061720…`.
- 41 pages ingested in six jobs, all `done` with no error.
- **Restart:** the application was closed and opened again. All six sources came back `ok`, the ingestion jobs and pages came back (`pagesTotal 41`), 90 events and 89 confirmations persisted, the Notebook readiness was `ready`, and the integrity notice was empty.

Evidence: `step1-sources.png`, `round1-proof.json` (`step1-sources`, `step1-restart`).

## Step 2 — text, readings, page images, review items, PDF editor

- **Page count.** Every source's stored page count equals the PDF's own page count (7, 11, 11, 5, 6, 1).
- **Readings.** 40 pages are born-digital (text layer). 1 page is a single OCR reading at 80% confidence (the scanned page). No page had no text.
- **Page images compared by eye.** Three born-digital page images and the scanned page image were rendered from the stored bytes and compared with the stored text; the text matches the page. The images show a defect used later: every manupatra page ends with a footer "05-06-2020 (Page N of M)".
- **Scanned page.** The page panel shows "OCR: single reading, not cross-checked (80%)". The OCR text matches the travel ticket on the image (booking time 18 Jan 2020, phone, PNR), with the usual single-reading errors ("ne t2ne tholidays" for the email, spaces inside words).
- **Review items.** One open item appeared: a `date_conflict` item for two dates extracted from the first pages of two different judgments (see step 3). It was left to the conflict decision; the Notebook readiness reached `ready`.
- **PDF editor.** Each of the six sources opened read only in the Euro-Office PDF editor ("Opened read only in the Euro-Office PDF editor.").

Evidence: `step2-pdf-editor.png`, `step2-scanned-page.png`, `page-born_digital-*.png`, `page-ocr-DelhiIndbCh-p1.png`, `round1-proof.json` (`step2-pages`, `step2-visual-pages`, `step2-scanned-panel`, `step2-editor`).

## Step 3 — Notebook, chronology, source checks, conflicts

- **Events.** 90 events extracted from the 40 born-digital pages and the scanned page.
- **Test-operator decision rule.** An event was confirmed when its date text was on its recorded source line (a numeric form, or the written form with a year); it was rejected otherwise. Result: **89 confirmed, 1 rejected**. The rejected event is the time "4-4.30" read as a date.
- **Ten checks** (all correct; each is the date text on the recorded line):

| Date | Source | Page, line |
|---|---|---|
| 18.3.1988 | State of Rajasthan v. Islam | p. 2, l. 35 |
| 16-5-1988 | Atmaram v. State of MP | p. 5, l. 44 |
| 10.8.1990 | Gurmukh Singh v. State of Haryana | p. 5, l. 19 |
| 15.8.1990 | Gurmukh Singh v. State of Haryana | p. 5, l. 19 |
| 11.1.93 | Atmaram v. State of MP | p. 4, l. 3 |
| 8.11.93 | Atmaram v. State of MP | p. 4, l. 1 |
| 8.11.93 | Atmaram v. State of MP | p. 4, l. 2 |
| 8.11.93 | Atmaram v. State of MP | p. 4, l. 3 |
| 11.11.93 | Atmaram v. State of MP | p. 4, l. 4 |
| 6.1.94 | Atmaram v. State of MP | p. 4, l. 3 |

- **Date conflict.** One conflict was flagged: "24.05.2011 (State of Rajasthan v. Islam, p. 1, l. 6)" against "10.04.2019 (State of Rajasthan v. Kanhaiya Lal, p. 1, l. 6)". Both are the "Decided On:" line of two **different** judgments. Both anchors carry their own date, so the test operator resolved it as "both dates are right". This is a false conflict: the step 3 rule treated the two opening metadata lines as the same act. The owner should look at this (finding 2 below).
- Readiness after the decisions: `ready`, 0 open review items, 0 pending jobs.

Evidence: `step3-factual-matrix.png`, `step3-chronology.png`, `round1-proof.json` (`step3-notebook`).

## Step 4 — List of Dates and Synopsis

- **List of Dates.** Generated from the 89 confirmed events: 90 paragraphs, 89 anchored. Revision 1 by `generator`.
- **Show source.** Five paragraphs were followed: each panel showed the event date, the Notebook description and the source line. One panel's "Open source" opened the source at Page 2 of 5 with line 35 marked (the 18.3.1988 line).
- **Human saves.** Two edits and saves made revision 2 and revision 3, each with a base revision, author `advocate`. Revision 3 was approved. The 89 anchors were still present after both saves.
- **Synopsis.** 91 paragraphs, 90 anchored (the last paragraph is the DRAFT note).
- **Microsoft Word 16.0.** The approved DOCX opened with **89 content controls whose tags are the 89 anchors**; Word saved it again, and the reader recovered the same 89 anchors and identical text.

Evidence: `step4-list-of-dates.png`, `step4-show-source.png`, `step4-approved.png`, `step4-synopsis.png`, `approved-list-of-dates.docx`, `word-check.json`, `approved-in-word.docx`, `round1-proof.json` (`step4-drafts`, `step4-word`).

## Comparison with the brief's own SYNOPSIS AND LIST OF DATES

The real SLP draft has a curated List of Dates with five rows: 16.05.2007, 16.05.2007, 21.05.2007, 31.10.2008, 18.10.2019. The generated list has 89 rows. **All five real dates appear in the generated list**; none is missing. The generated list also contains the other dates that the five judgments carry (36 distinct dates), because v0 converts every confirmed dated line, not a selection. This is the expected v0 behaviour, and it shows the gap a later version must close: selecting and ordering the rows is the advocate's work; the generator does not yet help with that selection.

## Findings (for the report and parking)

1. **Footer print dates become events.** The manupatra footer "05-06-2020 (Page N of M)" is extracted as the event 05.06.2020 and reaches the List of Dates. The existing parking line about dropping running headers and footers is correct; this is the evidence.
2. **False cross-document conflict.** Two different judgments' "Decided On: … Appellants: …" opening lines were treated as the same act with different dates. The review item and conflict work as designed, but the same-act rule should not compare document metadata lines. Step 3, second version.
3. **Time read as a date.** "4-4.30" (a time range) was accepted as a date candidate by the step 3 extractor; the proof operator rejected it by hand. Step 3, second version.
4. **Generated prose carries metadata.** Descriptions such as "Decided On: 24.05.2011 Appellants:State of Rajasthan" and paragraph numbers reach the List of Dates and the Synopsis. Step 3 owns the text; the title-and-date cleaning is parked.
5. **Curation gap.** 89 generated rows against 5 curated rows: the generated List of Dates is exhaustive, not selected. A later version needs the advocate's selection/curation in the draft (the editor already supports editing, so this is workable at proof time, but it is manual).

## What the owner still decides

- The 89 confirmations and the one "both" conflict resolution were made mechanically by the test operator. They are testing decisions, not legal decisions. The owner should review the chronology and the conflict.
- The round 1 proof tasks are done as software evidence. Lesson L3 still asks the owner to complete the same tasks on their own brief; this run is the strongest available substitute and it is on real documents, but it is not the owner's own proof.

## Evidence index

`C:\dev\openadvo\.agents\logs\2026-11-14-round1-proof\`: `round1-proof.json` (all steps), `step1-sources.png`, `step2-pdf-editor.png`, `step2-scanned-page.png`, `page-born_digital-*.png`, `page-ocr-DelhiIndbCh-p1.png`, `step3-factual-matrix.png`, `step3-chronology.png`, `step4-list-of-dates.png`, `step4-show-source.png`, `step4-approved.png`, `step4-synopsis.png`, `approved-list-of-dates.docx`, `approved-in-word.docx`, `word-check.json`.

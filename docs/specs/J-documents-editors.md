# J. Documents, viewers and editors

Components: J01 to J15. Conventions, test kinds and status words are in the [README](README.md).

**Status:** the draft revision model, proposals, accept and reject, conflicts, reverts, generators with event ids, conversion records, the PDF-is-never-edited rule, the Changes viewer and review notes work against a stand-in DOCX engine and writer. Remaining, in order: the PDF viewer on vendored pdfium (step 5); then vendored WordCraft, PdfCraft, `docx-rs` and veraPDF, reparenting into the view pane, the fidelity oracle with Word, and the corpus regression (step 7).

## Purpose

Showing documents and editing drafts. Our own PDF viewer, document viewer and edit surface are what the agent sees and proposes edits through, with anchors on every paragraph and region. The full editor is WordCraft, vendored and run as a hosted process reparented into the view pane. PdfCraft is hosted the same way. DOCX is the working format of every draft, and the filing is PDF/A. DOCX is first-release scope (PH-11).

## Decisions implemented

RQ-27, RQ-72, RQ-77, RQ-78, RQ-79, RQ-82, C-2, C-3, C-7, X-01, X-04, X-20, L-09, H-02, H-03, H-08, P9, M-14, M-15, PH-06, PH-11.

## Depends on

- G01, G02: pdfium raster and text. C05: the draft store owns every revision.
- D15: the supervisor runs WordCraft and PdfCraft. H: generators read the Notebook. K: draft checks (until K, gates are `unavailable`).
- A: views live in the view pane.
- Q08: the vendored engines.

## Vendored dependencies

| Dependency | Runs as | Interface |
|---|---|---|
| pdfium | Viewer worker process | Raster, text layer, search (shared with G) |
| WordCraft fork | `wordcraft --headless` pipe server, and `wordcraft --edit` hosted window | Open, paragraph model, apply edit, save, render to PDF, corpus run |
| PdfCraft fork | `pdfcraft` hosted window | Open a source PDF for annotation; refuses filing PDFs |
| `docx-rs` | Library in the kernel's document worker | Write the first revision of a generated draft |
| veraPDF | Separate process | Validate PDF/A at a part and level |
| Fonts | Bundled | An embeddable PDF face with Devanagari coverage |

WordCraft and PdfCraft each pin their own egui and winit forks, so their UI is never linked into our window.

## Non-goals

- Our viewer makes no Word-fidelity claim.
- No second DOCX reader. WordCraft's engine is the one reader and editor (X-04).
- No .NET compare engine (C-7).
- No typesetting of the petition body in `typst`. `typst` lays out only pages not in the DOCX: index, cover, certificates, page-label sheets.

## The DOCX engine boundary

| Operation | Done by |
|---|---|
| First revision of a generated draft | `docx-rs`, writer only (J04) |
| Reading any DOCX for display, anchors or the agent's model | WordCraft engine, headless |
| Applying an accepted agent edit | WordCraft engine, headless |
| The advocate's free editing | WordCraft, hosted in the view pane |
| Rendering the approved revision to PDF | WordCraft engine (OQ-03) |
| PDF/A conversion, assembly, bookmarks, page labels, index pages | J13, validated by veraPDF |

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa view <doc\|rev> [--page <n>]` | query | Opens in our viewer and returns the split's state |
| `oa draft new --template slp [--from-notebook]` | internal | Generates the first revision |
| `oa draft paragraphs <rev>` | query | Paragraph ids, styles, text and anchors |
| `oa draft propose <draft> --para <id> --replace <text> [--reason <r>]` | internal | A proposal against a paragraph anchor |
| `oa draft accept <proposal>` / `reject <proposal>` | human | The advocate decides a proposal |
| `oa draft open-editor <draft>` | internal | Opens the head in hosted WordCraft on a working copy |
| `oa draft import-working-copy <draft>` | internal | WordCraft's saved bytes as a new revision |
| `oa draft diff <rev-a> <rev-b>` | query | Paragraph-level diff by id |
| `oa draft render <rev> --out <pdf>` | internal | Renders through the DOCX engine |
| `oa filing pdf <rev> --out <pdfa>` | internal | Builds the PDF/A filing document (J13) |
| `oa fidelity check <rev>` | query | The fidelity oracle (J12) |
| `oa pdf open-editor <doc>` | internal | Opens a source PDF in hosted PdfCraft |
| `wordcraft --headless [corpus <dir>]` | separate executable | The engine as a pipe server, or the corpus regression |

## GUI

All of these are view pane views.

| View | Shows | The advocate can |
|---|---|---|
| PDF viewer (J01) | Pages, text layer, anchor highlights, disputed tokens | Select, search, point the agent at a region |
| Document viewer (J02) | Paragraphs by id with their event and authority ids | Open the sources of any sentence |
| Edit surface (J03) | Pending proposals as marked changes against their paragraphs | Accept or reject (human control) |
| Changes viewer (J15) | Any two revisions diffed by paragraph id, with authors; review notes under their paragraphs | Add notes; send a note to the agent when the agent capability is granted |
| WordCraft (J05) | The hosted editor, reparented into a split | Edit freely |
| PdfCraft (J09) | The hosted PDF tool on a source PDF | Annotate |
| Fidelity report (J12) | Page-by-page differences between renderers | Open each difference |
| Conversion report | The conversion check paragraph by paragraph, and the PDF/A validation | Open a failing paragraph in both forms |

## Rules

1. **Anchors.** A draft anchor is the revision hash, a block id and an optional character range. A generated paragraph keeps its id across every edit. A paragraph created in WordCraft gets its id from WordCraft.
2. **The draft store owns revisions.** WordCraft works on a working copy. Its saved bytes become a new revision through `import-working-copy`, authored by WordCraft. WordCraft never writes into `drafts/<draft id>/` (RQ-72).
3. **Agent edits are proposals.** The agent proposes against anchors on our edit surface. An accepted proposal is applied by the DOCX engine and committed as its own revision (RQ-27).
4. **Conflicts.** If the head moved since the proposal's base, the proposal is re-based and shown again as a new proposal, never applied silently (L-09).
5. **Revert and checkpoints** are new revisions (C rules 9 and 10). The edit surface shows each agent edit with a revert action.
6. **Generators keep event ids.** The List of Dates, Synopsis, Questions of Law and Grounds generators (J10) attach the event, fact and authority ids of each sentence in a custom XML part keyed by paragraph id.
7. **Annexures.** J11 is the one numbering authority. Numbering and page references are recomputed on every render.
8. **Hosting.** Hosted windows are reparented into a view pane split (RQ-77). They have no taskbar entry, follow our window's position, size, minimise and DPI, and get focus when the split is focused. When reparenting fails, the window is an owned top-level window and the split says so.
9. **Filing PDF.** The approved revision, rendered by the DOCX engine, assembled with annexures and generated pages, converted to PDF/A per the rule pack, with bookmarks, page labels and index, and validated by veraPDF. Its hash is what the filing token binds to. The flow is in [decisions.md](../decisions.md) 5.5.
10. **Fidelity oracle.** J12 renders a revision with our viewer, the WordCraft engine and Word through COM when installed, and diffs page by page. It gates upgrades to J02, J05 and the renderer.
11. **Viewer.** J01 renders from pdfium with a text layer, search, thumbnails, zoom and highlights. J02 renders from the paragraph model the DOCX engine returns. Neither parses DOCX itself.
12. **Conversion only from an approved, clear revision.** `oa filing pdf` refuses otherwise.
13. **The PDF is never edited.** No component, PdfCraft included, opens the filing PDF for editing.
14. **Conversion record.** Each conversion links the DOCX revision hash, the renderer and version, the PDF/A hash and the page count.
15. **Stable ids on every block**: paragraphs, tables, rows, cells, list items, footnotes.
16. **Uninterpreted XML is preserved** byte for byte on save.
17. **Corpus regression.** `wordcraft --headless corpus <dir>` opens, edits one paragraph, saves and re-opens every DOCX in a corpus of real petitions and court documents, and reports every lost id or changed byte outside the edit.
18. **One Changes viewer.** Every diff between revisions is shown by J15. It is read only unless given the agent capability.
19. **Real engines only.** Production uses the vendored WordCraft, PdfCraft, `docx-rs` and veraPDF. Stand-ins exist only in tests.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| J-AC-01 | Every paragraph id in a generated draft survives open, edit of another paragraph, and save in WordCraft. | [AUTO] | remaining (WordCraft) |
| J-AC-02 | The headless engine applies a replacement and returns bytes whose other paragraphs are byte-identical in `document.xml`. | [AUTO] | remaining (WordCraft) |
| J-AC-03 | An accepted proposal produces exactly one new revision authored by the agent configuration and turn. | [AUTO] | done |
| J-AC-04 | A proposal on a stale base is shown again as a new proposal and not committed until accepted. | [AUTO] | done |
| J-AC-05 | `oa draft accept` from a harness connection is refused. | [AUTO] | done |
| J-AC-06 | Reverting the third of five agent edits equals applying 1, 2, 4 and 5 when they touch different paragraphs. | [AUTO] | done |
| J-AC-07 | WordCraft writing under `drafts/<draft id>/` is detected and refused. | [AUTO] | done |
| J-AC-08 | Every sentence in a generated List of Dates carries an event id, and every date equals the event's date. | [AUTO] | done |
| J-AC-09 | The filing PDF passes veraPDF at the configured part and level. | [AUTO] | remaining (veraPDF) |
| J-AC-10 | The filing PDF's bookmarks and index page numbers match the annexure numbering. | [AUTO] | remaining (real renderer) |
| J-AC-11 | Hosted WordCraft has no taskbar entry and tracks our window through move, resize and minimise. | [AUTO] | remaining (reparenting) |
| J-AC-12 | At a DPI change the hosted window stays reparented and scaled, or falls back to an owned window with a notice. | [AUTO+HUMAN] | remaining |
| J-AC-13 | The fidelity oracle reports page-level differences for the fixture petitions; differences above the threshold fail. | [AUTO] | remaining (Word comparison) |
| J-AC-14 | A WordCraft crash with unsaved edits loses no committed revision and offers its autosave as a new revision. | [AUTO] | remaining (WordCraft) |
| J-AC-15 | Typing, IME input and spell check in hosted WordCraft feel native. | [HUMAN] | remaining |
| J-AC-16 | The filing PDF looks like a properly prepared Supreme Court paper book. | [HUMAN] | remaining |
| J-AC-17 | `oa filing pdf` on an unapproved or blocked revision exits 1 and writes no PDF. | [AUTO] | done |
| J-AC-18 | Opening the filing PDF in PdfCraft for editing is refused. | [AUTO] | done |
| J-AC-19 | Every conversion record's PDF/A hash equals the file on disk. | [AUTO] | done |
| J-AC-20 | The Changes viewer shows agent proposals, WordCraft saves and restores, each with its author. | [AUTO] | done |
| J-AC-21 | A review note stays attached to its paragraph id in later revisions. | [AUTO] | done |
| J-AC-22 | The conversion report shows a failing paragraph from both sides. | [AUTO] | done |
| J-AC-23 | The corpus regression reports no lost block id and no changed byte outside the edit on the fixture corpus. | [AUTO] | remaining (WordCraft) |
| J-AC-24 | The PDF viewer renders a source PDF from pdfium with a text layer, search and anchor highlights in a view pane split. | [AUTO] | remaining (pdfium) |

### Contract tests

| ID | Contract | Status |
|---|---|---|
| J-CT-01 | WordCraft preserves `w14:paraId` and bookmarks through open, edit and save on the fixture corpus. | remaining |
| J-CT-02 | WordCraft headless applies a paragraph replacement over its pipe and nothing else changes. | remaining |
| J-CT-03 | WordCraft renders the fixture petitions to PDF with the expected page count. | remaining |
| J-CT-04 | The embedded PDF face renders English and Devanagari text extractable as the same characters. | remaining |
| J-CT-05 | PdfCraft opens a source PDF for annotation and refuses a file marked as a filing PDF. | remaining |
| J-CT-06 | `docx-rs` writes a template with paragraph ids that WordCraft reads back unchanged. | remaining |
| J-CT-07 | veraPDF passes a known-good PDF/A and fails a known-bad one with the expected rule ids. | remaining |

### GUI tests

| ID | Behaviour | Status |
|---|---|---|
| J-GUI-01 | In the PDF viewer, selecting a region and choosing "point the agent here" puts its anchor in the chat pane's instruction context. | remaining |
| J-GUI-02 | Accept and reject on the edit surface draw through the human control and return `draft.accept` or `draft.reject`. | remaining |
| J-GUI-03 | Opening WordCraft from a draft fills a view pane split and collapses nothing else. | remaining |
| J-GUI-04 | Keyboard: page up and down, search and next match work in the PDF viewer without a mouse. | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| J-VIS-01 | PDF viewer, document viewer, edit surface, Changes viewer, fidelity report and conversion report in their six gallery states. | remaining |
| J-VIS-02 | The PDF viewer with a disputed token highlighted and a Devanagari page. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| J-E2E-01 | Generate an SLP draft from a Notebook, have the agent propose two edits, accept one in the window, edit freely in hosted WordCraft, import the save, and see three revisions with authors in the Changes viewer. | remaining |
| J-E2E-02 | Approve a revision and build the filing PDF: veraPDF passes, the conversion check passes, and the conversion record hash equals the file. | remaining |

## Edge cases

- Pasted text brings foreign paragraph ids: duplicates are re-issued on import, with the mapping recorded.
- Tracked changes made in WordCraft are kept; accepting them is an advocate edit and a new revision.
- A paragraph split in WordCraft: the first half keeps the id, the second gets a new one, and old anchors point at the first half with a split marker.
- A deleted paragraph that a record referenced: the record stays bound to the old revision, and the check re-runs.
- WordCraft and the agent edit at once: the import meets a moved head and becomes a conflict for the advocate.

## Failure modes

| Failure | Honest state shown |
|---|---|
| WordCraft cannot open a DOCX | The revision is `unreadable` in our viewer, with the reason. |
| Render to PDF fails | Filing preparation is blocked with the engine's reason. |
| Reparenting fails | Owned window, and the split says so. |
| A vendored engine is missing or its hash is wrong | `dependency_unavailable` in the view; no stand-in is used. |

## Open questions

- OQ-01 (WordCraft), OQ-03 (renderer).

# J. Documents, viewers and editors

Components: J01 to J14. See [README](README.md) for tags and conventions.

## Purpose

Showing documents and editing drafts. Our own lightweight PDF viewer, document viewer and edit surface are the surface the agent sees and proposes edits through, with anchors on every paragraph and region. The full editor is WordCraft, vendored into our tree and run as a hosted process reparented into our pane. PdfCraft is hosted the same way for PDF work. DOCX is the working format of every draft, and the filing is PDF/A.

## Decisions implemented

RQ-27, RQ-72, RQ-77, RQ-78, RQ-79, RQ-82, C-2, C-3, C-7, X-01, X-04, X-20, L-09, H-02, H-03, H-08.

## Depends on

- G01 and G02 (pdfium raster and text).
- C05 (the draft store owns every revision).
- D15 (the supervisor runs WordCraft and PdfCraft).
- H (generators read the Notebook).
- K (draft consistency checks).

## Assumptions

- WordCraft and PdfCraft are the user's own forks, vendored into our tree. Each pins its own egui and winit fork, so their UI is never linked into our window.
- WordCraft's document engine can be driven without its window, preserves DOCX paragraph ids (`w14:paraId`) and bookmarks through open, edit and save, and can render a DOCX to PDF. These three are hidden dependency H-02 and H-03, and the first spike must prove them.

## Non-goals

- Our viewer makes no Word-fidelity claim.
- No second DOCX reader. WordCraft's engine is the one DOCX reader and editor (X-04).
- No .NET compare engine in the first release (C-7).
- No typesetting of the petition body in `typst`. `typst` lays out only the pages that are not in the DOCX: index, cover, certificates, page-label sheets.

## The DOCX engine boundary

| Operation | Done by |
|---|---|
| First revision of a generated draft (from templates and generators) | `docx-rs`, writer only (J04) |
| Reading any DOCX for display, anchors or the agent's model | WordCraft engine, headless |
| Applying an accepted agent edit | WordCraft engine, headless |
| The advocate's free editing | WordCraft application, hosted |
| Rendering the approved revision to PDF | WordCraft engine (OQ-03) |
| PDF/A conversion, assembly, bookmarks, page labels, index pages | J13 |

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa view <doc|rev> [--page <n>]` | query | Opens in our viewer and returns the pane state |
| `oa draft new --template slp [--from-notebook]` | internal | Generates the first revision with `docx-rs` |
| `oa draft paragraphs <rev>` | query | Paragraph ids, styles, text and anchors from the DOCX engine |
| `oa draft propose <draft> --para <id> --replace <text> [--reason <r>]` | internal | An agent or advocate proposal against a paragraph anchor |
| `oa draft accept <proposal>` / `oa draft reject <proposal>` | human | The advocate decides a proposal |
| `oa draft open-editor <draft>` | internal | Opens the head in hosted WordCraft on a working copy |
| `oa draft import-working-copy <draft>` | internal | Captures WordCraft's saved bytes as a new revision |
| `oa draft diff <rev-a> <rev-b>` | query | Paragraph-level diff by paragraph id |
| `oa draft render <rev> --out <pdf>` | internal | Renders through the DOCX engine |
| `oa filing pdf <rev> --out <pdfa>` | internal | Builds the PDF/A filing document (J13) |
| `oa fidelity check <rev>` | query | The fidelity oracle (J12) |
| `wordcraft --headless` | separate executable | WordCraft's engine as a pipe server, runnable alone for tests |

## Rules

1. **Anchors.** A draft anchor is the revision hash, a DOCX paragraph id and an optional character range. A generated paragraph gets its id at generation and keeps it across every edit. A paragraph created by the advocate in WordCraft gets an id from WordCraft.
2. **Draft store owns revisions.** WordCraft works on a working copy. Its saved bytes become a new revision through `oa draft import-working-copy`, with WordCraft as the author. WordCraft never writes into `drafts/<draft id>/` (RQ-72).
3. **Agent edits are proposals.** The agent proposes against paragraph anchors on our edit surface (J03). An accepted proposal is applied by the DOCX engine and committed as its own revision (RQ-27).
4. **Conflicts.** If the head moved since the proposal's base, the proposal is re-based and shown again to the advocate as a new proposal. It is never applied silently (L-09).
5. **Revert and checkpoints.** A revert of one agent edit and a restore to a checkpoint are new revisions (C rules 7 and 8). The edit surface shows each agent edit with a revert action.
6. **Generators keep event ids.** The List of Dates, Synopsis, Questions of Law and Grounds generators (J10) attach the event, fact and authority ids each sentence came from, in a custom XML part keyed by paragraph id.
7. **Annexures.** J11 is the one numbering authority. Numbering and page references are recomputed on every render and checked by K06.
8. **Hosting.** Hosted windows are reparented into our pane (RQ-77). They have no taskbar entry, follow our window's position, size, minimise and DPI, and receive keyboard focus when the pane is focused. When reparenting fails (some modal dialogs, DPI transitions), the hosted window is shown as a separate top-level window owned by ours, and the pane says so.
9. **Filing PDF.** The filing document is the approved revision rendered by the DOCX engine, assembled with annexures and generated pages, converted to PDF/A (part and level per the rule pack), with bookmarks, page labels and index. The output hash is what the filing token binds to (L-04). The flow is in [decisions.md](../decisions.md) 5.5.
10. **Fidelity oracle.** J12 renders a revision with our viewer, the WordCraft engine, and Word when installed, and diffs them page by page. It gates upgrades to J02, J05 and the renderer.
11. **Viewer.** J01 renders PDFs from pdfium with a text layer, search, thumbnails, zoom and anchor highlights. J02 renders DOCX from the paragraph model the DOCX engine returns. Neither parses DOCX itself.
12. **Conversion only from an approved, clear revision.** `oa filing pdf` refuses a revision that is not the approved head or whose gates are not clear.
13. **The PDF is never edited.** No component, including PdfCraft, opens the filing PDF for editing. Any change goes back to the DOCX as a new revision, which must be verified, approved and converted again.
14. **Conversion record.** Each conversion writes a record linking the approved DOCX revision hash, the renderer and its version, the PDF/A hash and the page count. The conversion check (K) runs on it.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| J-AC-01 | Every paragraph id in a generated draft survives open, edit of another paragraph, and save in WordCraft. | [AUTO] |
| J-AC-02 | WordCraft's headless engine applies a paragraph replacement and returns bytes whose other paragraphs are byte-identical in `document.xml`. | [AUTO] |
| J-AC-03 | An accepted agent proposal produces exactly one new revision authored by the agent configuration and turn. | [AUTO] |
| J-AC-04 | A proposal on a stale base is shown again as a new proposal and is not committed until accepted. | [AUTO] |
| J-AC-05 | `oa draft accept` from a harness connection is refused. | [AUTO] |
| J-AC-06 | Reverting the third of five agent edits yields content equal to applying edits 1, 2, 4 and 5 when they touch different paragraphs. | [AUTO] |
| J-AC-07 | WordCraft writing a file anywhere under `drafts/<draft id>/` is detected and refused by the boundary. | [AUTO] |
| J-AC-08 | Every sentence in a generated List of Dates carries at least one event id, and every date in it equals the event's date. | [AUTO] |
| J-AC-09 | The filing PDF passes a PDF/A validator (veraPDF) at the configured part and level. | [AUTO] |
| J-AC-10 | The filing PDF's bookmarks and index page numbers match the annexure manager's numbering. | [AUTO] |
| J-AC-11 | A hosted WordCraft window has no taskbar entry and tracks our window through move, resize and minimise. | [AUTO] |
| J-AC-12 | At a DPI change, the hosted window either stays reparented and correctly scaled, or falls back to an owned window with a notice. | [AUTO+HUMAN] |
| J-AC-13 | The fidelity oracle reports page-level differences for the fixture petitions, and differences above the threshold fail. | [AUTO] |
| J-AC-14 | A WordCraft crash with unsaved edits loses no committed revision, and offers recovery of WordCraft's own autosave as a new revision. | [AUTO] |
| J-AC-17 | `oa filing pdf` on an unapproved revision, or one with a blocked gate, exits 1 and produces no PDF. | [AUTO] |
| J-AC-18 | Opening the filing PDF in PdfCraft for editing is refused. | [AUTO] |
| J-AC-19 | Every conversion record links a DOCX revision hash to a PDF/A hash, and the PDF/A hash equals the file on disk. | [AUTO] |
| J-AC-15 | Typing, IME input and spell check in hosted WordCraft feel native to an advocate. | [HUMAN] |
| J-AC-16 | The filing PDF looks like a properly prepared Supreme Court paper book. | [HUMAN] |

## Edge cases

- The advocate pastes text from another document into WordCraft, bringing foreign paragraph ids. Duplicate ids are re-issued by the engine on import and the mapping is recorded.
- Tracked changes made in WordCraft. Kept in the DOCX. Accepting them in WordCraft is an advocate edit and a new revision.
- A paragraph split in two in WordCraft. The first half keeps the id, the second gets a new id, and anchors to the old id point at the first half with a split marker.
- A paragraph deleted that a verification record or approval referenced. The record stays bound to the old revision. The new revision has no such anchor, so the check re-runs and reports.
- A draft opened in WordCraft and edited by the agent at the same time. The import of WordCraft's save meets a moved head and becomes a conflict for the advocate.

## Failure modes

| Failure | Honest state shown |
|---|---|
| WordCraft engine cannot open a DOCX | The revision is shown as `unreadable` in our viewer, with the reason. |
| Render to PDF fails | Filing preparation is blocked with the engine's reason. |
| Reparenting fails | Fallback window with a pane notice. |

## Observable outcomes

- The draft history shows every revision with its author and a revert action for agent edits.
- The edit surface shows pending proposals as marked changes against their paragraphs.
- The filing document view shows the PDF/A validation result.

## Open questions

- OQ-01 (WordCraft reconciliation), OQ-03 (renderer).

# v0 spec: document intelligence, page anchors, Euro-Office PDF view

Step 2 of [../build-plan.md](../build-plan.md). Serves workflow section 4 and Appendices A and B-A.

**Input.** The PDF sources of a step 1 matter.

**Output.**
- In `matter.db`: one page record per page (source, page number, text kind `born_digital`, `ocr` or `none`, text); one line anchor per text line (source SHA-256, page, line number, box, text); one OCR reading per OCR page (engine, version, confidence); one job record per source (state, error); review items.
- In the window: the complete official Euro-Office release, hosted in the view pane. A source opens in its PDF editor, read only, with the page text beside it.

**Rules.**

1. Ingestion is separate from capture. A job starts when a source is added, or when a matter opens with a source that has no job. A job never changes the blob.
2. Only the matter store writes. `lib/document-intelligence` computes; `main/ingest.ts` passes results to `main/matters.ts`.
3. Every anchor names the source SHA-256, the page and the line, so it survives a rename.
4. An OCR page is marked "single reading, not cross-checked". It is never shown as verified.
5. A page with no text after OCR, or a file that cannot be read, opens a review item. Nothing is hidden.
6. Vendored Euro-Office files are never changed. The font list and the host page are ours, served beside them.

**Surfaces.**
- `scripts/vendor-euro-office.mjs` fetches the release for this platform, checks its sha256, and copies `editors/`, `converter/`, `fonts/`, `dictionaries/`.
- A custom protocol serves the vendored files, our host page and the font list to a sandboxed frame in the view pane. The frame reads only the source the main process opened for it.
- Bridge queries: `getSourcePages`, `listReviewItems`, `getIngestState`, `openSourceView`. Human actions: `resolveReviewItem`, `skipReviewItem`.
- Agent tools (read only): `read_source_text` (one source, a page range) and `search_sources` (text search; returns anchors).

**Not in v0.** A second OCR engine and disputes; automatic document type; annexure references; duplicate kind 3; image and DOCX sources; editing or saving a PDF; marking a line inside the PDF editor (to verify; the anchor shows in the text panel); Hindi.

**Proof task.** The owner opens each PDF of a real brief in the window, checks three pages of born-digital text and three scanned pages against the page, asks the agent to find a phrase and gets its page and line, and resolves or skips every review item.

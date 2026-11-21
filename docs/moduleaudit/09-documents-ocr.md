# Module report: documents and OCR

Status: greenfield design report, 20 November 2026. It does not change code.

Scope: file intake, content-addressed storage, source and origin records, PDF and DOCX parsing, OCR, page and line anchors, page quality and marks, duplicate detection, document operations, mail and browser/portal capture, and the case-document import.

## 1. Current owner and data

| Part | Owner | Data |
|---|---|---|
| Content store | `src/lib/matter-store/index.ts` | `blobs/<sha256>`, `source`, `origin` |
| File add | `src/main/matters.ts` (`addFiles`, `addFolder`) | Matter store |
| Ingest queue | `src/main/ingest.ts` | `ingest_job`, `page` |
| PDF and OCR | `src/lib/document-intelligence/` | `page`, `ocr_reading`, `page_quality` |
| Formats | `src/lib/document-intelligence/formats.ts` | PDF, DOCX, TXT, PNG, JPEG |
| Marks | `src/lib/document-intelligence/marks.ts` | `page_mark` |
| Document operations | `src/main/document-ops.ts` | `document_operation`, derived source |
| Mail | `src/main/mail.ts` | EML, PDF attachments |
| Browser capture | `src/main/browser.ts` | Downloads into a matter |
| Portal capture | `src/main/portal.ts` | PDF downloads and receipts |
| Case import | `src/main/case-import.ts` | Public case documents |
| Source UI | `src/renderer/src/Sources.tsx`, `SourcePanels.tsx` | Sources, jobs, pages |

## 2. Current inventory

| Feature | Status | Evidence | Note |
|---|---|---|---|
| Content-addressed blobs | Implemented | `source.sha256`, `blobPath` | One blob per hash |
| Origin and provider | Implemented | `origin` table | Local, OneDrive, Google Drive |
| Integrity check | Implemented | `checkIntegrity`, `openMatter` | Re-hashes every blob |
| Add files | Implemented | `Matters.addFiles` | One result per path |
| Add folder | Implemented | `Matters.addFolder` | Max 1,000, depth 10 |
| PDF text layer | Implemented | `processPdf` | pdfjs |
| OCR | Implemented | `ocrPage` | tesseract.js, English |
| Second reading | Partial | `secondReading` | PP-OCR when installed; dispute when readings differ |
| Page and line anchors | Implemented | `page`, `anchor` | PDF points |
| Page quality | Implemented | `page_quality` | Blur, contrast, text coverage |
| Marks | Implemented | `signature`, `stamp`, `seal`, `handwriting` | Visual marks |
| Document type proposal | Implemented | `classifyDocument` | Candidate |
| Duplicate detection | Implemented | `possibleDuplicates`, `duplicate_pair` | Same text |
| Extract, split, merge, reorder | Implemented | `document-ops.ts` | Derived source |
| Annotate, highlight, redact | Implemented | `page_mark`, `document-ops` | Marks, not always bytes |
| Mail EML | Partial | `mail.ts` | PDF, DOCX, TXT, PNG, JPEG attachments; the file comment says PDF only |
| Browser download | Implemented | `Browser.captureDownload` | URL and page recorded |
| Portal capture | Implemented | `Portal.capture` | PDF only |
| Case document import | Implemented | `case-import.ts` | Public web, no sign-in |
| DOCX | Implemented | `docxParagraphs` | Paragraph text only |
| TXT | Implemented | `textLines` | UTF-8 |
| PNG and JPEG | Implemented | `processImage` | Single page |
| DOC, ODT, XLSX, CSV, PPTX, MSG, HTML, ZIP | Missing | `detectMediaType` refuses | Docs claim more |
| Per-proceeding source role | Missing | No proceeding id | Matter-level |
| Source version history | Partial | Hash and duplicate | No explicit versions |
| Retention and deletion | Missing | Sources marked, never deleted | No retention policy |
| Cross-matter search | Missing | Matter-bound | No path |

## 3. Current flow

```text
File / folder / mail / browser / portal
  → detectMediaType
  → Matters.addFile
      → SHA-256
      → blob if new
      → source + origin + event
  → Ingest.enqueue(matter)
      → processSource
          → PDF: text layer or OCR per page
          → DOCX/TXT: paginate lines
          → PNG/JPEG: OCR one page
      → recordPage
      → notebook extraction
      → document type + duplicates
      → evidence analysis
```

## 4. Problems

### D-01: The format claim is wider than the parser

**Evidence.** `docs/specs/advocate-matters-browser.md` lists DOC, ODT, XLSX, CSV, PPTX, MSG, HTML and ZIP. `formats.ts` accepts PDF, DOCX, TXT, PNG and JPEG. `detectMediaType` refuses the rest.

**Effect.** The advocate adds a file the product says it accepts and gets a refusal. No text means no evidence.

**Document/code mismatch.** `mail.ts` header says "Only PDF attachments become sources", but `ACCEPTED_TYPES` accepts PDF, DOCX, TXT, PNG and JPEG. The report follows the code.

**Target.** A `ParserRegistry` with a declared format, media type, parser, OCR policy and page model. The UI lists only the registered formats. A new format is a parser adapter, not an `if` in `detectMediaType`.

### D-02: The ingest queue is global

**Evidence.** `Ingest` has one `chain` promise for all matters. `enqueue` adds the matter to a pending set, but `drain` runs on the same chain.

**Effect.** One large PDF or a slow OCR job blocks ingestion in every other matter.

**Target.** A per-matter queue with a bounded global concurrency (2 to 4). A matter with a large file does not block another matter. Progress events and queue depth are visible.

### D-03: Reading and evidence extraction are coupled

**Evidence.** `Ingest.drain` calls `extractNotebook`, `afterIngest`, `orderImpact`, `finalOrderNextStep` and the evidence analyzer in one chain. A failure in analysis is caught, but the document read and the legal extraction are one workflow.

**Effect.** A change to evidence extraction changes the ingest path. A document that cannot be analysed is still "read", but the status is mixed.

**Target.** Two stages: `DocumentRead` (pages, anchors, OCR, quality) and `RecordExtraction` (events, facts, parts). The second consumes the first. A failure in extraction does not fail the read; it creates a review item.

### D-04: OCR is English-only and the second engine is optional

**Evidence.** `OCR_ENGINE = "tesseract.js"`, `ocrVersion`, `ocrPage` with `eng`. `secondReading` uses `PPOCR_ENGINE` when `ppocrAvailable()`; otherwise it returns `undefined`. Both are English. Decision 19 says English only.

**Effect.** A Hindi or regional document has no reliable text. A page may have one reading or two, depending on the install. A page with low confidence is not always reviewed.

**Target.** A `TextReader` port with engines. The first release stays English. The second engine is optional but its absence is recorded. A page below a confidence threshold is a review item, not silent text.

### D-05: Redaction is a mark, not a guarantee

**Evidence.** `document-ops` supports `redact`; `page_mark` stores an area. The source blob is unchanged. The UI may show a redacted view, but the bytes remain.

**Effect.** A "redacted" source can still contain the protected text. The filing check reads the source text unless the derived source is used.

**Target.** A redaction creates a new derived source with the bytes removed and a record of the operation. The original stays in the blob store for audit, but the derived source is the only one used for filing. The UI says which one is filed.

### D-06: One source has no proceeding role

**Evidence.** `source` has no proceeding id. `source_role` does not exist. A judgment can be the decision of a writ and the impugned decision of an SLP, but the model cannot express it.

**Target.** A `SourceRole` link per proceeding: initiating pleading, impugned decision, decision of this proceeding, lower record, evidence, correspondence, draft, authority, mention only. One blob, many roles.

### D-07: No retention or deletion policy

**Evidence.** `source_no_delete` trigger; sources are marked missing or changed. No retention setting. Export includes all blobs.

**Effect.** A matter grows without bound. A client asks for deletion and there is no supported path.

**Target.** A retention policy per matter: keep, archive, purge derived text, purge blobs. A purge is an audited event and leaves a tombstone. The original is not deleted without an explicit advocate action.

## 5. Greenfield target

### 5.1 Entities

| Entity | Meaning |
|---|---|
| `Document` | The content-addressed blob and its hash |
| `Source` | One file in one matter, with metadata |
| `Origin` | Where the file came from |
| `Page` | Page text, kind, size |
| `Anchor` | Page/line box and text |
| `OcrReading` | Engine, version, confidence, text |
| `PageQuality` | Blur, contrast, coverage |
| `PageMark` | Signature, stamp, seal, handwriting |
| `SourceRole` | The role in a proceeding |
| `DocumentOperation` | Extract, split, merge, reorder, annotate, redact |
| `ParseJob` | Queued, running, done, failed |
| `Capture` | Browser, portal, mail, receipt |

### 5.2 Services

| Service | Owns | Consumes |
|---|---|---|
| `DocumentService` | Blobs, sources, origins, pages, anchors, operations | Blob store, parser registry |
| `IngestService` | Queue, parse jobs, OCR | `DocumentService`, `ParserRegistry` |
| `CaptureService` | Browser, portal, mail, case import | `DocumentService` |
| `SourceRoleService` | Source-to-proceeding roles | `ProceedingService` |
| `ParserRegistry` | Format, parser, OCR policy | Parsers |

### 5.3 Contracts

```ts
interface DocumentService {
  add(matterId: string, paths: string[], ctx: WriteContext): Promise<AddFileResult[]>;
  addFolder(matterId: string, folder: string, ctx: WriteContext): Promise<AddFileResult[]>;
  capture(matterId: string, input: CaptureInput): Promise<SourceRecord>;
  operate(matterId: string, input: DocumentOperationInput): Promise<DocumentOperationResult>;
  read(matterId: string, sourceId: string): Promise<SourceRecord>;
  pages(matterId: string, sourceId: string): Promise<PageRecord[]>;
  anchors(matterId: string, query: string, limit?: number): Promise<AnchorRecord[]>;
  checkIntegrity(matterId: string): Promise<SourceRecord[]>;
}

interface IngestService {
  enqueue(matterId: string): Promise<void>;
  status(matterId: string): Promise<IngestJob[]>;
  retry(matterId: string, sourceId: string): Promise<void>;
}
```

### 5.4 The parser rule

A parser declares:

- media types and extensions;
- whether it needs OCR;
- the page model (PDF pages, DOCX blocks, image page);
- the text and box extraction;
- the confidence and quality;
- the failure modes.

`detectMediaType` becomes a registry lookup. The UI shows the accepted formats from the registry. A new format is a parser adapter and a test fixture.

### 5.5 The redaction rule

A redaction is an operation that creates a derived source. The derived source has:

- a new SHA-256;
- the removed areas applied to the bytes or the text;
- a link to the original;
- an audit event with the areas and the reason;
- a flag that it is the filing copy.

The original is retained. The filing service uses the derived source. A mark on the original is not a redaction.

## 6. Boundaries

- `DocumentService` owns bytes, pages and anchors. It does not own events, facts or drafts.
- `IngestService` owns the queue and the parse. It does not own evidence extraction.
- `CaptureService` owns the external source. It does not own the matter.
- `ParserRegistry` owns formats. It does not own OCR policy for a matter.
- `EvidenceService` owns events and facts. It reads pages and anchors.

## 7. Migration

1. Add `ParserRegistry`; keep the current five parsers.
2. Split `Ingest` into `DocumentRead` and `RecordExtraction`.
3. Add a per-matter queue with global concurrency.
4. Add `SourceRole` and `proceedingId`.
5. Make redaction create a derived source.
6. Add retention settings and an audited purge.
7. Add a format only when a real brief needs it.

## 8. Acceptance tests

| ID | Test | Pass |
|---|---|---|
| DM-01 | Add the same file twice | One blob; one source or a duplicate result |
| DM-02 | Add a PDF with a text layer | Pages and anchors; no OCR |
| DM-03 | Add a scan | OCR; confidence; a review item if low |
| DM-04 | Add a DOCX | Paragraphs and pages |
| DM-05 | Add an unsupported format | Refused with the supported list |
| DM-06 | One large file in matter A, a small file in B | B does not wait for A |
| DM-07 | Redact a page | Derived source; original kept; filing uses the derived |
| DM-08 | Link one judgment to two proceedings | One blob, two roles |
| DM-09 | Delete a matter under retention | Purge is audited and reversible until confirmed |
| DM-10 | Integrity check after a blob change | Source marked changed |

## 9. Recommendation

**Keep the content store, anchors and OCR; add a parser registry, per-matter queues, source roles and true redaction.** The document layer is the strongest part of the product. Its risks are format claims, global serialization and a redaction that is a mark rather than a new source.

## Appendix: evidence map

- `src/lib/matter-store/index.ts` — source, origin, page, anchor, job.
- `src/main/ingest.ts` — queue.
- `src/lib/document-intelligence/` — formats, PDF, OCR, quality, marks, classify, duplicates.
- `src/main/document-ops.ts` — operations.
- `src/main/mail.ts`, `src/main/browser.ts`, `src/main/portal.ts`, `src/main/case-import.ts` — capture.
- `src/renderer/src/Sources.tsx`, `SourcePanels.tsx` — source UI.

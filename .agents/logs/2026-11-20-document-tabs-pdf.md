# Documents in their own tab, and a PDF view that scrolls

Date: 2026-11-20. Owner report: a PDF opened in the Matter pane with no way to close it, and the mouse wheel did not scroll it.

## What changed

- The Matter tab always stays. A source or a draft opens in its own tab beside it, with a close button. Closing the document tab returns to the Matter tab and its Notebook. `RightPane` takes a `document` prop; `App` passes the open source or draft; the document tab is `document-tab` and its content is `document-content`.
- A source PDF no longer opens in the Euro-Office editor. `PdfSourceView` shows page images in a normal scroll container: the mouse wheel scrolls, pages load as they come near the viewport, and the zoom buttons change the render scale. The page text panel remains below when OCR or a source link needs it.
- The bridge function `sourcePageImage` renders one PDF page with `renderPagePng` and returns a PNG data URL. The handler reads the blob through `MatterStore.readBlob`, checks its hash, and passes a `Uint8Array` to pdf.js.
- The Euro-Office editor remains for drafts. Non-PDF sources keep their text view.

## Files

- `src/renderer/src/RightPane.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/Sources.tsx`, `src/renderer/src/app.css`
- `src/main/index.ts`, `src/shared/api.ts`, `src/preload/index.ts`
- `tests/e2e/step2.spec.ts` (PDF page image, wheel scroll, close tab), `tests/e2e/step4.spec.ts` (the draft in the document tab), `tests/e2e/dist.spec.ts`, `tests/e2e/app.spec.ts`
- `docs/specs/advocate-matters-browser.md` section 2.5

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 420 tests: 417 passed, 0 failed, 3 skipped |
| `npm run build` | exit 0; three bundles |
| `npm run dist` | exit 0; `release/win-unpacked` |
| `npx playwright test` | 51 tests: 49 passed, 2 skipped (live model), 0 failed; 1.7 min |
| `npx playwright test tests/e2e/dist.spec.ts --workers=1` | 1 passed |

The PDF test scrolls the `pdf-scroll` container with `page.mouse.wheel` and checks that its `scrollTop` moved. It clicks the document tab's close button and checks that the document tab is gone and the Matter view is back.

## Known limits

- One document tab at a time. Opening another source or draft replaces its content.
- Page images stay in memory once loaded. A very large PDF would benefit from eviction; the viewer loads only pages near the viewport.
- The Word editor remains for drafts; its own scroll behaviour is unchanged.

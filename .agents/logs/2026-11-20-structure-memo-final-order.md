# Structure, a lint gate, memoranda as DOCX, and the next step after a judgment

Date: 2026-11-20. Owner request: fix the large-module/no-linter and V-name findings, make research memoranda produce DOCX files, and make a judgment or final order lead to an explicit next step.

## Why the IPC handlers were in `index.ts`

They were not there for a technical reason. `index.ts` began as the only main-process file, and every new bridge function was added beside the module it used because that was the shortest edit. The handlers grew to 301 and the file to 2,204 lines. They now live in `src/main/bridge.ts`; `index.ts` keeps start-up, the stores, the agent host and the test hooks, and calls `registerBridge(handle, deps)`.

## Structure

- `src/main/bridge.ts` holds every `handle(...)` call. `index.ts` fell from 2,204 to 1,102 lines and holds no handlers. `bridge.ts` is 1,314 lines; it is one domain module now and can be split by area when it grows.
- `src/main/agent-format.ts` holds the pure text and cost helpers (`findSource`, page/event/draft formats, tool target, cost CSV and report). `agent.ts` imports and re-exports them. It fell from 3,416 to 3,270 lines; the tool definitions remain one closure over the session, which is the next split.
- The live `V1` to `V5` files are renamed by domain:
  - `V1.tsx` → `MatterAdminViews.tsx`
  - `V2.tsx` → `SourcePanels.tsx`
  - `V3.tsx` → `WorkspaceViews.tsx`
  - `V5.tsx` → `AuditPanels.tsx`
  - `DraftsV5.tsx` → `DraftTools.tsx`
  - `StudioV5.tsx` → `StudioPanels.tsx`
  Their headers no longer cite an archived spec.
- `npm run lint` is `oxlint src tests`. `typescript-eslint` cannot be used: its peer range stops below TypeScript 6.1, and this project uses TypeScript 7.0.2. Oxlint is TypeScript-aware and needs no peer. `.oxlintrc.json` sets the rules. The CI workflow runs `npm run lint`.
- `npm run test:unit` now uses `--test-concurrency=1`. The parallel Windows run intermittently hung in `agent.test.ts`; the serial run is deterministic and takes about one minute.

## Memoranda as DOCX

- `memoDocument(title, body, generatedAt)` in `src/lib/drafting/structured.ts` turns the composed memorandum into a DOCX: its markdown headings and paragraphs, with the title.
- `Matters.ensureMemoDocx(matterId, memoId)` writes `<matter>/memos/<memo-id>.docx` on first use. An older memorandum gets its DOCX when it is first opened.
- `writeResearchMemo` writes the DOCX before it returns; `write_research_memo` tells the model the path.
- The Research view has **Open DOCX** for each memorandum; the bridge function is `openMemoDocx`.
- Tests: `memoDocument` in `tests/unit/drafting.test.ts`; `tests/e2e/steps6to10.spec.ts` checks that the path in the tool result exists.

## A judgment is the start of the next step

- `finalOrderNextStep` in `src/main/practice.ts` runs after each ingest. For a source whose type is `judgment` or `order`, it opens one `final_order` review item. The item names the court, the date, whether the text reads as a final disposal, and the next forum in the court directory. It states the choice: appeal or special leave petition, review or revision, or no action, and says to compute limitation from the order and the certified copy.
- A High Court matter therefore names the Supreme Court as the next forum; a district matter names the High Court.
- The item is not a reading defect and does not block Notebook readiness.
- The agent tool `list_review_items` reads the open items, including `final_order`. The system prompt tells the agent to answer what next from that item.
- Tests: `tests/unit/final-order.test.ts` (a Delhi High Court judgment opens the item with the Supreme Court route); `tests/e2e/step3.spec.ts` (the final-order item does not block Notebook readiness).

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0; warnings only (mostly exhaustive-deps and unused parameters) |
| `npm run test:unit` | 422 tests: 419 passed, 0 failed, 3 skipped; 58 s serial |
| `npm run build` | exit 0; three bundles |
| `npx playwright test` | 51 tests: 49 passed, 2 skipped (live model), 0 failed; 1.7 min |

## Known limits

- `agent.ts` still holds the tool definitions in one closure. The pure formats are out; the tool groups are the next mechanical split.
- `bridge.ts` is one file of 1,314 lines. It can be split by domain without changing the bridge surface.
- Oxlint reports warnings; they are not errors. The main groups are extra or missing effect dependencies, which are deliberate in several views.
- The final-order analysis reads the first three pages and the matter's court. If the court field is empty, it says the route is for the advocate to decide rather than guessing.

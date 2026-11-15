# Phase 3: advocate, matters and the browser

Session of 2026-11-16. Owner's instruction: "Implement Phase 3. browser should be on the RIGHT with tabs available and bookmarks and new tabs. read how opencode has done." Spec: [docs/specs/advocate-matters-browser.md](../../docs/specs/advocate-matters-browser.md).

The reference was OpenCode's desktop browser plugin, read from a shallow clone of `anomalyco/opencode` in the temporary folder (`packages/gui-plugins/src/browser/`). Its layout was used as a design reference: one right pane, a tab strip above the page, a new-tab page, a tab per page and an address bar. OpenCode is not a dependency. The application uses Electron's own `WebContentsView`, the Chrome DevTools Protocol in-process, and Pi for the agent, as decisions 1, 2 and 6 say.

## What was built

| Feature | Code |
|---|---|
| S10 | `src/main/browser.ts`, `src/lib/browser/`, `src/renderer/src/RightPane.tsx`; `WebContentsView` tabs in the right pane, the Matter tab, new tabs, bookmarks, recent pages, `persist:oa-browser`, hidden agent pages in temporary partitions, handover, downloads into the matter, `browser_*` tools over `webContents.debugger` |
| A9 | "Import case list" in the browser; `Browser.proposeCaseList`; `browser:createMatters`; each matter gets its CNR, court, petitioner, respondent, stage and next date as a hearing |
| A1 to A5 | `src/renderer/src/Onboarding.tsx`; five skippable steps; the enrolment number encrypted with `safeStorage` |
| A6 | `src/renderer/src/Profile.tsx`: the court map, practice map, sources plan, statutory map, skills and library, each corrected by the advocate |
| M1 | `src/lib/advocate-store/` `library_item`; `src/lib/library/`; `src/main/library.ts`; `src/renderer/src/Library.tsx`; blobs in `<userData>/library/blobs/<sha256>` |
| C1 | `matter_profile` in `matter.db`; `MatterProfileForm`; court, bench, practice area, case type, proceeding, side, case number, CNR, dates, stage and relief |
| C2 | `IntakeDialog` from a folder, a CNR and an email; `propose_matter` in the chat, created or dismissed from Home |
| C3 | `src/lib/classification/`; the proposal and its basis; the advocate applies it |
| C4 | `src/lib/stages/`; a stage list per proceeding |
| C5 | `MatterOverview` |
| C6 | `related_matter`; `RelatedMatters`; incoming and outgoing edges |
| C8 | `counsel` on each party |
| C10 | `matter:extend`; a new linked matter with the parties copied |
| H1, W4 | The existing ingest pipeline; intake from a folder and a drop |
| R2 | `src/renderer/src/Dashboard.tsx` on Home |
| V1, V4 | The existing mail import and questions document |

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` (final) | exit 0 |
| `node --test tests/unit/browser.test.ts` | 7 passed, 0 failed |
| `node --test tests/unit/library.test.ts` | 2 passed, 0 failed |
| `node --test tests/unit/matter-profile.test.ts` | 4 passed, 0 failed |
| `npm run test:unit` (final) | 208 tests: 205 passed, 0 failed, 3 skipped; exit 0 |
| `npm run build` | "built in" three times |
| `npx playwright test tests/e2e/phase3.spec.ts` | 8 passed, 0 failed |
| `npx playwright test` (final, on the final build) | 57 tests: 55 passed, 2 skipped (the live-model tests), 0 failed; 4.4 min; exit 0 |

Evidence: `test-results/phase3-*.png` are not written by this spec; the browser and the views were checked by the end-to-end tests and the trace files. The tests serve their own local pages; no court site was reached.

## Mismatches between documents and code, reported

- [docs/harness-build.md](../../docs/harness-build.md) section 3.1 said the court portal window becomes a tab profile of the built-in browser. It has not: the portal window stays separate with its filing guards until phase 13. The section now says so.
- [docs/repo-map.md](../../docs/repo-map.md) listed `src/main/browser/` as planned. The browser is `src/main/browser.ts` with `src/lib/browser/`; the map is corrected.
- [docs/features.md](../../docs/features.md) S10 says "the court portal window moves onto it". The same difference is recorded in the spec.

## Not built, and said on screen or in the spec

- The court portal is not a tab of the browser (phase 13).
- The case-status adapter is not a Playwright script (phase 9). The browser opens the page and the agent reads it.
- The Practice Profile does not show the territorial map or the local intelligence plan.
- The browser has no favicon; it uses a globe and an agent marker.
- H1's accepted formats are the existing ingest formats (PDF, DOCX, plain text, PNG, JPEG and EML). DOC, ODT, XLSX, CSV, PPTX, MSG, HTML and ZIP bundles are not read yet.
- New judgments and court updates on Home say they come with monitoring in phase 9.
- The owner's exit (lesson L3): onboarding on a real practice, the case list from a real portal, and one matter from each of a folder, a CNR, an email and the chat.

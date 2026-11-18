# Research navigation: the matter's Studio and the no-matter Research page

Date: 2026-11-19. Owner instruction: the Research tab opens the Studio when a matter is loaded; with no matter it shows the Research page; no matter may be selected.

## What changed

- `src/renderer/src/App.tsx`: the nav Research action opens the open matter's `research` tab (the Studio) and returns the right pane to the work view. With no matter, it shows the Research page. `matterTab` is passed to the nav.
- `src/renderer/src/AppNav.tsx`: Research is selected when it is the open matter's tab, as well as on the no-matter page.
- `src/renderer/src/ResearchPage.tsx` (new): the no-matter page. It lists matters with a button to their Studio, reuses the shared law-library search, and shows research history across matters from the existing per-matter logs. Matter facts are not read.
- `src/renderer/src/Studio.tsx`: `LawPart` is exported and takes `matterId=""` for the shared library. It hides plans, the matter save buttons, and the matter scope when no matter is open.
- `src/renderer/src/RightPane.tsx`: the pane handle exposes `showWork`, so the Research action leaves a browser tab for the matter's work view.
- `tests/e2e/phase1.spec.ts`: the old phase-5 placeholder assertion is replaced. The navigation test now checks both states: a matter's Studio, then the no-matter Research page.

The in-matter tab keeps its label, Studio. The nav item Research opens it.

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 414 tests: 411 passed, 0 failed, 3 skipped |
| `npm run build` | main, preload and renderer built |
| `npx playwright test tests/e2e/phase1.spec.ts` | 2 tests passed |

The playwright run covers `research-page`, the absence of `not-built`, a shared law-library search with its `law-coverage` line, the matter's `studio` with the Studio tab `aria-selected`, `research-matters` naming the open matter after Home returns to no matter, and the page's Open research studio button loading that matter's Studio.

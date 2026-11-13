# Window layout, model default, and the start of step 5

Date: 2026-11-14. Repository: `C:\dev\openadvo`. Nothing pushed.

## Owner instructions in this session

1. New window layout: side navigation that hides, chat landing page, chat docked left, the view on the right, no pane right of the view, the editor ribbon up to the top. Recorded as decisions.md choice 20.
2. Default model `opencode-go/deepseek-v4.1-flash`; show the reasoning effort. Recorded in decisions.md choice 17.
3. No File, Edit, View, Window menu; one title bar like the Claude desktop app.
4. The chat dock must not hide its controls when it is narrow.
5. Do not test the agent's reply on a stub PDF.
6. Assess CopilotKit and AG-UI. Recorded in parking.md.
7. Continue the build: step 5 started.

## Commands and results

| Command | Result |
|---|---|
| `npm install --save-exact @heroicons/react@2.2.0` | added; 0 vulnerabilities reported |
| `npm run typecheck` | no error |
| `npm run test:unit` | 36 tests, 36 pass |
| `npm run build` | built |
| `npx playwright test` | 7 passed, 2 skipped (the two live-model tests) |
| Live probe, default model (before instruction 5) | the agent called `list_sources` and answered in the chat dock |
| Live probe, `opencode-go/kimi-k3` | notice "The model call failed: 403 ... Model access is disabled" (before the fix: no reply and no notice) |
| Dock at its 300 px minimum | 0 elements overflow the dock; the model and effort controls wrap |
| `Menu.getApplicationMenu() === null` in the running app | true |

## Findings

- A failed model call ended the turn with no message. `src/main/agent.ts` now shows the provider's reason as a notice.
- The Astryx composer does not register Playwright `fill`; the live test now types with the keyboard.
- Astryx keeps a second copy of some nodes for about 300 ms while the side navigation folds. Tests wait for the fold.

## Not done, not verified

- The draft checks were not run on the real Shankar Teli brief. Only unit tests and the fixture e2e ran.
- The title bar was checked on Windows only.
- The two live-model e2e tests were not rerun after the title bar change.
- Step 5 parts not built: see `docs/specs/v0-verification.md`.

# Step 5, second part: agent changes as tracked changes, with an AG-UI interrupt

Date: 2026-11-14. Spec: docs/specs/v0-verification.md rules 9 to 15.

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | no errors |
| `npm run test:unit` | 44 of 44 pass |
| `npm run build` then `npx playwright test` | 8 pass, 2 skipped (live-model tests) |
| `npx playwright test tests/e2e/step5.spec.ts tests/e2e/step4.spec.ts` (after the harness-bar count) | 2 pass |
| `node .agents/logs/2026-11-14-step5-agent-changes/live-interrupt.ts` | default model `opencode-go/deepseek-v4.1-flash`; 110 events, 0 invalid against `EventSchemas`; tools used ended with `propose_correction`; last event `RUN_FINISHED` with outcome `interrupt`. Output: `live-interrupt.out.txt` |
| Migration check (scratch script) | revision table before: no `'agent'`; after open: `'agent'` allowed; triggers `revision_no_update`, `revision_no_delete` present |

## Observations

- In a first live run the stub matter had no source. The agent refused to propose and said why. That is the behaviour the system prompt asks for.
- In the live run the model's reason called a born-digital page "OCR". The tool output labels it "text layer". The reason text is the model's; the advocate sees it.
- The live check uses a stub host, not a real matter. The owner has not yet used the card on a real brief.

## Third part: review items and the gate

| Command | Result |
|---|---|
| `npm run typecheck` | no errors |
| `npm run test:unit` | 46 of 46 pass (migration test extended for `review_item.draft_id`) |
| `npm run build` then `npx playwright test` | 8 pass, 2 skipped (live-model tests) |

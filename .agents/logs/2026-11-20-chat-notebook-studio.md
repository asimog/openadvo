# Chat controls, sessions, the Studio conference, and the Notebook

Date: 2026-11-20. Owner request: add the Stop button, show reasoning and tool detail, add a right-click menu, allow many conversations in a matter, make the Jobs pane useful, make the Studio an agent conversation, fetch case documents by case number, explain review and chronology errors, and let the advocate read skills and packs.

## What changed

### Chat

- Stop is in the chat header at all times; it is disabled when nothing runs. The Firm chat has the same button.
- The model's reasoning streams into a folded `Reasoning` block. Each tool call stores its arguments and a bounded result; the chat shows them in a folded `What the agent did` list under the call group.
- The right-click menu offers cut, copy, paste, select all and **Add to context**. Add to context inserts the selection into the chat composer; it sends nothing.
- The bridge functions are `onAddToContext`, `notebookStatus`, `rebuildNotebook`, `listConversations`, `switchConversation`, `renameConversation`, `readSkill` and `readPack`.

### Conversations

- A matter has many conversations. `chat/conversations.json` lists them; each has a messages file in `chat/conversations/` and its own Pi session file.
- The chat header has a Sessions menu; the Jobs tab lists the conversations and opens one. Older messages load and the older Pi session continues.
- The old single-chat data migrates into the first conversation. A new conversation with no session never continues another conversation's session.

### Studio

- The Conference tab opens with **Agent conference**: quick prompts and a composer that send the request to the matter's one agent. The panels below are its working record.

### Notebook and case number

- `import_case_documents` takes a case number (and court/year, or known URLs), finds judgment or order PDFs on the public web with official court hosts first, downloads them, queues the reader, and rebuilds the Notebook. If no public PDF is found it returns the court page for the browser and the advocate's sign-in.
- `rebuild_notebook` re-runs the fixed rules over every read source, adds missing events, and never deletes or confirms an event.
- The Notebook shows a diagnosis per source: type, pages, lines, events, extraction time and why it has no event. The readiness line says "No source yet" when the matter has none.
- The rebuild refreshes an unconfirmed document type. Client questionnaires, chronologies and statements are now proposed as `questionnaire`, `chronology` and `client_statement`, ahead of `notice`.
- ISO dates (`2024-03-12`) are read. A month-to-month span (`Jun 2023-Oct 2023`, `Nov/Dec 2023 - Jan 2025`) is one range, not two events.
- Review items and date conflicts explain what the item means and the options. Each explanation has **Ask the agent to explain this**, which sends the item to the chat and does not decide it. Chronology and Factual Matrix rows explain conflicts, inferred dates and OCR readings in the same way.

### Skills and packs

- The Workflows & Skills page opens a skill or a pack on click and shows its full file. The `readSkill` and `readPack` bridge functions validate the registry.

## Real matter check

The owner's `Praveen v Yulia` matter has two DOCX sources and 32 Notebook events (14 from the chronology, 18 from the questionnaire). The questionnaire was proposed as a notice. On a **copy** of the matter, the new rebuild changed the proposals to `chronology` and `questionnaire`; it added no event because the existing candidate events are kept. The copy was at `%TEMP%\opencode\praveen-copy`. The owner's matter was not changed.

The range change applies to new extraction. A rebuild does not rewrite an existing candidate event, because it never deletes or replaces an event without the advocate's decision. To apply the new range rule to an old source, add the document again, or correct the two events in the Notebook.

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 420 tests: 417 passed, 0 failed, 3 skipped |
| `npm run build` | exit 0; three "built in" lines |
| `npx playwright test` | 51 tests: 49 passed, 2 skipped (live-model), 0 failed; 1.7 min |
| Copy rebuild of `Praveen v Yulia` | 2 sources, 32 events; proposals corrected to `chronology` and `questionnaire`; 0 new events |

## Evidence

- `test-results/phase1-*` and the full Playwright run.
- The copy rebuild output above; the owner's matter was read only.

## Known limits

- `import_case_documents` reads public pages and PDFs. A portal that needs a sign-in returns its page; the advocate signs in through the browser.
- The Sessions menu has new, open and the conversation title; rename is a bridge function but has no menu field yet.
- The right-click menu is native Electron; the screenshot tests do not click it.
- A rebuild adds and never deletes. The range merge therefore applies to a new extraction, not to an old candidate event.

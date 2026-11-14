# Parking

**Rule L6.** New ideas restarted the plan. An idea outside the current step goes here, not into the plan, a spec or the code. A parked idea enters the plan only when the owner moves it into a step in [build-plan.md](build-plan.md).

Each line: the idea, where it came from, and the step it would touch.

| Idea | Source | Step it would touch |
|---|---|---|
| An inspector that opens any record and shows its raw form, the events that touched it, and its links in both directions. | Earlier principle P9 and the Macro reference (`openadvodeprecated/docs/decisions.md` section 13) | Any, after round 1 |
| A review inbox split into Signal and Noise, keyboard operable. **Built in v3 (V3-2) as "Blocks the work" and "Other".** | Earlier idea M-03 | 3 or later |
| A command bar that searches commands, matters and records. **Built in v3 (V3-3).** | Earlier idea M-04 | After round 1 |
| Saved pane layouts per matter, and navigation history. | Earlier idea M-02 | After round 1 |
| Matter memory as a markdown file the advocate can read and edit. **Moved into v1 (V1-3) by the owner's instruction, 2026-11-14.** | Earlier idea M-13 | 6 |
| Pi session persistence to a file in the matter folder, so the chat history survives a restart. **Built in v1 (V1-1).** | Step 1 build | 1, second version |
| A matter rename and archive. **Built in v1 (V1-10).** | Step 1 build | 1, second version |
| Render the agent's markdown in the chat pane (the proof run shows raw `**bold**`). **Built in v1 (V1-2).** | Step 1 proof run | 1, second version |
| Run ingestion in a worker thread, so a very large bundle never slows the window. Step 2 runs it in the main process (109 real pages took about 2.6 seconds). | Step 2 build | 2, second version |
| Answer the editor's `/downloadfile/<key>` request (it asks a document server for the file; today it gets 404 and opens the file through the desktop route anyway). | Step 2 build | 2, second version |
| Scroll the PDF editor to a line anchor and mark it. | Step 2 spec | 2, second version |
| Drop running page headers and footers before joining lines into an event (the proof run joined a footer of spaced-out letters into an event, and the manupatra footer "05-06-2020 (Page N of M)" became the event 05.06.2020 in the List of Dates). | Step 3 and round 1 proof runs | 3, second version |
| Do not compare document metadata lines when the Notebook looks for the same act across sources (round 1 proof: the "Decided On:" lines of two different judgments became a false date conflict). | Round 1 proof run | 3, second version |
| Do not accept a time range as a date ("4-4.30" was extracted as a date candidate; the proof operator rejected it by hand). | Round 1 proof run | 3, second version |
| Show the Notebook's reading kind more plainly to the agent (it called text-layer text "OCR" twice). | Step 2 and 3 proof runs | 3, second version |
| Relative dates against the document's header date ("the next day"). **Built in v2 (V2-4).** | Step 3 spec | 3, second version |
| Insert a Notebook sentence at the cursor. Step 4 v0 adds it at the end of the draft, because the build has no public paragraph-insert API that keeps an anchor. | Step 4 proof task | 4, second version or 5 |
| Hide the Draw and View ribbon tabs when a configuration key for them is found. Item d names only File, Plugins and Protect; those are hidden. | Step 4 build | 4, second version |
| Show the editor's own status bar in step 5 (it says "All changes saved" after our save; the harness bar is the authority). | Step 4 build | 4, second version |
| Compare a generated List of Dates against the owner's real SLP drafts and improve the sentence shape (still deterministic, no model text). | Step 4 proof task | After round 1 |
| Quitting the application while a draft editor frame is open hung under Playwright. Check the window close path with a draft open and fix it. | Step 4 test run | 4, second version |
| Clean the event description before generated prose: the step 3 extractor keeps list numbering ("2. In brief …") and repeated date phrases ("on the date of the incident, i.e. 18.3.1988"), and the List of Dates and Synopsis show them. The step 3 extractor owns the text. | Step 4 proof run on real documents | 3, second version |
| Help the advocate select and order the generated List of Dates rows. v0 converts every confirmed dated line: round 1 proof produced 89 rows against the brief's 5 curated rows, and all 5 real dates were among the 89. **Built in v2 (V2-5).** | Round 1 proof run | 4, second version |
| CopilotKit as a chat and approval UI kit over AG-UI. Not taken on 2026-11-14: it would be a second component library beside Astryx (choice 11) and it expects an HTTP runtime. AG-UI itself is adopted (choice 21). | Owner, 2026-11-14 | 6 |
| A model curator that proposes memory updates after a quiet chat (Mike's scoped memory). v1 memory is written by the advocate only. **Built in v2 (V2-8) as agent proposals the advocate decides.** | Mike analysis, 2026-11-14 | V1-3, second version |
| Playbooks: rules compiled from the advocate's own drafting guides, to review a petition against them (Mike playbooks). | Mike analysis, 2026-11-14 | 5 or 6, second version |
| Sign the filing manifest with an Ed25519 key kept in `safeStorage` (Mike signs its exports). **Built in v2 (V2-7).** | Mike analysis, 2026-11-14 | V1-8, second version |
| An interim-relief section and prayer in the petition, and an application for condonation of delay when limitation has run. **Built in v2 (V2-6).** | V1-7 build | V1-7, second version |
| Code-sign the Windows build, make installers (NSIS, DMG, AppImage), and update automatically. Needs the owner's certificates and a machine per operating system. | V3-7 build, 2026-11-14 | V3-7, second version |
| Pack the application code in an ASAR archive with the executables unpacked (the build now ships without ASAR, so the converter and the validator run from plain folders). | V3-7 build, 2026-11-14 | V3-7, second version |
| An inspector that opens any record with the events that touched it (the earlier idea P9 above is still open). | V3 spec | After round 6 |
| Point-in-time versions of statutes: the version in force on the governing date (IPC to BNS and the other 2024 transitions). India Code gives the current text only. | v4 spec | V4-1, second version |
| Treatment edges between judgments (followed, distinguished, overruled, referred to a larger bench), from the judgments' text. | C1 section 5; v4 spec | V4-2, second version |
| Full-text search of the judgments themselves. The AWS metadata has no text; the whole Supreme Court set is about 69 GB of PDFs. A text index of the fetched judgments only is possible now. | V4 build | V4-1, second version |
| Indian Kanoon as a third resolver tier, with the advocate's own API key. | C1 section 5 | V4-1, second version |
| A second, different model family for the critic and opposing counsel (C1 3.11: heterogeneous adversarial roles). The loop now uses the chat's model for every role. | C1 section 3.11 | V4-3, second version |

# Parking

**Rule L6.** New ideas restarted the plan. An idea outside the current step goes here, not into the plan, a spec or the code. A parked idea enters the plan only when the owner moves it into a phase in [build-plan.md](build-plan.md).

The earlier list is in [archive/2026-11-15/parking.md](archive/2026-11-15/parking.md). Most of its large ideas are now features in [features.md](features.md): statute versions (D3), treatment edges from the text (E5), Indian Kanoon with the advocate's key (E10), a second model family for the critic (Q5), playbooks (M3), and full-text search of judgments (G5, G7). The open small items below carry over.

Each row: the item, where it came from, and the feature it would touch.

| Item | Source | Feature |
|---|---|---|
| Run ingestion in a worker thread, so a very large bundle never slows the window. | Step 2 build | H1, H13 |
| Answer the editor's `/downloadfile/<key>` request (today it gets 404, and the file opens through the desktop route anyway). | Step 2 build | L4 |
| Scroll the PDF editor to a line anchor and mark it. | Step 2 spec | H3 |
| Drop running page headers and footers before joining lines into an event (a footer became an event in a List of Dates). | Round 1 proof | H3, H12 |
| Do not compare document metadata lines ("Decided On:") when looking for the same act across sources (a false date conflict). | Round 1 proof | H12 |
| Do not accept a time range ("4-4.30") as a date. | Round 1 proof | H9 |
| Show the reading kind (text layer or OCR) plainly to the agent. | Step 2 and 3 proofs | H3 |
| Insert a Notebook sentence at the cursor, not at the end of the draft. | Step 4 proof | L2 |
| Hide the Draw and View ribbon tabs when a configuration key for them is found. | Step 4 build | L4 |
| Quitting while a draft editor frame is open hung under Playwright. Check the close path. | Step 4 test run | L4 |
| Clean event descriptions before generated prose (list numbering and repeated date phrases show in the List of Dates). | Step 4 proof | L2, H12 |
| Code-sign the Windows build, make installers, and update automatically. Needs the owner's certificates. | V3-7 build | — |
| Pack the application code in an ASAR archive with the executables unpacked. | V3-7 build | — |
| Saved pane layouts per matter, and navigation history. | Earlier idea M-02 | Q7 |

# Parking

**Rule L6.** New ideas restarted the plan. An idea outside the current step goes here, not into the plan, a spec or the code. A parked idea enters the plan only when the owner moves it into a phase in [build-plan.md](build-plan.md).

Small open items, each with the feature it would touch.

| Item | Feature |
|---|---|
| Run ingestion in a worker thread, so a very large bundle never slows the window. | H1, H11 |
| Answer the editor's `/downloadfile/<key>` request (today it gets 404, and the file opens through the desktop route anyway). | L4 |
| Scroll the PDF editor to a line anchor and mark it. | H3 |
| Drop running page headers and footers before joining lines into an event (a footer became an event in a List of Dates). | H3, H10 |
| Do not compare document metadata lines ("Decided On:") when looking for the same act across sources (a false date conflict). | H10 |
| Do not accept a time range ("4-4.30") as a date. | H8 |
| Show the reading kind (text layer or OCR) plainly to the agent. | H3 |
| Insert a Notebook sentence at the cursor, not at the end of the draft. | L2 |
| Hide the Draw and View ribbon tabs when a configuration key for them is found. | L4 |
| Quitting while a draft editor frame is open hung under Playwright. Check the close path. | L4 |
| Clean event descriptions before generated prose (list numbering and repeated date phrases show in the List of Dates). | L2, H10 |
| Code-sign the Windows build, make installers, and update automatically. Needs the owner's certificates. | — |
| Pack the application code in an ASAR archive with the executables unpacked. | — |
| An `openadvo` command for runs without the window (scheduled court checks, scripts), built on the same SDK harness code, not on a fork of Pi. | O3, S3 |
| Sign in to a model provider inside the window (`ModelRuntime.login`), so an advocate does not need Pi's own program. | Y4 |
| Saved pane layouts per matter, and navigation history. | Q5 |

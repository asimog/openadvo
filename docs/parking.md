# Parking

**Rule L6.** New ideas restarted the plan. An idea outside the current step goes here, not into the plan, a spec or the code. A parked idea enters the plan only when the owner moves it into a step in [build-plan.md](build-plan.md).

Each line: the idea, where it came from, and the step it would touch.

| Idea | Source | Step it would touch |
|---|---|---|
| An inspector that opens any record and shows its raw form, the events that touched it, and its links in both directions. | Earlier principle P9 and the Macro reference (`openadvodeprecated/docs/decisions.md` section 13) | Any, after round 1 |
| A review inbox split into Signal and Noise, keyboard operable. | Earlier idea M-03 | 3 or later |
| A command bar that searches commands, matters and records. | Earlier idea M-04 | After round 1 |
| Saved pane layouts per matter, and navigation history. | Earlier idea M-02 | After round 1 |
| Matter memory as a markdown file the advocate can read and edit. | Earlier idea M-13 | 6 |
| Pi session persistence to a file in the matter folder, so the chat history survives a restart. Step 1 keeps the chat in memory for one run. | Step 1 build | 1, second version |
| A matter rename and archive. | Step 1 build | 1, second version |
| Render the agent's markdown in the chat pane (the proof run shows raw `**bold**`). | Step 1 proof run | 1, second version |
| Replace Electron's default menu (File, Edit, View, Window) with our own. | Step 1 proof run | 1, second version |
| Run ingestion in a worker thread, so a very large bundle never slows the window. Step 2 runs it in the main process (109 real pages took about 2.6 seconds). | Step 2 build | 2, second version |
| Answer the editor's `/downloadfile/<key>` request (it asks a document server for the file; today it gets 404 and opens the file through the desktop route anyway). | Step 2 build | 2, second version |
| Scroll the PDF editor to a line anchor and mark it. | Step 2 spec | 2, second version |
| Drop running page headers and footers before joining lines into an event (the proof run joined a footer of spaced-out letters into an event). | Step 3 proof run | 3, second version |
| Show the Notebook's reading kind more plainly to the agent (it called text-layer text "OCR" twice). | Step 2 and 3 proof runs | 3, second version |
| Relative dates against the document's header date ("the next day"). | Step 3 spec | 3, second version |
| Insert a Notebook sentence at the cursor. Step 4 v0 adds it at the end of the draft, because the build has no public paragraph-insert API that keeps an anchor. | Step 4 proof task | 4, second version or 5 |
| Hide the Draw and View ribbon tabs when a configuration key for them is found. Item d names only File, Plugins and Protect; those are hidden. | Step 4 build | 4, second version |
| Show the editor's own status bar in step 5 (it says "All changes saved" after our save; the harness bar is the authority). | Step 4 build | 4, second version |
| Compare a generated List of Dates against the owner's real SLP drafts and improve the sentence shape (still deterministic, no model text). | Step 4 proof task | After round 1 |
| Quitting the application while a draft editor frame is open hung under Playwright. Check the window close path with a draft open and fix it. | Step 4 test run | 4, second version |
| Clean the event description before generated prose: the step 3 extractor keeps list numbering ("2. In brief …") and repeated date phrases ("on the date of the incident, i.e. 18.3.1988"), and the List of Dates and Synopsis show them. The step 3 extractor owns the text. | Step 4 proof run on real documents | 3, second version |

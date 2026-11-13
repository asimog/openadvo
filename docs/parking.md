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
| A model API key entered in the application and stored through Electron `safeStorage`. Step 1 uses the credentials that Pi already stores for the owner (see [questions.md](questions.md), Q-2). | Step 1 build | 1, second version |
| A model picker in the chat pane. Step 1 reads the model from the `OPENADVO_MODEL` setting or takes Pi's first available model. | Step 1 build | 1, second version |
| Pi session persistence to a file in the matter folder, so the chat history survives a restart. Step 1 keeps the chat in memory for one run. | Step 1 build | 1, second version |
| A matter rename and archive. | Step 1 build | 1, second version |

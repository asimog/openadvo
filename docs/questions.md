# Questions for the owner

Each question records what is needed, why, and the default the work uses until the owner answers. Work continues on everything else.

| Id | Question | Why it matters | Default until answered |
|---|---|---|---|
| Q-1 | The build plan asks to port "research C5 6.2 gates G1-G7". No file named C5 exists in `C:\dev\openadvocate`, and `C:\dev\openadvocate` has no `docs/research` folder. Files C1, C2, C3, C4, C6 and C7 exist in `C:\dev\archive\research`. Where is C5? | Step 5 and step 8 port the gates. | The plan names C5 6.2 as the port source and marks it "not found". Steps 5 to 8 do not start without it. |
| Q-2 | Step 1 runs the agent with the model credentials that Pi already stores for you (Pi's own credential file under your user folder). The application itself stores no secret. Is this acceptable for round 1, or must the application ask for a key and store it through `safeStorage` now? | Decision 9 says secrets go through `safeStorage`. Step 1 holds no secret, so it does not conflict, but you may want the application to own the key. | Pi's own credentials. The `safeStorage` key entry is parked. |
| Q-3 | Which model should the agent use by default? Your Pi setting names `opencode-go/deepseek-v4.1-flash`. | Cost, speed and quality of every agent turn. | The `OPENADVO_MODEL` environment setting, else Pi's first available model. |
| Q-4 | The workflow (section 11, step 6) allowed the second filing confirmation "from the window or from the CLI behind an OS user-presence prompt". There is no CLI now. The second confirmation is from the window only. Do you want an operating-system user-presence prompt (for example Windows Hello) on that second confirmation? | Step 10. | From the window only. Decided at step 10. |

# Session handoff: <topic>

Copy this file to `.agents/prompts/successor-<topic>.md` at the end of a session, or put its parts in the status section of the prompt you continue. The next agent reads it with no other explanation. Facts only. Name files and commands; do not describe them.

## Verified now

- What works, and the command that shows it (with counts and exit codes):

## Changed this session

- Code or behaviour, with commit ids:
- Documents, harness or scripts:

## Broken or not verified

- Known defects, each with a file and line:
- Paths not run (for example, a live model, a real provider, the installed build):
- Risk for the next session:

## Next step

- The next item, by its id:
- Why it is next:
- What counts as done (the test or the owner's real brief, lesson L3):
- What must not change during it:
- What waits for the owner (by question id):

## Commands

- Start: `npm run session:start`
- Verify: the rows of `docs/agent-guide.md` section 8.4 that apply
- Focused check for the next step:

## Clean state at hand-over

Each line is checked, or says why not (`docs/agent-guide.md` section 13).

- [ ] `npm run session:start -- --unit` exits 0
- [ ] Everything is committed; `scratchpad/` content is not in the diff
- [ ] The session record is in `.agents/logs/`
- [ ] Work started and not finished is listed above

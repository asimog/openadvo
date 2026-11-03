@AGENTS.md

## Claude Code specifics

The instructions above apply in full. These add the Claude Code habits that keep a long implementation from drowning in context.

- **Start each component group in a fresh session.** Do not carry a finished group's context into the next one. If a session has grown long and the work moves to another group, say so and suggest a new session.
- **Use the Explore sub-agent for wide searches** across the docs or the codebase, and keep only its conclusion in this context.
- **Read in ranges.** Grep for the id first, then read the lines around it with an offset and limit. Do not read `docs/decisions.md`, `docs/component-map.md` or `docs/report.md` whole.
- **Do not re-read a file you just edited** to check the edit. The edit tool already confirms it.
- **Plan before cross-group work.** If a change touches more than one component group, or changes a decision, write the plan first and name the specs and decision ids it touches.
- **Memory is for durable facts only.** Do not save spec content to memory. The specs are the record.

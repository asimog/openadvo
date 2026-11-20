# CLI-first plan — deliverable F

Status: **proposed plan, presented for acceptance** (stage 6). The CLI is a delivery interface: every command prints the result of one named operation and owns no logic (R-2). The owner answered DQ-9 with a CLI-only first exit, so the first vertical slice completes here before any desktop UI exists.

## 1. Rules the CLI obeys

1. **One command = one operation.** A command parses arguments, calls the operation, prints the result. If a command needs logic, the logic belongs in the operation and the command shrinks.
2. **Two outputs.** Human text by default; `--json` prints the operation's typed result verbatim. Agents and scripts use `--json`; they never parse prose (the assignment's rule).
3. **Stable errors.** The domain result envelope's codes surface as `openadvo: FACT_NOT_FOUND — …` on stderr with exit code 1; `--json` prints `{ "ok": false, "code": "FACT_NOT_FOUND", "detail": "…" }`. Exit codes: 0 success, 1 domain failure, 2 usage error.
4. **Safe defaults.** Read commands run without confirmation. Reserved actions (`accept`, `confirm`, `submit`, `archive`) require `--yes` or an interactive `[y/N]`; `--json` mode requires `--yes` outright, because automation must be explicit.
5. **Scope is explicit.** Matter-scoped commands take `--matter <id>` or use the shell's active matter (`openadvo matter open` sets it; the file lives in the app data folder, never in a repo).
6. **Help and discovery.** `openadvo` lists commands by domain; every command's `--help` names the capability id it invokes.

## 2. Initial command tree (the first slice's surface; later phases append)

```
openadvo
  matter     list · create · open · show · archive        # matter domain
  proceeding add · list · show · set-stage · connect      # proceedings domain
  document   import · list · show · pages · ocr            # documents domain
  evidence   register · list · show · relate               # evidence domain
  fact       list · propose · review · accept · dispute · reject · supersede
  review     list · decide                                 # work domain: the review queue
  court      list · show · sources                         # courts domain (read-only)
  intake     classify                                      # content-assisted classifier (DQ-8)
  policy     show · verify                                  # fail-closed policy state
  config     get · set
  agent      ask · runs · resume                            # behind the execution interface
```

Later phases append, never replace: `draft` (phase 7), `task`/`deadline`/`workflow` (phase 8), `filing prepare · check · confirm` with `submit` **absent from any agent surface** (phase 10, DQ-6), `research` (phase 11).

## 3. The commands the first slice lives or dies on

The slice's owner exit (DQ-9) is this sequence, on the owner's real brief:

```
openadvo matter create --title "…" --client "…"
openadvo proceeding add --court in-sc --case-type slp-civil   # or any other court's type
openadvo document import ./brief/                             # ingest → pages → OCR
openadvo evidence register --document <id> --anchors …
openadvo fact review --matter <id>                            # candidates, with sources and anchors
openadvo fact accept <fact-id> --yes                         # a FactDecision is written
```

`fact review` lists every candidate with its origin, its typed sources and its contradiction state, and is honest about processing state (lesson L2: nothing pretends). Acceptance prints the decision record's id and the chain event's seq.

## 4. How commands call operations

```
interfaces/cli/commands/fact-accept.ts
  → parses args, resolves scope (DQ-1: the CLI constructs the advocate actor here)
  → catalog requires capability "facts.accept" (human-only surface: cli)
  → operations.acceptFact(scope, factId, reason) runs: policy check (fail-closed),
    domain write, chain event, review-queue update
  → command prints the FactDecision; --json prints the typed result
```

The desktop review pane of phase 9 and the agent tool of phase 6 call **the same** `acceptFact`. Three surfaces, one operation — the duplication the audit found in the renderer and bridge (F-2) cannot recur by construction.

## 5. What the CLI never does

- No business rules: no filtering that decides what is legally relevant, no gating that hides a decision.
- No direct store or filesystem access: an operation is the only door.
- No parsing of agent prose: `agent ask` prints the run's events as they are.
- No growing into a shell: if a command needs composition, a workflow step composes operations instead (phase 8).

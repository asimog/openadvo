# Spec: memory and knowledge (phase 10)

Status: started 2026-11-18. The phase, its scope and its exit are in [../build-plan.md](../build-plan.md) section 2. The features are in [../features.md](../features.md). The advocate sees workflow step 11 of [../advocate-workflow.md](../advocate-workflow.md) section 4 and section 6.

Two modules are built: **memory answers and the advocate graph** (F5, G3) and **knowledge in use** (M2, M3). No analytics are built (owner, 2026-11-18: "Do not implement any analytics"; decision 13).

## 1. The scope

| Feature | This phase builds |
|---|---|
| F5 | Six standard questions over matter memory and the record: what was decided, why an argument was rejected, which facts are disputed, which instructions were given, what changed since the last hearing, which assumptions expired. Each answer names the records it rests on, with their ids and anchors, and says what it did not read. |
| G3 | The advocate memory graph in `advocate.db`: an edge table built from approved preferences, confirmations and corrections, approved precedents, lessons, court practices and outcome records. A recursive query walks it; the build is one command. |
| M2 | Approved and rejected positions, playbooks, court-specific drafting styles and common errors in the Knowledge Library; and the approved precedent offered first for a new draft, with its court, scope and date. |
| M3 | Outcome records of past matters, entered by the advocate: what the court did, on what date, with the order as the source. A record is corrected by a new record, never deleted. |

## 2. Memory answers (F5)

`src/lib/memory-answers/index.ts` owns the answerer. It is deterministic. It reads a snapshot of the matter and answers one of six questions. It never calls a model and never writes.

| Question | Reads | Answer |
|---|---|---|
| What was decided | `advocate_decision` memory, accepted issues, accepted arguments, directions and orders in the events | The decision, its date, its record and the authority or order behind it |
| Why an argument was rejected | `rejected_argument` memory, rejected arguments and rejected issues, with the reason | The argument, the reason given, who decided it and when |
| Which facts are disputed | confirmed and disputed facts, `disputed_fact` memory, date conflicts and contradictions | The fact, the two readings, and the anchors of both |
| Which instructions were given | `client_instruction` memory and the communications records | The instruction, who gave it, when, and whether the advocate accepted it |
| What changed since the last hearing | the last hearing, then orders, directions, compliance tasks, stage changes, new sources, drafts and memory records after its date | One line per change, with its record and date |
| Which assumptions expired | memory records whose `valid_until` is before today, superseded records, and unconfirmed limitations. The freshness of the court rules is outside this snapshot and is named as not read. | The record, the date it expired, and what now depends on it |

`answerMemoryQuestion(snapshot, question)` classifies the question by its words, with the six standard questions first. A question outside the six searches the memory records and the issues for its words and says that it is a search, not one of the six.

Every answer carries:

- `answer`: short lines, each with `recordIds` and `anchors`;
- `records`: the record kind, id, label and anchor;
- `gaps`: what the record does not hold;
- `notRead`: what the answerer did not read;
- `asOf`: the date of the snapshot.

The Matter Agent gets one tool, `answer_memory_question`, with the question. The bridge has the same function. The Memory tab shows the six buttons and the answer, so the advocate needs no chat.

## 3. The advocate memory graph (G3)

`advocate.db` gains an `edge` table:

```
edge (from_kind, from_id, relation, to_kind, to_id, evidence_ref, built_from, built_at)
```

The nodes are `advocate`, `court`, `practice_area`, `preference`, `precedent`, `lesson`, `court_practice`, `outcome`, `skill` and `proposition`. The relations are `prefers`, `rejected`, `approved`, `supersedes`, `used_in`, `succeeded_when`, `failed_because`, `applies_in` and `derived_from`.

`rebuildAdvocateGraph(records)` is a pure function. It reads:

- approved preferences: `advocate → prefers → preference`, and `preference → applies_in → court` when the reason names a court;
- confirmed memory: `advocate → approved → precedent | lesson | court_practice`;
- superseded memory: `advocate → supersedes → proposition`, read from the new record;
- rejected memory: `advocate → rejected → proposition`;
- outcome records: `outcome → succeeded_when | failed_because → proposition`, with the outcome's own words and the court;
- approved library items: `advocate → approved → precedent`, and `precedent → used_in → court` when the item names one.

The graph holds no client fact. An outcome contributes its result and its legal subject, never the parties or the evidence. The rebuild is one `AdvocateStore.rebuildGraph()` call; the Knowledge page shows the edges, their counts and the date of the last build.

`graphWalk(edges, start)` answers neighbours and two-step paths. The bridge returns the edges for the Profile and the Knowledge page.

## 4. Knowledge in use (M2, M3)

### 4.1 Positions, playbooks, styles and errors

The Knowledge Library already holds files with a kind and a precedent status (M1). M2 gives those rows a use. `src/lib/library/positions.ts` derives the roles of each item from its kind, its status, its court and its tags. The roles are views: an approved court template appears under both Approved precedents and Court-specific drafting styles.

| Role | Kinds and status | What it is |
|---|---|---|
| Position | `proposition` | An approved or rejected legal position, with its scope |
| Playbook | `checklist` | The steps for a proceeding or a court |
| Drafting style | `template`, `pleading` with a court | The court-specific form the advocate approved |
| Common error | `note` with the tag `common-error` | A mistake to check for |
| Precedent | `pleading`, `submission`, `template` with status `approved` | A document the advocate may use again |

`libraryRoles()` groups the items. An item with no role stays in the library and is not offered.

`rankPrecedents(items, subject)` answers the drafting question. It keeps the approved items whose kind is a precedent and puts first the item whose `court` is the matter's court, then the item whose `scope` matches the proceeding or the practice area, then the newest. Each row carries the reason it was offered. A rejected item is never offered. An unreviewed item is offered last and says "unreviewed".

The context package of a drafting skill carries the first three offers as `precedent` candidates, with their court, scope, date and reason. The agent's prompt and the drafting skill name them. `list_precedents` is an agent tool; the Drafts view shows the offers before the advocate generates a draft.

### 4.2 Outcome records (M3)

`matter.db` gains an `outcome` table:

```
outcome (id, result, subject, court, decided_on, source_id, summary, entered_at, entered_by, supersedes, status)
```

`result` is `allowed`, `dismissed`, `partly_allowed`, `settled`, `withdrawn`, `disposed` or `other`. `subject` is the legal question or the relief, in the advocate's words. `source_id` is the order in the record, when it is there. A correction is a new row that supersedes the old one; the old row stays.

`recordOutcome` is human-only. The Memory tab shows the outcomes and their history. The advocate memory graph reads them (section 3).

## 5. The window

- **Memory tab**: the six standard questions as buttons; the answer with its records and anchors; the gaps and `not_read`; the outcome records with their add form and history.
- **Knowledge page**: the four roles (positions, playbooks, drafting styles, common errors), the approved precedents, and the advocate graph with its edges and rebuild button.
- **Drafts**: the first three approved precedents for the matter, each with its court, scope, date and reason. A rejected precedent is not shown.

## 6. Tests

| Test | Checks |
|---|---|
| `tests/unit/memory-answers.test.ts` | Each of the six questions on a fixture matter; the records and anchors; a missing record is a gap, not an invention; the search fallback says it is a search |
| `tests/unit/advocate-graph.test.ts` | The edges from preferences, memory and outcomes; no client fact; the walk; the rebuild is stable |
| `tests/unit/library-positions.test.ts` | The roles; the precedent order (court, scope, date); a rejected item is not offered; the reason line |
| `tests/unit/outcomes.test.ts` | The row; the correction keeps the history; human-only |
| `tests/unit/context-package.test.ts` | A drafting package carries the first three precedents |
| `tests/e2e/phase10.spec.ts` | An old matter: a memory answer with its records, an outcome, a precedent offered for a draft, and the graph |
| `tests/e2e/app.spec.ts` | The bridge and agent tool lists, when a name changes |

Between the steps: the type check and the unit tests. The end-to-end suite runs once, at the end.

## 7. What is not built, and why

- No analytics (owner, 2026-11-18). There is no legal or quality panel.
- The answerer is deterministic. It does not paraphrase with a model; a chat answer may use the model, but it must carry the same record links.
- Cross-matter facts are never read (architecture section 6). An outcome contributes its result and legal subject to the advocate graph, never the parties or the evidence.
- The graph is rebuilt on demand, not on every write. The Knowledge page says when it was last built.

## 8. Done

The owner completes the phase exit of [../build-plan.md](../build-plan.md) on an old matter (lesson L3): prior decisions, instructions, open items and posture are recovered correctly; an approved precedent is offered first for a new draft, with its scope; an outcome record is entered and the advocate memory graph shows it.

# Spec: practice packs (phase 8)

Status: started 2026-11-18. The phase, its scope and its exit are in [../build-plan.md](../build-plan.md) section 2. The features are in [../features.md](../features.md). The advocate sees workflow step 2 of [../advocate-workflow.md](../advocate-workflow.md) section 2 (the Practice Profile) and step 1 of section 4 (a new instruction is classified into a practice pack and a proceeding).

Two modules are built: **practice packs** (N4, Q3) and **skill review** (N6).

## 1. The scope

| Feature | This phase builds |
|---|---|
| N4 | The phase 8 skills of [../skills.md](../skills.md): SK-001 to SK-033 (except SK-028, phase 9), SK-101 to SK-110, SK-113 and SK-114, SK-201 to SK-208 and SK-210, SK-301 to SK-305 and SK-307 to SK-309. Each is a versioned `SKILL.md` in `skills/`, with its instructions, tools, checks, approval points and tests. |
| N6 | The thirteen-parameter review, the three legal failure modes, a review record kept with the version, and the fixture skill tests that run on every change. |
| Q3 | The SLP generators, filing set, limitation rule and workflow move from the core to `packs/slp.json` and `src/lib/packs/slp.ts`. The core asks the pack registry; it holds no SLP constant. |

The packs are criminal, civil, constitutional and writ, and the Supreme Court SLP pack. The default of questions Q-2 is used: the SLP work is a pack of the Supreme Court, not a special case in the core. No gold set exists (questions Q-3), so the skill tests use fixture briefs and say so.

## 2. The practice pack (N4, Q3)

A practice pack is content. It owns no matter fact and no decision. `packs/<id>.json` holds the fields of [../skills.md](../skills.md) section 2.6:

| Field | Holds |
|---|---|
| `id`, `version`, `title` | `criminal`, `civil`, `writ`, `slp` |
| `practice` | The Practice Profile practice areas the pack serves |
| `courts` | The court directory ids where the pack applies |
| `proceedings` | One row per proceeding: key, title, case type, provisions, limitation, required parts, required documents, checklist, workflow, stages, intake questions, skills, record columns, evidence requirements and terms |
| `acts` | The governing acts the pack names, each with its version and source. A version is recorded only when a source records it. |
| `templates` | The document kinds of phase 6 that the pack uses |
| `terms` | The pack's words and their meaning |

`src/lib/packs/index.ts` checks a pack and builds the registry. It also answers the questions the window and the filing set ask:

- `packForMatter(profile)` names the pack from the matter's practice area, proceeding or court. The SLP pack applies to a Supreme Court matter or an SLP proceeding.
- `proceedingFor(profile)` names the proceeding inside the pack.
- `skillRefusal(skill, pack)` stops a skill whose `packs` do not include the matter's pack. `general` applies to every pack. An unknown pack is reported, never refused silently.
- `filingPlan(pack, proceeding)` returns the documents, the annexure parts, the parts the catalogue cannot map, and the limitation rule.

The default pack of the application is the SLP pack: a matter with no court target and no chosen pack files the Supreme Court SLP set, as it does today. The difference is that every SLP value is now data in the pack. The Filing tab names the pack in use and says why.

### 2.1 The SLP pack (Q3)

`packs/slp.json` owns:

- the proceedings `SLP(C)` and `SLP(Cr)`, with Article 136 and the Supreme Court Rules, 2013, Order XXI;
- the limitation rule, 90 days from the judgment, with its source line and the note that the advocate confirms each working;
- the filing set: Synopsis, List of Dates, Petition, Questions of Law, Grounds, and the condonation application when limitation has run;
- the workflow: impugned judgment analysis, chronology, list of dates, issues, limitation, drafts, citation review, checklist, approval;
- the stage list, the intake questions, the record columns, the evidence requirements and the terms.

`src/lib/packs/slp.ts` owns the two SLP generators: the petition for special leave (`petitionBlocks`) and the application for condonation (`condonationBlocks`). They move from `src/lib/drafting/structured.ts` unchanged, so an SLP draft today renders the same text. `src/main/drafts.ts` asks the pack registry for the generator of a structured kind; it holds no SLP title or prayer.

The `in-sc` adapter keeps the quoted court rules and the checklist lists. Its workflow, required parts, limitation and skills rows are removed from the adapter and read from the SLP pack. One fact has one owner: the adapter owns the quote; the pack owns the practice use.

## 3. The skill library (N4)

### 3.1 The skills

The skills are the phase 8 rows of [../skills.md](../skills.md) section 2. Each folder is `skills/sk-<id>-<name>/` with `SKILL.md` and `review.json`.

| Pack | Skill ids |
|---|---|
| Every proceeding (`general`) | SK-001 to SK-027, SK-029 to SK-033 |
| Criminal | SK-101 to SK-110, SK-113, SK-114 |
| Civil | SK-201 to SK-208, SK-210 |
| Constitutional and writ | SK-301 to SK-305, SK-307, SK-309 |
| Supreme Court (SLP) | SK-308 (and the SLP use of SK-005, SK-008 and SK-027) |

A skill names the pack it serves in `packs`. The every-proceeding skills name `general`; a pack skill names its pack. `courts` and `proceedings` narrow a skill further where the law or the forum does. A skill that names neither applies everywhere.

The roles gain the read tools of phases 4 and 7 (`list_facts`, `list_evidence`, `get_contradictions`, `get_jurisdiction`, `get_timeline`, `list_document_parts`, `list_matter_memory`) and the proposal tools where the role already proposes (`propose_fact`, `propose_evidence`, `propose_matter_memory`, `propose_theory`, `propose_elements`, `propose_cross_questions`, `propose_compliance_tasks`). A skill can name only its role's tools, as feature Q2 requires.

### 3.2 The rules every skill keeps

- Every skill has the check `schema` and `anchors`; every output item carries an anchor, and an anchor that names no record of the matter fails the gate.
- A drafting skill writes proposals only (`propose_paragraph`, `propose_correction`, `insert_citation`). It never approves, keeps or files.
- The witness rule (L8) is in every affidavit and evidence skill: the skill organises the deponent's own recorded words and composes none.
- A skill that finds a legal point states it as a question for the advocate. It never decides it.
- A skill whose output names a defect carries the severity the phase 6 mapping assigns (`severity_floor`).
- A skill outside its pack, court or proceeding stops with the reason (D5), in the runner.

## 4. The skill review (N6)

`src/lib/skills/review.ts` owns the review. It has two parts.

**The thirteen parameters.** Each is scored 0, 1 or 2; the score is out of 26.

| No. | Parameter | What a 2 means |
|---|---|---|
| 1 | Purpose and triggers | The description says what the skill does and the requests that call it |
| 2 | Pack, court and proceeding scope | The scope is named where it matters and empty where it does not |
| 3 | Inputs | Every input the run needs is named |
| 4 | Required context | The package asks for the records the instructions read |
| 5 | Permitted tools | Every tool is inside the role's scope and none is human-only |
| 6 | Output schema | The output type and its shape fit the work |
| 7 | Anchors and provenance | The output requires anchors, and a claim of verification names its validator |
| 8 | Checks | The gate's checks match the output and the role |
| 9 | Approval points | A writing skill stops before its first write |
| 10 | Budget | A budget is set and is enough for the package and the output |
| 11 | Tests | The skill names a fixture brief and the expected properties |
| 12 | Instructions | The body states the steps, what to read, what never to do, and the witness and legal-question rules where they apply |
| 13 | Version and author | The version, the author and the review record are present and agree |

**The three legal failure modes.** Any one fails the review, whatever the score:

1. **Invented record.** The skill writes a fact, date, amount, name or anchor that the record does not hold.
2. **Unsupported law.** The skill states law with no authority, statute or source behind it.
3. **Decided for the advocate.** The skill decides an issue, approves a draft, accepts an authority or files.

`reviewSkill(skill)` returns the parameters, the score, the failure modes and the defects. `scripts/review-skills.ts` writes `review.json` beside each `SKILL.md`:

```json
{ "version": "1.0.0", "score": 24, "max": 26, "parameters": [...], "failure_modes": [], "reviewed_at": "...", "fixtures": ["criminal-bail"] }
```

The version in the record must equal the skill's version. A skill whose version changes without a new record is "review needed" in the registry and cannot run. The Workflows & Skills view shows the score and the record's date.

**The skill tests.** `src/lib/skills/skill-tests.ts` owns three fixture briefs: `criminal-bail`, `civil-injunction` and `writ-maintainability`. A fixture brief is a small record set with its anchors. Each skill names its fixture and its expected properties. The test runs on every change and checks:

- the skill loads, with no error, inside its role;
- the review record matches the version and has no legal failure mode;
- the required context kinds are in the fixture;
- a sample output of the skill's output type, built from the fixture's anchors, passes the gate with the skill's checks;
- the expected properties hold: the pack scope, the anchor requirement, the approval point of a writing skill, and the witness or legal-question rule where it applies.

The tests say, on screen and in the record, that they use fixture briefs, not a gold set.

## 5. The window

- **Practice Profile → Practice map**: the four packs, their proceedings and whether each is enabled by the practice areas. A pack that is not enabled says so.
- **Practice Profile → Statutory map**: the acts of the enabled packs, with the version only where a source records it.
- **Practice Profile → Skills**: with the pack of each skill and the review score.
- **Workflows & Skills**: the four packs with their versions and errors, the pack of each skill, the review score and its date, and a filter by pack.
- **Filing tab**: the pack and proceeding in use, the pack's workflow with its skill ids, and the required documents. With no court target, the row says that the SLP pack applies by default.

## 6. Tests

| Test | Checks |
|---|---|
| `tests/unit/packs.test.ts` | The four packs check; the SLP pack's set, limitation and workflow; the pack of a matter; the pack gate; the filing plan; the SLP generators unchanged |
| `tests/unit/skill-review.test.ts` | The thirteen parameters; the three legal failure modes each fail a skill; the score; a version without its record is "review needed" |
| `tests/unit/skill-library.test.ts` | Every phase 8 skill loads; the ids are the phase 8 rows of `skills.md`; the review record matches the version; the fixture tests and expected properties |
| `tests/unit/skills.test.ts` | The built-in registry, the roles' new read tools, the pack field |
| `tests/unit/filing-target.test.ts` | No target: the SLP pack's documents, not a core constant; the DHC target still wins; the limit row names the pack |
| `tests/e2e/phase8.spec.ts` | The window path: the Practice map, the skill library with its reviews, a bail skill run with a report card, the SLP pack on the Filing tab |
| `tests/e2e/app.spec.ts` | The bridge and agent tool lists, when a name changes |

Between the steps of the phase: the type check and the unit tests. The end-to-end suite runs once, at the end.

## 7. What is not built, and why

- The commercial, arbitration, family and other packs of [../skills.md](../skills.md) sections 2.5 and 2.6 are phase 11. Their skill ids are not written yet.
- SK-028 (Matter Change Report) is phase 9. SK-034, SK-035, SK-111, SK-112, SK-115, SK-209, SK-211 and SK-306 are phase 11. Their rows stay in the library and say their phase.
- The skill tests run fixture briefs, not a gold set (questions Q-3). A model is not called by the test.
- The packs hold no court rule quote. The court adapter owns the quote; the pack names the source.
- A pack's act version is recorded only where the law store or an adapter records it. A missing version says "not recorded", never a guess.

## 8. Done

The owner completes the phase exit of [../build-plan.md](../build-plan.md) on real briefs (lesson L3): an SLP with no loss against what the code does today; a Delhi bail application; a quashing petition with an ingredients chart; a writ with maintainability questions; and a civil injunction with a conditions chart.

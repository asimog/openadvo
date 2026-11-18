# Spec: builders, automation, integrations and the remaining packs (phase 11)

Status: started 2026-11-18. The phase, its scope and its exit are in [../build-plan.md](../build-plan.md) section 2. The features are in [../features.md](../features.md). No languages are built (owner, 2026-11-18: "do not implement any hindi or other regional languages"; decision 19). No analytics are built (owner, 2026-11-18; decision 13).

## 1. The scope

| Feature | This module builds |
|---|---|
| D4 | Foreign elements as route facts: a foreign party, a foreign judgment, a foreign award, a foreign seat and foreign assets. The advocate adds or confirms each element; the library maps it to the routes and provisions that may apply, with their source. A route is a fact for the advocate, never a decision. |
| H14 | OCR comparison (already in the ingest) with its disputes, plus OCR quality checks and a document quality score: blur, skew, blank pages, duplicate pages, low confidence and missing pages. A quality issue opens one review item for the document. |
| N5 | The workflow builder: skills chained in order, with inputs, conditions and approval gates, versioned and testable. The agent builder: a named agent from a task, instructions, skills, a template, sources, required context, tools, output, checks and approvals. Both have a visual editor and a runner. |
| N7 | Skill import from a file: the raw text on screen, the embedded-instruction scan, the skill check, and install only after the advocate agrees. |
| N8 | The 17 remaining packs and their 79 skills: [../skills.md](../skills.md) sections 2.5 and 2.6 and the phase 11 rows of sections 2.1 to 2.4. |
| S9 | The trigger table: new document, email, order, hearing date, stage change, deadline, instruction, amendment, citation change and defect received. A fire proposes the named skills and the automated responses. Only the advocate starts them. |
| Y1 | The integration manifest: version, capabilities, permissions, inputs and outputs, events, lifecycle, audit, failure and disable behaviour; checked, listed and disabled in Settings. No integration ships. |
| Y3 | Storage import: local folders first; OneDrive and Google Drive through their synced folders; the provider is recorded on the source. No credentials and no OAuth. |

## 2. Foreign elements (D4)

`src/lib/jurisdiction/foreign.ts` owns the rules. It has no Electron import.

| Element | Proposed from | Routes it may open |
|---|---|---|
| Foreign party | A party's recorded name or note, or the advocate | Section 9 CPC read with the forum clause; a foreign plaintiff's security for costs; service outside India |
| Foreign judgment | A judgment from a court outside India, or the advocate | Section 13 and Section 44A CPC; enforcement, and the defences Section 13 names |
| Foreign award | An award with a foreign seat, or the advocate | The New York Convention, Sections 44 to 52 of the Arbitration and Conciliation Act, 1996 |
| Foreign seat or venue | A forum clause that names a seat outside India | The law of the arbitration, the supervisory court, and Section 9 or Section 17 interim relief |
| Foreign asset | The advocate | Enforcement and the assets named in the order |

Each route row holds: `route`, `basis` (the provisions), `source` (the Act and the section), `status` (`proposed` or `confirmed`) and `note`. A route with no record says "advocate to verify" and is never shown as confirmed.

The element rows live in `matter.db` (`foreign_element`). The routes are derived by the library, never stored as a decision. The Jurisdiction tab shows the elements, their source and the routes. The agent's `propose_foreign_element` writes a proposal; `confirmForeignElement` is human-only.

Detection is narrow and honest:

- a party whose recorded name or note names a country other than India;
- a forum clause from D3 whose seat, venue or law is outside India;
- a source the advocate marks as a foreign judgment or a foreign award.

A missed element is added by the advocate. The window never guesses the nationality of a name.

## 3. OCR and document quality (H14)

The two-engine comparison and its disputes are built (H3, H14 in part). This module adds the quality layer.

`src/lib/document-intelligence/quality.ts` has two functions:

- `pageQuality(png)` returns `{ blur, skew }`. Blur is the variance of the Laplacian of the grey image, normalised to 0 to 100, higher is sharper. Skew is the angle in degrees, from -5 to 5, that maximises the row-sum variance of the dark pixels. Both run on a downscaled copy (480 px wide at most), so a page costs milliseconds.
- `documentQuality({ pages, qualities, expectedPages })` returns `{ score, issues }`. It checks: a blank page; a page under 20 characters; a low OCR confidence (under 60); a blur score under 35; a skew over 1.5 degrees; a duplicate page (the same normalised text); a missing page number when the document numbers its pages; and a page count below `expectedPages`.

The score starts at 100. Each issue costs its weight: blank 20, duplicate 15, missing page 15, low confidence 8, blur 8, skew 5, short page 3. The score never hides an issue; every issue is listed with its page.

The page metrics are stored in `page_quality` (one row per source and page) when a page is read. A document's score is computed on demand from the stored rows and the page text. A source read before this module says "image metrics not recorded" for the pages without a row; the text checks still run.

One review item per source carries the issues. The Documents panel shows the score, the issues and the pages. The bridge is `documentQuality(matterId, sourceId)`.

## 4. The workflow and agent builder (N5)

### 4.1 The workflow

A workflow is a versioned record in `advocate.db`:

```
workflow (id, version, title, description, inputs, steps, created_at, superseded_by)
```

| Field | Holds |
|---|---|
| `id` | `wf-<uuid>` |
| `version` | `n.n.n`; a save makes a new version and supersedes the old row |
| `title`, `description` | What it does |
| `inputs` | `{ key, title, required, default }`; the advocate gives them at the start |
| `steps` | `{ id, skill, request, when, gate, onFailure }` in order |
| `step.skill` | A skill id of the registry; the runner refuses a missing skill |
| `step.request` | The step's request, with `{{input.key}}` and `{{step.<id>.output}}` placeholders |
| `step.when` | `always`, `input:<key>`, `step:<id>:done`, `step:<id>:failed` |
| `step.gate` | `none`, `before` or `after`; a gate waits for the advocate |
| `step.onFailure` | `stop` or `continue` |

A run is a matter record (`workflow_run` in `matter.db`): the workflow version, the inputs, one row per step with its state and report card, and the state of the run (`planned`, `running`, `waiting`, `done`, `failed`, `stopped`). The runner:

1. builds the plan and shows it in the chat;
2. runs each step through the skill runner at the skill's own role, tools and checks;
3. waits at a gate, and says what it waits for;
4. evaluates `when` before a step, and skips a step whose condition is false;
5. stops on a failed step when `onFailure` is `stop`, and says why;
6. writes a report line for each step and a final line for the run.

The advocate's functions: `startWorkflow`, `approveWorkflowGate`, `stopWorkflow`. A run never changes another run. A workflow with a step outside its inputs is refused before it starts.

### 4.2 The agent

An agent is a named composition, also versioned in `advocate.db`:

```
agent (id, version, title, task, instructions, skills, template, sources, context, tools, output, checks, approvals, created_at, superseded_by)
```

`checkAgent(agent, registry)` refuses: a skill not in the registry; a tool outside every named skill's role and the agent's own allowed set; a human-only tool; a template kind not in the drafting catalogue; an output type or a check the skill format does not know; an approval point the format does not know. A test (`testAgent`) runs the same checks and the skill fixture test for each named skill, and writes a test record.

An agent runs as a workflow: each skill becomes a step with the agent's instructions prepended and the agent's template and sources named. The agent's approvals become gates.

### 4.3 The editor

The Workflows & Skills page has two editors, keyboard operable and with no modal:

- **Workflows**: the list; add, edit, duplicate, stop; the steps in order with add, remove and move; for each step: skill (a list of registry ids with the title), request, condition, gate and on-failure; the inputs. Save makes a new version.
- **Agents**: the fields of section 4.2, a skill picker, a tool picker limited to the chosen skills' roles, and the test button with its result.

The chat's Workflows menu keeps the saved instruction workflows (V1-4) and gains the built workflows.

## 5. Skill import (N7)

`src/main/skill-import.ts`:

1. `previewSkillImport(path)` reads a text file of at most 256 KB and returns its raw text, its frontmatter and body, the result of `checkSkill` as an advocate skill, and the findings of `scanText` (the embedded-instruction scan of P10). It writes nothing.
2. The window shows the raw text, every finding and the skill's tools. The advocate reads them.
3. `installSkillImport(previewId)` is human-only. It writes `<userData>/skills/<name>/SKILL.md`. An existing folder is never overwritten: the new folder gets a suffix. An imported skill has no review record, so it says "advocate skill, not reviewed".
4. A file that fails the skill check can still be read, but it cannot be installed; the view says which field fails.

## 6. The trigger table (S9)

A trigger is a versioned record in `advocate.db`:

```
trigger (id, event, title, skills, responses, enabled, created_at, updated_at)
```

The events are `new_document`, `email`, `order`, `hearing_date`, `stage_change`, `deadline_approaching`, `instruction`, `amendment`, `citation_change` and `defect_received`. The responses are the automated proposals: `rebuild_chronology`, `update_context`, `flag_issues`, `research_task`, `letter`, `recalculate_deadlines`, `reassess_arguments`.

`fireTriggers(event, subject)` matches the enabled triggers and writes a `trigger_fire` row: the event, the matter, the subject, the skills, the responses and the state (`proposed`, `started`, `dismissed`). It starts nothing. The Review Inbox lists each fire with "Start the skills" and "Dismiss". The start runs the named skills through the skill runner, one after the other, and records the runs. A response becomes a proposal in the matter: a review item, a research task, or a proposed letter; it never changes a draft or a deadline.

The seams that fire: a finished ingest with a new source; a mail import; a source typed as an order or a judgment; a hearing added; a stage change; a reminder due; a communication classified as an instruction; an amendment or citation change recorded; a defect list imported.

A default trigger set is written on first start: new document → SK-002, SK-009; new order → SK-008, SK-022; stage change → SK-006; defect received → SK-025; deadline approaching → SK-005. The advocate can disable each one.

## 7. The integration manifest (Y1)

`src/lib/integrations/index.ts` owns the schema and the check. A manifest is `integration.json` in `<userData>/integrations/<id>/`:

| Field | Holds |
|---|---|
| `id`, `version`, `title`, `description` | Identity |
| `capabilities` | What it does, one of `search`, `fetch`, `import`, `export`, `notify`, `model`, `court` |
| `permissions` | What it may reach: `files.read`, `files.write`, `network`, `matter.read`, `matter.write`, `advocate.read` |
| `inputs`, `outputs` | Their names and types |
| `events` | The events it emits and the events it subscribes to |
| `lifecycle` | `install`, `enable`, `disable`, `remove`, each with its steps |
| `audit` | What it records and where |
| `failure` | `disable`, `retry` or `ask`, and the message |
| `disable` | What is left when it is disabled: `read_only` or `none` |

`checkIntegrationManifest(raw)` refuses an unknown capability, an undeclared permission, a write permission with no lifecycle entry, a missing failure or disable rule, and a version that is not `n.n.n`. The Settings page lists the installed manifests, their capabilities and permissions, and enables or disables each. A disabled integration is listed and takes no part. No integration ships with the application; the schema and the registry are built now.

## 8. Cloud storage (Y3)

`src/lib/storage/index.ts` detects the synced folders:

| Provider | Windows | macOS | Linux |
|---|---|---|---|
| OneDrive | `%OneDrive%`, `%OneDriveConsumer%`, `%OneDriveCommercial%`, `%USERPROFILE%\OneDrive` | `~/Library/CloudStorage/OneDrive-*`, `~/OneDrive` | `~/OneDrive` |
| Google Drive | `%USERPROFILE%\Google Drive`, a drive root with `My Drive` | `~/Library/CloudStorage/GoogleDrive-*`, `~/Google Drive` | `~/Google Drive` |

The detection returns each provider, its root, whether the root exists, and how it was found. It reads no file. The import uses the same folder walk as the library and the matter intake, and records the provider on each origin. The advocate signs in to OneDrive or Google Drive in that application; Open Advocate never holds those credentials and never uses OAuth.

The Settings page shows the detected folders. The Intake dialog and the Library gain "Import from OneDrive" and "Import from Google Drive" when a folder is detected. The source's origin shows the provider. A provider that is not detected says so, with the path it looked for.

## 9. The packs and skills (N8)

`packs/` gains 17 packs: `commercial`, `family`, `property`, `insolvency`, `banking`, `tax`, `service`, `consumer`, `ip`, `environmental`, `competition`, `administrative`, `insurance`, `immigration`, `rera`, `motor` and `cheque`. Each holds the fields of [practice-packs.md](practice-packs.md) section 2. The ids are in `PACK_IDS`.

`skills/` gains the 79 phase 11 skills of [../skills.md](../skills.md):

| Group | Ids |
|---|---|
| Every proceeding | SK-034, SK-035 |
| Criminal | SK-111, SK-112, SK-115 |
| Civil | SK-209, SK-211 |
| Writ | SK-306 |
| Commercial and arbitration | SK-401 to SK-411 |
| Family | SK-501 to SK-507 |
| Property | SK-511 to SK-516 |
| Insolvency | SK-521 to SK-525 |
| Banking | SK-531 to SK-534 |
| Tax | SK-541 to SK-545 |
| Service | SK-551 to SK-554 |
| Consumer | SK-561 to SK-563 |
| Intellectual property | SK-571 to SK-574 |
| Environmental | SK-581 to SK-583 |
| Competition | SK-591 to SK-593 |
| Administrative | SK-601 to SK-604 |
| Insurance | SK-611, SK-612 |
| Immigration | SK-621, SK-622 |
| RERA | SK-631, SK-632 |
| Motor accident | SK-641 to SK-643 |
| Cheque dishonour | SK-651 to SK-653 |

Each skill follows the format of [../skills.md](../skills.md) section 1, names its pack, passes the review and its fixture brief. The fixture briefs gain one per new pack. The packs name the skills of their proceedings, and the filing plan maps each required document to a draft kind. New document kinds are added where a pack needs a form the catalogue does not hold (Section 34, Section 9, the NCLT petition, the DRT application, the tax appeal, the consumer complaint, the IP suit, the NGT application, the CCI information, the RTI appeal, the RERA complaint, the motor claim, the cheque complaint, the family petition, the partition suit, the eviction petition, the execution petition, the contempt petition and the PIL).

The wrong-jurisdiction guard (D5) uses the matter's pack as before. A matter's practice area chooses its pack; an alias (`arbitration`, `commercial`, `corporate`, `matrimonial`, `banking`, `taxation`, `labour`, `employment`, `intellectual property`, `environment`, `competition`, `regulatory`, `motor accident`) is mapped to its pack id.

## 10. The window

- **Workflows & Skills**: the workflow list and editor, the agent list and editor, the imported skills with their scan result and install button.
- **Matter → Jurisdiction**: the foreign elements and their routes.
- **Matter → Documents & Evidence**: the document quality score, its issues and the pages.
- **Settings**: the integrations with their permissions and enable switch; the storage folders; the trigger table.
- **Review Inbox**: a trigger fire, with "Start the skills" and "Dismiss"; a workflow gate, with "Approve the next step" and "Stop".

## 11. Tests

| Test | Checks |
|---|---|
| `tests/unit/foreign.test.ts` | Each element; the routes and their sources; a foreign name alone is not an element; the confirmation |
| `tests/unit/document-quality.test.ts` | The score and each issue on synthetic page metrics; a clean document scores 100; a missing page is found; the image metrics on a generated image |
| `tests/unit/workflows.test.ts` | The schema; a missing skill, a bad condition and a bad gate are refused; the placeholders; the versioned save; the run order and the gates |
| `tests/unit/agents.test.ts` | The agent check; the fixture test; a human-only tool is refused |
| `tests/unit/skill-import.test.ts` | The preview reads and scans; an injected instruction is a finding; install writes once and never overwrites; a bad skill is refused |
| `tests/unit/triggers.test.ts` | The default set; each event matches; a fire starts nothing; dismiss and start |
| `tests/unit/integrations.test.ts` | The manifest fields; each refusal; enable and disable |
| `tests/unit/storage.test.ts` | The provider detection from a temporary tree; the provider on the origin |
| `tests/unit/packs.test.ts` | The 21 packs check; the pack of each practice area; the new document kinds |
| `tests/unit/skill-library.test.ts` | The 140 skills load, carry their review and pass their fixture |
| `tests/e2e/phase11.spec.ts` | A Section 34 matter with its pack; a workflow run with its gate; a skill import; a foreign element; a quality score; an integration; a trigger fire |
| `tests/e2e/app.spec.ts` | The bridge and agent tool lists, when a name changes |

Between the steps: the type check and the unit tests. The end-to-end suite runs once, at the end.

## 12. What is not built, and why

- No Hindi and no other Indian language (owner, 2026-11-18; decision 19).
- No analytics (owner, 2026-11-18; decision 13).
- No OAuth and no cloud credentials. OneDrive and Google Drive are read through their synced folders.
- No integration ships with the application. The manifest schema and the registry are built now.
- A workflow's condition language is small on purpose: `always`, an input that is present, and a step that is done or failed. A richer expression would be another thing to test and to explain.
- The packs name acts and provisions. Their versions are recorded only where a source records them; a missing version says "not recorded".
- The quality metrics run on the rendered page. A born-digital page with no image has no blur or skew row, and the score says so.

## 13. Done

The owner completes the phase exit of [../build-plan.md](../build-plan.md) on real briefs (lesson L3): one real brief per new pack, including a Section 34 challenge; a built workflow that runs its skills in order with its approval gates; and a clipped scan that shows its quality score and whose pages are found.

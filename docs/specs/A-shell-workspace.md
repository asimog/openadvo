# A. Shell and workspace

Components: A01 to A15. See [README](README.md) for tags and conventions.

## Purpose

The window the advocate lives in, and the folders a matter lives in. The shell paints panes, routes input and shows the review inbox. The workspace component creates, opens and lists matter workspaces on disk. The shell holds no canonical state. Every action it offers is a control command (B01) that the agent and the CLI can also issue.

## Decisions implemented

P1, RQ-25, RQ-37, RQ-38, RQ-68, RQ-70, RQ-73, RQ-87, RQ-88, C-1, X-10, X-12, X-22.

## Depends on

- B (every pane action is a control command, every pane publishes a semantic model).
- C (the kernel creates matters and owns the registry).
- E (the global registry file and `matter.db`).
- D15 (the process supervisor, which starts the kernel, harness and hosted processes).

## Assumptions

- Windows 10 and later is the first platform. Paths may contain spaces and non-ASCII characters.
- egui and winit are current upstream, pinned, refreshed at a fixed interval.
- One advocate per installation. The owner field exists on every record so tenancy can arrive later (R03).

## Non-goals

- No global undo across panes. Each pane owns its undo scope.
- No erasure feature. Removing a matter folder is the erasure path (RQ-25).
- No offline mode. The shell must start and show local state with no network, but it does not promise that capture, research or verification work (RQ-37).
- The shell does not parse documents. Viewers are group J.

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa workspace init <root>` | internal | Creates a workspace root and the global registry |
| `oa matter create --title <t> [--client <id>] [--from <pdf>]` | internal | Creates a matter workspace folder, manifest and registry row |
| `oa matter list [--include-removed]` | query | Lists matters from the registry, with folder presence |
| `oa matter open <id>` / `oa matter archive <id>` / `oa matter rename <id> <title>` | internal | As named. Archive is a flag, not a move |
| `oa registry rescan` | internal | Rebuilds the global registry from the workspace root |
| `oa pane list` / `oa pane focus <pane>` / `oa layout save <name>` | query, internal | Pane and layout control |
| `oa inbox list [--kind <k>]` | query | The review inbox (A08) |
| `oa settings get <key>` / `oa settings set <key> <value>` | query, internal | Firm preference layer only. The legal layer is not settable (A10) |

## Rules

1. A matter workspace is a folder `<workspace root>/<matter id>/` with the layout in [component-map.md](../component-map.md). Creating one writes `manifest.json` and `matter.db` before the registry row.
2. The global registry is an index. `oa registry rescan` must rebuild it to an equal state from the folders alone.
3. A matter whose folder is missing at scan time is shown as `removed`. It is not recreated, and its registry row keeps the last known title and id.
4. Creating a matter for a client not yet in firm data (O01) shows a visible confirmation to the advocate (RQ-87). Creating one for an existing client does not.
5. The agent may write files only under `inbox/` and `harness/scratch/` of a matter it holds a grant for (RQ-88). Every other folder is written only by the kernel.
6. Every pane registers with the layout model and publishes a semantic model (B03). A pane that cannot answer a query about what it shows is not shippable.
7. Standard widgets expose AccessKit nodes with a role and a name (C-1). Canvas content is exposed through B03, not as accessibility nodes.
8. The review inbox (A08) is one queue across the matter. Every review item kind in the system appears in it.
9. Voice input (A12) can issue ordinary commands. It cannot issue a `human` class command.
10. Settings have two layers. The legal layer (rule packs, the verifier outcome mapping, blocker lists) is read only. Firm preferences patch on top and cannot override the legal layer.
11. First run (A15) must complete with no network: workspace root, fonts, OCR models and Chromium are bundled. A provider key may be entered later.
12. Long jobs (A11) show progress, and cancel reaches the runner (D07), not only the widget.
13. Text shaping (A13) handles Devanagari, mixed scripts and IME input in every text field and in our viewers.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| A-AC-01 | `oa matter create` produces the folder layout, a valid manifest, a `matter.db` with a ledger genesis event, and a registry row, in that order. Killing the process between any two steps leaves no registry row without a folder. | [AUTO] |
| A-AC-02 | Deleting the registry file and running `oa registry rescan` reproduces the same matter list, ids and titles. | [AUTO] |
| A-AC-03 | Removing a matter folder while the application runs marks the matter `removed` within one scan interval, closes its panes, and shows a notice. No error dialog loops. | [AUTO] |
| A-AC-04 | A harness connection writing to `evidence/`, `blobs/` or `drafts/` is refused with exit code 3 and a rejected-write audit row. | [AUTO] |
| A-AC-05 | Creating a matter with a new client raises a confirmation, and with an existing client does not. | [AUTO] |
| A-AC-06 | Every pane answers `oa pane state <pane> --json` with its visible anchors, selection and scroll position. | [AUTO] |
| A-AC-07 | Every standard widget has an AccessKit node with a non-empty role and name. | [AUTO] |
| A-AC-08 | A screen reader user can open a matter, read the review inbox and open an item. | [HUMAN] |
| A-AC-09 | A voice command mapped to a `human` class command is refused with a spoken and visible reason. | [AUTO] |
| A-AC-10 | `oa settings set` on a legal-layer key exits 3. | [AUTO] |
| A-AC-11 | First run completes with the network adapter disabled. | [AUTO] |
| A-AC-12 | Cancelling a long job stops the runner within 2 seconds and records `cancelled` for the job. | [AUTO] |
| A-AC-13 | Devanagari text with conjuncts renders correctly in the file browser, the inbox and the viewer. | [AUTO+HUMAN] (golden image plus review) |
| A-AC-14 | Sections 1 to 12 of architecture.md and advocate-workflow.md are identical after heading-level normalisation. | [AUTO] (docs check, X-22) |
| A-AC-15 | The workspace layout is usable at 125 and 150 percent display scaling. | [HUMAN] |

## Edge cases

- A workspace root on a network drive or a synced folder (OneDrive). Writes may be delayed or conflicted. The shell warns at `workspace init` and at open.
- Two copies of the application pointing at the same root. The second instance opens read only and says so.
- A matter folder copied by hand to another root. Its id is unchanged, so a rescan in the new root registers it. If the id already exists there, both are shown with a conflict marker and neither is merged.
- A matter id that collides with an existing folder name created by hand.
- Very long paths (over 260 characters) on Windows.
- A manifest that is valid JSON but names a newer standard version than the application supports. Open read only.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Registry corrupt | Rebuilt by rescan, with a notice. No matter is lost, because the folders are the truth. |
| `matter.db` fails to open | The matter shows `damaged`, opens read only for its blobs, and offers restore from backup (E06). |
| Disk full | The command fails with exit 5 and the reason. Nothing is half written (C01 transaction). |
| Kernel process down | Panes show `disconnected`, input is disabled, and the supervisor restarts the kernel. |
| Harness process down | The agent pane shows the harness as stopped. Every other pane keeps working. |

## Observable outcomes

- The advocate sees each matter as "Petitioner v. Respondent", the impugned judgment and court, the case number and CNR where known, and the stage. Missing values show as missing.
- The ledger has one event per matter lifecycle action, with actor and result.
- `oa matter list --json` is the same list the file browser shows.

## Open questions

- OQ-12 (harness session store retention) decides whether `harness/` is included in an export bundle.

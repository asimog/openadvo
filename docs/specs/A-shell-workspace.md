# A. Shell and workspace

Components: A01 to A18. Conventions, test kinds and status words are in the [README](README.md).

**Status:** matter workspaces, the registry, panes with three splits, the Inspector, the inbox, the command bar, galleries, and the contract-crate dependency (PH-03) work. Remaining: the screen (PH-04), the three-region frame (PH-05), the UI module (A18), GUI and visual tests, AccessKit, Devanagari shaping, first run.

## Purpose

The window the advocate works in, and the folders a matter lives in. The window draws a screen from query results and routes input. It holds no canonical state. Every action it offers is a control command (B) that the agent and the CLI can also issue. The workspace component creates, opens and lists matter workspaces on disk.

## Decisions implemented

P1, P9, RQ-25, RQ-37, RQ-38, RQ-68, RQ-70, RQ-73, RQ-87, RQ-88, C-1, X-10, X-12, X-22, M-01, M-02, M-03, M-04, M-16, PH-03, PH-04, PH-05, PH-10.

## Depends on

- B: the control protocol and the `oa-protocol` crate, which is the window's only route to the kernel.
- C: the kernel creates matters and owns the registry.
- D: the chat pane draws the harness's transcript and tool cards (D's GUI section).
- E: the registry file and `matter.db`.
- Windows 10 and later is the first platform. Paths may contain spaces and non-ASCII characters. One advocate per installation.

## Non-goals

- No global undo across panes.
- No erasure feature. Removing a matter folder is the erasure path (RQ-25).
- No offline promise for capture, research or verification (RQ-37). The window starts and shows local state with no network.
- The window does not parse documents. Viewers are group J.
- No status bar (PH-05). No workspace tabs (OQ-16).
- No third-party widget kit (PH-10).

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa workspace init <root>` | internal | Creates a workspace root and the global registry |
| `oa matter create --title <t> [--client <id>] [--from <pdf>]` | internal | Creates a matter workspace folder, manifest and registry row |
| `oa matter list [--include-removed]` | query | Lists matters from the registry, with folder presence |
| `oa matter open <id>` / `archive <id>` / `rename <id> <title>` | internal | As named. Archive is a flag, not a move |
| `oa registry rescan` | internal | Rebuilds the global registry from the workspace root |
| `oa screen show` | query | The window's current screen, as JSON |
| `oa screen set <screen.json>` | internal | Navigates the window to a screen |
| `oa inbox list [--kind <k>]` | query | The review inbox (A08) |
| `oa settings get <key>` / `oa settings set <key> <value>` | query, internal | Firm preference layer only. The legal layer is not settable (A10) |
| `oa-shell [--gallery <view>]` | separate executable | The window, or one view in its fixture states with no kernel |

## The screen

The screen is the one data shape the window draws (PH-04). It lives in `oa-protocol`, so `oa screen show` and the agent read the same thing the window draws.

```rust
pub struct Screen {
    pub matter: Option<MatterId>,   // the working context; None outside a matter
    pub left: Pane,                 // Open | Collapsed
    pub chat: Pane,                 // Open | Collapsed
    pub view: ViewArea,
    pub inspector: Option<Subject>, // the drawer over the view pane
}
pub enum Pane { Open, Collapsed }
pub struct ViewArea {
    pub pane: Pane,
    pub splits: Vec<Split>,         // 1 to 3
    pub focus: usize,
}
pub struct Split { pub page: Page, pub back: Vec<Page>, pub forward: Vec<Page> }
pub struct Page { pub view: ViewId, pub arg: Option<String> }
```

- At least one of `chat` and `view` is open.
- A saved layout is a screen stored per matter. Gallery fixtures are screens with fixture query results.
- Everything the window draws is a function of the screen and of query results.

## GUI

### The frame

```
+-----------+-------------------+------------------------------------------+
| Left pane | Chat pane         | View pane (1 to 3 splits)                |
| kernel ok | orchestrator      | table, viewer, editor, browser, files    |
| Matters   |                   |                                          |
| Sections  |                   |                    [Inspector drawer] -> |
| Inbox (3) |                   |                                          |
+-----------+-------------------+------------------------------------------+
```

| Region | Shows | The advocate can |
|---|---|---|
| Left pane (collapsible) | Header: kernel connection, the origin the kernel decided, health of supervised processes. Then matters, the open matter's sections, the review inbox with its Signal count | Open a matter or section, open the services view, collapse the pane |
| Chat pane | The orchestrator (spec D, A07) | Instruct, steer, cancel; collapse to give the view pane the width |
| View pane | One to three splits, each a view with back and forward history | Split, close, move focus, collapse to make the chat pane the rightmost pane |
| Inspector drawer | Raw JSON, ledger events, links out and in, producing command, origin and actor | Copy the raw record, follow a link, close with Esc |
| Command bar | Commands, matters and records, ranked by frecency | Run any registered command, open any record |

### Views this group owns

| View | Shows | The advocate can |
|---|---|---|
| Matters (A04) | Every matter: title, client, stage, archived and removed state, folder presence | Open, create, rename, archive, show removed |
| Matter overview | Identity (Petitioner v. Respondent, impugned judgment, case number, CNR, stage), missing values marked missing, folder tree with counts | Jump to any section |
| Files | The matter folder tree with record counts | Open a file in its viewer |
| Review inbox (A08) | One queue in Signal and Noise | `j`, `k`, Enter, `e` |
| Jobs (A11) | Every long job with progress, status and cancel | Cancel a running job |
| Settings (A10) | Firm layer, editable; legal layer, read only; each value with its source | Change firm preferences |
| Services | Every supervised process, its health and restarts | Inspect a process |
| Galleries (A17) | Every view in its six fixture states, without a kernel | Review visuals and accessibility |

### The UI module (A18)

One internal module, `oa-shell/src/ui/`, that every view draws through (PH-10). It knows nothing about matters or commands.

| Part | Holds |
|---|---|
| `theme` | Tokens: neutral ramp, one accent, the tone colours, the four honest-label treatments (validator outcome, quick check, advisory score, attestation), spacing scale, radius, type scale, an Indic-capable UI font and a document serif. `apply(ctx)`. |
| `table` | The table widget on virtualised rows (`egui_extras::TableBuilder`): states, banner, keyboard selection, first cell opens the Inspector. |
| `widgets` | Badge, status chip, key-value grid, section header, empty state with an action, banner, toolbar button. |
| `human` | The only way to draw a `human` command control: names the decision, no default focus, no shortcut. |
| `frame` | The three regions, collapsing and splits, drawn from the screen. |

View builders stay egui-free: they turn query results into tables and lines. A view's action panel returns the `Request` the advocate chose, and the window sends it.

## Rules

1. A matter workspace is a folder `<workspace root>/<matter id>/` with the layout in [component-map.md](../component-map.md). Creating one writes `manifest.json` and `matter.db` before the registry row.
2. The global registry is an index. `oa registry rescan` must rebuild it to an equal state from the folders alone.
3. A matter whose folder is missing at scan time is `removed`. It is not recreated, and its row keeps the last known title and id.
4. Creating a matter for a client not yet in firm data shows a visible confirmation (RQ-87). An existing client does not.
5. The agent may write files only under `inbox/` and `harness/scratch/` of a matter it holds a grant for (RQ-88). Every other folder is written only by the kernel.
6. The window depends on `oa-protocol` and never on `oa-kernel`, `oa-store` or `rusqlite` (PH-03).
7. The window draws a screen (PH-04). `oa screen show` returns what is drawn.
8. The frame has three regions and no status bar (PH-05). Opening a matter scopes the left pane sections, the chat pane and new view splits to it. The inbox, search and settings stay reachable with no matter open.
9. Standard widgets expose AccessKit nodes with a role and a name (C-1). Canvas content is exposed through the screen and B03, not as accessibility nodes.
10. The review inbox is one queue across the matter. Every review item kind in the system appears in it. Signal is what needs a decision or blocks a gate; everything else is Noise. The rule is one tested function.
11. Voice input (A12) can issue ordinary commands, never a `human` command.
12. Settings have two layers. The legal layer is read only. Firm preferences cannot override it.
13. First run (A15) completes with no network: workspace root, fonts, OCR models and Chromium are bundled. A provider key may be entered later.
14. Cancelling a long job reaches the runner (D07), not only the widget.
15. Text shaping (A13) handles Devanagari, mixed scripts and IME input in every text field and in our viewers.
16. Every item in every view opens the Inspector with one action, and the Inspector reads only through queries.
17. Every `query` command has a registered view (parity).
18. The view pane holds at least three splits at 1920 pixels, with history per split, and a saved layout per matter.
19. The command bar ranks by frecency and only issues registered commands. Free text that matches no command is a search, never an action.
20. Every view has a gallery in six fixture states, runnable with `oa-shell --gallery <view>` and no kernel.
21. When the window started the kernel, closing the window asks the kernel to shut down over the pipe, which checkpoints running jobs. It kills the process only if shutdown does not finish in 10 seconds.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| A-AC-01 | `oa matter create` produces the folder layout, a valid manifest, a `matter.db` with a ledger genesis event, and a registry row, in that order. A kill between any two steps leaves no registry row without a folder. | [AUTO] | done |
| A-AC-02 | Deleting the registry and running `oa registry rescan` reproduces the same matter list, ids and titles. | [AUTO] | done |
| A-AC-03 | Removing a matter folder while the application runs marks it `removed` within one scan interval, closes its splits and shows a notice. | [AUTO] | done |
| A-AC-04 | A harness connection writing to `evidence/`, `blobs/` or `drafts/` is refused with exit 3 and a rejected-write audit row. | [AUTO] | done |
| A-AC-05 | A matter with a new client raises a confirmation; an existing client does not. | [AUTO] | done |
| A-AC-06 | `oa screen show --json` returns the open matter, pane states, each split's view and its visible anchors and selection. | [AUTO] | remaining |
| A-AC-07 | Every standard widget has an AccessKit node with a non-empty role and name. | [AUTO] | remaining |
| A-AC-08 | A screen reader user can open a matter, read the inbox and open an item. | [HUMAN] | remaining |
| A-AC-09 | A voice command mapped to a `human` command is refused with a spoken and visible reason. | [AUTO] | remaining |
| A-AC-10 | `oa settings set` on a legal-layer key exits 3. | [AUTO] | done |
| A-AC-11 | First run completes with the network adapter disabled. | [AUTO] | remaining |
| A-AC-12 | Cancelling a long job stops the runner within 2 seconds and records `cancelled`. | [AUTO] | done |
| A-AC-13 | Devanagari with conjuncts renders correctly in the files view, the inbox and the viewer. | [AUTO+HUMAN] | remaining |
| A-AC-14 | The workflow exists in advocate-workflow.md only; no other doc carries a copy of its sections. | [AUTO] | done |
| A-AC-15 | The frame is usable at 125 and 150 percent display scaling. | [HUMAN] | remaining |
| A-AC-16 | Every `query` command has a registered view. | [AUTO] | done |
| A-AC-17 | Every item in every view opens the Inspector, which shows the raw record, ledger events, links out, backlinks and producing command. | [AUTO] | done |
| A-AC-18 | At 1920 pixels the view pane holds three splits; back and forward restore the previous page; a saved layout reopens with its matter. | [AUTO] | done |
| A-AC-19 | The inbox puts a blocking item in Signal and an informational one in Noise, and works end to end with `j`, `k`, Enter and `e`. | [AUTO] | done |
| A-AC-20 | The left pane header shows a lost kernel connection within 2 seconds, and the origin the kernel decided for this window. | [AUTO] | done (detection); remaining (header placement) |
| A-AC-21 | Every `human` command control is drawn by the UI module's human control. A repo check finds no other construction of a human-class request in the window. | [AUTO+HUMAN] | remaining |
| A-AC-22 | Every view renders in every gallery state without a kernel. | [AUTO] | done |
| A-AC-23 | An advocate can find any record and inspect its provenance without help. | [HUMAN] | remaining |
| A-AC-24 | `cargo tree -p oa-shell` contains no `oa-kernel`, `oa-store` or `rusqlite`. | [AUTO] | done |
| A-AC-25 | The screen round-trips through JSON unchanged, and a saved layout is a stored screen. | [AUTO] | remaining |
| A-AC-26 | Closing the window when it started the kernel shuts the kernel down over the pipe; a running job is checkpointed, not killed. | [AUTO] | remaining |

### GUI tests

| ID | Behaviour | Status |
|---|---|---|
| A-GUI-01 | Collapsing the view pane makes the chat pane the rightmost pane; expanding restores the splits and their pages. | remaining |
| A-GUI-02 | Collapsing the left pane gives its width to the chat and view panes; the inbox count stays reachable from the command bar. | remaining |
| A-GUI-03 | Chat and view cannot both be collapsed: collapsing the last open one is refused. | remaining |
| A-GUI-04 | Opening a matter from the left pane scopes its sections, the chat pane and a new split to that matter. | remaining |
| A-GUI-05 | `j`, `k`, Enter and `e` operate the inbox; Enter opens the item in the view pane. | remaining |
| A-GUI-06 | The command bar opens with Ctrl+K, ranks by frecency, and free text with no command runs a search. | remaining |
| A-GUI-07 | Clicking or pressing Enter on any table row opens the Inspector; Esc closes it. | remaining |
| A-GUI-08 | A view's action panel returns the expected `Request` for each control, with no kernel. | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| A-VIS-01 | The frame with all three regions open, at 1920 and 1366 pixels. | remaining |
| A-VIS-02 | The frame with the view pane collapsed, and with the left pane collapsed. | remaining |
| A-VIS-03 | Every view this group owns in its six gallery states. | remaining |
| A-VIS-04 | The four honest-label treatments side by side; none shares a colour, shape or word. | remaining |
| A-VIS-05 | Devanagari and mixed-script text in a table, the inbox and a text field. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| A-E2E-01 | Start the window with no kernel serving: the window starts the kernel, connects as `ui`, creates a matter, and the matter appears in the left pane. | remaining |
| A-E2E-02 | Remove a matter folder while the window is open: the matter shows `removed` and its splits close. | remaining |

## Edge cases

- A workspace root on a network drive or a synced folder. The window warns at `workspace init` and at open.
- Two windows pointing at the same application data folder. Both connect to the one kernel (PH-02).
- A matter folder copied to another root. Its id is unchanged, so a rescan registers it. If the id already exists there, both are shown with a conflict marker and neither is merged.
- Very long paths (over 260 characters).
- A manifest naming a newer standard version than the application supports. Open read only.
- A saved screen naming a view or record that no longer exists. That split opens on the matter overview with a notice.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Registry corrupt | Rebuilt by rescan, with a notice. No matter is lost; the folders are the truth. |
| `matter.db` fails to open | The matter shows `damaged`, opens read only for its blobs, and offers restore from backup (E06). |
| Disk full | The command fails with exit 5 and the reason. Nothing is half written. |
| Kernel down | The left pane header shows `disconnected`, input is disabled, and the kernel is restarted. |
| Harness down | The chat pane shows the harness as stopped. Every other view keeps working. |

## Open questions

- OQ-12 decides whether `harness/` is included in an export bundle.
- OQ-16: the visual design of the window.

# B. Control surface and the `oa` CLI

Components: B01 to B08. See [README](README.md) for tags and conventions.

## Purpose

The one way anything drives the application. The agent, the tests, scripts and a human at a terminal all issue the same typed commands and queries over one protocol. The panes are painted, so they publish what they show as typed state. This group is the product's foundation under P1: it is built second, and every later capability is born as a set of control commands.

## Decisions implemented

P1, RQ-02, RQ-73, RQ-74, RQ-75, C-1, X-19, P9.

## Depends on

- C (the kernel serves the protocol and commits).
- D04 (the tool registry is this registry seen from the harness).
- D11 (policy sits in front of every command).
- H-11: nothing in D can run before B01 exists.

## Assumptions

- The kernel process hosts the protocol endpoint. The window, the harness and the CLI are clients.
- Local only. A named pipe on Windows, a Unix domain socket elsewhere. No TCP port.

## Non-goals

- No HTTP API (RQ-74).
- The CLI holds no logic of its own. It parses arguments, sends one request and prints the response.
- The viewport raster (B04) is a fallback for vision models and a visual test fixture. It is not the agent's main way of seeing.

## CLI

The CLI is `oa`. Every group's spec lists its own subcommands. This group adds:

| Command | Class | What it does |
|---|---|---|
| `oa schema [--command <name>]` | query | Prints the protocol schema, or one command's request and response schema |
| `oa call <command> --input <json>` | as the command | Issues any command by name. The generic form every subcommand maps to |
| `oa pane state <pane>` | query | The pane's semantic model: visible anchors, selection, scroll, page, paragraph, visible text |
| `oa pane snapshot <pane> --out <dir>` | query | Raster plus text plus anchor rectangles (B04) |
| `oa watch [--topic <t>]` | query | Streams outbox events (C15) as JSON lines |
| `oa audit commands [--since <t>]` | query | Accepted and refused commands with actor and result (B08) |
| `oa browser ...` | see M | CDP-backed browser commands (B07) |
| `oa desktop ...` | see N | Desktop driver commands (B06) |

## GUI

| View | Shows | The advocate or engineer can |
|---|---|---|
| Command console | A form for any command, generated from the protocol schema, with the JSON request and the JSON response | Issue any command, exactly as `oa call` would |
| Command stream | Every command and refusal as it happens: name, class, origin decided by the kernel, idempotency key, result | Filter by origin, class or matter; open any entry in the Inspector |
| Pane state | The semantic model of any pane (B03): visible anchors, selection, scroll, page | Compare what a pane shows with what the agent is told it shows |
| Audit | Accepted commands and refused writes (B08) | Export as JSON lines |

## Rules

1. One schema defines every command and query: name, class, request type, response type, error codes, idempotency requirement. The schema is generated from Rust types and checked into the repository.
2. Every command is also a registered tool (B05, D04) with the same name, schema and class. There is no command the UI can issue that the registry does not hold, and the reverse.
3. Every connection carries an origin: `ui`, `cli`, `harness`, `test`. The origin is set by the kernel from the connecting process identity, not claimed by the client.
4. `human` class commands are refused on `harness` connections. On `cli` connections they require an OS user-presence prompt raised by the kernel process (H-09). On `ui` connections they require a distinct UI gesture.
5. `internal` and `external` commands require an idempotency key. A repeated key returns the first result and performs nothing.
6. Every pane publishes a semantic model (B03) with stable anchor ids for what it shows. Anchors in a pane model use the same anchor form as the kernel.
7. The agent's order of surfaces is fixed: typed state through B01 first, accessibility (B06 against other applications, AccessKit for our widgets) second, pixels (B04, N02) last.
8. Every accepted command and every refusal lands in the ledger or the rejected-write audit table with actor, origin, command, idempotency key and result (B08).
9. Errors are typed. Every error has a code from the error catalogue, a message and, where relevant, the review item it created.
10. The protocol is versioned. A client with an incompatible major version is refused at handshake with a clear error.
11. **One schema, two front ends.** The command console builds its forms from the same schema `oa schema` prints. A field the schema does not define cannot be sent.
12. **The stream shows the decided origin.** The command stream shows the origin the kernel recorded, not the one the client claimed.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| B-AC-01 | The set of command names in the schema equals the set of tool names in the registry, and the set of actions the UI binds. | [AUTO] |
| B-AC-02 | Every command in the schema has a CLI path (`oa call` at minimum) and a schema test that round-trips its request and response. | [AUTO] |
| B-AC-03 | A `human` class command sent on a harness connection is refused with exit 3 and an audit row. | [AUTO] |
| B-AC-04 | A `human` class command from the CLI with no user-presence confirmation is refused. | [AUTO] (prompt stubbed to deny) |
| B-AC-05 | A client that claims origin `ui` from a harness process is recorded with origin `harness`. | [AUTO] |
| B-AC-06 | Repeating an `internal` command with the same idempotency key returns the same result and produces one ledger event. | [AUTO] |
| B-AC-07 | `oa pane state viewer` on a PDF at page 12 returns page 12, the visible anchors with rectangles, and the visible text. | [AUTO] |
| B-AC-08 | `oa pane snapshot` output's anchor rectangles overlay the raster within one device pixel. | [AUTO] |
| B-AC-09 | `--json` output on every command parses as JSON lines with no extra stdout text. | [AUTO] |
| B-AC-10 | A recorded session replayed through the protocol reproduces the same pane states and ledger events (the swap drill harness, RQ-07). | [AUTO] |
| B-AC-11 | An engineer can diagnose a broken pane using only `oa pane state`, `oa watch` and `oa audit`. | [HUMAN] |
| B-AC-12 | The command console can issue every command in the registry from a form generated from the schema. | [AUTO] |
| B-AC-13 | The command stream shows a harness connection that claimed `cli` as `harness`. | [AUTO] |
| B-AC-14 | Every pane's semantic model is viewable in its Inspector. | [AUTO] |

## Edge cases

- A command that arrives while the matter it names is being removed. Refused with `matter_removed`.
- A very large query result (a 1,000 page document's text). Paged with a cursor. No response exceeds the configured size.
- Two clients issuing conflicting `internal` commands. The kernel serialises. The loser receives a typed conflict, not a silent overwrite.
- Clock skew between processes. Ordering comes from the kernel's sequence, never from client timestamps.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Pipe unavailable | The CLI exits 5 with `kernel_unavailable`. |
| Schema mismatch | Refused at handshake with both versions named. |
| A pane does not answer a query in time | Typed `pane_unresponsive` error. The kernel does not guess the pane's state. |

## Observable outcomes

- `oa watch` shows every event a pane would react to.
- The audit view shows every refused command with its reason, so a misconfigured agent is visible.

## Open questions

None local.

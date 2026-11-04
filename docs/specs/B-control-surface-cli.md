# B. Control surface and the `oa` CLI

Components: B01 to B08. Conventions, test kinds and status words are in the [README](README.md).

**Status:** the typed command registry, the named pipe, the harness job check, idempotency, JSON output and the command audit work. Remaining: kernel-decided `ui` and `capture` origins (PH-01), one kernel per folder (PH-02), the contract crate (PH-03), the Windows Hello presence prompt, the screen query, snapshot, the command console and stream views.

## Purpose

The one way anything drives the application. The agent, tests, scripts and a person at a terminal issue the same typed commands over one protocol. The window publishes what it shows as typed state. Every capability is born as a set of control commands.

## Decisions implemented

P1, P9, RQ-02, RQ-73, RQ-74, RQ-75, C-1, X-19, PH-01, PH-02, PH-03.

## Depends on

- C: the kernel serves the protocol and commits.
- D04: the tool registry is this registry seen from the harness. D11: policy sits in front of every command.
- H-09: an OS user-presence prompt (Windows Hello or the credential UI) that a process cannot satisfy on its own.
- H-11: nothing in D runs before the protocol exists.

## Non-goals

- No HTTP API and no TCP port (RQ-74).
- The CLI holds no logic of its own. It parses arguments, sends one request and prints the reply.
- The viewport raster (B04) is a fallback for vision models and a test fixture, not the agent's main way of seeing.

## The contract crate

`oa-protocol` holds the whole contract (PH-03): the `Request` enum and its input types, `CommandClass`, the list of query names, `Reply`, `OaError` codes, `Hello` and `Welcome`, the `Screen` (spec A), and the frame encoding. It depends only on `oa-types` and serde. The kernel, the client library, the CLI and the window depend on it. The window and the client library do not depend on the kernel.

## Origin

The kernel decides each connection's origin from the connecting process (PH-01):

| Connecting process | Origin recorded |
|---|---|
| Any process in the harness job | `harness`, whatever it claims |
| The installed `oa-shell` executable beside the kernel's executable, claiming `ui` | `ui` |
| Anything else | `cli`, whatever it claims |
| The browser supervisor inside the kernel process | `capture` (never over the pipe) |
| A test kernel built with test hooks | `test` (never over the pipe in a production build) |

The kernel learns the client's process id from the pipe (`GetNamedPipeClientProcessId`), checks job membership against its own harness job handle, and reads the process image path. The pipe is created first-instance only and rejects remote clients. The harness job is created with kill-on-close.

## CLI

Every group lists its own subcommands. This group adds:

| Command | Class | What it does |
|---|---|---|
| `oa schema [--command <name>]` | query | The protocol schema, or one command's request and response schema |
| `oa call <command> --input <json>` | as the command | Issues any command by name |
| `oa screen show` | query | The window's screen (spec A) |
| `oa pane snapshot <split> --out <dir>` | query | Raster plus text plus anchor rectangles (B04) |
| `oa watch [--topic <t>]` | query | Streams outbox events (C15) as JSON lines |
| `oa audit commands [--since <t>]` | query | Accepted and refused commands with actor and result (B08) |
| `oa kernel serve` | internal | Runs the kernel for this application data folder; refuses if one is already serving |
| `oa kernel shutdown` | internal | Asks the serving kernel to checkpoint jobs and stop |

`oa` connects to the serving kernel when one answers on the pipe. With none serving, it runs an in-process kernel for that one command (PH-02). `--connect` requires a serving kernel and fails with exit 5 if none answers.

## GUI

| View | Shows | The advocate or engineer can |
|---|---|---|
| Command console | A form for any command, generated from the schema, with the JSON request and reply | Issue any command, exactly as `oa call` would |
| Command stream | Every command and refusal as it happens: name, class, decided origin, idempotency key, result | Filter by origin, class or matter; open any entry in the Inspector |
| Audit | Accepted commands and refused writes | Export as JSON lines |

## Rules

1. One schema defines every command: name, class, request type, reply type, error codes, idempotency requirement. It is generated from the Rust types in `oa-protocol` and checked in.
2. Every command is also a registered tool with the same name, schema and class. Nothing the window can issue is missing from the registry, and the reverse.
3. The kernel decides the origin from the connecting process, as in the table above. A client's claim never raises its origin.
4. `human` commands are refused on `harness`. On `cli` they need an OS user-presence prompt raised by the kernel process (H-09). On `ui` they need the UI module's human control.
5. `internal` and `external` commands need an idempotency key. A repeated key returns the first result and does nothing.
6. One kernel serves one application data folder. A second `oa kernel serve` on the same folder exits 3. `oa` uses the serving kernel when there is one.
7. The window publishes its screen (spec A). Anchors in it use the kernel's anchor form.
8. The agent's order of surfaces is fixed: typed state first, accessibility second, pixels last.
9. Every accepted command and every refusal lands in the ledger or the rejected-write audit with actor, origin, command, idempotency key and result.
10. Errors are typed: a code from the catalogue, a message, and the review item created where relevant.
11. The protocol is versioned. An incompatible client is refused at handshake with both versions named.
12. The command console builds its forms from the schema. A field the schema does not define cannot be sent.
13. The command stream shows the origin the kernel recorded, not the claim.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| B-AC-01 | The command names in the schema equal the tool names in the registry and the actions the window binds. | [AUTO] | done |
| B-AC-02 | Every command has a CLI path and a schema test that round-trips its request and reply. | [AUTO] | done |
| B-AC-03 | A `human` command on a harness connection is refused with exit 3 and an audit row. | [AUTO] | done |
| B-AC-04 | A `human` command from the CLI with no user-presence confirmation is refused, and the production presence prompt is the Windows user-presence API. | [AUTO] | done (refusal); remaining (Windows Hello adapter) |
| B-AC-05 | A client that claims `ui` from a harness process is recorded as `harness`. | [AUTO] | done |
| B-AC-06 | Repeating an `internal` command with the same key returns the same result and produces one ledger event. | [AUTO] | done |
| B-AC-07 | `oa screen show` with a PDF at page 12 in a split returns page 12, the visible anchors with rectangles, and the visible text. | [AUTO] | remaining |
| B-AC-08 | `oa pane snapshot` anchor rectangles overlay the raster within one device pixel. | [AUTO] | done |
| B-AC-09 | `--json` output on every command parses as JSON lines with no extra stdout. | [AUTO] | done |
| B-AC-10 | A recorded session replayed through the protocol reproduces the same screens and ledger events. | [AUTO] | remaining |
| B-AC-11 | An engineer can diagnose a broken view using only `oa screen show`, `oa watch` and `oa audit`. | [HUMAN] | remaining |
| B-AC-12 | The command console issues every registered command from a form generated from the schema. | [AUTO] | remaining |
| B-AC-13 | The command stream shows a harness connection that claimed `cli` as `harness`. | [AUTO] | remaining |
| B-AC-14 | A pipe client claiming `capture` or `test` is recorded as `cli`, and `capture.commit` from it is refused. | [AUTO] | remaining |
| B-AC-15 | A pipe client claiming `ui` whose image is not the installed `oa-shell` is recorded as `cli`, and an approval from it needs the presence prompt. | [AUTO] | remaining |
| B-AC-16 | A second `oa kernel serve` on the same folder exits 3; `oa` with a kernel serving goes through the pipe. | [AUTO] | remaining |
| B-AC-17 | The same script run in-process and over the pipe gives equal replies and equal ledger bodies. | [AUTO] | remaining |
| B-AC-18 | A process started inside the harness job cannot break away, and dies when the job closes. | [AUTO] | remaining |

### GUI tests

| ID | Behaviour | Status |
|---|---|---|
| B-GUI-01 | The command console form for a command shows exactly the schema's fields and issues the matching `Request`. | remaining |
| B-GUI-02 | The command stream filters by origin and class, and each row opens the Inspector. | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| B-VIS-01 | Command console, command stream and audit in their six gallery states. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| B-E2E-01 | A script connects as a fake `ui`, tries `approval.grant` and `capture.commit`; both are refused or prompted, and the audit shows `cli`. | remaining |
| B-E2E-02 | With the window open, `oa matter create` from a terminal goes through the window's kernel, and the new matter appears in the window. | remaining |

## Edge cases

- A command for a matter that is being removed is refused with `matter_removed`.
- A very large query result is paged with a cursor. No reply exceeds the configured size.
- Two clients issue conflicting `internal` commands. The kernel serialises, and the loser gets a typed conflict.
- Clock skew between processes. Order comes from the kernel's sequence.
- The installed `oa-shell` is replaced by another file at the same path. The image check passes; a signature check on the installed build (Q) closes this.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Pipe unavailable with `--connect` | Exit 5, `kernel_unavailable`. |
| Schema mismatch | Refused at handshake with both versions named. |
| The window does not answer a screen query in time | Typed `pane_unresponsive`. The kernel does not guess. |
| The presence prompt is unavailable | The `human` command is refused with exit 5 and the reason. |

## Open questions

None local.

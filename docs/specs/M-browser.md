# M. Browser

Components: M01 to M10. Conventions, test kinds and status words are in the [README](README.md).

**Status:** profiles, one supervised process per profile, the egress policy with the filing refusal, untrusted page extraction, human-only attachment, download interception, the egress log and the browser views work against a stand-in profile process (plain HTTP, no rendering). Remaining: vendored Chromium (CEF) with contract tests, TLS and real rendering, reparenting into the view pane, real screenshots, keychain credentials, capture exclusion, the run-end detach from D.

## Purpose

One Chromium binary serving three uses: the advocate's visible browser in the view pane, the filing profile the agent operates under the advocate's confirmations, and the agent's own headless browser for other tool tasks. Each profile is its own process. Cookies, logins and crashes never cross between them.

## Decisions implemented

RQ-80, RQ-81, H-08, H-15, P9, PH-06.

## Depends on

- D15: supervision of each browser process. F06: download interception and hashing.
- B07: CDP control. E07: credentials in the OS keychain.
- A: the browser is a view pane split.
- Q08 step 5: vendored Chromium.

## Vendored dependencies

| Dependency | Runs as | Interface |
|---|---|---|
| Chromium through CEF | `oa-browser-profile`, one process per profile | Navigate, DOM through CDP, downloads, screenshots, a child window to reparent |
| `agent-browser` | Driver for the `agent` profile | The same binary, headless |

## Non-goals

- The agent's browser never files, never holds the advocate's cookies, and never opens the e-filing portal.
- No CAPTCHA solving in any profile.

## Profiles

| Profile | Process | Visible | Used for | Egress |
|---|---|---|---|---|
| `matter:<id>` | One per open matter | Yes, in a view pane split | The advocate's browsing and portal capture | Allow list per matter plus the advocate's own navigation |
| `filing` | One | Yes, in a view pane split | e-filing execution only | The e-filing portal only |
| `agent` | One, fresh per run | No | Agent tool tasks on public pages | Deny by default, allow list for public legal sources |

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa browser open <url> [--profile <p>]` | external | Navigates in a profile |
| `oa browser state [--profile <p>]` | query | Tabs, URL, title, load state |
| `oa browser dom <selector> [--profile <p>]` | query | DOM content through CDP |
| `oa browser extract [--profile <p>]` | query | Main text, links and tables with URL and time, labelled untrusted |
| `oa browser screenshot [--profile <p>] --out <png>` | query | Only when the DOM has no answer |
| `oa browser attach agent --to matter:<id>` | human | Lets the agent drive the visible browser for this matter, revocable |
| `oa browser detach agent` | internal | Revokes the attachment |
| `oa browser attachments` | query | Current attachments |
| `oa browser downloads` | query | Intercepted downloads with hashes and capture records |
| `oa browser egress [--profile <p>]` | query | Every connection, allowed or refused |

## GUI

| View | Shows | The advocate can |
|---|---|---|
| Browser | The page in a view pane split, the profile name, and a banner while the agent is attached | Browse; attach or detach the agent (human control) |
| Downloads | Every intercepted download with hash and capture record | Open the evidence entry |
| Egress log | Every connection per profile, allowed or refused | Filter by profile |

## Rules

1. One binary, one process per profile (RQ-80). A crash in one profile does not affect the others.
2. The `agent` profile is fresh for each run and discarded after. It holds no credentials.
3. The `agent` profile refuses the e-filing portal and any filing destination, by allow list and by a hard check in the supervisor (H-15).
4. Attaching the agent to a visible profile is a `human` command, shown while active, and revocable (RQ-81). A run's end detaches it.
5. Every download in every profile is intercepted, hashed before it is opened, and routed to the matter inbox with a capture record (origin `capture`).
6. Extracted page text is labelled untrusted and carries URL and time.
7. Egress is deny by default for the `agent` profile and any process parsing documents. A missing flag fails safe.
8. Credentials are in the OS keychain. Autofill is for visible profiles only.
9. DevTools are off in the `filing` profile.
10. Our overlays never appear in a screenshot or a capture (M10).
11. The visible browser is reparented into its split and follows position, size, DPI and focus (H-08). When reparenting fails, it is an owned window and the split says so.
12. Production runs Chromium. The stand-in profile process exists only in tests.

## Tests

### Acceptance criteria

| ID | Criterion | Check | Status |
|---|---|---|---|
| M-AC-01 | Killing the `agent` process leaves the visible and filing profiles running. | [AUTO] | remaining (Chromium) |
| M-AC-02 | The `agent` profile has no cookies from `matter:<id>` after the advocate logs in there. | [AUTO] | remaining (Chromium) |
| M-AC-03 | Navigating the `agent` profile to the e-filing portal host is refused. | [AUTO] | done |
| M-AC-04 | `oa browser attach` from a harness connection is refused. | [AUTO] | done |
| M-AC-05 | A download in any profile appears in the inbox with a hash equal to the bytes on disk. | [AUTO] | remaining (Chromium) |
| M-AC-06 | Extracted text carries an untrusted label, URL and time. | [AUTO] | done |
| M-AC-07 | With the allow list empty, the `agent` profile makes no network request. | [AUTO] | done |
| M-AC-08 | DevTools cannot be opened in the `filing` profile. | [AUTO] | remaining (Chromium) |
| M-AC-09 | The embedded browser behaves like a normal browser for portal use, including file pickers and print. | [HUMAN] | remaining |
| M-AC-10 | The egress log shows every connection of the agent profile, refused ones marked. | [AUTO] | done |
| M-AC-11 | The visible browser in a split has no taskbar entry and follows move, resize, minimise and a DPI change, or falls back with a notice. | [AUTO+HUMAN] | remaining |
| M-AC-12 | A screenshot taken while the Inspector drawer is open contains no part of it. | [AUTO] | remaining |
| M-AC-13 | A saved portal login is read from the keychain into a visible profile and never offered to `agent`. | [AUTO] | remaining |

### Contract tests

| ID | Contract | Status |
|---|---|---|
| M-CT-01 | The vendored Chromium loads an HTTPS page, reports the final URL after redirects, and exposes the DOM through CDP. | remaining |
| M-CT-02 | A download is delivered to the interceptor before any viewer opens it. | remaining |
| M-CT-03 | Two profiles share no cookie or storage. | remaining |
| M-CT-04 | The child window can be reparented into a winit window on Windows at 100, 125 and 150 percent scaling. | remaining |

### GUI tests

| ID | Behaviour | Status |
|---|---|---|
| M-GUI-01 | Attach draws through the human control naming the matter; detach is one action. | remaining |
| M-GUI-02 | While the agent is attached, the browser split shows the banner, and the chat pane shows the run driving it. | remaining |

### Visual tests

| ID | Snapshot | Status |
|---|---|---|
| M-VIS-01 | Browser (profile state, attached banner, fallback notice), downloads and egress log in their six gallery states. | remaining |

### End-to-end tests

| ID | Flow | Status |
|---|---|---|
| M-E2E-01 | Open a recorded portal over HTTPS in a matter profile, download an order, see it in the inbox with its capture record; the agent's headless profile, told by page text to open the e-filing portal, is refused. | remaining |

## Edge cases

- A pop-up window for a download stays in the same profile and its download is intercepted.
- A PDF the portal shows in Chromium's viewer is saved through the interceptor with the same capture record.
- A site that detects automation: the agent stops and hands the task to the advocate.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Chromium fails to start | The browser split shows the error. Capture and filing report `dependency_unavailable`. |
| Reparenting fails | An owned top-level window, with a notice in the split. |

## Open questions

None.

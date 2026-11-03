# M. Browser

Components: M01 to M10. See [README](README.md) for tags and conventions.

## Purpose

One Chromium binary serving three uses: the advocate's visible browser inside our pane, the filing profile the agent operates under the advocate's confirmations, and the agent's own headless browser for tool tasks other than filing. Each runs as its own process with its own profile. Cookies, logins and crashes never cross between them.

## Decisions implemented

RQ-80, RQ-81, H-08, H-15.

## Depends on

- D15 (supervision of each browser process).
- F06 (download interception and hashing).
- B07 (CDP control).
- E07 (credentials in the OS keychain).

## Assumptions

- CEF embeds Chromium as a child window inside a winit window on Windows.
- `agent-browser` is vendored and pointed at the same binary for the agent's browser.

## Non-goals

- The agent's browser never files, never holds the advocate's cookies, and never opens the e-filing portal.
- No CAPTCHA solving in any profile.

## Profiles

| Profile | Process | Visible | Used for | Egress |
|---|---|---|---|---|
| `matter:<id>` | One per open matter | Yes, in our pane | The advocate's browsing and portal capture | Allow list per matter plus the advocate's own navigation |
| `filing` | One | Yes, in our pane | e-filing execution only | The e-filing portal allow list only |
| `agent` | One, throwaway per run | No, headless | Agent tool tasks: public pages, lookups, reading | Deny by default, allow list for public legal sources |

## CLI

| Command | Class | What it does |
|---|---|---|
| `oa browser open <url> [--profile <p>]` | external | Navigates in a profile |
| `oa browser state [--profile <p>]` | query | Tabs, URL, title, load state |
| `oa browser dom <selector> [--profile <p>]` | query | DOM content through CDP |
| `oa browser extract [--profile <p>]` | query | Main text, links and tables, with URL and time, labelled untrusted |
| `oa browser screenshot [--profile <p>] --out <png>` | query | Only when the DOM has no answer |
| `oa browser attach agent --to matter:<id>` | human | Lets the agent drive the visible browser for this matter, revocable |
| `oa browser detach agent` | internal | Revokes the attachment |
| `oa browser downloads` | query | Intercepted downloads with hashes and capture records |

## Rules

1. One binary on disk, one process per profile (RQ-80). A crash in one profile does not affect the others.
2. The `agent` profile is created fresh for each run and discarded after. It has no stored credentials.
3. The `agent` profile refuses navigation to the e-filing portal and any filing destination, by allow list and by a hard check in the supervisor (H-15).
4. Attaching the agent to a visible profile is a `human` command, shown in the pane while active, and revocable at any time (RQ-81).
5. Every download in every profile is intercepted, hashed before it is opened, and routed to the matter inbox with a capture record (M04, F06).
6. Page text extracted for the agent is labelled untrusted and carries the URL and time (M07).
7. Egress is deny by default for the `agent` profile and for any process parsing documents. A missing flag fails safe (M09).
8. Credentials are in the OS keychain. Autofill is available to visible profiles only (M08).
9. DevTools are off in the `filing` profile (M05).
10. Capture exclusion: our overlays never appear in a screenshot or a capture (M10).
11. The visible browser is reparented into our pane and follows its position, size, DPI and focus (M02, H-08).

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| M-AC-01 | Killing the `agent` process leaves the visible and filing profiles running. | [AUTO] |
| M-AC-02 | The `agent` profile has no cookies from `matter:<id>` after the advocate logs in there. | [AUTO] |
| M-AC-03 | Navigating the `agent` profile to the e-filing portal host is refused. | [AUTO] |
| M-AC-04 | `oa browser attach` from a harness connection is refused. | [AUTO] |
| M-AC-05 | A download in any profile appears in the inbox with a hash equal to the bytes on disk. | [AUTO] |
| M-AC-06 | Extracted text carries an untrusted label, URL and time. | [AUTO] |
| M-AC-07 | With the allow list empty, the `agent` profile makes no network request. | [AUTO] (egress test) |
| M-AC-08 | DevTools cannot be opened in the `filing` profile. | [AUTO] |
| M-AC-09 | The embedded browser behaves like a normal browser for portal use, including file pickers and print. | [HUMAN] |

## Edge cases

- A portal that opens a pop-up window for a download. The pop-up stays in the same profile and its download is intercepted.
- A PDF that the portal renders in Chromium's viewer rather than downloading. Saved through the interceptor with the same capture record.
- A site that detects automation. The agent stops and hands the task to the advocate.

## Failure modes

| Failure | Honest state shown |
|---|---|
| Chromium fails to start | The browser pane shows the error. Capture and filing report `dependency_unavailable`. |
| Reparenting fails | The browser opens as an owned top-level window, with a notice. |

## Observable outcomes

- The browser pane shows the profile name, and a banner when the agent is attached.
- `oa browser downloads --json` lists every intercepted download.

## Open questions

None local.

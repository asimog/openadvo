# Euro-Office vendoring

Status: plan, 2026-11-13. Nothing is vendored yet. This file owns where the Euro-Office parts come from. How the editor fits the product is in [editor-design.md](editor-design.md).

## The plan in one paragraph

We take the complete official Euro-Office desktop release, `v9.3.6`, for each platform. We keep every editor in it: Word documents, PDF, spreadsheets, presentations and diagrams. We also keep the `x2t` converter, the fonts and the dictionaries. All of it runs inside our own Electron window. There is no server, no Docker and no second application. We do not use the release's own desktop shell (Qt and CEF). Our Electron app takes its place. We build nothing from source, and we never change a vendored file.

## What we take from the release

| Folder in the release | What it is | Used for |
|---|---|---|
| `editors/web-apps`, `editors/sdkjs` | All editors: `documenteditor`, `pdfeditor`, `spreadsheeteditor`, `presentationeditor`, `visioeditor`; the engine for each (`word`, `pdf`, `cell`, `slide`, `visio`) | The full Word editor, the PDF editor and viewer, and the other editors, inside our window |
| `converter/` | `x2t` with `doctrenderer` and its libraries | Open and save (DOCX, PDF and the rest to the editor format and back), PDF export, and the font list |
| `fonts/` | Bundled fonts | Fonts for the editors and the converter |
| `dictionaries/` | Spell-check dictionaries | English spell check |

Not taken: the Qt and CEF desktop shell (`DesktopEditors.exe`, `editors.exe`, `libcef`, `ascdocumentscore`, Qt libraries).

## How it runs inside the app

- The editor page loads in a sandboxed view in our window. A custom protocol serves the vendored files.
- The editors expect the desktop shell to supply one object, `window.AscDesktopEditor`. Our host page supplies it. It answers about 90 calls: open, save, images, fonts, and "not supported" for features we do not use. The official definition is in `Euro-Office/desktop-sdk` (`ChromiumBasedEditors/lib/src/cefwrapper/client_renderer_wrapper.cpp`). The old prototype's `shim.js` (`C:\dev\advodsh\plugins\workspace-editor\lib\editor\shim.js`) already answers most of these calls. It is the starting point.
- Open: the main process runs `x2t` from the matter's working copy to the editor format, and the page loads it. Save: the page hands back its state, `x2t` writes the DOCX or PDF, and the matter store makes a new revision.
- Agent edits: the Document Builder API is compiled into the release editor (`Asc.editor.getJsApi()` returns it; `ApiDocument.SetTrackRevisions` is present). The agent's edits run through it in an editor page and become tracked changes.
- Fonts: on first start the release's own converter builds the font list: `x2t -create-allfonts <out> <fonts>`. We serve the result to the editors from the user data folder, so no vendored file changes. Checked on 2026-11-13 with the Windows release: exit code 0, about 1 second, `AllFonts.js` and `font_selection.bin` written.

## How euro-office-lite runs the editors, and what we adopt

euro-office-lite (`github.com/delmarguillen/euro-office-lite`, commit `8f397256`) is a reference only. It is not vendored and no code is taken from it. Read from the local copy `C:\dev\advodsh\resources\euro-office-lite-src`.

It runs the editors with three layers and no server:

1. **A host page** (`src/index.html`). It loads `bridge.js` first, then the official `web-apps/apps/api/documents/api.js`, then three small runtime scripts. It opens a document with `new DocsAPI.DocEditor(...)`, `type: 'desktop'`, `document.url: '_offline_'`, `editorConfig.targetApp: 'desktop'`, `mode: 'edit'`, and a `customization` block.
2. **A bridge** (`src/bridge.js`). It defines `window.AscDesktopEditor`, the object the editors expect from the desktop shell. Each call goes to the backend through about 40 named commands: open, save, `write_editor_bin`, `save_pdf`, print, clipboard, recovery, file pickers.
3. **A native backend** (Rust, Tauri). It runs `x2t` to convert the file to the editor format and back.

It builds the editor files from the official `sdkjs` and `web-apps` sources with `grunt develop --desktop=true`. It carries ten source patches (`patches/`), but these are optional: five are fixes backported from upstream, and five are its own small changes. They are not needed to run the editors. Its runtime scripts (`editor-patches.js`, `font-patches.js`, `button-hint-patch.js`) fix behaviour at run time inside the editor frame, without changing editor files.

**What we adopt.** The same three layers, built from official parts only:

| Layer | euro-office-lite | Open Advocate |
|---|---|---|
| Editor files | Built from source with `grunt`, patched | The official release's `editors/` as published: already the desktop build, every editor |
| Host page and bridge | `index.html` and `bridge.js` in a Tauri webview | Our host page in a sandboxed Electron view. Its `AscDesktopEditor` calls go to the main process over Electron IPC. |
| Backend | Rust, running `x2t` | Our main process, running the release's own `x2t` |
| Fixes | Source patches and runtime scripts | Runtime scripts in our host page only, when a real task needs one. No vendored file changes. |

Electron uses Chromium, the same browser engine as the official desktop shell (CEF). So the editors run in the engine they are built for.

The earlier prototype already ran the official release's editor files this way, without euro-office-lite (`C:\dev\advodsh\docs\eurooffice-hosting-assessment.md`, row "Release editor performance": about 1.9 seconds to start the editor). It used them only for the Word editor. Step 4 does the same for all editors.

## Releases

Source: `github.com/Euro-Office/DesktopEditors`, tag `v9.3.6`, commit `8b25e8ace5e00121bfafe86d5cd25d5ef588b404`. One tag pins one commit of each part, so the editors and the converter always match.

| Platform | Release file | sha256 |
|---|---|---|
| Windows x64 | `Euro-Office-DesktopEditors-9.3.6-0-windows-x64.zip` | `1f6a221fec9864956fd4e787b2267668220ab2bc51807685bd15e89493b6d533` |
| Windows arm64 | `Euro-Office-DesktopEditors-9.3.6-0-windows-arm64.zip` | `3b88a249bf623311cdd32c01675338f6c1604177f539e52c65f2c16bde58002e` |
| Linux x64 | `euro-office-euro-office-9.3.6-0-x86_64.tar.xz` | `d8d7083f0d49201e3606341a9caca5ff6ddbe9ff7c92fa17cd30fb6797146afd` |
| Linux arm64 | `euro-office-euro-office-9.3.6-0-aarch64.tar.xz` | `e42bbcbb404c0ecd89b3b38049d0b5084cd7d8ec38e092896ac7939fea61ecee` |
| macOS arm64 | `Euro-Office-DesktopEditors-9.3.6-0-macos-arm64.dmg` | `74136ecbebce3eea18e093bc9641806c9f9996f7eb4361aa3ab9e8daaca3abf5` |
| macOS Intel | none | — |

The Windows x64 file is the same file as `C:\dev\advodsh\resources\euro-office-de\desktopeditors.zip` (same sha256).

## The fetch script

One Node script, `scripts/vendor-euro-office.mjs`, written at step 4:

1. Pick the release file for this platform. Stop with a clear message on macOS Intel.
2. Download it once into a cache folder, and check its sha256 against the table above.
3. Copy `editors/`, `converter/`, `fonts/` and `dictionaries/` to `resources/euro-office/<platform>/`.
4. Check that the key files exist: `x2t`, `sdkjs/word/sdk-all.js`, `web-apps/apps/documenteditor`, `web-apps/apps/pdfeditor`.
5. Exit non-zero on any failure.

## The one risk, and its test

`window.AscDesktopEditor` is not a documented interface. A new release can add or change a call. The test: open a DOCX and a PDF in the app, type, run one agent edit, save, and reopen. Log every `AscDesktopEditor` call the editors make, and fail on a call our host does not answer. Run it before every release upgrade.

## Licence facts

As stated in each repository's own files at the pinned commits. Facts only.

| Part | Statement |
|---|---|
| DesktopEditors, desktop-sdk, core, sdkjs, sdkjs-forms, web-apps | GNU Affero General Public License, version 3 (`LICENSE` or `LICENSE.txt`) |
| web-apps source headers | GUI elements, illustrations, icons and technical writing: Creative Commons Attribution-ShareAlike 4.0 International |
| document-templates | Apache License, version 2.0 |
| Bundled fonts (`fonts/LICENSE.txt` in the release) | Apache License, version 2.0, with further licence files per font folder |

## Not yet checked

- What the Linux and macOS release files contain. Only the Windows x64 file was opened.
- A Document Builder edit run on this release (the earlier test used another build), and the author name it gives to tracked changes.
- The exact editor configuration that hides ribbon tabs (see [editor-design.md](editor-design.md)).

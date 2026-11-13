# Euro-Office vendoring

Status: research record, 2026-11-13. No part is vendored yet. This file owns where each Euro-Office part comes from. How the editor fits the product is in [editor-design.md](editor-design.md).

**Document Builder, first.** Euro-Office publishes no Document Builder product, repository or release. No release ships a `docbuilder` executable. Three official sources remain, all without a server:

1. The builder API is compiled into the release editor bundle `editors/sdkjs/word/sdk-all.js`. The editor returns it from `Asc.editor.getJsApi()`. It runs inside an editor page. This is the recommended path (section c).
2. The release `converter/doctrenderer.dll` exports the C++ class `NSDoctRenderer::CDocBuilder`. Only a native caller can use it. The release has no such caller for us.
3. The official `docbuilder` command-line tool can be built from `Euro-Office/core` (`DesktopEditor/doctrenderer/app_builder`).

**How to read.** Each fact names its evidence: repository, path and commit, or a local path and sha256. "Unverified" means this research did not confirm it. Section letters a to h follow the brief. The recommendation, the manifest and the fetch script outline are at the end. Commit SHAs are shortened to 8 characters in tables; the full SHAs are in section a.

## a. Repositories and how they relate

The Euro-Office organisation on GitHub has 33 repositories (`gh api orgs/Euro-Office/repos`, 2026-11-13). None is named document-builder or DocumentBuilder (both return HTTP 404).

`Euro-Office/DesktopEditors` is a super-repository. Its `README.md` says: "This is a super-repository". Almost no source lives in it. At tag `v9.3.6` (commit `8b25e8ace5e00121bfafe86d5cd25d5ef588b404`) its `.gitmodules` names nine submodules. The tree pins these commits. They equal the `BUILD_COMMITS` in the release provenance (below).

| Submodule | Commit at DesktopEditors v9.3.6 | Role (from `DesktopEditors/README.md` and `build/README.md`) |
|---|---|---|
| desktop-apps | `7a1297b3172a0993401308fbd09633e0597704e0` | Native shell (Qt): `win-linux/`, `macos/`, `common/loginpage`. Its `win-linux/CMakeLists.txt` is the shared build definition. |
| desktop-sdk | `8cc8d747cb48953bf8020c2bfbb67ede6cb55c51` | CEF host library (`ChromiumBasedEditors/lib`). It defines `window.AscDesktopEditor`. |
| core | `a4a1ba1e9c8e6b6c841c3f059b3a8f82177d63f5` | Native converter `x2t`, `doctrenderer`, `allfontsgen`, `docbuilder`, and the WASM modules. |
| sdkjs | `40d9b7780f11a5cadc259f9b9815a364de8caa96` | Editor engine (JavaScript). Contains `word/apiBuilder.js`. |
| web-apps | `ce0ba49545810a56a3878081ab762c6a7ae8dd4e` | Editor user interface. |
| sdkjs-forms | `5c2f5a010dae3581adda34d9bab20b1903c94081` | Forms add-on, built into sdkjs. |
| core-fonts | `9cd64d6eedc72b75b7271f325f075cb8c73e59fa` | Bundled fonts. |
| dictionaries | `0020f5ed5174e2a213171c4c7da9ec06ca140869` | Spell-check dictionaries. |
| document-templates | `40cc88d509bac3283539b80b9534a41191d7c4ff` | `new/` empty documents per locale. |

Build model (`DesktopEditors@8b25e8ac:build/README.md`):

- One CI workflow runs three jobs. `build-common` (Linux, Docker) builds the platform-independent "editors web payload" (JS and WASM) once. `build-linux` and `build-windows` overlay that payload on the native app. macOS uses the same payload (`build/macos/stage.sh`, `--payload-dir`).
- `build/docker-bake.hcl` lines 108-169 define the targets `core-wasm`, `desktop-js`, `sdkjs-desktop` (`sdkjs/.docker/sdkjs.bake.Dockerfile`, `SDK_PLATFORM=desktop`), `web-apps` and `desktop-common`.
- `build/.docker/desktop-composer.bake.Dockerfile` (38 lines) composes `desktop-common`. It copies sdkjs and web-apps to `/editors/`, `build/configs/core/DoctRenderer.config.desktop` to `/converter/DoctRenderer.config`, `document-templates/new` to `/converter/empty`, dictionaries and core-fonts.
- The native parts (x2t, doctrenderer, CEF, Qt) are built per platform. Windows: `build/windows/build.ps1` (MSVC, CMake, vcpkg). Linux: `build/linux/docker-bake.hcl`. macOS: `build/macos/stage.sh` and `make-dmg.sh`; its README says the native build plus Xcode is "still manual".
- `desktop-apps` has no GitHub releases. Its tags (`v99.99.99.*`) and the `win-v4.3.0.*` tags in core, sdkjs and desktop-sdk are not product releases.

Local evidence. `C:\dev\advodsh\resources\euro-office-de\desktopeditors.zip` has 1,044,603,212 bytes and sha256 `1f6a221fec9864956fd4e787b2267668220ab2bc51807685bd15e89493b6d533`. This equals the GitHub digest of release asset `Euro-Office-DesktopEditors-9.3.6-0-windows-x64.zip` (DesktopEditors `v9.3.6`). So the local zip is that official asset. Its `provenance.json` (sha256 `9eb6c6a9bc54774ca03908c55e427fa184c041cb8f784a2ff2ab786e6663d060`) is an in-toto statement, `predicateType` `https://slsa.dev/provenance/v1`. It records `PRODUCT_VERSION` 9.3.6, `BUILD_DATE` 2026-10-22, `configSource` `desktop-composer.bake.Dockerfile`, builder `https://github.com/Euro-Office/DesktopEditors/actions/runs/39793586241/attempts/1`, and VCS revision `8b25e8ac…`. Its 19,018 subjects cover only the common payload (`editors/` 18,121, `converter/` 524, `dictionaries/` 346, `fonts/` 21, `providers/` 5, `index.html`). They do not cover x2t, the DLLs, or the two `AllFonts.js` files.

## b. How the desktop product runs the editor without a server

The host is the CEF library in desktop-sdk. All paths below are in `Euro-Office/desktop-sdk@8cc8d747`, folder `ChromiumBasedEditors/lib/src/`, unless marked.

| Step | What happens | Where |
|---|---|---|
| Page | The host loads `editors/web-apps/apps/api/documents/index.html` and adds `placement=desktop`. | `cefview.cpp:2435` |
| Host object | On each V8 context the renderer creates an object, adds 197 native methods from one name list, and sets it as `window.AscDesktopEditor`. | `cefwrapper/client_renderer_wrapper.cpp:5500-5804` (`ExtendObject` at 399) |
| JS wrappers | The host then injects JS that adds callback-style members (`CreateEditorApi`, `OpenFilenameDialog`, `SaveFilenameDialog`, `DownloadFiles`, `sendSystemMessage`, `convertFile`, and others). | same file, 2325-2410 |
| Host facts | The host runs `window.RendererProcessVariable = {…}` (theme, local themes). | same file, 5858-5860 |
| Desktop mode | `api.js` sets `editorConfig.targetApp = 'desktop'` when `window.AscDesktopEditor` exists. web-apps aliases it as `window.desktop`. | `web-apps@ce0ba495`: `apps/api/documents/api.js:563`, `apps/common/main/lib/util/desktopinit.js:26`, `apps/common/main/lib/controller/Desktop.js:50` |
| Open | The editor calls `LocalStartOpen` (message `onlocaldocument_loadstart`). The host runs x2t from the source file to `<recovery dir>/Editor.bin`. It then calls `window.DesktopOfflineAppDocumentEndLoad(folder, data, len)`. The data can be `binary_content://…`; sdkjs then calls `AscDesktopEditor.GetOpenedFile` for the bytes and calls `editor.openDocument`. | `client_renderer_wrapper.cpp:1776, 6088-6146`; `fileconverter.h:699-722`; `sdkjs@40d9b778: common/Local/common.js:174-210` |
| Edits | sdkjs sends each change to `LocalFileSaveChanges`. The host appends it to `changes/changes0.json` in the recovery folder. | `client_renderer_wrapper.cpp:1914-1967` |
| Save | sdkjs `DesktopOfflineAppDocumentStartSave` calls `AscDesktopEditor.LocalFileSave(param, password, docinfo, fileType, jsonOptions, oldPassword)`. The host runs x2t from `Editor.bin` with `<m_bFromChanges>true</m_bFromChanges>` to the target file. It then calls `window.DesktopOfflineAppDocumentEndSave(0 \| 1 \| 2)`. | `sdkjs: word/Local/api.js:208-259`; `client_renderer_wrapper.cpp:1969-1981, 6200-6225`; `fileconverter.h:1020-1077` |
| Fonts | sdkjs requests `ascdesktop://fonts/<id>`. The host serves the bytes. The host builds its font list at run time with core's `CApplicationFontsWorker` into `fonts_cache_info_path`, and answers requests for `sdkjs/common/AllFonts.js` from it. | `sdkjs: common/Local/common.js:132`; `cefview.cpp:5397`; `applicationmanager_p.h:1434, 2265` |
| Native JS engine | `converter/DoctRenderer.config` points at `../editors/sdkjs`, `native.js`, `jquery_native.js` and `AllFonts.js`. x2t uses doctrenderer for conversions that need sdkjs, such as `m_bFromChanges`. | `DesktopEditors@8b25e8ac: build/configs/core/DoctRenderer.config.desktop`; zip entry sha256 `f2c0f36c…` (equal to its provenance subject) |
| Builder in the host | The desktop host itself uses `CDocBuilder` from doctrenderer for its AI tools (`OpenFile`, `GetContext`, `SaveFile`). | `lib/tools/tools.cpp:27, 54`; `lib/tools/functions/form_field_filler/main.cpp:86-135` |

The callbacks the host calls in the page are: `DesktopOfflineAppDocumentEndLoad`, `DesktopOfflineAppDocumentApplyChanges`, `DesktopOfflineAppDocumentSignatures`, `DesktopOfflineAppDocumentEndSave`, `DesktopOfflineAppDocumentAddImageEnd`, `DesktopSaveQuestionReturn`, `asc_desktop_on_load_js`, and `on_*` handlers such as `on_native_message` (`client_renderer_wrapper.cpp`, grep `window.Desktop` and `window.on_`).

## c. Parts we need and their official source

| Part | What it is | Official source | In the v9.3.6 release? |
|---|---|---|---|
| Editor UI | `editors/web-apps` | `web-apps@ce0ba495` | Yes. `apps/api/documents/api.js` sha256 `e7a19cee…` (provenance subject). |
| Editor engine | `editors/sdkjs` (desktop build, `SDK_PLATFORM=desktop`) | `sdkjs@40d9b778` + `sdkjs-forms@5c2f5a01` + core WASM | Yes. `word/sdk-all.js` sha256 `f517ce77b9bba7e9278d12051c9206088de009101b47ace7b6908c31060520d2`, `word/sdk-all-min.js` sha256 `fbc40cb2a1fccad49c5e4b1bcb13783135645b9160da4dfc7fc089b82625a6a4`. Both equal their provenance subjects and the extracted copies in `C:\dev\advodsh\resources\euro-office-de\editors\sdkjs\word\`. |
| Converter | `converter/x2t(.exe)`, `x2tlib`, `doctrenderer`, `graphics`, `kernel`, `kernel_network`, `UnicodeConverter`, `PdfFile`, `DocxRenderer`, ICU 74, and others | `core@a4a1ba1e`, `X2tConverter/build/cmake` (`core/CMakeLists.txt:25`) | Windows x64: yes. `x2t.exe` sha256 `b7e76dd8466ec049dc8a24521c6a6ab0c8ed32337913e1cd87e0583fca140655`, `x2tlib.dll` `14a44891efc071a6fbe3a7a83526781838526a117fa4f0ce2a59825b7a3461e4`, `doctrenderer.dll` `e7c310786cac0f0882add79ba2d2586a73700e80e6f5ddf5c64ba89c0789f751` (computed from the zip). Other platforms: unverified. |
| Native config | `converter/DoctRenderer.config` | `DesktopEditors@8b25e8ac:build/configs/core/DoctRenderer.config.desktop` | Yes. |
| Empty DOCX | `converter/empty/<locale>/new.docx` | `document-templates@40cc88d5:new/` | Yes. |
| Fonts step | Writes `converter/AllFonts.js`, `editors/sdkjs/common/AllFonts.js`, `font_selection.bin`, web font files | Tool `allfontsgen` from `core@a4a1ba1e:DesktopEditor/AllFontsGen` (`main.cpp:184-188` documents the flags `--input --allfonts --allfonts-web --images --selection --output-web --use-system`). It wraps `CApplicationFontsWorker`, the same worker the desktop host runs. | The outputs are in the release but describe the CI machine: `converter/AllFonts.js` lists `C:/Windows/Fonts/…` paths. The tool is not in the release (no match in the zip listing). `build/macos/stage.sh:89-168` builds it standalone, runs it, then deletes it. |
| Bundled fonts | `fonts/` | `core-fonts@9cd64d6e` | Yes. |
| Document Builder | `AscBuilder.Word.Api` (`Api.GetDocument`, `ApiDocument.SetTrackRevisions`, and the rest) | `sdkjs@40d9b778:word/apiBuilder.js` (`Api` at line 36, `GetDocument` 4528, `SetTrackRevisions` 7981, export 32284). `configs/word.json:465` puts it in the Word bundle for every platform. | Yes, compiled into `word/sdk-all.js`. There is no file named `apiBuilder.js` and no `docbuilder` executable in the zip (zip listing: 0 matches). |

Where an official Document Builder comes from:

1. **Desktop release, in an editor page: available.** `word/sdk-all-min.js` defines `asc_docs_api.prototype.getJsApi = function(){return AscBuilder.Word.Api}` (source `sdkjs@40d9b778:word/api.js:14897`). The official plugin path runs builder code through `AscCommon.safePluginEval`, which passes `Api = window.g_asc_plugins.api.getJsApi()` (source `common/macros.js:434-491`). The plugin `callCommand` handler wraps that run in `canRunBuilderScript`, `_beforeEvalCommand` and `onEndBuilderScript` (seen in the release `word/sdk-all.js`; its source file was not located). Our host can do the same in a visible or hidden editor page, then save through the normal host save path. Prior evidence: `C:\dev\advodsh\spike\s0\builder-headless\REPORT.md` ran `AscBuilder.Word.Api` (`=== Asc.editor.getJsApi()`) in headless Chromium, but on euro-office-lite sdkjs, not on this release. A run on the release bundle is unverified.
2. **Desktop release, through doctrenderer: library only.** `converter/doctrenderer.dll` exports `NSDoctRenderer::CDocBuilder` methods `Initialize`, `OpenFile`, `CreateFile`, `ExecuteCommand`, `RunTextA`, `RunTextW`, `SaveFile`, `CloseFile`, `GetContext`, `SetProperty` (decorated names found in the binary). The class is declared in `core@a4a1ba1e:DesktopEditor/doctrenderer/docbuilder.h:339`. Calling it needs native code that the release does not include.
3. **Official source built by us.** `core@a4a1ba1e:CMakeLists.txt:29` adds `DesktopEditor/doctrenderer/app_builder` (target `docbuilder`, `main.cpp`). core also holds `.net`, `.java`, `.python` and `.com` bindings. Building core needs vcpkg and a V8 build (`core/CMakeLists.txt:49` comment; `build/README.md`). Effort and ABI match with the release doctrenderer are unverified.
4. **Official builder product or repository: none.** `gh api -X GET search/repositories -f q='org:Euro-Office builder'` returns 0. Code search for "docbuilder" in the organisation returns 112 hits; the first 100 are in core, sdkjs, server, DocumentServer, document-server-package, desktop-sdk, editors-engine and plugins. `document-server-package@main:Makefile:409` has the `chmod` line for `server/FileConverter/bin/docbuilder` commented out. Whether a DocumentServer package ships a docbuilder binary is unverified.

## d. Official releases per platform

Releases are published only on `Euro-Office/DesktopEditors` (desktop) and `Euro-Office/DocumentServer` (server, Linux packages only). Signed builds of the same versions are published as Nextcloud Office in `nextcloud-releases/Office-DesktopEditors` (`DesktopEditors/README.md`, "Install"). Sizes and digests below are from the GitHub release API.

DesktopEditors `v9.3.6` (published 2026-10-22, tag commit `8b25e8ac…`, not a pre-release):

| Platform | Asset | Bytes | sha256 |
|---|---|---|---|
| Windows x64 | `Euro-Office-DesktopEditors-9.3.6-0-windows-x64.zip` | 1,044,603,212 | `1f6a221fec9864956fd4e787b2267668220ab2bc51807685bd15e89493b6d533` |
| Windows arm64 | `Euro-Office-DesktopEditors-9.3.6-0-windows-arm64.zip` | 1,025,619,658 | `3b88a249bf623311cdd32c01675338f6c1604177f539e52c65f2c16bde58002e` |
| Linux x86_64 | `euro-office-euro-office-9.3.6-0-x86_64.tar.xz` | 497,085,996 | `d8d7083f0d49201e3606341a9caca5ff6ddbe9ff7c92fa17cd30fb6797146afd` |
| Linux aarch64 | `euro-office-euro-office-9.3.6-0-aarch64.tar.xz` | 541,080,672 | `e42bbcbb404c0ecd89b3b38049d0b5084cd7d8ec38e092896ac7939fea61ecee` |
| macOS arm64 | `Euro-Office-DesktopEditors-9.3.6-0-macos-arm64.dmg` | 971,551,026 | `74136ecbebce3eea18e093bc9641806c9f9996f7eb4361aa3ab9e8daaca3abf5` |
| macOS x64 | none | | |

The same release also has `.exe` installers, `.deb`, `.rpm` and a help archive. Other tags: `v9.3.5-2` (15 assets, older names such as `DesktopEditors-9.3.5.0-x64.zip`), `v9.3.6-rc.1`, `v9.3.8-rc.1` (pre-release, 11 assets). Tag `v9.3.8` (commit `04110152cec6a2111174d9111484e2582dfd093a`) exists, but had no release on 2026-11-13.

Presence and version match of the section c parts:

| Platform | Editor (web-apps, sdkjs, builder API) | x2t + doctrenderer | Fonts outputs | allfontsgen | docbuilder |
|---|---|---|---|---|---|
| Windows x64 | Present, verified | Present, verified | Present, CI machine paths | Absent, verified | Absent, verified |
| Windows arm64, Linux, macOS arm64 | Unverified (assets not opened; each is over 50 MB) | Unverified (`build/macos/stage.sh:59` requires `converter/x2t`) | Unverified | Unverified | Unverified |

Version match: one tag pins one commit of each submodule, and one `build-common` payload feeds all platforms (`build/README.md`). So in one release the frontend and the converter come from the same core and sdkjs commits. Byte equality of the payload across platform assets is unverified.

## e. Vendoring options

| Criterion | 1. Extract from official release, per platform | 2. Build from official source | 3. Mix: release parts + small official tools built from the same commit |
|---|---|---|---|
| Reproducibility | High. Fixed assets with GitHub sha256 digests; SLSA provenance for the JS payload. | Depends on our CI. Needs Docker buildx for the payload and MSVC / Xcode / vcpkg / V8 for core. | High for release parts. Built tools are pinned to the release's core commit. |
| Platforms | Windows x64 and arm64, Linux x64 and arm64, macOS arm64. No macOS x64. | All that core builds for; macOS native build documented as partly manual. | As option 1, plus whatever the tool build supports. |
| Frontend vs converter version | Matched by the release. | Matched if we pin both to one DesktopEditors tag. | Matched: tools use `core@a4a1ba1e`. |
| Size to fetch | 0.5 to 1.05 GB per platform asset. We keep only the subtrees we need. | Source clones of core (GitHub size field 788,127 KB), sdkjs, web-apps; large build caches. | As option 1, plus core sources for the tools. |
| Size kept (Windows x64, measured from the zip) | Converter natives about 124 MB; `sdkjs/word` 21 MB, `sdkjs/common` 32 MB, `web-apps/apps/documenteditor` 99 MB, `web-apps/vendor` 23 MB. The minimal set for DOCX (for example whether `sdkjs/cell` or `spreadsheeteditor` is needed for charts) is unverified. | Similar output. | As option 1. |
| Fonts step | Missing: the release has no `allfontsgen`. | Built. | Built from core. |
| Document Builder | In-page API only. | In-page API, plus `docbuilder` CLI. | In-page API; `docbuilder` CLI optional. |
| Update path | Change the tag and digests; rerun the fetch script and the contract test (section g). | Bump the super-repository tag; rebuild everything. | Bump the tag; rebuild the small tools from the new core commit. |
| Effort | Low. | High (four toolchains, V8). | Medium: one CMake target per platform. Standalone build of `AllFontsGen` is shown only for macOS (`stage.sh:89-120`); Windows and Linux are unverified. |

## f. What our host must answer

Method. A static scan of the release bundles (`word/sdk-all.js`, `word/sdk-all-min.js`, `web-apps/apps/api/documents/api.js`, `web-apps/apps/documenteditor/main/app.js` and `code.js`) for `AscDesktopEditor.X` and `AscDesktopEditor["X"]`, plus the `native.`/`desktop.` alias in `web-apps@ce0ba495:apps/common/main/lib/controller/Desktop.js`, finds 89 members. Minified aliases can hide members, so section g adds a run-time trace. (web-apps builds with terser `mangle: false`, `web-apps@ce0ba495:build/README.md:285-289`, which lowers this risk for web-apps.) The host's own definitions are in `client_renderer_wrapper.cpp:5509-5801` (native list) and 2325-2410 (JS wrappers).

| Group | Members | Answer in our host |
|---|---|---|
| Open | `LocalStartOpen`, `GetOpenedFile`, `CheckUserId`, `IsLocalFile`, `LocalFileGetSourcePath`, `LocalFileGetOpenChangesCount`, `onDocumentContentReady` | Run x2t to `Editor.bin`, then call `DesktopOfflineAppDocumentEndLoad(folder, "binary_content://…", len)`; `GetOpenedFile` returns the bytes. `CheckUserId` returns the author id. |
| Edit and dirty state | `LocalFileSaveChanges`, `AddChanges`, `onDocumentModifiedChanged`, `SetDocumentName`, `OnSave`, `LocalFileGetSaved` | Keep the change log for recovery, or ignore it. Report the dirty flag to the main process. |
| Save | `LocalFileSave`, `SaveQuestion`, `ResaveFile` | Take the current state, run x2t to DOCX, write a new revision, then call `DesktopOfflineAppDocumentEndSave(0)` or `(2)` on error. |
| Images | `LocalFileGetImageUrl`, `LocalFileGetImageUrlCorrect`, `GetImageBase64`, `GetImageFormat`, `GetImageOriginalSize`, `IsImageFile`, `OpenFilenameDialog`, `GetDropFiles` | Resolve to the document's media folder; open a file dialog in the main process. |
| Fonts and display | `LoadFontBase64`, `GetFontThumbnailHeight`, `GetSupportedScaleValues`, `getViewportSettings`, `CheckNeedWheel`, `features`, plus the `ascdesktop://fonts/` scheme and `window.RendererProcessVariable` | Serve fonts through a registered `ascdesktop` protocol; give fixed values. |
| UI commands | `execCommand` (strings in `Desktop.js`: `editor:onready`, `editor:config`, `webapps:features`, `title:*`, `uitheme:changed`, `create:new`, `open:recent`, `go:folder`, and others), `LocalFileRecents`, `sendSystemMessage`, `CallInAllWindows`, `CreateEditorApi`, `LoadJS`, `nativeClipboardWrite` | Accept; act on the few we use. |
| Capability probes | `isSupportNetworkFunctionality`, `isSupportPlugins`, `isSupportMacroses`, `IsSignaturesSupport`, `IsProtectionSupport`, `isBlockchainSupport`, `IsSupportMedia`, `GetInstallPlugins`, `getEngineVersion`, `getDictionariesPath`, `SpellCheck` | Return "not supported" values, synchronously. |
| Not used by us | Print (`Print`, `Print_Start`, `Print_Page`, `Print_End`, `IsFilePrinting`, `emulateCloudPrinting`, `SetPdfCloudPrintFileInfo`, `IsCachedPdfCloudPrintFileInfo`), signatures, crypto (`Crypto*`, `OpenFileCrypt`, `buildCrypted*`, `GetEncryptedHeader`, `PreloadCryptoImage`), compare and merge, media, plugins install, `DownloadFiles`, `RemoveFile`, `convertFile`, `localSaveToDrawingFormat*`, `startExternalConvertation`, `openExternalReference`, `SetAdvancedOptions`, `IsLocalFileExist` | Harmless no-op. |

Three referenced members are not defined by the official host: `NativeViewerOpen`, `SetLocalRestrictions`, `features` (`features` is set by web-apps itself). That sdkjs guards them is unverified.

Comparison with the old shim (`C:\dev\advodsh\plugins\workspace-editor\lib\editor\shim.js`, sha256 `720db8b2fb43e6851bdfc24bc65c3af4ec17bc32d64be6a4ccba9cfd2ec96e2c`; `boot.js` `c20334d9…`; `host.html` `2be12279…`):

- **Carries over (members the release uses and the shim defines):** `CheckUserId`, `CreateEditorApi`, `GetInstallPlugins`, `GetSupportedScaleValues`, `IsLocalFile`, `IsProtectionSupport`, `IsSignaturesSupport`, `LoadFontBase64`, `LocalFileGetImageUrl`, `LocalFileGetOpenChangesCount`, `LocalFileGetSaved`, `LocalFileGetSourcePath`, `LocalFileSave`, `LocalFileSaveChanges`, `LocalStartOpen`, `PreloadCryptoImage`, `Print`, `SetDocumentName`, `execCommand`, `getViewportSettings`, `isBlockchainSupport`, `onDocumentModifiedChanged`. Also `window.RendererProcessVariable`, the `Proxy` that answers unknown members, the frame injection in `boot.js` (`injectInto`), the `ascdesktop://` mapping (`mapProtocolUrl`), and the review commands in `execReviewCommand` (`asc_AcceptAllChanges`, `asc_SetTrackRevisions`, `asc_GetTrackRevisionsReportByAuthors`, and others; all present in the release `sdk-all-min.js`).
- **Defined in the shim but not used by the release scan:** `IsSupportNativePrint`, `LocalFileOpen`, `LocalFileGetModified`, `LocalFileSetModified`, `getDocumentModified`, `isSupportBinaryFontsSprite`, and the private `_editorWindow`, `_currentDocType`, `_isModified`, `_pendingPrinter`.
- **Differs from the official flow:** the shim opens with `ew.Asc.editor.openDocument(file)` from `boot.js` instead of `DesktopOfflineAppDocumentEndLoad`. It saves with `asc_nativeGetFile()` and an HTTP post, and it does not call `DesktopOfflineAppDocumentEndSave`. The official host does both (`client_renderer_wrapper.cpp:6141, 6221`). It uses HTTP routes and `EventSource`; the new app uses Electron IPC. Its `Proxy` returns a `Promise` for unknown members; the official members are mostly synchronous.

## g. Risk: the host interface is not a documented contract

- `window.AscDesktopEditor` is defined only by code: `client_renderer_wrapper.cpp` in desktop-sdk and its callers in sdkjs and web-apps. No README at the pinned commits lists its members (searched: `README.md` of DesktopEditors, desktop-sdk, `build/*.md` of DesktopEditors, `Readme.md` of sdkjs and web-apps, `build/README.md` of web-apps). The only mention is `web-apps@ce0ba495:build/README.md:289`. It names "`window['AscDesktopEditor']` dynamic property access" as one reason the build keeps terser `mangle: false`.
- A new release can add, rename or change the arity or return type of a member. A wrong answer can fail silently: a `Promise` where sdkjs expects a string breaks start-up (comment in the old `shim.js`, "Synchronous probes sdkjs reads during startup").
- The `DesktopOfflineApp*` callbacks and the `ascdesktop://` scheme are the same kind of private interface.
- The builder API is documented (JSDoc in `apiBuilder.js`), but `getJsApi`, `canRunBuilderScript` and `onEndBuilderScript` are internal.

Test that catches a break on upgrade (two parts, both run by the fetch script and in CI):

1. **Static contract diff.** Scan the new `word/sdk-all.js`, `word/sdk-all-min.js` and web-apps bundles with the section f patterns. Compare the member set with a committed list and with the members our host implements. Also scan `client_renderer_wrapper.cpp` of the new desktop-sdk commit for the native list. Fail on any new member, any removed member, or any change in the `window.Desktop*` callback names.
2. **Round trip in Electron.** Launch the app with a test profile. Wrap our host object in a recording `Proxy` and log every member read. Open a fixture DOCX, type text, run one builder edit with track changes on (`Api.GetDocument()`, `SetTrackRevisions(true)`, insert a paragraph), save, and close. Unzip the saved DOCX and check `word/document.xml` for the inserted text inside `<w:ins w:author="Open Advocate agent">`. Reopen the file and check `asc_GetTrackRevisionsReportByAuthors` lists that author. Fail on any logged member that is not in the committed list. That the author name comes from `editorConfig.user` in this flow is unverified; this test settles it.

## h. Licence facts

Facts only, as stated in each repository or release.

| Item | Statement | File |
|---|---|---|
| DesktopEditors `v9.3.6` | Text naming "GNU Affero General Public License (AGPL) version 3", with an Ascensio System Limited copyright line and a Section 5 notice. GitHub API reports `NOASSERTION`. README "License" section: "GNU Affero Public License, version 3.0". `ATTRIBUTION`: based on ONLYOFFICE DocumentServer, "licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)". | `LICENSE`, `README.md`, `ATTRIBUTION` at `8b25e8ac` |
| desktop-apps | GNU Affero General Public License, Version 3 (GitHub: AGPL-3.0) | `LICENSE.txt` at `7a1297b3` |
| desktop-sdk | GNU Affero General Public License, Version 3 (GitHub: AGPL-3.0) | `LICENSE` at `8cc8d747` |
| core | GNU Affero General Public License, Version 3 (GitHub: AGPL-3.0). `CMakeLists.txt` header: `SPDX-License-Identifier: AGPL-3.0-only`. | `LICENSE.txt`, `CMakeLists.txt` at `a4a1ba1e` |
| sdkjs | GNU Affero General Public License, Version 3 (GitHub: AGPL-3.0) | `LICENSE.txt` at `40d9b778` |
| sdkjs-forms | GNU Affero General Public License, Version 3 | `LICENSE.txt` at `5c2f5a01` |
| web-apps | GNU Affero General Public License, Version 3 (GitHub: AGPL-3.0). Source file headers also state that GUI elements, illustrations, icon sets and technical writing are under "Creative Commons Attribution-ShareAlike 4.0 International". | `LICENSE.txt`; `apps/common/main/lib/util/desktopinit.js:1-24` at `ce0ba495` |
| document-templates | Apache License, Version 2.0 | `LICENSE` at `40cc88d5` |
| core-fonts | No top-level licence file; GitHub reports none. The release has `fonts/LICENSE.txt` (Apache License, Version 2.0) and licence files in `fonts/asana`, `fonts/caladea`, `fonts/crosextra`, `fonts/openoffice`. | tree at `9cd64d6e`; zip listing |
| dictionaries | No top-level licence file; GitHub reports none. The release `dictionaries/` folder has 57 entries with "licen" in the name. | tree at `0020f5ed`; zip listing |
| Release `v9.3.6` | The release notes contain no licence statement. The zip has no top-level licence file. | GitHub release body; zip listing |
| DocumentServer | GitHub: AGPL-3.0 | repository metadata |

## Unverified items

1. Contents of the Windows arm64, Linux and macOS assets: file layout, x2t, doctrenderer, fonts outputs, `allfontsgen`, `docbuilder`.
2. Byte equality of the JS payload across platform assets.
3. The builder API run end to end on the release `sdk-all.js` in an Electron page (the earlier spike used euro-office-lite sdkjs, the source the old prototype used).
4. The tracked-change author in builder edits equals `editorConfig.user`.
5. Whether a DocumentServer package ships a `docbuilder` binary.
6. Standalone build of `allfontsgen` on Windows and Linux; build effort for `docbuilder`; ABI match of a self-built `docbuilder` with the release `doctrenderer`.
7. The minimal subtree set for DOCX editing (charts and other embedded editors).
8. That sdkjs guards `NativeViewerOpen` and `SetLocalRestrictions`; completeness of the static member scan.

## Recommendation

Use **option 3 (mix)**, pinned to DesktopEditors `v9.3.6`:

- Take `editors/web-apps`, `editors/sdkjs`, `converter/` (minus `templates/`) and `fonts/` from the official release asset of each platform. Check the GitHub sha256 of the asset, and check each JS payload file against its provenance subject.
- Build only `allfontsgen` from `core@a4a1ba1e` (`DesktopEditor/AllFontsGen`, official CMake) per platform. Run it on first launch and when system fonts change, into the user data folder.
- Run the Document Builder through the compiled API in the release editor bundle (`Asc.editor.getJsApi()`), in an editor page our host owns. Save through the same x2t path as the advocate's edits.
- Keep the `docbuilder` CLI from `core/DesktopEditor/doctrenderer/app_builder` as a later option. Do not build it until the in-page path fails a real task.
- macOS x64 has no official asset. Supporting it needs option 2 for that platform.

## Vendor manifest

| Part | Source repository / release | Tag | Commit | sha256 | Platform |
|---|---|---|---|---|---|
| Release asset | Euro-Office/DesktopEditors | v9.3.6 | `8b25e8ace5e00121bfafe86d5cd25d5ef588b404` | `1f6a221fec9864956fd4e787b2267668220ab2bc51807685bd15e89493b6d533` | win-x64 |
| Release asset | Euro-Office/DesktopEditors | v9.3.6 | `8b25e8ac…` | `3b88a249bf623311cdd32c01675338f6c1604177f539e52c65f2c16bde58002e` | win-arm64 |
| Release asset | Euro-Office/DesktopEditors | v9.3.6 | `8b25e8ac…` | `d8d7083f0d49201e3606341a9caca5ff6ddbe9ff7c92fa17cd30fb6797146afd` | linux-x64 |
| Release asset | Euro-Office/DesktopEditors | v9.3.6 | `8b25e8ac…` | `e42bbcbb404c0ecd89b3b38049d0b5084cd7d8ec38e092896ac7939fea61ecee` | linux-arm64 |
| Release asset | Euro-Office/DesktopEditors | v9.3.6 | `8b25e8ac…` | `74136ecbebce3eea18e093bc9641806c9f9996f7eb4361aa3ab9e8daaca3abf5` | mac-arm64 |
| Provenance | in the win-x64 zip, `provenance.json` | v9.3.6 | `8b25e8ac…` | `9eb6c6a9bc54774ca03908c55e427fa184c041cb8f784a2ff2ab786e6663d060` | win-x64 (other assets unverified) |
| Editor UI `editors/web-apps` | Euro-Office/web-apps, via release | v9.3.6 | `ce0ba49545810a56a3878081ab762c6a7ae8dd4e` | per file, from provenance subjects (`api.js` `e7a19ceec2c761f522b8d4be883f1dd457226c9ebcc166ee90d8ef0ff0ce7bb7`) | all |
| Editor engine + builder API `editors/sdkjs` | Euro-Office/sdkjs + sdkjs-forms, via release | v9.3.6 | `40d9b7780f11a5cadc259f9b9815a364de8caa96`, `5c2f5a010dae3581adda34d9bab20b1903c94081` | `word/sdk-all.js` `f517ce77b9bba7e9278d12051c9206088de009101b47ace7b6908c31060520d2`; `word/sdk-all-min.js` `fbc40cb2a1fccad49c5e4b1bcb13783135645b9160da4dfc7fc089b82625a6a4` | all |
| Converter `converter/` | Euro-Office/core, via release | v9.3.6 | `a4a1ba1e9c8e6b6c841c3f059b3a8f82177d63f5` | win-x64: `x2t.exe` `b7e76dd8…`, `x2tlib.dll` `14a44891…`, `doctrenderer.dll` `e7c31078…`; others: record at first fetch | per platform |
| `DoctRenderer.config` | Euro-Office/DesktopEditors `build/configs/core/DoctRenderer.config.desktop`, via release | v9.3.6 | `8b25e8ac…` | `f2c0f36c846ac52b1ecb23434a8805ed94984dc07512572916f9b08347dd7f95` | all |
| Empty documents `converter/empty` | Euro-Office/document-templates, via release | v9.3.6 | `40cc88d509bac3283539b80b9534a41191d7c4ff` | per file, from provenance subjects | all |
| Bundled fonts `fonts/` | Euro-Office/core-fonts, via release | v9.3.6 | `9cd64d6eedc72b75b7271f325f075cb8c73e59fa` | per file, from provenance subjects | all |
| `allfontsgen` | Euro-Office/core `DesktopEditor/AllFontsGen`, built by our CI | (core of v9.3.6) | `a4a1ba1e…` | record after build | per platform |
| `docbuilder` CLI (deferred) | Euro-Office/core `DesktopEditor/doctrenderer/app_builder` | (core of v9.3.6) | `a4a1ba1e…` | not built | none yet |

## Fetch script outline (Node, one module selects the platform)

- Read a committed manifest (JSON): tag, commit SHAs, per-platform asset name, asset size and sha256, the list of subtrees to keep, the expected-file list, and the committed host-member list.
- Select the platform key from `process.platform` and `process.arch` (win-x64, win-arm64, linux-x64, linux-arm64, mac-arm64). Stop with a clear error for mac-x64.
- Download the asset from `https://github.com/Euro-Office/DesktopEditors/releases/download/<tag>/<asset>` into a new empty cache folder. Stream it to disk and hash it while it streams. Skip the download when a cached file has the right size and hash.
- Compare the sha256 with the manifest and with the `digest` field of the GitHub release API. Stop on any mismatch.
- Open the archive without extracting all of it: zip (Windows) with a zip reader, tar.xz (Linux) with a streaming xz + tar reader, dmg (macOS) with the platform tool `hdiutil attach -readonly` in a temporary mount point.
- Copy only the kept subtrees into a new staging folder: `editors/web-apps` (needed apps only), `editors/sdkjs`, `converter/` without `templates/`, `fonts/`, and `provenance.json` when present.
- Verify each staged JS payload file against the provenance subject digest. Report files without a subject (natives, `AllFonts.js`) and check them against the manifest hashes instead.
- Verify presence: x2t, doctrenderer, `DoctRenderer.config`, `converter/empty/en-US/new.docx`, `sdkjs/word/sdk-all.js`, `sdkjs/word/sdk-all-min.js`, `web-apps/apps/api/documents/api.js`, `web-apps/apps/documenteditor/main/index.html`. Check that the word bundle contains `getJsApi` and `SetTrackRevisions`.
- Fetch the `allfontsgen` build artefact for the platform from our CI, check its hash, and place it in the staging `converter/` folder.
- Run the section g static contract diff on the staged bundles. Stop on any difference.
- Move the staging folder to `resources/euro-office/<platform>/` in one rename. Write a lock file with the tag, the asset hash, the per-file counts and bytes, and the run date.
- Exit non-zero with a log on any failure. Never modify a vendored file after staging.

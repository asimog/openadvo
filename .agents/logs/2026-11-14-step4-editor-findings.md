# Step 4 research: anchors, editor API, ribbon configuration, Word check

Date: 2026-11-14. Repository: `C:\dev\openadvo`. Read-only research. No vendored Euro-Office file was changed. No file outside `scratchpad/step4/` and this report was changed.

Vendored build probed: Euro-Office **9.3.6 (build:0)**. The version string is in the banner of `resources/euro-office/win-x64/editors/sdkjs/word/sdk-all-min.js` and `sdk-all.js`.

Evidence root: `scratchpad/step4/evidence/`. Spike scripts: `scratchpad/step4/*.js` and `word-save.ps1`.

Each statement below is marked **CONFIRMED** (seen in a run or in the vendored code) or **UNVERIFIED** (not executed here).

## 0. Verdict for the Lead

1. **Anchor: use the block-level content control with the opaque tag.** Both candidates survive, but the `w:sdt` keeps its tag, alias and id unchanged through two x2t round trips and through a Microsoft Word open/save. The bookmark keeps its name, but Word renumbers its `w:id` (1 to 0). Details in section 1.
2. **Ribbon: the keys work.** `customization.layout.toolbar.file=false`, `.plugins=false` and `.protect=false` hide those tabs. The exact object is in section 4.2.
3. **Warning on "Review".** This build has **no tab captioned "Review"**. The review tools live in the tab captioned "Collaboration" (action id `review`, layout name `toolbar-collaboration`). The locale key `textTabReview` exists, but no vendored code uses it. Do not hide the "Collaboration" tab, or all review controls disappear.
4. **Warning on "clean view".** In this build the review display modes **Final** and **Original** are read-only preview modes. The app calls `disableEditing(true)` and the logic document sets a global lock. The clean, editable state at start is display mode **Edit** (markup), which shows no markup when the document has no revisions. Details in section 3.4.

## 1. Anchor survival

### 1.1 Method

I built the input DOCX by hand with `fflate` (`scratchpad/step4/anchor-spike.js`). The body has:

- a body-level `<w:sdt>` with `<w:tag w:val="oa-anchor-1"/>`, alias "OA anchor one", `w:id` 314159265, around paragraph 1;
- `<w:bookmarkStart w:id="1" w:name="oa-anchor-2"/>` around paragraph 2;
- `w14:paraId` values on all three paragraphs (`0A1B2C3D`, `0A1B2C3E`, `0A1B2C3F`).

Then I ran the vendored converter twice for the full round trip: `docx -> bin (8192)` then `bin -> docx (65)`, and repeated that pair. A fifth and sixth run converted the Word-saved DOCX through the same pair. Every run used `cwd = resources/euro-office/win-x64/converter` and a `TaskQueueDataConvert` params file in `scratchpad/step4/evidence/anchor/`.

Commands, all exit 0:

| Command | Exit | Result |
|---|---|---|
| `node scratchpad\step4\anchor-spike.js` | 0 | Builds DOCX, runs 4 x2t hops, inspects hop 1 and hop 2 |
| `x2t.exe params-docx-to-bin-1.xml` | 0 | `anchor-rt1.bin` |
| `x2t.exe params-bin-to-docx-1.xml` | 0 | `anchor-rt1.docx` |
| `x2t.exe params-docx-to-bin-2.xml` | 0 | `anchor-rt2.bin` |
| `x2t.exe params-bin-to-docx-2.xml` | 0 | `anchor-rt2.docx` |
| `x2t.exe params-word-to-bin.xml` | 0 | `anchor-word-back.bin` |
| `x2t.exe params-word-bin-to-docx.xml` | 0 | `anchor-word-back.docx` |

Raw evidence: `anchor-summary.json`, `x2t-*.json`, `document-rt1.xml`, `document-rt2.xml`, `inspect-rt1.json`, `inspect-rt2.json`, `params-*.xml`.

### 1.2 Result per hop (CONFIRMED)

| Hop | sdt tag `oa-anchor-1` | sdt alias | bookmark name `oa-anchor-2` | `w14:paraId` |
|---|---|---|---|---|
| input | yes | yes | yes | yes |
| x2t hop 1 (docx->bin->docx) | yes | yes | yes | yes, unchanged |
| x2t hop 2 (second pair) | yes | yes | yes | yes, unchanged |
| Microsoft Word save | yes | yes | yes | yes, unchanged |
| Word file -> x2t pair | yes | yes | yes | yes, unchanged |

Excerpt from `document-rt2.xml` (second x2t round trip, hop 2):

```xml
<w:body><w:sdt><w:sdtPr><w:alias w:val="OA anchor one" /><w:tag w:val="oa-anchor-1" /><w:id w:val="314159265" /></w:sdtPr><w:sdtContent><w:p w14:paraId="0A1B2C3D">...Paragraph one is inside a block level content control.</w:p></w:sdtContent></w:sdt><w:p w14:paraId="0A1B2C3E"><w:pPr><w:pStyle w:val="Normal" /></w:pPr><w:bookmarkStart w:id="1" w:name="oa-anchor-2"/><w:r><w:t xml:space="preserve">Paragraph two is inside a bookmark.</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>
```

Excerpt from `document-word.xml` (after the Microsoft Word save). Word kept the block-level sdt and the bookmark, and changed only the bookmark id:

```xml
<w:body><w:sdt><w:sdtPr><w:alias w:val="OA anchor one"/><w:tag w:val="oa-anchor-1"/><w:id w:val="314159265"/></w:sdtPr><w:sdtEndPr/><w:sdtContent><w:p w14:paraId="0A1B2C3D" ...>...</w:p></w:sdtContent></w:sdt><w:p w14:paraId="0A1B2C3E" ...><w:bookmarkStart w:id="0" w:name="oa-anchor-2"/>...
```

### 1.3 Anchor conclusion (CONFIRMED)

- The block-level content control keeps `w:tag`, `w:alias`, `w:id` and its body-level position through two x2t round trips, through a Word save, and through x2t after the Word save.
- The bookmark keeps its `w:name`. Word renumbers `w:id` (1 to 0), so code must match on the **name**, never on the id.
- `w14:paraId` also survived every hop in these tests. This test made **no content edits**. Stability of paragraph ids under edits is not proven (UNVERIFIED).
- **Recommendation:** use the block-level content control with tag `"oa-" + 32 hex` as the paragraph anchor. Use the bookmark name as a secondary check.

## 2. Microsoft Word check

### 2.1 Method

`C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE` exists. I used Word COM automation from PowerShell (`scratchpad/step4/word-save.ps1`), with `Visible = $false`, `DisplayAlerts = 0`, `AutomationSecurity = 3` (macros disabled). The script opened `anchor-rt2.docx` (the double-round-tripped file), read `doc.ContentControls` tags and `doc.Bookmarks` names, saved as a new DOCX with `SaveAs2($dst, 16)` (`wdFormatDocumentDefault`), closed with `wdDoNotSaveChanges`, and quit.

Command: `pwsh -NoProfile -ExecutionPolicy Bypass -File scratchpad\step4\word-save.ps1` — exit 0.

### 2.2 Result (CONFIRMED)

```json
{
  "wordInstalled": true, "comAvailable": true, "opened": true, "saved": true, "error": null,
  "wordVersion": "16.0",
  "contentControlTagsBefore": ["oa-anchor-1"],
  "bookmarksBefore": ["oa-anchor-2"]
}
```

After Word's save, `node scratchpad\step4\inspect-word.js` (exit 0) reported:

```json
{
  "sdtTag": true, "sdtAlias": true, "sdtElement": true, "sdtLevel": "body-level",
  "bookmarkStart": true,
  "bookmarkId": "<w:bookmarkStart w:id=\"0\" w:name=\"oa-anchor-2\"/>",
  "paraId": ["0A1B2C3D", "0A1B2C3E", "0A1B2C3F"]
}
```

So Microsoft Word 16.0 keeps the content-control tag and the bookmark name. Word renumbers only the bookmark id. Raw evidence: `word-save-result.json`, `inspect-word.json`, `document-word.xml`, `anchor-word.docx`.

The reverse order also works: the Word-saved DOCX went through x2t (bin then docx) and both anchors survived (`inspect-word-back.json`, `document-word-back.xml`, exit 0).

Limitation: this Word check had no tracked changes and no editing inside Word. See section 6.

## 3. Editor API

### 3.1 How to reach the API object (CONFIRMED)

`src/editor-host/boot.js` line 165 already stores the editor frame window:

```js
window.AscDesktopEditor._editorWindow = ew   // ew = iframe contentWindow with AscCommon
```

The SDK assigns the editor API object to `Asc.editor` when it constructs it. In `sdk-all-min.js` offset 1880750:

```js
if(window.editor==undefined){window.editor=this;window["editor"]=window.editor;Asc["editor"]=Asc.editor=this;...}
```

So in the host page, get the API object like this:

```js
var ew  = window.AscDesktopEditor._editorWindow
var Asc = ew.Asc
var api = Asc.editor
```

`api` is the `asc_docs_api` instance. All `asc_*` methods below are on it. The constants are on `Asc` (for example `Asc.c_oAscSdtLevelType`). The host origin and the editor frame origin are both `oa-eo://app`, so the frame is reachable without cross-origin errors.

### 3.2 Content controls (CONFIRMED)

Enum, `sdk-all-min.js` offset 1399612:

```js
var c_oAscSdtLevelType={"Block":1,"Inline":2,"Row":3,"Cell":4};
// exported as Asc.c_oAscSdtLevelType
```

Add and read, offset 2118132 and 2130268/2130585:

```js
// signature and return value
api.asc_AddContentControl(nType, oContentControlPr)   // returns content-control properties or null
// block branch:
//   oContentControl = oLogicDocument.AddContentControl(c_oAscSdtLevelType.Block)
//   if(oContentControlPr) oContentControl.SetContentControlPr(oContentControlPr)
//   oResult = oContentControl.GetContentControlPr()
//   return oResult

api.asc_GetContentControlProperties()   // returns the content-control properties object, or null
                                        // read .Tag, .Alias, .Id, .Lock, .InternalId, .Appearance
api.asc_GetCurrentContentControl()      // returns the content control's INTERNAL id (GetId()), or null
                                        // NOTE: this is not the Tag
```

The property class is `AscCommon.CContentControlPr` (`sdk-all.js` offset 14000277 and 14001565). It has fields `Id`, `Tag`, `Alias`, `Lock`, `InternalId`, `CCType`, `Appearance` (default `Asc.c_oAscSdtAppearance.Frame`), `PlaceholderText`, and more. `SetContentControlPr` accepts a plain object and copies these keys with `FillFromObject`:

```js
api.asc_AddContentControl(Asc.c_oAscSdtLevelType.Block, {
  Tag: 'oa-' + hex,
  Alias: 'Open Advocate anchor'
})
```

Related methods that exist (public API list in `evidence/api/public-api-methods.json`, 772 names):

```js
api.asc_SetContentControlProperties(oContentControlPr, Id, isApplyToAll)
api.asc_SetContentControlText(sText, sId)          // sId = internal id from asc_GetCurrentContentControl()
api.asc_GetContentControlBoundingRect(sId)
api.asc_GetContentControlRightAnchorPosition()     // (name from the public API export list)
```

There is **no public API to list all content controls** (checked the 772-name export list). The vendored code itself enumerates them through the logic document. This internal call exists at runtime because the vendored minified code calls it by name (`sdk-all-min.js` offset 1747802):

```js
var doc = api.WordControl.m_oLogicDocument
var ccs = doc.GetAllContentControls()   // array of control objects
for (var i = 0; i < ccs.length; i++) {
  var pr = ccs[i].GetContentControlPr() // .Tag, .Alias, .InternalId
}
```

UNVERIFIED: the loop above was not executed in our host page. Its method names are present in the minified bundle, but the internal object shape is not a public contract.

### 3.3 Insert text or a paragraph at the cursor

**CONFIRMED signature**, `sdk-all-min.js` offset 2180023:

```js
api.asc_AddText(sText, oSettings)   // returns "" or the new position; calls AddTextWithPr
```

Settings class is `AscCommon.CAddTextSettings` (`SetTextPr`, `MoveCursorOutside`, `SetWrapWithSpaces`). It has no paragraph option.

**CONFIRMED newline behavior.** `asc_AddText` inserts inline content. In `AddTextWithPr` a new text run goes through `ParaRun.AddText`. In `sdk-all.js` offset 10717797, character 10 (`\n`) becomes `AscWord.CRunBreak(AscWord.break_Line)` — a **line break**, not a paragraph break. Character 13 (`\r`) is skipped.

**CONFIRMED gap:** this build has **no public API that inserts a paragraph** at the cursor. The 772-name export list has no `asc_AddParagraph`, `asc_InsertParagraph`, `asc_EnterParagraph` or `asc_KeyDown` (`evidence/api/public-api-groups.json`). The only names with "AddParagraph" are `asc_AddParagraphToTOC` and unrelated ones.

Candidate routes for a paragraph, not yet proven:

1. `api.asc_PasteData(AscCommon.c_oAscClipboardDataFormat.Text, text, undefined, undefined, undefined, callback)` — signature confirmed at offset 1915762; the vendored plugin code calls it with the `Text` format. Whether `\r\n` in `text` becomes paragraphs is UNVERIFIED.
2. Insert the whole generated DOCX as bytes instead of inserting text (the route used at step 4: generate the DOCX, then open it in the editor).

UNVERIFIED: no insertion call was executed in a running editor.

### 3.4 Review display mode (CONFIRMED, and this changes the design)

Enum, `sdk-all-min.js` offset 134990:

```js
var c_oAscDisplayModeInReview={"Edit":0,"Final":1,"Original":2,"Simple":3};
// exported as Asc.c_oAscDisplayModeInReview
```

Public methods, offset 2158630:

```js
api.asc_SetDisplayModeInReview(nMode)   // calls oLogicDocument.SetDisplayModeInReview(nMode)
api.asc_GetDisplayModeInReview()        // default is Asc.c_oAscDisplayModeInReview.Edit
```

What the modes do, in `sdk-all.js` offset 12598897 and 12600280:

- `Edit` and `Simple` allow editing (`EndViewModeInReview`).
- `Final` and `Original` enter a **view mode**: `BeginViewModeInReview` runs `AcceptAllRevisionChanges(true,false)` (Final) or `RejectAllRevisionChanges(true,false)` (Original) on the in-memory document, and calls `CollaborativeEditing.Set_GlobalLock(true)`. `EndViewModeInReview` undoes this. `IsViewModeInReview()` returns true for exactly Final and Original.
- The editing checks consult the global lock. For example `StartSelectionLockCheck` returns false when `CollaborativeEditing.Get_GlobalLock()` is true, and `Document_Undo` returns early unless in review view mode.

The web app applies the same rule on top, `app.js` line 1605:

```js
turnDisplayMode:function(mode){ ... this.api.asc_SetDisplayModeInReview(type) ...
  this.disableEditing("final"==mode||"original"==mode), this._state.previewMode="final"==mode||"original"==mode}
```

So **Final and Original are read-only preview modes in this build.** This is CONFIRMED from code. The design item "the editor opens with review display final, the advocate reads clean text" is possible, but the advocate cannot type in that mode. Recommended split for the harness bar:

| Harness bar choice | Display mode | Editable |
|---|---|---|
| Clean | `Final` (1) | no |
| Redline | `Edit` (0) | yes |
| Original | `Original` (2) | no |

The default display mode is `Edit` when the document loads: `ViewModeInReview={"mode":Asc.c_oAscDisplayModeInReview.Edit,...}` (`sdk-all.js` offset 12121864). A document with no tracked changes shows clean text in `Edit`.

The same setting can be passed as a configuration key, `app.js` line 1605. Accepted values are `original`, `final`, `markup`, `simple`; the editor default is `markup`:

```js
editorConfig: { customization: { review: { reviewDisplay: 'final' } } }   // or deprecated customization.reviewDisplay
```

Caveat (CONFIRMED): after the first run, the app reads its saved value from local storage (`Common.localStorage.getItem(appPrefix+"review-mode-editor")`) and that value wins over the configuration. Use the API call at document ready if the mode must be forced.

UNVERIFIED: the runtime result of switching modes from our harness bar. If the bar calls `asc_SetDisplayModeInReview` directly, the app-level `disableEditing` flag is not updated, because the public method does not send `asc_onChangeDisplayModeInReview`. One candidate is the internal `api.WordControl.m_oLogicDocument.SetDisplayModeInReview(mode, true)`, which sends the event and therefore updates the app state. Not executed.

### 3.5 Content-control highlight

**CONFIRMED default: content controls do NOT show a highlight.** `sdk-all.js` offset 9464940:

```js
function SdtGlobalSettings(){this.Color=new AscCommonWord.CDocumentColor(220,220,220);this.ShowHighlight=false}
```

API, `sdk-all-min.js` offset 2134864:

```js
api.asc_SetGlobalContentControlShowHighlight(isShow, r, g, b)   // r,g,b optional
api.asc_GetGlobalContentControlShowHighlight()                  // returns boolean
```

The default highlight color is confirmed in the minified bundle too: `asc_GetGlobalContentControlHighlightColor(true)` returns `new Asc.asc_CColor(220,220,220)` (offset 2134415).

So the Lead does not need to switch anything off. If a highlight is wanted, call `api.asc_SetGlobalContentControlShowHighlight(true, 220, 220, 220)`.

### 3.6 Track revisions

**CONFIRMED**, `sdk-all-min.js` offset 2108813:

```js
api.asc_SetTrackRevisions(bTrack)      // -> asc_SetLocalTrackRevisions(bTrack) -> oLogicDocument.SetLocalTrackRevisions(bTrack,true)
api.asc_IsTrackRevisions()             // current state
api.asc_SetLocalTrackRevisions(bTrack)
api.asc_GetLocalTrackRevisions()
api.asc_SetGlobalTrackRevisions(bTrack)
api.asc_GetGlobalTrackRevisions()
```

`asc_SetTrackRevisions` sets the **local** track-revisions flag, which is the only one a single desktop user has. UNVERIFIED: no runtime call was made.

### 3.7 Revision report by author

**CONFIRMED**, `sdk-all-min.js` offset 2112540. No arguments. The call reads `this.WordControl.m_oLogicDocument.TrackRevisionsManager.Get_AllChanges()` and returns an object whose keys are author names and whose values are arrays of change objects, sorted by date:

```js
var report = api.asc_GetTrackRevisionsReportByAuthors()
// report["Open Advocate agent"] = [change, ...]
// each change: change.get_UserName(), change.get_DateTime()
```

The method does not check for a missing document, so call it only after the document is ready. UNVERIFIED: not executed. The code basis is clear.

### 3.8 Get the document bytes for x2t (save path)

**CONFIRMED** in `sdk-all-min.js`:

```js
api.asc_nativeGetFile()      // offset 2200692
// -> new AscCommonWord.BinaryFileWriter(doc).Write()
// returns the editor binary as a STRING: "DOCY;v5;<size>;<base64 payload>"

api.asc_nativeGetFile3()     // offset 2201084, not in the public export list
// returns { data: <base64 string with header>, header: "DOCY;v5;<size>;" }

api.asc_nativeGetFileData()  // offset 2201410
// returns raw Uint8Array; writes the binary to memory with Write(true)
// CAUTION: it calls window["native"]["Save_End"](header, size). boot.js does not inject window.native,
// so this call throws unless a window.native stub is added to the editor frame.
```

Format constants, `sdk-all-min.js` offset 1399369: `var c_oSerFormat={"Version":5,"Signature":"DOCY"}`. `BinaryFileWriter.Write(noBase64, onlySaveBase64)` in `sdk-all.js` offset 14122961:

- `Write()` with no arguments returns `header + base64` as a string (`GetResult()`);
- `Write(true)` returns raw bytes (`memory.GetData()`);
- `Write(true,true)` returns the base64 string.

The path from the document bytes to DOCX is the verified x2t route: write the bytes to a temporary `.bin` file, then run `x2t.exe` with `m_nFormatTo=65` (section 1). UNVERIFIED: this specific route from live editor bytes was not executed here.

Additional desktop-save facts (CONFIRMED from code, use only if the Lead wants the in-editor save flow):

- The vendored SDK defines `window.AscDesktopEditor_Save` (offset 957408):
  ```js
  window["AscDesktopEditor_Save"]=function(){var _editor=window.Asc.editor?window.Asc.editor:window.editor;
    if(!_editor.asc_Save(false)){window["AscDesktopEditor"]["OnSave"]()}}
  ```
- After a save cycle the SDK calls `window.AscDesktopEditor.OnSave()` (offset 1922735).
- The SDK calls 59 different `AscDesktopEditor` members; the list is in `evidence/api/ascdesktopeditor-members.json`. The save-relevant ones are `OnSave`, `ResaveFile`, `GetOpenedFile`, `onDocumentModifiedChanged`, `IsLocalFile`, `CreateEditorApi`.
- The current `shim.js` `LocalFileSave` is not called by this build: the string has 0 occurrences in the vendored SDK and web app.

### 3.9 What is CONFIRMED vs UNVERIFIED in part 3

CONFIRMED (code): all signatures and enum values above; the default highlight off; the default display mode `Edit`; Final/Original read-only; binary writer formats; `Asc.editor` assignment; host frame access pattern.

UNVERIFIED (no run): any of these calls executed in our own host page, because starting the app writes build output outside this task's write scope. The calls are code-derived, not guesses, and every quoted name exists in the vendored minified bundle.

## 4. Ribbon configuration

### 4.1 How the configuration reaches the app (CONFIRMED)

1. `web-apps/apps/api/documents/api.js` sends the whole `editorConfig` to the editor iframe after it loads: `var _init=function(editorConfig){_sendCommand({command:'init',data:{config:editorConfig}})}` (api.js, `getAppParameters`/`init` block near line 1278).
2. The app receives it in `app.js` line 2667: `Common.Gateway.on("init",_.bind(this.loadConfig,this))` and `loadConfig:function(data){this.editorConfig=$.extend(this.editorConfig,data.config),this.appOptions.customization=this.editorConfig.customization,...}`.
3. At app init, `app.js` line 2668 calls:
   ```js
   Common.UI.LayoutManager.init(this.editorConfig.customization?this.editorConfig.customization.layout:null,
       this.appOptions.canBrandingExt, this.api)
   ```
   and `this.appOptions.canBrandingExt="object"==typeof this.editorConfig.customization||this.editorConfig.plugins`. Our configuration always passes a customization object, so the customizer is **licensed/active**.
4. The customizer walks `layout` and hides matching elements, `app.js` line 1533:
   ```js
   _applyCustomization=function(config,el,prefix){ ... if("object"==typeof config[name]) _applyCustomization(config[name],el,(prefix||"")+name+"-")
     else if(!1===config[name]){var selector="[data-layout-name="+(prefix||"")+name+"]",cmp=el?el.find(selector):$(selector);cmp&&cmp.hide&&cmp.hide()}}
   ```
   So `layout.toolbar.file=false` hides `[data-layout-name="toolbar-file"]`, and so on.
5. `Common.UI.LayoutManager.applyCustomization()` runs once inside `hidePreloader` (line 2669), which `onDocumentReady` calls (line 2667). The static tabs are rendered before this (line 833 renders the tab strip from `options.tabs`, and line 3485 defines those tab items), so the File tab exists when the hider runs.

Evidence files: `evidence/ribbon/customization-props.json`, `layout-names.json`, `layoutname-contexts.json`; search results in `evidence/api/search-*.json`.

### 4.2 The exact object for boot.js (CONFIRMED keys)

Add to the `editorConfig` object in `src/editor-host/boot.js` (currently lines 207-213):

```js
editorConfig: {
  mode: info.readOnly ? 'view' : 'edit',
  lang: 'en',
  targetApp: 'desktop',
  user: { id: 'advocate', name: 'Advocate' },
  coEditing: { mode: 'fast', change: false },   // hides the "Co-editing Mode" button (see 4.4)
  customization: {
    about: false,
    feedback: false,
    macros: false,
    plugins: false,          // disables plugins; keep it together with layout.toolbar.plugins
    chat: false,             // hides the Chat control (co-editing feature)
    layout: {
      toolbar: {
        file: false,         // hides the File tab
        plugins: false,      // hides the Plugins tab
        protect: false,      // hides the Protection tab
        draw: false,         // optional: hide Draw tab
        view: false,         // optional: hide View tab
        headerfooter: false  // optional: hide Header & Footer tab
      },
      header: {
        users: false,        // hides the co-editing user avatars
        editMode: false      // optional: hides the edit/view mode switch
      }
    }
  }
}
```

Do **not** set `collaboration: false`. In this build that hides the Review tools (section 4.3). Home, Insert, Layout and References need no key; they stay visible.

### 4.3 Proof for each hidden tab

| Config key | Element hidden | Code evidence |
|---|---|---|
| `layout.toolbar.file=false` | `<li data-layout-name="toolbar-file">` — the File tab item | `app.js` line 3485: `{caption:me.textTabFile,action:"file",...,layoutname:"toolbar-file",haspanel:!1}`; template prints the attribute at line 833; generic hider at line 1533; applied at line 2669 |
| `layout.toolbar.plugins=false` | Plugins tab | `app.js` line 1557: `tab={action:"plugins",...,layoutname:"toolbar-plugins"}` and `...isElementVisible("toolbar-plugins")` on `tab:visible` |
| `layout.toolbar.protect=false` | Protection tab | `app.js` lines 2283 and 2861: `tab={action:"protect",...,layoutname:"toolbar-protect"}`, `me.toolbar.setVisible("protect",Common.UI.LayoutManager.isElementVisible("toolbar-protect"))` |
| `layout.header.users=false` | users-avatars block | `app.js` line 2187: `<div class="hedset" data-layout-name="header-users">` |
| `layout.header.editMode=false` (optional) | edit/view mode button block | `app.js` line 2187: `<div class="hedset" data-layout-name="header-editMode">` |
| `layout.toolbar.draw=false`, `.view=false`, `.headerfooter=false` (optional) | those tabs | `app.js` line 2861: `layoutname:"toolbar-draw"`, `"toolbar-view"`, `"toolbar-headerfooter"` plus `isElementVisible(...)` calls |

The vendored `api.js` also documents these keys in its config comment block (lines 160-185: `file`, `home`, `insert`, `layout`, `references`, `collaboration`, `draw`, `protect`, `plugins`, `view`, `save`). The comment is documentation; the code above is the proof that they are read.

Mismatch found: the `api.js` comment lists `home` and `insert` keys, but the code gives the Home and Insert tabs **no** `layoutname` (line 3485: only file, layoutand references have one). Setting `layout.toolbar.home=false` or `insert=false` has no effect in this build. This is harmless for our design because we keep those tabs.

### 4.4 The "Review" tab problem (CONFIRMED)

- `app.js` line 2861 creates the review tab: `tab={action:"review",caption:me.toolbar.textTabCollaboration,dataHintTitle:"U",layoutname:"toolbar-collaboration"}`, and shows it when `(config.isEdit||config.canCoAuthoring&&config.canComments)&&Common.UI.LayoutManager.isElementVisible("toolbar-collaboration")`.
- Its panel is `Common.Controllers.ReviewChanges` — accept/reject changes, display mode, sharing, co-editing mode, history, chat, compare.
- English locale: `en.json` line 4198 `"DE.Views.Toolbar.textTabCollaboration": "Collaboration"`; line 4207 `"DE.Views.Toolbar.textTabReview": "Review"`.
- The string `textTabReview` appears **nowhere** in `web-apps/apps/documenteditor/main/app.js` or `code.js` (verified by search). The caption is "Collaboration".

Consequence: keep the Collaboration tab. It is the only home of the review tools in this build. If the Lead wants the caption "Review", that cannot be done by configuration (E2: no vendored file may be changed).

### 4.5 Co-editing controls (CONFIRMED conditions)

- **Share button absent by configuration.** `app.js` line 2187 creates it only when `(config.sharingSettingsUrl && config.sharingSettingsUrl.length || config.canRequestSharingSettings) && !readonly`. `canRequestSharingSettings` comes only from `editorConfig.canRequestSharingSettings` (line 2667). Our `boot.js` sets neither, so the Share button is not created. Same condition for the Share button in the review panel (line 2331). No extra key is needed.
- **"Co-editing Mode" button hidden by `coEditing.change=false`.** The button is created only when `appConfig.isEdit && !appConfig.isOffline && appConfig.canCoAuthoring && appConfig.canChangeCoAuthoring` (line 2331). `canChangeCoAuthoring` becomes false when `editorConfig.coEditing.change===false` (line 2669). Because our host uses `oa-eo://` (not `file:`), `asc_isOffline()` returns false, so the other flags do not hide the button; the coEditing key is the reliable switch.
- **Chat control hidden by `customization.chat=false`.** `canChat = canLicense && !isOffline && !(permissions.chat===false || (permissions.chat===undefined && customization.chat===false))` (line 2668). Setting `customization.chat:false`, or `permissions.chat:false` in the document permissions, hides it.
- **User avatars hidden by `layout.header.users=false`** (markup at line 2187). In addition, the app itself hides the avatars when the visible editing user count is 1 (users list code around line 2187).

### 4.6 Side effect of hiding File

The File tab contains Save, Save as, Download, Info, Settings and Close. If `file:false`, the in-editor save UI is gone. Step 4 must save from our own bar or from the host page. The verified byte route is `asc_nativeGetFile()` plus x2t (section 3.8). This is CONFIRMED from the tab definition; the visual result was not observed.

## 5. Quick answers to `docs/editor-design.md` 1.2

| Item | Answer |
|---|---|
| Anchor survives a save | CONFIRMED: block-level content-control tag and bookmark name survive two x2t round trips and a Word save. |
| Review display "final" hides all markup | CONFIRMED by code path: Final enters preview mode, accepts all changes in memory, hides deleted/format markup. Side effect: the document becomes read-only in that mode. |
| Accept/reject one change after moving to it | Not tested here (out of scope for this task). Not claimed. |
| Which keys hide the tabs | CONFIRMED: `customization.layout.toolbar.file/plugins/protect=false`; see 4.2. |
| Advocate typing untracked by default | Not tested here. `asc_SetTrackRevisions` is the switch; the on-disk state of the document decides. Not claimed. |
| Editor config keys | See section 4. |

## 6. UNVERIFIED and limits

1. **No runtime run of our host page.** Launching the app builds into `out/`, outside this task's write scope, so I did not start it. Every API snippet is code-derived from the vendored 9.3.6 bundles, not executed.
2. No test of `asc_AddContentControl`, `asc_GetContentControlProperties`, display-mode switching, track-revision calls, or the save route in a live editor.
3. Anchor tests used a document with no tracked changes and no editing. Survival under agent edits is not proven.
4. The Word check only opened and saved a file. No Word editing, no tracked changes.
5. The x2t hop count is two full round trips plus one extra pair from the Word file. A longer chain of editor saves is not tested.
6. `w14:paraId` survived in these tests, but the editor may regenerate ids when content changes. Do not rely on it as the only anchor.
7. Paragraph insertion: no public API exists in this build. `asc_PasteData(Text, ...)` is the nearest candidate, unverified.

## 7. Commands run

| Command | Exit | What it did |
|---|---|---|
| `node scratchpad\step4\anchor-spike.js` | 0 | built input DOCX; 4 x2t hops; inspected hop 1 and hop 2 |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scratchpad\step4\word-save.ps1` | 0 | Word 16.0 COM open + SaveAs + close |
| `node scratchpad\step4\inspect-word.js` | 0 | inspected the Word-saved DOCX |
| `node scratchpad\step4\inspect-word-back.js` | 0 | inspected the Word-file x2t output |
| `node scratchpad\step4\api-search.js <bundle> <term> ...` | 0 | context windows in the minified/unminified bundles (many terms; results in `evidence/api/search-*.json`) |
| `node scratchpad\step4\extract-api-names.js` | 0 | 772 public API method names, Asc constants |
| `node scratchpad\step4\extract-desktop-members.js` | 0 | 57 `AscDesktopEditor` members used by the SDK |
| `node scratchpad\step4\extract-customization.js` | 0 | customization keys read by app.js/api.js |
| `node scratchpad\step4\extract-layout-names.js` | 0 | `data-layout-name` values and tab actions |
| `node scratchpad\step4\list-tabs.js` | 0 | tab ids, actions, `isElementVisible` names |
| `node scratchpad\step4\layoutname-contexts.js` | 0 | all `layoutname` contexts |
| `node scratchpad\step4\tab-captions.js` | 0 | tab captions and `setVisible` calls |
| `node scratchpad\step4\term-scan.js <file> <json>` | 0 | presence/count checks for API terms |
| `node scratchpad\step4\offsets.js` | 0 | exact char offsets in the minified bundle |
| two inline `node -e` / `pwsh` one-liners with nested quotes | 1 | failed with shell quoting errors; replaced by script files above. No data lost. |

## 8. Evidence index

| Path | Content |
|---|---|
| `scratchpad/step4/evidence/anchor/anchor-input.docx` | hand-built input DOCX |
| `.../anchor/anchor-rt1.docx`, `anchor-rt2.docx` | x2t round-trip outputs |
| `.../anchor/anchor-word.docx`, `anchor-word-back.docx` | Word-saved file, and its x2t output |
| `.../anchor/document-rt1.xml`, `document-rt2.xml`, `document-word.xml`, `document-word-back.xml` | extracted `word/document.xml` at each step |
| `.../anchor/inspect-*.json`, `anchor-summary.json`, `word-save-result.json`, `x2t-*.json` | machine-readable results |
| `scratchpad/step4/evidence/api/*` | public API list, Asc constants, AscDesktopEditor members, raw search windows |
| `scratchpad/step4/evidence/ribbon/*` | customization keys, layout names, tab contexts |
| `scratchpad/step4/*.js`, `word-save.ps1`, `*.json` | spike scripts and search inputs |

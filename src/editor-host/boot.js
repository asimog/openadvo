/**
 * Boot one document in the Euro-Office editor: mount DocsAPI.DocEditor in desktop
 * mode and hand the editor the bytes the main process opened for this view.
 * Carried over from advodsh plugins/workspace-editor/lib/editor/boot.js.
 *
 * Step 4 adds the harness-bar protocol with the window (see src/renderer/src/DraftView.tsx):
 *   parent -> frame: oa-editor/command {command: displayMode | showSource | insert | save}, save-result, ack
 *   frame -> parent: oa-editor/state, oa-editor/dirty, oa-editor/save-request, oa-editor/command-result
 * The document bytes travel as the editor's own package (`asc_nativeGetFile3`),
 * which the main process converts back to DOCX with the release's x2t.
 */
(function () {
  'use strict'

  var params = new URLSearchParams(window.location.search)
  var docId = params.get('doc') || ''
  var status = document.getElementById('status')
  var log = window._ohLog || function () {}

  var state = {
    info: null,
    editorWindow: null,
    dirty: false,
    inserted: false,
    seq: 0,
    ackTimers: {},
    saves: {},
  }

  function nextId(prefix) {
    state.seq += 1
    return prefix + '-' + Date.now().toString(36) + '-' + state.seq
  }

  function show(message) {
    if (!status) return
    status.textContent = message
    status.classList.add('active')
  }
  function hide() {
    if (!status) return
    status.textContent = ''
    status.classList.remove('active')
  }

  function post(payload, transfer) {
    try {
      if (transfer) window.parent.postMessage(payload, '*', transfer)
      else window.parent.postMessage(payload, '*')
    } catch (e) {
      try { window.parent.postMessage(payload, '*') } catch (e2) {}
    }
  }

  /** Tell the window how the view stands; it shows this in the harness bar. */
  function report(stateName, detail) {
    post({ type: 'oa-editor/state', doc: docId, state: stateName, detail: detail || '' })
  }

  function commandResult(requestId, ok, result, error) {
    post({ type: 'oa-editor/command-result', doc: docId, requestId: requestId, ok: ok === true, result: result === undefined ? null : result, error: error || undefined })
  }

  window.addEventListener('error', function (event) { log('page error: ' + (event && event.message ? event.message : 'unknown')) })
  window.addEventListener('unhandledrejection', function (event) { log('unhandled rejection: ' + (event && event.reason ? event.reason : 'unknown')) })

  // ---- editor lookup ----

  function findEditorWindow() {
    var frames = document.querySelectorAll('iframe')
    for (var i = 0; i < frames.length; i += 1) {
      try {
        var ew = frames[i].contentWindow
        if (ew && ew.AscCommon) return ew
      } catch (e) {}
    }
    return null
  }

  function editorWindow() {
    var ew = state.editorWindow || (window.AscDesktopEditor && window.AscDesktopEditor._editorWindow)
    if (ew) state.editorWindow = ew
    return ew
  }

  function ascEditor() {
    var ew = editorWindow()
    return ew && ew.Asc && ew.Asc.editor ? ew.Asc.editor : null
  }

  function builderApi() {
    var editor = ascEditor()
    if (!editor || typeof editor.getJsApi !== 'function') return null
    try { return editor.getJsApi() } catch (e) { return null }
  }

  // ---- fonts ----

  /** The editors ask the desktop shell for fonts over `ascdesktop://fonts/<id>`. Serve them over oa-eo:// instead. */
  function fontUrl(id) {
    id = String(id).replace(/^[/\\]\?[/\\]?/, '')
    if (/^[A-Za-z]:[\\/]/.test(id) || id.charAt(0) === '/') return '/font?path=' + encodeURIComponent(id)
    return '/fonts/' + encodeURIComponent(id)
  }

  function patchFonts(win) {
    var fonts = win.AscFonts
    if (!fonts || !fonts.CFontFileLoader) return false
    var proto = fonts.CFontFileLoader.prototype
    proto.LoadFontAsync = function (basePath, callback) {
      this.callback = callback
      if (this.Status !== -1) return true
      this.Status = 2
      var xhr = new win.XMLHttpRequest()
      xhr.fontFile = this
      xhr.open('GET', fontUrl(this.Id), true)
      xhr.responseType = 'arraybuffer'
      xhr.onload = function () {
        if (this.status !== 200) { this.fontFile.Status = 1; return }
        this.fontFile.Status = 0
        var data = new Uint8Array(this.response)
        var streams = fonts.g_fonts_streams
        var index = streams.length
        streams[index] = new fonts.FontStream(data, data.length)
        this.fontFile.SetStreamIndex(index)
        if (this.fontFile.callback != null) this.fontFile.callback()
        if (this.fontFile.externalCallback) this.fontFile.externalCallback()
      }
      xhr.send(null)
      return false
    }
    proto['LoadFontAsync'] = proto.LoadFontAsync
    return true
  }

  function mapProtocolUrl(url) {
    if (url.indexOf('ascdesktop://') !== 0) return url
    var rest = url.slice('ascdesktop://'.length)
    if (rest.indexOf('fonts/') === 0) return fontUrl(rest.slice('fonts/'.length))
    if (rest.indexOf('abs/') === 0) return '/font?path=' + encodeURIComponent(rest.slice(4))
    return url
  }

  function patchProtocol(win) {
    try {
      var proto = win.XMLHttpRequest && win.XMLHttpRequest.prototype
      if (!proto || proto.__ohProtocolPatched) return
      var open = proto.open
      proto.open = function (method, url) {
        var args = Array.prototype.slice.call(arguments)
        args[1] = mapProtocolUrl(String(url))
        return open.apply(this, args)
      }
      proto.__ohProtocolPatched = true
    } catch (e) {}
  }

  /** The editors read AscDesktopEditor from the frame they run in: place it on every child frame. */
  function injectInto(win) {
    try {
      if (win && !win.AscDesktopEditor) win.AscDesktopEditor = window.AscDesktopEditor
      if (win && !win.RendererProcessVariable) win.RendererProcessVariable = window.RendererProcessVariable
      patchProtocol(win)
    } catch (e) {}
    var frames = []
    try { frames = win.frames } catch (e) { return }
    for (var i = 0; i < frames.length; i += 1) {
      try { injectInto(frames[i]) } catch (e) {}
    }
  }

  function watchFrame(element) {
    var timer = setInterval(function () {
      try {
        if (element.contentWindow) injectInto(element.contentWindow)
        if (element.contentDocument && element.contentDocument.readyState === 'complete') clearInterval(timer)
      } catch (e) { clearInterval(timer) }
    }, 10)
    setTimeout(function () { clearInterval(timer) }, 60000)
    element.addEventListener('load', function () { try { injectInto(element.contentWindow) } catch (e) {} })
  }

  function installFrameBridge() {
    var create = document.createElement.bind(document)
    document.createElement = function (tag) {
      var element = create(tag)
      if (String(tag).toLowerCase() === 'iframe') watchFrame(element)
      return element
    }
    var timer = setInterval(function () { injectInto(window) }, 250)
    setTimeout(function () { clearInterval(timer) }, 30000)
  }

  function waitForEditor(deadline) {
    return new Promise(function (resolve, reject) {
      var started = Date.now()
      var timer = setInterval(function () {
        var ew = findEditorWindow()
        if (ew && ew.Asc && ew.Asc.editor && ew.AscCommon && ew.AscCommon.g_oDocumentUrls) {
          clearInterval(timer)
          resolve(ew)
          return
        }
        if (Date.now() - started > deadline) {
          clearInterval(timer)
          reject(new Error('editor frame did not become ready'))
        }
      }, 100)
    })
  }

  // ---- editor state the harness bar needs ----

  function reportDirty(modified) {
    if (typeof modified !== 'boolean') return
    state.dirty = modified
    var requestId = nextId('dirty')
    var tries = 0
    function send() {
      post({ type: 'oa-editor/dirty', doc: docId, requestId: requestId, modified: state.dirty })
      var timer = setTimeout(function () {
        delete state.ackTimers[requestId]
        tries += 1
        if (tries < 3) send()
      }, 500)
      state.ackTimers[requestId] = timer
    }
    send()
  }

  function onAck(requestId) {
    var timer = state.ackTimers[requestId]
    if (timer !== undefined) {
      clearTimeout(timer)
      delete state.ackTimers[requestId]
    }
  }

  /**
   * Follow the document's own change history (WD-009, WD-010). The editors do not
   * send a modified event for typing in this build, so the host polls the history
   * index the editor's save path uses. A save resets the saved index.
   */
  var dirtyTimer = null

  function currentChanges() {
    if (state.inserted) return true
    try {
      var ew = editorWindow()
      if (ew && ew.AscCommon && ew.AscCommon.History && typeof ew.AscCommon.History.Have_Changes === 'function') {
        return !!ew.AscCommon.History.Have_Changes()
      }
    } catch (e) {}
    return state.dirty
  }

  function startDirtyWatch() {
    if (dirtyTimer !== null) return
    dirtyTimer = setInterval(function () {
      var changed = currentChanges()
      if (changed !== state.dirty) reportDirty(changed)
    }, 500)
  }

  /** The store has the new revision: mark the editor's own state saved. */
  function markSaved() {
    state.inserted = false
    try {
      var ew = editorWindow()
      if (ew && ew.AscCommon && ew.AscCommon.History && typeof ew.AscCommon.History.Reset_SavedIndex === 'function') {
        ew.AscCommon.History.Reset_SavedIndex(true)
      }
    } catch (e) {}
    reportDirty(false)
  }

  /**
   * Editor defaults: tracked changes off (the advocate's typing is not tracked) and
   * the editable review display. In this build "Final" and "Original" are read-only
   * preview modes; the editable mode is "Edit", which shows no markup while the
   * draft carries no tracked changes (see docs/editor-design.md section 1.2).
   */
  function applyEditorDefaults() {
    var editor = ascEditor()
    var ew = editorWindow()
    if (!editor || !ew || !ew.Asc) return
    try {
      if (editor.asc_SetTrackRevisions) editor.asc_SetTrackRevisions(false)
      if (editor.asc_SetDisplayModeInReview && ew.Asc.c_oAscDisplayModeInReview) {
        editor.asc_SetDisplayModeInReview(ew.Asc.c_oAscDisplayModeInReview.Edit)
      }
      if (editor.asc_SetGlobalContentControlShowHighlight) editor.asc_SetGlobalContentControlShowHighlight(false)
    } catch (e) {
      log('could not apply the editor defaults: ' + e.message)
    }
  }

  /**
   * The release shows first-run help tips ("Multipage view" and three others). They
   * cover the document. The tip manager hides a tip whose name is set in local
   * storage; set every tip name before the editor starts.
   */
  function suppressFirstRunTips() {
    try {
      var storage = window.localStorage
      if (!storage) return
      storage.setItem('de-help-tip-multipage-view-statusbar', 'true')
      storage.setItem('de-help-tip-header-footer-tab', 'true')
      storage.setItem('de-help-tip-fill-status', 'true')
      storage.setItem('de-help-tip-signature', 'true')
    } catch (e) {
      log('could not suppress the first-run tips: ' + e.message)
    }
  }

  /** Fit the page to the frame width, so the draft is readable in the view pane. */
  function fitToWidth() {
    // Kept as a documented helper. It is not called on open: this build warns
    // "an error occurred during the work with the document" when the zoom changes
    // while the first layout is still settling. The advocate uses the editor's own
    // zoom controls instead.
    var editor = ascEditor()
    if (editor && typeof editor.zoomFitToWidth === 'function') {
      try { editor.zoomFitToWidth() } catch (e) { log('could not fit the page width: ' + e.message) }
    }
  }

  // ---- save path ----

  function stringToBytes(text) {
    var bytes = new Uint8Array(text.length)
    for (var i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff
    return bytes
  }

  function base64ToBytes(base64) {
    var binary = window.atob(base64)
    var bytes = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i) & 0xff
    return bytes
  }

  /** The editor's own document package: `asc_nativeGetFile3` gives header and base64 data. */
  function nativePackage() {
    var editor = ascEditor()
    if (!editor) return null
    try {
      if (typeof editor.asc_nativeGetFile3 === 'function') {
        var three = editor.asc_nativeGetFile3()
        if (three && typeof three.data === 'string' && three.data.length > 0) return { base64: three.data }
      }
      if (typeof editor.asc_nativeGetFile === 'function') {
        var legacy = editor.asc_nativeGetFile()
        if (typeof legacy === 'string' && legacy.length > 0) {
          var parts = legacy.split(';')
          if (parts.length >= 4 && parts[0] === 'DOCY') return { base64: parts.slice(3).join(';') }
          return { binary: legacy }
        }
      }
    } catch (e) {
      log('could not read the document bytes: ' + e.message)
    }
    return null
  }

  function endEditorSave(error) {
    var ew = editorWindow()
    if (ew && typeof ew.DesktopOfflineAppDocumentEndSave === 'function') {
      try { ew.DesktopOfflineAppDocumentEndSave(error, null, undefined) } catch (e) { log('end save failed: ' + e.message) }
    }
  }

  function startSave(options) {
    var pkg = nativePackage()
    if (!pkg) {
      if (options.fromEditor) endEditorSave(2)
      if (options.commandRequestId) commandResult(options.commandRequestId, false, null, 'the editor returned no document bytes')
      return
    }
    var requestId = nextId('save')
    state.saves[requestId] = options
    var bytes = pkg.base64 !== undefined ? base64ToBytes(pkg.base64) : stringToBytes(pkg.binary)
    post({ type: 'oa-editor/save-request', doc: docId, requestId: requestId, bytes: bytes.buffer }, [bytes.buffer])
  }

  function onSaveResult(data) {
    var options = state.saves[data.requestId]
    if (!options) return
    delete state.saves[data.requestId]
    if (data.ok === true) {
      if (options.fromEditor) endEditorSave(0)
      if (options.commandRequestId) commandResult(options.commandRequestId, true, { revision: data.revision || null })
      markSaved()
    } else {
      if (options.fromEditor) endEditorSave(2)
      if (options.commandRequestId) commandResult(options.commandRequestId, false, null, data.message || data.code || 'the save was refused')
      log('save refused: ' + (data.message || data.code || 'unknown'))
    }
  }

  // ---- commands from the harness bar ----

  function setDisplayMode(mode) {
    var editor = ascEditor()
    var ew = editorWindow()
    var Asc = ew && ew.Asc
    if (!editor || !Asc || !Asc.c_oAscDisplayModeInReview) throw new Error('the editor has no review display modes')
    var modes = Asc.c_oAscDisplayModeInReview
    var value = mode === 'original' ? modes.Original : mode === 'edit' ? modes.Edit : modes.Final
    editor.asc_SetDisplayModeInReview(value)
  }

  /**
   * The review display mode needs the document layout. Called through the harness bar
   * right after the frame reports ready, it can arrive one layout step early: retry.
   */
  function requestDisplayMode(mode) {
    var tries = 0
    function attempt() {
      try {
        setDisplayMode(mode)
      } catch (e) {
        tries += 1
        if (tries < 10) setTimeout(attempt, 200)
        else log('could not set the view mode: ' + e.message)
      }
    }
    attempt()
  }

  /** The anchor of the paragraph at the cursor, through the builder API (step 4 verification). */
  function currentAnchor() {
    var api = builderApi()
    if (api) {
      try {
        var document = api.GetDocument()
        var control = document.GetCurrentContentControl()
        if (control && typeof control.GetTag === 'function') {
          var tag = control.GetTag()
          if (tag) return String(tag)
        }
      } catch (e) {}
    }
    var editor = ascEditor()
    try {
      if (editor && typeof editor.asc_GetContentControlProperties === 'function') {
        var props = editor.asc_GetContentControlProperties()
        if (props && props.Tag) return String(props.Tag)
      }
    } catch (e) {}
    return null
  }

  /**
   * Insert one Notebook sentence as a new anchored paragraph. The block content
   * control is created with the builder API, tagged with the anchor, and added at
   * the end of the document (v0: the end; see docs/editor-design.md).
   */
  function insertEvent(args) {
    var anchor = args && typeof args.anchor === 'string' ? args.anchor : ''
    var text = args && typeof args.text === 'string' ? args.text : ''
    if (!anchor || !text) throw new Error('insert needs an anchor and a text')
    var api = builderApi()
    if (!api) throw new Error('the document builder API is not available')
    var document = api.GetDocument()
    var paragraph = api.CreateParagraph()
    paragraph.AddText(text)
    var control = paragraph.InsertInContentControl(1)
    control.SetTag(anchor)
    if (typeof control.SetAlias === 'function') control.SetAlias('Open Advocate paragraph')
    document.Push(control)
    state.inserted = true
    reportDirty(true)
    return { anchor: anchor, position: 'end' }
  }

  /**
   * Move the cursor to the paragraph that carries one anchor (editor-design item f: the card
   * steps through agent changes and the editor follows). Builder API: content control by tag.
   */
  function goToAnchor(args) {
    var anchor = args && typeof args.anchor === 'string' ? args.anchor : ''
    if (!anchor) throw new Error('goToAnchor needs an anchor')
    var api = builderApi()
    if (!api) throw new Error('the document builder API is not available')
    var controls = api.GetDocument().GetContentControlsByTag(anchor)
    if (!controls || controls.length === 0) throw new Error('no paragraph carries the anchor ' + anchor)
    controls[0].Select()
    return { anchor: anchor, found: controls.length }
  }

  function handleCommand(data) {
    var requestId = data.requestId
    try {
      if (data.command === 'displayMode') {
        requestDisplayMode(data.args && data.args.mode)
        commandResult(requestId, true, { mode: data.args && data.args.mode })
      } else if (data.command === 'showSource') {
        commandResult(requestId, true, { anchor: currentAnchor() })
      } else if (data.command === 'goToAnchor') {
        commandResult(requestId, true, goToAnchor(data.args))
      } else if (data.command === 'insert') {
        commandResult(requestId, true, insertEvent(data.args))
      } else if (data.command === 'save') {
        startSave({ fromEditor: false, commandRequestId: requestId })
      } else {
        commandResult(requestId, false, null, 'unknown command: ' + String(data.command))
      }
    } catch (e) {
      commandResult(requestId, false, null, String(e && e.message ? e.message : e))
    }
  }

  window.addEventListener('message', function (event) {
    var data = event.data
    if (!data || typeof data !== 'object') return
    if (event.source !== window.parent) return
    if (data.doc && data.doc !== docId) return
    if (data.type === 'oa-editor/command') handleCommand(data)
    else if (data.type === 'oa-editor/save-result') onSaveResult(data)
    else if (data.type === 'oa-editor/ack') onAck(data.requestId)
  })

  // The shim calls these.
  window._oaDirty = reportDirty
  window._oaSaveFromEditor = function (isSaveAs) {
    if (isSaveAs) {
      log('save as is not available in this window')
      endEditorSave(2)
      return
    }
    startSave({ fromEditor: true })
  }

  // ---- open the document ----

  installFrameBridge()

  var info = null

  async function openDocument() {
    show('Opening ' + info.name + '…')
    var bytesResponse = await fetch('/api/bin?doc=' + encodeURIComponent(docId))
    if (!bytesResponse.ok) throw new Error('cannot read the document (' + bytesResponse.status + ')')
    var bytes = new Uint8Array(await bytesResponse.arrayBuffer())
    var ew = await waitForEditor(30000)
    window.AscDesktopEditor._editorWindow = ew
    state.editorWindow = ew
    window.AscDesktopEditor._currentDocType = info.kind
    patchFonts(ew)
    var file = new ew.AscCommon.OpenFileResult()
    file.data = bytes
    file.bSerFormat = info.kind === 'word'
    var attempt = 0
    for (;;) {
      try {
        ew.Asc.editor.openDocument(file)
        break
      } catch (error) {
        attempt += 1
        if (attempt > 20) throw error
        await new Promise(function (resolve) { setTimeout(resolve, 150) })
      }
    }
    log('document opened: ' + info.name + ' (' + bytes.length + ' bytes, attempt ' + (attempt + 1) + ')')
  }

  function editorConfigFor(info) {
    var layout = {
      toolbar: { file: false, plugins: false, protect: false },
      header: { users: false, editMode: false },
    }
    return {
      mode: info.readOnly ? 'view' : 'edit',
      lang: 'en',
      targetApp: 'desktop',
      user: { id: 'advocate', name: 'Advocate' },
      // No co-editing controls: one advocate, one machine (editor-design item d).
      coEditing: { mode: 'fast', change: false },
      // The ribbon is trimmed by configuration only (editor-design item d). Home
      // and Insert have no layout name, so they cannot be hidden and stay.
      customization: {
        about: false,
        feedback: false,
        macros: false,
        plugins: false,
        chat: false,
        layout: layout,
      },
    }
  }

  async function start() {
    try {
      suppressFirstRunTips()
      var infoResponse = await fetch('/api/info?doc=' + encodeURIComponent(docId))
      if (!infoResponse.ok) throw new Error('the document is not open (' + infoResponse.status + ')')
      info = await infoResponse.json()
      state.info = info
      window.AscDesktopEditor._currentDocType = info.kind
      document.title = info.name
      show('Starting the editor…')
      new DocsAPI.DocEditor('placeholder', {
        type: 'desktop',
        width: '100%',
        height: '100%',
        documentType: info.kind === 'pdf' ? 'pdf' : 'word',
        document: {
          title: info.name,
          url: '_offline_',
          fileType: info.kind === 'pdf' ? 'pdf' : 'docx',
          key: 'oa-' + docId,
          permissions: { edit: !info.readOnly, download: false, print: false, review: true, comment: false },
        },
        editorConfig: editorConfigFor(info),
        events: {
          onAppReady: function () {
            log('app ready')
            openDocument().catch(function (error) {
              log('open failed: ' + error.message)
              show('Cannot open the document: ' + error.message)
              report('failed', error.message)
            })
          },
          onDocumentReady: function () {
            log('document ready')
            hide()
            // The review display mode needs the document layout; applying it earlier
            // throws (m_pFaceInfo) and the editor reports a document error.
            setTimeout(function () { applyEditorDefaults() }, 0)
            setTimeout(function () { applyEditorDefaults() }, 500)
            // The opened document is the saved state: reset the editor's saved index
            // before the dirty watch starts, so an untouched draft is not "Unsaved".
            setTimeout(function () { markSaved() }, 600)
            setTimeout(function () { startDirtyWatch() }, 900)
            report('opened', info.name)
            reportDirty(false)
          },
          onError: function (event) {
            var detail = JSON.stringify(event && event.data ? event.data : {})
            log('editor error: ' + detail)
            report('error', detail)
          },
          onWarning: function (event) { log('editor warning: ' + JSON.stringify(event && event.data ? event.data : {})) },
        },
      })
    } catch (error) {
      log('boot failed: ' + error.message)
      show('Cannot start the editor: ' + error.message)
      report('failed', error.message)
    }
  }

  start()
})()


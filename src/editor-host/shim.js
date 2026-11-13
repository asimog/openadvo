/**
 * window.AscDesktopEditor: the object the Euro-Office editors expect from the
 * desktop shell. Our answers, over the oa-eo:// protocol of the main process.
 *
 * Carried over from advodsh plugins/workspace-editor/lib/editor/shim.js. Step 2
 * used it read only; step 4 adds the human save path: the editor's own save
 * command arrives in `LocalFileSave`, the host page (boot.js) hands the bytes to
 * the window, and the matter store makes a new revision. Unknown members are
 * no-ops, because the editors probe optional desktop features. Synchronous
 * probes stay synchronous: a promise there breaks start-up.
 */
(function () {
  'use strict'

  var params = new URLSearchParams(window.location.search)
  var docId = params.get('doc') || ''

  function log(message) {
    try { console.log('[editor-host] ' + message) } catch (e) {}
    try { fetch('/api/log', { method: 'POST', body: String(message), keepalive: true }) } catch (e) {}
  }
  window._ohLog = log

  /** Host facts the editors read synchronously. */
  window.RendererProcessVariable = {
    theme: { system: 'light' },
    localthemes: [],
    defaultPrinterName: '',
    isRtl: false,
  }

  function findEditorWindow(win) {
    try { if (win.AscCommon) return win } catch (e) {}
    for (var i = 0; i < win.frames.length; i += 1) {
      var found = findEditorWindow(win.frames[i])
      if (found) return found
    }
    return null
  }

  var shim = {
    _editorWindow: null,
    _currentDocType: 'word',
    _isModified: false,
    _docId: docId,

    IsLocalFile: function () { return true },
    LocalFileGetSourcePath: function () { return '' },
    CheckUserId: function () { return 'advocate' },
    getViewportSettings: function () { return { widgetType: 'window' } },
    isSupportBinaryFontsSprite: false,

    CreateEditorApi: function () {
      var ew = findEditorWindow(window)
      if (ew) window.AscDesktopEditor._editorWindow = ew
    },

    /** The host page opens the document itself, in boot.js. */
    LocalStartOpen: function () {},
    LocalFileOpen: function () { log('open from inside the editor is not available') },

    /**
     * The editor's own save command (Ctrl+S, the editor's save icon, or the
     * desktop shell's native "save" message). The host page collects the bytes
     * and the window saves them as a new revision.
     */
    LocalFileSave: function (param, password, docinfo, fileType, jsonOptions, oldPassword) {
      var isSaveAs = typeof param === 'string' && param.indexOf('saveas=true') !== -1
      if (typeof window._oaSaveFromEditor === 'function') window._oaSaveFromEditor(isSaveAs)
      else log('save refused: the host page has no save path')
    },
    LocalFileGetSaved: function () { return true },
    LocalFileGetModified: function () { return window.AscDesktopEditor._isModified },
    LocalFileSetModified: function (modified) {
      window.AscDesktopEditor._isModified = !!modified
      if (typeof window._oaDirty === 'function') window._oaDirty(!!modified)
    },
    LocalFileGetOpenChangesCount: function () { return 0 },
    LocalFileSaveChanges: function () {},
    LocalFileGetImageUrl: function (url) { return url },
    /** The editor reports its own modified state here (WD-009, WD-010). */
    onDocumentModifiedChanged: function (modified) {
      if (typeof modified !== 'boolean') return
      window.AscDesktopEditor._isModified = modified
      if (typeof window._oaDirty === 'function') window._oaDirty(modified)
    },
    SetDocumentName: function () {},
    execCommand: function () {},
    getDocumentModified: function () { return window.AscDesktopEditor._isModified },

    GetInstallPlugins: function () {
      return JSON.stringify([{ url: '', pluginsData: [] }, { url: '', pluginsData: [] }])
    },
    IsSignaturesSupport: function () { return false },
    IsProtectionSupport: function () { return false },
    IsSupportNativePrint: function () { return false },
    GetSupportedScaleValues: function () { return [] },
    isBlockchainSupport: function () { return false },
    PreloadCryptoImage: function () { return '' },
    LoadFontBase64: function () { return null },
    Print: function () {},
  }

  window.AscDesktopEditor = new Proxy(shim, {
    get: function (target, property) {
      if (property in target) return target[property]
      if (typeof property === 'symbol') return undefined
      return function () { return Promise.resolve(undefined) }
    },
  })
})()

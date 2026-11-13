/**
 * window.AscDesktopEditor: the object the Euro-Office editors expect from the
 * desktop shell. Our answers, over the oa-eo:// protocol of the main process.
 *
 * Carried over from advodsh plugins/workspace-editor/lib/editor/shim.js and cut
 * to what a read-only view needs (build step 2). Unknown members are no-ops,
 * because the editors probe optional desktop features. Synchronous probes stay
 * synchronous: a promise there breaks start-up.
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
    _currentDocType: 'pdf',
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
    /** Step 2 views sources read only. Saving arrives with drafts at build step 4. */
    LocalFileSave: function () { log('save refused: read-only view') },
    LocalFileGetSaved: function () { return true },
    LocalFileGetModified: function () { return false },
    LocalFileSetModified: function () {},
    LocalFileGetOpenChangesCount: function () { return 0 },
    LocalFileSaveChanges: function () {},
    LocalFileGetImageUrl: function (url) { return url },
    onDocumentModifiedChanged: function () {},
    SetDocumentName: function () {},
    execCommand: function () {},
    getDocumentModified: function () { return false },

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

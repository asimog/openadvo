/**
 * Boot one document in the Euro-Office editor: mount DocsAPI.DocEditor in desktop
 * mode and hand the editor the bytes the main process opened for this view.
 * Carried over from advodsh plugins/workspace-editor/lib/editor/boot.js.
 */
(function () {
  'use strict'

  var params = new URLSearchParams(window.location.search)
  var docId = params.get('doc') || ''
  var status = document.getElementById('status')
  var log = window._ohLog || function () {}

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
  /** Tell the window how the view stands; it shows this beside the source. */
  function report(state, detail) {
    try { window.parent.postMessage({ type: 'oa-editor/state', doc: docId, state: state, detail: detail || '' }, '*') } catch (e) {}
  }

  window.addEventListener('error', function (event) { log('page error: ' + (event && event.message ? event.message : 'unknown')) })
  window.addEventListener('unhandledrejection', function (event) { log('unhandled rejection: ' + (event && event.reason ? event.reason : 'unknown')) })

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
  installFrameBridge()

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

  var info = null

  async function openDocument() {
    show('Opening ' + info.name + '…')
    var bytesResponse = await fetch('/api/bin?doc=' + encodeURIComponent(docId))
    if (!bytesResponse.ok) throw new Error('cannot read the document (' + bytesResponse.status + ')')
    var bytes = new Uint8Array(await bytesResponse.arrayBuffer())
    var ew = await waitForEditor(30000)
    window.AscDesktopEditor._editorWindow = ew
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
    hide()
    report('opened', info.name)
  }

  async function start() {
    try {
      var infoResponse = await fetch('/api/info?doc=' + encodeURIComponent(docId))
      if (!infoResponse.ok) throw new Error('the document is not open (' + infoResponse.status + ')')
      info = await infoResponse.json()
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
          permissions: { edit: !info.readOnly, download: false, print: false, review: false, comment: false },
        },
        editorConfig: {
          mode: info.readOnly ? 'view' : 'edit',
          lang: 'en',
          targetApp: 'desktop',
          user: { id: 'advocate', name: 'Advocate' },
          customization: { about: false, feedback: false, macros: false, plugins: false },
        },
        events: {
          onAppReady: function () {
            log('app ready')
            openDocument().catch(function (error) {
              log('open failed: ' + error.message)
              show('Cannot open the document: ' + error.message)
              report('failed', error.message)
            })
          },
          onDocumentReady: function () { log('document ready'); hide() },
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

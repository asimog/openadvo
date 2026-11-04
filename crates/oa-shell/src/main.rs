//! `oa-shell`: the advocate's window (spec A). It holds no canonical state.
//! Every action is a control command sent over the pipe to the kernel, the
//! same commands the agent and the CLI issue (spec A rule 6). If no kernel is
//! serving, the shell starts `oa kernel serve` beside itself (a stub until the
//! supervisor, D15).
//!
//! `oa-shell --gallery <view> [--screenshot <png>]` renders one view in each
//! fixture state with no kernel (A17).

mod bar;
mod conn;
mod docviews;
mod gallery;
mod inbox;
mod inspector;
mod layout;
mod model;
mod paint;
mod views;

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use eframe::egui;
use inbox::{Effect, Inbox, Key};
use inspector::Inspected;
use layout::{Layout, Page};
use oa_client::{Client, PipeClient};
use oa_kernel::{ClientSpec, Request};
use oa_types::{new_key, OaError, Origin};
use serde_json::{json, Value};
use views::{Subject, Table, ViewId, ViewState, REGISTRY};

fn app_data() -> PathBuf {
    std::env::var_os("OA_APP_DATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join("OpenAdvocate")))
        .unwrap_or_else(|| PathBuf::from(".openadvocate"))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Connects to the kernel, starting one if none is serving.
fn connect(app: &PathBuf) -> Result<(PipeClient, Option<Child>), OaError> {
    if let Ok(c) = PipeClient::connect(app, Origin::Ui) {
        return Ok((c, None));
    }
    let oa = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|d| d.join("oa.exe")))
        .unwrap_or_else(|| PathBuf::from("oa"));
    let child = Command::new(oa)
        .arg("--app-data")
        .arg(app)
        .args(["kernel", "serve"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            OaError::new(
                oa_types::ErrorCode::Unavailable,
                format!("cannot start the kernel: {e}"),
            )
        })?;
    PipeClient::connect(app, Origin::Ui).map(|c| (c, Some(child)))
}

/// What one pane shows right now.
enum Content {
    Table(Table),
    Overview(Vec<(String, String)>),
}

struct PaneUi {
    content: Content,
    selected: Option<usize>,
    search_text: String,
}

impl PaneUi {
    fn new() -> Self {
        PaneUi {
            content: Content::Table(Table::loading(ViewId::Matters)),
            selected: None,
            search_text: String::new(),
        }
    }
}

struct App {
    app: PathBuf,
    client: Option<PipeClient>,
    kernel_child: Option<Child>,
    monitor: conn::Monitor,
    last_beat_ms: u64,
    last_refresh_ms: u64,
    status: String,

    matters: Vec<Value>,
    selected: Option<String>,
    new_title: String,
    rename_to: String,
    show_removed: bool,

    layout: Layout,
    panes: Vec<PaneUi>,
    width: f32,

    inbox: Inbox,
    inbox_open: bool,

    inspector: Option<Inspected>,
    inspector_matter: String,
    inspector_error: Option<String>,

    bar_open: bool,
    bar_text: String,
    frecency: bar::Frecency,

    setting_key: String,
    setting_value: String,
    decision_reason: String,
    /// The review note being written in the Changes viewer.
    note_text: String,
    note_to_agent: bool,

    chrono_view: String,
    chrono_show_excluded: bool,
    skip_reason: String,
}

impl App {
    fn new() -> Self {
        let app = app_data();
        let mut me = App {
            app: app.clone(),
            client: None,
            kernel_child: None,
            monitor: conn::Monitor::default(),
            last_beat_ms: 0,
            last_refresh_ms: 0,
            status: String::new(),
            matters: Vec::new(),
            selected: None,
            new_title: String::new(),
            rename_to: String::new(),
            show_removed: false,
            layout: Layout::new(ViewId::Matters),
            panes: vec![PaneUi::new()],
            width: 1920.0,
            inbox: Inbox::default(),
            inbox_open: false,
            inspector: None,
            inspector_matter: String::new(),
            inspector_error: None,
            bar_open: false,
            bar_text: String::new(),
            frecency: load_frecency(&app),
            setting_key: String::new(),
            setting_value: String::new(),
            decision_reason: String::new(),
            note_text: String::new(),
            note_to_agent: false,
            chrono_view: "synopsis".into(),
            chrono_show_excluded: false,
            skip_reason: String::new(),
        };
        me.reconnect();
        me
    }

    fn reconnect(&mut self) {
        match connect(&self.app) {
            Ok((c, child)) => {
                self.monitor.ok(now_ms(), c.origin().as_str());
                self.client = Some(c);
                if child.is_some() {
                    self.kernel_child = child;
                }
                self.status.clear();
                self.refresh();
            }
            Err(e) => self.status = format!("Disconnected: {}", e.message),
        }
    }

    fn connected(&self) -> bool {
        matches!(self.monitor.state(now_ms()), conn::Conn::Connected { .. })
    }

    fn q(&self, req: Request) -> Result<Vec<Value>, OaError> {
        let client = self.client.as_ref().ok_or_else(|| {
            OaError::new(
                oa_types::ErrorCode::Unavailable,
                "not connected to the kernel",
            )
        })?;
        client.call(None, req)
    }

    fn act(&mut self, req: Request) -> Option<Vec<Value>> {
        let result = match &self.client {
            Some(c) => c.call(Some(new_key()), req),
            None => Err(OaError::new(
                oa_types::ErrorCode::Unavailable,
                "not connected to the kernel",
            )),
        };
        match result {
            Ok(v) => Some(v),
            Err(e) => {
                self.status = format!("{}: {}", e.code.as_str(), e.message);
                None
            }
        }
    }

    /// A cheap query once a second tells the status bar whether the kernel
    /// still answers (A-AC-20).
    fn heartbeat(&mut self) {
        let now = now_ms();
        if now.saturating_sub(self.last_beat_ms) < 1000 {
            return;
        }
        self.last_beat_ms = now;
        if self.client.is_none() {
            return;
        }
        match self.q(Request::JobList) {
            Ok(_) => {
                let origin = self.client.as_ref().map(|c| c.origin().as_str());
                self.monitor.ok(now, origin.unwrap_or("ui"));
            }
            Err(e) => self.status = format!("{}: {}", e.code.as_str(), e.message),
        }
    }

    fn refresh(&mut self) {
        self.matters = self
            .q(Request::MatterList {
                include_removed: true,
            })
            .unwrap_or_default();
        self.rebuild_inbox();
        self.reload_panes();
        self.last_refresh_ms = now_ms();
    }

    fn rebuild_inbox(&mut self) {
        let mut src = inbox::Sources {
            rejected: self
                .q(Request::AuditRejected { matter: None })
                .unwrap_or_default(),
            captures: self.q(Request::CaptureStatus).unwrap_or_default(),
            ingests: self
                .q(Request::IngestStatus { doc: None })
                .unwrap_or_default(),
            adapters: self.q(Request::AdapterHealth).unwrap_or_default(),
            ocr_disputes: self
                .q(Request::OcrDisputes {
                    matter: None,
                    doc: None,
                })
                .unwrap_or_default(),
            ..inbox::Sources::default()
        };
        for m in &self.matters {
            let id = m["id"].as_str().unwrap_or_default().to_string();
            let removed = m["removed"].as_bool().unwrap_or(false);
            src.matters.push((
                id.clone(),
                m["title"].as_str().unwrap_or_default().to_string(),
                removed,
                m["path"].as_str().unwrap_or_default().to_string(),
            ));
            if removed {
                continue;
            }
            src.duplicates.extend(
                self.q(Request::EvidenceDuplicates { matter: id.clone() })
                    .unwrap_or_default()
                    .into_iter()
                    .map(|d| (id.clone(), d)),
            );
            for a in self
                .q(Request::ApprovalList { matter: id.clone() })
                .unwrap_or_default()
            {
                src.approvals.push((id.clone(), a));
            }
            if let Err(e) = self.q(Request::LedgerVerify { matter: id.clone() }) {
                if let Some(seq) = e.detail.as_ref().and_then(|d| d["first_bad_seq"].as_i64()) {
                    src.broken_chains.push((id.clone(), seq));
                }
            }
            for e in self
                .q(Request::EvidenceList { matter: id.clone() })
                .unwrap_or_default()
            {
                let eid = e["id"].as_str().unwrap_or_default().to_string();
                let shown = self.q(Request::EvidenceShow {
                    matter: id.clone(),
                    id: eid.clone(),
                });
                if let Ok(v) = shown {
                    if v[0]["bytes_present"] == false {
                        src.missing_bytes.push((
                            id.clone(),
                            eid,
                            v[0]["original_name"]
                                .as_str()
                                .unwrap_or_default()
                                .to_string(),
                        ));
                    }
                }
            }
        }
        self.inbox.set(inbox::build(&src));
    }

    fn sync_panes(&mut self) {
        while self.panes.len() < self.layout.panes.len() {
            self.panes.push(PaneUi::new());
        }
        self.panes.truncate(self.layout.panes.len());
    }

    fn reload_panes(&mut self) {
        self.sync_panes();
        for i in 0..self.layout.panes.len() {
            let page = self.layout.panes[i].page.clone();
            let content = self.load(&page);
            self.panes[i].content = content;
        }
    }

    fn navigate(&mut self, view: ViewId, arg: Option<String>) {
        let i = self.layout.focused;
        self.layout.panes[i].navigate(Page { view, arg });
        self.panes[i].selected = None;
        self.reload_panes();
    }

    fn split(&mut self, view: ViewId) {
        if self.layout.split(view, self.width) {
            self.sync_panes();
            self.reload_panes();
        } else {
            self.status = format!(
                "No room for another split at {:.0} px; widen the window.",
                self.width
            );
        }
    }

    fn matter_scoped<F>(&self, view: ViewId, f: F) -> Content
    where
        F: FnOnce(&str) -> Table,
    {
        match &self.selected {
            Some(id) => Content::Table(f(id)),
            None => Content::Table(Table {
                state: ViewState::Empty("Select a matter in the sidebar.".into()),
                ..Table::loading(view)
            }),
        }
    }

    fn fail(view: ViewId, e: &OaError) -> Table {
        Table::failed(view, format!("{}: {}", e.code.as_str(), e.message))
    }

    fn load(&self, page: &Page) -> Content {
        let view = page.view;
        match view {
            ViewId::Matters => Content::Table(
                match self.q(Request::MatterList {
                    include_removed: true,
                }) {
                    Ok(v) => views::matters_table(&v),
                    Err(e) => Self::fail(view, &e),
                },
            ),
            ViewId::Overview => match self.selected_matter() {
                Some(m) => {
                    let pin = self
                        .q(Request::RulesPin {
                            matter: m["id"].as_str().unwrap_or_default().to_string(),
                        })
                        .ok()
                        .and_then(|mut v| v.pop())
                        .unwrap_or(Value::Null);
                    Content::Overview(views::overview_lines(&m, &pin))
                }
                None => Content::Table(Table {
                    state: ViewState::Empty("Select a matter in the sidebar.".into()),
                    ..Table::loading(view)
                }),
            },
            ViewId::Ledger => self.matter_scoped(view, |id| {
                let events = match self.q(Request::LedgerTail {
                    matter: id.to_string(),
                    n: Some(500),
                }) {
                    Ok(v) => v,
                    Err(e) => return Self::fail(view, &e),
                };
                let first_bad = match self.q(Request::LedgerVerify {
                    matter: id.to_string(),
                }) {
                    Ok(_) => None,
                    Err(e) => e.detail.as_ref().and_then(|d| d["first_bad_seq"].as_i64()),
                };
                views::ledger_table(id, &events, first_bad)
            }),
            ViewId::Evidence => self.matter_scoped(view, |id| {
                match self.q(Request::EvidenceList {
                    matter: id.to_string(),
                }) {
                    Ok(list) => {
                        let shown: Vec<Value> = list
                            .iter()
                            .map(|e| {
                                self.q(Request::EvidenceShow {
                                    matter: id.to_string(),
                                    id: e["id"].as_str().unwrap_or_default().to_string(),
                                })
                                .ok()
                                .and_then(|mut v| v.pop())
                                .unwrap_or_else(|| e.clone())
                            })
                            .collect();
                        views::evidence_table(id, &shown)
                    }
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Drafts => self.matter_scoped(view, |id| {
                match self.q(Request::DraftList {
                    matter: id.to_string(),
                }) {
                    Ok(list) => {
                        let logs: Vec<Value> = list
                            .iter()
                            .filter_map(|d| {
                                self.q(Request::DraftLog {
                                    matter: id.to_string(),
                                    draft: d["id"].as_str().unwrap_or_default().to_string(),
                                })
                                .ok()
                                .and_then(|mut v| v.pop())
                            })
                            .collect();
                        views::drafts_table(id, &logs)
                    }
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Approvals => self.matter_scoped(view, |id| {
                match self.q(Request::ApprovalList {
                    matter: id.to_string(),
                }) {
                    Ok(v) => views::approvals_table(id, &v),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Rejected => Content::Table(
                match self.q(Request::AuditRejected {
                    matter: self.selected.clone(),
                }) {
                    Ok(v) => views::rejected_table(&v),
                    Err(e) => Self::fail(view, &e),
                },
            ),
            ViewId::Jobs => Content::Table(match self.q(Request::JobList) {
                Ok(v) => views::jobs_table(&v),
                Err(e) => Self::fail(view, &e),
            }),
            ViewId::Settings => Content::Table(match self.q(Request::SettingsList) {
                Ok(v) => views::settings_table(&v),
                Err(e) => Self::fail(view, &e),
            }),
            ViewId::Search => Content::Table(match page.arg.as_deref().filter(|a| !a.is_empty()) {
                None => Table {
                    state: ViewState::Empty("Type a query and press Enter.".into()),
                    ..Table::loading(view)
                },
                Some(query) => match self.q(Request::Find {
                    matter: self.selected.clone(),
                    query: query.to_string(),
                    kinds: Vec::new(),
                    filter: None,
                }) {
                    Ok(v) => views::search_table(&v),
                    Err(e) => Self::fail(view, &e),
                },
            }),
            ViewId::Inspector => Content::Table(Table {
                state: ViewState::Empty("Click any row to inspect it.".into()),
                ..Table::loading(view)
            }),
            ViewId::CaptureQueue => {
                let captures = self.q(Request::CaptureStatus).unwrap_or_default();
                let adapters = self.q(Request::AdapterHealth).unwrap_or_default();
                Content::Table(views::capture_queue_table(&captures, &adapters))
            }
            ViewId::IngestTriage => {
                Content::Table(match self.q(Request::IngestStatus { doc: None }) {
                    Ok(v) => views::ingest_table(&v),
                    Err(e) => Self::fail(view, &e),
                })
            }
            ViewId::Duplicates => self.matter_scoped(view, |id| {
                match self.q(Request::EvidenceDuplicates {
                    matter: id.to_string(),
                }) {
                    Ok(v) => views::duplicates_table(&v),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Codebook => {
                let scheme = page
                    .arg
                    .clone()
                    .unwrap_or_else(|| "supreme_court".to_string());
                match self.q(Request::CodebookShow { scheme }) {
                    Ok(v) => Content::Table(views::codebook_table(&v)),
                    Err(e) if e.code == oa_types::ErrorCode::NotFound => Content::Table(Table {
                        state: ViewState::Empty(
                            "No codebook has been captured for that scheme.".into(),
                        ),
                        ..Table::loading(view)
                    }),
                    Err(e) => Content::Table(Self::fail(view, &e)),
                }
            }
            ViewId::AdapterHealth => Content::Table(match self.q(Request::AdapterHealth) {
                Ok(v) => views::adapter_health_table(&v),
                Err(e) => Self::fail(view, &e),
            }),
            ViewId::OcrReview => self.matter_scoped(view, |id| {
                match self.q(Request::OcrDisputes {
                    matter: Some(id.to_string()),
                    doc: None,
                }) {
                    Ok(v) => views::ocr_disputes_table(&v),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::OcrPipeline => self.matter_scoped(view, |id| {
                match self.q(Request::OcrPipeline {
                    matter: Some(id.to_string()),
                }) {
                    Ok(v) => views::ocr_pipeline_table(&v),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::OcrLines => self.ocr_doc_view(view, page, |id, doc| {
                match self.q(Request::OcrLines {
                    matter: id.to_string(),
                    doc: doc.to_string(),
                    page: None,
                }) {
                    Ok(v) => views::ocr_lines_table(&v),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::OcrEngines => Content::Table(match self.q(Request::OcrEngines) {
                Ok(v) => views::ocr_engines_table(&v),
                Err(e) => Self::fail(view, &e),
            }),
            ViewId::Notebook => self.matter_scoped(view, |id| {
                match self.q(Request::NotebookShow {
                    matter: id.to_string(),
                    section: page.arg.clone(),
                }) {
                    Ok(mut v) => {
                        views::notebook_table(id, &v.pop().unwrap_or_default(), page.arg.as_deref())
                    }
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Facts => self.matter_scoped(view, |id| {
                match self.q(Request::NotebookFacts {
                    matter: id.to_string(),
                    status: None,
                }) {
                    Ok(v) => views::facts_table(id, &v),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Chronology => self.matter_scoped(view, |id| {
                let name = page.arg.clone().unwrap_or_else(|| "default".into());
                match self.q(Request::NotebookChronology {
                    matter: id.to_string(),
                    view: Some(name.clone()),
                    show_excluded: self.chrono_show_excluded,
                    for_prose: false,
                }) {
                    Ok(v) => views::chronology_table(id, &name, &v),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Conflicts => self.matter_scoped(view, |id| {
                match self.q(Request::NotebookConflicts {
                    matter: id.to_string(),
                }) {
                    Ok(v) => views::conflicts_table(&v),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Readiness => self.matter_scoped(view, |id| {
                match self.q(Request::NotebookReady {
                    matter: id.to_string(),
                }) {
                    Ok(mut v) => views::readiness_table(id, &v.pop().unwrap_or_default()),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Trace => {
                let Some(item) = page.arg.clone().filter(|a| !a.is_empty()) else {
                    return Content::Table(Table {
                        state: ViewState::Empty(
                            "Select an item in the Notebook, Factual Matrix or Chronology and choose Trace."
                                .into(),
                        ),
                        ..Table::loading(view)
                    });
                };
                self.matter_scoped(view, |id| {
                    match self.q(Request::Trace {
                        matter: id.to_string(),
                        id: item,
                    }) {
                        Ok(mut v) => views::trace_table(id, &v.pop().unwrap_or_default()),
                        Err(e) => Self::fail(view, &e),
                    }
                })
            }
            ViewId::Viewer => self.draft_view(view, page, |id, _draft, head| {
                let target = page.arg.clone().filter(|a| !a.is_empty()).unwrap_or(head);
                match self.q(Request::View {
                    matter: id.to_string(),
                    target,
                    page: None,
                }) {
                    Ok(mut v) => docviews::viewer_table(id, &v.pop().unwrap_or_default()),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Document => self.draft_view(view, page, |id, _draft, head| {
                let rev = page.arg.clone().filter(|a| !a.is_empty()).unwrap_or(head);
                match self.q(Request::DraftParagraphs {
                    matter: id.to_string(),
                    rev,
                }) {
                    Ok(mut v) => docviews::document_table(&v.pop().unwrap_or_default()),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::EditSurface => self.matter_scoped(view, |id| {
                match self.q(Request::DraftProposals {
                    matter: id.to_string(),
                    draft: page.arg.clone().filter(|a| !a.is_empty()),
                    all: false,
                }) {
                    Ok(v) => docviews::edit_surface_table(id, &v),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Changes => self.draft_view(view, page, |id, draft, _head| {
                match self.q(Request::DraftChanges {
                    matter: id.to_string(),
                    draft,
                }) {
                    Ok(mut v) => docviews::changes_table(id, &v.pop().unwrap_or_default()),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::WordCraft => self.draft_view(view, page, |id, draft, _head| {
                match self.q(Request::DraftEditorStatus {
                    matter: id.to_string(),
                    draft,
                }) {
                    Ok(mut v) => docviews::wordcraft_table(id, &v.pop().unwrap_or_default(), None),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Fidelity => self.draft_view(view, page, |id, _draft, head| {
                match self.q(Request::FidelityCheck {
                    matter: id.to_string(),
                    rev: head,
                }) {
                    Ok(mut v) => docviews::fidelity_table(&v.pop().unwrap_or_default()),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Conversion => self.matter_scoped(view, |id| {
                match self.q(Request::FilingConversions {
                    matter: id.to_string(),
                }) {
                    Ok(v) => docviews::conversion_table(id, &v),
                    Err(e) => Self::fail(view, &e),
                }
            }),
            ViewId::Entities => self.ocr_doc_view(view, page, |id, doc| {
                match self.q(Request::ExtractEntities {
                    matter: id.to_string(),
                    doc: doc.to_string(),
                }) {
                    Ok(v) => views::entities_table(&v),
                    Err(e) => Self::fail(view, &e),
                }
            }),
        }
    }

    /// A view of one draft: the draft named by the page argument when it is
    /// a draft id, else the matter's first draft. `f` gets the matter, the
    /// draft and its head.
    fn draft_view<F>(&self, view: ViewId, page: &Page, f: F) -> Content
    where
        F: FnOnce(&str, String, String) -> Table,
    {
        self.matter_scoped(view, |id| {
            let drafts = match self.q(Request::DraftList {
                matter: id.to_string(),
            }) {
                Ok(d) => d,
                Err(e) => return Self::fail(view, &e),
            };
            let chosen = drafts
                .iter()
                .find(|d| page.arg.as_deref() == d["id"].as_str())
                .or_else(|| drafts.first());
            match chosen {
                Some(d) => f(
                    id,
                    d["id"].as_str().unwrap_or_default().to_string(),
                    d["head"].as_str().unwrap_or_default().to_string(),
                ),
                None => Table {
                    state: ViewState::Empty(
                        "No draft yet. `oa draft new --template slp` generates one.".into(),
                    ),
                    ..Table::loading(view)
                },
            }
        })
    }

    fn ocr_doc_view<F>(&self, view: ViewId, page: &Page, f: F) -> Content
    where
        F: FnOnce(&str, &str) -> Table,
    {
        let Some(doc) = page.arg.as_deref().filter(|a| !a.is_empty()) else {
            return Content::Table(Table {
                state: ViewState::Empty(
                    "Open a document from Evidence to see its OCR lines.".into(),
                ),
                ..Table::loading(view)
            });
        };
        match &self.selected {
            Some(id) => Content::Table(f(id, doc)),
            None => Content::Table(Table {
                state: ViewState::Empty("Select a matter in the sidebar.".into()),
                ..Table::loading(view)
            }),
        }
    }

    fn selected_matter(&self) -> Option<Value> {
        let id = self.selected.as_deref()?;
        self.matters.iter().find(|m| m["id"] == id).cloned()
    }

    fn select_matter(&mut self, id: &str) {
        if let Some(v) = self.act(Request::MatterOpen { id: id.to_string() }) {
            self.rename_to = v[0]["title"].as_str().unwrap_or_default().to_string();
            self.selected = Some(id.to_string());
            if let Some((_, saved)) = load_layout(&self.app, id) {
                self.layout = saved;
                self.layout.fit(self.width);
                self.sync_panes();
            }
            self.refresh();
        } else {
            self.refresh();
        }
    }

    fn open_inspector(&mut self, subject: &Subject, fallback_matter: &str) {
        self.inspector_error = None;
        match subject {
            Subject::Raw(v) => {
                self.inspector = Some(inspector::from_raw(v));
            }
            Subject::Record { matter, id } => {
                let matter = if matter.is_empty() {
                    fallback_matter
                } else {
                    matter
                };
                self.inspector_matter = matter.to_string();
                match self.q(Request::Inspect {
                    matter: matter.to_string(),
                    id: id.clone(),
                }) {
                    Ok(v) => self.inspector = Some(inspector::from_inspect(&v[0])),
                    Err(e) => {
                        self.inspector = None;
                        self.inspector_error = Some(format!("{}: {}", e.code.as_str(), e.message));
                    }
                }
            }
        }
    }

    fn run_bar(&mut self, text: &str) {
        let now = now_ms();
        match bar::resolve(text, &self.frecency, now) {
            bar::Action::Command(name) => {
                self.frecency.record(name, now);
                save_frecency(&self.app, &self.frecency);
                match REGISTRY.iter().find(|d| d.covers.contains(&name)) {
                    Some(def) => self.navigate(def.id, None),
                    None => {
                        self.status = format!(
                            "{name} needs arguments. Run `oa {}` from a terminal, or use its view.",
                            name.replace('.', " ")
                        )
                    }
                }
            }
            bar::Action::Search(q) => self.navigate(ViewId::Search, Some(q)),
        }
    }

    fn handle_keys(&mut self, ctx: &egui::Context) {
        if ctx.input_mut(|i| i.consume_key(egui::Modifiers::COMMAND, egui::Key::K)) {
            self.bar_open = !self.bar_open;
        }
        if self.bar_open || !self.inbox_open || ctx.wants_keyboard_input() {
            return;
        }
        let pressed = |k| ctx.input(|i| i.key_pressed(k));
        let key = if pressed(egui::Key::J) {
            Some(Key::J)
        } else if pressed(egui::Key::K) {
            Some(Key::K)
        } else if pressed(egui::Key::Enter) {
            Some(Key::Enter)
        } else if pressed(egui::Key::E) {
            Some(Key::E)
        } else {
            None
        };
        if let Some(key) = key {
            match self.inbox.key(key) {
                Effect::Open(subject) => {
                    let m = self.selected.clone().unwrap_or_default();
                    self.open_inspector(&subject, &m);
                }
                Effect::NotArchivable(_) => {
                    self.status = "Signal items need a decision; they cannot be archived.".into()
                }
                Effect::Archived(_) | Effect::None => {}
            }
        }
    }

    fn sidebar(&mut self, ui: &mut egui::Ui) {
        ui.heading("Open Advocate");
        ui.add_space(4.0);
        ui.label(egui::RichText::new("Matters").strong());
        ui.horizontal(|ui| {
            if ui.small_button("Refresh").clicked() {
                self.refresh();
            }
            if ui
                .checkbox(&mut self.show_removed, "Show removed")
                .changed()
            {
                self.refresh();
            }
        });
        let mut clicked = None;
        egui::ScrollArea::vertical()
            .id_salt("matters")
            .max_height(ui.available_height() - 250.0)
            .show(ui, |ui| {
                for m in &self.matters {
                    let removed = m["removed"].as_bool().unwrap_or(false);
                    if removed && !self.show_removed {
                        continue;
                    }
                    let id = m["id"].as_str().unwrap_or_default();
                    let mut label = m["title"].as_str().unwrap_or("(no title)").to_string();
                    if m["archived"] == true {
                        label.push_str("  [archived]");
                    }
                    if removed {
                        label.push_str("  [removed]");
                    }
                    let sel = self.selected.as_deref() == Some(id);
                    if ui.selectable_label(sel, label).clicked() {
                        clicked = Some(id.to_string());
                    }
                }
            });
        if let Some(id) = clicked {
            self.select_matter(&id);
        }
        ui.separator();
        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut self.new_title)
                    .hint_text("New matter title")
                    .desired_width(ui.available_width() - 56.0),
            );
            if ui.button("Create").clicked() && !self.new_title.trim().is_empty() {
                let title = std::mem::take(&mut self.new_title);
                if self
                    .act(Request::MatterCreate {
                        title,
                        client: ClientSpec::None,
                        from: None,
                    })
                    .is_some()
                {
                    self.refresh();
                }
            }
        });
        if let Some(m) = self.selected_matter() {
            let id = m["id"].as_str().unwrap_or_default().to_string();
            ui.horizontal(|ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut self.rename_to)
                        .desired_width(ui.available_width() - 120.0),
                );
                if ui.button("Rename").clicked() {
                    let title = self.rename_to.clone();
                    if self
                        .act(Request::MatterRename {
                            id: id.clone(),
                            title,
                        })
                        .is_some()
                    {
                        self.refresh();
                    }
                }
                if m["archived"] != true
                    && ui.button("Archive").clicked()
                    && self
                        .act(Request::MatterArchive { id: id.clone() })
                        .is_some()
                {
                    self.refresh();
                }
            });
        }
        ui.separator();
        ui.label(egui::RichText::new("Views").strong());
        for def in REGISTRY.iter().filter(|d| d.id != ViewId::Inspector) {
            if ui.selectable_label(false, def.title).clicked() {
                self.navigate(def.id, None);
            }
        }
        for stub in model::STUBS {
            ui.add_enabled(
                false,
                egui::Button::new(format!(
                    "{} (spec {})",
                    stub.title,
                    stub.waits_for.split(',').next().unwrap_or("?")
                ))
                .frame(false),
            );
        }
        ui.separator();
        self.inbox_section(ui);
    }

    /// The review inbox, minimized to one line until opened (A08).
    fn inbox_section(&mut self, ui: &mut egui::Ui) {
        let signal = self.inbox.signal_count();
        let noise = self.inbox.noise_count();
        let arrow = if self.inbox_open { "v" } else { ">" };
        let head = format!("{arrow} Inbox   {signal} signal   {noise} noise");
        let mut text = egui::RichText::new(head);
        if signal > 0 {
            text = text.strong().color(paint::tone_color(views::Tone::Bad, ui));
        }
        if ui
            .add(egui::Button::new(text).frame(false))
            .on_hover_text("Open the review inbox. j and k move, Enter opens, e archives Noise.")
            .clicked()
        {
            self.inbox_open = !self.inbox_open;
        }
        if !self.inbox_open {
            return;
        }
        let visible = self.inbox.visible();
        let selected = self.inbox.selected;
        let mut open = None;
        egui::ScrollArea::vertical()
            .id_salt("inbox")
            .max_height(220.0)
            .show(ui, |ui| {
                if visible.is_empty() {
                    ui.label(egui::RichText::new("Nothing needs you.").weak());
                }
                let mut last_signal = None;
                for (i, item) in visible.iter().enumerate() {
                    let sig = inbox::is_signal(item);
                    if last_signal != Some(sig) {
                        ui.label(
                            egui::RichText::new(if sig { "SIGNAL" } else { "NOISE" })
                                .small()
                                .strong(),
                        );
                        last_signal = Some(sig);
                    }
                    let resp = ui.selectable_label(i == selected, &item.summary);
                    if !item.detail.is_empty() {
                        resp.clone().on_hover_text(&item.detail);
                    }
                    if resp.clicked() {
                        open = Some((i, item.subject.clone()));
                    }
                }
            });
        if let Some((i, subject)) = open {
            self.inbox.selected = i;
            let m = self.selected.clone().unwrap_or_default();
            self.open_inspector(&subject, &m);
        }
    }

    fn toolbar(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            let i = self.layout.focused;
            let (cb, cf) = {
                let p = &self.layout.panes[i];
                (p.can_back(), p.can_forward())
            };
            if ui.add_enabled(cb, egui::Button::new("< Back")).clicked() {
                self.layout.panes[i].back();
                self.reload_panes();
            }
            if ui.add_enabled(cf, egui::Button::new("Forward >")).clicked() {
                self.layout.panes[i].forward();
                self.reload_panes();
            }
            ui.separator();
            if ui
                .button("Split")
                .on_hover_text("Open another pane")
                .clicked()
            {
                self.split(ViewId::Ledger);
            }
            if ui.button("Save layout").clicked() {
                match &self.selected {
                    Some(m) => {
                        save_layout(&self.app, m, &self.layout);
                        self.status = "Layout saved for this matter.".into();
                    }
                    None => self.status = "Select a matter to save its layout.".into(),
                }
            }
            ui.separator();
            if ui.button("Commands  Ctrl+K").clicked() {
                self.bar_open = true;
            }
        });
    }

    fn panes_ui(&mut self, ui: &mut egui::Ui) {
        let n = self.layout.panes.len();
        let avail = ui.available_size();
        let gap = ui.spacing().item_spacing.x;
        let w = ((avail.x - gap * (n as f32 - 1.0)) / n as f32).max(200.0);
        let mut navigate = None;
        let mut close = None;
        let mut opened: Option<Subject> = None;
        let mut focus = None;
        let mut reload = false;
        ui.horizontal_top(|ui| {
            for i in 0..n {
                ui.allocate_ui_with_layout(
                    egui::vec2(w, avail.y),
                    egui::Layout::top_down(egui::Align::LEFT),
                    |ui| {
                        ui.set_width(w);
                        let focused = i == self.layout.focused;
                        let frame = egui::Frame::group(ui.style()).stroke(if focused {
                            ui.visuals().selection.stroke
                        } else {
                            ui.visuals().widgets.noninteractive.bg_stroke
                        });
                        frame.show(ui, |ui| {
                            ui.set_width(w - 18.0);
                            ui.set_min_height(avail.y - 20.0);
                            let view = self.layout.panes[i].page.view;
                            ui.horizontal(|ui| {
                                let mut chosen = view;
                                egui::ComboBox::from_id_salt(("pane", i))
                                    .selected_text(views::def(view).title)
                                    .show_ui(ui, |ui| {
                                        for d in
                                            REGISTRY.iter().filter(|d| d.id != ViewId::Inspector)
                                        {
                                            ui.selectable_value(&mut chosen, d.id, d.title);
                                        }
                                    });
                                if chosen != view {
                                    navigate = Some((i, chosen));
                                }
                                if n > 1
                                    && ui.small_button("x").on_hover_text("Close pane").clicked()
                                {
                                    close = Some(i);
                                }
                                if ui.small_button("focus").clicked() {
                                    focus = Some(i);
                                }
                            });
                            ui.separator();
                            let search_arg = self.layout.panes[i].page.arg.clone();
                            if view == ViewId::Search {
                                let pane = &mut self.panes[i];
                                if ui
                                    .add(
                                        egui::TextEdit::singleline(&mut pane.search_text)
                                            .hint_text("Search every record kind")
                                            .desired_width(w - 40.0),
                                    )
                                    .lost_focus()
                                    && ui.input(|k| k.key_pressed(egui::Key::Enter))
                                {
                                    let q = pane.search_text.clone();
                                    self.layout.panes[i].page.arg = Some(q);
                                    reload = true;
                                }
                                let _ = search_arg;
                            }
                            let pane = &mut self.panes[i];
                            match &pane.content {
                                Content::Table(t) => {
                                    if let Some(row) =
                                        paint::table(ui, ("table", i), t, &mut pane.selected)
                                    {
                                        opened = t.rows.get(row).map(|r| r.subject.clone());
                                    }
                                }
                                Content::Overview(lines) => paint::overview(ui, lines),
                            }
                        });
                    },
                );
            }
        });
        if let Some((i, view)) = navigate {
            self.layout.focused = i;
            self.navigate(view, None);
        }
        if let Some(i) = close {
            self.layout.close(i);
            self.sync_panes();
            self.reload_panes();
        }
        if let Some(i) = focus {
            self.layout.focused = i;
        }
        if reload {
            self.reload_panes();
        }
        if let Some(subject) = opened {
            let m = self.selected.clone().unwrap_or_default();
            self.open_inspector(&subject, &m);
        }
        self.view_extras(ui);
    }

    /// Controls under the panes that belong to the focused view: firm
    /// settings, and the deliberate approval decision (a human command).
    fn view_extras(&mut self, ui: &mut egui::Ui) {
        let i = self.layout.focused;
        let view = self.layout.panes[i].page.view;
        match view {
            ViewId::Settings => {
                ui.separator();
                ui.label("Change a firm preference (the legal layer is read only)");
                ui.horizontal(|ui| {
                    ui.add(
                        egui::TextEdit::singleline(&mut self.setting_key)
                            .hint_text("key, for example ui.theme"),
                    );
                    ui.add(egui::TextEdit::singleline(&mut self.setting_value).hint_text("value"));
                    if ui.button("Set").clicked() {
                        let (key, value) = (self.setting_key.clone(), self.setting_value.clone());
                        if self.act(Request::SettingsSet { key, value }).is_some() {
                            self.status = "Setting saved.".into();
                            self.reload_panes();
                        }
                    }
                });
            }
            ViewId::Approvals => {
                let Some(sel) = self.panes[i].selected else {
                    return;
                };
                let Content::Table(t) = &self.panes[i].content else {
                    return;
                };
                let Some(row) = t.rows.get(sel) else { return };
                if !row.cells[2].starts_with("pending") {
                    return;
                }
                let Subject::Record { matter, id } = row.subject.clone() else {
                    return;
                };
                let gate = row.cells[0].clone();
                let target = row.cells[1].clone();
                ui.separator();
                ui.label(
                    egui::RichText::new(format!(
                        "Decide gate {gate} for revision {target}. This records your decision."
                    ))
                    .strong(),
                );
                ui.add(
                    egui::TextEdit::singleline(&mut self.decision_reason)
                        .hint_text("Reason (required)"),
                );
                ui.horizontal(|ui| {
                    let ready = !self.decision_reason.trim().is_empty();
                    for (label, accept) in [
                        (format!("Accept gate {gate} for revision {target}"), true),
                        (format!("Reject gate {gate} for revision {target}"), false),
                    ] {
                        if ui.add_enabled(ready, egui::Button::new(label)).clicked() {
                            let reason = std::mem::take(&mut self.decision_reason);
                            if self
                                .act(Request::ApprovalDecide {
                                    matter: matter.clone(),
                                    id: id.clone(),
                                    accept,
                                    reason,
                                })
                                .is_some()
                            {
                                self.refresh();
                            }
                        }
                    }
                });
            }
            ViewId::OcrReview => {
                let Some(sel) = self.panes[i].selected else {
                    return;
                };
                let Content::Table(t) = &self.panes[i].content else {
                    return;
                };
                let Some(row) = t.rows.get(sel) else { return };
                let Subject::Raw(d) = row.subject.clone() else {
                    return;
                };
                let Some(matter) = self.selected.clone() else {
                    return;
                };
                let dispute = d["id"].as_str().unwrap_or_default().to_string();
                let a = d["reading_a"].as_str().unwrap_or_default().to_string();
                let b = d["reading_b"].as_str().unwrap_or_default().to_string();
                let doc = d["doc"].as_str().unwrap_or_default().to_string();
                ui.separator();
                ui.label(
                    egui::RichText::new(format!(
                        "Decide the OCR dispute in {doc}: \"{a}\" vs \"{b}\". This records your decision."
                    ))
                    .strong(),
                );
                ui.label(
                    egui::RichText::new("The page image region is shown by the viewer (spec J).")
                        .weak(),
                );
                ui.horizontal(|ui| {
                    for (label, reading) in [
                        (format!("Use reading A: {a}"), "a"),
                        (format!("Use reading B: {b}"), "b"),
                    ] {
                        if ui.button(label).clicked()
                            && self
                                .act(Request::OcrDecide {
                                    matter: matter.clone(),
                                    dispute: dispute.clone(),
                                    reading: reading.into(),
                                    text: None,
                                })
                                .is_some()
                        {
                            self.refresh();
                        }
                    }
                });
            }
            ViewId::Notebook
            | ViewId::Facts
            | ViewId::Chronology
            | ViewId::Conflicts
            | ViewId::Readiness => self.notebook_extras(ui, view),
            ViewId::EditSurface | ViewId::Changes | ViewId::WordCraft => {
                self.document_extras(ui, view)
            }
            _ => {}
        }
    }

    /// The spec J controls: accept or reject a proposal (human commands,
    /// named in full), revert an agent edit, add a review note, open and
    /// import WordCraft's working copy.
    fn document_extras(&mut self, ui: &mut egui::Ui, view: ViewId) {
        let Some(matter) = self.selected.clone() else {
            return;
        };
        let row = self.selected_row(view);
        match view {
            ViewId::EditSurface => {
                let Some(row) = row else { return };
                if !row.cells[2].starts_with("pending") {
                    return;
                }
                let (proposal, para) = (row.cells[0].clone(), row.cells[1].clone());
                ui.separator();
                ui.label(
                    egui::RichText::new(format!(
                        "Decide proposal {proposal} on paragraph {para}. This records your decision."
                    ))
                    .strong(),
                );
                ui.horizontal(|ui| {
                    if ui
                        .button(format!("Accept proposal {proposal} on paragraph {para}"))
                        .clicked()
                        && self
                            .act(Request::DraftAccept {
                                matter: matter.clone(),
                                proposal: proposal.clone(),
                            })
                            .is_some()
                    {
                        self.refresh();
                    }
                    if ui.button(format!("Reject proposal {proposal}")).clicked()
                        && self
                            .act(Request::DraftReject {
                                matter: matter.clone(),
                                proposal: proposal.clone(),
                                reason: None,
                            })
                            .is_some()
                    {
                        self.refresh();
                    }
                });
            }
            ViewId::Changes => {
                let Some(row) = row.filter(|r| r.cells[1] != "review note") else {
                    return;
                };
                let views::Subject::Record { id: rev, .. } = row.subject.clone() else {
                    return;
                };
                let Some(draft) = self.focused_draft(&matter) else {
                    return;
                };
                ui.separator();
                if row.tone == views::Tone::Warn && row.cells[1].starts_with("proposal") {
                    let label = format!("Revert agent edit {}", row.cells[0]);
                    if ui.button(label).clicked()
                        && self
                            .act(Request::DraftRevert {
                                matter: matter.clone(),
                                draft: draft.clone(),
                                rev: rev.clone(),
                            })
                            .is_some()
                    {
                        self.refresh();
                    }
                }
                let para = row.cells[3]
                    .split_whitespace()
                    .next()
                    .unwrap_or_default()
                    .to_string();
                if para.is_empty() {
                    return;
                }
                ui.horizontal(|ui| {
                    ui.add(
                        egui::TextEdit::singleline(&mut self.note_text)
                            .hint_text(format!("Review note on paragraph {para}")),
                    );
                    ui.checkbox(&mut self.note_to_agent, "Send to the agent");
                    let ready = !self.note_text.trim().is_empty();
                    if ui
                        .add_enabled(
                            ready,
                            egui::Button::new(format!("Add note on paragraph {para}")),
                        )
                        .clicked()
                    {
                        let text = std::mem::take(&mut self.note_text);
                        if self
                            .act(Request::DraftNote {
                                matter: matter.clone(),
                                draft: draft.clone(),
                                rev: rev.clone(),
                                para: para.clone(),
                                text,
                                to_agent: self.note_to_agent,
                            })
                            .is_some()
                        {
                            self.refresh();
                        }
                    }
                });
            }
            ViewId::WordCraft => {
                let Some(draft) = self.focused_draft(&matter) else {
                    return;
                };
                ui.separator();
                ui.horizontal(|ui| {
                    if ui.button("Open the head in WordCraft").clicked()
                        && self
                            .act(Request::DraftOpenEditor {
                                matter: matter.clone(),
                                draft: draft.clone(),
                            })
                            .is_some()
                    {
                        self.refresh();
                    }
                    for (label, autosave) in [
                        ("Import WordCraft's save as a revision", false),
                        ("Recover WordCraft's autosave as a revision", true),
                    ] {
                        if ui.button(label).clicked()
                            && self
                                .act(Request::DraftImportWorkingCopy {
                                    matter: matter.clone(),
                                    draft: draft.clone(),
                                    autosave,
                                })
                                .is_some()
                        {
                            self.refresh();
                        }
                    }
                });
            }
            _ => {}
        }
    }

    /// The draft the focused pane shows: its argument when it names a
    /// draft, else the matter's first draft.
    fn focused_draft(&self, matter: &str) -> Option<String> {
        let arg = self.layout.panes[self.layout.focused].page.arg.clone();
        let drafts = self
            .q(Request::DraftList {
                matter: matter.to_string(),
            })
            .ok()?;
        drafts
            .iter()
            .find(|d| arg.as_deref() == d["id"].as_str())
            .or_else(|| drafts.first())
            .and_then(|d| d["id"].as_str().map(str::to_string))
    }

    /// The focused pane's selected row, if its view is `view`.
    fn selected_row(&self, view: ViewId) -> Option<views::Row> {
        let i = self.layout.focused;
        if self.layout.panes[i].page.view != view {
            return None;
        }
        let sel = self.panes[i].selected?;
        let Content::Table(t) = &self.panes[i].content else {
            return None;
        };
        t.rows.get(sel).cloned()
    }

    /// The Notebook views' controls: section filter, trace, confirm,
    /// exclusion, skip and side-by-side sources (spec H GUI).
    fn notebook_extras(&mut self, ui: &mut egui::Ui, view: ViewId) {
        let Some(matter) = self.selected.clone() else {
            return;
        };
        if view == ViewId::Notebook {
            ui.separator();
            ui.horizontal_wrapped(|ui| {
                ui.label("Section:");
                if ui.button("All sections").clicked() {
                    self.navigate(ViewId::Notebook, None);
                }
                for key in [
                    "source_documents",
                    "procedural_history",
                    "factual_matrix",
                    "chronology",
                    "legal_issues",
                    "authorities",
                    "work_products",
                    "review",
                ] {
                    if ui.button(key.replace('_', " ")).clicked() {
                        self.navigate(ViewId::Notebook, Some(key.to_string()));
                    }
                }
            });
        }
        if view == ViewId::Chronology {
            ui.separator();
            ui.horizontal(|ui| {
                ui.label("View:");
                ui.add(egui::TextEdit::singleline(&mut self.chrono_view).desired_width(160.0));
                if ui.button("Show this view").clicked() {
                    let v = self.chrono_view.trim().to_string();
                    self.navigate(ViewId::Chronology, (!v.is_empty()).then_some(v));
                }
                if ui
                    .checkbox(&mut self.chrono_show_excluded, "Show excluded")
                    .changed()
                {
                    self.reload_panes();
                }
            });
        }
        let Some(row) = self.selected_row(view) else {
            return;
        };
        if view == ViewId::Readiness {
            let views::Subject::Record { id, .. } = &row.subject else {
                return;
            };
            if row.cells[0] != "review_item" {
                return;
            }
            let (id, label) = (id.clone(), row.cells[1].clone());
            ui.separator();
            ui.label(
                egui::RichText::new(format!(
                    "Skip review item \"{label}\". This records your decision."
                ))
                .strong(),
            );
            ui.add(
                egui::TextEdit::singleline(&mut self.skip_reason).hint_text("Reason (required)"),
            );
            let ready = !self.skip_reason.trim().is_empty();
            if ui
                .add_enabled(
                    ready,
                    egui::Button::new(format!("Skip review item: {label}")),
                )
                .clicked()
            {
                let reason = std::mem::take(&mut self.skip_reason);
                if self
                    .act(Request::NotebookSkip {
                        matter,
                        review: id,
                        reason,
                    })
                    .is_some()
                {
                    self.refresh();
                }
            }
            return;
        }
        if view == ViewId::Conflicts {
            let views::Subject::Raw(c) = &row.subject else {
                return;
            };
            let items: Vec<String> = c["items"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|i| i.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            ui.separator();
            if ui.button("Open each source side by side").clicked() {
                for item in items {
                    if self.layout.split(ViewId::Trace, self.width) {
                        let f = self.layout.focused;
                        self.layout.panes[f].page.arg = Some(item);
                    }
                }
                self.sync_panes();
                self.reload_panes();
            }
            return;
        }
        let Some(item) = views::item_of(&row).map(str::to_string) else {
            return;
        };
        ui.separator();
        ui.horizontal_wrapped(|ui| {
            if ui.button("Trace this item").clicked() {
                self.navigate(ViewId::Trace, Some(item.clone()));
            }
            if view == ViewId::Chronology {
                let name = self.layout.panes[self.layout.focused]
                    .page
                    .arg
                    .clone()
                    .unwrap_or_else(|| "default".into());
                let excluded = row.cells[4].starts_with("excluded");
                let category = row.cells[2].clone();
                let label = if excluded {
                    format!("Restore to view {name}")
                } else {
                    format!("Exclude from view {name}")
                };
                if ui.button(label).clicked()
                    && self
                        .act(Request::NotebookExclude {
                            matter: matter.clone(),
                            view: name.clone(),
                            event: Some(item.clone()),
                            category: None,
                            restore: excluded,
                        })
                        .is_some()
                {
                    self.reload_panes();
                }
                if !category.is_empty()
                    && ui
                        .button(format!("Exclude category {category} from view {name}"))
                        .clicked()
                    && self
                        .act(Request::NotebookExclude {
                            matter: matter.clone(),
                            view: name,
                            event: None,
                            category: Some(category),
                            restore: false,
                        })
                        .is_some()
                {
                    self.reload_panes();
                }
            }
        });
        if view == ViewId::Facts && row.cells[7] != "confirmed" {
            let (date, event) = (row.cells[0].clone(), row.cells[2].clone());
            if row.cells[5] == "OCR disputed" {
                ui.label(
                    egui::RichText::new(
                        "This date rests on an open OCR dispute. Decide it in OCR review before confirming.",
                    )
                    .weak(),
                );
                return;
            }
            ui.label(
                egui::RichText::new(format!(
                    "Confirm the fact dated {date}: \"{event}\". This records your decision."
                ))
                .strong(),
            );
            if ui.button(format!("Confirm fact dated {date}")).clicked()
                && self
                    .act(Request::NotebookConfirm { matter, id: item })
                    .is_some()
            {
                self.refresh();
            }
        }
    }

    fn inspector_drawer(&mut self, ctx: &egui::Context) {
        if self.inspector.is_none() && self.inspector_error.is_none() {
            return;
        }
        let mut close = false;
        let mut follow: Option<String> = None;
        egui::TopBottomPanel::bottom("inspector")
            .resizable(true)
            .default_height(240.0)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.heading("Inspector");
                    if ui.button("Close").clicked() {
                        close = true;
                    }
                    if let Some(i) = &self.inspector {
                        if ui.button("Copy raw record").clicked() {
                            ui.ctx().copy_text(i.raw.clone());
                        }
                    }
                });
                if let Some(err) = &self.inspector_error {
                    ui.colored_label(paint::tone_color(views::Tone::Bad, ui), err);
                }
                let Some(i) = &self.inspector else { return };
                ui.label(format!("{}  {}", i.kind, i.id));
                if let Some(p) = &i.produced_by {
                    ui.label(format!("Produced by: {p}"));
                }
                ui.columns(3, |cols| {
                    cols[0].label(egui::RichText::new("Raw record").strong());
                    egui::ScrollArea::vertical()
                        .id_salt("raw")
                        .show(&mut cols[0], |ui| {
                            ui.add(
                                egui::Label::new(egui::RichText::new(&i.raw).monospace()).wrap(),
                            );
                        });
                    cols[1].label(egui::RichText::new("Ledger events").strong());
                    egui::ScrollArea::vertical()
                        .id_salt("ev")
                        .show(&mut cols[1], |ui| {
                            if i.events.is_empty() {
                                ui.label(egui::RichText::new("none").weak());
                            }
                            for e in &i.events {
                                ui.label(format!(
                                    "#{} {} ({} by {})",
                                    e.seq, e.command, e.origin, e.actor
                                ));
                            }
                        });
                    cols[2].label(egui::RichText::new("Links out and in").strong());
                    egui::ScrollArea::vertical()
                        .id_salt("ln")
                        .show(&mut cols[2], |ui| {
                            if i.links.is_empty() {
                                ui.label(egui::RichText::new("none").weak());
                            }
                            for l in &i.links {
                                let text = format!("{} {} ({})", l.direction, l.other, l.via);
                                if ui.link(text).clicked() {
                                    follow = Some(l.other.clone());
                                }
                            }
                        });
                });
            });
        if close {
            self.inspector = None;
            self.inspector_error = None;
        }
        if let Some(id) = follow {
            let matter = self.inspector_matter.clone();
            self.open_inspector(
                &Subject::Record {
                    matter: matter.clone(),
                    id,
                },
                &matter,
            );
        }
    }

    fn command_bar(&mut self, ctx: &egui::Context) {
        if !self.bar_open {
            return;
        }
        let mut open = true;
        let mut run: Option<String> = None;
        egui::Window::new("Commands")
            .open(&mut open)
            .collapsible(false)
            .anchor(egui::Align2::CENTER_TOP, [0.0, 80.0])
            .default_width(480.0)
            .show(ctx, |ui| {
                let resp = ui.add(
                    egui::TextEdit::singleline(&mut self.bar_text)
                        .hint_text("Type a command, or search for anything")
                        .desired_width(f32::INFINITY),
                );
                resp.request_focus();
                if resp.has_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                    run = Some(self.bar_text.clone());
                }
                let ranked = bar::rank(&self.bar_text, &self.frecency, now_ms());
                egui::ScrollArea::vertical()
                    .max_height(260.0)
                    .show(ui, |ui| {
                        for name in ranked.iter().take(12) {
                            if ui.selectable_label(false, *name).clicked() {
                                run = Some(name.to_string());
                            }
                        }
                    });
                ui.small(
                    "Enter runs the top command. Text that matches no command searches instead.",
                );
            });
        if let Some(text) = run {
            self.bar_open = false;
            self.bar_text.clear();
            self.run_bar(&text);
        }
        if !open {
            self.bar_open = false;
        }
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.width = ctx.screen_rect().width();
        self.heartbeat();
        if now_ms().saturating_sub(self.last_refresh_ms) > 2500 && self.client.is_some() {
            self.refresh();
        }
        self.handle_keys(ctx);
        ctx.request_repaint_after(Duration::from_millis(500));
        let connected = self.connected();

        egui::TopBottomPanel::bottom("status").show(ctx, |ui| {
            ui.horizontal(|ui| {
                let label = self.monitor.label(now_ms());
                let tone = if connected {
                    views::Tone::Good
                } else {
                    views::Tone::Bad
                };
                ui.colored_label(paint::tone_color(tone, ui), label);
                if !connected && ui.small_button("Reconnect").clicked() {
                    self.reconnect();
                }
                ui.separator();
                ui.label(&self.status);
            });
        });
        egui::SidePanel::left("sidebar")
            .default_width(280.0)
            .show(ctx, |ui| {
                ui.add_enabled_ui(connected, |ui| self.sidebar(ui));
            });
        self.inspector_drawer(ctx);
        egui::CentralPanel::default().show(ctx, |ui| {
            if !connected {
                ui.colored_label(
                    paint::tone_color(views::Tone::Bad, ui),
                    "Disconnected from the kernel. Input is disabled until it answers.",
                );
            }
            self.toolbar(ui);
            ui.separator();
            ui.add_enabled_ui(connected, |ui| self.panes_ui(ui));
        });
        self.command_bar(ctx);
    }

    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) {
        if let Some(mut child) = self.kernel_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn layouts_dir(app: &std::path::Path) -> PathBuf {
    app.join("layouts")
}

fn save_layout(app: &std::path::Path, matter: &str, layout: &Layout) {
    let dir = layouts_dir(app);
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(
        dir.join(format!("{matter}.json")),
        layout.to_json(matter).to_string(),
    );
}

fn load_layout(app: &std::path::Path, matter: &str) -> Option<(String, Layout)> {
    let text = std::fs::read_to_string(layouts_dir(app).join(format!("{matter}.json"))).ok()?;
    Layout::from_json(&serde_json::from_str(&text).ok()?)
}

fn load_frecency(app: &std::path::Path) -> bar::Frecency {
    let pairs: Vec<(String, u32, u64)> = std::fs::read_to_string(app.join("frecency.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<Vec<Value>>(&t).ok())
        .unwrap_or_default()
        .iter()
        .filter_map(|v| {
            Some((
                v["name"].as_str()?.to_string(),
                v["uses"].as_u64()? as u32,
                v["last"].as_u64()?,
            ))
        })
        .collect();
    bar::Frecency::from_pairs(pairs)
}

fn save_frecency(app: &std::path::Path, f: &bar::Frecency) {
    let rows: Vec<Value> = f
        .to_pairs()
        .into_iter()
        .map(|(name, uses, last)| json!({ "name": name, "uses": uses, "last": last }))
        .collect();
    let _ = std::fs::create_dir_all(app);
    let _ = std::fs::write(app.join("frecency.json"), Value::Array(rows).to_string());
}

fn options(maximized: bool, size: [f32; 2]) -> eframe::NativeOptions {
    eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Open Advocate")
            .with_inner_size(size)
            .with_min_inner_size([800.0, 500.0])
            // A fixed size can exceed a laptop screen at 125 percent scaling
            // and hide the status bar under the taskbar.
            .with_maximized(maximized),
        // OpenGL presents a black window on some Windows drivers; wgpu uses
        // Direct3D 12 or Vulkan there.
        renderer: eframe::Renderer::Wgpu,
        ..Default::default()
    }
}

fn main() -> eframe::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let flag = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    if let Some(view) = flag("--gallery") {
        let Some(def) = views::by_key(&view) else {
            let keys: Vec<_> = REGISTRY.iter().map(|d| d.key).collect();
            eprintln!("unknown view {view:?}; views are {}", keys.join(", "));
            std::process::exit(2);
        };
        let shot = flag("--screenshot").map(PathBuf::from);
        let only = flag("--state");
        return eframe::run_native(
            "Open Advocate gallery",
            options(false, [1700.0, 1000.0]),
            Box::new(move |_cc| Ok(Box::new(gallery::Gallery::new(def.id, shot, only)))),
        );
    }
    eframe::run_native(
        "Open Advocate",
        options(true, [1100.0, 700.0]),
        Box::new(|_cc| Ok(Box::new(App::new()))),
    )
}

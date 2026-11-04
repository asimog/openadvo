//! The view registry and the tables every view is built from (spec A rules
//! 14 and 15). Pure data: no egui, so tests and galleries reach it with no
//! kernel.

use serde_json::{json, Value};

/// Every view the shell can show. A view is a client of registered `query`
/// commands (spec README, GUI convention 1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ViewId {
    Matters,
    Overview,
    Ledger,
    Evidence,
    Drafts,
    Approvals,
    Rejected,
    Jobs,
    Settings,
    Search,
    Inspector,
    CaptureQueue,
    IngestTriage,
    Duplicates,
    Codebook,
    AdapterHealth,
    OcrReview,
    OcrPipeline,
    OcrLines,
    OcrEngines,
    Entities,
    Notebook,
    Facts,
    Chronology,
    Conflicts,
    Readiness,
    Trace,
    Viewer,
    Document,
    EditSurface,
    Changes,
    WordCraft,
    Fidelity,
    Conversion,
}

pub struct ViewDef {
    pub id: ViewId,
    pub key: &'static str,
    pub title: &'static str,
    /// The `query` commands this view is a client of.
    pub covers: &'static [&'static str],
}

pub const REGISTRY: &[ViewDef] = &[
    ViewDef {
        id: ViewId::Matters,
        key: "matters",
        title: "Matters",
        covers: &["matter.list"],
    },
    ViewDef {
        id: ViewId::Overview,
        key: "overview",
        title: "Matter overview",
        covers: &["rules.pin"],
    },
    ViewDef {
        id: ViewId::Ledger,
        key: "ledger",
        title: "Ledger timeline",
        covers: &["ledger.tail", "ledger.verify"],
    },
    ViewDef {
        id: ViewId::Evidence,
        key: "evidence",
        title: "Evidence",
        covers: &["evidence.list", "evidence.show"],
    },
    ViewDef {
        id: ViewId::Drafts,
        key: "drafts",
        title: "Draft history",
        covers: &["draft.list", "draft.log", "draft.show"],
    },
    ViewDef {
        id: ViewId::Approvals,
        key: "approvals",
        title: "Approvals board",
        covers: &["approval.list", "approval.status"],
    },
    ViewDef {
        id: ViewId::Rejected,
        key: "rejected",
        title: "Rejected writes",
        covers: &["audit.rejected", "audit.commands"],
    },
    ViewDef {
        id: ViewId::Jobs,
        key: "jobs",
        title: "Jobs",
        covers: &["job.list", "job.show"],
    },
    ViewDef {
        id: ViewId::Settings,
        key: "settings",
        title: "Settings",
        covers: &["settings.get", "settings.list"],
    },
    ViewDef {
        id: ViewId::Search,
        key: "search",
        title: "Search",
        covers: &["find"],
    },
    ViewDef {
        id: ViewId::Inspector,
        key: "inspector",
        title: "Inspector",
        covers: &["inspect", "links.out", "links.in"],
    },
    ViewDef {
        id: ViewId::CaptureQueue,
        key: "capture-queue",
        title: "Capture queue",
        covers: &["capture.status"],
    },
    ViewDef {
        id: ViewId::IngestTriage,
        key: "ingest",
        title: "Inbox triage",
        covers: &["ingest.status"],
    },
    ViewDef {
        id: ViewId::Duplicates,
        key: "duplicates",
        title: "Duplicates",
        covers: &["evidence.duplicates"],
    },
    ViewDef {
        id: ViewId::Codebook,
        key: "codebook",
        title: "Court codebook",
        covers: &["codebook.show"],
    },
    ViewDef {
        id: ViewId::AdapterHealth,
        key: "adapters",
        title: "Adapter health",
        covers: &["adapter.health"],
    },
    ViewDef {
        id: ViewId::OcrReview,
        key: "ocr-review",
        title: "OCR review",
        covers: &["ocr.disputes"],
    },
    ViewDef {
        id: ViewId::OcrPipeline,
        key: "ocr-pipeline",
        title: "Pipeline",
        covers: &["ocr.pipeline"],
    },
    ViewDef {
        id: ViewId::OcrLines,
        key: "ocr-lines",
        title: "Line inspector",
        covers: &["ocr.lines"],
    },
    ViewDef {
        id: ViewId::OcrEngines,
        key: "ocr-engines",
        title: "Engines",
        covers: &["ocr.engines"],
    },
    ViewDef {
        id: ViewId::Entities,
        key: "entities",
        title: "Entities",
        covers: &["extract.entities"],
    },
    ViewDef {
        id: ViewId::Notebook,
        key: "notebook",
        title: "Notebook",
        covers: &["notebook.show", "notebook.item"],
    },
    ViewDef {
        id: ViewId::Facts,
        key: "facts",
        title: "Factual Matrix",
        covers: &["notebook.facts"],
    },
    ViewDef {
        id: ViewId::Chronology,
        key: "chronology",
        title: "Chronology",
        covers: &["notebook.chronology"],
    },
    ViewDef {
        id: ViewId::Conflicts,
        key: "conflicts",
        title: "Conflicts",
        covers: &["notebook.conflicts"],
    },
    ViewDef {
        id: ViewId::Readiness,
        key: "readiness",
        title: "Readiness",
        covers: &["notebook.ready"],
    },
    ViewDef {
        id: ViewId::Trace,
        key: "trace",
        title: "Trace",
        covers: &["trace"],
    },
    ViewDef {
        id: ViewId::Viewer,
        key: "viewer",
        title: "Viewer",
        covers: &["view"],
    },
    ViewDef {
        id: ViewId::Document,
        key: "document",
        title: "Document viewer",
        covers: &["draft.paragraphs"],
    },
    ViewDef {
        id: ViewId::EditSurface,
        key: "edit-surface",
        title: "Edit surface",
        covers: &["draft.proposals"],
    },
    ViewDef {
        id: ViewId::Changes,
        key: "changes",
        title: "Changes",
        covers: &["draft.changes", "draft.diff"],
    },
    ViewDef {
        id: ViewId::WordCraft,
        key: "wordcraft",
        title: "WordCraft",
        covers: &["draft.editor_status"],
    },
    ViewDef {
        id: ViewId::Fidelity,
        key: "fidelity",
        title: "Fidelity report",
        covers: &["fidelity.check"],
    },
    ViewDef {
        id: ViewId::Conversion,
        key: "conversion",
        title: "Conversion report",
        covers: &["filing.conversions"],
    },
];

pub fn def(id: ViewId) -> &'static ViewDef {
    REGISTRY
        .iter()
        .find(|d| d.id == id)
        .expect("every ViewId is registered")
}

pub fn by_key(key: &str) -> Option<&'static ViewDef> {
    REGISTRY.iter().find(|d| d.key == key)
}

#[cfg(test)]
/// Query commands no registered view is a client of (A-AC-16).
pub fn uncovered(queries: &[&str]) -> Vec<String> {
    queries
        .iter()
        .filter(|q| !REGISTRY.iter().any(|d| d.covers.contains(q)))
        .map(|q| q.to_string())
        .collect()
}

/// How a row is painted. Validator outcomes, advisory scores and attestations
/// get their own treatments later (README GUI convention 7); step 1 has only
/// these.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tone {
    Normal,
    Good,
    Warn,
    Bad,
    Muted,
}

/// What opening a row in the Inspector asks for.
#[derive(Debug, Clone, PartialEq)]
pub enum Subject {
    /// A record of a matter: `inspect <id>` and the link queries.
    Record { matter: String, id: String },
    /// An item with no record id (a refused write, a job, a setting): the
    /// Inspector shows the item's own JSON.
    Raw(Value),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    pub cells: Vec<String>,
    pub subject: Subject,
    pub tone: Tone,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ViewState {
    Ready,
    Empty(String),
    Loading,
    Error(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Table {
    pub view: ViewId,
    pub columns: Vec<&'static str>,
    pub rows: Vec<Row>,
    pub banner: Option<(Tone, String)>,
    pub state: ViewState,
}

impl Table {
    pub(crate) fn new(view: ViewId, columns: &[&'static str], rows: Vec<Row>, empty: &str) -> Self {
        let state = if rows.is_empty() {
            ViewState::Empty(empty.to_string())
        } else {
            ViewState::Ready
        };
        Table {
            view,
            columns: columns.to_vec(),
            rows,
            banner: None,
            state,
        }
    }

    pub fn loading(view: ViewId) -> Self {
        Table {
            state: ViewState::Loading,
            ..Table::new(view, &[], Vec::new(), "")
        }
    }

    pub fn failed(view: ViewId, message: impl Into<String>) -> Self {
        Table {
            state: ViewState::Error(message.into()),
            ..Table::new(view, &[], Vec::new(), "")
        }
    }

    #[cfg(test)]
    /// Every row opens the Inspector (A-AC-17): a row without a subject cannot
    /// be built, so this holds by construction. The test reads this.
    pub fn all_rows_inspectable(&self) -> bool {
        self.rows.iter().all(|r| match &r.subject {
            Subject::Record { matter, id } => !matter.is_empty() && !id.is_empty(),
            Subject::Raw(v) => !v.is_null(),
        })
    }
}

pub(crate) fn s(v: &Value, key: &str) -> String {
    match &v[key] {
        Value::String(t) => t.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

pub(crate) fn short(hash: &str) -> String {
    let h = hash.strip_prefix("sha256:").unwrap_or(hash);
    h.chars().take(10).collect()
}

fn short_url(url: &str) -> String {
    let u = url.strip_prefix("https://").unwrap_or(url);
    u.chars().take(42).collect()
}

pub(crate) fn rec(matter: &str, id: String) -> Subject {
    Subject::Record {
        matter: matter.to_string(),
        id,
    }
}

pub fn matters_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|v| {
            let removed = v["removed"].as_bool().unwrap_or(false);
            let archived = v["archived"].as_bool().unwrap_or(false);
            let state = match (removed, archived) {
                (true, _) => "removed",
                (_, true) => "archived",
                _ => "open",
            };
            let title = if s(v, "title").trim().is_empty() {
                "(no title)".to_string()
            } else {
                s(v, "title")
            };
            Row {
                cells: vec![
                    title,
                    state.to_string(),
                    if v["folder_present"].as_bool().unwrap_or(true) {
                        "present".into()
                    } else {
                        "missing".to_string()
                    },
                    s(v, "id"),
                ],
                subject: rec(&s(v, "id"), s(v, "id")),
                tone: if removed { Tone::Bad } else { Tone::Normal },
            }
        })
        .collect();
    Table::new(
        ViewId::Matters,
        &["Matter", "State", "Folder", "Id"],
        rows,
        "No matters yet. Create one from the sidebar.",
    )
}

/// The ledger timeline. `first_bad` is the sequence `ledger.verify` named.
pub fn ledger_table(matter: &str, events: &[Value], first_bad: Option<i64>) -> Table {
    let rows = events
        .iter()
        .map(|e| {
            let seq = e["seq"].as_i64().unwrap_or(0);
            let bad = first_bad.is_some_and(|b| seq >= b);
            Row {
                cells: vec![
                    seq.to_string(),
                    s(e, "recorded_at"),
                    s(e, "actor"),
                    s(e, "origin"),
                    s(e, "command"),
                    if first_bad == Some(seq) {
                        "FIRST BAD LINK".into()
                    } else if bad {
                        "after break".into()
                    } else {
                        short(&s(e, "hash"))
                    },
                ],
                subject: rec(matter, format!("event:{seq}")),
                tone: if first_bad == Some(seq) {
                    Tone::Bad
                } else if bad {
                    Tone::Warn
                } else {
                    Tone::Normal
                },
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::Ledger,
        &["Seq", "Recorded", "Actor", "Origin", "Command", "Hash"],
        rows,
        "The ledger has no events.",
    );
    t.banner = Some(match first_bad {
        Some(b) => (
            Tone::Bad,
            format!("The hash chain breaks at sequence {b}. The matter is read only. Nothing was repaired."),
        ),
        None => (Tone::Good, "Hash chain intact.".to_string()),
    });
    t
}

pub fn evidence_table(matter: &str, values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|v| {
            let present = v["bytes_present"].as_bool().unwrap_or(true);
            let origins = v["origins"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .map(|o| s(o, "origin"))
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            Row {
                cells: vec![
                    s(v, "original_name"),
                    origins,
                    short(&s(v, "blob")),
                    if present {
                        "present".into()
                    } else {
                        "missing bytes".to_string()
                    },
                ],
                subject: rec(matter, s(v, "id")),
                tone: if present { Tone::Normal } else { Tone::Bad },
            }
        })
        .collect();
    Table::new(
        ViewId::Evidence,
        &["Document", "Origins", "Blob", "Bytes"],
        rows,
        "No source documents yet. Import one with `oa evidence add`.",
    )
}

/// One row per revision of every draft, head and checkpoints marked.
pub fn drafts_table(matter: &str, logs: &[Value]) -> Table {
    let mut rows = Vec::new();
    for log in logs {
        let head = s(&log["draft"], "head");
        let title = s(&log["draft"], "title");
        let cps = log["checkpoints"].as_array().cloned().unwrap_or_default();
        for r in log["revisions"].as_array().cloned().unwrap_or_default() {
            let hash = s(&r, "hash");
            let marks: Vec<String> = cps
                .iter()
                .filter(|c| s(c, "revision") == hash)
                .map(|c| format!("checkpoint {}", s(c, "name")))
                .chain((hash == head).then(|| "HEAD".to_string()))
                .collect();
            rows.push(Row {
                cells: vec![
                    title.clone(),
                    short(&hash),
                    format!("{} ({})", s(&r, "author"), s(&r, "author_kind")),
                    s(&r, "note"),
                    marks.join(", "),
                ],
                subject: rec(matter, hash.clone()),
                tone: if hash == head {
                    Tone::Good
                } else {
                    Tone::Normal
                },
            });
        }
    }
    Table::new(
        ViewId::Drafts,
        &["Draft", "Revision", "Author", "Note", "Marks"],
        rows,
        "No drafts yet.",
    )
}

pub fn approvals_table(matter: &str, values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|a| {
            let stale = a["stale"].as_bool().unwrap_or(false);
            let state = s(a, "state");
            Row {
                cells: vec![
                    s(a, "gate"),
                    short(&s(a, "target")),
                    if stale {
                        format!("{state} (STALE: not the head)")
                    } else {
                        state.clone()
                    },
                    s(a, "reason"),
                    s(a, "decided_by"),
                ],
                subject: rec(matter, s(a, "id")),
                tone: if stale {
                    Tone::Warn
                } else if state == "pending" {
                    Tone::Bad
                } else {
                    Tone::Normal
                },
            }
        })
        .collect();
    Table::new(
        ViewId::Approvals,
        &["Gate", "Revision", "State", "Reason", "Decided by"],
        rows,
        "No approvals requested.",
    )
}

pub fn rejected_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|r| Row {
            cells: vec![
                s(r, "at"),
                s(r, "actor"),
                s(r, "origin"),
                s(r, "command"),
                s(r, "reason"),
            ],
            subject: Subject::Raw(r.clone()),
            tone: Tone::Warn,
        })
        .collect();
    Table::new(
        ViewId::Rejected,
        &["At", "Actor", "Origin", "Command", "Reason"],
        rows,
        "Nothing was refused.",
    )
}

pub fn jobs_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|j| {
            let status = s(j, "status");
            Row {
                cells: vec![
                    s(j, "kind"),
                    status.clone(),
                    format!("{}/{}", s(j, "done"), s(j, "total")),
                    s(j, "message"),
                ],
                subject: Subject::Raw(j.clone()),
                tone: match status.as_str() {
                    "failed" => Tone::Bad,
                    "cancelled" => Tone::Muted,
                    "done" => Tone::Good,
                    _ => Tone::Normal,
                },
            }
        })
        .collect();
    Table::new(
        ViewId::Jobs,
        &["Job", "Status", "Progress", "Message"],
        rows,
        "No jobs have run.",
    )
}

pub fn settings_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|v| {
            let legal = s(v, "layer") == "legal";
            Row {
                cells: vec![
                    s(v, "key"),
                    s(v, "value"),
                    if legal {
                        "legal layer (read only)".into()
                    } else {
                        "firm preference".to_string()
                    },
                ],
                subject: Subject::Raw(v.clone()),
                tone: if legal { Tone::Muted } else { Tone::Normal },
            }
        })
        .collect();
    Table::new(
        ViewId::Settings,
        &["Key", "Value", "Source"],
        rows,
        "No settings.",
    )
}

pub fn search_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|r| Row {
            cells: vec![s(r, "kind"), s(r, "title"), s(r, "snippet")],
            subject: rec(&s(r, "matter"), s(r, "id")),
            tone: Tone::Normal,
        })
        .collect();
    Table::new(
        ViewId::Search,
        &["Kind", "Title", "Match"],
        rows,
        "Nothing matches.",
    )
}

/// The capture queue: pending captures, CAPTCHA waits and failures. A degraded
/// adapter is a visible banner (F-AC-15).
pub fn capture_queue_table(captures: &[Value], adapters: &[Value]) -> Table {
    let rows = captures
        .iter()
        .map(|c| {
            let matter = s(c, "matter");
            let id = s(c, "id");
            let status = s(c, "status");
            let subject = if matter.is_empty() {
                Subject::Raw(c.clone())
            } else {
                Subject::Record {
                    matter: matter.clone(),
                    id: id.clone(),
                }
            };
            Row {
                cells: vec![
                    short(&id),
                    status.clone(),
                    short_url(&s(c, "url")),
                    s(c, "reason"),
                ],
                subject,
                tone: match status.as_str() {
                    "failed" | "abandoned" => Tone::Bad,
                    "captcha_pending" | "login_pending" | "pending" => Tone::Warn,
                    "completed" => Tone::Good,
                    _ => Tone::Normal,
                },
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::CaptureQueue,
        &["Capture", "Status", "URL", "Reason"],
        rows,
        "The capture queue is empty.",
    );
    if let Some(a) = adapters
        .iter()
        .find(|a| s(a, "runtime_state") == "degraded")
    {
        t.banner = Some((
            Tone::Bad,
            format!(
                "Adapter {} is degraded: {}. Use a manual capture in the visible browser.",
                s(a, "adapter"),
                s(a, "detail")
            ),
        ));
    }
    t
}

pub fn ingest_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|i| {
            let readability = s(i, "readability");
            let status = s(i, "status");
            let matter = s(i, "matter");
            let evidence = s(i, "evidence_id");
            Row {
                cells: vec![
                    short(&evidence),
                    s(i, "format"),
                    readability.clone(),
                    status.clone(),
                    s(i, "message"),
                ],
                subject: Subject::Record {
                    matter,
                    id: evidence,
                },
                tone: if status == "blocked"
                    || matches!(
                        readability.as_str(),
                        "encrypted" | "corrupt" | "unsupported"
                    ) {
                    Tone::Bad
                } else if status == "pending" || status == "running" {
                    Tone::Warn
                } else {
                    Tone::Normal
                },
            }
        })
        .collect();
    Table::new(
        ViewId::IngestTriage,
        &["Document", "Format", "Readability", "Status", "Message"],
        rows,
        "No files are waiting to be ingested.",
    )
}

pub fn duplicates_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|d| {
            let names = d["items"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .iter()
                .map(|i| s(i, "name"))
                .collect::<Vec<_>>();
            Row {
                cells: vec![
                    s(d, "kind"),
                    short(&s(d, "fingerprint")),
                    names.first().cloned().unwrap_or_default(),
                    names.get(1).cloned().unwrap_or_default(),
                ],
                subject: Subject::Raw(d.clone()),
                tone: Tone::Warn,
            }
        })
        .collect();
    Table::new(
        ViewId::Duplicates,
        &["Kind", "Text fingerprint", "First", "Second"],
        rows,
        "No possible duplicates.",
    )
}

pub fn codebook_table(values: &[Value]) -> Table {
    let mut rows = Vec::new();
    for book in values {
        let scheme = s(book, "scheme");
        let version = s(book, "version");
        for code in book["codes"].as_array().cloned().unwrap_or_default() {
            rows.push(Row {
                cells: vec![
                    scheme.clone(),
                    version.clone(),
                    s(&code, "code"),
                    s(&code, "label"),
                ],
                subject: Subject::Raw(json!({
                    "scheme": s(&code, "scheme"),
                    "code": s(&code, "code"),
                    "label": s(&code, "label"),
                    "version": version,
                })),
                tone: Tone::Normal,
            });
        }
    }
    Table::new(
        ViewId::Codebook,
        &["Scheme", "List version", "Code", "Label"],
        rows,
        "No codebook has been captured yet.",
    )
}

pub fn adapter_health_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|a| {
            let runtime = s(a, "runtime_state");
            Row {
                cells: vec![
                    s(a, "adapter"),
                    s(a, "contract_state"),
                    runtime.clone(),
                    s(a, "detail"),
                ],
                subject: Subject::Raw(a.clone()),
                tone: match runtime.as_str() {
                    "degraded" => Tone::Bad,
                    "captcha_pending" => Tone::Warn,
                    "healthy" => Tone::Good,
                    _ => Tone::Normal,
                },
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::AdapterHealth,
        &["Adapter", "Contract", "Runtime", "Detail"],
        rows,
        "No adapter health has been recorded.",
    );
    if values.iter().any(|a| s(a, "runtime_state") == "degraded") {
        t.banner = Some((
            Tone::Bad,
            "At least one adapter is degraded. A manual capture still produces a capture record."
                .into(),
        ));
    }
    t
}

pub fn ocr_disputes_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|d| {
            let state = s(d, "state");
            Row {
                cells: vec![
                    short(&s(d, "doc")),
                    s(d, "page"),
                    s(d, "reading_a"),
                    s(d, "reading_b"),
                    s(d, "reason"),
                    state.clone(),
                ],
                subject: Subject::Raw(d.clone()),
                tone: if state == "open" {
                    Tone::Bad
                } else {
                    Tone::Good
                },
            }
        })
        .collect();
    Table::new(
        ViewId::OcrReview,
        &[
            "Document",
            "Page",
            "Reading A",
            "Reading B",
            "Reason",
            "State",
        ],
        rows,
        "No OCR disputes.",
    )
}

pub fn ocr_lines_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|l| {
            let agreement = s(l, "agreement");
            let disputed = l["disputed"].as_array().map(Vec::len).unwrap_or(0);
            let norm = s(l, "normalisation_version");
            let norm = if norm.starts_with("nfc-whitespace") {
                "nfc-1".to_string()
            } else {
                norm
            };
            let detail = format!(
                "{} | A:{} {:.2} {} | B:{} {:.2} {} | n:{} | d:{}",
                agreement,
                s(&l["reading_a"], "text"),
                l["reading_a"]["confidence"].as_f64().unwrap_or(0.0),
                s(&l["reading_a"], "engine_version"),
                s(&l["reading_b"], "text"),
                l["reading_b"]["confidence"].as_f64().unwrap_or(0.0),
                s(&l["reading_b"], "engine_version"),
                norm,
                disputed
            );
            Row {
                cells: vec![s(l, "page"), s(l, "line"), detail],
                subject: Subject::Raw(l.clone()),
                tone: if agreement == "agreed" {
                    Tone::Good
                } else {
                    Tone::Bad
                },
            }
        })
        .collect();
    Table::new(
        ViewId::OcrLines,
        &[
            "Page",
            "Line",
            "Readings, confidences, versions and normalisation",
        ],
        rows,
        "No OCR lines for this document.",
    )
}

pub fn ocr_pipeline_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|d| {
            let disputes = d["disputes"].as_u64().unwrap_or(0);
            let failures: Vec<&str> = d["engine_failures"]
                .as_array()
                .map(|a| a.iter().filter_map(Value::as_str).collect())
                .unwrap_or_default();
            Row {
                cells: vec![
                    s(d, "doc"),
                    s(d, "state"),
                    d["pages"].as_u64().unwrap_or(0).to_string(),
                    disputes.to_string(),
                    if failures.is_empty() {
                        "-".into()
                    } else {
                        failures.join(", ")
                    },
                ],
                subject: Subject::Record {
                    matter: s(d, "matter"),
                    id: s(d, "doc"),
                },
                tone: match s(d, "state").as_str() {
                    "done" => Tone::Good,
                    "failed" | "needs_review" => Tone::Bad,
                    _ => Tone::Normal,
                },
            }
        })
        .collect();
    Table::new(
        ViewId::OcrPipeline,
        &[
            "Document",
            "State",
            "Pages",
            "Open disputes",
            "Engine failures",
        ],
        rows,
        "No document has been through OCR in this matter.",
    )
}

pub fn ocr_engines_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|e| {
            let runtime = s(e, "runtime_state");
            Row {
                cells: vec![
                    s(e, "engine"),
                    s(e, "version"),
                    short(&s(e, "model_hash")),
                    runtime.clone(),
                    s(e, "detail"),
                ],
                subject: Subject::Raw(e.clone()),
                tone: if runtime == "healthy" {
                    Tone::Good
                } else {
                    Tone::Bad
                },
            }
        })
        .collect();
    Table::new(
        ViewId::OcrEngines,
        &["Engine", "Version", "Model", "Runtime", "Detail"],
        rows,
        "No OCR engine health has been recorded.",
    )
}

pub fn entities_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|e| Row {
            cells: vec![
                s(e, "kind"),
                s(e, "text"),
                s(&e["anchor"], "page"),
                s(&e["anchor"], "line"),
                s(e, "date"),
            ],
            subject: Subject::Raw(e.clone()),
            tone: Tone::Normal,
        })
        .collect();
    Table::new(
        ViewId::Entities,
        &["Kind", "Text", "Page", "Line", "Date"],
        rows,
        "No entities for this document.",
    )
}

fn nb_date(v: &Value) -> String {
    let d = s(v, "date");
    match s(v, "date_end") {
        e if e.is_empty() => d,
        e => format!("{d} to {e}"),
    }
}

fn nb_tone(v: &Value) -> Tone {
    match s(v, "shown_status").as_str() {
        "disputed" => Tone::Bad,
        "confirmed" => Tone::Good,
        _ => Tone::Normal,
    }
}

/// Where an item came from, with its component tag (spec H rule 2). A
/// client file is "Supplied by client", never "verified" or "unverifiable".
fn nb_source(v: &Value) -> String {
    let a = &v["anchors"][0];
    format!(
        "{} p{} | {}",
        short(&s(a, "doc")),
        s(a, "page"),
        s(v, "component_label")
    )
}

pub(crate) fn clip(text: &str, n: usize) -> String {
    if text.chars().count() <= n {
        text.to_string()
    } else {
        format!("{}...", text.chars().take(n).collect::<String>())
    }
}

/// The Notebook pane (A05): each section's counts, or one section's items
/// when `section` names it.
pub fn notebook_table(matter: &str, show: &Value, section: Option<&str>) -> Table {
    let mut t = match section {
        None => {
            let rows = show["counts"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or_default()
                .iter()
                .map(|c| Row {
                    cells: vec![
                        s(c, "title"),
                        s(c, "total"),
                        s(c, "candidate"),
                        s(c, "confirmed"),
                        s(c, "disputed"),
                        s(c, "excluded"),
                    ],
                    subject: Subject::Raw(c.clone()),
                    tone: if c["disputed"].as_u64().unwrap_or(0) > 0 {
                        Tone::Bad
                    } else {
                        Tone::Normal
                    },
                })
                .collect();
            Table::new(
                ViewId::Notebook,
                &[
                    "Section",
                    "Items",
                    "Candidate",
                    "Confirmed",
                    "Disputed",
                    "Excluded",
                ],
                rows,
                "No Notebook for this matter yet.",
            )
        }
        Some(_) => {
            let review = show["review"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or_default();
            let mut rows: Vec<Row> = show["items"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or_default()
                .iter()
                .map(|i| Row {
                    cells: vec![
                        s(i, "kind"),
                        clip(&s(i, "description"), 70),
                        nb_date(i),
                        s(i, "shown_status"),
                        nb_source(i),
                    ],
                    subject: rec(matter, s(i, "id")),
                    tone: nb_tone(i),
                })
                .collect();
            rows.extend(review.iter().map(|r| Row {
                cells: vec![
                    format!("review: {}", s(r, "kind")),
                    clip(&s(r, "summary"), 70),
                    String::new(),
                    s(r, "state"),
                    String::new(),
                ],
                subject: rec(matter, s(r, "id")),
                tone: if s(r, "state") == "open" {
                    Tone::Warn
                } else {
                    Tone::Muted
                },
            }));
            Table::new(
                ViewId::Notebook,
                &["Kind", "Description", "Date", "Status", "Source"],
                rows,
                "No items in this section.",
            )
        }
    };
    let missing: Vec<String> = show["missing"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if !missing.is_empty() {
        t.banner = Some((
            Tone::Warn,
            format!("Impugned order: missing {}", missing.join(", ")),
        ));
    }
    t
}

/// The Factual Matrix (H04): date, date type, source, method, uncertainty,
/// conflicts and confirmation.
pub fn facts_table(matter: &str, values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|f| {
            let ocr = f["open_ocr_disputes"].as_array().map(Vec::len).unwrap_or(0);
            let conflicts = f["conflicts"].as_array().map(Vec::len).unwrap_or(0);
            let uncertainty = match (s(f, "date_type").as_str(), ocr) {
                (_, n) if n > 0 => "OCR disputed".to_string(),
                ("explicit", _) => "certain".to_string(),
                (other, _) => other.to_string(),
            };
            Row {
                cells: vec![
                    nb_date(f),
                    s(f, "date_type"),
                    clip(&s(f, "description"), 60),
                    nb_source(f),
                    s(f, "method"),
                    uncertainty,
                    if conflicts == 0 {
                        "-".into()
                    } else {
                        format!("{conflicts} open")
                    },
                    s(f, "shown_status"),
                ],
                subject: rec(matter, s(f, "id")),
                tone: nb_tone(f),
            }
        })
        .collect();
    Table::new(
        ViewId::Facts,
        &[
            "Date",
            "Date type",
            "Event",
            "Source",
            "Method",
            "Uncertainty",
            "Conflicts",
            "Status",
        ],
        rows,
        "No facts yet. Run `oa notebook extract` on an OCR'd document.",
    )
}

/// The chronology of one view, excluded events marked when shown (H05).
pub fn chronology_table(matter: &str, view: &str, values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|e| {
            let excluded = e["excluded"].as_bool().unwrap_or(false);
            Row {
                cells: vec![
                    nb_date(e),
                    clip(&s(e, "description"), 60),
                    s(e, "category"),
                    nb_source(e),
                    if excluded {
                        format!("excluded from {view}")
                    } else {
                        s(e, "shown_status")
                    },
                ],
                subject: rec(matter, s(e, "id")),
                tone: if excluded { Tone::Muted } else { nb_tone(e) },
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::Chronology,
        &["Date", "Event", "Category", "Source", "Status"],
        rows,
        "No dated events in this view.",
    );
    t.banner = Some((Tone::Normal, format!("View: {view}")));
    t
}

/// Each conflict with every anchor involved (H09).
pub fn conflicts_table(values: &[Value]) -> Table {
    let rows = values
        .iter()
        .map(|c| {
            let sources: Vec<String> = c["anchors"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or_default()
                .iter()
                .map(|a| format!("{} p{}", short(&s(a, "doc")), s(a, "page")))
                .collect();
            let state = s(c, "state");
            Row {
                cells: vec![
                    s(c, "kind"),
                    clip(&s(c, "summary"), 70),
                    sources.join(", "),
                    state.clone(),
                ],
                subject: Subject::Raw(c.clone()),
                tone: match state.as_str() {
                    "open" => Tone::Bad,
                    "skipped" => Tone::Warn,
                    _ => Tone::Good,
                },
            }
        })
        .collect();
    Table::new(
        ViewId::Conflicts,
        &["Kind", "Conflict", "Sources", "State"],
        rows,
        "No conflicts: no two sources disagree on a date, party or amount.",
    )
}

/// Ready, or the exact list of what blocks readiness (H07).
pub fn readiness_table(matter: &str, ready: &Value) -> Table {
    let blockers = ready["blockers"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    let rows = blockers
        .iter()
        .map(|b| {
            let kind = s(b, "kind");
            Row {
                cells: vec![kind.clone(), s(b, "label")],
                subject: match kind.as_str() {
                    "review_item" | "ingest" => rec(matter, s(b, "id")),
                    _ => Subject::Raw(b.clone()),
                },
                tone: Tone::Bad,
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::Readiness,
        &["Blocker", "What blocks readiness"],
        rows,
        "Nothing blocks the Notebook.",
    );
    t.banner = Some(if ready["ready"].as_bool().unwrap_or(false) {
        (
            Tone::Good,
            "Ready: no ingestion is queued or running and every review item is resolved or skipped."
                .into(),
        )
    } else {
        (
            Tone::Bad,
            format!(
                "Not ready: {} blocker{}. Readiness is a milestone, not a lock.",
                blockers.len(),
                if blockers.len() == 1 { "" } else { "s" }
            ),
        )
    });
    t
}

/// The chain from an item to its original file (spec H rule 11).
pub fn trace_table(matter: &str, trace: &Value) -> Table {
    let mut rows = Vec::new();
    let chain = trace["chain"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    for (n, step) in chain.iter().enumerate() {
        let anchor = format!("{}", n + 1);
        let bad = step["resolved"] == false;
        let tone = if bad { Tone::Bad } else { Tone::Normal };
        let raw = |label: &str, value: String| Row {
            cells: vec![anchor.clone(), label.to_string(), value],
            subject: Subject::Raw(step.clone()),
            tone,
        };
        rows.push(raw(
            "Extract",
            if bad {
                format!("unresolved: {}", s(step, "error"))
            } else {
                s(step, "extract")
            },
        ));
        rows.push(raw("Line", s(step, "line")));
        rows.push(raw("Page", s(step, "page")));
        rows.push(Row {
            cells: vec![anchor.clone(), "Source hash".into(), s(step, "source_hash")],
            subject: rec(matter, s(step, "source_hash")),
            tone,
        });
        rows.push(Row {
            cells: vec![
                anchor.clone(),
                "Original file".into(),
                s(step, "original_file"),
            ],
            subject: rec(matter, s(step, "doc")),
            tone,
        });
    }
    let mut t = Table::new(
        ViewId::Trace,
        &["Anchor", "Step", "Value"],
        rows,
        "This item has no anchors.",
    );
    t.banner = Some((
        Tone::Normal,
        format!(
            "{} | {}",
            clip(&s(trace, "description"), 80),
            s(trace, "component_label")
        ),
    ));
    t
}

/// The item a Notebook, Factual Matrix or Chronology row stands for: its
/// source peek is the Inspector (one action), its trace this id (one more,
/// H-AC-12).
pub fn item_of(row: &Row) -> Option<&str> {
    match &row.subject {
        Subject::Record { id, .. } if !row.cells[0].starts_with("review:") => Some(id),
        _ => None,
    }
}

/// Rule-pin facts for the overview (`rules.pin`).
pub fn overview_lines(matter: &Value, pin: &Value) -> Vec<(String, String)> {
    let get = |v: &Value, k: &str| {
        let t = s(v, k);
        if t.is_empty() {
            "missing".to_string()
        } else {
            t
        }
    };
    let missing = || "missing".to_string();
    vec![
        ("Title".into(), get(matter, "title")),
        ("Matter id".into(), get(matter, "id")),
        ("Petitioner v. Respondent".into(), missing()),
        ("Impugned judgment".into(), missing()),
        ("Case number".into(), missing()),
        ("CNR".into(), missing()),
        ("Stage".into(), missing()),
        ("Standard version".into(), get(pin, "standard_version")),
        ("Rule pack".into(), get(pin, "rule_pack")),
    ]
}

/// The gallery states every view renders in (A17, A-AC-22).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GalleryState {
    Empty,
    Loading,
    Error,
    Typical,
    Large,
    Disputed,
}

impl GalleryState {
    pub const ALL: [GalleryState; 6] = [
        GalleryState::Empty,
        GalleryState::Loading,
        GalleryState::Error,
        GalleryState::Typical,
        GalleryState::Large,
        GalleryState::Disputed,
    ];

    pub fn name(self) -> &'static str {
        match self {
            GalleryState::Empty => "empty",
            GalleryState::Loading => "loading",
            GalleryState::Error => "error",
            GalleryState::Typical => "typical",
            GalleryState::Large => "large",
            GalleryState::Disputed => "disputed",
        }
    }
}

const M: &str = "01M0000000000000000000000A";

fn typical(view: ViewId, n: usize, disputed: bool) -> Table {
    let ev = |i: usize| json!({ "seq": i + 1, "recorded_at": "2026-11-04T09:00:00.000Z", "actor": "advocate", "origin": "ui", "command": "draft.revised", "hash": format!("sha256:{:064x}", i) });
    match view {
        ViewId::Matters => matters_table(
            &(0..n)
                .map(|i| json!({ "id": format!("01M{:023}", i), "title": format!("State v. Rao {}", i + 1), "archived": i % 5 == 4, "removed": disputed && i == 1, "folder_present": !(disputed && i == 1) }))
                .collect::<Vec<_>>(),
        ),
        ViewId::Ledger => {
            let events: Vec<Value> = (0..n).map(ev).collect();
            ledger_table(M, &events, disputed.then_some(3.min(n as i64)))
        }
        ViewId::Evidence => evidence_table(
            M,
            &(0..n)
                .map(|i| json!({ "id": format!("E{i}"), "original_name": format!("order-{i}.pdf"), "origins": [{"origin": "court_portal"}, {"origin": "email"}], "blob": format!("sha256:{:064x}", i), "bytes_present": !(disputed && i == 0) }))
                .collect::<Vec<_>>(),
        ),
        ViewId::Drafts => drafts_table(
            M,
            &[json!({
                "draft": { "title": "SLP against order", "head": format!("sha256:{:064x}", n.saturating_sub(1)) },
                "revisions": (0..n).map(|i| json!({ "hash": format!("sha256:{:064x}", i), "author": if i % 2 == 0 { "advocate" } else { "agent:drafter" }, "author_kind": if i % 2 == 0 { "advocate" } else { "agent" }, "note": "" })).collect::<Vec<_>>(),
                "checkpoints": [{ "name": "filed-v1", "revision": format!("sha256:{:064x}", 0) }],
            })],
        ),
        ViewId::Approvals => approvals_table(
            M,
            &(0..n)
                .map(|i| json!({ "id": format!("A{i}"), "gate": "final_revision", "target": format!("sha256:{:064x}", i), "state": if i % 3 == 0 { "pending" } else { "accepted" }, "stale": disputed && i % 3 == 1, "reason": "reviewed", "decided_by": "advocate" }))
                .collect::<Vec<_>>(),
        ),
        ViewId::Rejected => rejected_table(
            &(0..n)
                .map(|i| json!({ "at": "2026-11-04T09:00:00.000Z", "actor": "agent", "origin": "harness", "command": "matter.write_file", "reason": format!("evidence/ is not writable ({i})") }))
                .collect::<Vec<_>>(),
        ),
        ViewId::Jobs => jobs_table(
            &(0..n)
                .map(|i| json!({ "id": format!("J{i}"), "kind": "registry.rescan", "status": if disputed && i == 0 { "failed" } else if i % 2 == 0 { "done" } else { "running" }, "done": i, "total": n, "message": "" }))
                .collect::<Vec<_>>(),
        ),
        ViewId::Settings if n == 0 => settings_table(&[]),
        ViewId::Settings => settings_table(&[
            json!({ "key": "legal.rule_pack", "value": "unpinned", "layer": "legal" }),
            json!({ "key": "ui.theme", "value": "light", "layer": "firm" }),
        ]),
        ViewId::Search => search_table(
            &(0..n)
                .map(|i| json!({ "kind": if i % 2 == 0 { "evidence" } else { "draft" }, "id": format!("X{i}"), "matter": M, "title": format!("Result {i}"), "snippet": "order dated 3 March" }))
                .collect::<Vec<_>>(),
        ),
        ViewId::CaptureQueue => capture_queue_table(
            &(0..n)
                .map(|i| {
                    json!({
                        "id": format!("C{i}"),
                        "matter": M,
                        "status": if disputed && i == 0 { "failed" } else if i % 3 == 0 { "captcha_pending" } else { "pending" },
                        "url": format!("https://sc.example/case/{i}"),
                        "adapter": "supreme_court_case_status",
                        "reason": if disputed && i == 0 { "adapter_degraded" } else { "" },
                    })
                })
                .collect::<Vec<_>>(),
            &if n == 0 {
                Vec::new()
            } else if disputed {
                vec![json!({ "adapter": "supreme_court_case_status", "contract_state": "failed", "runtime_state": "degraded", "detail": "the case-status page shape changed" })]
            } else {
                vec![json!({ "adapter": "supreme_court_case_status", "contract_state": "healthy", "runtime_state": "healthy", "detail": "" })]
            },
        ),
        ViewId::IngestTriage => ingest_table(
            &(0..n)
                .map(|i| {
                    let encrypted = disputed && i == 0;
                    json!({
                        "id": format!("I{i}"),
                        "matter": M,
                        "evidence_id": format!("E{i}"),
                        "format": if encrypted { "pdf" } else { "docx" },
                        "readability": if encrypted { "encrypted" } else { "readable" },
                        "status": if encrypted { "blocked" } else if i % 2 == 0 { "pending" } else { "done" },
                        "proposed_class": "order",
                        "message": if encrypted { "encrypted; no ingestion beyond hashing" } else { "" },
                    })
                })
                .collect::<Vec<_>>(),
        ),
        ViewId::Duplicates => duplicates_table(
            &(0..n)
                .map(|i| {
                    json!({
                        "matter": M,
                        "kind": "same_text",
                        "fingerprint": format!("sha256:{:064x}", i),
                        "items": [
                            { "evidence": format!("E{i}a"), "name": format!("scan-a-{i}.pdf") },
                            { "evidence": format!("E{i}b"), "name": format!("scan-b-{i}.pdf") },
                        ],
                    })
                })
                .collect::<Vec<_>>(),
        ),
        ViewId::Codebook if n == 0 => codebook_table(&[]),
        ViewId::Codebook => codebook_table(&[json!({
            "scheme": "supreme_court:list-2024-03",
            "version": "2024-03",
            "codes": (0..n).map(|i| json!({
                "scheme": "supreme_court:list-2024-03",
                "code": if i == 0 { "WP" } else { "SLP" },
                "label": if i == 0 { "Writ Petition (Civil)" } else { "Special Leave Petition (Civil)" },
            })).collect::<Vec<_>>(),
        })]),
        ViewId::AdapterHealth if n == 0 => adapter_health_table(&[]),
        ViewId::AdapterHealth => adapter_health_table(
            &(0..n)
                .map(|i| {
                    json!({
                        "adapter": format!("adapter-{i}"),
                        "contract_state": if disputed && i == 0 { "failed" } else { "healthy" },
                        "runtime_state": if disputed && i == 0 { "degraded" } else { "healthy" },
                        "detail": if disputed && i == 0 { "the case-status page shape changed" } else { "" },
                        "checked_at": "2026-11-04T09:00:00.000Z",
                    })
                })
                .collect::<Vec<_>>(),
        ),
        ViewId::OcrReview => ocr_disputes_table(
            &(0..n)
                .map(|i| {
                    json!({
                        "id": format!("D{i}"),
                        "doc": format!("E{i}"),
                        "page": 1,
                        "token_index": i,
                        "reading_a": "12.03.2019",
                        "reading_b": "12.08.2019",
                        "class": "critical",
                        "reason": "critical_mismatch",
                        "state": if disputed && i == 0 { "open" } else { "decided" },
                    })
                })
                .collect::<Vec<_>>(),
        ),
        ViewId::OcrPipeline => ocr_pipeline_table(
            &(0..n)
                .map(|i| {
                    json!({
                        "matter": "01J0MATTER",
                        "doc": format!("01J0DOC{i:03}"),
                        "state": if disputed && i == 0 { "needs_review" } else { "done" },
                        "pages": 4 + i,
                        "disputes": if disputed && i == 0 { 2 } else { 0 },
                        "engine_failures": if disputed && i == 0 { vec!["paddle"] } else { vec![] },
                    })
                })
                .collect::<Vec<_>>(),
        ),
        ViewId::OcrLines => ocr_lines_table(
            &(0..n)
                .map(|i| {
                    json!({
                        "page": 1,
                        "line": i,
                        "agreement": if disputed && i == 0 { "disputed" } else { "agreed" },
                        "canonical_text": format!("the respondent filed line {i}"),
                        "reading_a": { "text": format!("the respondent filed line {i}"), "confidence": 0.95, "engine_version": "stub-1.0" },
                        "reading_b": { "text": format!("the respondcnt filed line {i}"), "confidence": 0.93, "engine_version": "stub-1.0" },
                        "normalisation_version": "nfc-whitespace-hyphen-devanagari-1",
                        "disputed": if disputed && i == 0 { json!([{"token_index": 1}]) } else { json!([]) },
                    })
                })
                .collect::<Vec<_>>(),
        ),
        ViewId::OcrEngines => ocr_engines_table(
            &(0..n)
                .map(|i| {
                    json!({
                        "engine": if i % 2 == 0 { "tesseract" } else { "paddle" },
                        "version": "stub-1.0",
                        "model_hash": format!("sha256:{:064x}", i),
                        "runtime_state": if disputed && i == 0 { "failed" } else { "healthy" },
                        "detail": if disputed && i == 0 { "engine exited with 7" } else { "" },
                    })
                })
                .collect::<Vec<_>>(),
        ),
        ViewId::Entities => entities_table(
            &(0..n)
                .map(|i| {
                    json!({
                        "kind": if i % 2 == 0 { "date" } else { "amount" },
                        "text": if i % 2 == 0 { "12.03.2019" } else { "Rs. 1,50,000" },
                        "anchor": { "page": 1, "line": i, "line_hash": format!("sha256:{:064x}", i) },
                        "date": if i % 2 == 0 { json!("2019-03-12") } else { Value::Null },
                    })
                })
                .collect::<Vec<_>>(),
        ),
        ViewId::Notebook => {
            let items = nb_items(n, disputed);
            let show = json!({
                "counts": if n == 0 { json!([]) } else { json!(nb_counts(&items)) },
                "items": items,
                "review": if disputed { json!([{ "id": "R1", "kind": "conflict", "summary": "date conflict on order:WP1234/2018: 2019-03-12 vs 2019-03-13", "state": "open" }]) } else { json!([]) },
                "missing": if disputed { json!(["cnr"]) } else { json!([]) },
            });
            notebook_table(M, &show, (n > 4 || disputed).then_some("factual_matrix"))
        }
        ViewId::Facts => facts_table(M, &nb_items(n, disputed)),
        ViewId::Chronology => {
            let mut items = nb_items(n, disputed);
            for (i, v) in items.iter_mut().enumerate() {
                v["excluded"] = json!(disputed && i == 1);
            }
            chronology_table(M, "synopsis", &items)
        }
        ViewId::Conflicts => conflicts_table(
            &(0..n)
                .map(|i| json!({
                    "id": format!("R{i}"),
                    "kind": "conflict",
                    "summary": format!("date conflict on order:WP{i}/2018: 2019-03-12 vs 2019-03-13"),
                    "state": if disputed || i % 2 == 0 { "open" } else { "resolved" },
                    "items": [format!("F{i}a"), format!("F{i}b")],
                    "anchors": [
                        { "doc": format!("01J0ORDER{i:03}"), "page": 1 },
                        { "doc": format!("01J0LETTER{i:03}"), "page": 2 },
                    ],
                }))
                .collect::<Vec<_>>(),
        ),
        ViewId::Readiness => readiness_table(
            M,
            &json!({
                "ready": n == 0,
                "blockers": (0..n).map(|i| match i % 4 {
                    0 => json!({ "kind": "review_item", "id": format!("R{i}"), "label": "date conflict on order:WP1234/2018: 2019-03-12 vs 2019-03-13" }),
                    1 => json!({ "kind": "ingest", "id": format!("E{i}"), "label": format!("queued for ingestion: scan-{i}.pdf") }),
                    2 => json!({ "kind": "job", "id": format!("J{i}"), "label": "ocr.batch running (1/3)" }),
                    _ => json!({ "kind": "ocr_dispute", "id": format!("D{i}"), "label": "open OCR dispute in 01J0ORDER000" }),
                }).collect::<Vec<_>>(),
            }),
        ),
        ViewId::Trace => trace_table(
            M,
            &json!({
                "item": "F0",
                "description": "Order dated 12.03.2019 in W.P. No. 1234/2018",
                "component_label": "Court portal",
                "chain": (0..n.min(3)).map(|i| json!({
                    "extract": "12.03.2019",
                    "line": i,
                    "page": 1,
                    "doc": format!("01J0ORDER{i:03}"),
                    "source_hash": format!("sha256:{:064x}", i),
                    "original_file": format!("order-{i}.pdf"),
                    "resolved": !(disputed && i == 0),
                    "error": if disputed && i == 0 { json!("line sha256:abc is not in the OCR record") } else { Value::Null },
                })).collect::<Vec<_>>(),
            }),
        ),
        ViewId::Viewer
        | ViewId::Document
        | ViewId::EditSurface
        | ViewId::Changes
        | ViewId::WordCraft
        | ViewId::Fidelity
        | ViewId::Conversion => crate::docviews::typical(view, M, n, disputed),
        ViewId::Overview | ViewId::Inspector => Table::new(view, &["Field", "Value"], Vec::new(), "Select a matter."),
    }
}

/// Notebook items for the galleries: court and client sources, an OCR
/// disputed fact and a confirmed one.
fn nb_items(n: usize, disputed: bool) -> Vec<Value> {
    (0..n)
        .map(|i| {
            let client = i % 3 == 2;
            let ocr = disputed && i == 0;
            json!({
                "id": format!("F{i}"),
                "version": 1,
                "section": "factual_matrix",
                "kind": "fact",
                "description": format!("Order dated {:02}.03.2019 in W.P. No. 1234/2018", 1 + i % 28),
                "date": format!("2019-03-{:02}", 1 + i % 28),
                "date_type": if i % 5 == 4 { "inferred" } else { "explicit" },
                "category": if i % 4 == 3 { "payment" } else { "order" },
                "method": "rules:oa-ocr/extract_entities",
                "anchors": [{ "doc": format!("01J0DOC{i:03}"), "page": 1 + i % 3, "line_hash": format!("sha256:{:064x}", i) }],
                "component": if client { "client_supplied" } else { "court_portal" },
                "component_label": if client { "Supplied by client" } else { "Court portal" },
                "shown_status": if ocr { "disputed" } else if i % 4 == 1 { "confirmed" } else { "candidate" },
                "status": if i % 4 == 1 { "confirmed" } else { "candidate" },
                "disputed": ocr,
                "open_ocr_disputes": if ocr { json!(["D0"]) } else { json!([]) },
                "conflicts": if disputed && i == 1 { json!(["R1"]) } else { json!([]) },
            })
        })
        .collect()
}

fn nb_counts(items: &[Value]) -> Vec<Value> {
    [
        ("source_documents", "Source documents"),
        ("procedural_history", "Procedural history"),
        ("factual_matrix", "Factual Matrix"),
        ("chronology", "Chronology"),
        ("legal_issues", "Legal issues"),
        ("authorities", "Authorities"),
        ("work_products", "Work products"),
        ("review", "Review and verification"),
    ]
    .iter()
    .map(|(key, title)| {
        let facts = matches!(*key, "factual_matrix" | "chronology");
        let count = |st: &str| {
            if facts {
                items.iter().filter(|i| i["shown_status"] == st).count()
            } else {
                0
            }
        };
        json!({
            "section": key,
            "title": title,
            "total": if facts { items.len() } else { 0 },
            "candidate": count("candidate"),
            "confirmed": count("confirmed"),
            "disputed": count("disputed"),
            "excluded": 0,
        })
    })
    .collect()
}

/// A view in one gallery state, built with no kernel.
pub fn fixture(view: ViewId, state: GalleryState) -> Table {
    match state {
        GalleryState::Empty => typical(view, 0, false),
        GalleryState::Loading => Table::loading(view),
        GalleryState::Error => Table::failed(
            view,
            "unavailable: the kernel is not serving. Start it with `oa kernel serve`.",
        ),
        GalleryState::Typical => typical(view, 4, false),
        GalleryState::Large => typical(view, 400, false),
        GalleryState::Disputed => typical(view, 6, true),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn j_ac_20_the_changes_viewer_shows_each_kind_of_change_with_its_author() {
        let t = fixture(ViewId::Changes, GalleryState::Typical);
        let kinds: Vec<(&str, &str)> = t
            .rows
            .iter()
            .filter(|r| r.cells[1] != "review note")
            .map(|r| (r.cells[1].as_str(), r.cells[2].as_str()))
            .collect();
        for want in [
            ("proposal", "agent:turn-7"),
            ("wordcraft_save", "wordcraft"),
            ("restore (head)", "advocate"),
        ] {
            assert!(kinds.contains(&want), "{want:?} in {kinds:?}");
        }
        assert!(t.rows.iter().any(|r| r.cells[1] == "review note"));
        assert!(t.all_rows_inspectable());
    }

    #[test]
    fn j_ac_22_the_conversion_report_shows_a_failing_paragraph_from_both_sides() {
        let t = fixture(ViewId::Conversion, GalleryState::Disputed);
        let bad: Vec<&Row> = t.rows.iter().filter(|r| r.cells[1] == "changed").collect();
        assert_eq!(bad.len(), 1);
        assert_eq!(bad[0].tone, Tone::Bad);
        assert!(bad[0].cells[2].contains('\u{20b9}'));
        assert!(bad[0].cells[3].contains("?5,00,000"));
        let (tone, banner) = t.banner.clone().unwrap();
        assert_eq!(tone, Tone::Bad);
        assert!(banner.contains("not for filing"));
        assert!(
            banner.contains("veraPDF not vendored"),
            "the stub validator is named"
        );
    }

    #[test]
    fn j_gui_an_unreadable_revision_and_a_hosting_fallback_say_so() {
        let t = crate::docviews::viewer_table(
            M,
            &json!({ "kind": "docx", "state": "unreadable", "reason": "not a ZIP package" }),
        );
        assert!(matches!(&t.state, ViewState::Error(m) if m.contains("not a ZIP")));
        let w = fixture(ViewId::WordCraft, GalleryState::Disputed);
        assert!(w.banner.unwrap().1.contains("own window"));
    }

    #[test]
    fn a_ac_16_every_query_command_has_a_registered_view() {
        let missing = uncovered(oa_kernel::Request::QUERY_NAMES);
        assert!(missing.is_empty(), "queries with no view: {missing:?}");
    }

    #[test]
    fn a_ac_16_registry_only_names_real_queries() {
        for d in REGISTRY {
            for c in d.covers {
                assert!(
                    oa_kernel::Request::QUERY_NAMES.contains(c),
                    "{} covers {c}, which is not a query command",
                    d.key
                );
            }
        }
    }

    #[test]
    fn a_ac_22_every_view_renders_in_every_gallery_state_without_a_kernel() {
        for d in REGISTRY {
            for st in GalleryState::ALL {
                let t = fixture(d.id, st);
                assert_eq!(t.view, d.id);
                match (&t.state, st) {
                    (ViewState::Loading, GalleryState::Loading) => {}
                    (ViewState::Error(m), GalleryState::Error) => assert!(!m.is_empty()),
                    (ViewState::Empty(m), GalleryState::Empty) => assert!(!m.is_empty()),
                    (_, GalleryState::Typical | GalleryState::Large | GalleryState::Disputed) => {}
                    other => panic!("{} {:?}: unexpected {other:?}", d.key, st),
                }
            }
        }
    }

    #[test]
    fn a_ac_17_every_row_of_every_view_can_open_the_inspector() {
        for d in REGISTRY {
            for st in [
                GalleryState::Typical,
                GalleryState::Large,
                GalleryState::Disputed,
            ] {
                assert!(
                    fixture(d.id, st).all_rows_inspectable(),
                    "{} {:?}",
                    d.key,
                    st
                );
            }
        }
    }

    #[test]
    fn c_ac_17_the_ledger_marks_the_first_bad_sequence() {
        let t = fixture(ViewId::Ledger, GalleryState::Disputed);
        let bad: Vec<_> = t.rows.iter().filter(|r| r.tone == Tone::Bad).collect();
        assert_eq!(bad.len(), 1);
        assert_eq!(bad[0].cells[0], "3");
        assert!(bad[0].cells[5].contains("FIRST BAD"));
        assert!(t.banner.unwrap().1.contains("sequence 3"));
    }

    #[test]
    fn c_ac_18_draft_history_shows_every_revision_with_head_and_checkpoint() {
        let t = fixture(ViewId::Drafts, GalleryState::Typical);
        assert_eq!(t.rows.len(), 4);
        assert!(t.rows[0].cells[4].contains("checkpoint filed-v1"));
        assert!(t.rows[3].cells[4].contains("HEAD"));
    }

    #[test]
    fn c_ac_19_a_stale_approval_is_shown_apart() {
        let t = fixture(ViewId::Approvals, GalleryState::Disputed);
        assert!(t.rows.iter().any(|r| r.cells[2].contains("STALE")));
        assert!(t.rows.iter().any(|r| r.tone == Tone::Warn));
    }

    #[test]
    fn f_ac_15_a_degraded_adapter_is_a_banner_in_the_capture_queue() {
        let t = fixture(ViewId::CaptureQueue, GalleryState::Disputed);
        assert!(t.banner.is_some());
        assert!(t.banner.unwrap().1.contains("degraded"));
        assert!(t.rows.iter().any(|r| r.cells[1] == "failed"));
    }

    #[test]
    fn f_ac_11_the_codebook_view_shows_the_verbatim_label() {
        let t = fixture(ViewId::Codebook, GalleryState::Typical);
        assert_eq!(t.rows[0].cells[2], "WP");
        assert_eq!(t.rows[0].cells[3], "Writ Petition (Civil)");
    }

    #[test]
    fn g_ac_16_the_line_inspector_shows_both_readings_confidences_versions_and_normalisation() {
        let t = fixture(ViewId::OcrLines, GalleryState::Typical);
        let detail = &t.rows[0].cells[2];
        assert!(detail.contains("the respondent"), "{detail}");
        assert!(detail.contains("the respondcnt"), "{detail}");
        assert!(detail.contains("0.95"), "{detail}");
        assert!(detail.contains("stub-1.0"), "{detail}");
        assert!(detail.contains("nfc-1"), "{detail}");
    }

    #[test]
    fn g_ac_17_a_disputed_token_is_highlighted_in_the_review_view() {
        let t = fixture(ViewId::OcrReview, GalleryState::Disputed);
        assert_eq!(t.rows[0].cells[2], "12.03.2019");
        assert_eq!(t.rows[0].cells[3], "12.08.2019");
        assert_eq!(t.rows[0].tone, Tone::Bad);
    }

    #[test]
    fn g_ac_15_the_review_view_shows_both_readings_and_the_decision_columns() {
        let t = fixture(ViewId::OcrReview, GalleryState::Typical);
        assert!(t.columns.contains(&"Reading A"));
        assert!(t.columns.contains(&"Reading B"));
        assert!(t.columns.contains(&"State"));
    }

    #[test]
    fn h_ac_02_a_client_item_shows_supplied_by_client_and_never_verified() {
        let t = fixture(ViewId::Facts, GalleryState::Typical);
        assert!(t.rows[2].cells[3].contains("Supplied by client"));
        assert!(t.rows[0].cells[3].contains("Court portal"));
        for r in &t.rows {
            for c in &r.cells {
                assert!(!c.to_lowercase().contains("verified"), "{c}");
            }
        }
    }

    #[test]
    fn h_ac_11_each_readiness_blocker_opens_its_item() {
        let t = fixture(ViewId::Readiness, GalleryState::Typical);
        assert_eq!(t.rows.len(), 4);
        assert!(t.banner.as_ref().unwrap().1.starts_with("Not ready: 4"));
        for r in &t.rows {
            match r.cells[0].as_str() {
                "review_item" | "ingest" => {
                    assert!(matches!(&r.subject, Subject::Record { id, .. } if !id.is_empty()))
                }
                _ => assert!(matches!(&r.subject, Subject::Raw(v) if v["id"].is_string())),
            }
        }
        let ready = fixture(ViewId::Readiness, GalleryState::Empty);
        assert_eq!(ready.banner.unwrap().0, Tone::Good);
    }

    #[test]
    fn h_ac_12_every_item_row_opens_its_peek_and_then_its_trace() {
        for view in [ViewId::Facts, ViewId::Chronology, ViewId::Notebook] {
            let t = fixture(view, GalleryState::Large);
            assert!(!t.rows.is_empty(), "{view:?}");
            for r in &t.rows {
                // One action: the Inspector opens the item's record.
                assert!(matches!(r.subject, Subject::Record { .. }), "{view:?}");
                // One more: the trace of the same item.
                assert!(item_of(r).is_some(), "{view:?}");
            }
        }
        let trace = fixture(ViewId::Trace, GalleryState::Typical);
        let steps: Vec<&str> = trace
            .rows
            .iter()
            .take(5)
            .map(|r| r.cells[1].as_str())
            .collect();
        assert_eq!(
            steps,
            ["Extract", "Line", "Page", "Source hash", "Original file"]
        );
    }

    #[test]
    fn h_ac_13_excluded_events_are_marked_under_show_excluded() {
        let t = fixture(ViewId::Chronology, GalleryState::Disputed);
        let excluded: Vec<_> = t
            .rows
            .iter()
            .filter(|r| r.cells[4].starts_with("excluded"))
            .collect();
        assert_eq!(excluded.len(), 1);
        assert_eq!(excluded[0].tone, Tone::Muted);
    }

    #[test]
    fn h_gui_the_notebook_pane_shows_counts_per_section() {
        let t = fixture(ViewId::Notebook, GalleryState::Typical);
        assert_eq!(t.rows.len(), 8);
        assert_eq!(
            t.columns,
            [
                "Section",
                "Items",
                "Candidate",
                "Confirmed",
                "Disputed",
                "Excluded"
            ]
        );
        let d = fixture(ViewId::Notebook, GalleryState::Disputed);
        assert!(d.banner.unwrap().1.contains("missing cnr"));
        assert!(d
            .rows
            .iter()
            .any(|r| r.cells[3] == "disputed" && r.tone == Tone::Bad));
    }

    #[test]
    fn c_rule_missing_bytes_are_a_visible_state_on_the_evidence_entry() {
        let t = fixture(ViewId::Evidence, GalleryState::Disputed);
        assert_eq!(t.rows[0].cells[3], "missing bytes");
        assert_eq!(t.rows[0].tone, Tone::Bad);
    }
}

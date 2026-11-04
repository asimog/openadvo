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
    fn new(view: ViewId, columns: &[&'static str], rows: Vec<Row>, empty: &str) -> Self {
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

fn s(v: &Value, key: &str) -> String {
    match &v[key] {
        Value::String(t) => t.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn short(hash: &str) -> String {
    let h = hash.strip_prefix("sha256:").unwrap_or(hash);
    h.chars().take(10).collect()
}

fn short_url(url: &str) -> String {
    let u = url.strip_prefix("https://").unwrap_or(url);
    u.chars().take(42).collect()
}

fn rec(matter: &str, id: String) -> Subject {
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
        ViewId::Overview | ViewId::Inspector => Table::new(view, &["Field", "Value"], Vec::new(), "Select a matter."),
    }
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
    fn c_rule_missing_bytes_are_a_visible_state_on_the_evidence_entry() {
        let t = fixture(ViewId::Evidence, GalleryState::Disputed);
        assert_eq!(t.rows[0].cells[3], "missing bytes");
        assert_eq!(t.rows[0].tone, Tone::Bad);
    }
}

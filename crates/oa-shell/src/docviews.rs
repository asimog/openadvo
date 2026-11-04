//! The spec J views: our viewer, the document viewer, the edit surface, the
//! Changes viewer, the WordCraft pane, the fidelity report and the
//! conversion report. Pure tables, like `views.rs`.

use serde_json::{json, Value};

use crate::views::{clip, rec, s, short, Row, Subject, Table, Tone, ViewId};

fn list(v: &Value) -> String {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default()
}

/// Our viewer (J01, J02): a revision's paragraphs, or a PDF's lines with
/// disputed lines marked. An unreadable revision says why.
pub fn viewer_table(matter: &str, v: &Value) -> Table {
    if v["state"] == "unreadable" {
        let mut t = Table::new(ViewId::Viewer, &["Paragraph", "Text"], Vec::new(), "");
        t.state = crate::views::ViewState::Error(format!("unreadable: {}", s(v, "reason")));
        return t;
    }
    let mut rows = Vec::new();
    if v["kind"] == "docx" {
        for p in v["paragraphs"].as_array().into_iter().flatten() {
            rows.push(Row {
                cells: vec![
                    "".into(),
                    s(p, "id"),
                    clip(&s(p, "text"), 120),
                    if p["notes"].as_array().is_some_and(|n| !n.is_empty()) {
                        "note".into()
                    } else {
                        String::new()
                    },
                ],
                subject: Subject::Raw(p.clone()),
                tone: Tone::Normal,
            });
        }
    } else {
        for (n, page) in v["pages"].as_array().into_iter().flatten().enumerate() {
            match page {
                Value::String(text) => {
                    for (i, line) in text.lines().enumerate() {
                        rows.push(Row {
                            cells: vec![
                                format!("{}", n + 1),
                                format!("{}", i + 1),
                                clip(line, 120),
                                String::new(),
                            ],
                            subject: rec(matter, s(v, "target")),
                            tone: Tone::Normal,
                        });
                    }
                }
                _ => {
                    for l in page["lines"].as_array().into_iter().flatten() {
                        let bad = l["disputed"] == true;
                        rows.push(Row {
                            cells: vec![
                                s(page, "page"),
                                s(l, "line"),
                                clip(&s(l, "text"), 120),
                                if bad {
                                    "disputed".into()
                                } else {
                                    String::new()
                                },
                            ],
                            subject: Subject::Raw(l.clone()),
                            tone: if bad { Tone::Bad } else { Tone::Normal },
                        });
                    }
                }
            }
        }
    }
    let mut t = Table::new(
        ViewId::Viewer,
        &["Page", "Line or paragraph", "Text", "Marks"],
        rows,
        "Nothing to show: this document has no text layer or OCR run yet.",
    );
    let label = match (v["kind"].as_str(), v["role"].as_str()) {
        (Some("docx"), _) => format!(
            "DOCX revision {} ({} pages)",
            short(&s(v, "target")),
            s(v, "page_count")
        ),
        (_, Some("filing")) => format!(
            "Filing PDF/A, read only: never edited (J rule 13). {} pages",
            s(v, "page_count")
        ),
        _ => format!("{} {}", s(v, "file_name"), s(v, "state")),
    };
    t.banner = Some((Tone::Normal, label));
    t
}

/// The document viewer (J02): paragraphs by id with their event and authority
/// ids and review notes.
pub fn document_table(v: &Value) -> Table {
    let rows = v["paragraphs"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|p| {
            let notes = p["notes"].as_array().map_or(0, Vec::len);
            Row {
                cells: vec![
                    s(p, "id"),
                    s(p, "style"),
                    clip(&s(p, "text"), 90),
                    list(&p["sources"]["events"]),
                    list(&p["sources"]["authorities"]),
                    if notes > 0 {
                        format!("{notes}")
                    } else {
                        String::new()
                    },
                ],
                subject: Subject::Raw(p.clone()),
                tone: Tone::Normal,
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::Document,
        &[
            "Paragraph",
            "Style",
            "Text",
            "Events",
            "Authorities",
            "Notes",
        ],
        rows,
        "Choose a draft in Drafts to see its paragraphs.",
    );
    t.banner = Some((
        Tone::Normal,
        format!(
            "Revision {} of draft {}",
            short(&s(v, "revision")),
            s(v, "draft")
        ),
    ));
    t
}

/// The edit surface (J03): proposals as marked changes against paragraphs.
pub fn edit_surface_table(matter: &str, proposals: &[Value]) -> Table {
    let rows = proposals
        .iter()
        .map(|p| {
            let state = s(p, "state");
            let tone = match state.as_str() {
                "pending" => Tone::Warn,
                "accepted" => Tone::Good,
                _ => Tone::Muted,
            };
            let kind = if p["type"] == "import" {
                "WordCraft save on a moved head".to_string()
            } else {
                format!(
                    "- {}\n+ {}",
                    clip(&s(p, "original"), 70),
                    clip(&s(p, "replace"), 70)
                )
            };
            Row {
                cells: vec![
                    s(p, "id"),
                    s(p, "para"),
                    if p["rebased_from"].is_string() {
                        format!("{state} (re-based)")
                    } else {
                        state
                    },
                    kind,
                    s(p, "author"),
                    clip(&s(p, "reason"), 40),
                ],
                subject: rec(matter, s(p, "id")),
                tone,
            }
        })
        .collect();
    Table::new(
        ViewId::EditSurface,
        &[
            "Proposal",
            "Paragraph",
            "State",
            "Change",
            "Author",
            "Reason",
        ],
        rows,
        "No pending proposals.",
    )
}

/// The one Changes viewer (J15): every revision against its parent, with its
/// author, and review notes under their paragraphs.
pub fn changes_table(matter: &str, ch: &Value) -> Table {
    let notes = ch["notes"].as_array().cloned().unwrap_or_default();
    let mut rows = Vec::new();
    for r in ch["revisions"].as_array().into_iter().flatten() {
        let rev = s(r, "revision");
        let head = if r["head"] == true { " (head)" } else { "" };
        let kind = format!("{}{head}", s(r, "kind"));
        let changes = r["changes"].as_array().cloned().unwrap_or_default();
        if changes.is_empty() {
            rows.push(Row {
                cells: vec![
                    short(&rev),
                    kind.clone(),
                    s(r, "author"),
                    String::new(),
                    String::new(),
                    String::new(),
                ],
                subject: rec(matter, rev.clone()),
                tone: Tone::Muted,
            });
        }
        for c in &changes {
            let para = s(c, "para");
            rows.push(Row {
                cells: vec![
                    short(&rev),
                    kind.clone(),
                    s(r, "author"),
                    format!("{para} {}", s(c, "change")),
                    clip(&s(c, "before"), 60),
                    clip(&s(c, "after"), 60),
                ],
                subject: rec(matter, rev.clone()),
                tone: if r["revertable"] == true {
                    Tone::Warn
                } else {
                    Tone::Normal
                },
            });
            for n in notes
                .iter()
                .filter(|n| n["para"] == para.as_str() && n["revision"] == rev.as_str())
            {
                rows.push(Row {
                    cells: vec![
                        String::new(),
                        "review note".into(),
                        s(n, "author"),
                        para.clone(),
                        String::new(),
                        clip(&s(n, "text"), 60),
                    ],
                    subject: rec(matter, s(n, "id")),
                    tone: Tone::Muted,
                });
            }
        }
    }
    let mut t = Table::new(
        ViewId::Changes,
        &["Revision", "Kind", "Author", "Paragraph", "Before", "After"],
        rows,
        "Choose a draft to see its changes.",
    );
    t.banner = Some(if ch["agent_capability"] == true {
        (
            Tone::Normal,
            "Notes can be sent to the agent from this view.".into(),
        )
    } else {
        (
            Tone::Normal,
            "Read only: review notes stay here; the agent capability is not granted.".into(),
        )
    });
    t
}

/// The WordCraft pane (J05): the editor session and how the window is hosted.
pub fn wordcraft_table(matter: &str, status: &Value, hosting: Option<&Value>) -> Table {
    let session = s(status, "id");
    let subject = || {
        if session.is_empty() {
            Subject::Raw(status.clone())
        } else {
            rec(matter, session.clone())
        }
    };
    let mut rows = vec![
        ("Draft", s(status, "title"), Tone::Normal),
        ("Session", s(status, "state"), Tone::Normal),
    ];
    if status["state"] == "open" {
        rows.push(("Working copy", s(status, "working"), Tone::Normal));
        rows.push((
            "Opened on revision",
            short(&s(status, "base")),
            Tone::Normal,
        ));
        rows.push((
            "Head moved since",
            if status["head_moved"] == true {
                "yes: a save becomes a proposal".into()
            } else {
                "no".into()
            },
            if status["head_moved"] == true {
                Tone::Warn
            } else {
                Tone::Normal
            },
        ));
        rows.push((
            "Saved, not imported",
            if status["unimported_save"] == true {
                "yes".into()
            } else {
                "no".into()
            },
            if status["unimported_save"] == true {
                Tone::Warn
            } else {
                Tone::Normal
            },
        ));
        if status["autosave"].is_string() {
            rows.push(("Autosave to recover", s(status, "autosave"), Tone::Warn));
        }
    }
    let mut banner = None;
    match hosting {
        Some(h) => {
            rows.push(("Hosting", s(&h["mode"], "mode"), Tone::Normal));
            if let Some(notice) = h["notice"].as_str() {
                banner = Some((Tone::Warn, notice.to_string()));
            }
        }
        None => rows.push((
            "Hosting",
            "not running: the WordCraft fork is not vendored in this build".into(),
            Tone::Muted,
        )),
    }
    let rows = rows
        .into_iter()
        .map(|(k, v, tone)| Row {
            cells: vec![k.to_string(), v],
            subject: subject(),
            tone,
        })
        .collect();
    let mut t = Table::new(
        ViewId::WordCraft,
        &["Field", "Value"],
        rows,
        "Choose a draft.",
    );
    t.banner = banner;
    t
}

/// The fidelity report (J12): each renderer, then each page that differs.
pub fn fidelity_table(report: &Value) -> Table {
    let mut rows = Vec::new();
    for r in report["renderers"].as_array().into_iter().flatten() {
        let available = r["pages"].is_array();
        rows.push(Row {
            cells: vec![
                s(r, "renderer"),
                String::new(),
                if available {
                    format!("{} pages", r["pages"].as_array().map_or(0, Vec::len))
                } else {
                    format!("not compared: {}", s(r, "detail"))
                },
                String::new(),
            ],
            subject: Subject::Raw(r.clone()),
            tone: if available { Tone::Normal } else { Tone::Muted },
        });
    }
    for d in report["differences"].as_array().into_iter().flatten() {
        let failed = d["failed"] == true;
        rows.push(Row {
            cells: vec![
                s(d, "renderer"),
                s(d, "page"),
                format!(
                    "{:.1}% different",
                    d["difference"].as_f64().unwrap_or(0.0) * 100.0
                ),
                format!(
                    "{} | {}",
                    clip(&s(d, "reference_excerpt"), 40),
                    clip(&s(d, "other_excerpt"), 40)
                ),
            ],
            subject: Subject::Raw(d.clone()),
            tone: if failed { Tone::Bad } else { Tone::Warn },
        });
    }
    let mut t = Table::new(
        ViewId::Fidelity,
        &["Renderer", "Page", "Result", "Reference | other"],
        rows,
        "Choose a revision to compare its renderers.",
    );
    if report.is_object() {
        let passed = report["passed"] == true;
        t.banner = Some((
            if passed { Tone::Good } else { Tone::Bad },
            format!(
                "{} against {} at threshold {}",
                if passed {
                    "Within the threshold"
                } else {
                    "Above the threshold"
                },
                s(report, "reference"),
                s(report, "threshold")
            ),
        ));
    }
    t
}

/// The conversion report: the latest conversion's PDF/A checks, then the
/// DOCX and the PDF/A side by side, paragraph by paragraph.
pub fn conversion_table(matter: &str, conversions: &[Value]) -> Table {
    let Some(c) = conversions.last() else {
        return Table::new(
            ViewId::Conversion,
            &["Paragraph", "Outcome", "DOCX", "PDF/A"],
            Vec::new(),
            "No conversion yet. `oa filing pdf` converts the approved head.",
        );
    };
    let id = s(c, "id");
    let mut rows = Vec::new();
    for chk in c["validation"]["checks"].as_array().into_iter().flatten() {
        let outcome = s(chk, "outcome");
        rows.push(Row {
            cells: vec![
                format!("PDF/A: {}", s(chk, "name")),
                outcome.clone(),
                s(chk, "detail"),
                String::new(),
            ],
            subject: rec(matter, id.clone()),
            tone: match outcome.as_str() {
                "pass" => Tone::Good,
                "fail" => Tone::Bad,
                _ => Tone::Muted,
            },
        });
    }
    for p in c["check"]["paragraphs"].as_array().into_iter().flatten() {
        let same = p["outcome"] == "same";
        rows.push(Row {
            cells: vec![
                s(p, "para"),
                s(p, "outcome"),
                clip(&s(p, "docx"), 70),
                clip(&s(p, "pdf"), 70),
            ],
            subject: Subject::Raw(p.clone()),
            tone: if same { Tone::Normal } else { Tone::Bad },
        });
    }
    let mut t = Table::new(
        ViewId::Conversion,
        &["Paragraph", "Outcome", "DOCX", "PDF/A"],
        rows,
        "",
    );
    let passed = c["state"] == "passed";
    t.banner = Some((
        if passed { Tone::Good } else { Tone::Bad },
        format!(
            "Conversion {}: {}. PDF/A {}{} by {}{}. DOCX {} to PDF {}{}",
            short(&id),
            if passed {
                "check passed"
            } else {
                "check FAILED; not for filing"
            },
            s(&c["pdfa"], "part"),
            s(&c["pdfa"], "conformance"),
            s(&c["validation"], "validator"),
            if c["validation"]["passed"] == true {
                ""
            } else {
                " (failed)"
            },
            short(&s(c, "docx_hash")),
            short(&s(c, "pdf_hash")),
            if c["file_matches"] == false {
                ". The file on disk no longer matches"
            } else {
                ""
            },
        ),
    ));
    t
}

const REV: &str = "sha256:aa1b2c3d4e000000000000000000000000000000000000000000000000000000";

fn fx_paras(n: usize, disputed: bool) -> Vec<Value> {
    (0..n)
        .map(|i| {
            json!({
                "id": format!("{:08X}", 0x1000_0001 + i),
                "kind": "paragraph",
                "style": if i % 6 == 0 { json!("Heading1") } else { Value::Null },
                "text": format!("{:02}.03.2019: Order passed in W.P. No. 1234/2018, paragraph {}", 1 + i % 28, i + 1),
                "sources": { "events": [format!("01EVENT{i:03}")], "authorities": if i % 5 == 4 { json!(["urn:ulos:judgment:insc:2019:212"]) } else { json!([]) } },
                "notes": if disputed && i == 1 { json!([{ "text": "Check the date", "author": "advocate" }]) } else { json!([]) },
                "xml_hash": format!("sha256:{i:064x}"),
            })
        })
        .collect()
}

/// Gallery fixtures for the spec J views.
pub fn typical(view: ViewId, matter: &str, n: usize, disputed: bool) -> Table {
    if n == 0 && matches!(view, ViewId::WordCraft | ViewId::Fidelity) {
        return Table::new(
            view,
            &["Field", "Value"],
            Vec::new(),
            "No draft yet. `oa draft new --template slp` generates one.",
        );
    }
    match view {
        ViewId::Viewer => {
            if disputed {
                viewer_table(
                    matter,
                    &json!({
                        "kind": "pdf", "target": "E1", "file_name": "impugned-order.pdf", "state": "readable",
                        "pages": [{ "page": 1, "lines": (0..n).map(|i| json!({
                            "line": i, "text": format!("ORDER dated {:02}.03.2019", 12 + i), "disputed": i == 1,
                        })).collect::<Vec<_>>() }],
                    }),
                )
            } else {
                viewer_table(
                    matter,
                    &json!({ "kind": "docx", "target": REV, "state": "readable", "page_count": 1 + n / 40, "paragraphs": fx_paras(n, false) }),
                )
            }
        }
        ViewId::Document => document_table(
            &json!({ "revision": REV, "draft": "01DRAFT", "paragraphs": fx_paras(n, disputed) }),
        ),
        ViewId::EditSurface => edit_surface_table(
            matter,
            &(0..n)
                .map(|i| json!({
                    "id": format!("01PROP{i:03}"), "type": if disputed && i == 0 { "import" } else { "edit" },
                    "para": format!("{:08X}", 0x1000_0005 + i), "original": "07.03.2019: Interim order granting stay",
                    "replace": "07.03.2019: Interim order granting stay of demolition", "author": if disputed && i == 0 { "wordcraft" } else { "agent:turn-7" },
                    "reason": "the order says demolition", "state": if i % 4 == 3 { "accepted" } else { "pending" },
                    "rebased_from": if disputed && i == 1 { json!("01PROP000") } else { Value::Null },
                }))
                .collect::<Vec<_>>(),
        ),
        ViewId::Changes => changes_table(
            matter,
            &json!({
                "agent_capability": disputed,
                "revisions": (0..n).map(|i| {
                    let kind = ["generated", "proposal", "wordcraft_save", "restore"][i % 4];
                    let author = ["advocate", "agent:turn-7", "wordcraft", "advocate"][i % 4];
                    json!({
                        "revision": format!("sha256:{:02x}{}", 0xa0 + i % 96, "0".repeat(62)), "kind": kind, "author": author,
                        "head": i + 1 == n, "revertable": kind == "proposal",
                        "changes": if i == 0 { json!([]) } else { json!([{ "para": "10000005", "change": "changed",
                            "before": "The synopsis as generated.", "after": format!("The synopsis, edit {i}.") }]) },
                    })
                }).collect::<Vec<_>>(),
                "notes": if n > 1 { json!([{ "id": "01NOTE", "para": "10000005", "revision": format!("sha256:{:02x}{}", 0xa1, "0".repeat(62)), "text": "Check against the order", "author": "advocate" }]) } else { json!([]) },
            }),
        ),
        ViewId::WordCraft => {
            let status = if n == 0 {
                json!({ "title": "SLP against the High Court order", "state": "closed" })
            } else {
                json!({
                    "id": "01SESSION", "title": "SLP against the High Court order", "state": "open",
                    "working": r"C:\Users\advocate\AppData\Roaming\OpenAdvocate\wordcraft\01M\01D\01S\working.docx",
                    "base": REV, "head_moved": disputed, "unimported_save": true,
                    "autosave": if disputed { json!(r"C:\...\working.docx.autosave") } else { Value::Null },
                })
            };
            let hosting = disputed.then(|| {
                json!({ "mode": { "mode": "fallback", "reason": "reparenting failed at the change to 144 DPI" },
                        "notice": "The editor is shown in its own window owned by Open Advocate: reparenting failed at the change to 144 DPI." })
            });
            wordcraft_table(matter, &status, hosting.as_ref())
        }
        ViewId::Fidelity => {
            let diffs: Vec<Value> = (0..n.min(40))
                .map(|i| json!({
                    "page": i + 1, "renderer": if i % 2 == 0 { "viewer" } else { "word" },
                    "difference": if disputed && i == 0 { 0.31 } else { 0.01 },
                    "reference_excerpt": "IN THE SUPREME COURT OF INDIA CIVIL APPELLATE JURISDICTION",
                    "other_excerpt": if disputed && i == 0 { "IN THE HIGH COURT" } else { "IN THE SUPREME COURT OF INDIA CIVIL" },
                    "failed": disputed && i == 0,
                }))
                .collect();
            fidelity_table(&json!({
                "reference": "wordcraft-engine stub-0.1", "threshold": 0.02, "passed": !disputed,
                "renderers": [
                    { "renderer": "wordcraft-engine stub-0.1", "pages": ["p", "p", "p"] },
                    { "renderer": "viewer", "pages": ["p", "p", "p"] },
                    { "renderer": "word", "pages": null, "detail": "Word through COM is not wired yet" },
                ],
                "differences": diffs,
            }))
        }
        ViewId::Conversion => {
            if n == 0 {
                return conversion_table(matter, &[]);
            }
            let paras: Vec<Value> = (0..n)
                .map(|i| {
                    let bad = disputed && i == 2;
                    json!({
                        "para": format!("{:08X}", 0x1000_0001 + i),
                        "outcome": if bad { "changed" } else { "same" },
                        "docx": if bad { "Costs of \u{20b9}5,00,000 were awarded." } else { "07.03.2019: Interim order granting stay" },
                        "pdf": if bad { "Costs of ?5,00,000 were awarded." } else { "07.03.2019: Interim order granting stay" },
                    })
                })
                .collect();
            conversion_table(
                matter,
                &[json!({
                    "id": "01CONVERSION", "state": if disputed { "failed" } else { "passed" },
                    "docx_hash": REV, "pdf_hash": format!("sha256:{:064x}", 7), "file_matches": true,
                    "pdfa": { "part": 2, "conformance": "B" },
                    "validation": { "validator": "oa-pdfa-preflight (stub; veraPDF not vendored)", "passed": true, "checks": [
                        { "name": "identification", "outcome": "pass", "detail": "XMP declares 2B" },
                        { "name": "output_intent", "outcome": "pass", "detail": "catalog /OutputIntents" },
                        { "name": "fonts_embedded", "outcome": "not_checked", "detail": "font embedding needs veraPDF (Q)" },
                    ] },
                    "check": { "passed": !disputed, "paragraphs": paras },
                })],
            )
        }
        _ => Table::new(view, &["Field", "Value"], Vec::new(), ""),
    }
}

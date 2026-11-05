//! Group D views (spec D): Tool card, Context manifest, Waiting on you,
//! Sub-agents, Matter memory, Effects, and Services (D-VIS-03).

use serde_json::json;

use crate::views::{Row, Subject, Table, Tone, ViewId};

pub fn typical(view: ViewId, matter: &str, n: usize, disputed: bool) -> Table {
    match view {
        ViewId::ToolCard => tool_card_table(matter, n, disputed),
        ViewId::ContextManifest => context_manifest_table(matter, n, disputed),
        ViewId::WaitingOnYou => waiting_on_you_table(matter, n, disputed),
        ViewId::SubAgents => sub_agents_table(matter, n, disputed),
        ViewId::MatterMemory => matter_memory_table(matter, n, disputed),
        ViewId::Effects => effects_table(matter, n, disputed),
        ViewId::Services => services_table(matter, n, disputed),
        _ => Table::new(view, &["Field", "Value"], Vec::new(), "No data"),
    }
}

pub fn tool_card_table(matter: &str, n: usize, disputed: bool) -> Table {
    let cols = &["Field", "Value"];
    if n == 0 {
        return Table::new(ViewId::ToolCard, cols, Vec::new(), "No tool card selected.");
    }
    let rows = vec![
        Row {
            cells: vec!["Tool Name".into(), "evidence.import".into()],
            subject: Subject::Raw(json!({ "field": "name", "value": "evidence.import" })),
            tone: Tone::Normal,
        },
        Row {
            cells: vec!["Command Class".into(), "internal".into()],
            subject: Subject::Raw(json!({ "field": "class", "value": "internal" })),
            tone: Tone::Normal,
        },
        Row {
            cells: vec![
                "Effect State".into(),
                if disputed {
                    "unknown".into()
                } else {
                    "returned".into()
                },
            ],
            subject: Subject::Raw(
                json!({ "field": "effect_state", "value": if disputed { "unknown" } else { "returned" } }),
            ),
            tone: if disputed { Tone::Bad } else { Tone::Good },
        },
        Row {
            cells: vec![
                "Arguments".into(),
                "{\"doc\": \"order-1.pdf\", \"matter\": \"01M01\"}".into(),
            ],
            subject: Subject::Record {
                matter: matter.into(),
                id: "TC01".into(),
            },
            tone: Tone::Normal,
        },
        Row {
            cells: vec![
                "Result Preview".into(),
                "Imported 12 pages successfully".into(),
            ],
            subject: Subject::Raw(json!({ "field": "preview", "value": "Imported 12 pages" })),
            tone: Tone::Normal,
        },
    ];
    let mut t = Table::new(ViewId::ToolCard, cols, rows, "No tool card selected.");
    if disputed {
        t.banner = Some((
            Tone::Bad,
            "Effect state is unknown. Reconciliation required before retry.".into(),
        ));
    }
    t
}

pub fn context_manifest_table(matter: &str, n: usize, disputed: bool) -> Table {
    let cols = &["Turn", "Item", "Anchor", "Tokens", "Disputed"];
    if n == 0 {
        return Table::new(
            ViewId::ContextManifest,
            cols,
            Vec::new(),
            "No context manifests recorded.",
        );
    }
    let rows = (0..n)
        .map(|i| {
            let is_disp = disputed && i == 0;
            Row {
                cells: vec![
                    format!("{}", (i / 2) + 1),
                    format!("Evidence doc-{}", i + 1),
                    format!("page-{}", i + 1),
                    format!("{}", 120 + i * 45),
                    if is_disp {
                        "YES (disputed span)".into()
                    } else {
                        "No".into()
                    },
                ],
                subject: Subject::Record {
                    matter: matter.into(),
                    id: format!("CM{:02}", i),
                },
                tone: if is_disp { Tone::Bad } else { Tone::Normal },
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::ContextManifest,
        cols,
        rows,
        "No context manifests recorded.",
    );
    if disputed {
        t.banner = Some((
            Tone::Warn,
            "Context contains 1 disputed span from OCR reading conflict.".into(),
        ));
    }
    t
}

pub fn waiting_on_you_table(matter: &str, n: usize, disputed: bool) -> Table {
    let cols = &["Gate ID", "Gate Type", "Target", "Status", "Reason"];
    if n == 0 {
        return Table::new(
            ViewId::WaitingOnYou,
            cols,
            Vec::new(),
            "No runs blocked on gates.",
        );
    }
    let rows = (0..n)
        .map(|i| {
            let is_disp = disputed && i == 0;
            Row {
                cells: vec![
                    format!("GATE-{i}"),
                    "approval.decide".into(),
                    format!("revision-{}", i + 1),
                    if is_disp {
                        "stalled".into()
                    } else {
                        "waiting_on_human".into()
                    },
                    if is_disp {
                        "Run stalled: supervisor restart budget exhausted".into()
                    } else {
                        "Requires advocate review of filing revision".into()
                    },
                ],
                subject: Subject::Record {
                    matter: matter.into(),
                    id: format!("G{:02}", i),
                },
                tone: if is_disp { Tone::Bad } else { Tone::Warn },
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::WaitingOnYou,
        cols,
        rows,
        "No runs blocked on gates.",
    );
    if disputed {
        t.banner = Some((
            Tone::Bad,
            "1 gate has stalled. Human intervention required.".into(),
        ));
    }
    t
}

pub fn sub_agents_table(matter: &str, n: usize, disputed: bool) -> Table {
    let cols = &[
        "Sub-Agent ID",
        "Role",
        "Tool Allowlist",
        "Budget Used",
        "Return State",
    ];
    if n == 0 {
        return Table::new(
            ViewId::SubAgents,
            cols,
            Vec::new(),
            "No sub-agents have been spawned.",
        );
    }
    let rows = (0..n)
        .map(|i| {
            let is_disp = disputed && i == 0;
            Row {
                cells: vec![
                    format!("SUB-{:02}", i + 1),
                    if i % 2 == 0 {
                        "judgment_research".into()
                    } else {
                        "document_drafter".into()
                    },
                    "query, verify, inspect".into(),
                    format!("{}/{} tokens", 400 + i * 200, 2000),
                    if is_disp {
                        "failed: over budget cap".into()
                    } else {
                        "completed".into()
                    },
                ],
                subject: Subject::Record {
                    matter: matter.into(),
                    id: format!("SA{:02}", i),
                },
                tone: if is_disp { Tone::Bad } else { Tone::Good },
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::SubAgents,
        cols,
        rows,
        "No sub-agents have been spawned.",
    );
    if disputed {
        t.banner = Some((
            Tone::Bad,
            "Sub-agent SUB-01 failed due to exceeding configured token budget.".into(),
        ));
    }
    t
}

pub fn matter_memory_table(matter: &str, n: usize, disputed: bool) -> Table {
    let cols = &["Section", "Notes & Facts", "Last Editor", "Attributed To"];
    if n == 0 {
        return Table::new(
            ViewId::MatterMemory,
            cols,
            Vec::new(),
            "Matter memory is empty.",
        );
    }
    let rows = (0..n)
        .map(|i| {
            let is_disp = disputed && i == 0;
            Row {
                cells: vec![
                    format!("§{}", i + 1),
                    format!(
                        "Procedural history point {}: order passed on 2024-05-12",
                        i + 1
                    ),
                    if is_disp {
                        "advocate (correction)".into()
                    } else {
                        "orchestrator".into()
                    },
                    if is_disp {
                        "human".into()
                    } else {
                        "agent:turn-1".into()
                    },
                ],
                subject: Subject::Record {
                    matter: matter.into(),
                    id: format!("MEM{:02}", i),
                },
                tone: if is_disp { Tone::Warn } else { Tone::Normal },
            }
        })
        .collect();
    let mut t = Table::new(ViewId::MatterMemory, cols, rows, "Matter memory is empty.");
    if disputed {
        t.banner = Some((
            Tone::Warn,
            "Advocate manual edit applied to memory section §1.".into(),
        ));
    }
    t
}

pub fn effects_table(matter: &str, n: usize, disputed: bool) -> Table {
    let cols = &[
        "Effect ID",
        "Command",
        "State",
        "Intent Recorded",
        "Reconciliation",
    ];
    if n == 0 {
        return Table::new(
            ViewId::Effects,
            cols,
            Vec::new(),
            "No external or internal effect intents recorded.",
        );
    }
    let rows = (0..n)
        .map(|i| {
            let is_disp = disputed && i == 0;
            Row {
                cells: vec![
                    format!("EFF-{:03}", i + 1),
                    if i % 2 == 0 {
                        "matter.write_file".into()
                    } else {
                        "browser.open".into()
                    },
                    if is_disp {
                        "unknown".into()
                    } else {
                        "returned".into()
                    },
                    "2026-11-04T10:00:00Z".into(),
                    if is_disp {
                        "pending check".into()
                    } else {
                        "verified clean".into()
                    },
                ],
                subject: Subject::Record {
                    matter: matter.into(),
                    id: format!("EFF{:03}", i),
                },
                tone: if is_disp { Tone::Bad } else { Tone::Good },
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::Effects,
        cols,
        rows,
        "No external or internal effect intents recorded.",
    );
    if disputed {
        t.banner = Some((
            Tone::Bad,
            "Unknown effect detected: check outbox or run reconciliation before retry.".into(),
        ));
    }
    t
}

pub fn services_table(matter: &str, n: usize, disputed: bool) -> Table {
    let cols = &[
        "Service Name",
        "State",
        "Restarts Used",
        "Restart Budget",
        "Version",
    ];
    if n == 0 {
        return Table::new(
            ViewId::Services,
            cols,
            Vec::new(),
            "No supervised services registered.",
        );
    }
    let services = [
        "harness",
        "ocr-tesseract",
        "ocr-paddle",
        "browser-pool",
        "wordcraft",
        "pdfcraft",
    ];
    let rows = (0..n)
        .map(|i| {
            let name = services[i % services.len()];
            let is_disp = disputed && i == 0;
            Row {
                cells: vec![
                    name.into(),
                    if is_disp {
                        "stopped".into()
                    } else {
                        "running".into()
                    },
                    format!("{}", if is_disp { 1 } else { 0 }),
                    "3".into(),
                    "0.1.0".into(),
                ],
                subject: Subject::Record {
                    matter: matter.into(),
                    id: format!("SVC-{name}"),
                },
                tone: if is_disp { Tone::Warn } else { Tone::Good },
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::Services,
        cols,
        rows,
        "No supervised services registered.",
    );
    if disputed {
        t.banner = Some((
            Tone::Warn,
            "Harness service stopped mid-turn; supervisor will restart.".into(),
        ));
    }
    t
}

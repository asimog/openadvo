//! Spec H kernel acceptance: the Notebook's writers, views, conflicts,
//! readiness and traceability, and the G criteria that close through it.

use std::sync::Arc;

use oa_kernel::{
    AdapterHealthInput, Attachment, CaptureInput, ClientSpec, Ctx, Hooks, Kernel,
    OcrEngineHealthInput, OcrPageInput, OcrReadingInput, OcrRunInput, PresencePrompt, Request,
};
use oa_notebook::{ImpugnedOrder, Item, ItemInput, NoteAnchor, Section};
use oa_ocr::{Reading, Rect};
use oa_store::sqlite::SqliteFactory;
use oa_store::{JobRow, JobStatus, JobUpdate, StoreFactory};
use oa_types::{new_key, ErrorCode, OaError, Origin};
use serde_json::Value;
use tempfile::TempDir;

struct Present;

impl PresencePrompt for Present {
    fn confirm(&self, _summary: &str) -> bool {
        true
    }
}

struct Fx {
    _tmp: TempDir,
    app: std::path::PathBuf,
    k: Kernel,
    m: String,
}

fn fx() -> Fx {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("root");
    let app = tmp.path().join("app");
    let k = Kernel::new(
        &app,
        Arc::new(SqliteFactory),
        Hooks {
            presence: Arc::new(Present),
            ..Hooks::default()
        },
    );
    k.dispatch(
        &Ctx::new(Origin::Cli, new_key()),
        Request::WorkspaceInit { root },
    )
    .unwrap();
    let m = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::MatterCreate {
                title: "Rao v. State".into(),
                client: ClientSpec::None,
                from: None,
            },
        )
        .unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    Fx {
        _tmp: tmp,
        app,
        k,
        m,
    }
}

impl Fx {
    fn act(&self, req: Request) -> Result<Value, OaError> {
        self.k
            .dispatch(&Ctx::new(Origin::Cli, new_key()), req)
            .map(|mut v| v.remove(0))
    }

    fn q(&self, req: Request) -> Vec<Value> {
        self.k.dispatch(&Ctx::query(Origin::Cli), req).unwrap()
    }

    fn import(&self, name: &str) -> String {
        self.act(Request::EvidenceImport {
            matter: Some(self.m.clone()),
            files: vec![Attachment {
                file_name: name.into(),
                bytes: format!("bytes of {name}").into_bytes(),
            }],
        })
        .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string()
    }

    fn capture(&self, name: &str, portal_date: Option<&str>) -> String {
        let input = CaptureInput {
            file: Some(Attachment {
                file_name: name.into(),
                bytes: format!("portal bytes of {name}").into_bytes(),
            }),
            origin: "court_portal".into(),
            url: "https://sc.example/case/1".into(),
            final_url: "https://sc.example/case/1".into(),
            captured_at: "2026-11-04T00:00:00.000Z".into(),
            profile: "portal".into(),
            gesture: "click:order-download".into(),
            portal_date: portal_date.map(str::to_string),
            adapter: "supreme_court_case_status".into(),
            status: "completed".into(),
            reason: None,
            health: Some(AdapterHealthInput {
                contract_state: "healthy".into(),
                runtime_state: "healthy".into(),
                detail: None,
            }),
            codebook: None,
        };
        self.k
            .dispatch(
                &Ctx::new(Origin::Capture, new_key()),
                Request::CaptureCommit {
                    matter: self.m.clone(),
                    capture: Box::new(input),
                },
            )
            .unwrap()[0]["evidence_id"]
            .as_str()
            .unwrap()
            .to_string()
    }

    /// OCR a document: one line per pair of readings (Tesseract, PaddleOCR).
    fn ocr(&self, doc: &str, lines: &[(&str, &str)]) {
        let reading = |engine: &str, text: &str, y: f32| Reading {
            engine: engine.into(),
            engine_version: "stub-1.0".into(),
            model_hash: "sha256:model".into(),
            text: text.into(),
            confidence: 0.9,
            words: vec![oa_ocr::Word {
                text: text.into(),
                rect: Rect::new(10.0, y, 300.0, 12.0),
            }],
        };
        let mut readings = Vec::new();
        for (i, (a, b)) in lines.iter().enumerate() {
            let y = 20.0 * i as f32;
            readings.push(OcrReadingInput {
                page: 1,
                line: i as u32,
                reading: reading("tesseract", a, y),
            });
            readings.push(OcrReadingInput {
                page: 1,
                line: i as u32,
                reading: reading("paddle", b, y),
            });
        }
        let health = |engine: &str| OcrEngineHealthInput {
            engine: engine.into(),
            version: "stub-1.0".into(),
            model_hash: "sha256:model".into(),
            state: "healthy".into(),
            detail: None,
        };
        self.act(Request::OcrRun {
            matter: self.m.clone(),
            doc: doc.into(),
            input: OcrRunInput {
                pages: vec![OcrPageInput {
                    page: 1,
                    raster_hash: "sha256:raster".into(),
                    width: 1000.0,
                    height: 1400.0,
                    dpi: 300,
                    text_layer: None,
                }],
                readings,
                engine_health: vec![health("tesseract"), health("paddle")],
            },
        })
        .unwrap();
    }

    fn extract(&self, doc: &str) -> Value {
        self.act(Request::NotebookExtract {
            matter: self.m.clone(),
            doc: doc.into(),
        })
        .unwrap()
    }

    fn facts(&self, status: Option<&str>) -> Vec<Value> {
        self.q(Request::NotebookFacts {
            matter: self.m.clone(),
            status: status.map(str::to_string),
        })
    }

    fn chronology(&self, view: &str, show_excluded: bool, for_prose: bool) -> Vec<Value> {
        self.q(Request::NotebookChronology {
            matter: self.m.clone(),
            view: Some(view.into()),
            show_excluded,
            for_prose,
        })
    }

    fn show(&self) -> Value {
        self.q(Request::NotebookShow {
            matter: self.m.clone(),
            section: None,
        })
        .remove(0)
    }

    fn ready(&self) -> Value {
        self.q(Request::NotebookReady {
            matter: self.m.clone(),
        })
        .remove(0)
    }

    fn line_hash(&self, doc: &str, line: u32) -> String {
        self.q(Request::OcrLines {
            matter: self.m.clone(),
            doc: doc.into(),
            page: Some(1),
        })
        .into_iter()
        .find(|l| l["line"] == line)
        .unwrap()["line_hash"]
            .as_str()
            .unwrap()
            .to_string()
    }

    fn party(&self, doc: &str, role: &str, name: &str) -> Value {
        self.act(Request::NotebookPropose {
            matter: self.m.clone(),
            item: Box::new(ItemInput {
                section: Section::ProceduralHistory,
                kind: "party".into(),
                description: format!("{role}: {name}"),
                anchors: vec![self.anchor(doc, 0)],
                method: "advocate".into(),
                party_role: Some(role.into()),
                party_name: Some(name.into()),
                ..ItemInput::default()
            }),
        })
        .unwrap()
    }

    fn anchor(&self, doc: &str, line: u32) -> NoteAnchor {
        NoteAnchor {
            doc: doc.into(),
            page: 1,
            line: Some(line),
            line_hash: Some(self.line_hash(doc, line)),
            rect: None,
            start: None,
            end: None,
        }
    }

    fn confirm(&self, id: &str) -> Result<Value, OaError> {
        self.act(Request::NotebookConfirm {
            matter: self.m.clone(),
            id: id.into(),
        })
    }
}

fn id(v: &Value) -> String {
    v["id"].as_str().unwrap().to_string()
}

fn ids(values: &[Value]) -> Vec<String> {
    values.iter().map(id).collect()
}

fn fact_with(facts: &[Value], text: &str) -> Value {
    facts
        .iter()
        .find(|f| f["date_text"].as_str() == Some(text))
        .unwrap_or_else(|| panic!("no fact dated {text:?} in {facts:#?}"))
        .clone()
}

/// A fixture matter: a portal order and a client letter, both through OCR
/// and extraction, with a party and a legal issue.
fn fixture_matter(f: &Fx) -> (String, String) {
    let order = f.capture("order.pdf", Some("2019-03-12"));
    let letter = f.import("client-letter.docx");
    f.ocr(
        &order,
        &[
            (
                "Order dated 12.03.2019 in W.P. No. 1234/2018",
                "Order dated 12.03.2019 in W.P. No. 1234/2018",
            ),
            ("Petitioner Ramesh Rao", "Petitioner Ramesh Rao"),
        ],
    );
    f.ocr(
        &letter,
        &[(
            "Paid Rs. 50,000 on 01.02.2019",
            "Paid Rs. 50,000 on 01.02.2019",
        )],
    );
    f.extract(&order);
    f.extract(&letter);
    f.party(&order, "petitioner", "Ramesh Rao");
    f.act(Request::NotebookPropose {
        matter: f.m.clone(),
        item: Box::new(ItemInput {
            section: Section::LegalIssues,
            kind: "legal_issue".into(),
            description: "Whether the writ petition was maintainable".into(),
            anchors: vec![f.anchor(&order, 0)],
            method: "advocate".into(),
            ..ItemInput::default()
        }),
    })
    .unwrap();
    (order, letter)
}

#[test]
fn h_ac_01_every_item_in_the_fixture_matter_has_an_anchor_resolving_to_a_blob_region() {
    let f = fx();
    fixture_matter(&f);
    let items = f.show()["items"].as_array().unwrap().clone();
    assert!(items.len() >= 5, "{items:#?}");
    for item in &items {
        let trace = f
            .q(Request::Trace {
                matter: f.m.clone(),
                id: id(item),
            })
            .remove(0);
        let chain = trace["chain"].as_array().unwrap();
        assert!(!chain.is_empty(), "{item}");
        for step in chain {
            assert_eq!(step["resolved"], true, "{step}");
            assert!(step["source_hash"].as_str().unwrap().starts_with("sha256:"));
            assert!(step["rect"].is_object(), "{step}");
        }
    }
}

#[test]
fn h_ac_01_an_unresolved_anchor_is_refused_and_audited() {
    let f = fx();
    let doc = f.import("letter.docx");
    f.ocr(&doc, &[("Paid on 01.02.2019", "Paid on 01.02.2019")]);
    let err = f
        .act(Request::NotebookPropose {
            matter: f.m.clone(),
            item: Box::new(ItemInput {
                section: Section::LegalIssues,
                kind: "legal_issue".into(),
                description: "issue".into(),
                anchors: vec![NoteAnchor {
                    line_hash: Some("sha256:not-a-line".into()),
                    ..f.anchor(&doc, 0)
                }],
                method: "advocate".into(),
                ..ItemInput::default()
            }),
        })
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::WriteRefused);
    let rejected = f.q(Request::AuditRejected {
        matter: Some(f.m.clone()),
    });
    assert!(rejected
        .iter()
        .any(|r| r["command"] == "notebook.propose" && r["scope"] == "matter"));
    assert!(f.show()["items"]
        .as_array()
        .unwrap()
        .iter()
        .all(|i| i["kind"] != "legal_issue"));
}

#[test]
fn h_ac_02_a_client_item_is_tagged_and_never_in_the_ulos_n_bundle() {
    let f = fx();
    let (order, letter) = fixture_matter(&f);
    let items: Vec<Value> = f.show()["items"].as_array().unwrap().clone();
    for i in &items {
        let doc = i["anchors"][0]["doc"].as_str().unwrap();
        if doc == letter {
            assert_eq!(i["component"], "client_supplied");
            assert_eq!(i["component_label"], "Supplied by client");
        } else {
            assert_eq!(doc, order);
            assert_eq!(i["component"], "court_portal");
        }
    }
    let typed: Vec<Item> = items
        .iter()
        .map(|v| serde_json::from_value(v.clone()).unwrap())
        .collect();
    let bundle = oa_notebook::ulos_n_bundle(&typed);
    for i in bundle["items"].as_array().unwrap() {
        assert_eq!(i["component"], "court_portal");
        assert_ne!(i["anchors"][0]["doc"].as_str(), Some(letter.as_str()));
    }
    assert!(!bundle["items"].as_array().unwrap().is_empty());
}

#[test]
fn h_ac_03_excluding_an_event_leaves_it_in_other_views_and_in_the_facts() {
    let f = fx();
    fixture_matter(&f);
    let facts = f.facts(None);
    let paid = fact_with(&facts, "01.02.2019");
    f.act(Request::NotebookExclude {
        matter: f.m.clone(),
        view: "synopsis".into(),
        event: Some(id(&paid)),
        category: None,
        restore: false,
    })
    .unwrap();
    assert!(!ids(&f.chronology("synopsis", false, false)).contains(&id(&paid)));
    assert!(ids(&f.chronology("list_of_dates", false, false)).contains(&id(&paid)));
    assert!(ids(&f.chronology("default", false, false)).contains(&id(&paid)));
    assert!(ids(&f.facts(None)).contains(&id(&paid)));
    // Restore brings it back to the view.
    f.act(Request::NotebookExclude {
        matter: f.m.clone(),
        view: "synopsis".into(),
        event: Some(id(&paid)),
        category: None,
        restore: true,
    })
    .unwrap();
    assert!(ids(&f.chronology("synopsis", false, false)).contains(&id(&paid)));
}

#[test]
fn h_ac_04_two_documents_with_different_dates_for_one_order_raise_one_conflict() {
    let f = fx();
    let a = f.capture("order.pdf", Some("2019-03-12"));
    let b = f.import("client-copy.pdf");
    let line = "Order dated 12.03.2019 in W.P. No. 1234/2018";
    let other = "order dated 13.03.2019 in W.P. No. 1234/2018";
    f.ocr(&a, &[(line, line)]);
    f.ocr(&b, &[(other, other)]);
    f.extract(&a);
    f.extract(&b);
    // Running the writer again raises nothing new.
    f.extract(&b);
    let conflicts = f.q(Request::NotebookConflicts {
        matter: f.m.clone(),
    });
    assert_eq!(conflicts.len(), 1, "{conflicts:#?}");
    let c = &conflicts[0];
    assert_eq!(c["state"], "open");
    let docs: Vec<&str> = c["anchors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x["doc"].as_str().unwrap())
        .collect();
    assert!(docs.contains(&a.as_str()) && docs.contains(&b.as_str()));
    assert_eq!(c["items"].as_array().unwrap().len(), 2);
    // Both facts show as disputed while the conflict is open.
    assert_eq!(f.facts(Some("disputed")).len(), 2);
}

#[test]
fn h_ac_05_ready_is_false_while_a_job_runs_or_a_review_item_is_open() {
    let f = fx();
    let doc = f.import("letter.docx");
    let r = f.ready();
    assert_eq!(r["ready"], false);
    assert!(r["blockers"]
        .as_array()
        .unwrap()
        .iter()
        .any(|b| b["kind"] == "ingest" && b["id"] == doc.as_str()));
    // Relative date and no anchor: one review item.
    f.ocr(&doc, &[("heard the next day", "heard the next day")]);
    f.extract(&doc);
    let registry = SqliteFactory.registry(&f.app).unwrap();
    registry
        .create_job(&JobRow {
            id: "J1".into(),
            kind: "ocr.batch".into(),
            status: JobStatus::Running,
            done: 1,
            total: 3,
            cancel_requested: false,
            message: None,
            created_at: "2026-11-04T00:00:00.000Z".into(),
            updated_at: "2026-11-04T00:00:00.000Z".into(),
        })
        .unwrap();
    let r = f.ready();
    assert_eq!(r["ready"], false);
    let kinds: Vec<&str> = r["blockers"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["kind"].as_str().unwrap())
        .collect();
    assert_eq!(kinds, ["job", "review_item"], "{r}");
    let review = r["blockers"][1]["id"].as_str().unwrap().to_string();
    f.act(Request::NotebookSkip {
        matter: f.m.clone(),
        review,
        reason: "the date is not material".into(),
    })
    .unwrap();
    assert_eq!(f.ready()["ready"], false);
    registry
        .update_job(
            "J1",
            &JobUpdate {
                status: JobStatus::Done,
                done: 3,
                total: 3,
                message: None,
                at: "2026-11-04T00:01:00.000Z".into(),
            },
        )
        .unwrap();
    let r = f.ready();
    assert_eq!(r["ready"], true, "{r}");
    assert!(r["blockers"].as_array().unwrap().is_empty());
}

#[test]
fn h_ac_06_skip_and_confirm_from_a_harness_connection_are_refused() {
    let f = fx();
    for req in [
        Request::NotebookSkip {
            matter: f.m.clone(),
            review: "R".into(),
            reason: "agent".into(),
        },
        Request::NotebookConfirm {
            matter: f.m.clone(),
            id: "I".into(),
        },
        Request::NotebookDateAnchor {
            matter: f.m.clone(),
            doc: "D".into(),
            date: "2019-03-12".into(),
        },
    ] {
        let err =
            f.k.dispatch(&Ctx::new(Origin::Harness, new_key()), req)
                .unwrap_err();
        assert_eq!(err.code, ErrorCode::HumanCommandRefused);
    }
}

#[test]
fn h_ac_07_the_list_of_dates_leaves_out_disputed_inferred_unconfirmed_and_unresolved_dates() {
    let f = fx();
    let doc = f.import("letter.docx");
    f.ocr(
        &doc,
        &[
            (
                "Order dated 12.03.2019 in W.P. No. 1234/2018",
                "Order dated 12.03.2019 in W.P. No. 1234/2018",
            ),
            ("notice served the next day", "notice served the next day"),
            ("paid on 05.06.2019", "paid on 05.08.2019"),
        ],
    );
    f.extract(&doc);
    let undated = f.import("note.docx");
    f.ocr(
        &undated,
        &[("hearing held the next day", "hearing held the next day")],
    );
    f.extract(&undated);
    let facts = f.facts(None);
    let explicit = fact_with(&facts, "12.03.2019");
    let inferred = facts
        .iter()
        .find(|x| x["date_type"] == "inferred")
        .unwrap()
        .clone();
    assert_eq!(inferred["date"], "2019-03-13");
    assert!(facts.iter().any(|x| x["date_type"] == "unresolved"));
    assert!(facts.iter().any(|x| x["disputed"] == true));
    let prose = ids(&f.chronology("list_of_dates", false, true));
    assert_eq!(prose, [id(&explicit)]);
    // Confirming the inferred date makes it usable.
    f.confirm(&id(&inferred)).unwrap();
    let prose = ids(&f.chronology("list_of_dates", false, true));
    assert_eq!(prose, [id(&explicit), id(&inferred)]);
}

#[test]
fn h_ac_08_a_correction_leaves_the_earlier_version_readable() {
    let f = fx();
    let (order, _) = fixture_matter(&f);
    let party = f.show()["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["kind"] == "party")
        .unwrap()
        .clone();
    let corrected = f
        .act(Request::NotebookCorrect {
            matter: f.m.clone(),
            id: id(&party),
            reason: "the cause title spells it Rau".into(),
            item: Box::new(ItemInput {
                section: Section::ProceduralHistory,
                kind: "party".into(),
                description: "petitioner: Ramesh Rau".into(),
                anchors: vec![f.anchor(&order, 1)],
                method: "advocate".into(),
                party_role: Some("petitioner".into()),
                party_name: Some("Ramesh Rau".into()),
                ..ItemInput::default()
            }),
        })
        .unwrap();
    assert_eq!(corrected["version"], 2);
    let item = |version: Option<u32>| {
        f.q(Request::NotebookItem {
            matter: f.m.clone(),
            id: id(&party),
            version,
        })
        .remove(0)
    };
    let v1 = item(Some(1));
    assert_eq!(v1["party_name"], "Ramesh Rao");
    let now = item(None);
    assert_eq!(now["party_name"], "Ramesh Rau");
    assert_eq!(now["reason"], "the cause title spells it Rau");
    assert_eq!(now["versions"].as_array().unwrap().len(), 2);
}

#[test]
fn h_ac_09_the_impugned_order_round_trips_to_the_lower_court_search() {
    let f = fx();
    assert_eq!(f.show()["missing"][0], "impugned_order");
    let order = ImpugnedOrder {
        court_type: "HC".into(),
        state: "27".into(),
        bench: "1".into(),
        case_type: "WP".into(),
        number: "1234".into(),
        year: "2018".into(),
        order_date: "2019-03-12".into(),
        cnr: None,
    };
    let set = f
        .act(Request::NotebookImpugnedSet {
            matter: f.m.clone(),
            order: order.clone(),
        })
        .unwrap();
    assert_eq!(set["missing"][0], "cnr");
    let stored: ImpugnedOrder = serde_json::from_value(f.show()["impugned"].clone()).unwrap();
    assert_eq!(stored, order);
    let found =
        oa_capture::search_lower_court(oa_capture::SC_LOWER_COURT, &stored.to_query()).unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].title, "Rao v. State of Maharashtra");
    // Filled later with the CNR, it still finds the same case.
    let with_cnr = ImpugnedOrder {
        cnr: found[0].cnr.clone(),
        ..order
    };
    f.act(Request::NotebookImpugnedSet {
        matter: f.m.clone(),
        order: with_cnr.clone(),
    })
    .unwrap();
    let again =
        oa_capture::search_lower_court(oa_capture::SC_LOWER_COURT, &with_cnr.to_query()).unwrap();
    assert_eq!(again, found);
    assert!(f.show()["missing"].as_array().unwrap().is_empty());
}

#[test]
fn h_ac_11_each_readiness_blocker_opens_its_item() {
    let f = fx();
    let doc = f.import("letter.docx");
    f.ocr(
        &doc,
        &[
            ("heard the next day", "heard the next day"),
            ("paid on 05.06.2019", "paid on 05.08.2019"),
        ],
    );
    f.extract(&doc);
    let pending = f.import("unread.pdf");
    let r = f.ready();
    let blockers = r["blockers"].as_array().unwrap();
    let kinds: Vec<&str> = blockers
        .iter()
        .map(|b| b["kind"].as_str().unwrap())
        .collect();
    assert!(
        kinds.contains(&"ingest")
            && kinds.contains(&"review_item")
            && kinds.contains(&"ocr_dispute")
    );
    for b in blockers {
        let bid = b["id"].as_str().unwrap().to_string();
        match b["kind"].as_str().unwrap() {
            "review_item" => {
                let v = f
                    .q(Request::Inspect {
                        matter: f.m.clone(),
                        id: bid,
                    })
                    .remove(0);
                assert_eq!(v["kind"], "notebook_review");
            }
            "ingest" => {
                assert_eq!(bid, pending);
                let v = f
                    .q(Request::Inspect {
                        matter: f.m.clone(),
                        id: bid,
                    })
                    .remove(0);
                assert_eq!(v["kind"], "evidence");
            }
            "ocr_dispute" => {
                let open = f.q(Request::OcrDisputes {
                    matter: Some(f.m.clone()),
                    doc: None,
                });
                assert!(open.iter().any(|d| d["id"] == bid.as_str()));
            }
            other => panic!("unexpected blocker {other}"),
        }
    }
}

#[test]
fn h_ac_12_every_item_opens_its_source_peek_and_its_trace_chain() {
    let f = fx();
    let (order, _) = fixture_matter(&f);
    let fact = fact_with(&f.facts(None), "12.03.2019");
    // Source peek: the Inspector record carries the anchor region.
    let peek = f
        .q(Request::Inspect {
            matter: f.m.clone(),
            id: id(&fact),
        })
        .remove(0);
    assert_eq!(peek["kind"], "notebook_item");
    assert_eq!(peek["record"]["anchors"][0]["doc"], order.as_str());
    assert!(peek["links_out"]
        .as_array()
        .unwrap()
        .iter()
        .any(|l| l["to"] == order.as_str()));
    // Trace: extract, line, page, source hash, original file.
    let trace = f
        .q(Request::Trace {
            matter: f.m.clone(),
            id: id(&fact),
        })
        .remove(0);
    let step = &trace["chain"][0];
    assert_eq!(step["extract"], "12.03.2019");
    assert_eq!(step["line"], 0);
    assert_eq!(step["page"], 1);
    assert!(step["source_hash"].as_str().unwrap().starts_with("sha256:"));
    assert_eq!(step["original_file"], "order.pdf");
}

#[test]
fn h_ac_13_excluded_events_show_under_show_excluded_and_stay_in_the_facts() {
    let f = fx();
    fixture_matter(&f);
    f.act(Request::NotebookExclude {
        matter: f.m.clone(),
        view: "synopsis".into(),
        event: None,
        category: Some("payment".into()),
        restore: false,
    })
    .unwrap();
    let hidden = f.chronology("synopsis", false, false);
    assert!(hidden.iter().all(|e| e["category"] != "payment"));
    let shown = f.chronology("synopsis", true, false);
    let paid = shown.iter().find(|e| e["category"] == "payment").unwrap();
    assert_eq!(paid["excluded"], true);
    assert!(f.facts(None).iter().any(|x| x["category"] == "payment"));
    let counts = f.show()["counts"].clone();
    let fm = counts
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["section"] == "factual_matrix")
        .unwrap()
        .clone();
    assert_eq!(fm["excluded"], 1);
}

#[test]
fn g_ac_07_a_disputed_date_cannot_be_confirmed_until_the_dispute_is_decided() {
    let f = fx();
    let doc = f.import("letter.docx");
    f.ocr(
        &doc,
        &[("Order dated 12.03.2019", "Order dated 12.08.2019")],
    );
    f.extract(&doc);
    let fact = f.facts(Some("disputed")).remove(0);
    assert_eq!(fact["disputed"], true);
    let err = f.confirm(&id(&fact)).unwrap_err();
    assert_eq!(err.code, ErrorCode::Conflict);
    assert!(err.message.contains("oa ocr decide"), "{}", err.message);
    // The refusal is visible, not only in a log.
    assert!(f
        .q(Request::AuditRejected {
            matter: Some(f.m.clone())
        })
        .iter()
        .any(|r| r["command"] == "notebook.confirm"));
    // A correction cannot clear the dispute either.
    let corrected = f
        .act(Request::NotebookCorrect {
            matter: f.m.clone(),
            id: id(&fact),
            reason: "retyped".into(),
            item: Box::new(serde_json::from_value(fact.clone()).unwrap()),
        })
        .unwrap();
    assert_eq!(corrected["disputed"], true);
    assert_eq!(f.confirm(&id(&fact)).unwrap_err().code, ErrorCode::Conflict);
    let dispute = f.q(Request::OcrDisputes {
        matter: Some(f.m.clone()),
        doc: Some(doc.clone()),
    })[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    f.act(Request::OcrDecide {
        matter: f.m.clone(),
        dispute,
        reading: "a".into(),
        text: None,
    })
    .unwrap();
    let confirmed = f.confirm(&id(&fact)).unwrap();
    assert_eq!(confirmed["status"], "confirmed");
    assert_eq!(f.facts(Some("confirmed")).len(), 1);
}

#[test]
fn g_ac_05_a_party_name_one_character_apart_is_a_dispute_end_to_end() {
    let f = fx();
    let cause = f.import("cause-title.pdf");
    f.ocr(
        &cause,
        &[("Petitioner Ramesh Rao", "Petitioner Ramesh Rao")],
    );
    let other = f.import("affidavit.pdf");
    // Before the party is known, the one-letter difference is prose.
    f.ocr(&other, &[("deponent Ramesh Rao", "deponent Ramesh Rso")]);
    let before = f.q(Request::OcrDisputes {
        matter: Some(f.m.clone()),
        doc: Some(other.clone()),
    });
    f.party(&cause, "petitioner", "Ramesh Rao");
    f.ocr(&other, &[("deponent Ramesh Rao", "deponent Ramesh Rso")]);
    let after = f.q(Request::OcrDisputes {
        matter: Some(f.m.clone()),
        doc: Some(other.clone()),
    });
    assert!(
        after.len() > before.len(),
        "before {before:#?} after {after:#?}"
    );
    assert!(after
        .iter()
        .any(|d| d["reading_a"] == "Rao" && d["reading_b"] == "Rso" && d["class"] == "critical"));
}

#[test]
fn g_ac_10_portal_date_anchors_relative_dates_and_no_anchor_asks_once_per_file() {
    let f = fx();
    let captured = f.capture("order.pdf", Some("2024-03-01"));
    f.ocr(
        &captured,
        &[("notice issued the next day", "notice issued the next day")],
    );
    f.extract(&captured);
    let inferred = f
        .facts(None)
        .into_iter()
        .find(|x| x["anchors"][0]["doc"] == captured.as_str())
        .unwrap();
    assert_eq!(inferred["date_type"], "inferred");
    assert_eq!(inferred["date"], "2024-03-02");

    let letter = f.import("letter.docx");
    f.ocr(
        &letter,
        &[
            ("heard the next day", "heard the next day"),
            ("paid the following day", "paid the following day"),
        ],
    );
    f.extract(&letter);
    f.extract(&letter);
    let questions: Vec<Value> = f.show()["review"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["kind"] == "date_anchor")
        .cloned()
        .collect();
    assert_eq!(questions.len(), 1, "{questions:#?}");
    f.act(Request::NotebookDateAnchor {
        matter: f.m.clone(),
        doc: letter.clone(),
        date: "2019-06-01".into(),
    })
    .unwrap();
    let out = f.extract(&letter);
    assert_eq!(out["revised"], 2, "{out}");
    let dates: Vec<String> = f
        .facts(None)
        .into_iter()
        .filter(|x| x["anchors"][0]["doc"] == letter.as_str())
        .map(|x| x["date"].as_str().unwrap_or_default().to_string())
        .collect();
    assert_eq!(dates, ["2019-06-02", "2019-06-02"]);
    let review = f.show()["review"].clone();
    assert!(review
        .as_array()
        .unwrap()
        .iter()
        .all(|r| r["kind"] != "date_anchor" || r["state"] == "resolved"));
}

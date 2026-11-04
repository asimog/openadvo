//! Spec G kernel acceptance: the agreement engine's disputes, the human
//! decision, typed copies, entities and engine health.

use std::sync::Arc;

use oa_kernel::{
    Attachment, ClientSpec, Ctx, Hooks, Kernel, OcrEngineHealthInput, OcrPageInput,
    OcrReadingInput, OcrRunInput, Request,
};
use oa_ocr::{Reading, Rect};
use oa_store::sqlite::SqliteFactory;
use oa_types::{new_key, ErrorCode, Origin};
use serde_json::Value;
use tempfile::TempDir;

struct Fixture {
    _tmp: TempDir,
    root: std::path::PathBuf,
    app: std::path::PathBuf,
}

fn fixture() -> Fixture {
    let tmp = tempfile::tempdir().unwrap();
    Fixture {
        root: tmp.path().join("Matter Files").join("root"),
        app: tmp.path().join("app data"),
        _tmp: tmp,
    }
}

fn kernel(f: &Fixture) -> Kernel {
    Kernel::new(&f.app, Arc::new(SqliteFactory), Hooks::default())
}

fn init(k: &Kernel, f: &Fixture) {
    k.dispatch(
        &Ctx::new(Origin::Cli, new_key()),
        Request::WorkspaceInit {
            root: f.root.clone(),
        },
    )
    .unwrap();
}

fn matter(k: &Kernel) -> String {
    let mut v = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::MatterCreate {
                title: "State v. Rao".into(),
                client: ClientSpec::None,
                from: None,
            },
        )
        .unwrap();
    v.remove(0)["id"].as_str().unwrap().to_string()
}

fn evidence(k: &Kernel, matter: &str) -> String {
    let mut v = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::EvidenceImport {
                matter: Some(matter.to_string()),
                files: vec![Attachment {
                    file_name: "order.txt".into(),
                    bytes: b"paid on 12.03.2019".to_vec(),
                }],
            },
        )
        .unwrap();
    v.remove(0)["id"].as_str().unwrap().to_string()
}

fn reading(engine: &str, text: &str) -> Reading {
    Reading {
        engine: engine.into(),
        engine_version: "stub-1.0".into(),
        model_hash: "sha256:model".into(),
        text: text.into(),
        confidence: 0.9,
        words: vec![oa_ocr::Word {
            text: text.into(),
            rect: Rect::new(0.0, 0.0, 100.0, 12.0),
        }],
    }
}

fn run_input(a: &str, b: &str) -> OcrRunInput {
    OcrRunInput {
        pages: vec![OcrPageInput {
            page: 1,
            raster_hash: "sha256:raster".into(),
            width: 100.0,
            height: 200.0,
            dpi: 300,
            text_layer: None,
        }],
        readings: vec![
            OcrReadingInput {
                page: 1,
                line: 0,
                reading: reading("tesseract", a),
            },
            OcrReadingInput {
                page: 1,
                line: 0,
                reading: reading("paddle", b),
            },
        ],
        engine_health: vec![
            OcrEngineHealthInput {
                engine: "tesseract".into(),
                version: "stub-1.0".into(),
                model_hash: "sha256:model".into(),
                state: "healthy".into(),
                detail: None,
            },
            OcrEngineHealthInput {
                engine: "paddle".into(),
                version: "stub-1.0".into(),
                model_hash: "sha256:model".into(),
                state: "healthy".into(),
                detail: None,
            },
        ],
    }
}

fn run(k: &Kernel, matter: &str, doc: &str, input: OcrRunInput) -> Value {
    let mut v = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::OcrRun {
                matter: matter.to_string(),
                doc: doc.to_string(),
                input,
            },
        )
        .unwrap();
    v.remove(0)
}

fn query(k: &Kernel, req: Request) -> Vec<Value> {
    k.dispatch(&Ctx::query(Origin::Cli), req).unwrap()
}

#[test]
fn g_ac_07_a_disputed_date_stays_open_until_the_advocate_decides() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    let result = run(
        &k,
        &m,
        &doc,
        run_input("paid on 12.03.2019", "paid on 12.08.2019"),
    );
    assert_eq!(result["state"], "needs_review");
    let disputes = query(
        &k,
        Request::OcrDisputes {
            matter: Some(m.clone()),
            doc: Some(doc.clone()),
        },
    );
    assert_eq!(disputes.len(), 1);
    assert_eq!(disputes[0]["state"], "open");
    let dispute = disputes[0]["id"].as_str().unwrap().to_string();
    let decided = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::OcrDecide {
                matter: m.clone(),
                dispute: dispute.clone(),
                reading: "a".into(),
                text: None,
            },
        )
        .unwrap();
    assert_eq!(decided[0]["state"], "decided");
    let open = query(
        &k,
        Request::OcrDisputes {
            matter: Some(m),
            doc: Some(doc),
        },
    );
    assert!(open.is_empty(), "the decided dispute is no longer open");
}

#[test]
fn g_ac_08_ocr_decide_from_a_harness_connection_is_refused() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    run(
        &k,
        &m,
        &doc,
        run_input("paid on 12.03.2019", "paid on 12.08.2019"),
    );
    let disputes = query(
        &k,
        Request::OcrDisputes {
            matter: Some(m.clone()),
            doc: Some(doc),
        },
    );
    let dispute = disputes[0]["id"].as_str().unwrap().to_string();
    let err = k
        .dispatch(
            &Ctx::new(Origin::Harness, new_key()),
            Request::OcrDecide {
                matter: m,
                dispute,
                reading: "a".into(),
                text: None,
            },
        )
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::HumanCommandRefused);
    let rejected = query(&k, Request::AuditRejected { matter: None });
    assert!(rejected
        .iter()
        .any(|r| r["command"] == "ocr.decide" && r["origin"] == "harness"));
}

#[test]
fn g_ac_16_the_line_query_carries_both_readings_confidences_versions_and_normalisation() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    run(
        &k,
        &m,
        &doc,
        run_input("the respondent filed", "the respondcnt filed"),
    );
    let lines = query(
        &k,
        Request::OcrLines {
            matter: m,
            doc,
            page: Some(1),
        },
    );
    assert_eq!(lines.len(), 1);
    assert!((lines[0]["reading_a"]["confidence"].as_f64().unwrap() - 0.9).abs() < 0.001);
    assert_eq!(lines[0]["reading_b"]["engine_version"], "stub-1.0");
    assert_eq!(
        lines[0]["normalisation_version"],
        oa_ocr::NORMALISATION_VERSION
    );
}

#[test]
fn g_ac_17_a_disputed_token_is_an_open_review_item() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    run(
        &k,
        &m,
        &doc,
        run_input("paid on 12.03.2019", "paid on 12.08.2019"),
    );
    let disputes = query(
        &k,
        Request::OcrDisputes {
            matter: Some(m),
            doc: Some(doc),
        },
    );
    assert_eq!(disputes.len(), 1);
    assert_eq!(disputes[0]["reading_a"], "12.03.2019");
    assert_eq!(disputes[0]["reading_b"], "12.08.2019");
    assert_eq!(disputes[0]["state"], "open");
}

#[test]
fn a_typed_copy_is_recorded_as_a_human_command() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    run(&k, &m, &doc, run_input("page one", "page one"));
    let copy = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::OcrTypedCopy {
                matter: m,
                doc,
                page: 1,
                text: "typed page".into(),
                typist: "advocate".into(),
            },
        )
        .unwrap();
    assert_eq!(copy[0]["text"], "typed page");
    assert_eq!(copy[0]["typist"], "advocate");
}

#[test]
fn entities_and_engine_health_are_queryable() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    run(
        &k,
        &m,
        &doc,
        run_input(
            "paid Rs. 1,50,000 on 12.03.2019",
            "paid Rs. 1,50,000 on 12.03.2019",
        ),
    );
    let entities = query(&k, Request::ExtractEntities { matter: m, doc });
    assert!(entities.iter().any(|e| e["kind"] == "date"));
    assert!(entities.iter().any(|e| e["kind"] == "amount"));
    let engines = query(&k, Request::OcrEngines);
    assert_eq!(engines.len(), 2);
    assert!(engines.iter().all(|e| e["runtime_state"] == "healthy"));
}

// Review fixes for the kernel OCR path.

fn one_engine_input(text: &str) -> OcrRunInput {
    let mut input = run_input(text, text);
    input.readings.truncate(1);
    input.engine_health[1].state = "raised".into();
    input
}

fn lines(k: &Kernel, m: &str, doc: &str) -> Vec<Value> {
    query(
        k,
        Request::OcrLines {
            matter: m.to_string(),
            doc: doc.to_string(),
            page: None,
        },
    )
}

fn open_disputes(k: &Kernel, m: &str, doc: &str) -> Vec<Value> {
    query(
        k,
        Request::OcrDisputes {
            matter: Some(m.to_string()),
            doc: Some(doc.to_string()),
        },
    )
}

fn decide(
    k: &Kernel,
    m: &str,
    dispute: &str,
    reading: &str,
    text: Option<&str>,
) -> Result<Vec<Value>, oa_types::OaError> {
    k.dispatch(
        &Ctx::new(Origin::Cli, new_key()),
        Request::OcrDecide {
            matter: m.to_string(),
            dispute: dispute.to_string(),
            reading: reading.into(),
            text: text.map(str::to_string),
        },
    )
}

#[test]
fn a_line_read_by_only_one_engine_is_disputed_not_agreed_with_itself() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    let result = run(&k, &m, &doc, one_engine_input("paid on 12.03.2019"));
    assert_eq!(result["state"], "needs_review");
    let l = lines(&k, &m, &doc);
    assert_eq!(l[0]["agreement"], "one_engine_empty");
    assert_eq!(open_disputes(&k, &m, &doc).len(), 3);
}

#[test]
fn a_born_digital_text_layer_line_is_not_disputed() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    let mut input = run_input("paid on 12.03.2019", "unused");
    input.readings.truncate(1);
    input.readings[0].reading.engine = "pdfium".into();
    input.engine_health.clear();
    let result = run(&k, &m, &doc, input);
    assert_eq!(result["state"], "done");
}

#[test]
fn readings_are_assigned_by_engine_not_by_arrival_order() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    let mut input = run_input("paid on 12.03.2019", "paid on 12.08.2019");
    input.readings.reverse();
    run(&k, &m, &doc, input);
    let d = open_disputes(&k, &m, &doc);
    assert_eq!(d[0]["reading_a"], "12.03.2019", "reading a is tesseract's");
}

#[test]
fn deciding_updates_the_document_state_and_dispute_count() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    run(
        &k,
        &m,
        &doc,
        run_input("paid on 12.03.2019", "paid on 12.08.2019"),
    );
    let id = open_disputes(&k, &m, &doc)[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    decide(&k, &m, &id, "a", None).unwrap();
    let docs = query(
        &k,
        Request::OcrPipeline {
            matter: Some(m.clone()),
        },
    );
    let row = docs.iter().find(|r| r["doc"] == doc.as_str()).unwrap();
    assert_eq!(row["disputes"], 0);
    assert_eq!(row["state"], "done");
}

#[test]
fn a_decided_dispute_cannot_be_decided_again() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    run(
        &k,
        &m,
        &doc,
        run_input("paid on 12.03.2019", "paid on 12.08.2019"),
    );
    let id = open_disputes(&k, &m, &doc)[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    decide(&k, &m, &id, "a", None).unwrap();
    let err = decide(&k, &m, &id, "b", None).unwrap_err();
    assert_eq!(err.code, ErrorCode::Conflict);
}

#[test]
fn a_typed_decision_needs_text_and_the_reading_must_be_known() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    run(
        &k,
        &m,
        &doc,
        run_input("paid on 12.03.2019", "paid on 12.08.2019"),
    );
    let id = open_disputes(&k, &m, &doc)[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(
        decide(&k, &m, &id, "typed", None).unwrap_err().code,
        ErrorCode::Usage
    );
    assert_eq!(
        decide(&k, &m, &id, "c", None).unwrap_err().code,
        ErrorCode::Usage
    );
    decide(&k, &m, &id, "typed", Some("12.03.2019")).unwrap();
}

#[test]
fn a_rerun_keeps_decisions_and_maps_old_line_hashes() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    run(
        &k,
        &m,
        &doc,
        run_input("paid on 12.03.2019", "paid on 12.08.2019"),
    );
    let old_hash = lines(&k, &m, &doc)[0]["line_hash"]
        .as_str()
        .unwrap()
        .to_string();
    let id = open_disputes(&k, &m, &doc)[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    decide(&k, &m, &id, "a", None).unwrap();
    k.dispatch(
        &Ctx::new(Origin::Cli, new_key()),
        Request::OcrTypedCopy {
            matter: m.clone(),
            doc: doc.clone(),
            page: 1,
            text: "paid on 12.03.2019".into(),
            typist: "clerk".into(),
        },
    )
    .unwrap();
    // Same readings again: the decided dispute stays decided.
    run(
        &k,
        &m,
        &doc,
        run_input("paid on 12.03.2019", "paid on 12.08.2019"),
    );
    assert!(open_disputes(&k, &m, &doc).is_empty());
    // A new engine version: new line hash, old hash still resolves.
    let mut input = run_input("paid on 12.03.2019", "paid on 12.03.2019");
    for r in &mut input.readings {
        r.reading.engine_version = "stub-2.0".into();
    }
    run(&k, &m, &doc, input);
    let new_hash = lines(&k, &m, &doc)[0]["line_hash"]
        .as_str()
        .unwrap()
        .to_string();
    assert_ne!(old_hash, new_hash);
    let current = &lines(&k, &m, &doc)[0];
    let supersedes: Vec<&str> = current["supersedes"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(Value::as_str)
        .collect();
    assert!(supersedes.contains(&old_hash.as_str()));
    let docs = query(&k, Request::OcrPipeline { matter: Some(m) });
    assert_eq!(docs[0]["state"], "done");
}

#[test]
fn an_entity_on_a_disputed_token_is_marked_disputed() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let doc = evidence(&k, &m);
    run(
        &k,
        &m,
        &doc,
        run_input("paid on 12.03.2019", "paid on 12.08.2019"),
    );
    let entities = query(
        &k,
        Request::ExtractEntities {
            matter: m.clone(),
            doc: doc.clone(),
        },
    );
    let date = entities.iter().find(|e| e["kind"] == "date").unwrap();
    assert_eq!(date["disputed"], true);
}

//! Spec F acceptance criteria against the real SQLite stores (capture queue,
//! ingest, duplicates, court codes and adapter health).

use std::sync::Arc;
use std::time::Instant;

use oa_capture::sha256_hex;
use oa_kernel::{
    AdapterHealthInput, Attachment, CaptureInput, ClientSpec, CodebookInput, CourtCodeInput, Ctx,
    Hooks, Kernel, Request,
};
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

fn import(k: &Kernel, matter: &str, name: &str, bytes: &[u8]) -> Value {
    let mut out = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::EvidenceImport {
                matter: Some(matter.to_string()),
                files: vec![Attachment {
                    file_name: name.into(),
                    bytes: bytes.to_vec(),
                }],
            },
        )
        .unwrap();
    out.remove(0)
}

fn completed_capture(bytes: &[u8], origin: &str) -> CaptureInput {
    CaptureInput {
        file: Some(Attachment {
            file_name: "order.pdf".into(),
            bytes: bytes.to_vec(),
        }),
        origin: origin.into(),
        url: "https://sc.example/case/1".into(),
        final_url: "https://sc.example/case/1?ok=1".into(),
        captured_at: "2026-11-04T00:00:00.000Z".into(),
        profile: "portal-profile".into(),
        gesture: "click:order-download".into(),
        portal_date: Some("2024-03-01".into()),
        adapter: "supreme_court_case_status".into(),
        status: "completed".into(),
        reason: None,
        health: Some(AdapterHealthInput {
            contract_state: "healthy".into(),
            runtime_state: "healthy".into(),
            detail: None,
        }),
        codebook: None,
    }
}

fn capture(k: &Kernel, matter: &str, input: CaptureInput) -> Value {
    let mut out = k
        .dispatch(
            &Ctx::new(Origin::Capture, new_key()),
            Request::CaptureCommit {
                matter: matter.to_string(),
                capture: Box::new(input),
            },
        )
        .unwrap();
    out.remove(0)
}

fn query(k: &Kernel, req: Request) -> Vec<Value> {
    k.dispatch(&Ctx::query(Origin::Cli), req).unwrap()
}

fn evidence_of(v: &Value) -> String {
    v["id"].as_str().unwrap().to_string()
}

#[test]
fn f_ac_01_import_and_capture_of_the_same_bytes_is_one_blob_with_two_origins() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let bytes = b"%PDF-1.7\n%%EOF\n".to_vec();
    let imported = import(&k, &m, "same.pdf", &bytes);
    let evidence_id = evidence_of(&imported);
    let captured = capture(&k, &m, completed_capture(&bytes, "court_portal"));

    let list = query(&k, Request::EvidenceList { matter: m.clone() });
    assert_eq!(list.len(), 1, "identical bytes share one blob");
    assert_eq!(list[0]["id"], evidence_id);
    let origins = list[0]["origins"].as_array().unwrap();
    let names: Vec<&str> = origins
        .iter()
        .map(|o| o["origin"].as_str().unwrap())
        .collect();
    assert!(names.contains(&"advocate_import"));
    assert!(names.contains(&"court_portal"));
    assert_eq!(captured["blob"], list[0]["blob"]);
}

#[test]
fn f_ac_02_a_capture_record_holds_the_urls_time_hash_profile_and_gesture() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let bytes = b"%PDF-1.7\n%%EOF\n".to_vec();
    let input = completed_capture(&bytes, "court_portal");
    let record = capture(&k, &m, input);
    assert_eq!(record["url"], "https://sc.example/case/1");
    assert_eq!(record["final_url"], "https://sc.example/case/1?ok=1");
    assert_eq!(record["captured_at"], "2026-11-04T00:00:00.000Z");
    assert_eq!(record["profile"], "portal-profile");
    assert_eq!(record["gesture"], "click:order-download");
    assert_eq!(record["portal_date"], "2024-03-01");
    assert_eq!(record["blob"], sha256_hex(&bytes));
    let shown = query(
        &k,
        Request::EvidenceShow {
            matter: m.clone(),
            id: record["evidence_id"].as_str().unwrap().to_string(),
        },
    );
    assert_eq!(
        shown[0]["capture"]["blob"], record["blob"],
        "the capture hash equals the blob hash"
    );
}

#[test]
fn f_ac_03_a_capture_record_from_a_harness_connection_is_refused_and_audited() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let err = k
        .dispatch(
            &Ctx::new(Origin::Harness, new_key()),
            Request::CaptureCommit {
                matter: m.clone(),
                capture: Box::new(completed_capture(b"%PDF-1.7\n%%EOF\n", "court_portal")),
            },
        )
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::WriteRefused);
    let rejected = query(&k, Request::AuditRejected { matter: None });
    assert!(
        rejected.iter().any(|r| {
            r["command"] == "capture.commit"
                && r["origin"] == "harness"
                && r["reason"].as_str().unwrap().contains("browser supervisor")
        }),
        "{rejected:?}"
    );
}

#[test]
fn f_ac_06_a_renamed_pdf_that_is_really_a_docx_is_ingested_as_docx() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let mut bytes = b"PK\x03\x04".to_vec();
    bytes.extend_from_slice(b"[Content_Types].xmlword/document.xml");
    let ev = import(&k, &m, "renamed.pdf", &bytes);
    assert_eq!(ev["ingest"]["format"], "docx");
    assert_eq!(ev["ingest"]["status"], "pending");
    assert!(ev["ingest"]["message"]
        .as_str()
        .unwrap()
        .contains("name says"));
}

#[test]
fn f_ac_07_an_encrypted_pdf_is_blocked_after_hashing_and_gets_a_review_item() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let mut bytes = b"%PDF-1.7\n".to_vec();
    bytes.extend_from_slice(b"trailer\n<< /Encrypt 5 0 R >>\n%%EOF\n");
    let ev = import(&k, &m, "encrypted.pdf", &bytes);
    assert_eq!(ev["ingest"]["readability"], "encrypted");
    assert_eq!(ev["ingest"]["status"], "blocked");
    let status = query(
        &k,
        Request::IngestStatus {
            doc: Some(evidence_of(&ev)),
        },
    );
    assert_eq!(status.len(), 1);
    assert_eq!(status[0]["status"], "blocked");
    assert_eq!(status[0]["readability"], "encrypted");
}

#[test]
fn f_ac_10_two_scans_with_the_same_ocr_text_are_a_duplicate_review_and_both_kept() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let a = import(&k, &m, "scan-a.pdf", b"%PDF-1.7\na\n%%EOF\n");
    let b = import(&k, &m, "scan-b.pdf", b"%PDF-1.7\nb\n%%EOF\n");
    for ev in [&a, &b] {
        k.dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::IngestSetText {
                matter: m.clone(),
                evidence: evidence_of(ev),
                text: "IN THE SUPREME COURT Order dated 1 March 2024".into(),
            },
        )
        .unwrap();
    }
    let dupes = query(&k, Request::EvidenceDuplicates { matter: m.clone() });
    assert_eq!(dupes.len(), 1);
    assert_eq!(dupes[0]["kind"], "same_text");
    assert_eq!(dupes[0]["items"].as_array().unwrap().len(), 2);
    assert_eq!(
        query(&k, Request::EvidenceList { matter: m }).len(),
        2,
        "both scans are kept"
    );
}

#[test]
fn f_ac_11_a_case_type_code_round_trips_with_its_verbatim_label() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let mut input = completed_capture(b"%PDF-1.7\n%%EOF\n", "court_portal");
    input.codebook = Some(CodebookInput {
        scheme: "supreme_court:list-2024-03".into(),
        version: "2024-03".into(),
        codes: vec![CourtCodeInput {
            scheme: "supreme_court:list-2024-03".into(),
            code: "WP".into(),
            label: "Writ Petition (Civil)".into(),
        }],
    });
    capture(&k, &m, input);
    let book = query(
        &k,
        Request::CodebookShow {
            scheme: "supreme_court:list-2024-03".into(),
        },
    );
    assert_eq!(book[0]["version"], "2024-03");
    assert_eq!(book[0]["codes"][0]["code"], "WP");
    assert_eq!(book[0]["codes"][0]["label"], "Writ Petition (Civil)");
}

#[test]
fn f_ac_13_every_evidence_entrys_inspector_shows_its_capture_record_and_hash() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let record = capture(
        &k,
        &m,
        completed_capture(b"%PDF-1.7\n%%EOF\n", "court_portal"),
    );
    let evidence = record["evidence_id"].as_str().unwrap().to_string();
    let inspected = query(
        &k,
        Request::Inspect {
            matter: m,
            id: evidence,
        },
    );
    assert_eq!(inspected[0]["kind"], "evidence");
    assert_eq!(
        inspected[0]["record"]["capture"]["blob"],
        inspected[0]["record"]["blob"]
    );
    assert!(inspected[0]["record"]["capture"]["url"].is_string());
    assert!(inspected[0]["record"]["capture_blob_path"].is_string());
}

#[test]
fn f_ac_14_a_captcha_wait_appears_in_the_capture_queue_immediately() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let mut input = completed_capture(b"", "court_portal");
    input.file = None;
    input.status = "captcha_pending".into();
    input.gesture = "advocate:solve".into();
    let started = Instant::now();
    let record = capture(&k, &m, input);
    assert_eq!(record["status"], "captcha_pending");
    let queue = query(&k, Request::CaptureStatus);
    assert_eq!(queue.len(), 1);
    assert_eq!(queue[0]["id"], record["id"]);
    assert_eq!(queue[0]["status"], "captcha_pending");
    assert!(started.elapsed().as_secs() < 1);
}

#[test]
fn f_ac_15_a_degraded_adapter_shows_in_health_and_the_capture_queue() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);
    let mut input = completed_capture(b"", "court_portal");
    input.file = None;
    input.status = "failed".into();
    input.reason = Some("adapter_degraded".into());
    input.health = None;
    capture(&k, &m, input);
    let health = query(&k, Request::AdapterHealth);
    assert_eq!(health.len(), 1);
    assert_eq!(health[0]["runtime_state"], "degraded");
    let queue = query(&k, Request::CaptureStatus);
    assert!(queue
        .iter()
        .any(|c| c["reason"] == "adapter_degraded" && c["status"] == "failed"));
}

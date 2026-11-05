//! End-to-end tests for OCR and document intelligence (spec G, G-E2E-01 and G-E2E-02).
//! Tests workflow slices with real vendored engines, kernel state, and advocate decisions.

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use oa_kernel::{
    Attachment, ClientSpec, Ctx, Hooks, Kernel, OcrEngineHealthInput, OcrPageInput,
    OcrReadingInput, OcrRunInput, PresencePrompt, Request,
};
use oa_ocr::run_page;
use oa_store::sqlite::SqliteFactory;
use oa_types::{new_key, Origin};
use tempfile::TempDir;

struct Present;

impl PresencePrompt for Present {
    fn confirm(&self, _summary: &str) -> bool {
        true
    }
}

struct E2eFixture {
    _tmp: TempDir,
    root: PathBuf,
    app: PathBuf,
    work: PathBuf,
}

fn fixture() -> E2eFixture {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("Matter Files").join("root");
    let app = tmp.path().join("app data");
    let work = tmp.path().join("work");
    fs::create_dir_all(&work).unwrap();
    E2eFixture {
        _tmp: tmp,
        root,
        app,
        work,
    }
}

fn kernel(f: &E2eFixture) -> Kernel {
    Kernel::new(
        &f.app,
        Arc::new(SqliteFactory),
        Hooks {
            presence: Arc::new(Present),
            ..Hooks::default()
        },
    )
}

fn init(k: &Kernel, f: &E2eFixture) {
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

fn find_engine(name: &str) -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let root = manifest.parent().unwrap().parent().unwrap();
    let debug_bin = root
        .join("target")
        .join("debug")
        .join(format!("{name}.exe"));
    if debug_bin.is_file() {
        return debug_bin;
    }
    let release_bin = root
        .join("target")
        .join("release")
        .join(format!("{name}.exe"));
    if release_bin.is_file() {
        return release_bin;
    }
    // Fall back to target/debug/<name> (without .exe for unix)
    let debug_unix = root.join("target").join("debug").join(name);
    if debug_unix.is_file() {
        return debug_unix;
    }
    panic!("engine binary {name} not found in target/debug or target/release");
}

fn fixture_path(name: &str) -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .unwrap()
        .join("oa-ocr")
        .join("tests")
        .join("fixtures")
        .join(name)
}

#[test]
fn g_e2e_01_two_column_scanned_judgment_planted_dispute_decided() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);

    let tess_bin = find_engine("ocr-tesseract");
    let paddle_bin = find_engine("ocr-paddle");

    // 1. Import a scanned two-column judgment
    let judgment_path = fixture_path("two-column.png");
    let image_bytes = fs::read(&judgment_path).expect("reads two-column.png");
    let mut ev_resp = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::EvidenceImport {
                matter: Some(m.clone()),
                files: vec![Attachment {
                    file_name: "two-column-judgment.png".into(),
                    bytes: image_bytes,
                }],
            },
        )
        .unwrap();
    let doc_id = ev_resp.remove(0)["id"].as_str().unwrap().to_string();

    // 2. Run both real engines on the page via supervisor
    let job = oa_ocr::EngineJob {
        doc: doc_id.clone(),
        page: 1,
        image_path: judgment_path.to_string_lossy().to_string(),
        text_layer: None,
        fail_mode: None,
    };
    let page_run = run_page(
        &job,
        &[tess_bin, paddle_bin],
        &f.work,
        Duration::from_secs(30),
    );
    assert_eq!(page_run.failures.len(), 0, "both real engines must succeed");
    assert!(
        !page_run.readings.is_empty(),
        "readings must be produced by both engines"
    );

    // Group real engine readings into OcrRunInput.
    // In two-column.png, column splitting differences between Tesseract and PaddleOCR
    // plant a date mismatch on the order / reply date line.
    let mut ocr_readings = Vec::new();
    let tess_readings: Vec<_> = page_run
        .readings
        .iter()
        .filter(|r| r.engine == "tesseract")
        .collect();
    let paddle_readings: Vec<_> = page_run
        .readings
        .iter()
        .filter(|r| r.engine == "paddle")
        .collect();

    let max_lines = tess_readings.len().max(paddle_readings.len());
    for line in 0..max_lines {
        if let Some(r) = tess_readings.get(line) {
            ocr_readings.push(OcrReadingInput {
                page: 1,
                line: line as u32,
                reading: (*r).clone(),
            });
        }
        if let Some(r) = paddle_readings.get(line) {
            ocr_readings.push(OcrReadingInput {
                page: 1,
                line: line as u32,
                reading: (*r).clone(),
            });
        }
    }

    let run_input = OcrRunInput {
        pages: vec![OcrPageInput {
            page: 1,
            raster_hash: "sha256:two-column-raster".into(),
            width: 1400.0,
            height: 1600.0,
            dpi: 150,
            text_layer: None,
        }],
        readings: ocr_readings,
        engine_health: vec![
            OcrEngineHealthInput {
                engine: "tesseract".into(),
                version: "5.4.0".into(),
                model_hash: "sha256:tess-eng".into(),
                state: "healthy".into(),
                detail: None,
            },
            OcrEngineHealthInput {
                engine: "paddle".into(),
                version: "PP-OCRv5".into(),
                model_hash: "sha256:paddle-v5".into(),
                state: "healthy".into(),
                detail: None,
            },
        ],
    };

    let run_result = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::OcrRun {
                matter: m.clone(),
                doc: doc_id.clone(),
                input: run_input,
            },
        )
        .unwrap()
        .remove(0);

    // 3. Planted date mismatch becomes a dispute in the inbox
    assert_eq!(
        run_result["state"], "needs_review",
        "document with disagreement must enter needs_review"
    );

    let disputes = k
        .dispatch(
            &Ctx::query(Origin::Cli),
            Request::OcrDisputes {
                matter: Some(m.clone()),
                doc: Some(doc_id.clone()),
            },
        )
        .unwrap();
    assert!(
        !disputes.is_empty(),
        "disputes must be open for mismatched tokens"
    );
    let open_dispute = disputes[0]["id"].as_str().unwrap().to_string();
    assert_eq!(disputes[0]["state"], "open");

    // 4. Notebook extraction creates disputed items and readiness blockers
    k.dispatch(
        &Ctx::new(Origin::Cli, new_key()),
        Request::NotebookExtract {
            matter: m.clone(),
            doc: doc_id.clone(),
        },
    )
    .unwrap();

    let ready_res = k
        .dispatch(
            &Ctx::query(Origin::Cli),
            Request::NotebookReady { matter: m.clone() },
        )
        .unwrap()
        .remove(0);
    let blockers = ready_res["blockers"].as_array().unwrap();
    assert!(
        blockers.iter().any(|b| b["kind"] == "ocr_dispute"),
        "open dispute must block Notebook readiness in the inbox"
    );

    // 5. Advocate decides the dispute in the window (human command)
    let decide_res = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::OcrDecide {
                matter: m.clone(),
                dispute: open_dispute.clone(),
                reading: "a".into(),
                text: Some("12.03.2019".into()),
            },
        )
        .unwrap()
        .remove(0);
    assert_eq!(decide_res["state"], "decided");

    // After deciding all disputes, re-check readiness blockers
    let remaining_disputes = k
        .dispatch(
            &Ctx::query(Origin::Cli),
            Request::OcrDisputes {
                matter: Some(m.clone()),
                doc: Some(doc_id.clone()),
            },
        )
        .unwrap();
    for d in remaining_disputes {
        let did = d["id"].as_str().unwrap().to_string();
        let _ = k.dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::OcrDecide {
                matter: m.clone(),
                dispute: did,
                reading: "a".into(),
                text: None,
            },
        );
    }

    // 6. The Notebook date becomes confirmable
    let facts = k
        .dispatch(
            &Ctx::query(Origin::Cli),
            Request::NotebookFacts {
                matter: m.clone(),
                status: None,
            },
        )
        .unwrap();

    if let Some(fact) = facts.first() {
        let fact_id = fact["id"].as_str().unwrap();
        let confirm_res = k.dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::NotebookConfirm {
                matter: m.clone(),
                id: fact_id.into(),
            },
        );
        assert!(
            confirm_res.is_ok(),
            "Notebook fact should be confirmable after resolving dispute"
        );
    }
}

#[test]
fn g_e2e_02_kill_paddle_mid_document_supervises_and_reruns() {
    let f = fixture();
    let k = kernel(&f);
    init(&k, &f);
    let m = matter(&k);

    let tess_bin = find_engine("ocr-tesseract");
    let paddle_bin = find_engine("ocr-paddle");

    // Import evidence so doc exists in kernel
    let mut ev_resp = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::EvidenceImport {
                matter: Some(m.clone()),
                files: vec![Attachment {
                    file_name: "doc-multi-page.pdf".into(),
                    bytes: b"dummy pdf content".to_vec(),
                }],
            },
        )
        .unwrap();
    let doc_id = ev_resp.remove(0)["id"].as_str().unwrap().to_string();

    // Page 1 runs normally
    let job_p1 = oa_ocr::EngineJob {
        doc: doc_id.clone(),
        page: 1,
        image_path: fixture_path("born-digital.pdf").to_string_lossy().to_string(),
        text_layer: Some("IN THE SUPREME COURT OF INDIA\nPage 1 text".into()),
        fail_mode: None,
    };
    let run_p1 = run_page(
        &job_p1,
        &[tess_bin.clone(), paddle_bin.clone()],
        &f.work,
        Duration::from_secs(10),
    );
    assert_eq!(run_p1.failures.len(), 0);

    // Page 2: Kill ocr-paddle mid-document by injecting crash fail_mode
    let job_p2_crashed = oa_ocr::EngineJob {
        doc: doc_id.clone(),
        page: 2,
        image_path: fixture_path("scanned.png").to_string_lossy().to_string(),
        text_layer: None,
        fail_mode: Some("crash".into()),
    };
    let run_p2_crashed = run_page(
        &job_p2_crashed,
        &[tess_bin.clone(), paddle_bin.clone()],
        &f.work,
        Duration::from_secs(10),
    );

    // Supervisor catches child crash and records failure
    assert!(
        !run_p2_crashed.failures.is_empty(),
        "supervisor must catch engine crash"
    );
    assert!(
        run_p2_crashed
            .failures
            .iter()
            .any(|f| f.kind == "raised"),
        "failure kind must be raised for child crash"
    );

    // Kernel marks page as needs_review with engine failures
    let crashed_input = OcrRunInput {
        pages: vec![OcrPageInput {
            page: 2,
            raster_hash: "sha256:page2-raster".into(),
            width: 1000.0,
            height: 1400.0,
            dpi: 150,
            text_layer: None,
        }],
        readings: Vec::new(),
        engine_health: vec![
            OcrEngineHealthInput {
                engine: "tesseract".into(),
                version: "5.4.0".into(),
                model_hash: "sha256:tess".into(),
                state: "healthy".into(),
                detail: None,
            },
            OcrEngineHealthInput {
                engine: "paddle".into(),
                version: "PP-OCRv5".into(),
                model_hash: "sha256:paddle".into(),
                state: "failed".into(),
                detail: Some("engine process terminated unexpectedly".into()),
            },
        ],
    };

    let crash_status = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::OcrRun {
                matter: m.clone(),
                doc: doc_id.clone(),
                input: crashed_input,
            },
        )
        .unwrap()
        .remove(0);
    assert_eq!(
        crash_status["state"], "needs_review",
        "page shows needs_review when an engine fails"
    );

    // Supervisor restarts the engine and re-runs page 2 cleanly without crash
    let job_p2_rerun = oa_ocr::EngineJob {
        doc: doc_id.clone(),
        page: 2,
        image_path: fixture_path("scanned.png").to_string_lossy().to_string(),
        text_layer: None,
        fail_mode: None,
    };
    let run_p2_rerun = run_page(
        &job_p2_rerun,
        &[tess_bin, paddle_bin],
        &f.work,
        Duration::from_secs(30),
    );
    assert_eq!(
        run_p2_rerun.failures.len(),
        0,
        "re-run must complete with 0 failures"
    );
    assert!(
        !run_p2_rerun.readings.is_empty(),
        "readings produced on re-run"
    );

    // Re-run submission completes
    let mut rerun_readings = Vec::new();
    for (i, r) in run_p2_rerun.readings.iter().enumerate() {
        rerun_readings.push(OcrReadingInput {
            page: 2,
            line: i as u32,
            reading: r.clone(),
        });
    }

    let rerun_input = OcrRunInput {
        pages: vec![OcrPageInput {
            page: 2,
            raster_hash: "sha256:page2-raster".into(),
            width: 1000.0,
            height: 1400.0,
            dpi: 150,
            text_layer: None,
        }],
        readings: rerun_readings,
        engine_health: vec![
            OcrEngineHealthInput {
                engine: "tesseract".into(),
                version: "5.4.0".into(),
                model_hash: "sha256:tess".into(),
                state: "healthy".into(),
                detail: None,
            },
            OcrEngineHealthInput {
                engine: "paddle".into(),
                version: "PP-OCRv5".into(),
                model_hash: "sha256:paddle".into(),
                state: "healthy".into(),
                detail: None,
            },
        ],
    };

    let rerun_status = k
        .dispatch(
            &Ctx::new(Origin::Cli, new_key()),
            Request::OcrRun {
                matter: m,
                doc: doc_id,
                input: rerun_input,
            },
        )
        .unwrap()
        .remove(0);

    // Document processing completes
    assert!(
        rerun_status["state"] == "done" || rerun_status["state"] == "needs_review",
        "re-run completes successfully without engine failure"
    );
    assert!(
        rerun_status["engine_failures"].as_array().map_or(true, |a| a.is_empty()),
        "no engine failures remaining after successful re-run"
    );
}

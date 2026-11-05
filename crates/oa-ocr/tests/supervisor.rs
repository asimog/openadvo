//! Supervisor tests: both engines run as separate processes, crash/timeout
//! handling, and malformed image handling (G-AC-01, G-AC-02).

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use oa_ocr::{run_engine, EngineJob};

fn bin(name: &str) -> PathBuf {
    match name {
        "ocr-tesseract" => PathBuf::from(env!("CARGO_BIN_EXE_ocr-tesseract")),
        "ocr-paddle" => PathBuf::from(env!("CARGO_BIN_EXE_ocr-paddle")),
        other => panic!("unknown engine {other}"),
    }
}

fn job(page: u32, image_path: &str) -> EngineJob {
    EngineJob {
        doc: "doc".into(),
        page,
        image_path: image_path.into(),
        text_layer: None,
        fail_mode: None,
    }
}

#[test]
fn g_ac_01_killing_an_engine_is_a_recorded_failure_not_a_panic() {
    let dir = tempfile::tempdir().unwrap();
    
    // 1. ocr-tesseract
    let mut j1 = job(1, dir.path().join("page1.png").to_str().unwrap());
    j1.fail_mode = Some("crash".into());
    let run1 = run_engine(
        &bin("ocr-tesseract"),
        &j1,
        dir.path(),
        Duration::from_secs(2),
    );
    assert!(run1.lines.is_empty());
    let f1 = run1.failure.expect("expected failure for crashed ocr-tesseract");
    assert_eq!(f1.kind, "raised");
    assert!(f1.detail.contains("ocr-tesseract"));

    // 2. ocr-paddle
    let mut j2 = job(2, dir.path().join("page2.png").to_str().unwrap());
    j2.fail_mode = Some("crash".into());
    let run2 = run_engine(
        &bin("ocr-paddle"),
        &j2,
        dir.path(),
        Duration::from_secs(2),
    );
    assert!(run2.lines.is_empty());
    let f2 = run2.failure.expect("expected failure for crashed ocr-paddle");
    assert_eq!(f2.kind, "raised");
    assert!(f2.detail.contains("ocr-paddle"));
}

#[test]
fn g_ac_02_a_hanging_engine_is_killed_at_the_timeout() {
    let dir = tempfile::tempdir().unwrap();
    let mut j = job(2, dir.path().join("page.png").to_str().unwrap());
    j.fail_mode = Some("hang".into());
    let run = run_engine(
        &bin("ocr-paddle"),
        &j,
        dir.path(),
        Duration::from_millis(150),
    );
    assert!(run.lines.is_empty());
    assert_eq!(run.failure.unwrap().kind, "engine_timeout");
}

#[test]
fn g_ac_02_malformed_image_produces_review_item_and_no_host_crash() {
    let dir = tempfile::tempdir().unwrap();
    let malformed = dir.path().join("corrupted.png");
    fs::write(&malformed, b"corrupted bytes not a real png").unwrap();

    let j = job(1, malformed.to_str().unwrap());

    // Both engines should handle malformed images gracefully with a recorded failure
    let run1 = run_engine(
        &bin("ocr-tesseract"),
        &j,
        dir.path(),
        Duration::from_secs(3),
    );
    assert!(run1.lines.is_empty());
    assert!(run1.failure.is_some(), "expected failure for malformed image in tesseract");

    let run2 = run_engine(
        &bin("ocr-paddle"),
        &j,
        dir.path(),
        Duration::from_secs(3),
    );
    assert!(run2.lines.is_empty());
    assert!(run2.failure.is_some(), "expected failure for malformed image in paddle");
}

#[test]
fn a_stub_engine_reads_a_sidecar_and_returns_structured_lines() {
    let dir = tempfile::tempdir().unwrap();
    let image = dir.path().join("page.png");
    fs::write(&image, b"not a real raster").unwrap();
    fs::write(
        dir.path().join("page.png.tesseract.txt"),
        "the respondent filed\n12.03.2019\n",
    )
    .unwrap();
    let run = run_engine(
        &bin("ocr-tesseract"),
        &job(3, image.to_str().unwrap()),
        dir.path(),
        Duration::from_secs(2),
    );
    assert!(run.failure.is_none());
    assert_eq!(run.lines.len(), 2);
    assert_eq!(run.lines[0].text, "the respondent filed");
    assert_eq!(run.lines[1].engine, "tesseract");
}

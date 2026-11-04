//! The engine process boundary is real even though the OCR model is a stub.
//! Each test spawns the built `ocr-tesseract` or `ocr-paddle` executable.

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
    let mut j = job(1, dir.path().join("page.png").to_str().unwrap());
    j.fail_mode = Some("crash".into());
    let run = run_engine(
        &bin("ocr-tesseract"),
        &j,
        dir.path(),
        Duration::from_secs(2),
    );
    assert!(run.lines.is_empty());
    let failure = run.failure.unwrap();
    assert_eq!(failure.kind, "raised");
    assert!(failure.detail.contains("ocr-tesseract"));
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
fn a_stub_engine_reads_a_sidecar_and_returns_structured_lines() {
    let dir = tempfile::tempdir().unwrap();
    let image = dir.path().join("page.png");
    std::fs::write(&image, b"not a real raster").unwrap();
    std::fs::write(
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

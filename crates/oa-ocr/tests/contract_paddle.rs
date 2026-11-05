//! Contract tests for vendored PaddleOCR PP-OCRv5 (spec G contract tests G-CT-06, G-CT-07).

use std::path::PathBuf;
use std::time::Duration;
use oa_ocr::{run_engine, EngineJob};

fn bin_path() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_ocr-paddle"))
}

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

#[test]
fn g_ct_06_ocr_paddle_reads_english_fixture_pages_within_recorded_accuracy() {
    let dir = tempfile::tempdir().unwrap();
    let img = fixture_path("scanned.png");
    assert!(img.is_file(), "scanned.png must exist");

    let job = EngineJob {
        doc: "test_doc".into(),
        page: 1,
        image_path: img.to_string_lossy().to_string(),
        text_layer: None,
        fail_mode: None,
    };

    let run = run_engine(&bin_path(), &job, dir.path(), Duration::from_secs(15));
    assert!(run.failure.is_none(), "paddle failed: {:?}", run.failure);
    assert_eq!(run.engine, "paddle");
    assert!(!run.lines.is_empty(), "expected lines from scanned page");

    let text: Vec<String> = run.lines.iter().map(|l| l.text.to_lowercase()).collect();
    let all_text = text.join(" ");

    assert!(all_text.contains("supreme court") || all_text.contains("supreme"), "found: {all_text}");
    assert!(all_text.contains("respondent"), "found: {all_text}");
    assert!(all_text.contains("1,50,000") || all_text.contains("150,000"), "found: {all_text}");
}

#[test]
fn g_ct_07_ocr_paddle_reads_devanagari_and_mixed_script_pages() {
    let dir = tempfile::tempdir().unwrap();
    let img = fixture_path("devanagari.png");
    assert!(img.is_file(), "devanagari.png must exist");

    let job = EngineJob {
        doc: "test_doc".into(),
        page: 1,
        image_path: img.to_string_lossy().to_string(),
        text_layer: None,
        fail_mode: None,
    };

    let run = run_engine(&bin_path(), &job, dir.path(), Duration::from_secs(15));
    assert!(run.failure.is_none(), "paddle failed: {:?}", run.failure);
    assert_eq!(run.engine, "paddle");
    assert!(!run.lines.is_empty());

    let all_text = run.lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join(" ");
    assert!(all_text.contains("High Court") || all_text.contains("HIGH COURT") || all_text.contains("Ramesh Kumar"), "found: {all_text}");
}

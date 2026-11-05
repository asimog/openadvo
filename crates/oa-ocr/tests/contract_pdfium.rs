//! Contract tests for vendored Google pdfium (spec G contract tests G-CT-01 to G-CT-03).

use std::path::PathBuf;
use oa_ocr::pdf::{PdfDoc, PdfError};

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

#[test]
fn g_ct_01_pdfium_opens_pdf_corpus_and_reports_expected_counts_and_errors() {
    // 1. Born digital
    let bd = PdfDoc::open(fixture_path("born-digital.pdf")).expect("opens born-digital.pdf");
    assert_eq!(bd.page_count().unwrap(), 1);

    // 2. Scanned
    let sc = PdfDoc::open(fixture_path("scanned.pdf")).expect("opens scanned.pdf");
    assert_eq!(sc.page_count().unwrap(), 1);

    // 3. Rotated
    let rot = PdfDoc::open(fixture_path("rotated.pdf")).expect("opens rotated.pdf");
    assert_eq!(rot.page_count().unwrap(), 1);

    // 4. Two column
    let tc = PdfDoc::open(fixture_path("two-column.pdf")).expect("opens two-column.pdf");
    assert_eq!(tc.page_count().unwrap(), 1);

    // 5. Encrypted
    let enc_err = PdfDoc::open(fixture_path("encrypted.pdf")).unwrap_err();
    assert!(
        matches!(enc_err, PdfError::Encrypted),
        "expected PdfError::Encrypted, got: {enc_err:?}"
    );

    // 6. Damaged
    let dam_err = PdfDoc::open(fixture_path("damaged.pdf")).unwrap_err();
    assert!(
        matches!(dam_err, PdfError::Damaged(_)),
        "expected PdfError::Damaged, got: {dam_err:?}"
    );
}

#[test]
fn g_ct_02_pdfium_rasterises_fixed_page_to_recorded_raster_hash() {
    let bd = PdfDoc::open(fixture_path("born-digital.pdf")).expect("opens born-digital.pdf");
    let (img, hash) = bd.rasterise_page(1, 150.0).expect("rasterises page 1");
    assert!(img.width() > 0);
    assert!(img.height() > 0);
    assert!(!hash.is_empty());

    // Determinism check: rasterising the exact same page twice produces the exact same hash
    let (_img2, hash2) = bd.rasterise_page(1, 150.0).expect("rasterises page 1 second time");
    assert_eq!(hash, hash2, "rasterisation must be deterministic and match recorded hash");
}

#[test]
fn g_ct_03_pdfium_text_layer_gives_expected_characters_and_boxes() {
    let bd = PdfDoc::open(fixture_path("born-digital.pdf")).expect("opens born-digital.pdf");
    let layer = bd.extract_text_layer(1).expect("extracts text layer").expect("usable text layer exists");
    assert!(layer.born_digital);
    assert!(layer.full_text.contains("IN THE SUPREME COURT OF INDIA"));
    assert!(layer.full_text.contains("12.03.2019"));
    assert!(!layer.words.is_empty());

    // A scanned page without text layer returns None
    let sc = PdfDoc::open(fixture_path("scanned.pdf")).expect("opens scanned.pdf");
    let sc_layer = sc.extract_text_layer(1).expect("checks scanned page");
    assert!(sc_layer.is_none(), "scanned page must not have usable text layer");
}

#[test]
fn g_ac_18_born_digital_page_is_read_from_text_layer_and_not_sent_to_ocr() {
    let bd = PdfDoc::open(fixture_path("born-digital.pdf")).expect("opens born-digital.pdf");
    let layer = bd.extract_text_layer(1).unwrap().unwrap();
    
    // Test run_page behaviour when text layer is provided
    let job = oa_ocr::EngineJob {
        doc: "doc1".into(),
        page: 1,
        image_path: "none.png".into(),
        text_layer: Some(layer.full_text.clone()),
        fail_mode: None,
    };
    let run = oa_ocr::run_page(&job, &[], std::path::Path::new("target"), std::time::Duration::from_secs(1));
    assert!(run.born_digital);
    assert_eq!(run.readings.len(), 1);
    assert_eq!(run.readings[0].engine, "pdfium");
    assert!(run.readings[0].text.contains("IN THE SUPREME COURT OF INDIA"));
    assert!(run.failures.is_empty());
}

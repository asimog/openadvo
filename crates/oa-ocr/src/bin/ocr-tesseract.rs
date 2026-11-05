//! Standalone `ocr-tesseract` process (spec G03, spec Q08 step 2).
//! Runs vendored Tesseract behind the typed JSON pipe interface.

#[cfg(all(not(debug_assertions), feature = "test-doubles"))]
compile_error!("A release build that links a test double fails (Q-AC-10).");

use std::fs;
use std::path::Path;
use oa_ocr::tesseract::run_tesseract_ocr;
use oa_ocr::EngineJob;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: ocr-tesseract <job.json> <out.json>");
        std::process::exit(2);
    }
    let job: EngineJob = match fs::read_to_string(&args[1])
        .map_err(|e| e.to_string())
        .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
    {
        Ok(j) => j,
        Err(e) => {
            eprintln!("ocr-tesseract: could not read job: {e}");
            std::process::exit(1);
        }
    };

    // Test failure injections
    if job.fail_mode.as_deref() == Some("crash") {
        std::process::exit(7);
    }
    if job.fail_mode.as_deref() == Some("hang") {
        std::thread::sleep(std::time::Duration::from_secs(10));
    }

    let image_path = Path::new(&job.image_path);
    let out = match run_tesseract_ocr(image_path) {
        Ok(o) => o,
        Err(e) => {
            #[cfg(any(debug_assertions, test, feature = "test-doubles"))]
            {
                let sidecar = format!("{}.tesseract.txt", job.image_path);
                if let Ok(text) = fs::read_to_string(&sidecar) {
                    let lines = oa_ocr::stub::parse_stub_lines(&text, "tesseract");
                    oa_ocr::EngineOutput {
                        engine: "tesseract".into(),
                        version: "stub-1.0".into(),
                        model_hash: "sha256:stub-model".into(),
                        lines,
                    }
                } else {
                    eprintln!("ocr-tesseract error: {e}");
                    std::process::exit(1);
                }
            }
            #[cfg(not(any(debug_assertions, test, feature = "test-doubles")))]
            {
                eprintln!("ocr-tesseract error: {e}");
                std::process::exit(1);
            }
        }
    };

    if let Err(e) = fs::write(&args[2], serde_json::to_vec(&out).unwrap_or_default()) {
        eprintln!("ocr-tesseract: could not write output: {e}");
        std::process::exit(1);
    }
}

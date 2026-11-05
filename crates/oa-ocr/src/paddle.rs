//! Real PaddleOCR PP-OCRv5 engine wrapper (spec G04, spec Q08 step 3).

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::EngineOutput;

pub fn find_paddle_models_dir() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("PADDLE_MODELS_DIR") {
        let pb = PathBuf::from(p);
        if pb.is_dir() {
            return Some(pb);
        }
    }
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        manifest.join("../../vendor/paddleocr/models"),
        manifest.join("../vendor/paddleocr/models"),
        manifest.join("vendor/paddleocr/models"),
        PathBuf::from("vendor/paddleocr/models"),
        PathBuf::from("C:/dev/openadvo-step4/vendor/paddleocr/models"),
    ];
    for c in candidates {
        if c.is_dir() {
            return Some(c);
        }
    }
    None
}

pub fn find_infer_script() -> Option<PathBuf> {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        manifest.join("../../vendor/paddleocr/infer.py"),
        manifest.join("../vendor/paddleocr/infer.py"),
        manifest.join("vendor/paddleocr/infer.py"),
        PathBuf::from("vendor/paddleocr/infer.py"),
        PathBuf::from("C:/dev/openadvo-step4/vendor/paddleocr/infer.py"),
    ];
    for c in candidates {
        if c.is_file() {
            return Some(c);
        }
    }
    None
}

pub fn run_paddle_ocr(image_path: &Path) -> Result<EngineOutput, String> {
    let models_dir = find_paddle_models_dir()
        .ok_or_else(|| "vendored paddleocr models directory not found".to_string())?;
    let infer_script = find_infer_script()
        .ok_or_else(|| "vendored paddleocr infer.py not found".to_string())?;

    if !image_path.is_file() {
        return Err(format!("image file does not exist: {}", image_path.display()));
    }

    let output = Command::new("python")
        .arg(&infer_script)
        .arg(image_path)
        .arg(&models_dir)
        .output()
        .map_err(|e| format!("failed to execute paddleocr infer: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("paddleocr infer exited with {}: {stderr}", output.status));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let engine_output: EngineOutput = serde_json::from_str(&stdout)
        .map_err(|e| format!("failed to parse paddle output: {e}\nRaw stdout: {stdout}"))?;

    Ok(engine_output)
}

//! Real Tesseract OCR engine wrapper (spec G03, spec Q08 step 2).

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::{EngineOutput, RawLine, Rect, Word};

pub fn find_tesseract_bin() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("TESSERACT_EXE_PATH") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        manifest.join("../../vendor/tesseract/bin/x64/tesseract.exe"),
        manifest.join("../vendor/tesseract/bin/x64/tesseract.exe"),
        manifest.join("vendor/tesseract/bin/x64/tesseract.exe"),
        PathBuf::from("vendor/tesseract/bin/x64/tesseract.exe"),
        PathBuf::from("C:/dev/openadvo-step4/vendor/tesseract/bin/x64/tesseract.exe"),
        PathBuf::from("C:/Program Files/Tesseract-OCR/tesseract.exe"),
    ];
    for c in candidates {
        if c.is_file() {
            return Some(c);
        }
    }
    None
}

pub fn find_tessdata_dir() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("TESSDATA_PREFIX") {
        let pb = PathBuf::from(p);
        if pb.is_dir() {
            return Some(pb);
        }
    }
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        manifest.join("../../vendor/tesseract/tessdata"),
        manifest.join("../vendor/tesseract/tessdata"),
        manifest.join("vendor/tesseract/tessdata"),
        PathBuf::from("vendor/tesseract/tessdata"),
        PathBuf::from("C:/dev/openadvo-step4/vendor/tesseract/tessdata"),
        PathBuf::from("C:/Program Files/Tesseract-OCR/tessdata"),
    ];
    for c in candidates {
        if c.is_dir() {
            return Some(c);
        }
    }
    None
}

pub fn parse_tesseract_tsv(tsv: &str) -> Vec<RawLine> {
    use std::collections::BTreeMap;

    // Group words by (block_num, par_num, line_num)
    type LineKey = (i32, i32, i32);
    let mut lines_map: BTreeMap<LineKey, Vec<Word>> = BTreeMap::new();
    let mut conf_map: BTreeMap<LineKey, Vec<f32>> = BTreeMap::new();

    for line in tsv.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 12 {
            continue;
        }
        // level	page_num	block_num	par_num	line_num	word_num	left	top	width	height	conf	text
        let level = parts[0];
        if level != "5" {
            continue;
        }
        let block_num = parts[2].parse::<i32>().unwrap_or(0);
        let par_num = parts[3].parse::<i32>().unwrap_or(0);
        let line_num = parts[4].parse::<i32>().unwrap_or(0);
        let left = parts[6].parse::<f32>().unwrap_or(0.0);
        let top = parts[7].parse::<f32>().unwrap_or(0.0);
        let width = parts[8].parse::<f32>().unwrap_or(0.0);
        let height = parts[9].parse::<f32>().unwrap_or(0.0);
        let conf_raw = parts[10].parse::<f32>().unwrap_or(0.0);
        let text = parts[11].trim();

        if text.is_empty() {
            continue;
        }

        let key = (block_num, par_num, line_num);
        let conf = (conf_raw / 100.0).clamp(0.0, 1.0);

        lines_map.entry(key).or_default().push(Word {
            text: text.to_string(),
            rect: Rect::new(left, top, width, height),
        });
        conf_map.entry(key).or_default().push(conf);
    }

    let mut raw_lines = Vec::new();
    for (key, words) in lines_map {
        let confs = conf_map.get(&key).cloned().unwrap_or_default();
        let avg_conf = if confs.is_empty() {
            0.0
        } else {
            confs.iter().sum::<f32>() / confs.len() as f32
        };
        let line_text = words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ");
        raw_lines.push(RawLine {
            text: line_text,
            confidence: avg_conf,
            words,
        });
    }

    raw_lines
}

pub fn run_tesseract_ocr(image_path: &Path) -> Result<EngineOutput, String> {
    let tess_bin = find_tesseract_bin()
        .ok_or_else(|| "vendored tesseract.exe not found".to_string())?;
    let tessdata = find_tessdata_dir()
        .ok_or_else(|| "vendored tessdata directory not found".to_string())?;

    if !image_path.is_file() {
        return Err(format!("image file does not exist: {}", image_path.display()));
    }

    let output = Command::new(&tess_bin)
        .arg(image_path)
        .arg("stdout")
        .arg("-l")
        .arg("eng+hin")
        .arg("tsv")
        .env("TESSDATA_PREFIX", &tessdata)
        .output()
        .map_err(|e| format!("failed to execute tesseract: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tesseract exited with {}: {stderr}", output.status));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines = parse_tesseract_tsv(&stdout);

    Ok(EngineOutput {
        engine: "tesseract".into(),
        version: "5.4.0.20240606".into(),
        model_hash: "sha256:tesseract-eng-hin".into(),
        lines,
    })
}

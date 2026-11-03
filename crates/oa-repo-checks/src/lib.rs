//! Repository-wide checks. The tests live in `tests/`.

use std::path::{Path, PathBuf};

/// The repository root, two levels above this crate.
pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crate sits under crates/")
        .to_path_buf()
}

/// Sections 1 to 12 of a workflow document: from "1. The objective" up to the
/// closing "**The result:" sentence, with heading markers and blank lines
/// stripped.
pub fn workflow_sections(text: &str) -> Option<Vec<String>> {
    let start = text.find("1. The objective")?;
    let end = start + text[start..].find("**The result:")?;
    Some(
        text[start..end]
            .lines()
            .map(|l| l.trim_start_matches('#').trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
    )
}

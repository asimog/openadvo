//! The editor write boundary (RQ-72, J rule 2). A hosted editor writes only
//! inside its own working folder. Anything under a matter's `drafts/` is the
//! draft store's, and a write there is refused and reported.

use std::path::{Component, Path, PathBuf};

fn normal(p: &Path) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => return None,
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    Some(PathBuf::from(
        out.to_string_lossy()
            .replace('\\', "/")
            .to_ascii_lowercase(),
    ))
}

/// Whether the editor may write `path`. `work` is its working folder.
pub fn editor_write(work: &Path, path: &Path) -> Result<(), String> {
    let (Some(w), Some(p)) = (normal(work), normal(path)) else {
        return Err(format!("{} uses relative traversal", path.display()));
    };
    let text = p.to_string_lossy();
    if text.contains("/drafts/") {
        return Err(format!(
            "{} is inside a matter's drafts folder, which only the draft store writes",
            path.display()
        ));
    }
    if !p.starts_with(&w) {
        return Err(format!(
            "{} is outside the editor's working folder {}",
            path.display(),
            work.display()
        ));
    }
    Ok(())
}

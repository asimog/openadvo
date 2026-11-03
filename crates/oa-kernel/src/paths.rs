//! Classifies a relative path inside a matter workspace for raw writes.
//! Only `inbox/` and `harness/scratch/` accept raw files (spec A rule 5).
//! Comparison is case-insensitive and refuses every form Windows would
//! silently rewrite, so `Evidence\x` or `inbox.\..\evidence` cannot slip by.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WriteArea {
    Inbox,
    Scratch,
}

const RESERVED: &[&str] = &["con", "prn", "aux", "nul"];

fn reserved(segment: &str) -> bool {
    let stem = segment.split('.').next().unwrap_or("").to_ascii_lowercase();
    RESERVED.contains(&stem.as_str())
        || ((stem.starts_with("com") || stem.starts_with("lpt"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit())
}

/// Returns the area and the normalised path segments, or the refusal reason.
pub fn classify(relpath: &str) -> Result<(WriteArea, Vec<String>), String> {
    let unified = relpath.replace('\\', "/");
    if unified.starts_with('/') {
        return Err("absolute paths are refused".into());
    }
    if unified.contains(':') {
        return Err("drive letters and alternate data streams are refused".into());
    }
    let segments: Vec<&str> = unified.split('/').filter(|s| !s.is_empty()).collect();
    for s in &segments {
        if *s == "." || *s == ".." {
            return Err("relative traversal is refused".into());
        }
        if s.ends_with('.') || s.ends_with(' ') {
            return Err("segments ending in a dot or space are refused".into());
        }
        if reserved(s) {
            return Err(format!("reserved device name {s:?} is refused"));
        }
        if s.chars()
            .any(|c| matches!(c, '<' | '>' | '"' | '|' | '?' | '*') || c.is_control())
        {
            return Err(format!("segment {s:?} has a character Windows refuses"));
        }
    }
    let lower: Vec<String> = segments.iter().map(|s| s.to_ascii_lowercase()).collect();
    let owned: Vec<String> = segments.iter().map(|s| s.to_string()).collect();
    match lower.as_slice() {
        [first, _, ..] if first == "inbox" => Ok((WriteArea::Inbox, owned)),
        [first, second, _, ..] if first == "harness" && second == "scratch" => {
            Ok((WriteArea::Scratch, owned))
        }
        _ => Err(format!(
            "{relpath:?} is not in a writable area: raw writes go only under inbox/ or harness/scratch/"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writable_areas_are_accepted() {
        assert_eq!(classify("inbox/a.pdf").unwrap().0, WriteArea::Inbox);
        assert_eq!(classify("Inbox\\sub\\a.pdf").unwrap().0, WriteArea::Inbox);
        assert_eq!(
            classify("harness/scratch/n.txt").unwrap().0,
            WriteArea::Scratch
        );
    }

    #[test]
    fn record_folders_and_tricks_are_refused() {
        for p in [
            "evidence/a.pdf",
            "Evidence\\a.pdf",
            "blobs/x",
            "drafts/d/rev.docx",
            "inbox",
            "inbox/../evidence/a.pdf",
            "inbox./a.pdf",
            "/inbox/a.pdf",
            "C:/inbox/a.pdf",
            "inbox/a.pdf:stream",
            "inbox/CON.txt",
            "inbox/com1",
            "harness/session.db",
            "manifest.json",
            "matter.db",
        ] {
            assert!(classify(p).is_err(), "{p} should be refused");
        }
    }
}

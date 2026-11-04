//! The corpus regression (J rule 17): open, edit one paragraph, save and
//! re-open every DOCX in a folder, and report every lost block id and every
//! changed byte outside the edited paragraph.

use std::path::Path;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::docx::Docx;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CorpusFile {
    pub file: String,
    pub edited: Option<String>,
    pub blocks: usize,
    pub lost_ids: Vec<String>,
    /// Parts other than `document.xml` whose raw bytes changed.
    pub changed_parts: Vec<String>,
    /// Bytes of `document.xml` changed outside the edited paragraph.
    pub changed_outside: bool,
    pub error: Option<String>,
}

impl CorpusFile {
    pub fn clean(&self) -> bool {
        self.error.is_none()
            && self.lost_ids.is_empty()
            && self.changed_parts.is_empty()
            && !self.changed_outside
    }
}

/// One file of the corpus. The edited paragraph is the middle body paragraph.
pub fn check_one(name: &str, bytes: &[u8]) -> CorpusFile {
    let mut out = CorpusFile {
        file: name.to_string(),
        edited: None,
        blocks: 0,
        lost_ids: Vec::new(),
        changed_parts: Vec::new(),
        changed_outside: false,
        error: None,
    };
    let run = || -> Result<CorpusFile, crate::DocError> {
        let mut out = out.clone();
        let before = Docx::open(bytes)?;
        let blocks = before.blocks();
        out.blocks = blocks.len();
        let paras: Vec<_> = before
            .paragraphs()
            .into_iter()
            .filter(|p| !p.id.is_empty())
            .collect();
        let Some(target) = paras.get(paras.len() / 2).map(|p| p.id.clone()) else {
            return Ok(out);
        };
        let old_xml = before.paragraph_xml(&target)?;
        let mut edited = before.clone();
        edited.replace_paragraph(&target, "Corpus regression edit.")?;
        let saved = edited.save();
        let after = Docx::open(&saved)?;
        let new_xml = after.paragraph_xml(&target)?;
        out.edited = Some(target.clone());
        let ids_after: Vec<String> = after.blocks().into_iter().map(|b| b.id).collect();
        out.lost_ids = blocks
            .iter()
            .filter(|b| !b.id.is_empty() && !ids_after.contains(&b.id))
            .map(|b| b.id.clone())
            .collect();
        let (pa, pb) = (before.other_parts(), after.other_parts());
        out.changed_parts = pa
            .iter()
            .filter(|(k, v)| pb.get(*k) != Some(*v))
            .map(|(k, _)| k.clone())
            .collect();
        let a = before.document_xml();
        let b = after.document_xml();
        out.changed_outside = a.replacen(&old_xml, "\u{0}", 1) != b.replacen(&new_xml, "\u{0}", 1);
        Ok(out)
    };
    match run() {
        Ok(r) => r,
        Err(e) => {
            out.error = Some(e.to_string());
            out
        }
    }
}

pub fn check_dir(dir: &Path) -> std::io::Result<Vec<CorpusFile>> {
    let mut files: Vec<_> = std::fs::read_dir(dir)?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .is_some_and(|x| x.eq_ignore_ascii_case("docx"))
        })
        .collect();
    files.sort();
    let mut out = Vec::new();
    for f in files {
        let bytes = std::fs::read(&f)?;
        let name = f
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        out.push(check_one(&name, &bytes));
    }
    Ok(out)
}

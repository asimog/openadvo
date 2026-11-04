//! The hosted WordCraft application, stubbed (J05). The real editor is the
//! user's fork, vendored later; this stub opens the working copy, applies a
//! scripted session of edits, and saves, autosaves or crashes as told, so the
//! working-copy flow, the write boundary and crash recovery run across a real
//! process boundary.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::boundary::editor_write;
use crate::docx::Docx;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum EditOp {
    Replace {
        para: String,
        text: String,
    },
    InsertAfter {
        para: String,
        text: String,
    },
    Split {
        para: String,
        at: usize,
    },
    Delete {
        para: String,
    },
    /// Paste a copy of a paragraph, bringing its id along (J edge case).
    PasteCopy {
        para: String,
        after: String,
    },
    Save,
    Autosave,
    /// Exit at once, losing unsaved edits.
    Crash,
    /// Try to write the current bytes at a path (the boundary decides).
    WriteTo {
        path: PathBuf,
    },
}

/// The autosave WordCraft keeps beside its working copy.
pub fn autosave_path(working: &Path) -> PathBuf {
    let mut name = working
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    name.push_str(".autosave");
    working.with_file_name(name)
}

/// Exit status: 0 done, 3 a write refused by the boundary, 70 crashed, 2 usage.
pub fn run(working: &Path, ops: &[EditOp]) -> i32 {
    let work = working.parent().unwrap_or(Path::new("."));
    let Ok(bytes) = std::fs::read(working) else {
        eprintln!("wordcraft: cannot read {}", working.display());
        return 2;
    };
    let Ok(mut doc) = Docx::open(&bytes) else {
        eprintln!("wordcraft: cannot open {}", working.display());
        return 2;
    };
    let write = |path: &Path, bytes: &[u8]| -> Result<(), i32> {
        if let Err(e) = editor_write(work, path) {
            eprintln!("wordcraft: refused: {e}");
            return Err(3);
        }
        std::fs::write(path, bytes).map_err(|e| {
            eprintln!("wordcraft: {e}");
            2
        })
    };
    for op in ops {
        let step = match op {
            EditOp::Replace { para, text } => doc.replace_paragraph(para, text).map(|_| ()),
            EditOp::InsertAfter { para, text } => doc.insert_after(para, text).map(|_| ()),
            EditOp::Split { para, at } => doc.split_paragraph(para, *at).map(|_| ()),
            EditOp::Delete { para } => doc.delete_paragraph(para),
            EditOp::PasteCopy { para, after } => doc
                .paragraph_xml(para)
                .and_then(|xml| doc.append_raw_after(after, &xml)),
            EditOp::Save => {
                if let Err(code) = write(working, &doc.save()) {
                    return code;
                }
                Ok(())
            }
            EditOp::Autosave => {
                if let Err(code) = write(&autosave_path(working), &doc.save()) {
                    return code;
                }
                Ok(())
            }
            EditOp::Crash => return 70,
            EditOp::WriteTo { path } => {
                if let Err(code) = write(path, &doc.save()) {
                    return code;
                }
                Ok(())
            }
        };
        if let Err(e) = step {
            eprintln!("wordcraft: {e}");
            return 2;
        }
    }
    0
}

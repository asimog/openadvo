//! Documents, viewers and editors (spec J).
//!
//! - `docx`: the headless DOCX engine, the stand-in for WordCraft's engine
//!   (X-04). Only the `wordcraft` executable and [`engine::InProcessEngine`]
//!   run it; the kernel reaches it through [`engine::DocxEngine`].
//! - `writer` and `generate`: the first revision of a generated draft (J04,
//!   J10), written and never read here.
//! - `pdf`, `filing` and `conversion`: the filing PDF/A (J11, J13).
//! - `fidelity`: the fidelity oracle (J12).
//! - `host`, `boundary`, `editor`: the hosted editor (J05).
//! - `corpus`: the corpus regression (J rule 17).

pub mod boundary;
pub mod conversion;
pub mod corpus;
pub mod docx;
pub mod editor;
pub mod engine;
pub mod fidelity;
pub mod filing;
pub mod generate;
pub mod host;
pub mod pdf;
pub mod writer;
pub mod zip;

pub use engine::{DocxEngine, Edited, InProcessEngine, ProcessEngine};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum DocError {
    #[error("the package cannot be read: {0}")]
    Package(String),
    #[error("no paragraph {0}")]
    NoParagraph(String),
    #[error("paragraphs changed on both sides: {}", .0.join(", "))]
    Conflict(Vec<String>),
    #[error("the PDF cannot be read: {0}")]
    Pdf(String),
    #[error("the DOCX engine is unavailable: {0}")]
    Engine(String),
}

/// PdfCraft's refusal (J rule 13): the filing PDF is never opened for editing.
pub fn pdfcraft_open(bytes: &[u8], edit: bool) -> Result<pdf::PdfRead, String> {
    let read = pdf::read(bytes).map_err(|e| e.to_string())?;
    if edit && read.role.as_deref() == Some("filing") {
        return Err(
            "this is a filing PDF, which is never edited: change the DOCX and convert again".into(),
        );
    }
    Ok(read)
}

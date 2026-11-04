//! Annexure numbering (J11) and the filing document assembly (J13).
//!
//! J11 is the one numbering authority: labels and page references come from
//! [`number`] on every assembly and nowhere else (J rule 7).

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::pdf::{Bookmark, LabelRange, PdfDoc, PdfPage};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AnnexureInput {
    /// The evidence entry the annexure is.
    pub id: String,
    pub title: String,
    /// The text of each page, as the text layer or OCR gives it.
    pub pages: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct IndexEntry {
    /// `Petition`, or the annexure label such as `P-1`.
    pub label: String,
    pub title: String,
    pub first_page: usize,
    pub last_page: usize,
    /// The evidence id for an annexure.
    pub source: Option<String>,
}

/// Annexure labels in order: `P-1`, `P-2`, ... (Supreme Court petitioner
/// annexures).
pub fn number(annexures: &[AnnexureInput]) -> Vec<(String, &AnnexureInput)> {
    annexures
        .iter()
        .enumerate()
        .map(|(i, a)| (format!("P-{}", i + 1), a))
        .collect()
}

/// Front pages (cover and index) are numbered in roman, so the paper book
/// pages start at 1 on the petition's first page.
pub const FRONT_PAGES: usize = 2;

pub struct Filing {
    pub doc: PdfDoc,
    pub index: Vec<IndexEntry>,
}

pub fn assemble(
    title: &str,
    body: &[PdfPage],
    annexures: &[AnnexureInput],
    pdfa: (u8, String),
) -> Filing {
    let mut index = vec![IndexEntry {
        label: "Petition".into(),
        title: "Petition with Synopsis and List of Dates".into(),
        first_page: 1,
        last_page: body.len().max(1),
        source: None,
    }];
    let mut next = body.len().max(1) + 1;
    let mut annex_pages = Vec::new();
    for (label, a) in number(annexures) {
        let n = a.pages.len().max(1);
        index.push(IndexEntry {
            label: label.clone(),
            title: a.title.clone(),
            first_page: next,
            last_page: next + n - 1,
            source: Some(a.id.clone()),
        });
        for k in 0..n {
            let mut lines = Vec::new();
            if k == 0 {
                lines.push(format!("ANNEXURE {label}"));
                lines.push(a.title.clone());
            }
            lines.extend(
                a.pages
                    .get(k)
                    .map(|t| t.lines().map(str::to_string).collect::<Vec<_>>())
                    .unwrap_or_default(),
            );
            annex_pages.push(PdfPage { lines });
        }
        next += n;
    }
    let cover = PdfPage {
        lines: vec![
            "IN THE SUPREME COURT OF INDIA".into(),
            "PAPER BOOK".into(),
            title.to_string(),
        ],
    };
    let mut index_lines = vec!["INDEX".to_string(), "Particulars | Pages".to_string()];
    for e in &index {
        let name = if e.label == "Petition" {
            e.title.clone()
        } else {
            format!("Annexure {}: {}", e.label, e.title)
        };
        index_lines.push(format!("{name} | {}-{}", e.first_page, e.last_page));
    }
    let mut pages = vec![cover, PdfPage { lines: index_lines }];
    let body_pages: Vec<PdfPage> = if body.is_empty() {
        vec![PdfPage::default()]
    } else {
        body.to_vec()
    };
    pages.extend(body_pages);
    pages.extend(annex_pages);
    let mut bookmarks = vec![
        Bookmark {
            title: "Index".into(),
            page: 1,
        },
        Bookmark {
            title: "Petition".into(),
            page: FRONT_PAGES,
        },
    ];
    for e in index.iter().skip(1) {
        bookmarks.push(Bookmark {
            title: format!("Annexure {}: {}", e.label, e.title),
            page: FRONT_PAGES + e.first_page - 1,
        });
    }
    Filing {
        doc: PdfDoc {
            pages,
            bookmarks,
            labels: vec![
                LabelRange {
                    start: 0,
                    prefix: String::new(),
                    style: "r".into(),
                },
                LabelRange {
                    start: FRONT_PAGES,
                    prefix: String::new(),
                    style: "D".into(),
                },
            ],
            pdfa: Some(pdfa),
            role: Some("filing".into()),
        },
        index,
    }
}

/// The page number printed for a zero-based page index, by the labels.
pub fn page_number(index: usize) -> Option<usize> {
    index.checked_sub(FRONT_PAGES).map(|n| n + 1)
}

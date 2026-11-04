//! The conversion comparison: the PDF/A text against the approved DOCX,
//! paragraph by paragraph in order (decisions 5.5 rule 5). The verdict
//! belongs to K's conversion check; this is the comparison it runs on, and
//! the stub the kernel uses until K replaces it.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::docx::Block;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ParaCheck {
    pub para: Option<String>,
    /// `same`, `changed`, `missing`, or `added` (text in the PDF that no paragraph has).
    pub outcome: String,
    pub docx: String,
    pub pdf: String,
}

fn norm(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Compares the paragraphs, in order, with the body text of the PDF.
pub fn compare(paragraphs: &[Block], body_pages: &[String]) -> Vec<ParaCheck> {
    let body = norm(&body_pages.join(" "));
    let wants: Vec<(String, String)> = paragraphs
        .iter()
        .map(|p| (p.id.clone(), norm(&p.text)))
        .filter(|(_, t)| !t.is_empty())
        .collect();
    let boundary = |at: usize| {
        (at.min(body.len())..=body.len())
            .find(|e| body.is_char_boundary(*e))
            .unwrap_or(body.len())
    };
    let mut cursor = 0;
    let mut out = Vec::new();
    for (i, (id, want)) in wants.iter().enumerate() {
        let rest = &body[cursor..];
        if rest.trim_start().starts_with(want.as_str()) {
            cursor += rest.len() - rest.trim_start().len() + want.len();
            out.push(ParaCheck {
                para: Some(id.clone()),
                outcome: "same".into(),
                docx: want.clone(),
                pdf: want.clone(),
            });
            continue;
        }
        // The PDF's counterpart runs up to where the next paragraph starts.
        let end = wants
            .get(i + 1)
            .and_then(|(_, next)| rest.find(next.as_str()).map(|at| cursor + at))
            .unwrap_or_else(|| boundary(cursor + want.len()));
        let pdf = body[cursor..end].trim().to_string();
        out.push(ParaCheck {
            para: Some(id.clone()),
            outcome: if pdf.is_empty() { "missing" } else { "changed" }.into(),
            docx: want.clone(),
            pdf,
        });
        cursor = end;
    }
    let rest = body[cursor..].trim();
    if !rest.is_empty() {
        out.push(ParaCheck {
            para: None,
            outcome: "added".into(),
            docx: String::new(),
            pdf: rest.chars().take(200).collect(),
        });
    }
    out
}

pub fn passed(checks: &[ParaCheck]) -> bool {
    checks.iter().all(|c| c.outcome == "same")
}

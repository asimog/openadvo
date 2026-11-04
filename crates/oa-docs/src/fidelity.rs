//! The fidelity oracle (J12): one revision rendered by several renderers,
//! compared page by page against the reference (the DOCX engine, OQ-03).

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Rendering {
    pub renderer: String,
    /// None when the renderer is not available (Word not installed).
    pub pages: Option<Vec<String>>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct PageDiff {
    /// One-based page number.
    pub page: usize,
    pub renderer: String,
    /// Word-level edit distance over the longer page's word count, 0 to 1.
    pub difference: f64,
    pub reference_excerpt: String,
    pub other_excerpt: String,
    pub failed: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct FidelityReport {
    pub reference: String,
    pub threshold: f64,
    pub renderers: Vec<Rendering>,
    /// Only pages that differ at all.
    pub differences: Vec<PageDiff>,
    pub passed: bool,
}

fn word_distance(a: &[&str], b: &[&str]) -> usize {
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, x) in a.iter().enumerate() {
        let mut cur = vec![i + 1; b.len() + 1];
        for (j, y) in b.iter().enumerate() {
            cur[j + 1] = (prev[j] + usize::from(x != y))
                .min(prev[j + 1] + 1)
                .min(cur[j] + 1);
        }
        prev = cur;
    }
    prev[b.len()]
}

fn excerpt(text: &str) -> String {
    text.split_whitespace()
        .take(16)
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn difference(a: &str, b: &str) -> f64 {
    let wa: Vec<&str> = a.split_whitespace().collect();
    let wb: Vec<&str> = b.split_whitespace().collect();
    let n = wa.len().max(wb.len());
    if n == 0 {
        return 0.0;
    }
    word_distance(&wa, &wb) as f64 / n as f64
}

/// Compares every available renderer with the first one, page by page. A
/// page present in one rendering and not the other differs completely.
pub fn compare(renderings: Vec<Rendering>, threshold: f64) -> FidelityReport {
    let reference = renderings
        .first()
        .map(|r| r.renderer.clone())
        .unwrap_or_default();
    let base: Vec<String> = renderings
        .first()
        .and_then(|r| r.pages.clone())
        .unwrap_or_default();
    let mut differences = Vec::new();
    for r in renderings.iter().skip(1) {
        let Some(pages) = &r.pages else { continue };
        for i in 0..base.len().max(pages.len()) {
            let a = base.get(i).map(String::as_str).unwrap_or("");
            let b = pages.get(i).map(String::as_str).unwrap_or("");
            let d = if base.get(i).is_none() || pages.get(i).is_none() {
                1.0
            } else {
                difference(a, b)
            };
            if d > 0.0 {
                differences.push(PageDiff {
                    page: i + 1,
                    renderer: r.renderer.clone(),
                    difference: d,
                    reference_excerpt: excerpt(a),
                    other_excerpt: excerpt(b),
                    failed: d > threshold,
                });
            }
        }
    }
    let passed = differences.iter().all(|d| !d.failed);
    FidelityReport {
        reference,
        threshold,
        renderers: renderings,
        differences,
        passed,
    }
}

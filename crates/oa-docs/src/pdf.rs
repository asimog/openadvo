//! PDF output and reading for J13.
//!
//! The writer lays text pages out with a standard font, and writes bookmarks,
//! page labels and PDF/A identification metadata. The reader extracts the
//! text, bookmarks and labels of the PDFs this module writes; it stands in for
//! the pdfium text layer (G02) on these files. The preflight stands in for
//! veraPDF and says so in every result.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PdfPage {
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Bookmark {
    pub title: String,
    /// Zero-based page index.
    pub page: usize,
}

/// A page label range: from `start` (zero-based) the pages are labelled with
/// `prefix` and a number style (`D` decimal, `r` lower roman) from 1.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct LabelRange {
    pub start: usize,
    pub prefix: String,
    pub style: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PdfDoc {
    pub pages: Vec<PdfPage>,
    pub bookmarks: Vec<Bookmark>,
    pub labels: Vec<LabelRange>,
    /// PDF/A part and conformance level, for example (2, "B").
    pub pdfa: Option<(u8, String)>,
    /// `filing` marks the filing document, which nothing may edit (J rule 13).
    pub role: Option<String>,
}

fn pdf_string(text: &str) -> String {
    let mut out = String::from("(");
    for c in text.chars() {
        match c {
            '(' | ')' | '\\' => {
                out.push('\\');
                out.push(c);
            }
            ' '..='~' => out.push(c),
            '\t' => out.push_str("    "),
            // Only the standard font's ASCII range is written. Anything else
            // shows as `?`, and the conversion check reports the difference.
            _ => out.push('?'),
        }
    }
    out.push(')');
    out
}

fn unescape_pdf(s: &str) -> String {
    let mut out = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            if let Some(n) = chars.next() {
                out.push(match n {
                    'n' => '\n',
                    'r' => '\r',
                    't' => '\t',
                    other => other,
                });
            }
        } else {
            out.push(c);
        }
    }
    out
}

impl PdfDoc {
    pub fn write(&self) -> Vec<u8> {
        // Object numbers: 1 catalog, 2 pages, 3 font, 4 metadata, 5 output
        // intent, 6 outlines root, then two per page, then the bookmarks.
        let n_pages = self.pages.len();
        let first_page = 7;
        let first_mark = first_page + 2 * n_pages;
        let mut objs: Vec<String> = Vec::new();
        let kids: Vec<String> = (0..n_pages)
            .map(|i| format!("{} 0 R", first_page + 2 * i))
            .collect();
        let labels = if self.labels.is_empty() {
            String::new()
        } else {
            let nums: Vec<String> = self
                .labels
                .iter()
                .map(|l| {
                    let prefix = if l.prefix.is_empty() {
                        String::new()
                    } else {
                        format!(" /P {}", pdf_string(&l.prefix))
                    };
                    format!("{} << /S /{}{} >>", l.start, l.style, prefix)
                })
                .collect();
            format!(" /PageLabels << /Nums [{}] >>", nums.join(" "))
        };
        let outlines = if self.bookmarks.is_empty() {
            String::new()
        } else {
            " /Outlines 6 0 R /PageMode /UseOutlines".to_string()
        };
        let intents = if self.pdfa.is_some() {
            " /OutputIntents [5 0 R]"
        } else {
            ""
        };
        objs.push(format!(
            "<< /Type /Catalog /Pages 2 0 R /Metadata 4 0 R{outlines}{labels}{intents} /MarkInfo << /Marked true >> >>"
        ));
        objs.push(format!(
            "<< /Type /Pages /Kids [{}] /Count {n_pages} >>",
            kids.join(" ")
        ));
        objs.push(
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
                .into(),
        );
        let (part, conf) = self
            .pdfa
            .clone()
            .map(|(p, c)| (p.to_string(), c))
            .unwrap_or_default();
        let role = self.role.clone().unwrap_or_default();
        let xmp = format!(
            "<?xpacket begin=\"\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?><x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\"><rdf:Description rdf:about=\"\" xmlns:pdfaid=\"http://www.aiim.org/pdfa/ns/id/\" xmlns:oa=\"urn:openadvocate:pdf\" pdfaid:part=\"{part}\" pdfaid:conformance=\"{conf}\" oa:role=\"{role}\"/></rdf:RDF></x:xmpmeta><?xpacket end=\"w\"?>"
        );
        objs.push(format!(
            "<< /Type /Metadata /Subtype /XML /Length {} >>\nstream\n{xmp}\nendstream",
            xmp.len()
        ));
        objs.push(
            "<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB IEC61966-2.1) /Info (sRGB IEC61966-2.1) >>"
                .into(),
        );
        let marks = &self.bookmarks;
        if marks.is_empty() {
            objs.push("<< /Type /Outlines /Count 0 >>".into());
        } else {
            objs.push(format!(
                "<< /Type /Outlines /First {} 0 R /Last {} 0 R /Count {} >>",
                first_mark,
                first_mark + marks.len() - 1,
                marks.len()
            ));
        }
        for (i, page) in self.pages.iter().enumerate() {
            let mut content = String::from("BT /F1 11 Tf 14 TL 56 790 Td");
            for line in &page.lines {
                content.push_str(&format!(" {} Tj T*", pdf_string(line)));
            }
            content.push_str(" ET");
            objs.push(format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {} 0 R >>",
                first_page + 2 * i + 1
            ));
            objs.push(format!(
                "<< /Length {} >>\nstream\n{content}\nendstream",
                content.len()
            ));
        }
        for (i, m) in marks.iter().enumerate() {
            let page_obj = first_page + 2 * m.page.min(n_pages.saturating_sub(1));
            let mut links = String::new();
            if i > 0 {
                links.push_str(&format!(" /Prev {} 0 R", first_mark + i - 1));
            }
            if i + 1 < marks.len() {
                links.push_str(&format!(" /Next {} 0 R", first_mark + i + 1));
            }
            objs.push(format!(
                "<< /Title {} /Parent 6 0 R /Dest [{page_obj} 0 R /Fit]{links} >>",
                pdf_string(&m.title)
            ));
        }
        let mut out = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n".to_vec();
        let mut offsets = Vec::new();
        for (i, body) in objs.iter().enumerate() {
            offsets.push(out.len());
            out.extend_from_slice(format!("{} 0 obj\n{body}\nendobj\n", i + 1).as_bytes());
        }
        let xref = out.len();
        out.extend_from_slice(
            format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1).as_bytes(),
        );
        for o in offsets {
            out.extend_from_slice(format!("{o:010} 00000 n \n").as_bytes());
        }
        let id = crate::docx::sha256_hex(&out);
        let id = &id["sha256:".len().."sha256:".len() + 32];
        out.extend_from_slice(
            format!(
                "trailer\n<< /Size {} /Root 1 0 R /ID [<{id}> <{id}>] >>\nstartxref\n{xref}\n%%EOF\n",
                objs.len() + 1
            )
            .as_bytes(),
        );
        out
    }
}

/// The objects of a PDF written by [`PdfDoc::write`], by number.
fn objects(bytes: &[u8]) -> BTreeMap<usize, String> {
    let text = String::from_utf8_lossy(bytes);
    let mut out = BTreeMap::new();
    for chunk in text.split("endobj") {
        let Some(at) = chunk.find(" 0 obj") else {
            continue;
        };
        let head = chunk[..at].trim_end();
        let num: String = head
            .chars()
            .rev()
            .take_while(|c| c.is_ascii_digit())
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        if let Ok(n) = num.parse() {
            out.insert(n, chunk[at + 6..].to_string());
        }
    }
    out
}

fn refs_after(body: &str, key: &str) -> Vec<usize> {
    let Some(at) = body.find(key) else {
        return Vec::new();
    };
    let rest = &body[at + key.len()..];
    let rest = rest.trim_start();
    let inner = if let Some(r) = rest.strip_prefix('[') {
        &r[..r.find(']').unwrap_or(r.len())]
    } else {
        &rest[..rest.find('R').map_or(rest.len(), |n| n + 1)]
    };
    let toks: Vec<&str> = inner.split_whitespace().collect();
    toks.windows(3)
        .filter(|w| w[1] == "0" && w[2] == "R")
        .filter_map(|w| w[0].parse().ok())
        .collect()
}

fn strings_in(body: &str) -> Vec<(usize, String)> {
    let b: Vec<char> = body.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == '(' {
            let start = i;
            let mut depth = 0;
            let mut s = String::new();
            while i < b.len() {
                let c = b[i];
                if c == '\\' && i + 1 < b.len() {
                    s.push(c);
                    s.push(b[i + 1]);
                    i += 2;
                    continue;
                }
                if c == '(' {
                    depth += 1;
                    if depth == 1 {
                        i += 1;
                        continue;
                    }
                }
                if c == ')' {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
                s.push(c);
                i += 1;
            }
            out.push((start, unescape_pdf(&s)));
        }
        i += 1;
    }
    out
}

/// What the reader finds in a PDF.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PdfRead {
    pub pages: Vec<String>,
    pub bookmarks: Vec<Bookmark>,
    pub labels: Vec<LabelRange>,
    pub pdfa: Option<(u8, String)>,
    pub role: Option<String>,
    pub encrypted: bool,
    pub has_id: bool,
    pub output_intent: bool,
}

fn xmp_attr(text: &str, key: &str) -> Option<String> {
    let pat = format!("{key}=\"");
    let at = text.find(&pat)? + pat.len();
    let len = text[at..].find('"')?;
    Some(text[at..at + len].to_string()).filter(|v| !v.is_empty())
}

pub fn read(bytes: &[u8]) -> Result<PdfRead, crate::DocError> {
    if !bytes.starts_with(b"%PDF-") {
        return Err(crate::DocError::Pdf("not a PDF".into()));
    }
    let objs = objects(bytes);
    let catalog = objs
        .values()
        .find(|b| b.contains("/Type /Catalog"))
        .ok_or_else(|| crate::DocError::Pdf("no catalog".into()))?;
    let pages_obj = refs_after(catalog, "/Pages")
        .first()
        .and_then(|n| objs.get(n))
        .ok_or_else(|| crate::DocError::Pdf("no page tree".into()))?;
    let kids = refs_after(pages_obj, "/Kids");
    let mut pages = Vec::new();
    for k in &kids {
        let page = objs.get(k).map(String::as_str).unwrap_or_default();
        let content = refs_after(page, "/Contents")
            .first()
            .and_then(|n| objs.get(n))
            .cloned()
            .unwrap_or_default();
        let lines: Vec<String> = strings_in(&content).into_iter().map(|(_, s)| s).collect();
        pages.push(lines.join("\n"));
    }
    let mut bookmarks = Vec::new();
    if let Some(root) = refs_after(catalog, "/Outlines")
        .first()
        .and_then(|n| objs.get(n))
    {
        let mut next = refs_after(root, "/First").first().copied();
        while let Some(n) = next {
            let Some(item) = objs.get(&n) else { break };
            let title = strings_in(item)
                .into_iter()
                .next()
                .map(|(_, s)| s)
                .unwrap_or_default();
            let page = refs_after(item, "/Dest")
                .first()
                .and_then(|p| kids.iter().position(|k| k == p))
                .unwrap_or(0);
            bookmarks.push(Bookmark { title, page });
            next = refs_after(item, "/Next").first().copied();
        }
    }
    let mut labels = Vec::new();
    if let Some(at) = catalog.find("/Nums [") {
        let rest = &catalog[at + 7..];
        let mut cursor = 0;
        while let Some(open) = rest[cursor..].find("<<") {
            let open = cursor + open;
            let close = rest[open..].find(">>").map_or(rest.len(), |n| open + n);
            let start: usize = rest[cursor..open].trim().parse().unwrap_or(0);
            let dict = &rest[open..close];
            let style = dict
                .split("/S /")
                .nth(1)
                .map(|s| s.chars().take_while(|c| c.is_alphabetic()).collect())
                .unwrap_or_default();
            let prefix = strings_in(dict)
                .into_iter()
                .next()
                .map(|(_, s)| s)
                .unwrap_or_default();
            labels.push(LabelRange {
                start,
                prefix,
                style,
            });
            cursor = close + 2;
            if rest[cursor..].trim_start().starts_with(']') {
                break;
            }
        }
    }
    let meta = objs
        .values()
        .find(|b| b.contains("/Type /Metadata"))
        .cloned()
        .unwrap_or_default();
    let pdfa = match (
        xmp_attr(&meta, "pdfaid:part").and_then(|p| p.parse().ok()),
        xmp_attr(&meta, "pdfaid:conformance"),
    ) {
        (Some(p), Some(c)) => Some((p, c)),
        _ => None,
    };
    let text = String::from_utf8_lossy(bytes);
    let trailer = text.rsplit("trailer").next().unwrap_or_default();
    Ok(PdfRead {
        pages,
        bookmarks,
        labels,
        pdfa,
        role: xmp_attr(&meta, "oa:role"),
        encrypted: trailer.contains("/Encrypt"),
        has_id: trailer.contains("/ID"),
        output_intent: catalog.contains("/OutputIntents"),
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Check {
    pub name: String,
    /// `pass`, `fail` or `not_checked`.
    pub outcome: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Validation {
    /// Never `veraPDF` until veraPDF runs (Q). Shown as is.
    pub validator: String,
    pub part: u8,
    pub conformance: String,
    pub checks: Vec<Check>,
    pub passed: bool,
}

pub const PREFLIGHT: &str = "oa-pdfa-preflight (stub; veraPDF not vendored)";

/// The PDF/A structural preflight at a configured part and level.
pub fn preflight(bytes: &[u8], part: u8, conformance: &str) -> Validation {
    let mut checks = Vec::new();
    let mut check = |name: &str, ok: bool, detail: String| {
        checks.push(Check {
            name: name.into(),
            outcome: if ok { "pass" } else { "fail" }.into(),
            detail,
        })
    };
    match read(bytes) {
        Err(e) => check("parse", false, e.to_string()),
        Ok(r) => {
            check("parse", true, format!("{} pages", r.pages.len()));
            check(
                "identification",
                r.pdfa == Some((part, conformance.to_string())),
                format!("XMP declares {:?}, configured {part}{conformance}", r.pdfa),
            );
            check(
                "output_intent",
                r.output_intent,
                "catalog /OutputIntents".into(),
            );
            check(
                "not_encrypted",
                !r.encrypted,
                "no /Encrypt in the trailer".into(),
            );
            check("file_id", r.has_id, "trailer /ID".into());
            check(
                "no_javascript",
                !String::from_utf8_lossy(bytes).contains("/JavaScript"),
                "no /JavaScript actions".into(),
            );
        }
    }
    for (name, detail) in [
        ("fonts_embedded", "font embedding needs veraPDF (Q)"),
        (
            "icc_profile",
            "the output intent's ICC profile needs veraPDF (Q)",
        ),
    ] {
        checks.push(Check {
            name: name.into(),
            outcome: "not_checked".into(),
            detail: detail.into(),
        });
    }
    let passed = checks.iter().all(|c| c.outcome != "fail");
    Validation {
        validator: PREFLIGHT.into(),
        part,
        conformance: conformance.into(),
        checks,
        passed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_written_pdf_reads_back_with_text_bookmarks_and_labels() {
        let doc = PdfDoc {
            pages: vec![
                PdfPage {
                    lines: vec!["INDEX".into(), "a (b) c\\d".into()],
                },
                PdfPage {
                    lines: vec!["Body".into()],
                },
            ],
            bookmarks: vec![
                Bookmark {
                    title: "Index".into(),
                    page: 0,
                },
                Bookmark {
                    title: "Petition".into(),
                    page: 1,
                },
            ],
            labels: vec![
                LabelRange {
                    start: 0,
                    prefix: String::new(),
                    style: "r".into(),
                },
                LabelRange {
                    start: 1,
                    prefix: "P-".into(),
                    style: "D".into(),
                },
            ],
            pdfa: Some((2, "B".into())),
            role: Some("filing".into()),
        };
        let r = read(&doc.write()).unwrap();
        assert_eq!(
            r.pages,
            vec!["INDEX\na (b) c\\d".to_string(), "Body".into()]
        );
        assert_eq!(r.bookmarks, doc.bookmarks);
        assert_eq!(r.labels, doc.labels);
        assert_eq!(r.role.as_deref(), Some("filing"));
        assert!(preflight(&doc.write(), 2, "B").passed);
        assert!(!preflight(&doc.write(), 3, "U").passed);
    }
}

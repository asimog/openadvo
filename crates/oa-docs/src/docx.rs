//! The headless DOCX engine. This is the stand-in for WordCraft's vendored
//! document engine (X-04, H-02): the one reader and editor of drafts. It runs
//! inside the `wordcraft` executable and is reached across a process boundary
//! by the kernel (see `engine`).
//!
//! It edits `word/document.xml` at the byte level: only the touched
//! paragraph's bytes change, and every other part of the package keeps its raw
//! bytes (J rules 15 and 16).

use std::collections::{BTreeMap, BTreeSet};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::zip::{self, Entry};
use crate::DocError;

pub const DOCUMENT: &str = "word/document.xml";
pub const FOOTNOTES: &str = "word/footnotes.xml";
pub const SOURCES: &str = "customXml/item1.xml";
pub const SOURCES_NS: &str = "urn:openadvocate:sources";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum BlockKind {
    Paragraph,
    Table,
    Row,
    Cell,
    Footnote,
}

/// The ids each generated sentence came from (J rule 6).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Sources {
    #[serde(default)]
    pub events: Vec<String>,
    #[serde(default)]
    pub facts: Vec<String>,
    #[serde(default)]
    pub authorities: Vec<String>,
}

impl Sources {
    pub fn is_empty(&self) -> bool {
        self.events.is_empty() && self.facts.is_empty() && self.authorities.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Block {
    pub id: String,
    pub kind: BlockKind,
    pub style: Option<String>,
    pub text: String,
    /// The enclosing block, for a row, cell or a paragraph inside a cell.
    pub parent: Option<String>,
    /// The sha256 of the block's XML, so a change is visible without the text.
    pub xml_hash: String,
    #[serde(default, skip_serializing_if = "Sources::is_empty")]
    pub sources: Sources,
}

#[derive(Debug, Clone)]
struct Span {
    kind: BlockKind,
    id: Option<String>,
    start: usize,
    end: usize,
    parent: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct IdChange {
    pub old: Option<String>,
    pub new: String,
    pub reason: String,
}

/// A DOCX package open in the engine.
#[derive(Debug, Clone)]
pub struct Docx {
    entries: Vec<Entry>,
    doc: usize,
    xml: String,
    dirty: bool,
}

pub fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn unescape(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("sha256:{}", hex::encode(Sha256::digest(bytes)))
}

#[derive(Debug, Clone)]
struct Tag {
    name: String,
    start: usize,
    end: usize,
    closing: bool,
    empty: bool,
}

/// Every element tag in order, skipping declarations and comments.
fn tags(xml: &str) -> Vec<Tag> {
    let b = xml.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] != b'<' {
            i += 1;
            continue;
        }
        if xml[i..].starts_with("<!--") {
            i = xml[i..].find("-->").map_or(b.len(), |n| i + n + 3);
            continue;
        }
        if xml[i..].starts_with("<?") || xml[i..].starts_with("<!") {
            i = xml[i..].find('>').map_or(b.len(), |n| i + n + 1);
            continue;
        }
        let start = i;
        let mut j = i + 1;
        let mut quote = None;
        while j < b.len() {
            match (quote, b[j]) {
                (None, b'"') | (None, b'\'') => quote = Some(b[j]),
                (Some(q), c) if c == q => quote = None,
                (None, b'>') => break,
                _ => {}
            }
            j += 1;
        }
        let end = (j + 1).min(b.len());
        let inner = &xml[start + 1..end.saturating_sub(1)];
        let closing = inner.starts_with('/');
        let empty = inner.ends_with('/');
        let name: String = inner
            .trim_start_matches('/')
            .chars()
            .take_while(|c| !c.is_whitespace() && *c != '/' && *c != '>')
            .collect();
        out.push(Tag {
            name,
            start,
            end,
            closing,
            empty,
        });
        i = end;
    }
    out
}

fn attr(tag: &str, name: &str) -> Option<String> {
    let pat = format!(" {name}=\"");
    let at = tag.find(&pat)? + pat.len();
    let len = tag[at..].find('"')?;
    Some(unescape(&tag[at..at + len]))
}

fn set_attr(tag: &str, name: &str, value: &str) -> String {
    let pat = format!(" {name}=\"");
    if let Some(at) = tag.find(&pat) {
        let at = at + pat.len();
        let len = tag[at..].find('"').unwrap_or(0);
        format!("{}{}{}", &tag[..at], escape(value), &tag[at + len..])
    } else {
        let cut = if tag.ends_with("/>") {
            tag.len() - 2
        } else {
            tag.len() - 1
        };
        format!(
            "{} {name}=\"{}\"{}",
            &tag[..cut],
            escape(value),
            &tag[cut..]
        )
    }
}

/// The visible text of a paragraph's XML: runs' `w:t`, tabs and breaks.
/// Text deleted under tracked changes (`w:delText`) is not shown.
pub fn paragraph_text(xml: &str) -> String {
    let mut out = String::new();
    let ts = tags(xml);
    for (k, t) in ts.iter().enumerate() {
        if t.closing {
            continue;
        }
        match t.name.as_str() {
            "w:t" if !t.empty => {
                if let Some(close) = ts[k + 1..].iter().find(|c| c.closing && c.name == "w:t") {
                    out.push_str(&unescape(&xml[t.end..close.start]));
                }
            }
            "w:tab" => out.push('\t'),
            "w:br" => out.push('\n'),
            _ => {}
        }
    }
    out
}

fn style_of(xml: &str) -> Option<String> {
    let at = xml.find("<w:pStyle ")?;
    let end = xml[at..].find('>')? + at;
    attr(&xml[at..=end], "w:val")
}

fn spans(xml: &str) -> Vec<Span> {
    let mut out: Vec<Span> = Vec::new();
    let mut stack: Vec<(String, usize, Option<usize>)> = Vec::new();
    let mut open_blocks: Vec<usize> = Vec::new();
    for t in tags(xml) {
        let kind = match t.name.as_str() {
            "w:p" => Some(BlockKind::Paragraph),
            "w:tbl" => Some(BlockKind::Table),
            "w:tr" => Some(BlockKind::Row),
            "w:tc" => Some(BlockKind::Cell),
            "w:footnote" => Some(BlockKind::Footnote),
            _ => None,
        };
        let Some(kind) = kind else { continue };
        if t.closing {
            if let Some(pos) = stack.iter().rposition(|(n, _, _)| *n == t.name) {
                let (_, start, idx) = stack.remove(pos);
                if let Some(i) = idx {
                    out[i].end = t.end;
                    open_blocks.retain(|b| *b != i);
                }
                let _ = start;
            }
            continue;
        }
        let tag_text = &xml[t.start..t.end];
        let id = match kind {
            BlockKind::Paragraph | BlockKind::Row => attr(tag_text, "w14:paraId"),
            BlockKind::Footnote => attr(tag_text, "w:id").map(|n| format!("fn:{n}")),
            _ => None,
        };
        let parent = open_blocks.last().copied();
        out.push(Span {
            kind,
            id,
            start: t.start,
            end: t.end,
            parent,
        });
        let idx = out.len() - 1;
        if !t.empty {
            stack.push((t.name.clone(), t.start, Some(idx)));
            open_blocks.push(idx);
        }
    }
    // Tables and cells have no id in WordprocessingML; they take one from
    // their first row and their position in it, which survive edits.
    for i in 0..out.len() {
        if out[i].id.is_some() {
            continue;
        }
        match out[i].kind {
            BlockKind::Table => {
                let first_row = out
                    .iter()
                    .find(|s| s.kind == BlockKind::Row && s.parent == Some(i))
                    .and_then(|s| s.id.clone());
                out[i].id = first_row.map(|r| format!("tbl:{r}"));
            }
            BlockKind::Cell => {
                if let Some(row) = out[i].parent {
                    let n = out
                        .iter()
                        .enumerate()
                        .filter(|(k, s)| {
                            s.kind == BlockKind::Cell && s.parent == Some(row) && *k < i
                        })
                        .count();
                    out[i].id = out[row].id.clone().map(|r| format!("{r}:c{n}"));
                }
            }
            _ => {}
        }
    }
    out
}

/// A fresh paragraph id: eight hex digits below 0x80000000, as Word requires.
fn fresh_id(taken: &BTreeSet<String>, seed: &str) -> String {
    let mut n = 0u32;
    loop {
        let h = Sha256::digest(format!("{seed}/{n}").as_bytes());
        let v = u32::from_be_bytes([h[0], h[1], h[2], h[3]]) & 0x7fff_ffff;
        let id = format!("{v:08X}");
        if !taken.contains(&id) && v != 0 {
            return id;
        }
        n += 1;
    }
}

impl Docx {
    pub fn open(bytes: &[u8]) -> Result<Self, DocError> {
        let entries = zip::read(bytes)?;
        let doc = entries
            .iter()
            .position(|e| e.name == DOCUMENT)
            .ok_or_else(|| DocError::Package(format!("no {DOCUMENT} in the package")))?;
        let xml = String::from_utf8(entries[doc].data()?)
            .map_err(|_| DocError::Package(format!("{DOCUMENT} is not UTF-8")))?;
        Ok(Docx {
            entries,
            doc,
            xml,
            dirty: false,
        })
    }

    pub fn save(&self) -> Vec<u8> {
        if !self.dirty {
            return zip::write(&self.entries);
        }
        let mut entries = self.entries.clone();
        entries[self.doc] = Entry::deflated(DOCUMENT, self.xml.as_bytes());
        zip::write(&entries)
    }

    pub fn document_xml(&self) -> &str {
        &self.xml
    }

    /// The raw archive bytes of every part except `document.xml`.
    pub fn other_parts(&self) -> BTreeMap<String, Vec<u8>> {
        self.entries
            .iter()
            .enumerate()
            .filter(|(i, _)| *i != self.doc)
            .map(|(_, e)| (e.name.clone(), e.raw.clone()))
            .collect()
    }

    fn part(&self, name: &str) -> Option<String> {
        self.entries
            .iter()
            .find(|e| e.name == name)
            .and_then(|e| e.data().ok())
            .and_then(|d| String::from_utf8(d).ok())
    }

    /// The sources part keyed by paragraph id (J rule 6).
    pub fn sources(&self) -> BTreeMap<String, Sources> {
        let mut out = BTreeMap::new();
        let Some(xml) = self.part(SOURCES) else {
            return out;
        };
        let list = |t: &str, k: &str| -> Vec<String> {
            attr(t, k)
                .map(|v| v.split_whitespace().map(str::to_string).collect())
                .unwrap_or_default()
        };
        for t in tags(&xml).iter().filter(|t| !t.closing && t.name == "oa:p") {
            let tag = &xml[t.start..t.end];
            if let Some(id) = attr(tag, "id") {
                out.insert(
                    id,
                    Sources {
                        events: list(tag, "events"),
                        facts: list(tag, "facts"),
                        authorities: list(tag, "authorities"),
                    },
                );
            }
        }
        out
    }

    fn block_of(
        &self,
        xml: &str,
        spans: &[Span],
        s: &Span,
        src: &BTreeMap<String, Sources>,
    ) -> Block {
        let text = &xml[s.start..s.end];
        let id = s.id.clone().unwrap_or_default();
        Block {
            text: match s.kind {
                BlockKind::Paragraph => paragraph_text(text),
                _ => spans
                    .iter()
                    .filter(|p| {
                        p.kind == BlockKind::Paragraph && p.start >= s.start && p.end <= s.end
                    })
                    .map(|p| paragraph_text(&xml[p.start..p.end]))
                    .collect::<Vec<_>>()
                    .join("\n"),
            },
            style: (s.kind == BlockKind::Paragraph)
                .then(|| style_of(text))
                .flatten(),
            parent: s.parent.and_then(|p| spans[p].id.clone()),
            xml_hash: sha256_hex(text.as_bytes()),
            sources: src.get(&id).cloned().unwrap_or_default(),
            id,
            kind: s.kind,
        }
    }

    /// Every body paragraph in order, including paragraphs inside table cells.
    pub fn paragraphs(&self) -> Vec<Block> {
        let src = self.sources();
        let sp = spans(&self.xml);
        sp.iter()
            .filter(|s| s.kind == BlockKind::Paragraph)
            .map(|s| self.block_of(&self.xml, &sp, s, &src))
            .collect()
    }

    /// Every block with a stable id: paragraphs, tables, rows, cells and
    /// footnotes (J rule 15).
    pub fn blocks(&self) -> Vec<Block> {
        let src = self.sources();
        let sp = spans(&self.xml);
        let mut out: Vec<Block> = sp
            .iter()
            .map(|s| self.block_of(&self.xml, &sp, s, &src))
            .collect();
        if let Some(fx) = self.part(FOOTNOTES) {
            let fsp = spans(&fx);
            out.extend(
                fsp.iter()
                    .filter(|s| s.kind == BlockKind::Footnote)
                    .map(|s| self.block_of(&fx, &fsp, s, &src)),
            );
        }
        out
    }

    fn para_span(&self, id: &str) -> Result<Span, DocError> {
        spans(&self.xml)
            .into_iter()
            .find(|s| s.kind == BlockKind::Paragraph && s.id.as_deref() == Some(id))
            .ok_or_else(|| DocError::NoParagraph(id.to_string()))
    }

    pub fn paragraph_xml(&self, id: &str) -> Result<String, DocError> {
        let s = self.para_span(id)?;
        Ok(self.xml[s.start..s.end].to_string())
    }

    fn splice(&mut self, start: usize, end: usize, with: &str) {
        self.xml.replace_range(start..end, with);
        self.dirty = true;
    }

    pub fn set_paragraph_xml(&mut self, id: &str, xml: &str) -> Result<(), DocError> {
        let s = self.para_span(id)?;
        self.splice(s.start, s.end, xml);
        Ok(())
    }

    /// Replaces a paragraph's text and keeps its id, its paragraph properties
    /// and its first run's properties.
    pub fn replace_paragraph(&mut self, id: &str, text: &str) -> Result<(), DocError> {
        let old = self.paragraph_xml(id)?;
        let xml = rebuild_paragraph(&old, text);
        self.set_paragraph_xml(id, &xml)
    }

    fn taken(&self) -> BTreeSet<String> {
        spans(&self.xml).into_iter().filter_map(|s| s.id).collect()
    }

    /// A new paragraph after `after`, with the same properties and a new id.
    pub fn insert_after(&mut self, after: &str, text: &str) -> Result<String, DocError> {
        let s = self.para_span(after)?;
        let old = self.xml[s.start..s.end].to_string();
        let id = fresh_id(&self.taken(), &format!("{after}/{text}"));
        let xml = with_para_id(&rebuild_paragraph(&old, text), &id);
        self.splice(s.end, s.end, &xml);
        Ok(id)
    }

    /// Raw paragraph XML after `after`, as a paste brings it in, ids and all.
    pub fn append_raw_after(&mut self, after: &str, xml: &str) -> Result<(), DocError> {
        let s = self.para_span(after)?;
        self.splice(s.end, s.end, xml);
        Ok(())
    }

    pub fn delete_paragraph(&mut self, id: &str) -> Result<(), DocError> {
        let s = self.para_span(id)?;
        self.splice(s.start, s.end, "");
        Ok(())
    }

    /// Splits a paragraph at a character offset. The first half keeps the id,
    /// the second half gets a new one (J edge case: a split paragraph).
    pub fn split_paragraph(&mut self, id: &str, at: usize) -> Result<IdChange, DocError> {
        let old = self.paragraph_xml(id)?;
        let text = paragraph_text(&old);
        let cut = text.char_indices().nth(at).map_or(text.len(), |(i, _)| i);
        let (a, b) = text.split_at(cut);
        self.replace_paragraph(id, a)?;
        let new = self.insert_after(id, b)?;
        Ok(IdChange {
            old: Some(id.to_string()),
            new,
            reason: "split".into(),
        })
    }

    /// Re-issues duplicate paragraph ids and gives missing ones an id, for
    /// text pasted from another document (J edge case). The mapping is
    /// returned so the import can record it.
    pub fn normalise_ids(&mut self) -> Vec<IdChange> {
        let mut changes = Vec::new();
        loop {
            let sp = spans(&self.xml);
            let mut taken: BTreeSet<String> = sp.iter().filter_map(|s| s.id.clone()).collect();
            let bad = sp.iter().find(|s| {
                matches!(s.kind, BlockKind::Paragraph | BlockKind::Row) && s.id.is_none()
            });
            let dup = sp
                .iter()
                .enumerate()
                .find(|(i, s)| {
                    matches!(s.kind, BlockKind::Paragraph | BlockKind::Row)
                        && s.id.is_some()
                        && sp[..*i].iter().any(|p| p.id == s.id)
                })
                .map(|(_, s)| s.clone());
            let Some(s) = bad.cloned().or(dup) else { break };
            let tag_end = self.xml[s.start..]
                .find('>')
                .map_or(s.end, |n| s.start + n + 1);
            let tag = self.xml[s.start..tag_end].to_string();
            let new = fresh_id(&taken, &format!("{}/{}", s.start, tag));
            taken.insert(new.clone());
            changes.push(IdChange {
                old: s.id.clone(),
                new: new.clone(),
                reason: if s.id.is_some() {
                    "duplicate".into()
                } else {
                    "missing".into()
                },
            });
            let fixed = set_attr(&tag, "w14:paraId", &new);
            self.splice(s.start, tag_end, &fixed);
        }
        changes
    }

    /// Applies the paragraph changes that turn `from` into `to` onto this
    /// document. A paragraph changed here since `from` is a conflict, never a
    /// silent merge (L-09). Used for revert (from the edit to its parent) and
    /// for re-basing a WordCraft save onto a moved head.
    pub fn apply_changes(&mut self, from: &Docx, to: &Docx) -> Result<Vec<String>, DocError> {
        let para_map = |d: &Docx| -> BTreeMap<String, String> {
            spans(&d.xml)
                .into_iter()
                .filter(|s| s.kind == BlockKind::Paragraph)
                .filter_map(|s| s.id.map(|id| (id, d.xml[s.start..s.end].to_string())))
                .collect()
        };
        let (a, b, here) = (para_map(from), para_map(to), para_map(self));
        let mut conflicts = Vec::new();
        let mut changed = Vec::new();
        for (id, old) in &a {
            match (b.get(id), here.get(id)) {
                (Some(new), Some(cur)) if new != old => {
                    if cur == old || cur == new {
                        changed.push(id.clone());
                    } else {
                        conflicts.push(id.clone());
                    }
                }
                (None, Some(cur)) if cur != old => conflicts.push(id.clone()),
                (None, Some(_)) => changed.push(id.clone()),
                (Some(new), None) if new != old => conflicts.push(id.clone()),
                _ => {}
            }
        }
        let added: Vec<String> = to
            .paragraphs()
            .into_iter()
            .map(|p| p.id)
            .filter(|id| !a.contains_key(id))
            .collect();
        for id in &added {
            if here.get(id).is_some_and(|cur| Some(cur) != b.get(id)) {
                conflicts.push(id.clone());
            }
        }
        if !conflicts.is_empty() {
            return Err(DocError::Conflict(conflicts));
        }
        for id in &changed {
            match b.get(id) {
                Some(new) => self.set_paragraph_xml(id, new)?,
                None => self.delete_paragraph(id)?,
            }
        }
        let order: Vec<String> = to.paragraphs().into_iter().map(|p| p.id).collect();
        for id in added.iter().filter(|id| !here.contains_key(*id)) {
            let pos = order.iter().position(|o| o == id).unwrap_or(0);
            let prev = order[..pos]
                .iter()
                .rev()
                .find(|p| self.para_span(p).is_ok())
                .cloned();
            let xml = b[id].clone();
            match prev {
                Some(p) => {
                    let s = self.para_span(&p)?;
                    self.splice(s.end, s.end, &xml);
                }
                None => {
                    let at = self
                        .xml
                        .find("<w:body>")
                        .map_or(0, |n| n + "<w:body>".len());
                    self.splice(at, at, &xml);
                }
            }
            changed.push(id.clone());
        }
        Ok(changed)
    }
}

fn with_para_id(xml: &str, id: &str) -> String {
    let end = xml.find('>').map_or(xml.len(), |n| n + 1);
    format!("{}{}", set_attr(&xml[..end], "w14:paraId", id), &xml[end..])
}

/// The paragraph's start tag and properties, with one run holding `text`.
fn rebuild_paragraph(old: &str, text: &str) -> String {
    let ts = tags(old);
    let Some(open) = ts.first() else {
        return old.to_string();
    };
    let mut start = old[open.start..open.end].to_string();
    if open.empty {
        start = format!("{}>", start.trim_end_matches("/>").trim_end());
    }
    let block = |name: &str| -> Option<String> {
        let o = ts.iter().find(|t| !t.closing && t.name == name)?;
        if o.empty {
            return Some(old[o.start..o.end].to_string());
        }
        let c = ts
            .iter()
            .find(|t| t.closing && t.name == name && t.start > o.start)?;
        Some(old[o.start..c.end].to_string())
    };
    let ppr = block("w:pPr").unwrap_or_default();
    let rpr = block("w:rPr")
        .filter(|r| !ppr.contains(r.as_str()))
        .unwrap_or_default();
    let runs: String = text
        .split('\n')
        .enumerate()
        .map(|(i, line)| {
            let br = if i > 0 { "<w:br/>" } else { "" };
            format!(
                "<w:r>{rpr}{br}<w:t xml:space=\"preserve\">{}</w:t></w:r>",
                escape(line)
            )
        })
        .collect();
    format!("{start}{ppr}{runs}</w:p>")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::writer::{DocBuilder, Para};

    fn sample() -> Vec<u8> {
        let mut b = DocBuilder::new();
        b.push(Para::styled("Heading1", "SYNOPSIS"));
        b.push(Para::plain("First paragraph."));
        b.push(Para::plain("Second & last."));
        b.build()
    }

    #[test]
    fn paragraphs_carry_ids_styles_and_text() {
        let d = Docx::open(&sample()).unwrap();
        let p = d.paragraphs();
        assert_eq!(p.len(), 3);
        assert_eq!(p[0].style.as_deref(), Some("Heading1"));
        assert_eq!(p[2].text, "Second & last.");
        assert!(p.iter().all(|x| x.id.len() == 8));
    }

    #[test]
    fn split_keeps_the_first_id_and_normalise_reissues_duplicates() {
        let mut d = Docx::open(&sample()).unwrap();
        let id = d.paragraphs()[1].id.clone();
        let ch = d.split_paragraph(&id, 5).unwrap();
        let p = d.paragraphs();
        assert_eq!(p[1].id, id);
        assert_eq!(p[1].text, "First");
        assert_eq!(p[2].id, ch.new);
        assert_eq!(p[2].text, " paragraph.");
        // Paste a copy of paragraph 1 with its id: the engine re-issues it.
        let dup = d.paragraph_xml(&id).unwrap();
        d.append_raw_after(&ch.new, &dup).unwrap();
        let changes = d.normalise_ids();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].old.as_deref(), Some(id.as_str()));
        let ids: BTreeSet<String> = d.paragraphs().into_iter().map(|p| p.id).collect();
        assert_eq!(ids.len(), d.paragraphs().len());
    }
}

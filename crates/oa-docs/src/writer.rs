//! The first-revision writer (J04). It writes a generated draft and nothing
//! else; reading and editing go through the DOCX engine (X-04).
//!
//! Stand-in for `docx-rs`, which is not vendored yet: the package it writes is
//! minimal WordprocessingML with a `w14:paraId` on every paragraph and the
//! sources part keyed by paragraph id (J rule 6).

use std::collections::BTreeSet;

use crate::docx::{escape, Sources, SOURCES, SOURCES_NS};
use crate::zip::{self, Entry};

#[derive(Debug, Clone, Default)]
pub struct Para {
    pub style: Option<String>,
    pub text: String,
    pub sources: Sources,
}

impl Para {
    pub fn plain(text: &str) -> Self {
        Para {
            text: text.to_string(),
            ..Para::default()
        }
    }

    pub fn styled(style: &str, text: &str) -> Self {
        Para {
            style: Some(style.to_string()),
            text: text.to_string(),
            ..Para::default()
        }
    }

    pub fn sourced(text: &str, sources: Sources) -> Self {
        Para {
            text: text.to_string(),
            sources,
            ..Para::default()
        }
    }
}

#[derive(Debug, Default)]
pub struct DocBuilder {
    paras: Vec<Para>,
}

const W: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const W14: &str = "http://schemas.microsoft.com/office/word/2010/wordml";
const MC: &str = "http://schemas.openxmlformats.org/markup-compatibility/2006";

/// Paragraph ids are given at generation, in order, and never reused (J rule 1).
pub fn para_id(n: usize) -> String {
    format!("{:08X}", 0x1000_0000u32 + n as u32)
}

impl DocBuilder {
    pub fn new() -> Self {
        DocBuilder::default()
    }

    pub fn push(&mut self, p: Para) -> String {
        self.paras.push(p);
        para_id(self.paras.len())
    }

    pub fn build(&self) -> Vec<u8> {
        let mut body = String::new();
        let mut sources = String::new();
        let mut ids = BTreeSet::new();
        for (i, p) in self.paras.iter().enumerate() {
            let id = para_id(i + 1);
            ids.insert(id.clone());
            let ppr = p
                .style
                .as_ref()
                .map(|s| format!("<w:pPr><w:pStyle w:val=\"{}\"/></w:pPr>", escape(s)))
                .unwrap_or_default();
            body.push_str(&format!(
                "<w:p w14:paraId=\"{id}\" w14:textId=\"77777777\">{ppr}<w:r><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>",
                escape(&p.text)
            ));
            if !p.sources.is_empty() {
                sources.push_str(&format!(
                    "<oa:p id=\"{id}\" events=\"{}\" facts=\"{}\" authorities=\"{}\"/>",
                    escape(&p.sources.events.join(" ")),
                    escape(&p.sources.facts.join(" ")),
                    escape(&p.sources.authorities.join(" ")),
                ));
            }
        }
        let document = format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w:document xmlns:w=\"{W}\" xmlns:w14=\"{W14}\" xmlns:mc=\"{MC}\" mc:Ignorable=\"w14\"><w:body>{body}<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/></w:sectPr></w:body></w:document>"
        );
        let types = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>";
        let rels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>";
        let doc_rels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId9\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml\" Target=\"../customXml/item1.xml\"/></Relationships>";
        let custom = format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<oa:sources xmlns:oa=\"{SOURCES_NS}\">{sources}</oa:sources>"
        );
        zip::write(&[
            Entry::deflated("[Content_Types].xml", types.as_bytes()),
            Entry::deflated("_rels/.rels", rels.as_bytes()),
            Entry::deflated("word/document.xml", document.as_bytes()),
            Entry::deflated("word/_rels/document.xml.rels", doc_rels.as_bytes()),
            Entry::deflated(SOURCES, custom.as_bytes()),
        ])
    }
}

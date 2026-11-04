//! Spec J criteria that live in the engine, the generators and the filing
//! assembly. The `wordcraft` and `pdfcraft` stubs run as real processes.

use std::path::{Path, PathBuf};
use std::process::Command;

use oa_docs::docx::{Block, Docx};
use oa_docs::engine::{DocxEngine, ProcessEngine};
use oa_docs::fidelity::{compare, Rendering};
use oa_docs::filing::{assemble, page_number, AnnexureInput};
use oa_docs::generate::{display_date, notebook_date, template, LodEvent};
use oa_docs::host::{Host, HostEvent, HostMode, Rect};
use oa_docs::pdf::{self, PdfPage};
use oa_docs::zip::{self, Entry};

fn wordcraft() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_wordcraft"))
}

fn pdfcraft() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_pdfcraft"))
}

fn engine() -> Box<dyn DocxEngine> {
    Box::new(ProcessEngine::new(wordcraft()))
}

fn events() -> Vec<LodEvent> {
    vec![
        LodEvent {
            id: "01EVENTA".into(),
            date: "2018-04-02".into(),
            description: "Writ petition filed in the High Court".into(),
        },
        LodEvent {
            id: "01EVENTB".into(),
            date: "2019-03-07".into(),
            description: "Interim order granting stay".into(),
        },
        LodEvent {
            id: "01EVENTC".into(),
            date: "2023-11".into(),
            description: "Impugned judgment dismissing the writ petition".into(),
        },
    ]
}

fn slp() -> Vec<u8> {
    template("slp", "Rao v. State of Karnataka", &events()).unwrap()
}

fn edit(working: &Path, ops: serde_json::Value) -> i32 {
    let script = working.with_extension("ops.json");
    std::fs::write(&script, ops.to_string()).unwrap();
    Command::new(wordcraft())
        .arg("--edit")
        .arg(working)
        .arg("--script")
        .arg(&script)
        .status()
        .unwrap()
        .code()
        .unwrap_or(-1)
}

fn ids(blocks: &[Block]) -> Vec<String> {
    blocks.iter().map(|b| b.id.clone()).collect()
}

#[test]
fn j_ac_01_every_generated_paragraph_id_survives_an_edit_of_another_paragraph_in_wordcraft() {
    let dir = tempfile::tempdir().unwrap();
    let working = dir.path().join("working.docx");
    std::fs::write(&working, slp()).unwrap();
    let before = engine().paragraphs(&slp()).unwrap();
    let target = before[8].id.clone();
    let code = edit(
        &working,
        serde_json::json!([
            { "op": "replace", "para": target, "text": "Edited in WordCraft." },
            { "op": "save" }
        ]),
    );
    assert_eq!(code, 0);
    let after = engine()
        .paragraphs(&std::fs::read(&working).unwrap())
        .unwrap();
    assert_eq!(ids(&before), ids(&after));
    assert_eq!(after[8].text, "Edited in WordCraft.");
    for (a, b) in before.iter().zip(&after) {
        if a.id != target {
            assert_eq!(a.xml_hash, b.xml_hash, "paragraph {} changed", a.id);
        }
    }
}

#[test]
fn j_ac_02_the_headless_engine_replaces_one_paragraph_and_leaves_the_rest_byte_identical() {
    let original = slp();
    let before = Docx::open(&original).unwrap();
    let target = before.paragraphs()[6].id.clone();
    let old = before.paragraph_xml(&target).unwrap();
    let edited = engine()
        .replace(
            &original,
            &target,
            "07.03.2019: Interim order granting stay of demolition",
        )
        .unwrap();
    let after = Docx::open(&edited.docx).unwrap();
    let new = after.paragraph_xml(&target).unwrap();
    assert_ne!(old, new);
    let (a, b) = (before.document_xml(), after.document_xml());
    let cut_a = a.find(&old).unwrap();
    let cut_b = b.find(&new).unwrap();
    assert_eq!(a[..cut_a], b[..cut_b], "bytes before the paragraph changed");
    assert_eq!(
        a[cut_a + old.len()..],
        b[cut_b + new.len()..],
        "bytes after the paragraph changed"
    );
    assert_eq!(before.other_parts(), after.other_parts());
}

#[test]
fn j_ac_07_wordcraft_writing_under_a_drafts_folder_is_refused_by_the_boundary() {
    let dir = tempfile::tempdir().unwrap();
    let work = dir.path().join("app").join("wordcraft").join("session");
    std::fs::create_dir_all(&work).unwrap();
    let working = work.join("working.docx");
    std::fs::write(&working, slp()).unwrap();
    let target = dir
        .path()
        .join("root")
        .join("Rao")
        .join("drafts")
        .join("01DRAFT")
        .join("sneaky.docx");
    std::fs::create_dir_all(target.parent().unwrap()).unwrap();
    let code = edit(
        &working,
        serde_json::json!([{ "op": "write_to", "path": target }]),
    );
    assert_eq!(code, 3, "the write must be refused");
    assert!(!target.exists());
    // Outside its working folder is refused too; inside is allowed.
    assert!(oa_docs::boundary::editor_write(&work, &dir.path().join("x.docx")).is_err());
    assert!(oa_docs::boundary::editor_write(&work, &work.join("x.docx")).is_ok());
}

#[test]
fn j_ac_08_every_list_of_dates_sentence_carries_an_event_id_and_its_date() {
    let paras = engine().paragraphs(&slp()).unwrap();
    let start = paras
        .iter()
        .position(|p| p.text == "LIST OF DATES")
        .unwrap()
        + 1;
    let end = paras
        .iter()
        .position(|p| p.text == "QUESTIONS OF LAW")
        .unwrap();
    let lod = &paras[start..end];
    assert_eq!(lod.len(), events().len());
    for p in lod {
        assert!(!p.sources.events.is_empty(), "{} has no event id", p.text);
        let date = p.text.split(':').next().unwrap();
        for id in &p.sources.events {
            let e = events().into_iter().find(|e| &e.id == id).unwrap();
            assert_eq!(notebook_date(date), e.date);
            assert_eq!(date, display_date(&e.date));
        }
    }
}

fn annexures() -> Vec<AnnexureInput> {
    vec![
        AnnexureInput {
            id: "01EVIDA".into(),
            title: "Impugned judgment dated 14.11.2023".into(),
            pages: vec!["page one".into(), "page two".into(), "page three".into()],
        },
        AnnexureInput {
            id: "01EVIDB".into(),
            title: "Interim order dated 07.03.2019".into(),
            pages: vec!["only page".into()],
        },
    ]
}

fn filing() -> oa_docs::filing::Filing {
    let body = engine().render(&slp()).unwrap();
    assemble("Rao v. State", &body, &annexures(), (2, "B".into()))
}

#[test]
fn j_ac_09_the_filing_pdf_passes_the_pdfa_check_at_the_configured_part_and_level() {
    let bytes = filing().doc.write();
    let v = pdf::preflight(&bytes, 2, "B");
    assert!(v.passed, "{:?}", v.checks);
    assert_eq!(v.validator, pdf::PREFLIGHT, "never claims to be veraPDF");
    assert!(!pdf::preflight(&bytes, 3, "A").passed);
}

#[test]
fn j_ac_10_bookmarks_and_index_page_numbers_match_the_annexure_numbering() {
    let f = filing();
    let read = pdf::read(&f.doc.write()).unwrap();
    let index_page = &read.pages[1];
    for e in f.index.iter().skip(1) {
        let mark = read
            .bookmarks
            .iter()
            .find(|b| b.title.starts_with(&format!("Annexure {}:", e.label)))
            .unwrap();
        assert_eq!(page_number(mark.page), Some(e.first_page));
        assert!(read.pages[mark.page].starts_with(&format!("ANNEXURE {}", e.label)));
        assert!(index_page.contains(&format!(
            "Annexure {}: {} | {}-{}",
            e.label, e.title, e.first_page, e.last_page
        )));
    }
    assert_eq!(f.index[1].label, "P-1");
    assert_eq!(f.index[2].label, "P-2");
    assert_eq!(f.index[2].first_page, f.index[1].last_page + 1);
}

#[test]
fn j_ac_11_a_hosted_window_has_no_taskbar_entry_and_tracks_move_resize_and_minimise() {
    let mut host = Host::new(
        (100, 50),
        Rect {
            x: 200,
            y: 40,
            w: 800,
            h: 600,
        },
        96,
    );
    let w = host.window();
    assert!(!w.has_taskbar_entry());
    assert_eq!((w.rect.x, w.rect.y), (300, 90));
    let w = host.apply(&HostEvent::Moved { x: 400, y: 10 });
    assert_eq!((w.rect.x, w.rect.y), (600, 50));
    let w = host.apply(&HostEvent::PaneLayout {
        pane: Rect {
            x: 0,
            y: 40,
            w: 500,
            h: 300,
        },
    });
    assert_eq!((w.rect.w, w.rect.h), (500, 300));
    assert!(!host.apply(&HostEvent::Minimised).visible);
    let w = host.apply(&HostEvent::Restored);
    assert!(w.visible);
    assert!(!w.has_taskbar_entry());
    assert!(host.apply(&HostEvent::PaneFocused).focused);
}

#[test]
fn j_ac_12_at_a_dpi_change_the_window_scales_or_falls_back_with_a_notice() {
    let pane = Rect {
        x: 10,
        y: 10,
        w: 400,
        h: 300,
    };
    let mut ok = Host::new((0, 0), pane, 96);
    let w = ok.apply(&HostEvent::DpiChanged {
        dpi: 144,
        reparent_ok: true,
    });
    assert_eq!(w.mode, HostMode::Reparented);
    assert_eq!((w.rect.w, w.rect.h), (600, 450));
    assert!(w.notice.is_none());
    let mut bad = Host::new((0, 0), pane, 96);
    let w = bad.apply(&HostEvent::DpiChanged {
        dpi: 144,
        reparent_ok: false,
    });
    assert!(matches!(w.mode, HostMode::Fallback { .. }));
    assert!(w.notice.as_deref().unwrap().contains("own window"));
    assert!(!w.has_taskbar_entry(), "the fallback is an owned window");
}

#[test]
fn j_ac_13_the_fidelity_oracle_reports_page_differences_and_fails_above_the_threshold() {
    let pages: Vec<String> = engine()
        .render(&slp())
        .unwrap()
        .iter()
        .map(|p| p.lines.join("\n"))
        .collect();
    let same = compare(
        vec![
            Rendering {
                renderer: "wordcraft-engine".into(),
                pages: Some(pages.clone()),
                detail: None,
            },
            Rendering {
                renderer: "viewer".into(),
                pages: Some(pages.clone()),
                detail: None,
            },
            Rendering {
                renderer: "word".into(),
                pages: None,
                detail: Some("Word is not installed".into()),
            },
        ],
        0.02,
    );
    assert!(same.passed);
    assert!(same.differences.is_empty());
    let mut changed = pages.clone();
    changed[0] = changed[0].replacen("SUPREME", "HIGH", 1);
    let mut dropped = pages.clone();
    dropped[0] = dropped[0]
        .split_whitespace()
        .take(10)
        .collect::<Vec<_>>()
        .join(" ");
    let small = compare(
        vec![
            Rendering {
                renderer: "wordcraft-engine".into(),
                pages: Some(pages.clone()),
                detail: None,
            },
            Rendering {
                renderer: "viewer".into(),
                pages: Some(changed),
                detail: None,
            },
        ],
        0.05,
    );
    assert_eq!(small.differences.len(), 1);
    assert_eq!(small.differences[0].page, 1);
    assert!(small.passed, "one word in a page is under the threshold");
    let big = compare(
        vec![
            Rendering {
                renderer: "wordcraft-engine".into(),
                pages: Some(pages),
                detail: None,
            },
            Rendering {
                renderer: "word".into(),
                pages: Some(dropped),
                detail: None,
            },
        ],
        0.05,
    );
    assert!(!big.passed);
    assert!(big.differences[0].failed);
}

#[test]
fn j_ac_14_a_wordcraft_crash_keeps_the_working_copy_and_leaves_an_autosave_to_recover() {
    let dir = tempfile::tempdir().unwrap();
    let working = dir.path().join("working.docx");
    std::fs::write(&working, slp()).unwrap();
    let target = engine().paragraphs(&slp()).unwrap()[8].id.clone();
    let code = edit(
        &working,
        serde_json::json!([
            { "op": "replace", "para": target, "text": "Unsaved but autosaved." },
            { "op": "autosave" },
            { "op": "replace", "para": target, "text": "Lost in the crash." },
            { "op": "crash" }
        ]),
    );
    assert_eq!(code, 70);
    assert_eq!(std::fs::read(&working).unwrap(), slp(), "no save happened");
    let autosave = oa_docs::editor::autosave_path(&working);
    let recovered = engine().import(&std::fs::read(autosave).unwrap()).unwrap();
    let paras = engine().paragraphs(&recovered.docx).unwrap();
    assert_eq!(paras[8].text, "Unsaved but autosaved.");
}

fn filing_pdf(dir: &Path) -> PathBuf {
    let p = dir.join("filing.pdf");
    std::fs::write(&p, filing().doc.write()).unwrap();
    p
}

#[test]
fn j_ac_18_pdfcraft_refuses_to_open_the_filing_pdf_for_editing() {
    let dir = tempfile::tempdir().unwrap();
    let p = filing_pdf(dir.path());
    let run = |mode: &str, path: &Path| {
        Command::new(pdfcraft())
            .arg(mode)
            .arg(path)
            .status()
            .unwrap()
            .code()
    };
    assert_eq!(run("--edit", &p), Some(3));
    assert_eq!(run("--view", &p), Some(0));
    let plain = dir.path().join("annexure.pdf");
    std::fs::write(
        &plain,
        pdf::PdfDoc {
            pages: vec![PdfPage {
                lines: vec!["an order".into()],
            }],
            ..Default::default()
        }
        .write(),
    )
    .unwrap();
    assert_eq!(run("--edit", &plain), Some(0));
}

#[test]
fn j_ac_22_the_conversion_comparison_puts_a_failing_paragraph_from_both_sides_together() {
    let paras = engine().paragraphs(&slp()).unwrap();
    let mut pages: Vec<String> = engine()
        .render(&slp())
        .unwrap()
        .iter()
        .map(|p| p.lines.join("\n"))
        .collect();
    pages[0] = pages[0].replacen(
        "Interim order granting stay",
        "Interim order refusing stay",
        1,
    );
    let checks = oa_docs::conversion::compare(&paras, &pages);
    assert!(!oa_docs::conversion::passed(&checks));
    let bad: Vec<_> = checks.iter().filter(|c| c.outcome != "same").collect();
    assert_eq!(bad.len(), 1, "{bad:?}");
    assert!(bad[0].docx.contains("granting stay"));
    assert!(bad[0].pdf.contains("refusing stay"));
    let clean: Vec<String> = engine()
        .render(&slp())
        .unwrap()
        .iter()
        .map(|p| p.lines.join("\n"))
        .collect();
    assert!(oa_docs::conversion::passed(&oa_docs::conversion::compare(
        &paras, &clean
    )));
}

/// A hand-built package with a table, a footnote and parts the engine does
/// not interpret (an image and a foreign custom part).
fn rich_docx() -> Vec<u8> {
    let doc = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:x="urn:unknown"><w:body><w:p w14:paraId="2A000001"><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>GROUNDS</w:t></w:r></w:p><x:custom keep="me"><x:inner/></x:custom><w:tbl><w:tr w14:paraId="2A000010"><w:tc><w:p w14:paraId="2A000011"><w:r><w:t>Cell one</w:t></w:r></w:p></w:tc><w:tc><w:p w14:paraId="2A000012"><w:r><w:t>Cell two</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p w14:paraId="2A000002"><w:r><w:t xml:space="preserve">A. Because the High Court erred.</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p><w:p w14:paraId="2A000003"><w:r><w:t>B. Because the order is unreasoned.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>"#;
    let notes = r#"<?xml version="1.0"?><w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:footnote w:id="1"><w:p w14:paraId="2A000020"><w:r><w:t>See the record at page 12.</w:t></w:r></w:p></w:footnote></w:footnotes>"#;
    zip::write(&[
        Entry::stored("[Content_Types].xml", b"<Types/>"),
        Entry::deflated("word/document.xml", doc.as_bytes()),
        Entry::deflated("word/footnotes.xml", notes.as_bytes()),
        Entry::stored("word/media/image1.png", &[0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
        Entry::deflated("customXml/item7.xml", b"<foreign attr='x'>keep</foreign>"),
    ])
}

#[test]
fn j_ac_23_the_corpus_regression_reports_no_lost_id_and_no_changed_byte_outside_the_edit() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("slp.docx"), slp()).unwrap();
    std::fs::write(dir.path().join("rich.docx"), rich_docx()).unwrap();
    std::fs::write(
        dir.path().join("blank.docx"),
        template("blank", "Note", &[]).unwrap(),
    )
    .unwrap();
    let out = Command::new(wordcraft())
        .args(["--headless", "corpus"])
        .arg(dir.path())
        .output()
        .unwrap();
    let text = String::from_utf8_lossy(&out.stdout);
    let files: Vec<oa_docs::corpus::CorpusFile> = text
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(files.len(), 3);
    for f in &files {
        assert!(f.clean(), "{f:?}");
        assert!(f.edited.is_some());
    }
    assert_eq!(out.status.code(), Some(0));
    let rich = Docx::open(&rich_docx()).unwrap();
    let kinds: Vec<_> = rich
        .blocks()
        .iter()
        .map(|b| (b.id.clone(), b.kind))
        .collect();
    assert!(kinds.iter().any(|(id, _)| id == "tbl:2A000010"));
    assert!(kinds.iter().any(|(id, _)| id == "2A000010:c1"));
    assert!(kinds.iter().any(|(id, _)| id == "fn:1"));
}

//! Spec B rules 1 and 2: one schema, one registry, every command round-trips.

use std::collections::BTreeSet;
use std::path::PathBuf;

use oa_kernel::{
    AdapterHealthInput, Attachment, CaptureInput, ClientSpec, CodebookInput, CourtCodeInput,
    OcrEngineHealthInput, OcrPageInput, OcrReadingInput, OcrRunInput, Request,
};
use oa_ocr::{Reading, Rect};
use serde_json::Value;

fn att() -> Attachment {
    Attachment {
        file_name: "a.docx".into(),
        bytes: vec![0, 1, 2, 255],
    }
}

fn capture() -> CaptureInput {
    CaptureInput {
        file: Some(att()),
        origin: "court_portal".into(),
        url: "https://sc.example/case".into(),
        final_url: "https://sc.example/case".into(),
        captured_at: "2026-11-04T00:00:00.000Z".into(),
        profile: "portal".into(),
        gesture: "click:download".into(),
        portal_date: Some("2024-03-01".into()),
        adapter: "supreme_court_case_status".into(),
        status: "completed".into(),
        reason: None,
        health: Some(AdapterHealthInput {
            contract_state: "healthy".into(),
            runtime_state: "healthy".into(),
            detail: None,
        }),
        codebook: Some(CodebookInput {
            scheme: "supreme_court:list-2024-03".into(),
            version: "2024-03".into(),
            codes: vec![CourtCodeInput {
                scheme: "supreme_court:list-2024-03".into(),
                code: "WP".into(),
                label: "Writ Petition (Civil)".into(),
            }],
        }),
    }
}

fn ocr_input() -> OcrRunInput {
    OcrRunInput {
        pages: vec![OcrPageInput {
            page: 1,
            raster_hash: "sha256:raster".into(),
            width: 100.0,
            height: 200.0,
            dpi: 300,
            text_layer: None,
        }],
        readings: vec![OcrReadingInput {
            page: 1,
            line: 0,
            reading: Reading {
                engine: "tesseract".into(),
                engine_version: "stub-1.0".into(),
                model_hash: "sha256:model".into(),
                text: "the respondent filed".into(),
                confidence: 0.9,
                words: vec![oa_ocr::Word {
                    text: "the".into(),
                    rect: Rect::new(0.0, 0.0, 10.0, 12.0),
                }],
            },
        }],
        engine_health: vec![OcrEngineHealthInput {
            engine: "tesseract".into(),
            version: "stub-1.0".into(),
            model_hash: "sha256:model".into(),
            state: "healthy".into(),
            detail: None,
        }],
    }
}

/// One instance of every command.
fn samples() -> Vec<Request> {
    let m = || "01JE7Q00000000000000000000".to_string();
    vec![
        Request::WorkspaceInit {
            root: PathBuf::from(r"C:\root dir ñ"),
        },
        Request::MatterCreate {
            title: "T".into(),
            client: ClientSpec::New("C".into()),
            from: Some(att()),
        },
        Request::MatterConfirm {
            pending: "p".into(),
        },
        Request::MatterList {
            include_removed: true,
        },
        Request::MatterOpen { id: m() },
        Request::MatterArchive { id: m() },
        Request::MatterRename {
            id: m(),
            title: "T".into(),
        },
        Request::MatterWriteFile {
            id: m(),
            relpath: "inbox/a".into(),
            bytes: vec![9; 3],
        },
        Request::RegistryRescan,
        Request::SettingsGet { key: "k".into() },
        Request::SettingsSet {
            key: "k".into(),
            value: "v".into(),
        },
        Request::JobList,
        Request::JobShow { id: "j".into() },
        Request::JobCancel { id: "j".into() },
        Request::LedgerTail {
            matter: m(),
            n: Some(5),
        },
        Request::LedgerVerify { matter: m() },
        Request::AuditRejected { matter: Some(m()) },
        Request::AuditCommands,
        Request::EvidenceAdd {
            matter: m(),
            file: att(),
            origin: "advocate_import".into(),
        },
        Request::EvidenceList { matter: m() },
        Request::EvidenceShow {
            matter: m(),
            id: "e".into(),
        },
        Request::EvidenceImport {
            matter: Some(m()),
            files: vec![att()],
        },
        Request::IngestSetText {
            matter: m(),
            evidence: "e".into(),
            text: "order".into(),
        },
        Request::CaptureCommit {
            matter: m(),
            capture: Box::new(capture()),
        },
        Request::CaptureStatus,
        Request::IngestStatus {
            doc: Some("e".into()),
        },
        Request::EvidenceDuplicates { matter: m() },
        Request::CodebookShow {
            scheme: "supreme_court:list-2024-03".into(),
        },
        Request::AdapterHealth,
        Request::OcrRun {
            matter: m(),
            doc: "e".into(),
            input: ocr_input(),
        },
        Request::OcrLines {
            matter: m(),
            doc: "e".into(),
            page: Some(1),
        },
        Request::OcrPipeline { matter: Some(m()) },
        Request::OcrDisputes {
            matter: Some(m()),
            doc: Some("e".into()),
        },
        Request::OcrDecide {
            matter: m(),
            dispute: "d".into(),
            reading: "a".into(),
            text: None,
        },
        Request::OcrTypedCopy {
            matter: m(),
            doc: "e".into(),
            page: 1,
            text: "typed".into(),
            typist: "advocate".into(),
        },
        Request::ExtractEntities {
            matter: m(),
            doc: "e".into(),
        },
        Request::OcrEngines,
        Request::NotebookShow {
            matter: m(),
            section: Some("factual_matrix".into()),
        },
        Request::NotebookItem {
            matter: m(),
            id: "i".into(),
            version: Some(1),
        },
        Request::NotebookFacts {
            matter: m(),
            status: Some("disputed".into()),
        },
        Request::NotebookChronology {
            matter: m(),
            view: Some("synopsis".into()),
            show_excluded: true,
            for_prose: false,
        },
        Request::NotebookReady { matter: m() },
        Request::NotebookConflicts { matter: m() },
        Request::Trace {
            matter: m(),
            id: "i".into(),
        },
        Request::NotebookPropose {
            matter: m(),
            item: Box::new(oa_notebook::ItemInput {
                kind: "source_document".into(),
                description: "order".into(),
                method: "test".into(),
                anchors: vec![oa_notebook::NoteAnchor {
                    doc: "e".into(),
                    page: 1,
                    line: Some(0),
                    line_hash: Some("sha256:l".into()),
                    rect: Some(Rect::new(0.0, 0.0, 1.0, 1.0)),
                    start: None,
                    end: None,
                }],
                ..oa_notebook::ItemInput::default()
            }),
        },
        Request::NotebookExtract {
            matter: m(),
            doc: "e".into(),
        },
        Request::NotebookCorrect {
            matter: m(),
            id: "i".into(),
            reason: "typo".into(),
            item: Box::default(),
        },
        Request::NotebookExclude {
            matter: m(),
            view: "synopsis".into(),
            event: Some("i".into()),
            category: None,
            restore: false,
        },
        Request::NotebookImpugnedSet {
            matter: m(),
            order: oa_notebook::ImpugnedOrder {
                court_type: "HC".into(),
                state: "27".into(),
                bench: "1".into(),
                case_type: "WP".into(),
                number: "1234".into(),
                year: "2018".into(),
                order_date: "2019-03-12".into(),
                cnr: None,
            },
        },
        Request::NotebookConfirm {
            matter: m(),
            id: "i".into(),
        },
        Request::NotebookSkip {
            matter: m(),
            review: "r".into(),
            reason: "not material".into(),
        },
        Request::NotebookDateAnchor {
            matter: m(),
            doc: "e".into(),
            date: "2019-03-12".into(),
        },
        Request::DraftCreate {
            matter: m(),
            title: "D".into(),
            file: att(),
        },
        Request::DraftCommit {
            matter: m(),
            draft: "d".into(),
            base: "b".into(),
            file: att(),
            note: None,
        },
        Request::DraftList { matter: m() },
        Request::DraftLog {
            matter: m(),
            draft: "d".into(),
        },
        Request::DraftShow {
            matter: m(),
            rev: "r".into(),
        },
        Request::DraftCheckpoint {
            matter: m(),
            draft: "d".into(),
            name: "n".into(),
        },
        Request::DraftRestore {
            matter: m(),
            draft: "d".into(),
            checkpoint: "n".into(),
        },
        Request::View {
            matter: m(),
            target: "r".into(),
            page: Some(2),
        },
        Request::DraftNew {
            matter: m(),
            title: "SLP".into(),
            template: "slp".into(),
            from_notebook: true,
        },
        Request::DraftParagraphs {
            matter: m(),
            rev: "r".into(),
        },
        Request::DraftPropose {
            matter: m(),
            draft: "d".into(),
            para: "10000001".into(),
            replace: "text".into(),
            reason: Some("why".into()),
            turn: Some("t1".into()),
        },
        Request::DraftProposals {
            matter: m(),
            draft: None,
            all: true,
        },
        Request::DraftAccept {
            matter: m(),
            proposal: "p".into(),
        },
        Request::DraftReject {
            matter: m(),
            proposal: "p".into(),
            reason: None,
        },
        Request::DraftRevert {
            matter: m(),
            draft: "d".into(),
            rev: "r".into(),
        },
        Request::DraftOpenEditor {
            matter: m(),
            draft: "d".into(),
        },
        Request::DraftEditorStatus {
            matter: m(),
            draft: "d".into(),
        },
        Request::DraftImportWorkingCopy {
            matter: m(),
            draft: "d".into(),
            autosave: false,
        },
        Request::DraftDiff {
            matter: m(),
            a: "a".into(),
            b: "b".into(),
        },
        Request::DraftChanges {
            matter: m(),
            draft: "d".into(),
        },
        Request::DraftNote {
            matter: m(),
            draft: "d".into(),
            rev: "r".into(),
            para: "10000001".into(),
            text: "check".into(),
            to_agent: false,
        },
        Request::DraftRender {
            matter: m(),
            rev: "r".into(),
        },
        Request::FilingPdf {
            matter: m(),
            rev: "r".into(),
            annexures: vec!["e".into()],
        },
        Request::FilingConversions { matter: m() },
        Request::FidelityCheck {
            matter: m(),
            rev: "r".into(),
        },
        Request::PdfOpenEditor {
            matter: m(),
            target: "t".into(),
        },
        Request::ApprovalRequest {
            matter: m(),
            gate: "g".into(),
            target: "r".into(),
        },
        Request::ApprovalDecide {
            matter: m(),
            id: "a".into(),
            accept: true,
            reason: "ok".into(),
        },
        Request::ApprovalStatus {
            matter: m(),
            gate: "g".into(),
            target: "r".into(),
        },
        Request::RulesPin { matter: m() },
        Request::Inspect {
            matter: m(),
            id: "x".into(),
        },
        Request::LinksOut {
            matter: m(),
            id: "x".into(),
        },
        Request::LinksIn {
            matter: m(),
            id: "x".into(),
        },
        Request::SettingsList,
        Request::ApprovalList { matter: m() },
        Request::Find {
            matter: Some(m()),
            query: "q".into(),
            kinds: vec!["evidence".into()],
            filter: Some("origin:x".into()),
        },
    ]
}

fn command_names_in_schema(v: &Value, out: &mut BTreeSet<String>) {
    match v {
        Value::Object(map) => {
            if let Some(names) = map
                .get("properties")
                .and_then(|p| p.get("command"))
                .and_then(|c| c.get("enum"))
                .and_then(Value::as_array)
            {
                out.extend(names.iter().filter_map(Value::as_str).map(str::to_string));
            }
            map.values().for_each(|x| command_names_in_schema(x, out));
        }
        Value::Array(items) => items.iter().for_each(|x| command_names_in_schema(x, out)),
        _ => {}
    }
}

#[test]
fn b_ac_01_schema_names_equal_the_registry() {
    let mut in_schema = BTreeSet::new();
    command_names_in_schema(&Request::schema(), &mut in_schema);
    let registry: BTreeSet<String> = Request::NAMES.iter().map(|s| s.to_string()).collect();
    assert_eq!(in_schema, registry);
    let from_variants: BTreeSet<String> = samples().iter().map(|r| r.name().to_string()).collect();
    assert_eq!(from_variants, registry, "every command has a sample");
}

#[test]
fn b_ac_02_every_command_round_trips_and_its_wire_name_is_its_name() {
    for req in samples() {
        let wire = serde_json::to_value(&req).unwrap();
        assert_eq!(wire["command"], req.name(), "{req:?}");
        let back: Request = serde_json::from_value(wire).unwrap();
        assert_eq!(back, req);
    }
}

#[test]
fn class_of_name_agrees_with_class_for_every_command() {
    for r in samples() {
        assert_eq!(
            Request::class_of_name(r.name()),
            Some(r.class()),
            "{}",
            r.name()
        );
    }
    assert_eq!(Request::class_of_name("no.such"), None);
}

#[test]
fn query_names_equal_the_query_class_commands() {
    let from_class: BTreeSet<&str> = samples()
        .iter()
        .filter(|r| r.class() == oa_types::CommandClass::Query)
        .map(|r| r.name())
        .collect();
    let listed: BTreeSet<&str> = Request::QUERY_NAMES.iter().copied().collect();
    assert_eq!(from_class, listed);
}

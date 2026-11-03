//! Spec B rules 1 and 2: one schema, one registry, every command round-trips.

use std::collections::BTreeSet;
use std::path::PathBuf;

use oa_kernel::{Attachment, ClientSpec, Request};
use serde_json::Value;

fn att() -> Attachment {
    Attachment {
        file_name: "a.docx".into(),
        bytes: vec![0, 1, 2, 255],
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
fn query_names_equal_the_query_class_commands() {
    let from_class: BTreeSet<&str> = samples()
        .iter()
        .filter(|r| r.class() == oa_types::CommandClass::Query)
        .map(|r| r.name())
        .collect();
    let listed: BTreeSet<&str> = Request::QUERY_NAMES.iter().copied().collect();
    assert_eq!(from_class, listed);
}

//! Spec C acceptance criteria that do not need later groups.

use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use oa_kernel::{
    Attachment, ClientSpec, Ctx, FaultHook, Hooks, Kernel, PresencePrompt, Request, Step,
};
use oa_store::sqlite::SqliteFactory;
use oa_store::StoreFactory;
use oa_types::{new_key, ErrorCode, OaError, Origin};
use serde_json::Value;
use tempfile::TempDir;

struct Approve(AtomicUsize);

impl PresencePrompt for Approve {
    fn confirm(&self, _: &str) -> bool {
        self.0.fetch_add(1, Ordering::SeqCst);
        true
    }
}

struct World {
    _tmp: TempDir,
    app: PathBuf,
    k: Kernel,
    matter: String,
    dir: PathBuf,
}

fn world(hooks: Hooks) -> World {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("root ñ");
    let app = tmp.path().join("app");
    let k = Kernel::new(&app, Arc::new(SqliteFactory), hooks);
    k.dispatch(&cli(), Request::WorkspaceInit { root }).unwrap();
    let m = one(
        &k,
        &cli(),
        Request::MatterCreate {
            title: "C".into(),
            client: ClientSpec::None,
            from: None,
        },
    )
    .unwrap();
    World {
        _tmp: tmp,
        app,
        k,
        matter: m["id"].as_str().unwrap().into(),
        dir: PathBuf::from(m["path"].as_str().unwrap()),
    }
}

fn cli() -> Ctx {
    Ctx::new(Origin::Cli, new_key())
}

fn one(k: &Kernel, c: &Ctx, r: Request) -> Result<Value, OaError> {
    k.dispatch(c, r).map(|mut v| v.remove(0))
}

fn file(name: &str, bytes: &[u8]) -> Attachment {
    Attachment {
        file_name: name.into(),
        bytes: bytes.to_vec(),
    }
}

fn s(v: &Value) -> String {
    v.as_str().unwrap().to_string()
}

#[test]
fn c_ac_05_identical_bytes_add_an_origin_not_a_blob() {
    let w = world(Hooks::default());
    let add = |name: &str| {
        one(
            &w.k,
            &cli(),
            Request::EvidenceAdd {
                matter: w.matter.clone(),
                file: file(name, b"%PDF-1.7 judgment"),
                origin: "advocate_import".into(),
            },
        )
        .unwrap()
    };
    let first = add("judgment.pdf");
    let second = add("judgment (copy).pdf");
    assert_eq!(first["id"], second["id"]);
    assert_eq!(second["duplicate"], true);
    assert_eq!(second["origins"].as_array().unwrap().len(), 2);
    let blobs = std::fs::read_dir(w.dir.join("blobs"))
        .unwrap()
        .flatten()
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .count();
    assert_eq!(blobs, 1);
    let listed =
        w.k.dispatch(
            &Ctx::query(Origin::Cli),
            Request::EvidenceList {
                matter: w.matter.clone(),
            },
        )
        .unwrap();
    assert_eq!(listed.len(), 1);
}

#[test]
fn c_rule_6_capture_origins_cannot_be_claimed_by_a_caller() {
    let w = world(Hooks::default());
    for origin in ["court_portal", "india_code", "email", "made_up"] {
        let err = one(
            &w.k,
            &Ctx::new(Origin::Harness, new_key()),
            Request::EvidenceAdd {
                matter: w.matter.clone(),
                file: file("x.pdf", b"forged"),
                origin: origin.into(),
            },
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::WriteRefused, "{origin}");
    }
    let audit = SqliteFactory
        .open_matter(&w.dir)
        .unwrap()
        .rejected()
        .unwrap();
    assert_eq!(audit.len(), 4);
}

struct StopAt(Step);

impl FaultHook for StopAt {
    fn before(&self, step: Step) -> Result<(), OaError> {
        if step == self.0 {
            Err(OaError::new(ErrorCode::FaultInjected, "killed"))
        } else {
            Ok(())
        }
    }
}

#[test]
fn c_ac_15_a_failed_evidence_commit_leaves_no_entry() {
    let w = world(Hooks {
        faults: Arc::new(StopAt(Step::CommitEvidence)),
        ..Hooks::default()
    });
    let err = one(
        &w.k,
        &cli(),
        Request::EvidenceAdd {
            matter: w.matter.clone(),
            file: file("a.pdf", b"bytes"),
            origin: "advocate_import".into(),
        },
    )
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::FaultInjected);
    let store = SqliteFactory.open_matter(&w.dir).unwrap();
    assert!(
        store.evidence_list().unwrap().is_empty(),
        "no entry without its commit"
    );
    assert_eq!(store.events().unwrap().len(), 1, "only the genesis event");
}

fn new_draft(w: &World) -> (String, String) {
    let d = one(
        &w.k,
        &cli(),
        Request::DraftCreate {
            matter: w.matter.clone(),
            title: "SLP".into(),
            file: file("slp.docx", b"rev 0"),
        },
    )
    .unwrap();
    (s(&d["draft"]["id"]), s(&d["draft"]["head"]))
}

fn commit(w: &World, c: &Ctx, draft: &str, base: &str, body: &[u8]) -> Result<Value, OaError> {
    one(
        &w.k,
        c,
        Request::DraftCommit {
            matter: w.matter.clone(),
            draft: draft.into(),
            base: base.into(),
            file: file("slp.docx", body),
            note: None,
        },
    )
}

#[test]
fn c_ac_06_a_stale_parent_is_refused_with_the_current_head() {
    let w = world(Hooks::default());
    let (draft, base) = new_draft(&w);
    let advocate = commit(&w, &cli(), &draft, &base, b"advocate edit").unwrap();
    let err = commit(
        &w,
        &Ctx::new(Origin::Harness, new_key()),
        &draft,
        &base,
        b"agent edit",
    )
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::Conflict);
    assert_eq!(err.detail.unwrap()["head"], advocate["hash"]);
}

#[test]
fn c_ac_09_the_revision_dag_never_loses_a_node() {
    let w = world(Hooks::default());
    let (draft, mut head) = new_draft(&w);
    let mut seen = vec![head.clone()];
    for i in 0..6 {
        let r = commit(&w, &cli(), &draft, &head, format!("rev {i}").as_bytes()).unwrap();
        head = s(&r["hash"]);
        seen.push(head.clone());
        if i == 1 {
            one(
                &w.k,
                &cli(),
                Request::DraftCheckpoint {
                    matter: w.matter.clone(),
                    draft: draft.clone(),
                    name: "before grounds".into(),
                },
            )
            .unwrap();
        }
    }
    let restored = one(
        &w.k,
        &cli(),
        Request::DraftRestore {
            matter: w.matter.clone(),
            draft: draft.clone(),
            checkpoint: "before grounds".into(),
        },
    )
    .unwrap();
    seen.push(s(&restored["hash"]));
    assert_eq!(
        restored["parents"][0], head,
        "a restore is a new revision on top of the head"
    );

    let log = one(
        &w.k,
        &Ctx::query(Origin::Cli),
        Request::DraftLog {
            matter: w.matter.clone(),
            draft: draft.clone(),
        },
    )
    .unwrap();
    let in_log: Vec<String> = log["revisions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| s(&r["hash"]))
        .collect();
    for h in &seen {
        assert!(in_log.contains(h), "revision {h} was lost");
        let shown = one(
            &w.k,
            &Ctx::query(Origin::Cli),
            Request::DraftShow {
                matter: w.matter.clone(),
                rev: h.clone(),
            },
        )
        .unwrap();
        assert_eq!(shown["bytes_present"], true);
    }
    let dup = one(
        &w.k,
        &cli(),
        Request::DraftCheckpoint {
            matter: w.matter.clone(),
            draft,
            name: "before grounds".into(),
        },
    )
    .unwrap_err();
    assert_eq!(dup.code, ErrorCode::Conflict, "checkpoint names are unique");
}

#[test]
fn c_ac_10_an_approval_for_one_revision_does_not_satisfy_another() {
    let presence = Arc::new(Approve(AtomicUsize::new(0)));
    let w = world(Hooks {
        presence: presence.clone(),
        ..Hooks::default()
    });
    let (draft, r1) = new_draft(&w);
    let a = one(
        &w.k,
        &cli(),
        Request::ApprovalRequest {
            matter: w.matter.clone(),
            gate: "final_revision".into(),
            target: r1.clone(),
        },
    )
    .unwrap();
    let decide = |c: &Ctx| {
        one(
            &w.k,
            c,
            Request::ApprovalDecide {
                matter: w.matter.clone(),
                id: s(&a["id"]),
                accept: true,
                reason: "approved after review".into(),
            },
        )
    };
    let refused = decide(&Ctx::new(Origin::Harness, new_key())).unwrap_err();
    assert_eq!(refused.code, ErrorCode::HumanCommandRefused);
    decide(&cli()).unwrap();
    assert_eq!(presence.0.load(Ordering::SeqCst), 1);

    let status = |target: &str| {
        one(
            &w.k,
            &Ctx::query(Origin::Cli),
            Request::ApprovalStatus {
                matter: w.matter.clone(),
                gate: "final_revision".into(),
                target: target.into(),
            },
        )
        .unwrap()
    };
    assert_eq!(status(&r1)["satisfied"], true);
    let r2 = s(&commit(&w, &cli(), &draft, &r1, b"edited after approval").unwrap()["hash"]);
    let after = status(&r2);
    assert_eq!(after["satisfied"], false);
    assert_eq!(after["stale"].as_array().unwrap().len(), 1);
}

#[test]
fn c_ac_02_ledger_verify_detects_a_tampered_row() {
    let w = world(Hooks::default());
    one(
        &w.k,
        &cli(),
        Request::MatterRename {
            id: w.matter.clone(),
            title: "Renamed".into(),
        },
    )
    .unwrap();
    let verify = || {
        w.k.dispatch(
            &Ctx::query(Origin::Cli),
            Request::LedgerVerify {
                matter: w.matter.clone(),
            },
        )
    };
    assert!(verify().is_ok());

    let conn = rusqlite::Connection::open(w.dir.join("matter.db")).unwrap();
    let blocked = conn.execute("UPDATE ledger SET body = '{}' WHERE seq = 2", []);
    assert!(blocked.is_err(), "the append-only trigger refuses edits");
    conn.execute_batch("DROP TRIGGER ledger_no_update").unwrap();
    conn.execute(
        "UPDATE ledger SET body = '{\"title\":\"forged\"}' WHERE seq = 2",
        [],
    )
    .unwrap();
    drop(conn);

    let err = verify().unwrap_err();
    assert_eq!(err.code, ErrorCode::CheckFailed);
    assert_eq!(err.code.exit_code(), 1);
    assert_eq!(err.detail.unwrap()["first_bad_seq"], 2);
}

#[test]
fn b_ac_08_accepted_commands_and_refusals_are_audited() {
    let w = world(Hooks::default());
    w.k.dispatch(
        &cli(),
        Request::SettingsSet {
            key: "firm.name".into(),
            value: "Rao & Co".into(),
        },
    )
    .unwrap();
    let _ = w.k.dispatch(
        &cli(),
        Request::SettingsSet {
            key: "legal.rule_pack".into(),
            value: "x".into(),
        },
    );
    let commands =
        w.k.dispatch(&Ctx::query(Origin::Cli), Request::AuditCommands)
            .unwrap();
    let names: Vec<&str> = commands
        .iter()
        .filter_map(|c| c["command"].as_str())
        .collect();
    for expected in ["workspace.init", "matter.create", "settings.set"] {
        assert!(
            names.contains(&expected),
            "{expected} missing from {names:?}"
        );
    }
    let rejected =
        w.k.dispatch(
            &Ctx::query(Origin::Cli),
            Request::AuditRejected {
                matter: Some(w.matter.clone()),
            },
        )
        .unwrap();
    assert!(rejected.iter().any(|r| r["command"] == "settings.set"));
    let _ = w.app;
}

#[test]
fn b_ac_06_a_repeated_key_commits_one_event() {
    let w = world(Hooks::default());
    let c = cli();
    for _ in 0..3 {
        one(
            &w.k,
            &c,
            Request::EvidenceAdd {
                matter: w.matter.clone(),
                file: file("a.pdf", b"same"),
                origin: "advocate_import".into(),
            },
        )
        .unwrap();
    }
    let events = SqliteFactory.open_matter(&w.dir).unwrap().events().unwrap();
    assert_eq!(events.len(), 2, "genesis plus one evidence event");
}

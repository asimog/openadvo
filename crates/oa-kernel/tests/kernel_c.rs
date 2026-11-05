//! Spec C acceptance criteria that do not need later groups.

use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use oa_kernel::{
    Attachment, ClientSpec, Ctx, FaultHook, Hooks, Kernel, PresencePrompt, Request, Step,
};
use oa_store::sqlite::SqliteFactory;
use oa_store::{JobRow, JobStatus, MatterWrite, OutboxRow, StoreFactory};
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

fn q(w: &World, r: Request) -> Result<Vec<Value>, OaError> {
    w.k.dispatch(&Ctx::query(Origin::Cli), r)
}

#[test]
fn c_ac_20_inspect_lists_the_ledger_events_that_touched_a_record() {
    let w = world(Hooks::default());
    let (draft, r1) = new_draft(&w);
    let r2 = s(&commit(&w, &cli(), &draft, &r1, b"rev 1").unwrap()["hash"]);
    one(
        &w.k,
        &cli(),
        Request::DraftCheckpoint {
            matter: w.matter.clone(),
            draft: draft.clone(),
            name: "v1".into(),
        },
    )
    .unwrap();
    let inspect = |id: &str| {
        q(
            &w,
            Request::Inspect {
                matter: w.matter.clone(),
                id: id.into(),
            },
        )
        .unwrap()
        .remove(0)
    };
    let d = inspect(&draft);
    assert_eq!(d["kind"], "draft");
    let cmds: Vec<&str> = d["events"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["command"].as_str().unwrap())
        .collect();
    assert_eq!(
        cmds,
        ["draft.created", "draft.revised", "draft.checkpointed"]
    );
    let rev = inspect(&r2);
    assert_eq!(rev["kind"], "revision");
    assert!(!rev["events"].as_array().unwrap().is_empty());
    assert_eq!(inspect(&format!("{draft}#v1"))["kind"], "checkpoint");
    let missing = q(
        &w,
        Request::Inspect {
            matter: w.matter.clone(),
            id: "nope".into(),
        },
    )
    .unwrap_err();
    assert_eq!(missing.code, ErrorCode::NotFound);
}

#[test]
fn c_ac_21_links_in_lists_referrers_and_a_rebuild_gives_the_same_answer() {
    let w = world(Hooks::default());
    let ev = one(
        &w.k,
        &cli(),
        Request::EvidenceAdd {
            matter: w.matter.clone(),
            file: file("order.pdf", b"same bytes"),
            origin: "advocate_import".into(),
        },
    )
    .unwrap();
    let blob = s(&ev["blob"]);
    let d = one(
        &w.k,
        &cli(),
        Request::DraftCreate {
            matter: w.matter.clone(),
            title: "Reply".into(),
            file: file("reply.docx", b"same bytes"),
        },
    )
    .unwrap();
    let links_in = |id: &str| {
        q(
            &w,
            Request::LinksIn {
                matter: w.matter.clone(),
                id: id.into(),
            },
        )
        .unwrap()
    };
    let into_blob = links_in(&blob);
    let from: Vec<String> = into_blob.iter().map(|e| s(&e["from"])).collect();
    assert!(from.contains(&s(&ev["id"])), "the evidence entry");
    assert!(from.contains(&s(&d["revision"]["hash"])), "the revision");

    let events = q(
        &w,
        Request::LedgerTail {
            matter: w.matter.clone(),
            n: Some(1000),
        },
    )
    .unwrap();
    let rebuilt: Vec<oa_store::LedgerEvent> = events
        .iter()
        .map(|e| oa_store::LedgerEvent {
            seq: e["seq"].as_i64().unwrap(),
            recorded_at: s(&e["recorded_at"]),
            actor: s(&e["actor"]),
            origin: s(&e["origin"]),
            command: s(&e["command"]),
            idempotency_key: None,
            body: serde_json::to_string(&e["body"]).unwrap(),
            prev_hash: s(&e["prev_hash"]),
            hash: s(&e["hash"]),
        })
        .collect();
    let again: Vec<Value> = oa_kernel::edges(&rebuilt)
        .iter()
        .filter(|e| e.to == blob)
        .map(|e| serde_json::json!({ "from": e.from, "to": e.to, "seq": e.seq, "via": e.via }))
        .collect();
    assert_eq!(again, into_blob);
}

#[test]
fn e_ac_11_find_returns_several_kinds_each_with_its_kind() {
    let w = world(Hooks::default());
    one(
        &w.k,
        &cli(),
        Request::EvidenceAdd {
            matter: w.matter.clone(),
            file: file("slp-order.pdf", b"order bytes"),
            origin: "advocate_import".into(),
        },
    )
    .unwrap();
    one(
        &w.k,
        &cli(),
        Request::DraftCreate {
            matter: w.matter.clone(),
            title: "SLP against order".into(),
            file: file("slp.docx", b"draft"),
        },
    )
    .unwrap();
    let find = |kinds: &[&str], filter: Option<&str>| {
        q(
            &w,
            Request::Find {
                matter: Some(w.matter.clone()),
                query: "order".into(),
                kinds: kinds.iter().map(|k| k.to_string()).collect(),
                filter: filter.map(str::to_string),
            },
        )
    };
    let all = find(&[], None).unwrap();
    let kinds: std::collections::BTreeSet<String> = all.iter().map(|r| s(&r["kind"])).collect();
    assert!(
        kinds.contains("evidence") && kinds.contains("draft"),
        "{kinds:?}"
    );
    assert!(all.iter().all(|r| !r["id"].is_null()));
    let only = find(&["evidence"], None).unwrap();
    assert!(only.iter().all(|r| r["kind"] == "evidence"));
    let by_origin = find(&[], Some("kind:evidence origin:advocate_import")).unwrap();
    assert_eq!(by_origin.len(), 1);
    assert_eq!(find(&[], Some("origin:email")).unwrap().len(), 0);
    assert_eq!(find(&["nope"], None).unwrap_err().code, ErrorCode::Usage);
    assert_eq!(
        find(&[], Some("badclause")).unwrap_err().code,
        ErrorCode::Usage
    );
}

#[test]
fn c_ac_19_the_approvals_list_marks_an_approval_on_a_non_head_revision_stale() {
    let w = world(Hooks {
        presence: Arc::new(Approve(AtomicUsize::new(0))),
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
    one(
        &w.k,
        &cli(),
        Request::ApprovalDecide {
            matter: w.matter.clone(),
            id: s(&a["id"]),
            accept: true,
            reason: "ok".into(),
        },
    )
    .unwrap();
    let list = || {
        q(
            &w,
            Request::ApprovalList {
                matter: w.matter.clone(),
            },
        )
        .unwrap()
    };
    assert_eq!(list()[0]["stale"], false);
    commit(&w, &cli(), &draft, &r1, b"edited").unwrap();
    assert_eq!(list()[0]["stale"], true);
    assert_eq!(list()[0]["state"], "accepted");
}

#[test]
fn a_ac_21_a_window_decision_needs_no_prompt_but_the_harness_is_still_refused() {
    let presence = Arc::new(Approve(AtomicUsize::new(0)));
    let w = world(Hooks {
        presence: presence.clone(),
        ..Hooks::default()
    });
    let (_, r1) = new_draft(&w);
    let a = one(
        &w.k,
        &cli(),
        Request::ApprovalRequest {
            matter: w.matter.clone(),
            gate: "final_revision".into(),
            target: r1,
        },
    )
    .unwrap();
    let decide = Request::ApprovalDecide {
        matter: w.matter.clone(),
        id: s(&a["id"]),
        accept: true,
        reason: "reviewed in the window".into(),
    };
    let harness = one(&w.k, &Ctx::new(Origin::Harness, new_key()), decide.clone()).unwrap_err();
    assert_eq!(harness.code, ErrorCode::HumanCommandRefused);
    one(&w.k, &Ctx::new(Origin::Ui, new_key()), decide).unwrap();
    assert_eq!(presence.0.load(Ordering::SeqCst), 0, "no terminal prompt");
}

#[test]
fn c_ac_22_two_writer_processes_on_one_matter_db_never_fork_the_chain() {
    let w = world(Hooks::default());
    let app = w.app.clone();
    let matter_id = w.matter.clone();

    let h1 = std::thread::spawn({
        let app = app.clone();
        let matter_id = matter_id.clone();
        move || {
            let k1 = Kernel::new(&app, Arc::new(SqliteFactory), Hooks::default());
            for i in 0..5 {
                let _ = k1.dispatch(
                    &Ctx::new(Origin::Cli, new_key()),
                    Request::CorrespondenceLog {
                        matter: matter_id.clone(),
                        kind: "call".into(),
                        summary: format!("Call writer1 #{i}"),
                        contact: None,
                        occurred_at: None,
                    },
                );
            }
        }
    });

    let h2 = std::thread::spawn({
        let app = app.clone();
        let matter_id = matter_id.clone();
        move || {
            let k2 = Kernel::new(&app, Arc::new(SqliteFactory), Hooks::default());
            for i in 0..5 {
                let res = k2.dispatch(
                    &Ctx::new(Origin::Cli, new_key()),
                    Request::CorrespondenceLog {
                        matter: matter_id.clone(),
                        kind: "call".into(),
                        summary: format!("Call writer2 #{i}"),
                        contact: None,
                        occurred_at: None,
                    },
                );
                if let Err(e) = res {
                    assert_eq!(
                        e.code,
                        ErrorCode::Conflict,
                        "the second writer gets a typed conflict"
                    );
                }
            }
        }
    });

    h1.join().unwrap();
    h2.join().unwrap();

    let verified = one(
        &w.k,
        &cli(),
        Request::LedgerVerify {
            matter: w.matter.clone(),
        },
    )
    .unwrap();
    assert_eq!(verified["ok"], true);
    assert!(
        verified["events"].as_i64().unwrap() > 1,
        "chain is never forked"
    );
}

#[test]
fn c_ac_23_an_external_effects_outbox_row_exists_iff_its_ledger_event_exists() {
    let w = world(Hooks::default());
    let store = SqliteFactory.open_matter(&w.dir).unwrap();

    let outbox_id = oa_types::new_key();
    let outbox_row = OutboxRow {
        id: outbox_id.clone(),
        created_at: oa_types::now_utc(),
        actor: "advocate".into(),
        origin: "cli".into(),
        command: "filing.submit".into(),
        idempotency_key: Some(new_key()),
        state: "pending".into(),
        payload: "{\"target\": \"court\"}".into(),
        approval_id: None,
        attempt_count: 0,
        last_attempt_at: None,
        outcome: None,
        detail: None,
    };

    let head = store.last_event().unwrap().unwrap();
    let event = oa_kernel::build(oa_kernel::LedgerNewEvent {
        seq: head.seq + 1,
        prev_hash: &head.hash,
        origin: Origin::Cli,
        command: "filing.submit",
        key: None,
        body: serde_json::json!({ "outbox": outbox_id }),
    });

    let committed_hash = event.hash.clone();
    store
        .commit(&event, &[MatterWrite::InsertOutbox(outbox_row.clone())])
        .unwrap();
    assert!(store.outbox_entry(&outbox_id).unwrap().is_some());
    let head_after = store.last_event().unwrap().unwrap();
    assert_eq!(head_after.hash, committed_hash);

    let bad_outbox_id = oa_types::new_key();
    let bad_outbox_row = OutboxRow {
        id: bad_outbox_id.clone(),
        created_at: oa_types::now_utc(),
        actor: "advocate".into(),
        origin: "cli".into(),
        command: "filing.submit".into(),
        idempotency_key: Some(new_key()),
        state: "pending".into(),
        payload: "{\"target\": \"court\"}".into(),
        approval_id: None,
        attempt_count: 0,
        last_attempt_at: None,
        outcome: None,
        detail: None,
    };
    let bad_event = oa_kernel::build(oa_kernel::LedgerNewEvent {
        seq: head_after.seq + 1,
        prev_hash: &head_after.hash,
        origin: Origin::Cli,
        command: "filing.submit",
        key: None,
        body: serde_json::json!({ "outbox": bad_outbox_id }),
    });
    let err = store.commit(
        &bad_event,
        &[
            MatterWrite::InsertOutbox(bad_outbox_row),
            MatterWrite::InsertOutbox(outbox_row),
        ],
    );
    assert!(err.is_err());
    assert!(store.outbox_entry(&bad_outbox_id).unwrap().is_none());
    let current_head = store.last_event().unwrap().unwrap();
    assert_eq!(
        current_head.hash, committed_hash,
        "ledger was not modified on abort"
    );
}

#[test]
fn c_ac_24_an_unknown_effect_is_not_retried_until_oa_outbox_reconcile() {
    let w = world(Hooks::default());
    let store = SqliteFactory.open_matter(&w.dir).unwrap();

    let effect_id = oa_types::new_key();
    let row = OutboxRow {
        id: effect_id.clone(),
        created_at: oa_types::now_utc(),
        actor: "advocate".into(),
        origin: "cli".into(),
        command: "filing.submit".into(),
        idempotency_key: Some(new_key()),
        state: "unknown".into(),
        payload: "{\"submission\": 1}".into(),
        approval_id: None,
        attempt_count: 1,
        last_attempt_at: Some(oa_types::now_utc()),
        outcome: None,
        detail: Some("connection timed out in flight".into()),
    };

    let head = store.last_event().unwrap().unwrap();
    let event = oa_kernel::build(oa_kernel::LedgerNewEvent {
        seq: head.seq + 1,
        prev_hash: &head.hash,
        origin: Origin::Cli,
        command: "filing.submit",
        key: None,
        body: serde_json::json!({ "effect": "unknown" }),
    });
    store
        .commit(&event, &[MatterWrite::InsertOutbox(row)])
        .unwrap();

    let pending = store.outbox(Some("pending")).unwrap();
    assert!(
        !pending.iter().any(|r| r.id == effect_id),
        "unknown is not in pending retry list"
    );

    let unknown_list = store.outbox(Some("unknown")).unwrap();
    assert!(unknown_list.iter().any(|r| r.id == effect_id));

    let res = one(
        &w.k,
        &cli(),
        Request::OutboxReconcile {
            matter: w.matter.clone(),
            id: effect_id.clone(),
            outcome: "sent".into(),
            detail: Some("verified delivered with bank portal receipt".into()),
        },
    )
    .unwrap();
    assert_eq!(res["outcome"], "sent");
    assert_eq!(res["state"], "sent");

    let updated = store.outbox_entry(&effect_id).unwrap().unwrap();
    assert_eq!(updated.state, "sent");
    assert_eq!(
        updated.detail.as_deref(),
        Some("verified delivered with bank portal receipt")
    );
}

#[test]
fn c_ac_25_kernel_shutdown_checkpoints_a_running_job_and_resumes_on_next_start() {
    let w = world(Hooks::default());
    let reg = w.k.registry().unwrap();

    let job_id = oa_types::new_key();
    let job = JobRow {
        id: job_id.clone(),
        kind: "ocr.batch".into(),
        status: JobStatus::Running,
        done: 5,
        total: 10,
        cancel_requested: false,
        message: Some("processing page 6".into()),
        created_at: oa_types::now_utc(),
        updated_at: oa_types::now_utc(),
    };
    reg.create_job(&job).unwrap();

    let res = one(&w.k, &cli(), Request::KernelShutdown).unwrap();
    assert_eq!(res["shutdown"], true);
    assert_eq!(res["checkpointed_jobs"], 1);

    let stored = reg.job(&job_id).unwrap().unwrap();
    assert_eq!(stored.status, JobStatus::Checkpointed);
    assert_eq!(stored.done, 5);
    assert_eq!(stored.total, 10);

    let resumed = w.k.resume_checkpointed_jobs().unwrap();
    assert_eq!(resumed, 1);

    let stored_after = reg.job(&job_id).unwrap().unwrap();
    assert_eq!(stored_after.status, JobStatus::Running);
}

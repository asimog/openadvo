//! Spec A acceptance criteria in scope for build step 1, against the real
//! SQLite stores. Every fixture lives under a path with spaces and
//! non-ASCII characters.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use oa_kernel::{
    verify_chain, ClientSpec, Ctx, FaultHook, Hooks, Kernel, PresencePrompt, Request, Step,
    MANIFEST, STAGING, SUBDIRS,
};
use oa_store::sqlite::{SqliteFactory, REGISTRY_FILE};
use oa_store::{Contact, StoreFactory};
use oa_types::{new_key, ErrorCode, OaError, Origin};
use serde_json::Value;
use tempfile::TempDir;

struct Fixture {
    _tmp: TempDir,
    root: PathBuf,
    app: PathBuf,
}

fn fixture() -> Fixture {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("Matter Files ñ अधिवक्ता").join("root dir");
    let app = tmp.path().join("app data ñ");
    Fixture {
        _tmp: tmp,
        root,
        app,
    }
}

fn kernel(f: &Fixture, hooks: Hooks) -> Kernel {
    Kernel::new(&f.app, Arc::new(SqliteFactory), hooks)
}

fn ctx(origin: Origin) -> Ctx {
    Ctx::new(origin, new_key())
}

fn init(k: &Kernel, f: &Fixture) {
    k.dispatch(
        &ctx(Origin::Cli),
        Request::WorkspaceInit {
            root: f.root.clone(),
        },
    )
    .unwrap();
}

fn create(k: &Kernel, c: &Ctx, title: &str) -> Result<Value, OaError> {
    k.dispatch(
        c,
        Request::MatterCreate {
            title: title.into(),
            client: ClientSpec::None,
            from: None,
        },
    )
    .map(|mut v| v.remove(0))
}

fn list(k: &Kernel, include_removed: bool) -> Vec<Value> {
    k.dispatch(
        &Ctx::query(Origin::Cli),
        Request::MatterList { include_removed },
    )
    .unwrap()
}

fn matter_dirs(root: &Path) -> Vec<PathBuf> {
    fs::read_dir(root)
        .unwrap()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir() && !p.file_name().unwrap().to_string_lossy().starts_with('.'))
        .collect()
}

fn id_of(v: &Value) -> String {
    v["id"].as_str().unwrap().to_string()
}

struct StopAt(Step);

impl FaultHook for StopAt {
    fn before(&self, step: Step) -> Result<(), OaError> {
        if step == self.0 {
            Err(OaError::new(
                ErrorCode::FaultInjected,
                format!("killed before {step:?}"),
            ))
        } else {
            Ok(())
        }
    }
}

struct SlowJobs(Duration);

impl FaultHook for SlowJobs {
    fn before_job_item(&self) {
        std::thread::sleep(self.0);
    }
}

#[derive(Default)]
struct CountingPresence {
    approve: bool,
    asked: AtomicUsize,
}

impl PresencePrompt for CountingPresence {
    fn confirm(&self, _summary: &str) -> bool {
        self.asked.fetch_add(1, Ordering::SeqCst);
        self.approve
    }
}

fn with_presence(p: Arc<CountingPresence>) -> Hooks {
    Hooks {
        presence: p,
        ..Hooks::default()
    }
}

#[test]
fn a_ac_01_create_writes_folder_manifest_and_genesis_then_registry_row() {
    let f = fixture();
    let k = kernel(&f, Hooks::default());
    init(&k, &f);
    let m = create(&k, &ctx(Origin::Cli), "State v. Rao").unwrap();
    let dir = PathBuf::from(m["path"].as_str().unwrap());

    for sub in SUBDIRS {
        assert!(dir.join(sub).is_dir(), "{sub} missing");
    }
    let manifest: Value = serde_json::from_slice(&fs::read(dir.join(MANIFEST)).unwrap()).unwrap();
    assert_eq!(manifest["id"], m["id"]);
    assert_eq!(manifest["title"], "State v. Rao");

    let store = SqliteFactory.open_matter(&dir).unwrap();
    let events = store.events().unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].command, "matter.created");
    assert_eq!(verify_chain(&events), Ok(()));

    let rows = list(&k, false);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["id"], m["id"]);
    assert_eq!(rows[0]["folder_present"], true);
}

#[test]
fn a_ac_01_create_order_survives_kill_at_every_step() {
    for step in Step::CREATE_ORDER {
        let f = fixture();
        init(&kernel(&f, Hooks::default()), &f);
        let key = new_key();

        let killed = kernel(
            &f,
            Hooks {
                faults: Arc::new(StopAt(step)),
                ..Hooks::default()
            },
        );
        let err = create(&killed, &Ctx::new(Origin::Cli, &key), "Killed").unwrap_err();
        assert_eq!(err.code, ErrorCode::FaultInjected, "{step:?}");

        let k = kernel(&f, Hooks::default());
        for row in list(&k, true) {
            assert!(
                Path::new(row["path"].as_str().unwrap())
                    .join(MANIFEST)
                    .is_file(),
                "{step:?}: registry row without a folder"
            );
        }
        let expected_dirs = usize::from(step == Step::WriteRegistryRow);
        assert_eq!(
            matter_dirs(&f.root).len(),
            expected_dirs,
            "{step:?}: half-built matter in the root"
        );

        // A retry with the same key completes, with exactly one matter.
        let m = create(&k, &Ctx::new(Origin::Cli, &key), "Killed").unwrap();
        assert_eq!(matter_dirs(&f.root).len(), 1, "{step:?}");
        let rows = list(&k, true);
        assert_eq!(rows.len(), 1, "{step:?}");
        assert_eq!(rows[0]["id"], m["id"], "{step:?}");
        let store = SqliteFactory
            .open_matter(Path::new(m["path"].as_str().unwrap()))
            .unwrap();
        assert_eq!(
            store.events().unwrap().len(),
            1,
            "{step:?}: duplicate genesis"
        );
        let staging = f.root.join(STAGING);
        let leftovers = fs::read_dir(&staging).map(|d| d.count()).unwrap_or(0);
        assert_eq!(leftovers, 0, "{step:?}: staging not cleaned on retry");
    }
}

#[test]
fn a_ac_01_repeated_key_creates_one_matter() {
    let f = fixture();
    let k = kernel(&f, Hooks::default());
    init(&k, &f);
    let c = ctx(Origin::Cli);
    let a = create(&k, &c, "Once").unwrap();
    let b = create(&k, &c, "Once").unwrap();
    assert_eq!(a["id"], b["id"]);
    assert_eq!(matter_dirs(&f.root).len(), 1);
}

#[test]
fn a_ac_02_rescan_rebuilds_a_deleted_registry() {
    let f = fixture();
    let k = kernel(&f, Hooks::default());
    init(&k, &f);
    let a = id_of(&create(&k, &ctx(Origin::Cli), "First").unwrap());
    let b = id_of(&create(&k, &ctx(Origin::Cli), "Second").unwrap());
    create(&k, &ctx(Origin::Cli), "Third").unwrap();
    k.dispatch(
        &ctx(Origin::Cli),
        Request::MatterRename {
            id: a.clone(),
            title: "First, renamed".into(),
        },
    )
    .unwrap();
    k.dispatch(&ctx(Origin::Cli), Request::MatterArchive { id: b.clone() })
        .unwrap();

    let summary = |rows: Vec<Value>| -> Vec<(Value, Value, Value)> {
        let mut v: Vec<_> = rows
            .into_iter()
            .map(|r| (r["id"].clone(), r["title"].clone(), r["archived"].clone()))
            .collect();
        v.sort_by_key(|t| t.0.to_string());
        v
    };
    let before = summary(list(&k, true));
    drop(k);

    for suffix in ["", "-wal", "-shm"] {
        let _ = fs::remove_file(f.app.join(format!("{REGISTRY_FILE}{suffix}")));
    }
    let k = kernel(&f, Hooks::default());
    assert!(list(&k, true).is_empty());
    k.dispatch(&ctx(Origin::Cli), Request::RegistryRescan)
        .unwrap();
    assert_eq!(summary(list(&k, true)), before);

    let dir = PathBuf::from(
        list(&k, false)
            .iter()
            .find(|r| r["id"] == a.as_str())
            .unwrap()["path"]
            .as_str()
            .unwrap(),
    );
    let events = SqliteFactory.open_matter(&dir).unwrap().events().unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(verify_chain(&events), Ok(()));
}

#[test]
fn a_ac_03_removed_folder_is_marked_removed_by_rescan() {
    let f = fixture();
    let k = kernel(&f, Hooks::default());
    init(&k, &f);
    let keep = create(&k, &ctx(Origin::Cli), "Keep").unwrap();
    let gone = create(&k, &ctx(Origin::Cli), "Gone").unwrap();
    fs::remove_dir_all(gone["path"].as_str().unwrap()).unwrap();

    let report = k
        .dispatch(&ctx(Origin::Cli), Request::RegistryRescan)
        .unwrap()
        .remove(0);
    assert_eq!(report["removed"], serde_json::json!([id_of(&gone)]));

    let live = list(&k, false);
    assert_eq!(live.len(), 1);
    assert_eq!(live[0]["id"], keep["id"]);
    let all = list(&k, true);
    let removed = all.iter().find(|r| r["id"] == gone["id"]).unwrap();
    assert_eq!(removed["removed"], true);
    assert_eq!(removed["title"], "Gone", "the last known title is kept");

    let err = k
        .dispatch(&ctx(Origin::Cli), Request::MatterOpen { id: id_of(&gone) })
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::MatterRemoved);
    assert!(
        !PathBuf::from(gone["path"].as_str().unwrap()).exists(),
        "a removed matter is not recreated"
    );
}

#[test]
fn a_ac_04_harness_writes_into_record_folders_are_refused_and_audited() {
    let f = fixture();
    let k = kernel(&f, Hooks::default());
    init(&k, &f);
    let m = create(&k, &ctx(Origin::Cli), "Writes").unwrap();
    let id = id_of(&m);
    let dir = PathBuf::from(m["path"].as_str().unwrap());
    let write = |relpath: &str| {
        k.dispatch(
            &ctx(Origin::Harness),
            Request::MatterWriteFile {
                id: id.clone(),
                relpath: relpath.into(),
                bytes: b"x".to_vec(),
            },
        )
    };

    let refused = [
        "evidence/a.pdf",
        "blobs/abc",
        "drafts/d1/r.docx",
        "Evidence\\b.pdf",
        "inbox/../evidence/c.pdf",
    ];
    for p in refused {
        let err = write(p).unwrap_err();
        assert_eq!(err.code, ErrorCode::WriteRefused, "{p}");
        assert_eq!(err.code.exit_code(), 3, "{p}");
    }
    assert_eq!(fs::read_dir(dir.join("evidence")).unwrap().count(), 0);
    assert_eq!(fs::read_dir(dir.join("blobs")).unwrap().count(), 0);

    let audit = SqliteFactory.open_matter(&dir).unwrap().rejected().unwrap();
    assert_eq!(audit.len(), refused.len());
    assert!(audit
        .iter()
        .all(|r| r.origin == "harness" && r.command == "matter.write_file"));

    write("inbox/from agent.pdf").unwrap();
    write("harness/scratch/notes.txt").unwrap();
    assert!(dir.join("inbox").join("from agent.pdf").is_file());
}

#[test]
fn a_ac_05_new_client_needs_confirmation_and_existing_client_does_not() {
    let f = fixture();
    let presence = Arc::new(CountingPresence {
        approve: true,
        ..Default::default()
    });
    let k = kernel(&f, with_presence(presence.clone()));
    init(&k, &f);
    SqliteFactory
        .firm(&f.app)
        .unwrap()
        .insert_contact(&Contact {
            id: "client-1".into(),
            name: "Existing Client".into(),
            creation_key: None,
            created_at: oa_types::now_utc(),
        })
        .unwrap();
    let make = |c: &Ctx, client: ClientSpec| {
        k.dispatch(
            c,
            Request::MatterCreate {
                title: "M".into(),
                client,
                from: None,
            },
        )
    };

    make(&ctx(Origin::Cli), ClientSpec::Existing("client-1".into())).unwrap();
    assert_eq!(
        presence.asked.load(Ordering::SeqCst),
        0,
        "existing client: no confirmation"
    );

    let m = make(&ctx(Origin::Cli), ClientSpec::New("New Client".into()))
        .unwrap()
        .remove(0);
    assert_eq!(
        presence.asked.load(Ordering::SeqCst),
        1,
        "new client: one confirmation"
    );
    assert!(m["client_id"].is_string());

    // From the harness, a new client becomes a pending confirmation.
    let before = matter_dirs(&f.root).len();
    let err = make(
        &ctx(Origin::Harness),
        ClientSpec::New("Agent Client".into()),
    )
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::ConfirmationRequired);
    assert_eq!(
        matter_dirs(&f.root).len(),
        before,
        "nothing created before confirmation"
    );
    let pending = err.detail.unwrap()["pending_id"]
        .as_str()
        .unwrap()
        .to_string();

    let refused = k
        .dispatch(
            &ctx(Origin::Harness),
            Request::MatterConfirm {
                pending: pending.clone(),
            },
        )
        .unwrap_err();
    assert_eq!(refused.code, ErrorCode::HumanCommandRefused);
    assert_eq!(
        SqliteFactory
            .firm(&f.app)
            .unwrap()
            .rejected()
            .unwrap()
            .len(),
        1
    );

    let confirmed = k
        .dispatch(&ctx(Origin::Cli), Request::MatterConfirm { pending })
        .unwrap()
        .remove(0);
    assert_eq!(presence.asked.load(Ordering::SeqCst), 2);
    assert_eq!(confirmed["title"], "M");
    assert_eq!(matter_dirs(&f.root).len(), before + 1);
}

#[test]
fn a_ac_05_denied_confirmation_creates_nothing() {
    let f = fixture();
    let presence = Arc::new(CountingPresence::default());
    let k = kernel(&f, with_presence(presence));
    init(&k, &f);
    let err = k
        .dispatch(
            &ctx(Origin::Cli),
            Request::MatterCreate {
                title: "M".into(),
                client: ClientSpec::New("Nobody".into()),
                from: None,
            },
        )
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::ConfirmationDenied);
    assert_eq!(err.code.exit_code(), 3);
    assert!(matter_dirs(&f.root).is_empty());
}

#[test]
fn a_ac_10_legal_layer_is_read_only() {
    let f = fixture();
    let k = kernel(&f, Hooks::default());
    init(&k, &f);
    let err = k
        .dispatch(
            &ctx(Origin::Cli),
            Request::SettingsSet {
                key: "legal.rule_pack".into(),
                value: "mine".into(),
            },
        )
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::LegalLayerReadOnly);
    assert_eq!(err.code.exit_code(), 3);
    assert_eq!(
        SqliteFactory
            .firm(&f.app)
            .unwrap()
            .rejected()
            .unwrap()
            .len(),
        1
    );

    let legal = k
        .dispatch(
            &Ctx::query(Origin::Cli),
            Request::SettingsGet {
                key: "legal.rule_pack".into(),
            },
        )
        .unwrap()
        .remove(0);
    assert_eq!(legal["layer"], "legal");
    assert_eq!(legal["value"], "unpinned");

    k.dispatch(
        &ctx(Origin::Cli),
        Request::SettingsSet {
            key: "firm.display.date_format".into(),
            value: "dd.mm.yyyy".into(),
        },
    )
    .unwrap();
    let firm = k
        .dispatch(
            &Ctx::query(Origin::Cli),
            Request::SettingsGet {
                key: "firm.display.date_format".into(),
            },
        )
        .unwrap()
        .remove(0);
    assert_eq!(firm["layer"], "firm");
}

#[test]
fn a_ac_12_cancel_stops_a_long_job_within_2_seconds() {
    let f = fixture();
    let k = kernel(&f, Hooks::default());
    init(&k, &f);
    for i in 0..40 {
        create(&k, &ctx(Origin::Cli), &format!("Matter {i}")).unwrap();
    }

    let slow = kernel(
        &f,
        Hooks {
            faults: Arc::new(SlowJobs(Duration::from_millis(150))),
            ..Hooks::default()
        },
    );
    let runner =
        std::thread::spawn(move || slow.dispatch(&ctx(Origin::Cli), Request::RegistryRescan));

    let job_id = loop {
        let jobs = k
            .dispatch(&Ctx::query(Origin::Cli), Request::JobList)
            .unwrap();
        if let Some(j) = jobs
            .iter()
            .find(|j| j["status"] == "running" && j["done"].as_i64() >= Some(1))
        {
            break j["id"].as_str().unwrap().to_string();
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let asked = Instant::now();
    k.dispatch(&ctx(Origin::Cli), Request::JobCancel { id: job_id.clone() })
        .unwrap();
    let result = runner.join().unwrap();
    let elapsed = asked.elapsed();

    assert!(elapsed < Duration::from_secs(2), "cancel took {elapsed:?}");
    assert_eq!(result.unwrap_err().code, ErrorCode::Cancelled);
    let job = k
        .dispatch(&Ctx::query(Origin::Cli), Request::JobShow { id: job_id })
        .unwrap()
        .remove(0);
    assert_eq!(job["status"], "cancelled");
    assert!(job["done"].as_i64().unwrap() < 40, "the job stopped early");
}

#[test]
fn internal_commands_need_an_idempotency_key() {
    let f = fixture();
    let k = kernel(&f, Hooks::default());
    let err = k
        .dispatch(
            &Ctx::query(Origin::Cli),
            Request::WorkspaceInit {
                root: f.root.clone(),
            },
        )
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::Usage);
}

#[test]
fn renaming_appends_a_chained_event_and_repeats_are_idempotent() {
    let f = fixture();
    let k = kernel(&f, Hooks::default());
    init(&k, &f);
    let m = create(&k, &ctx(Origin::Cli), "Old").unwrap();
    let c = ctx(Origin::Cli);
    let rename = || {
        k.dispatch(
            &c,
            Request::MatterRename {
                id: id_of(&m),
                title: "New".into(),
            },
        )
        .unwrap()
    };
    rename();
    rename();
    let dir = PathBuf::from(m["path"].as_str().unwrap());
    let events = SqliteFactory.open_matter(&dir).unwrap().events().unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(events[1].command, "matter.renamed");
    assert_eq!(verify_chain(&events), Ok(()));
    let manifest: Value = serde_json::from_slice(&fs::read(dir.join(MANIFEST)).unwrap()).unwrap();
    assert_eq!(manifest["title"], "New");
}

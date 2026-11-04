//! Spec O through the kernel: contacts in `firm.db`, party roles and the
//! correspondence log through the single commit path, the timeline built from
//! the ledger, and matter creation consulting firm data for the client.

use std::sync::Arc;

use oa_kernel::{ClientSpec, ContactInput, Ctx, Hooks, Kernel, PresencePrompt, Request};
use oa_store::sqlite::SqliteFactory;
use oa_types::{new_key, ErrorCode, OaError, Origin};
use serde_json::Value;

struct Present;
impl PresencePrompt for Present {
    fn confirm(&self, _summary: &str) -> bool {
        true
    }
}

struct Fx {
    tmp: tempfile::TempDir,
    k: Kernel,
}

fn cli() -> Ctx {
    Ctx::new(Origin::Cli, new_key())
}

fn harness() -> Ctx {
    Ctx::new(Origin::Harness, new_key())
}

fn q() -> Ctx {
    Ctx::query(Origin::Cli)
}

fn fx() -> Fx {
    let tmp = tempfile::tempdir().unwrap();
    let k = Kernel::new(
        tmp.path().join("app data ñ"),
        Arc::new(SqliteFactory),
        Hooks {
            presence: Arc::new(Present),
            ..Hooks::default()
        },
    );
    k.dispatch(
        &cli(),
        Request::WorkspaceInit {
            root: tmp.path().join("Matter Files अधिवक्ता"),
        },
    )
    .unwrap();
    Fx { tmp, k }
}

fn one(k: &Kernel, c: &Ctx, r: Request) -> Result<Value, OaError> {
    k.dispatch(c, r).map(|mut v| v.remove(0))
}

fn id(v: &Value) -> String {
    v["id"].as_str().unwrap().to_string()
}

fn matter(k: &Kernel, title: &str, client: ClientSpec) -> String {
    id(&one(
        k,
        &cli(),
        Request::MatterCreate {
            title: title.into(),
            client,
            from: None,
        },
    )
    .unwrap())
}

fn add(k: &Kernel, c: &Ctx, name: &str, kind: &str) -> Result<Value, OaError> {
    one(
        k,
        c,
        Request::ContactsAdd {
            contact: ContactInput {
                name: name.into(),
                kind: kind.into(),
                ..Default::default()
            },
        },
    )
}

fn set_party(k: &Kernel, m: &str, contact: &str, role: &str, record: Option<&str>) -> Value {
    one(
        k,
        &cli(),
        Request::PartiesSet {
            matter: m.into(),
            contact: contact.into(),
            role: role.into(),
            record_name: record.map(str::to_string),
        },
    )
    .unwrap()
}

fn log(k: &Kernel, m: &str, kind: &str, summary: &str, contact: Option<&str>) -> Value {
    one(
        k,
        &cli(),
        Request::CorrespondenceLog {
            matter: m.into(),
            kind: kind.into(),
            summary: summary.into(),
            contact: contact.map(str::to_string),
            occurred_at: None,
        },
    )
    .unwrap()
}

fn timeline(k: &Kernel, m: Option<&str>, c: Option<&str>) -> Vec<Value> {
    k.dispatch(
        &q(),
        Request::Timeline {
            matter: m.map(str::to_string),
            contact: c.map(str::to_string),
        },
    )
    .unwrap()
}

fn table_names(db: &std::path::Path) -> Vec<String> {
    let conn = rusqlite::Connection::open(db).unwrap();
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .unwrap();
    let names = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    names
}

#[test]
fn o_ac_01_deleting_and_rebuilding_the_timeline_gives_the_same_entries() {
    let f = fx();
    let client = id(&add(&f.k, &cli(), "Ramesh Kumar", "person").unwrap());
    let m = matter(&f.k, "Kumar v. State", ClientSpec::Existing(client.clone()));
    set_party(&f.k, &m, &client, "petitioner", None);
    log(
        &f.k,
        &m,
        "call",
        "Client called about the next date",
        Some(&client),
    );
    log(
        &f.k,
        &m,
        "meeting",
        "Conference on the counter affidavit",
        None,
    );

    let first = timeline(&f.k, Some(&m), None);
    // The timeline is computed on every call; there is nothing to delete but
    // the answer itself, and computing it again gives the same entries.
    drop(first.clone());
    let rebuilt = timeline(&f.k, Some(&m), None);
    assert_eq!(first, rebuilt);

    // One entry per ledger event, in ledger order.
    let ledger =
        f.k.dispatch(
            &q(),
            Request::LedgerTail {
                matter: m.clone(),
                n: Some(1000),
            },
        )
        .unwrap();
    assert_eq!(first.len(), ledger.len());
    let seqs: Vec<i64> = first.iter().map(|e| e["seq"].as_i64().unwrap()).collect();
    assert_eq!(seqs, (1..=ledger.len() as i64).collect::<Vec<_>>());
    assert_eq!(first[2]["kind"], "call");
    assert_eq!(first[3]["kind"], "meeting");

    // No timeline table exists in either database (O rule 2).
    let app = f.tmp.path().join("app data ñ");
    let rows =
        f.k.dispatch(
            &q(),
            Request::MatterList {
                include_removed: false,
            },
        )
        .unwrap();
    let row = rows.iter().find(|r| r["id"] == m.as_str()).unwrap();
    let matter_db = std::path::Path::new(row["path"].as_str().unwrap()).join("matter.db");
    for db in [app.join("firm.db"), matter_db] {
        assert!(
            !table_names(&db).iter().any(|t| t.contains("timeline")),
            "{} stores a timeline",
            db.display()
        );
    }
}

#[test]
fn o_ac_02_a_party_whose_record_name_differs_keeps_and_shows_both() {
    let f = fx();
    let m = matter(&f.k, "Kumar v. State", ClientSpec::None);
    let c = id(&add(&f.k, &cli(), "Ramesh Kumar", "person").unwrap());
    set_party(&f.k, &m, &c, "petitioner", Some("R. Kumar s/o Shyam Lal"));
    let parties =
        f.k.dispatch(&q(), Request::PartiesList { matter: m.clone() })
            .unwrap();
    assert_eq!(parties.len(), 1);
    let p = &parties[0];
    assert_eq!(p["contact_name"], "Ramesh Kumar");
    assert_eq!(p["record_name"], "R. Kumar s/o Shyam Lal");
    assert_eq!(p["names_differ"], true);
    let label = p["label"].as_str().unwrap();
    assert!(label.contains("Ramesh Kumar") && label.contains("R. Kumar s/o Shyam Lal"));

    // Setting the role again updates the one row, through the ledger, and
    // keeps the record name unless a new one is given.
    set_party(&f.k, &m, &c, "respondent", Some("R. Kumar s/o Shyam Lal"));
    let parties =
        f.k.dispatch(&q(), Request::PartiesList { matter: m.clone() })
            .unwrap();
    assert_eq!(parties.len(), 1);
    assert_eq!(parties[0]["role"], "respondent");
    let t = timeline(&f.k, Some(&m), None);
    assert_eq!(t.last().unwrap()["command"], "party.set");
}

#[test]
fn o_ac_03_no_command_in_this_group_makes_a_network_request() {
    let f = fx();
    let c = id(&add(&f.k, &cli(), "Asha Rao", "counsel").unwrap());
    let court = one(
        &f.k,
        &cli(),
        Request::ContactsAdd {
            contact: ContactInput {
                name: "High Court of Delhi".into(),
                kind: "court".into(),
                source: Some("codebook:hc/DL".into()),
                ..Default::default()
            },
        },
    )
    .unwrap();
    let m = matter(&f.k, "Rao v. Union", ClientSpec::Existing(c.clone()));
    let edit = ContactInput {
        name: "Asha Rao".into(),
        kind: "counsel".into(),
        email: Some("asha@example.invalid".into()),
        ..Default::default()
    };
    one(
        &f.k,
        &cli(),
        Request::ContactsEdit {
            id: c.clone(),
            contact: edit,
        },
    )
    .unwrap();
    set_party(&f.k, &m, &c, "petitioner", None);
    log(&f.k, &m, "letter", "Sent a copy of the order", Some(&c));
    f.k.dispatch(&q(), Request::ContactsList { kind: None })
        .unwrap();
    one(&f.k, &q(), Request::ContactsShow { id: c.clone() }).unwrap();
    one(&f.k, &q(), Request::ContactsShow { id: id(&court) }).unwrap();
    f.k.dispatch(&q(), Request::PartiesList { matter: m.clone() })
        .unwrap();
    timeline(&f.k, Some(&m), None);
    timeline(&f.k, None, Some(&c));

    // No browser profile started and the egress log is empty: the only
    // network path in the application went unused.
    assert!(f
        .k
        .dispatch(&q(), Request::BrowserState { profile: None })
        .unwrap()
        .iter()
        .all(|s| s["state"] != "running"));
    assert!(f
        .k
        .dispatch(
            &q(),
            Request::BrowserEgress {
                profile: None,
                refused: false
            }
        )
        .unwrap()
        .is_empty());
    // And the firm-data logic links no network code at all.
    let manifest = include_str!("../../oa-firm/Cargo.toml");
    let deps = manifest.split("[dependencies]").nth(1).unwrap();
    for line in deps.lines().filter(|l| l.contains('=')) {
        let name = line.split(['.', '=']).next().unwrap().trim();
        assert!(
            ["serde", "serde_json"].contains(&name),
            "oa-firm depends on {name}"
        );
    }
}

#[test]
fn o_ac_05_a_contact_page_lists_every_matter_and_role_and_the_timeline_opens_in_the_inspector() {
    let f = fx();
    let c = id(&add(&f.k, &cli(), "Ramesh Kumar", "person").unwrap());
    let other = id(&add(&f.k, &cli(), "Suresh Lal", "person").unwrap());
    let m1 = matter(&f.k, "Kumar v. Lal", ClientSpec::Existing(c.clone()));
    let m2 = matter(&f.k, "Lal v. Kumar", ClientSpec::None);
    set_party(&f.k, &m1, &c, "petitioner", None);
    set_party(&f.k, &m1, &other, "respondent", None);
    // The edge case: petitioner in one matter, respondent in another.
    set_party(&f.k, &m2, &c, "respondent", Some("Ramesh K."));
    log(&f.k, &m2, "call", "Opposite counsel called", Some(&c));

    let page = one(&f.k, &q(), Request::ContactsShow { id: c.clone() }).unwrap();
    let roles: Vec<(String, String)> = page["matters"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| {
            (
                r["matter"].as_str().unwrap().to_string(),
                r["role"].as_str().unwrap().to_string(),
            )
        })
        .collect();
    assert_eq!(roles.len(), 3);
    assert!(roles.contains(&(m1.clone(), "client".into())));
    assert!(roles.contains(&(m1.clone(), "petitioner".into())));
    assert!(roles.contains(&(m2.clone(), "respondent".into())));

    let t = timeline(&f.k, None, Some(&c));
    // Matter creation for the client, two party roles, one call.
    assert_eq!(t.len(), 4, "{t:#?}");
    for e in &t {
        let got = one(
            &f.k,
            &q(),
            Request::Inspect {
                matter: e["matter"].as_str().unwrap().into(),
                id: e["id"].as_str().unwrap().into(),
            },
        )
        .unwrap();
        assert_eq!(got["kind"], "ledger_event");
        assert_eq!(got["record"]["seq"], e["seq"]);
    }
    // A party row opens too, with the event that wrote it.
    let party = one(
        &f.k,
        &q(),
        Request::Inspect {
            matter: m2.clone(),
            id: format!("party:{c}"),
        },
    )
    .unwrap();
    assert_eq!(party["kind"], "party");
    assert_eq!(party["record"]["record_name"], "Ramesh K.");
    assert!(!party["events"].as_array().unwrap().is_empty());
}

#[test]
fn two_contacts_with_the_same_name_stay_apart() {
    let f = fx();
    let a = id(&add(&f.k, &cli(), "Ramesh Kumar", "person").unwrap());
    let b = id(&add(&f.k, &cli(), "Ramesh Kumar", "person").unwrap());
    assert_ne!(a, b);
    let all =
        f.k.dispatch(&q(), Request::ContactsList { kind: None })
            .unwrap();
    assert_eq!(all.len(), 2);
}

#[test]
fn contacts_add_is_idempotent_and_validates() {
    let f = fx();
    let c = cli();
    let a = add(&f.k, &c, "Ramesh Kumar", "person").unwrap();
    let again = add(&f.k, &c, "Ramesh Kumar", "person").unwrap();
    assert_eq!(a["id"], again["id"]);
    let err = add(&f.k, &cli(), "High Court of Delhi", "court").unwrap_err();
    assert_eq!(err.code, ErrorCode::Usage);
    assert!(err.message.contains("source"));
    let m = matter(&f.k, "M", ClientSpec::None);
    let err = one(
        &f.k,
        &cli(),
        Request::PartiesSet {
            matter: m,
            contact: id(&a),
            role: "judge".into(),
            record_name: None,
        },
    )
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::Usage);
}

#[test]
fn rq_87_a_contact_only_the_agent_added_needs_the_new_client_confirmation() {
    let f = fx();
    let c = add(&f.k, &harness(), "Agent Found Client", "person").unwrap();
    assert_eq!(c["confirmed"], false);
    let err = one(
        &f.k,
        &harness(),
        Request::MatterCreate {
            title: "Client v. State".into(),
            client: ClientSpec::Existing(id(&c)),
            from: None,
        },
    )
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::ConfirmationRequired);
    let pending = err.detail.unwrap()["pending_id"]
        .as_str()
        .unwrap()
        .to_string();
    let created = one(&f.k, &cli(), Request::MatterConfirm { pending }).unwrap();
    assert_eq!(
        created["client_id"], c["id"],
        "the existing contact is used"
    );
    let all =
        f.k.dispatch(&q(), Request::ContactsList { kind: None })
            .unwrap();
    assert_eq!(all.len(), 1, "no duplicate contact");
    assert_eq!(all[0]["confirmed"], true);

    // Once confirmed, the agent may open further matters for the client.
    one(
        &f.k,
        &harness(),
        Request::MatterCreate {
            title: "Second".into(),
            client: ClientSpec::Existing(id(&c)),
            from: None,
        },
    )
    .unwrap();
}

#[test]
fn with_firm_data_unavailable_contacts_are_refused_and_matter_work_continues() {
    let f = fx();
    let c = id(&add(&f.k, &cli(), "Ramesh Kumar", "person").unwrap());
    let m = matter(&f.k, "Kumar v. State", ClientSpec::Existing(c.clone()));
    set_party(&f.k, &m, &c, "petitioner", Some("R. Kumar"));

    let app = f.tmp.path().join("app data ñ");
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(app.join(format!("firm.db{suffix}")));
    }
    std::fs::create_dir(app.join("firm.db")).unwrap();

    let err = add(&f.k, &cli(), "New Person", "person").unwrap_err();
    assert_eq!(err.code, ErrorCode::Unavailable);
    assert_eq!(err.code.exit_code(), 5);
    assert!(err.message.contains("firm data is unavailable"));
    let err = one(
        &f.k,
        &cli(),
        Request::MatterCreate {
            title: "New".into(),
            client: ClientSpec::New("Someone".into()),
            from: None,
        },
    )
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::Unavailable);

    // Other matter work continues.
    let parties =
        f.k.dispatch(&q(), Request::PartiesList { matter: m.clone() })
            .unwrap();
    assert_eq!(parties[0]["firm_unavailable"], true);
    assert!(parties[0]["label"].as_str().unwrap().contains("R. Kumar"));
    log(&f.k, &m, "call", "Called the registry", None);
    assert!(!timeline(&f.k, Some(&m), None).is_empty());
}

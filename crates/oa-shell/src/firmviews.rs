//! The spec O views: contacts (each with every matter and role), a matter's
//! parties, and the activity timeline built from the ledger. Pure tables,
//! like `views.rs`.

use serde_json::{json, Value};

use crate::browserviews::ist;
use crate::views::{clip, rec, s, Row, Subject, Table, Tone, ViewId};

/// The page argument of the Timeline view for a contact's activity.
pub const CONTACT_PREFIX: &str = "contact:";

fn roles_line(matters: &Value) -> String {
    let mut out: Vec<(String, Vec<String>)> = Vec::new();
    for m in matters.as_array().into_iter().flatten() {
        let title = s(m, "title");
        let role = s(m, "role");
        match out.iter_mut().find(|(t, _)| *t == title) {
            Some((_, roles)) => roles.push(role),
            None => out.push((title, vec![role])),
        }
    }
    out.iter()
        .map(|(t, r)| format!("{t} ({})", r.join(", ")))
        .collect::<Vec<_>>()
        .join("; ")
}

fn details_line(c: &Value) -> String {
    let d = &c["details"];
    ["organisation", "phone", "email", "address"]
        .iter()
        .filter_map(|k| d[k].as_str())
        .collect::<Vec<_>>()
        .join(", ")
}

/// The contact list: every contact and organisation, each with every matter
/// and role. A contact the agent added and no advocate has confirmed is
/// marked, because using it as a client needs the RQ-87 confirmation.
pub fn contacts_table(values: &[Value]) -> Table {
    let rows: Vec<Row> = values
        .iter()
        .map(|c| {
            let confirmed = c["confirmed"] != false;
            Row {
                cells: vec![
                    s(c, "name"),
                    s(c, "kind"),
                    clip(&roles_line(&c["matters"]), 90),
                    clip(&details_line(c), 50),
                    if confirmed {
                        c["source"]
                            .as_str()
                            .map(|src| format!("source {src}"))
                            .unwrap_or_default()
                    } else {
                        "added by the agent, not confirmed".into()
                    },
                ],
                subject: Subject::Raw(c.clone()),
                tone: if confirmed { Tone::Normal } else { Tone::Warn },
            }
        })
        .collect();
    Table::new(
        ViewId::Contacts,
        &["Name", "Kind", "Matters and roles", "Details", "Note"],
        rows,
        "No contacts yet. Add one below or with `oa contacts add <name>`.",
    )
}

/// A contact page (`contacts.show`): the contact, then one row per matter
/// and role. Each matter row opens the matter's record in the Inspector.
pub fn contact_page_table(page: &Value) -> Table {
    let mut rows = vec![Row {
        cells: vec![
            s(page, "name"),
            format!("contact ({})", s(page, "kind")),
            String::new(),
            s(page, "id"),
        ],
        subject: Subject::Raw(json!({
            "id": page["id"], "name": page["name"], "kind": page["kind"],
            "source": page["source"], "details": page["details"],
            "confirmed": page["confirmed"], "created_at": page["created_at"],
            "updated_at": page["updated_at"],
        })),
        tone: Tone::Muted,
    }];
    for m in page["matters"].as_array().into_iter().flatten() {
        let record = s(m, "record_name");
        rows.push(Row {
            cells: vec![
                s(m, "title"),
                s(m, "role"),
                if record.is_empty() {
                    String::new()
                } else {
                    format!("in the record: {record}")
                },
                s(m, "matter"),
            ],
            subject: rec(&s(m, "matter"), s(m, "matter")),
            tone: Tone::Normal,
        });
    }
    let mut t = Table::new(
        ViewId::Contacts,
        &["Matter", "Role", "Name in the record", "Id"],
        rows,
        "",
    );
    let n = page["matters"].as_array().map_or(0, Vec::len);
    let details = details_line(page);
    t.banner = Some((
        if page["confirmed"] == false {
            Tone::Warn
        } else {
            Tone::Muted
        },
        format!(
            "{}, {}{}. {}{}",
            s(page, "name"),
            s(page, "kind"),
            if details.is_empty() {
                String::new()
            } else {
                format!(": {details}")
            },
            match n {
                0 => "Not in any matter yet.".to_string(),
                1 => "One matter role.".to_string(),
                n => format!("{n} matter roles."),
            },
            if page["confirmed"] == false {
                " Added by the agent and not confirmed: using it as a client needs your confirmation."
            } else {
                ""
            },
        ),
    ));
    t
}

/// A matter's parties. Where the record name differs from the contact's
/// name, both show (O-AC-02).
pub fn parties_table(matter: &str, values: &[Value]) -> Table {
    let rows: Vec<Row> = values
        .iter()
        .map(|p| Row {
            cells: vec![
                s(p, "role"),
                s(p, "label"),
                s(p, "contact_name"),
                s(p, "record_name"),
                s(p, "contact"),
            ],
            subject: rec(matter, s(p, "id")),
            tone: if p["names_differ"] == true {
                Tone::Warn
            } else {
                Tone::Normal
            },
        })
        .collect();
    let mut t = Table::new(
        ViewId::Parties,
        &[
            "Role",
            "Party",
            "Contact name",
            "Name in the record",
            "Contact",
        ],
        rows,
        "No party roles recorded. Record one below or with `oa parties set`.",
    );
    if values.iter().any(|p| p["firm_unavailable"] == true) {
        t.banner = Some((
            Tone::Warn,
            "Firm data is unavailable: contact names cannot be shown, the names in the record can. Other matter work continues.".into(),
        ));
    }
    t
}

/// The activity timeline: one row per ledger event, each opening that event
/// in the Inspector. `scope` names whose activity it is.
pub fn timeline_table(values: &[Value], scope: &str) -> Table {
    let rows: Vec<Row> = values
        .iter()
        .map(|e| {
            let kind = s(e, "kind");
            Row {
                cells: vec![
                    ist(&s(e, "at")),
                    clip(&s(e, "matter_title"), 30),
                    kind.clone(),
                    clip(&s(e, "summary"), 90),
                    format!("{} via {}", s(e, "actor"), s(e, "origin")),
                ],
                subject: rec(&s(e, "matter"), s(e, "id")),
                tone: match kind.as_str() {
                    "call" | "meeting" | "letter" | "email" | "notice" => Tone::Good,
                    "filing" => Tone::Warn,
                    _ => Tone::Normal,
                },
            }
        })
        .collect();
    let mut t = Table::new(
        ViewId::Timeline,
        &["Time", "Matter", "Kind", "What happened", "By"],
        rows,
        "No activity yet.",
    );
    t.banner = Some((
        Tone::Muted,
        format!(
            "Activity of {scope}, computed from the ledger. Nothing here is stored separately."
        ),
    ));
    t
}

const M: &str = "01M0000000000000000000000A";

/// Gallery fixtures.
pub fn typical(view: ViewId, n: usize, disputed: bool) -> Table {
    let at = |i: usize| format!("2026-11-04T{:02}:{:02}:00.000Z", 3 + (i / 60) % 20, i % 60);
    let names = [
        "Ramesh Kumar",
        "Union of India",
        "Asha Rao",
        "High Court of Delhi",
        "Suresh Lal",
    ];
    let kinds = ["person", "organisation", "counsel", "court", "person"];
    match view {
        ViewId::Contacts if disputed => contact_page_table(&json!({
            "id": "C0", "name": "Ramesh Kumar", "kind": "person", "confirmed": true,
            "details": { "phone": "+91 98100 00000", "email": "ramesh@example.invalid" },
            "matters": (0..n).map(|i| json!({
                "matter": format!("01M00000000000000000000{i:03}"),
                "title": (["Kumar v. State", "Lal v. Kumar", "Kumar v. Union of India"][i % 3]),
                "role": (["client", "petitioner", "respondent"][i % 3]),
                "record_name": if i % 3 == 0 { Value::Null } else { json!("R. Kumar s/o Shyam Lal") },
            })).collect::<Vec<_>>(),
        })),
        ViewId::Contacts => contacts_table(
            &(0..n)
                .map(|i| {
                    let court = kinds[i % 5] == "court";
                    json!({
                        "id": format!("C{i}"),
                        "name": if i < 5 { names[i].to_string() } else { format!("{} {i}", names[i % 5]) },
                        "kind": kinds[i % 5],
                        "source": if court { json!("codebook:hc/DL") } else { Value::Null },
                        "confirmed": i % 7 != 6,
                        "details": match kinds[i % 5] {
                            "person" => json!({ "phone": "+91 98100 00000" }),
                            "organisation" => json!({ "organisation": "Ministry of Law and Justice" }),
                            "counsel" => json!({ "email": "chambers@example.invalid" }),
                            _ => json!({}),
                        },
                        "matters": if court { json!([]) } else { json!([
                            { "matter": M, "title": "Kumar v. State", "role": if i % 2 == 0 { "client" } else { "respondent" } },
                            { "matter": M, "title": "Kumar v. State", "role": "petitioner" },
                        ]) },
                    })
                })
                .collect::<Vec<_>>(),
        ),
        ViewId::Parties => parties_table(
            M,
            &(0..n)
                .map(|i| {
                    let name = names[i % 5];
                    let record = [
                        "R. Kumar s/o Shyam Lal",
                        "Union of India through the Secretary, Ministry of Home Affairs",
                        "Asha Rao",
                        "High Court of Delhi",
                        "Suresh Lal",
                    ][i % 5]
                        .to_string();
                    let differs = record != name;
                    json!({
                        "id": format!("party:C{i}"),
                        "contact": format!("C{i}"),
                        "role": (["petitioner", "respondent", "proforma_respondent", "intervenor"][i % 4]),
                        "contact_name": if disputed { Value::Null } else { json!(name) },
                        "record_name": record,
                        "label": if disputed { format!("{record} (contact name unavailable)") } else if differs { format!("{name} (in the record: {record})") } else { name.to_string() },
                        "names_differ": differs && !disputed,
                        "firm_unavailable": disputed,
                    })
                })
                .collect::<Vec<_>>(),
        ),
        ViewId::Timeline => timeline_table(
            &(0..n)
                .map(|i| {
                    let (command, kind, summary) = [
                        ("matter.created", "matter", "matter.created: Kumar v. State".to_string()),
                        ("party.set", "party", "R. Kumar s/o Shyam Lal recorded as petitioner".to_string()),
                        ("correspondence.logged", "call", "call: Client asked about the next date".to_string()),
                        ("evidence.added", "evidence", format!("evidence.added: order-{i}.pdf")),
                        ("correspondence.logged", "meeting", "meeting: Conference on the counter affidavit".to_string()),
                        ("filing.pdf_converted", "filing", "filing.pdf_converted".to_string()),
                    ][i % 6].clone();
                    json!({
                        "matter": M, "matter_title": "Kumar v. State",
                        "id": format!("event:{}", i + 1), "seq": i + 1, "at": at(i),
                        "actor": if i % 4 == 3 { "agent" } else { "advocate" },
                        "origin": if i % 4 == 3 { "harness" } else { "cli" },
                        "command": command, "kind": kind, "summary": summary,
                    })
                })
                .collect::<Vec<_>>(),
            if disputed { "Ramesh Kumar" } else { "Kumar v. State" },
        ),
        _ => Table::new(view, &[], Vec::new(), ""),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::views::{fixture, GalleryState};

    #[test]
    fn o_ac_02_the_parties_view_shows_both_names_when_they_differ() {
        let t = fixture(ViewId::Parties, GalleryState::Typical);
        let row = &t.rows[0];
        assert!(row.cells[1].contains("Ramesh Kumar"));
        assert!(row.cells[1].contains("in the record: R. Kumar s/o Shyam Lal"));
        assert_eq!(row.cells[2], "Ramesh Kumar");
        assert_eq!(row.cells[3], "R. Kumar s/o Shyam Lal");
        assert_eq!(row.tone, Tone::Warn);
        assert_eq!(
            t.rows[2].cells[1], t.rows[2].cells[2],
            "same names show once"
        );
        assert_eq!(t.rows[2].tone, Tone::Normal);
        assert!(t.all_rows_inspectable());
    }

    #[test]
    fn o_ac_05_the_contact_page_lists_every_matter_and_role_and_timeline_rows_open_events() {
        let page = fixture(ViewId::Contacts, GalleryState::Disputed);
        let roles: Vec<&str> = page.rows[1..].iter().map(|r| r.cells[1].as_str()).collect();
        assert_eq!(roles.len(), 6);
        assert!(["client", "petitioner", "respondent"]
            .iter()
            .all(|r| roles.contains(r)));
        for r in &page.rows[1..] {
            let Subject::Record { matter, id } = &r.subject else {
                panic!("a matter row opens the matter record");
            };
            assert_eq!(matter, id);
        }
        let list = fixture(ViewId::Contacts, GalleryState::Typical);
        assert_eq!(list.rows[0].cells[2], "Kumar v. State (client, petitioner)");

        let t = fixture(ViewId::Timeline, GalleryState::Typical);
        for (i, r) in t.rows.iter().enumerate() {
            assert_eq!(r.subject, rec(M, format!("event:{}", i + 1)));
        }
        assert!(t.banner.unwrap().1.contains("computed from the ledger"));
    }

    #[test]
    fn firm_data_unavailable_is_a_visible_state_in_the_parties_view() {
        let t = fixture(ViewId::Parties, GalleryState::Disputed);
        assert!(t.banner.unwrap().1.contains("Firm data is unavailable"));
        assert!(t.rows[0].cells[1].contains("contact name unavailable"));
    }

    #[test]
    fn an_unconfirmed_contact_is_marked() {
        let t = fixture(ViewId::Contacts, GalleryState::Large);
        let r = &t.rows[6];
        assert_eq!(r.tone, Tone::Warn);
        assert!(r.cells[4].contains("not confirmed"));
    }
}

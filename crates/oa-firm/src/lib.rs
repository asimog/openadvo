//! Firm data (spec O), the pure part: the vocabularies for contacts, party
//! roles and the correspondence log, a contact's matters and roles, and the
//! activity timeline. The timeline is computed from ledger events and stores
//! nothing (O rule 2). No kernel, no store, no network (O-AC-03).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Contacts, organisations, counsel, courts and benches (O01).
pub const CONTACT_KINDS: &[&str] = &["person", "organisation", "counsel", "court", "bench"];

/// Party roles in a matter (O02). `other` keeps a role the list lacks.
pub const PARTY_ROLES: &[&str] = &[
    "petitioner",
    "respondent",
    "appellant",
    "applicant",
    "plaintiff",
    "defendant",
    "complainant",
    "accused",
    "intervenor",
    "caveator",
    "proforma_respondent",
    "witness",
    "other",
];

/// What the correspondence log records (O04). It records; it never sends.
pub const CORRESPONDENCE_KINDS: &[&str] = &["call", "meeting", "letter", "email", "notice"];

/// The ledger event names this group writes.
pub const PARTY_EVENT: &str = "party.set";
pub const CORRESPONDENCE_EVENT: &str = "correspondence.logged";

fn norm(s: &str) -> String {
    s.trim().to_lowercase().replace(['-', ' '], "_")
}

fn one_of(what: &str, value: &str, list: &[&str]) -> Result<String, String> {
    let v = norm(value);
    if list.contains(&v.as_str()) {
        Ok(v)
    } else {
        Err(format!(
            "unknown {what} \"{value}\": use one of {}",
            list.join(", ")
        ))
    }
}

/// Validates a contact. Courts and benches are reference data and need a
/// source, for example the F12 codebook entry they come from (O rule 4).
/// Returns the normalised kind.
pub fn check_contact(kind: &str, name: &str, source: Option<&str>) -> Result<String, String> {
    if name.trim().is_empty() {
        return Err("a contact needs a name".into());
    }
    let kind = one_of("contact kind", kind, CONTACT_KINDS)?;
    if matches!(kind.as_str(), "court" | "bench") && source.is_none_or(|s| s.trim().is_empty()) {
        return Err(format!(
            "a {kind} is reference data and needs a source, for example codebook:<scheme>/<code>"
        ));
    }
    Ok(kind)
}

pub fn check_role(role: &str) -> Result<String, String> {
    one_of("party role", role, PARTY_ROLES)
}

pub fn check_correspondence(kind: &str, summary: &str) -> Result<String, String> {
    if summary.trim().is_empty() {
        return Err("a correspondence entry needs a summary".into());
    }
    one_of("correspondence kind", kind, CORRESPONDENCE_KINDS)
}

/// The record id of a party row: one row per contact per matter.
pub fn party_id(contact: &str) -> String {
    format!("party:{contact}")
}

/// A party in a matter: a reference to a contact, a role, and the name as it
/// appears in the record. Both names are kept (O rule 1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Party {
    pub contact: String,
    pub role: String,
    pub record_name: String,
}

/// How a party reads in a list: one name when they agree, both when they
/// differ (O-AC-02). `display` is `None` when firm data is unavailable.
pub fn party_label(display: Option<&str>, record_name: &str) -> String {
    match display {
        Some(d) if same_name(d, record_name) => d.to_string(),
        Some(d) => format!("{d} (in the record: {record_name})"),
        None => format!("{record_name} (contact name unavailable)"),
    }
}

fn same_name(a: &str, b: &str) -> bool {
    let squash = |s: &str| {
        s.split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase()
    };
    squash(a) == squash(b)
}

/// What one matter says about its people, for a contact page.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatterFacts {
    pub matter: String,
    pub title: String,
    pub client: Option<String>,
    pub parties: Vec<Party>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MatterRole {
    pub matter: String,
    pub title: String,
    pub role: String,
    pub record_name: Option<String>,
}

/// Every matter a contact is in, with every role (O-AC-05). One contact may
/// be petitioner in one matter and respondent in another.
pub fn contact_matters(contact: &str, matters: &[MatterFacts]) -> Vec<MatterRole> {
    let mut out = Vec::new();
    for m in matters {
        if m.client.as_deref() == Some(contact) {
            out.push(MatterRole {
                matter: m.matter.clone(),
                title: m.title.clone(),
                role: "client".into(),
                record_name: None,
            });
        }
        for p in m.parties.iter().filter(|p| p.contact == contact) {
            out.push(MatterRole {
                matter: m.matter.clone(),
                title: m.title.clone(),
                role: p.role.clone(),
                record_name: Some(p.record_name.clone()),
            });
        }
    }
    out.sort_by(|a, b| (&a.title, &a.matter, &a.role).cmp(&(&b.title, &b.matter, &b.role)));
    out
}

/// One ledger event as the timeline reads it.
#[derive(Debug, Clone, PartialEq)]
pub struct EventIn {
    pub matter: String,
    pub matter_title: String,
    pub seq: i64,
    pub at: String,
    pub actor: String,
    pub origin: String,
    pub command: String,
    pub body: Value,
}

/// One timeline entry. `id` is the ledger event's record id, which the
/// Inspector opens.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TimelineEntry {
    pub matter: String,
    pub matter_title: String,
    pub id: String,
    pub seq: i64,
    pub at: String,
    pub actor: String,
    pub origin: String,
    pub command: String,
    pub kind: String,
    pub summary: String,
}

/// The activity kind of an event (O03: notes, calls, meetings, filing events).
pub fn activity_kind(command: &str, body: &Value) -> String {
    if command == CORRESPONDENCE_EVENT {
        return body["kind"]
            .as_str()
            .unwrap_or("correspondence")
            .to_string();
    }
    let prefix = command.split('.').next().unwrap_or(command);
    match prefix {
        "notebook" => "note",
        "filing" | "fidelity" => "filing",
        "draft" | "approval" => "document",
        "evidence" | "capture" | "ingest" | "ocr" => "evidence",
        "party" => "party",
        "matter" => "matter",
        _ => "other",
    }
    .to_string()
}

fn text<'a>(body: &'a Value, key: &str) -> Option<&'a str> {
    body[key].as_str().filter(|s| !s.is_empty())
}

/// A one-line reading of an event body.
pub fn summarise(command: &str, body: &Value) -> String {
    match command {
        CORRESPONDENCE_EVENT => format!(
            "{}: {}",
            text(body, "kind").unwrap_or("correspondence"),
            text(body, "summary").unwrap_or_default()
        ),
        PARTY_EVENT => format!(
            "{} recorded as {}",
            text(body, "record_name").unwrap_or("a party"),
            text(body, "role").unwrap_or("a party")
        ),
        _ => {
            let detail = ["title", "summary", "name", "file_name", "reason", "draft"]
                .iter()
                .find_map(|k| text(body, k));
            match detail {
                Some(d) => format!("{command}: {d}"),
                None => command.to_string(),
            }
        }
    }
}

/// The activity timeline, oldest first. Pure: the same events give the same
/// entries, so deleting and rebuilding it changes nothing (O-AC-01).
pub fn timeline(events: &[EventIn]) -> Vec<TimelineEntry> {
    let mut out: Vec<TimelineEntry> = events
        .iter()
        .map(|e| TimelineEntry {
            matter: e.matter.clone(),
            matter_title: e.matter_title.clone(),
            id: format!("event:{}", e.seq),
            seq: e.seq,
            at: e.at.clone(),
            actor: e.actor.clone(),
            origin: e.origin.clone(),
            command: e.command.clone(),
            kind: activity_kind(&e.command, &e.body),
            summary: summarise(&e.command, &e.body),
        })
        .collect();
    out.sort_by(|a, b| (&a.at, &a.matter, a.seq).cmp(&(&b.at, &b.matter, b.seq)));
    out
}

/// Whether a JSON value names the id in any string.
pub fn names(v: &Value, id: &str) -> bool {
    match v {
        Value::String(t) => t == id,
        Value::Array(a) => a.iter().any(|x| names(x, id)),
        Value::Object(m) => m.values().any(|x| names(x, id)),
        _ => false,
    }
}

/// A contact's activity: the events whose bodies name the contact, which
/// covers matter creation for a client, party roles and correspondence.
pub fn contact_timeline(events: &[EventIn], contact: &str) -> Vec<TimelineEntry> {
    let mine: Vec<EventIn> = events
        .iter()
        .filter(|e| names(&e.body, contact))
        .cloned()
        .collect();
    timeline(&mine)
}

/// The body of a `correspondence.logged` event.
pub fn correspondence_body(
    id: &str,
    kind: &str,
    summary: &str,
    contact: Option<&str>,
    occurred_at: &str,
) -> Value {
    json!({
        "correspondence": id,
        "kind": kind,
        "summary": summary.trim(),
        "contact": contact,
        "occurred_at": occurred_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(matter: &str, seq: i64, at: &str, command: &str, body: Value) -> EventIn {
        EventIn {
            matter: matter.into(),
            matter_title: format!("Title {matter}"),
            seq,
            at: at.into(),
            actor: "advocate".into(),
            origin: "cli".into(),
            command: command.into(),
            body,
        }
    }

    #[test]
    fn courts_and_benches_need_a_source() {
        assert!(check_contact("court", "High Court of Delhi", None).is_err());
        assert_eq!(
            check_contact("Court", "High Court of Delhi", Some("codebook:hc/DL")).unwrap(),
            "court"
        );
        assert_eq!(check_contact("person", "A", None).unwrap(), "person");
        assert!(check_contact("client", "A", None).is_err());
        assert!(check_contact("person", "  ", None).is_err());
    }

    #[test]
    fn roles_and_kinds_are_normalised() {
        assert_eq!(
            check_role("Proforma Respondent").unwrap(),
            "proforma_respondent"
        );
        assert!(check_role("judge").is_err());
        assert_eq!(check_correspondence("Call", "spoke").unwrap(), "call");
        assert!(check_correspondence("call", " ").is_err());
        assert!(check_correspondence("sms", "x").is_err());
    }

    #[test]
    fn o_ac_02_a_differing_record_name_shows_both() {
        assert_eq!(
            party_label(Some("Ramesh Kumar"), "R. Kumar s/o Shyam Lal"),
            "Ramesh Kumar (in the record: R. Kumar s/o Shyam Lal)"
        );
        assert_eq!(
            party_label(Some("Ramesh  Kumar"), "ramesh kumar"),
            "Ramesh  Kumar"
        );
    }

    #[test]
    fn o_ac_05_a_contact_lists_every_matter_and_role() {
        let p = |c: &str, r: &str| Party {
            contact: c.into(),
            role: r.into(),
            record_name: format!("{c} as named"),
        };
        let matters = vec![
            MatterFacts {
                matter: "M1".into(),
                title: "A v B".into(),
                client: Some("C1".into()),
                parties: vec![p("C1", "petitioner"), p("C2", "respondent")],
            },
            MatterFacts {
                matter: "M2".into(),
                title: "B v A".into(),
                client: None,
                parties: vec![p("C1", "respondent")],
            },
            MatterFacts {
                matter: "M3".into(),
                title: "X v Y".into(),
                client: None,
                parties: vec![],
            },
        ];
        let roles = contact_matters("C1", &matters);
        let got: Vec<(&str, &str)> = roles
            .iter()
            .map(|r| (r.matter.as_str(), r.role.as_str()))
            .collect();
        assert_eq!(
            got,
            vec![("M1", "client"), ("M1", "petitioner"), ("M2", "respondent")]
        );
    }

    #[test]
    fn o_ac_01_the_timeline_is_a_pure_function_of_the_ledger() {
        let events = vec![
            ev(
                "M2",
                1,
                "2026-11-04T10:00:00.000Z",
                "matter.created",
                json!({"title": "B v A"}),
            ),
            ev(
                "M1",
                2,
                "2026-11-04T09:00:00.000Z",
                CORRESPONDENCE_EVENT,
                correspondence_body("K1", "call", "Spoke to client", Some("C1"), "2026-11-04"),
            ),
            ev(
                "M1",
                1,
                "2026-11-04T08:00:00.000Z",
                "matter.created",
                json!({"title": "A v B", "client_id": "C1"}),
            ),
        ];
        let first = timeline(&events);
        let rebuilt = timeline(&events);
        assert_eq!(first, rebuilt);
        assert_eq!(first[0].id, "event:1");
        assert_eq!(first[0].matter, "M1");
        assert_eq!(first[1].kind, "call");
        assert_eq!(first[1].summary, "call: Spoke to client");
        let c1 = contact_timeline(&events, "C1");
        assert_eq!(c1.len(), 2);
        assert!(c1.iter().all(|e| e.matter == "M1"));
    }
}

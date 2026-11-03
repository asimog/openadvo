//! The Inspector (spec A16): raw JSON, ledger events, links out and in, and
//! the command, origin and actor that produced the item. It reads only
//! through queries, so it shows what the CLI would show.

use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct LinkLine {
    pub direction: &'static str,
    pub other: String,
    pub via: String,
    pub seq: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EventLine {
    pub seq: i64,
    pub command: String,
    pub origin: String,
    pub actor: String,
    pub at: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Inspected {
    pub id: String,
    pub kind: String,
    pub raw: String,
    pub events: Vec<EventLine>,
    pub links: Vec<LinkLine>,
    /// The command, origin and actor of the event that created the item.
    pub produced_by: Option<String>,
}

fn text(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or_default().to_string()
}

/// From an `inspect` answer.
pub fn from_inspect(v: &Value) -> Inspected {
    let events: Vec<EventLine> = v["events"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|e| EventLine {
                    seq: e["seq"].as_i64().unwrap_or(0),
                    command: text(e, "command"),
                    origin: text(e, "origin"),
                    actor: text(e, "actor"),
                    at: text(e, "recorded_at"),
                })
                .collect()
        })
        .unwrap_or_default();
    let mut links = Vec::new();
    for (key, direction, other) in [("links_out", "out", "to"), ("links_in", "in", "from")] {
        for l in v[key].as_array().into_iter().flatten() {
            links.push(LinkLine {
                direction,
                other: text(l, other),
                via: text(l, "via"),
                seq: l["seq"].as_i64().unwrap_or(0),
            });
        }
    }
    Inspected {
        id: text(v, "id"),
        kind: text(v, "kind"),
        raw: serde_json::to_string_pretty(&v["record"]).unwrap_or_default(),
        produced_by: events
            .first()
            .map(|e| format!("{} by {} via {}", e.command, e.actor, e.origin)),
        events,
        links,
    }
}

/// For an item with no record id: its own JSON, and whatever it says about
/// who produced it.
pub fn from_raw(item: &Value) -> Inspected {
    let part = |k: &str| item[k].as_str().map(str::to_string);
    let produced_by = match (part("command"), part("actor"), part("origin")) {
        (Some(c), Some(a), Some(o)) => Some(format!("{c} by {a} via {o}")),
        _ => None,
    };
    Inspected {
        id: part("id").or_else(|| part("key")).unwrap_or_default(),
        kind: "item".into(),
        raw: serde_json::to_string_pretty(item).unwrap_or_default(),
        events: Vec::new(),
        links: Vec::new(),
        produced_by,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_ac_17_the_inspector_shows_record_events_links_and_producer() {
        let answer = json!({
            "id": "R1", "kind": "revision",
            "record": { "hash": "R1", "draft": "D1" },
            "events": [
                { "seq": 2, "command": "draft.created", "origin": "cli", "actor": "advocate", "recorded_at": "t" },
                { "seq": 5, "command": "draft.checkpointed", "origin": "ui", "actor": "advocate", "recorded_at": "t" },
            ],
            "links_out": [{ "from": "R1", "to": "D1", "seq": 2, "via": "draft.created" }],
            "links_in": [{ "from": "D1", "to": "R1", "seq": 2, "via": "draft.created" }],
        });
        let i = from_inspect(&answer);
        assert!(i.raw.contains("\"draft\": \"D1\""));
        assert_eq!(i.events.len(), 2);
        assert_eq!(i.links.len(), 2);
        assert_eq!(i.links[0].direction, "out");
        assert_eq!(i.links[0].other, "D1");
        assert_eq!(i.links[1].direction, "in");
        assert_eq!(
            i.produced_by.as_deref(),
            Some("draft.created by advocate via cli")
        );
    }

    #[test]
    fn an_item_without_a_record_still_opens_with_its_own_json() {
        let i = from_raw(
            &json!({ "command": "settings.set", "actor": "agent", "origin": "harness", "reason": "legal" }),
        );
        assert!(i.raw.contains("legal"));
        assert_eq!(
            i.produced_by.as_deref(),
            Some("settings.set by agent via harness")
        );
        assert!(i.events.is_empty());
    }
}

//! The review inbox (spec A rules 8 and 17): one queue, split into Signal
//! (needs a decision or blocks a gate) and Noise (information).

use std::collections::BTreeSet;

use serde_json::Value;

use crate::views::Subject;

#[derive(Debug, Clone, PartialEq)]
pub struct InboxItem {
    pub key: String,
    pub kind: &'static str,
    pub summary: String,
    pub detail: String,
    pub needs_decision: bool,
    pub blocks_gate: bool,
    pub subject: Subject,
}

/// The one rule (A rule 17): Signal when the item needs the advocate to
/// decide or blocks a gate. Everything else is Noise.
pub fn is_signal(item: &InboxItem) -> bool {
    item.needs_decision || item.blocks_gate
}

/// What the shell knows when it builds the inbox.
#[derive(Default)]
pub struct Sources {
    /// (id, title, removed, path)
    pub matters: Vec<(String, String, bool, String)>,
    pub rejected: Vec<Value>,
    /// (matter id, approval record)
    pub approvals: Vec<(String, Value)>,
    /// (matter id, first bad sequence)
    pub broken_chains: Vec<(String, i64)>,
    /// (matter id, evidence id, name)
    pub missing_bytes: Vec<(String, String, String)>,
}

fn id_of(v: &Value) -> String {
    v["id"].as_str().unwrap_or_default().to_string()
}

pub fn build(src: &Sources) -> Vec<InboxItem> {
    let mut items = Vec::new();
    for (id, title, removed, path) in &src.matters {
        if *removed {
            items.push(InboxItem {
                key: format!("removed:{id}"),
                kind: "matter_removed",
                summary: format!("Matter folder removed: {title}"),
                detail: path.clone(),
                needs_decision: true,
                blocks_gate: false,
                subject: Subject::Record {
                    matter: id.clone(),
                    id: id.clone(),
                },
            });
        }
    }
    for (matter, a) in &src.approvals {
        let subject = Subject::Record {
            matter: matter.clone(),
            id: id_of(a),
        };
        if a["state"] == "pending" {
            items.push(InboxItem {
                key: format!("approval:{}", id_of(a)),
                kind: "approval_pending",
                summary: format!(
                    "Approval needed on gate {}",
                    a["gate"].as_str().unwrap_or("gate")
                ),
                detail: format!("revision {}", a["target"].as_str().unwrap_or_default()),
                needs_decision: true,
                blocks_gate: true,
                subject,
            });
        } else if a["stale"] == true {
            items.push(InboxItem {
                key: format!("stale:{}", id_of(a)),
                kind: "approval_stale",
                summary: "An approval no longer applies to the head revision".into(),
                detail: a["gate"].as_str().unwrap_or_default().to_string(),
                needs_decision: false,
                blocks_gate: true,
                subject,
            });
        }
    }
    for (matter, seq) in &src.broken_chains {
        items.push(InboxItem {
            key: format!("chain:{matter}"),
            kind: "ledger_chain_broken",
            summary: format!("Ledger chain breaks at sequence {seq}"),
            detail: "The matter is read only until this is reviewed.".into(),
            needs_decision: true,
            blocks_gate: true,
            subject: Subject::Record {
                matter: matter.clone(),
                id: format!("event:{seq}"),
            },
        });
    }
    for (matter, id, name) in &src.missing_bytes {
        items.push(InboxItem {
            key: format!("missing:{id}"),
            kind: "missing_bytes",
            summary: format!("Missing bytes: {name}"),
            detail: "The evidence entry exists but its blob is not on disk.".into(),
            needs_decision: true,
            blocks_gate: false,
            subject: Subject::Record {
                matter: matter.clone(),
                id: id.clone(),
            },
        });
    }
    for (i, r) in src.rejected.iter().enumerate() {
        items.push(InboxItem {
            key: format!(
                "rejected:{}:{}:{i}",
                r["at"].as_str().unwrap_or_default(),
                r["body_hash"].as_str().unwrap_or_default()
            ),
            kind: "write_refused",
            summary: format!(
                "{} refused for {}",
                r["command"].as_str().unwrap_or("command"),
                r["origin"].as_str().unwrap_or("unknown origin")
            ),
            detail: r["reason"].as_str().unwrap_or_default().to_string(),
            needs_decision: false,
            blocks_gate: false,
            subject: Subject::Raw(r.clone()),
        });
    }
    items
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Key {
    J,
    K,
    Enter,
    E,
}

#[derive(Debug, PartialEq)]
pub enum Effect {
    None,
    Open(Subject),
    Archived(String),
    /// `e` on Signal is refused: it needs a decision.
    NotArchivable(String),
}

/// Keyboard state over the queue. Signal is listed first, then Noise.
#[derive(Debug, Default)]
pub struct Inbox {
    pub items: Vec<InboxItem>,
    pub archived: BTreeSet<String>,
    pub selected: usize,
}

impl Inbox {
    pub fn set(&mut self, items: Vec<InboxItem>) {
        self.items = items;
        self.selected = self.selected.min(self.visible().len().saturating_sub(1));
    }

    /// Signal first, then Noise, archived items hidden.
    pub fn visible(&self) -> Vec<&InboxItem> {
        let live = || {
            self.items
                .iter()
                .filter(|i| !self.archived.contains(&i.key))
        };
        live()
            .filter(|i| is_signal(i))
            .chain(live().filter(|i| !is_signal(i)))
            .collect()
    }

    pub fn signal_count(&self) -> usize {
        self.visible().iter().filter(|i| is_signal(i)).count()
    }

    pub fn noise_count(&self) -> usize {
        self.visible().len() - self.signal_count()
    }

    pub fn key(&mut self, key: Key) -> Effect {
        let visible = self.visible();
        if visible.is_empty() {
            return Effect::None;
        }
        let last = visible.len() - 1;
        let item = visible[self.selected.min(last)];
        match key {
            Key::J => {
                self.selected = (self.selected + 1).min(last);
                Effect::None
            }
            Key::K => {
                self.selected = self.selected.saturating_sub(1);
                Effect::None
            }
            Key::Enter => Effect::Open(item.subject.clone()),
            Key::E => {
                if is_signal(item) {
                    return Effect::NotArchivable(item.key.clone());
                }
                let k = item.key.clone();
                self.archived.insert(k.clone());
                self.selected = self.selected.min(self.visible().len().saturating_sub(1));
                Effect::Archived(k)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sources() -> Sources {
        Sources {
            matters: vec![("M1".into(), "Gone".into(), true, "p".into())],
            rejected: vec![
                json!({ "command": "matter.write_file", "origin": "harness", "reason": "evidence/ is not writable", "at": "t1", "body_hash": "h" }),
                json!({ "command": "settings.set", "origin": "harness", "reason": "legal layer", "at": "t2", "body_hash": "h2" }),
            ],
            approvals: vec![(
                "M1".into(),
                json!({ "id": "A1", "gate": "final_revision", "target": "r", "state": "pending" }),
            )],
            ..Sources::default()
        }
    }

    #[test]
    fn a_rule_8_removed_matters_and_refusals_reach_the_inbox() {
        let items = build(&sources());
        let kinds: Vec<_> = items.iter().map(|i| i.kind).collect();
        assert!(kinds.contains(&"matter_removed"));
        assert!(kinds.contains(&"write_refused"));
        assert!(kinds.contains(&"approval_pending"));
    }

    #[test]
    fn a_ac_19_blocking_is_signal_information_is_noise_and_keys_drive_it() {
        let mut inbox = Inbox::default();
        inbox.set(build(&sources()));
        let v = inbox.visible();
        assert!(is_signal(v[0]) && is_signal(v[1]), "Signal is listed first");
        assert!(!is_signal(v[2]) && !is_signal(v[3]));
        assert!(
            is_signal(v.iter().find(|i| i.kind == "approval_pending").unwrap()),
            "a gate-blocking item is Signal"
        );
        assert_eq!((inbox.signal_count(), inbox.noise_count()), (2, 2));

        assert_eq!(inbox.key(Key::K), Effect::None);
        assert_eq!(inbox.selected, 0);
        inbox.key(Key::J);
        inbox.key(Key::J);
        assert_eq!(inbox.selected, 2);
        inbox.key(Key::K);
        assert!(matches!(inbox.key(Key::E), Effect::NotArchivable(_)));
        assert_eq!(inbox.visible().len(), 4);
        inbox.key(Key::J);
        assert!(matches!(inbox.key(Key::E), Effect::Archived(_)));
        assert_eq!(inbox.visible().len(), 3);
        assert!(matches!(inbox.key(Key::Enter), Effect::Open(_)));
        for _ in 0..10 {
            inbox.key(Key::J);
        }
        assert_eq!(inbox.selected, 2);
    }

    #[test]
    fn an_empty_inbox_ignores_keys() {
        let mut inbox = Inbox::default();
        assert_eq!(inbox.key(Key::Enter), Effect::None);
        assert_eq!(inbox.key(Key::E), Effect::None);
    }
}

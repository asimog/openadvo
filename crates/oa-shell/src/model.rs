//! What the shell shows, as plain data built from protocol answers. Kept free
//! of egui so it is testable, and so it can become each pane's semantic model
//! (spec B03) without a rewrite.

use serde_json::Value;

/// The panes that register with the layout (spec A rule 6). Panes register;
/// they do not own geometry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pane {
    Files,
    Matter,
    Inbox,
    Notebook,
    Viewer,
    Agent,
}

impl Pane {
    pub const ALL: [Pane; 6] = [
        Pane::Files,
        Pane::Matter,
        Pane::Inbox,
        Pane::Notebook,
        Pane::Viewer,
        Pane::Agent,
    ];

    pub fn title(self) -> &'static str {
        match self {
            Pane::Files => "Matters",
            Pane::Matter => "Matter",
            Pane::Inbox => "Review inbox",
            Pane::Notebook => "Notebook",
            Pane::Viewer => "Viewer",
            Pane::Agent => "Agent",
        }
    }

    /// The group whose spec builds the pane's content. `None` means it is
    /// built here.
    pub fn waits_for(self) -> Option<&'static str> {
        match self {
            Pane::Files | Pane::Matter | Pane::Inbox => None,
            Pane::Notebook => Some("H, the Notebook"),
            Pane::Viewer => Some("J, the viewers"),
            Pane::Agent => Some("D, the harness"),
        }
    }
}

/// One row of the file browser's matter list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatterItem {
    pub id: String,
    pub title: String,
    pub archived: bool,
    pub removed: bool,
    pub path: String,
}

pub fn matters(values: &[Value]) -> Vec<MatterItem> {
    values
        .iter()
        .map(|v| MatterItem {
            id: v["id"].as_str().unwrap_or_default().to_string(),
            title: v["title"].as_str().unwrap_or_default().to_string(),
            archived: v["archived"].as_bool().unwrap_or(false),
            removed: v["removed"].as_bool().unwrap_or(false),
            path: v["path"].as_str().unwrap_or_default().to_string(),
        })
        .collect()
}

/// Display text for the advocate: missing values show as missing (spec A,
/// observable outcomes).
pub fn matter_label(m: &MatterItem) -> String {
    let title = if m.title.trim().is_empty() {
        "(no title)"
    } else {
        &m.title
    };
    let mut flags = Vec::new();
    if m.archived {
        flags.push("archived");
    }
    if m.removed {
        flags.push("removed");
    }
    if flags.is_empty() {
        title.to_string()
    } else {
        format!("{title}  [{}]", flags.join(", "))
    }
}

/// One review item. Every kind in the system appears in the one queue (spec
/// A rule 8).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InboxItem {
    pub kind: &'static str,
    pub summary: String,
    pub detail: String,
}

/// Builds the inbox from the kinds that exist in step 1: matters whose folder
/// has gone, and refused writes.
pub fn inbox(matters: &[MatterItem], rejected: &[Value]) -> Vec<InboxItem> {
    let mut items: Vec<InboxItem> = matters
        .iter()
        .filter(|m| m.removed)
        .map(|m| InboxItem {
            kind: "matter_removed",
            summary: format!("Matter folder removed: {}", matter_label(m)),
            detail: m.path.clone(),
        })
        .collect();
    items.extend(rejected.iter().map(|r| InboxItem {
        kind: "write_refused",
        summary: format!(
            "{} refused for {}",
            r["command"].as_str().unwrap_or("command"),
            r["origin"].as_str().unwrap_or("unknown origin")
        ),
        detail: r["reason"].as_str().unwrap_or_default().to_string(),
    }));
    items
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_rule_6_every_pane_is_registered_once() {
        let mut titles: Vec<_> = Pane::ALL.iter().map(|p| p.title()).collect();
        titles.sort();
        titles.dedup();
        assert_eq!(titles.len(), Pane::ALL.len());
    }

    #[test]
    fn a_rule_8_removed_matters_and_refusals_reach_the_inbox() {
        let ms = matters(&[
            json!({ "id": "1", "title": "Kept", "removed": false, "path": "a" }),
            json!({ "id": "2", "title": "Gone", "removed": true, "path": "b" }),
        ]);
        let rejected = [
            json!({ "command": "matter.write_file", "origin": "harness", "reason": "evidence/ is not writable" }),
        ];
        let items = inbox(&ms, &rejected);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].kind, "matter_removed");
        assert!(items[0].summary.contains("Gone"));
        assert_eq!(items[1].kind, "write_refused");
        assert!(items[1].summary.contains("harness"));
    }

    #[test]
    fn missing_titles_show_as_missing() {
        let m = MatterItem {
            id: "1".into(),
            title: " ".into(),
            archived: true,
            removed: false,
            path: String::new(),
        };
        assert_eq!(matter_label(&m), "(no title)  [archived]");
    }
}

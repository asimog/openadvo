//! Generators (J10) and the petition template. Each generated sentence keeps
//! the ids it came from in the sources part (J rule 6).

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::docx::Sources;
use crate::writer::{DocBuilder, Para};

/// One event eligible for prose, as the Notebook gives it (H rule 8).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct LodEvent {
    pub id: String,
    /// `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, or verbatim text (OQ-04).
    pub date: String,
    pub description: String,
}

/// A Notebook date as an Indian court document writes it: `dd.mm.yyyy`.
pub fn display_date(date: &str) -> String {
    let parts: Vec<&str> = date.split('-').collect();
    let digits = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit());
    match parts.as_slice() {
        [y, m, d] if digits(y) && digits(m) && digits(d) && y.len() == 4 => {
            format!("{d}.{m}.{y}")
        }
        [y, m] if digits(y) && digits(m) && y.len() == 4 => format!("{m}.{y}"),
        _ => date.to_string(),
    }
}

/// The inverse of [`display_date`], for checking a generated date.
pub fn notebook_date(display: &str) -> String {
    let parts: Vec<&str> = display.split('.').collect();
    match parts.as_slice() {
        [d, m, y] if y.len() == 4 => format!("{y}-{m}-{d}"),
        [m, y] if y.len() == 4 => format!("{y}-{m}"),
        _ => display.to_string(),
    }
}

/// One paragraph per event: `dd.mm.yyyy: what happened`, carrying the event id.
pub fn list_of_dates(events: &[LodEvent]) -> Vec<Para> {
    events
        .iter()
        .map(|e| {
            Para::sourced(
                &format!("{}: {}", display_date(&e.date), e.description.trim()),
                Sources {
                    events: vec![e.id.clone()],
                    ..Sources::default()
                },
            )
        })
        .collect()
}

/// A short synopsis stating the first and last events, carrying both ids.
pub fn synopsis(title: &str, events: &[LodEvent]) -> Vec<Para> {
    match (events.first(), events.last()) {
        (Some(first), Some(last)) => {
            let mut ids = vec![first.id.clone()];
            if last.id != first.id {
                ids.push(last.id.clone());
            }
            vec![Para::sourced(
                &format!(
                    "This petition in {title} arises from events beginning on {} ({}) and leading to {} ({}).",
                    display_date(&first.date),
                    first.description.trim(),
                    display_date(&last.date),
                    last.description.trim()
                ),
                Sources {
                    events: ids,
                    ..Sources::default()
                },
            )]
        }
        _ => vec![Para::plain(
            "[Synopsis to be drafted: the Notebook has no confirmed dated events yet.]",
        )],
    }
}

pub const TEMPLATES: &[&str] = &["slp", "blank"];

/// The first revision of a draft from a template (J04).
pub fn template(name: &str, title: &str, events: &[LodEvent]) -> Option<Vec<u8>> {
    let mut b = DocBuilder::new();
    match name {
        "blank" => {
            b.push(Para::styled("Title", title));
            b.push(Para::plain(""));
        }
        "slp" => {
            b.push(Para::styled("Title", "IN THE SUPREME COURT OF INDIA"));
            b.push(Para::styled("Subtitle", "CIVIL APPELLATE JURISDICTION"));
            b.push(Para::styled(
                "Subtitle",
                "SPECIAL LEAVE PETITION (CIVIL) NO. ______ OF ______",
            ));
            b.push(Para::styled(
                "Subtitle",
                &format!("IN THE MATTER OF: {title}"),
            ));
            b.push(Para::styled("Heading1", "SYNOPSIS"));
            for p in synopsis(title, events) {
                b.push(p);
            }
            b.push(Para::styled("Heading1", "LIST OF DATES"));
            if events.is_empty() {
                b.push(Para::plain(
                    "[No confirmed dated events in the Notebook yet.]",
                ));
            }
            for p in list_of_dates(events) {
                b.push(p);
            }
            b.push(Para::styled("Heading1", "QUESTIONS OF LAW"));
            b.push(Para::plain("[Questions of law to be drafted.]"));
            b.push(Para::styled("Heading1", "GROUNDS"));
            b.push(Para::plain("[Grounds to be drafted.]"));
            b.push(Para::styled("Heading1", "PRAYER"));
            b.push(Para::plain(
                "It is therefore most respectfully prayed that this Hon'ble Court may be pleased to grant special leave to appeal against the impugned judgment and order, and pass such other order as it deems fit.",
            ));
        }
        _ => return None,
    }
    Some(b.build())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_display_in_the_indian_form_and_back() {
        assert_eq!(display_date("2019-03-07"), "07.03.2019");
        assert_eq!(display_date("2019-03"), "03.2019");
        assert_eq!(display_date("01-01-1900"), "01-01-1900");
        assert_eq!(notebook_date("07.03.2019"), "2019-03-07");
    }
}

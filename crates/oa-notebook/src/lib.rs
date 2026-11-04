//! The Notebook (spec H): the item kinds of the eight sections, the
//! chronology and its per-view exclusions, conflict detection (H09), the
//! review items it raises, readiness (H07), the dates generated prose may use,
//! the court-portal component sent to ULOS-N, and the impugned order (RQ-62).
//!
//! Pure logic. The kernel stores items and commits every change; this crate
//! only decides.

use std::collections::{BTreeMap, BTreeSet};

use chrono::NaiveDate;
use oa_capture::LowerCourtQuery;
use oa_ocr::{DateAnchor, Entity, EntityKind, Rect};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(
    Debug,
    Clone,
    Copy,
    Default,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    JsonSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum Section {
    #[default]
    SourceDocuments,
    ProceduralHistory,
    FactualMatrix,
    Chronology,
    LegalIssues,
    Authorities,
    WorkProducts,
    Review,
}

impl Section {
    pub const ALL: [Section; 8] = [
        Section::SourceDocuments,
        Section::ProceduralHistory,
        Section::FactualMatrix,
        Section::Chronology,
        Section::LegalIssues,
        Section::Authorities,
        Section::WorkProducts,
        Section::Review,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Section::SourceDocuments => "source_documents",
            Section::ProceduralHistory => "procedural_history",
            Section::FactualMatrix => "factual_matrix",
            Section::Chronology => "chronology",
            Section::LegalIssues => "legal_issues",
            Section::Authorities => "authorities",
            Section::WorkProducts => "work_products",
            Section::Review => "review",
        }
    }

    pub fn parse(s: &str) -> Option<Section> {
        Section::ALL.into_iter().find(|x| x.as_str() == s)
    }

    pub fn title(self) -> &'static str {
        match self {
            Section::SourceDocuments => "Source documents",
            Section::ProceduralHistory => "Procedural history",
            Section::FactualMatrix => "Factual Matrix",
            Section::Chronology => "Chronology",
            Section::LegalIssues => "Legal issues",
            Section::Authorities => "Authorities",
            Section::WorkProducts => "Work products",
            Section::Review => "Review and verification",
        }
    }

    /// The item kinds a writer may propose into the section (H01). The
    /// chronology and review sections are projections and take no writes.
    pub fn kinds(self) -> &'static [&'static str] {
        match self {
            Section::SourceDocuments => &["source_document"],
            Section::ProceduralHistory => &["procedural_event", "party"],
            Section::FactualMatrix => &["fact"],
            Section::Chronology | Section::Review => &[],
            Section::LegalIssues => &["legal_issue"],
            Section::Authorities => &["authority"],
            Section::WorkProducts => &["work_product"],
        }
    }
}

/// The two components of the Notebook (rule 2, RQ-45, RQ-61).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Component {
    CourtPortal,
    #[default]
    ClientSupplied,
}

impl Component {
    pub fn as_str(self) -> &'static str {
        match self {
            Component::CourtPortal => "court_portal",
            Component::ClientSupplied => "client_supplied",
        }
    }

    /// The tag shown on the item. A client file is never called verified or
    /// unverifiable (RQ-61).
    pub fn label(self) -> &'static str {
        match self {
            Component::CourtPortal => "Court portal",
            Component::ClientSupplied => "Supplied by client",
        }
    }
}

/// An item's confirmation status. "Disputed" is not stored: it is derived
/// from open OCR disputes and open conflicts, so deciding them clears it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    #[default]
    Candidate,
    Confirmed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum DateType {
    Explicit,
    Inferred,
    Unresolved,
}

impl From<oa_ocr::DateKind> for DateType {
    fn from(k: oa_ocr::DateKind) -> Self {
        match k {
            oa_ocr::DateKind::Explicit => DateType::Explicit,
            oa_ocr::DateKind::Inferred => DateType::Inferred,
            oa_ocr::DateKind::Unresolved => DateType::Unresolved,
        }
    }
}

/// Where an item's support is: a document and a region of it. The selector is
/// a line hash, or a page and box (README "Identifiers", anchors).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct NoteAnchor {
    pub doc: String,
    pub page: u32,
    pub line: Option<u32>,
    pub line_hash: Option<String>,
    pub rect: Option<Rect>,
    /// Byte span inside the line's text, when the item is one entity.
    pub start: Option<usize>,
    pub end: Option<usize>,
}

/// What a writer proposes (H02). One shape for every kind; the fields a kind
/// does not use stay empty.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ItemInput {
    pub section: Section,
    pub kind: String,
    pub description: String,
    pub anchors: Vec<NoteAnchor>,
    /// How the item was produced, for example `rules:oa-ocr/extract_entities`.
    pub method: String,
    /// `YYYY`, `YYYY-MM` or `YYYY-MM-DD`; any other text is kept verbatim
    /// (OQ-04: the `01-01-1900` placeholder passes through).
    #[serde(default)]
    pub date: Option<String>,
    /// The end of a date range ("between March and May 2019").
    #[serde(default)]
    pub date_end: Option<String>,
    #[serde(default)]
    pub date_type: Option<DateType>,
    /// The words in the source that gave the date.
    #[serde(default)]
    pub date_text: Option<String>,
    /// The event category a view may exclude (order, hearing, payment...).
    #[serde(default)]
    pub category: Option<String>,
    /// What the event is about, so two accounts of one event can be compared
    /// (for example `order:WP1234/2018`).
    #[serde(default)]
    pub subject: Option<String>,
    #[serde(default)]
    pub amount: Option<String>,
    #[serde(default)]
    pub party_role: Option<String>,
    #[serde(default)]
    pub party_name: Option<String>,
}

/// One version of a Notebook item (rules 1 and 12).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Item {
    pub id: String,
    pub version: u32,
    pub status: Status,
    pub component: Component,
    #[serde(flatten)]
    pub body: ItemInput,
    /// OCR disputes open on the item's source text when it was written. The
    /// item is disputed while any of them is still open (G-AC-07).
    #[serde(default)]
    pub ocr_disputes: Vec<String>,
    /// Why this version exists, for a correction or a confirmation.
    #[serde(default)]
    pub reason: Option<String>,
    pub created_by: String,
    pub created_at: String,
}

impl Item {
    pub fn is_dated(&self) -> bool {
        matches!(self.body.kind.as_str(), "fact" | "procedural_event") && self.body.date.is_some()
    }
}

/// Checks a proposal against its section's schema (H01). The anchors are
/// resolved by the kernel, which can see the blobs.
pub fn validate(input: &ItemInput) -> Result<(), String> {
    let kinds = input.section.kinds();
    if kinds.is_empty() {
        return Err(format!(
            "the {} section is a projection and takes no items",
            input.section.as_str()
        ));
    }
    if !kinds.contains(&input.kind.as_str()) {
        return Err(format!(
            "kind {:?} does not belong to section {} (expected one of {})",
            input.kind,
            input.section.as_str(),
            kinds.join(", ")
        ));
    }
    if input.description.trim().is_empty() {
        return Err("an item needs a description".into());
    }
    if input.method.trim().is_empty() {
        return Err("an item needs its extraction method".into());
    }
    if input.anchors.is_empty() {
        return Err("an item needs at least one anchor".into());
    }
    for a in &input.anchors {
        if a.line_hash.is_none() && a.rect.is_none() {
            return Err(format!(
                "an anchor on {} page {} has neither a line hash nor a box",
                a.doc, a.page
            ));
        }
    }
    match input.kind.as_str() {
        "fact" if input.date.is_some() && input.date_type.is_none() => {
            return Err("a dated fact needs its date type".into())
        }
        "party" if input.party_name.as_deref().unwrap_or("").trim().is_empty() => {
            return Err("a party needs a name".into())
        }
        "party" if input.party_role.as_deref().unwrap_or("").trim().is_empty() => {
            return Err("a party needs a role".into())
        }
        _ => {}
    }
    Ok(())
}

/// A sort key for a stored date: parsed partial ISO dates first, in order;
/// anything kept verbatim after them.
fn date_key(date: &str) -> (u8, String) {
    let parts: Vec<&str> = date.split('-').collect();
    let iso = match parts.as_slice() {
        [y] => y.len() == 4 && y.parse::<u32>().is_ok(),
        [y, m] => y.len() == 4 && m.len() == 2 && y.parse::<u32>().is_ok(),
        [_, _, _] => NaiveDate::parse_from_str(date, "%Y-%m-%d").is_ok(),
        _ => false,
    };
    (u8::from(!iso), date.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Exclusion {
    pub view: String,
    /// `event` or `category`.
    pub target_kind: String,
    pub target: String,
}

pub fn excluded_in(item: &Item, view: &str, exclusions: &[Exclusion]) -> bool {
    exclusions.iter().any(|x| {
        x.view == view
            && match x.target_kind.as_str() {
                "event" => x.target == item.id,
                "category" => item.body.category.as_deref() == Some(x.target.as_str()),
                _ => false,
            }
    })
}

pub fn excluded_anywhere(item: &Item, exclusions: &[Exclusion]) -> bool {
    exclusions
        .iter()
        .any(|x| excluded_in(item, &x.view, std::slice::from_ref(x)))
}

#[derive(Debug, Clone, PartialEq)]
pub struct ChronoEntry {
    pub item: Item,
    pub excluded: bool,
    pub disputed: bool,
}

/// Every dated event, in date order. Exclusion is a filter on this view only
/// and never removes the item (rule 6, H-AC-03).
pub fn chronology(
    items: &[Item],
    view: &str,
    exclusions: &[Exclusion],
    disputed: &BTreeSet<String>,
    show_excluded: bool,
) -> Vec<ChronoEntry> {
    let mut out: Vec<ChronoEntry> = items
        .iter()
        .filter(|i| i.is_dated())
        .map(|i| ChronoEntry {
            item: i.clone(),
            excluded: excluded_in(i, view, exclusions),
            disputed: disputed.contains(&i.id),
        })
        .filter(|e| show_excluded || !e.excluded)
        .collect();
    out.sort_by(|a, b| {
        let da = date_key(a.item.body.date.as_deref().unwrap_or_default());
        let db = date_key(b.item.body.date.as_deref().unwrap_or_default());
        da.cmp(&db).then_with(|| a.item.id.cmp(&b.item.id))
    });
    out
}

/// Whether generated prose may state this event's date (rule 8): never a
/// disputed, unresolved or unconfirmed inferred date.
pub fn prose_eligible(item: &Item, disputed: bool) -> bool {
    if disputed {
        return false;
    }
    match item.body.date_type {
        Some(DateType::Explicit) => true,
        Some(DateType::Inferred) => item.status == Status::Confirmed,
        Some(DateType::Unresolved) => false,
        // A procedural event carries the date the portal or the order states.
        None => item.body.kind == "procedural_event",
    }
}

/// The events a List of Dates generator (J10) may use, in order (H-AC-07).
pub fn list_of_dates(entries: &[ChronoEntry]) -> Vec<&ChronoEntry> {
    entries
        .iter()
        .filter(|e| !e.excluded && prose_eligible(&e.item, e.disputed))
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictKind {
    Date,
    Party,
    Amount,
}

impl ConflictKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ConflictKind::Date => "date",
            ConflictKind::Party => "party",
            ConflictKind::Amount => "amount",
        }
    }
}

/// Two or more items that disagree about one thing. Flagged, never resolved
/// (rule 7).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Conflict {
    pub kind: ConflictKind,
    pub key: String,
    pub subject: String,
    pub items: Vec<String>,
    pub values: Vec<String>,
    pub anchors: Vec<NoteAnchor>,
}

fn amount_digits(a: &str) -> String {
    let digits: String = a
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .filter(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    digits
        .trim_end_matches(".00")
        .trim_end_matches('.')
        .to_string()
}

fn name_key(n: &str) -> String {
    n.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(|c: char| c == '.' || c == ',')
        .to_lowercase()
}

fn group_conflicts<F>(items: &[&Item], kind: ConflictKind, group: F, out: &mut Vec<Conflict>)
where
    F: Fn(&Item) -> Option<(String, String, String)>,
{
    // group key -> (comparison value -> shown value), item ids, anchors
    type Group = (BTreeMap<String, String>, Vec<String>, Vec<NoteAnchor>);
    let mut groups: BTreeMap<String, Group> = BTreeMap::new();
    for item in items {
        let Some((key, cmp, shown)) = group(item) else {
            continue;
        };
        let g = groups.entry(key).or_default();
        g.0.entry(cmp).or_insert(shown);
        g.1.push(item.id.clone());
        g.2.extend(item.body.anchors.iter().cloned());
    }
    for (subject, (values, mut ids, anchors)) in groups {
        if values.len() < 2 {
            continue;
        }
        ids.sort();
        out.push(Conflict {
            kind,
            key: format!("{}|{}|{}", kind.as_str(), subject, ids.join(",")),
            subject,
            items: ids,
            values: values.into_values().collect(),
            anchors,
        });
    }
}

/// Conflicting dates, amounts and party names (H09). Events are compared by
/// subject, parties by role.
pub fn detect_conflicts(items: &[Item]) -> Vec<Conflict> {
    let events: Vec<&Item> = items.iter().filter(|i| i.is_dated()).collect();
    let mut out = Vec::new();
    group_conflicts(
        &events,
        ConflictKind::Date,
        |i| {
            let subject = i.body.subject.clone()?;
            let date = i.body.date.clone()?;
            let shown = match &i.body.date_end {
                Some(end) => format!("{date}..{end}"),
                None => date,
            };
            Some((subject, shown.clone(), shown))
        },
        &mut out,
    );
    let with_amounts: Vec<&Item> = items
        .iter()
        .filter(|i| matches!(i.body.kind.as_str(), "fact" | "procedural_event"))
        .collect();
    group_conflicts(
        &with_amounts,
        ConflictKind::Amount,
        |i| {
            let subject = i.body.subject.clone()?;
            let amount = i.body.amount.clone()?;
            Some((subject, amount_digits(&amount), amount))
        },
        &mut out,
    );
    let parties: Vec<&Item> = items.iter().filter(|i| i.body.kind == "party").collect();
    group_conflicts(
        &parties,
        ConflictKind::Party,
        |i| {
            let role = name_key(i.body.party_role.as_deref()?);
            let name = i.body.party_name.clone()?;
            Some((role, name_key(&name), name))
        },
        &mut out,
    );
    out
}

/// A thing the advocate has to look at before the Notebook is ready.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReviewItem {
    pub id: String,
    /// `conflict` or `date_anchor`.
    pub kind: String,
    /// Stable identity, so detection never raises the same item twice.
    pub key: String,
    /// `open`, `resolved` or `skipped`.
    pub state: String,
    pub summary: String,
    #[serde(default)]
    pub items: Vec<String>,
    #[serde(default)]
    pub anchors: Vec<NoteAnchor>,
    #[serde(default)]
    pub doc: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub decided_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn conflict_summary(c: &Conflict) -> String {
    format!(
        "{} conflict on {}: {}",
        c.kind.as_str(),
        c.subject,
        c.values.join(" vs ")
    )
}

/// The review rows to write after conflict detection: a new open item for each
/// new conflict, and `resolved` for an open one whose conflict is gone. A
/// skipped item stays skipped. `new_id` names new items.
pub fn reconcile_conflicts(
    existing: &[ReviewItem],
    conflicts: &[Conflict],
    now: &str,
    mut new_id: impl FnMut() -> String,
) -> Vec<ReviewItem> {
    let mut out = Vec::new();
    for c in conflicts {
        if existing.iter().any(|r| r.key == c.key) {
            continue;
        }
        out.push(ReviewItem {
            id: new_id(),
            kind: "conflict".into(),
            key: c.key.clone(),
            state: "open".into(),
            summary: conflict_summary(c),
            items: c.items.clone(),
            anchors: c.anchors.clone(),
            doc: None,
            reason: None,
            decided_by: None,
            created_at: now.to_string(),
            updated_at: now.to_string(),
        });
    }
    for r in existing {
        if r.kind == "conflict" && r.state == "open" && !conflicts.iter().any(|c| c.key == r.key) {
            out.push(ReviewItem {
                state: "resolved".into(),
                reason: Some("the conflict is no longer present".into()),
                updated_at: now.to_string(),
                ..r.clone()
            });
        }
    }
    out
}

/// One thing that keeps the Notebook from being ready (H07).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Blocker {
    /// `job`, `ingest`, `review_item` or `ocr_dispute`.
    pub kind: String,
    pub id: String,
    pub label: String,
}

pub fn readiness_json(blockers: &[Blocker]) -> Value {
    json!({
        "ready": blockers.is_empty(),
        "blockers": blockers,
    })
}

/// The court-portal component of the Notebook, the only part ULOS-N sees
/// (rule 2, H-AC-02). Client files are left out, not labelled.
pub fn ulos_n_bundle(items: &[Item]) -> Value {
    json!({
        "component": Component::CourtPortal.as_str(),
        "items": items
            .iter()
            .filter(|i| i.component == Component::CourtPortal)
            .collect::<Vec<_>>(),
    })
}

/// Counts shown on each section (observable outcomes).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SectionCounts {
    pub section: String,
    pub title: String,
    pub total: usize,
    pub candidate: usize,
    pub confirmed: usize,
    pub disputed: usize,
    pub excluded: usize,
}

/// The status an item is shown with: confirmed, else disputed, else
/// candidate.
pub fn shown_status(item: &Item, disputed: bool) -> &'static str {
    match (item.status, disputed) {
        (Status::Confirmed, _) => "confirmed",
        (Status::Candidate, true) => "disputed",
        (Status::Candidate, false) => "candidate",
    }
}

pub fn section_counts(
    items: &[Item],
    review: &[ReviewItem],
    exclusions: &[Exclusion],
    disputed: &BTreeSet<String>,
) -> Vec<SectionCounts> {
    Section::ALL
        .iter()
        .map(|&s| {
            let mut c = SectionCounts {
                section: s.as_str().into(),
                title: s.title().into(),
                ..SectionCounts::default()
            };
            if s == Section::Review {
                // Open conflicts are disputed, other open items candidates,
                // resolved and skipped items confirmed.
                for r in review {
                    c.total += 1;
                    match (r.state.as_str(), r.kind.as_str()) {
                        ("open", "conflict") => c.disputed += 1,
                        ("open", _) => c.candidate += 1,
                        _ => c.confirmed += 1,
                    }
                }
                return c;
            }
            for i in items.iter().filter(|i| {
                if s == Section::Chronology {
                    i.is_dated()
                } else {
                    i.body.section == s
                }
            }) {
                c.total += 1;
                match shown_status(i, disputed.contains(&i.id)) {
                    "confirmed" => c.confirmed += 1,
                    "disputed" => c.disputed += 1,
                    _ => c.candidate += 1,
                }
                if excluded_anywhere(i, exclusions) {
                    c.excluded += 1;
                }
            }
            c
        })
        .collect()
}

/// The event category from the words of the line it came from.
pub fn category_of(text: &str) -> &'static str {
    let t = text.to_lowercase();
    let has = |w: &str| t.contains(w);
    if has("judgment") || has("judgement") {
        "judgment"
    } else if has("order") {
        "order"
    } else if has("hearing") || has("listed") {
        "hearing"
    } else if has("filed") || has("filing") || has("preferred") {
        "filing"
    } else if has("application") {
        "application"
    } else if has("notice") {
        "notice"
    } else if has("paid") || has("payment") {
        "payment"
    } else {
        "event"
    }
}

fn case_key(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '/')
        .collect::<String>()
        .to_uppercase()
        .replace("NO", "")
}

/// A candidate fact for each date on one line (H04). The subject joins the
/// category to a case number or CNR on the same line, so two documents giving
/// different dates for the same order meet in conflict detection.
pub fn facts_from_line(
    doc: &str,
    text: &str,
    entities: &[Entity],
    disputed_spans: &[(usize, usize, String)],
) -> Vec<(ItemInput, Vec<String>)> {
    let category = category_of(text);
    let case = entities
        .iter()
        .find(|e| matches!(e.kind, EntityKind::CaseNumber | EntityKind::Cnr))
        .map(|e| case_key(&e.text));
    let amount = entities
        .iter()
        .find(|e| e.kind == EntityKind::Amount)
        .map(|e| e.text.clone());
    entities
        .iter()
        .filter(|e| matches!(e.kind, EntityKind::Date | EntityKind::RelativeDate))
        .map(|e| {
            let disputes: Vec<String> = disputed_spans
                .iter()
                .filter(|(s, en, _)| e.start < *en && *s < e.end)
                .map(|(_, _, id)| id.clone())
                .collect();
            let input = ItemInput {
                section: Section::FactualMatrix,
                kind: "fact".into(),
                description: text.to_string(),
                anchors: vec![NoteAnchor {
                    doc: doc.to_string(),
                    page: e.anchor.page,
                    line: Some(e.anchor.line),
                    line_hash: Some(e.anchor.line_hash.clone()),
                    rect: Some(e.anchor.rect),
                    start: Some(e.start),
                    end: Some(e.end),
                }],
                method: "rules:oa-ocr/extract_entities".into(),
                date: e.date.map(|d| d.format("%Y-%m-%d").to_string()),
                date_end: None,
                date_type: e.date_kind.map(DateType::from),
                date_text: Some(e.text.clone()),
                category: Some(category.into()),
                subject: case.as_ref().map(|c| format!("{category}:{c}")),
                amount: amount.clone(),
                party_role: None,
                party_name: None,
            };
            (input, disputes)
        })
        .collect()
}

/// The document's header date: the first explicit date in the top lines of
/// its first page (RQ-23).
pub fn header_date<'a>(first_page_lines: impl IntoIterator<Item = &'a str>) -> Option<NaiveDate> {
    first_page_lines.into_iter().take(5).find_map(|l| {
        oa_ocr::extract_dates(l, &DateAnchor::default())
            .entities
            .into_iter()
            .find(|e| e.kind == oa_ocr::DateKind::Explicit && e.date.is_some())
            .and_then(|e| e.date)
    })
}

/// The anchor for relative dates: the advocate's answer when there is one,
/// else the header and portal dates as found. The agreement of those two is
/// G's to judge (G rule 8).
pub fn date_anchor(
    header: Option<NaiveDate>,
    portal: Option<NaiveDate>,
    answer: Option<NaiveDate>,
) -> DateAnchor {
    match answer {
        Some(a) => DateAnchor {
            header: Some(a),
            portal: None,
        },
        None => DateAnchor { header, portal },
    }
}

/// The impugned order as the portal's lower-court search identifies it
/// (rule 9, RQ-62). The CNR may be unknown when the matter opens.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ImpugnedOrder {
    pub court_type: String,
    pub state: String,
    pub bench: String,
    pub case_type: String,
    pub number: String,
    pub year: String,
    pub order_date: String,
    pub cnr: Option<String>,
}

impl ImpugnedOrder {
    pub fn validate(&self) -> Result<(), String> {
        for (name, v) in [
            ("court type", &self.court_type),
            ("state", &self.state),
            ("bench", &self.bench),
            ("case type", &self.case_type),
            ("number", &self.number),
            ("year", &self.year),
        ] {
            if v.trim().is_empty() {
                return Err(format!("the impugned order needs its {name}"));
            }
        }
        NaiveDate::parse_from_str(&self.order_date, "%Y-%m-%d")
            .map_err(|_| format!("order date {:?} is not YYYY-MM-DD", self.order_date))?;
        Ok(())
    }

    /// Facts still missing, shown as "missing" until filled.
    pub fn missing(&self) -> Vec<&'static str> {
        if self.cnr.as_deref().is_none_or(|c| c.trim().is_empty()) {
            vec!["cnr"]
        } else {
            Vec::new()
        }
    }

    pub fn to_query(&self) -> LowerCourtQuery {
        LowerCourtQuery {
            court_type: self.court_type.clone(),
            state: self.state.clone(),
            bench: self.bench.clone(),
            case_type: self.case_type.clone(),
            number: self.number.clone(),
            year: self.year.clone(),
            order_date: self.order_date.clone(),
            cnr: self.cnr.clone().filter(|c| !c.trim().is_empty()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn anchor(doc: &str) -> NoteAnchor {
        NoteAnchor {
            doc: doc.into(),
            page: 1,
            line: Some(0),
            line_hash: Some(format!("sha256:{doc}")),
            rect: None,
            start: None,
            end: None,
        }
    }

    fn fact(id: &str, doc: &str, date: &str, kind: DateType) -> Item {
        Item {
            id: id.into(),
            version: 1,
            status: Status::Candidate,
            component: Component::CourtPortal,
            body: ItemInput {
                section: Section::FactualMatrix,
                kind: "fact".into(),
                description: format!("order dated {date}"),
                anchors: vec![anchor(doc)],
                method: "test".into(),
                date: Some(date.into()),
                date_type: Some(kind),
                category: Some("order".into()),
                subject: Some("order:WP1234/2018".into()),
                ..ItemInput::default()
            },
            ocr_disputes: Vec::new(),
            reason: None,
            created_by: "test".into(),
            created_at: "2026-11-04T09:00:00.000Z".into(),
        }
    }

    #[test]
    fn h_ac_03_exclusion_hides_only_in_its_view() {
        let items = vec![
            fact("A", "d1", "2019-03-12", DateType::Explicit),
            fact("B", "d1", "2020-01-07", DateType::Explicit),
        ];
        let x = vec![Exclusion {
            view: "synopsis".into(),
            target_kind: "event".into(),
            target: "A".into(),
        }];
        let none = BTreeSet::new();
        let syn = chronology(&items, "synopsis", &x, &none, false);
        assert_eq!(syn.len(), 1);
        assert_eq!(syn[0].item.id, "B");
        assert_eq!(
            chronology(&items, "list_of_dates", &x, &none, false).len(),
            2
        );
        let all = chronology(&items, "synopsis", &x, &none, true);
        assert!(all.iter().any(|e| e.item.id == "A" && e.excluded));
    }

    #[test]
    fn h_ac_03_category_exclusion() {
        let items = vec![fact("A", "d1", "2019-03-12", DateType::Explicit)];
        let x = vec![Exclusion {
            view: "synopsis".into(),
            target_kind: "category".into(),
            target: "order".into(),
        }];
        assert!(chronology(&items, "synopsis", &x, &BTreeSet::new(), false).is_empty());
    }

    #[test]
    fn h_ac_04_two_dates_for_one_order_raise_one_conflict_with_both_anchors() {
        let items = vec![
            fact("A", "d1", "2019-03-12", DateType::Explicit),
            fact("B", "d2", "2019-03-13", DateType::Explicit),
        ];
        let c = detect_conflicts(&items);
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].kind, ConflictKind::Date);
        let docs: Vec<&str> = c[0].anchors.iter().map(|a| a.doc.as_str()).collect();
        assert_eq!(docs, ["d1", "d2"]);
        let mut n = 0;
        let rows = reconcile_conflicts(&[], &c, "now", || {
            n += 1;
            format!("R{n}")
        });
        assert_eq!(rows.len(), 1);
        // Detection again raises nothing new.
        assert!(reconcile_conflicts(&rows, &c, "now", || "X".into()).is_empty());
        // A correction that removes the conflict resolves the item.
        let gone = reconcile_conflicts(&rows, &[], "later", || "X".into());
        assert_eq!(gone[0].state, "resolved");
    }

    #[test]
    fn h_rule_7_same_date_is_no_conflict_and_parties_compare_by_role() {
        let items = vec![
            fact("A", "d1", "2019-03-12", DateType::Explicit),
            fact("B", "d2", "2019-03-12", DateType::Explicit),
        ];
        assert!(detect_conflicts(&items).is_empty());
        let party = |id: &str, name: &str| Item {
            body: ItemInput {
                section: Section::ProceduralHistory,
                kind: "party".into(),
                party_role: Some("Petitioner".into()),
                party_name: Some(name.into()),
                ..ItemInput::default()
            },
            ..fact(id, "d1", "x", DateType::Explicit)
        };
        let c = detect_conflicts(&[party("P1", "Ramesh Rao"), party("P2", "Ramesh  Roa")]);
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].kind, ConflictKind::Party);
    }

    #[test]
    fn h_ac_07_list_of_dates_leaves_out_disputed_unresolved_and_unconfirmed_inferred() {
        let mut inferred_confirmed = fact("C", "d1", "2019-04-01", DateType::Inferred);
        inferred_confirmed.status = Status::Confirmed;
        let items = vec![
            fact("A", "d1", "2019-03-12", DateType::Explicit),
            fact("B", "d1", "2019-03-20", DateType::Inferred),
            inferred_confirmed,
            fact("D", "d1", "2019-05-01", DateType::Unresolved),
            fact("E", "d1", "2019-06-01", DateType::Explicit),
        ];
        let disputed: BTreeSet<String> = ["E".to_string()].into();
        let entries = chronology(&items, "list_of_dates", &[], &disputed, false);
        let ids: Vec<&str> = list_of_dates(&entries)
            .iter()
            .map(|e| e.item.id.as_str())
            .collect();
        assert_eq!(ids, ["A", "C"]);
    }

    #[test]
    fn h_ac_02_client_items_never_enter_the_ulos_n_bundle() {
        let mut client = fact("B", "d2", "2019-03-12", DateType::Explicit);
        client.component = Component::ClientSupplied;
        let bundle = ulos_n_bundle(&[fact("A", "d1", "2019-03-12", DateType::Explicit), client]);
        let ids: Vec<&str> = bundle["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["A"]);
        assert_eq!(Component::ClientSupplied.label(), "Supplied by client");
    }

    #[test]
    fn h_ac_13_excluded_events_are_counted_and_never_dropped() {
        let items = vec![fact("A", "d1", "2019-03-12", DateType::Explicit)];
        let x = vec![Exclusion {
            view: "synopsis".into(),
            target_kind: "event".into(),
            target: "A".into(),
        }];
        let counts = section_counts(&items, &[], &x, &BTreeSet::new());
        let fm = counts
            .iter()
            .find(|c| c.section == "factual_matrix")
            .unwrap();
        assert_eq!((fm.total, fm.excluded), (1, 1));
    }

    #[test]
    fn h_edge_year_only_and_range_and_placeholder_sort() {
        let mut range = fact("R", "d1", "2019-03", DateType::Explicit);
        range.body.date_end = Some("2019-05".into());
        let items = vec![
            fact("P", "d1", "01-01-1900", DateType::Explicit),
            fact("Y", "d1", "2019", DateType::Explicit),
            range,
        ];
        let ids: Vec<String> = chronology(&items, "v", &[], &BTreeSet::new(), false)
            .into_iter()
            .map(|e| e.item.id)
            .collect();
        // The OQ-04 placeholder is kept verbatim and sorts after real dates.
        assert_eq!(ids, ["Y", "R", "P"]);
    }

    #[test]
    fn h_rule_1_validation_refuses_projections_and_missing_anchors() {
        let mut input = fact("A", "d1", "2019-03-12", DateType::Explicit).body;
        assert!(validate(&input).is_ok());
        input.anchors.clear();
        assert!(validate(&input).is_err());
        input.section = Section::Chronology;
        assert!(validate(&input).unwrap_err().contains("projection"));
    }

    #[test]
    fn h_ac_09_impugned_order_round_trips_to_the_lower_court_search() {
        let o = ImpugnedOrder {
            court_type: "HC".into(),
            state: "27".into(),
            bench: "1".into(),
            case_type: "WP".into(),
            number: "1234".into(),
            year: "2018".into(),
            order_date: "2019-03-12".into(),
            cnr: None,
        };
        assert_eq!(o.missing(), ["cnr"]);
        let wire = serde_json::to_string(&o).unwrap();
        let back: ImpugnedOrder = serde_json::from_str(&wire).unwrap();
        let found =
            oa_capture::search_lower_court(oa_capture::SC_LOWER_COURT, &back.to_query()).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].cnr.as_deref(), Some("MHHC010012342018"));
    }

    #[test]
    fn g_ac_10_header_date_is_the_first_explicit_date_on_top() {
        let d = header_date(["IN THE HIGH COURT", "Dated 12.03.2019", "on 13.03.2019"]);
        assert_eq!(d, NaiveDate::from_ymd_opt(2019, 3, 12));
        let answer = NaiveDate::from_ymd_opt(2020, 1, 1);
        assert_eq!(date_anchor(d, None, answer).header, answer);
    }
}

//! The Notebook (spec H): the kernel side of the integrated matter record.
//! Writers propose items, the kernel resolves their anchors, runs conflict
//! detection (H09) and commits items, review items and exclusions through
//! the single commit path (RQ-06). Every change appends an item version, so
//! earlier versions stay readable (rule 12).

use std::collections::{BTreeMap, BTreeSet};

use chrono::NaiveDate;
use oa_notebook::{
    chronology, detect_conflicts, excluded_in, facts_from_line, list_of_dates, prose_eligible,
    readiness_json, reconcile_conflicts, section_counts, shown_status, validate, Blocker,
    Component, DateType, Exclusion, ImpugnedOrder, Item, ItemInput, NoteAnchor, ReviewItem,
    Section, Status,
};
use oa_store::{JobStatus, MatterWrite, NotebookExclusionRow, NotebookItemRow, NotebookReviewRow};
use oa_types::{ErrorCode, OaError, Origin};
use serde_json::{json, Value};

use crate::records::Live;
use crate::{rejected, store_err, Ctx, Kernel};

/// The view the chronology shows when none is named.
const DEFAULT_VIEW: &str = "default";
const IMPUGNED_KEY: &str = "impugned";
/// Job kinds that are ingestion work for readiness (H07).
const INGESTION_JOBS: &[&str] = &["ingest", "ocr", "capture", "evidence"];

/// The Notebook as stored, with the open OCR disputes it depends on.
struct Book {
    versions: Vec<Item>,
    current: Vec<Item>,
    review: Vec<ReviewItem>,
    exclusions: Vec<Exclusion>,
    open_ocr: BTreeSet<String>,
}

impl Book {
    fn item(&self, id: &str) -> Option<&Item> {
        self.current.iter().find(|i| i.id == id)
    }

    fn open_ocr_of(&self, item: &Item) -> Vec<String> {
        item.ocr_disputes
            .iter()
            .filter(|d| self.open_ocr.contains(*d))
            .cloned()
            .collect()
    }

    fn open_conflicts_of(&self, id: &str) -> Vec<String> {
        self.review
            .iter()
            .filter(|r| {
                r.kind == "conflict" && r.state == "open" && r.items.iter().any(|i| i == id)
            })
            .map(|r| r.id.clone())
            .collect()
    }

    /// Items with an open OCR dispute on their source, or in an open
    /// conflict.
    fn disputed(&self) -> BTreeSet<String> {
        let mut out: BTreeSet<String> = self
            .current
            .iter()
            .filter(|i| !self.open_ocr_of(i).is_empty())
            .map(|i| i.id.clone())
            .collect();
        for r in self
            .review
            .iter()
            .filter(|r| r.kind == "conflict" && r.state == "open")
        {
            out.extend(r.items.iter().cloned());
        }
        out
    }

    fn views_excluding(&self, item: &Item) -> Vec<String> {
        let views: BTreeSet<&str> = self.exclusions.iter().map(|x| x.view.as_str()).collect();
        views
            .into_iter()
            .filter(|v| excluded_in(item, v, &self.exclusions))
            .map(str::to_string)
            .collect()
    }

    fn item_json(&self, item: &Item, disputed: &BTreeSet<String>) -> Value {
        let is_disputed = disputed.contains(&item.id);
        let mut v = serde_json::to_value(item).unwrap_or(Value::Null);
        v["shown_status"] = json!(shown_status(item, is_disputed));
        v["disputed"] = json!(is_disputed);
        v["component_label"] = json!(item.component.label());
        v["open_ocr_disputes"] = json!(self.open_ocr_of(item));
        v["conflicts"] = json!(self.open_conflicts_of(&item.id));
        v["excluded_in"] = json!(self.views_excluding(item));
        if item.is_dated() {
            v["prose_eligible"] = json!(prose_eligible(item, is_disputed));
        }
        v
    }
}

fn serialise<T: serde::Serialize>(what: &str, v: &T) -> Result<String, OaError> {
    serde_json::to_string(v).map_err(|e| {
        OaError::new(
            ErrorCode::Internal,
            format!("{what} does not serialise: {e}"),
        )
    })
}

fn damaged(what: &str, e: serde_json::Error) -> OaError {
    OaError::new(
        ErrorCode::MatterDamaged,
        format!("{what} is not valid JSON: {e}"),
    )
}

fn status_str(s: Status) -> &'static str {
    match s {
        Status::Candidate => "candidate",
        Status::Confirmed => "confirmed",
    }
}

fn item_row(item: &Item) -> Result<MatterWrite, OaError> {
    Ok(MatterWrite::InsertNotebookItem(NotebookItemRow {
        id: item.id.clone(),
        version: i64::from(item.version),
        section: item.body.section.as_str().to_string(),
        kind: item.body.kind.clone(),
        status: status_str(item.status).to_string(),
        component: item.component.as_str().to_string(),
        data: serialise("notebook item", item)?,
        created_at: item.created_at.clone(),
    }))
}

fn review_row(r: &ReviewItem) -> Result<MatterWrite, OaError> {
    Ok(MatterWrite::UpsertNotebookReview(NotebookReviewRow {
        id: r.id.clone(),
        kind: r.kind.clone(),
        key: r.key.clone(),
        state: r.state.clone(),
        data: serialise("review item", r)?,
        created_at: r.created_at.clone(),
        updated_at: r.updated_at.clone(),
    }))
}

/// One Notebook write: its ledger command and body, the item versions it adds
/// and the review items it raises.
struct Change<'a> {
    command: &'a str,
    body: Value,
    items: &'a [Item],
    review: Vec<ReviewItem>,
}

fn new_id() -> String {
    ulid::Ulid::new().to_string()
}

fn usage(message: impl Into<String>) -> OaError {
    OaError::new(ErrorCode::Usage, message)
}

fn same_anchor(a: &NoteAnchor, b: &NoteAnchor) -> bool {
    a.doc == b.doc && a.page == b.page && a.line_hash == b.line_hash && a.start == b.start
}

impl Kernel {
    fn load_book(live: &Live) -> Result<Book, OaError> {
        let mut versions = Vec::new();
        for row in live.store.notebook_items().map_err(store_err)? {
            let item: Item = serde_json::from_str(&row.data)
                .map_err(|e| damaged(&format!("notebook item {}", row.id), e))?;
            versions.push(item);
        }
        let mut order: Vec<String> = Vec::new();
        let mut latest: BTreeMap<String, Item> = BTreeMap::new();
        for v in &versions {
            match latest.get(&v.id) {
                Some(old) if old.version >= v.version => {}
                Some(_) => {
                    latest.insert(v.id.clone(), v.clone());
                }
                None => {
                    order.push(v.id.clone());
                    latest.insert(v.id.clone(), v.clone());
                }
            }
        }
        let current = order.iter().filter_map(|id| latest.remove(id)).collect();
        let mut review = Vec::new();
        for row in live.store.notebook_review().map_err(store_err)? {
            review.push(
                serde_json::from_str(&row.data)
                    .map_err(|e| damaged(&format!("review item {}", row.id), e))?,
            );
        }
        let exclusions = live
            .store
            .notebook_exclusions()
            .map_err(store_err)?
            .into_iter()
            .map(|x| Exclusion {
                view: x.view,
                target_kind: x.target_kind,
                target: x.target,
            })
            .collect();
        let open_ocr = Self::open_dispute_ids(live)?
            .into_iter()
            .map(|(id, _)| id)
            .collect();
        Ok(Book {
            versions,
            current,
            review,
            exclusions,
            open_ocr,
        })
    }

    /// The names of the matter's parties, for the agreement engine and entity
    /// extraction (G-AC-05).
    pub(crate) fn notebook_parties(&self, live: &Live) -> Result<Vec<String>, OaError> {
        let mut latest: BTreeMap<String, (i64, String)> = BTreeMap::new();
        for row in live.store.notebook_items().map_err(store_err)? {
            if row.kind != "party" {
                continue;
            }
            let item: Item = serde_json::from_str(&row.data)
                .map_err(|e| damaged(&format!("notebook item {}", row.id), e))?;
            let name = item.body.party_name.unwrap_or_default();
            if latest.get(&row.id).is_none_or(|(v, _)| *v < row.version) {
                latest.insert(row.id, (row.version, name));
            }
        }
        Ok(latest
            .into_values()
            .map(|(_, n)| n)
            .filter(|n| !n.trim().is_empty())
            .collect())
    }

    /// The advocate's answer to a document's date question (RQ-23).
    pub(crate) fn notebook_date_answer(
        &self,
        live: &Live,
        doc: &str,
    ) -> Result<Option<NaiveDate>, OaError> {
        Ok(live
            .store
            .notebook_meta(&format!("date_anchor:{doc}"))
            .map_err(store_err)?
            .and_then(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok()))
    }

    /// Court portal when every anchored document came from the portal (rule
    /// 2). A document captured from the portal stays a court record even if
    /// the client also sent it.
    fn component_for(live: &Live, anchors: &[NoteAnchor]) -> Result<Component, OaError> {
        for a in anchors {
            let origins = live.store.origins(&a.doc).map_err(store_err)?;
            if !origins.iter().any(|o| o.origin == "court_portal") {
                return Ok(Component::ClientSupplied);
            }
        }
        Ok(Component::CourtPortal)
    }

    /// Refuses and audits a write whose anchor does not resolve to a blob
    /// region (failure modes, H-AC-01).
    fn check_anchors(
        live: &Live,
        ctx: &Ctx,
        command: &str,
        anchors: &[NoteAnchor],
    ) -> Result<(), OaError> {
        for a in anchors {
            let reason = match live.store.evidence(&a.doc).map_err(store_err)? {
                None => Some(format!("anchor names {}, which is not in evidence", a.doc)),
                Some(_) => Self::resolve_anchor(live, &a.doc, a.page, a.line_hash.as_deref()).err(),
            };
            if let Some(reason) = reason {
                let body = serde_json::to_vec(a).unwrap_or_default();
                live.store
                    .record_rejected(&rejected(ctx, command, &reason, &body))
                    .map_err(store_err)?;
                return Err(OaError::new(
                    ErrorCode::WriteRefused,
                    format!("unresolved anchor: {reason}"),
                ));
            }
        }
        Ok(())
    }

    /// Commits new item versions with conflict detection over the result, so
    /// review items land in the same transaction (H09).
    fn commit_notebook(
        &self,
        live: &Live,
        ctx: &Ctx,
        book: &Book,
        change: Change<'_>,
    ) -> Result<Vec<ReviewItem>, OaError> {
        let Change {
            command,
            mut body,
            items: new_items,
            mut review,
        } = change;
        let mut after: Vec<Item> = book
            .current
            .iter()
            .filter(|i| !new_items.iter().any(|n| n.id == i.id))
            .cloned()
            .collect();
        after.extend(new_items.iter().cloned());
        let now = oa_types::now_utc();
        let conflicts = detect_conflicts(&after);
        review.extend(reconcile_conflicts(&book.review, &conflicts, &now, new_id));
        let mut writes = Vec::new();
        for i in new_items {
            writes.push(item_row(i)?);
        }
        for r in &review {
            writes.push(review_row(r)?);
        }
        let links: Vec<Value> = new_items
            .iter()
            .flat_map(|i| {
                i.body
                    .anchors
                    .iter()
                    .map(move |a| json!({ "from": i.id, "to": a.doc }))
            })
            .chain(review.iter().flat_map(|r| {
                r.items
                    .iter()
                    .map(move |i| json!({ "from": r.id, "to": i }))
            }))
            .collect();
        body["items"] = json!(new_items
            .iter()
            .map(|i| json!({ "id": i.id, "version": i.version }))
            .collect::<Vec<_>>());
        body["review"] = json!(review
            .iter()
            .map(|r| json!({ "id": r.id, "kind": r.kind, "state": r.state }))
            .collect::<Vec<_>>());
        body["links"] = json!(links);
        self.commit_event(live, ctx, command, body, &writes)?;
        Ok(review)
    }

    fn new_item(
        live: &Live,
        ctx: &Ctx,
        id: String,
        version: u32,
        body: ItemInput,
        ocr_disputes: Vec<String>,
        reason: Option<String>,
    ) -> Result<Item, OaError> {
        Ok(Item {
            id,
            version,
            status: Status::Candidate,
            component: Self::component_for(live, &body.anchors)?,
            body,
            ocr_disputes,
            reason,
            created_by: ctx.origin.actor().to_string(),
            created_at: oa_types::now_utc(),
        })
    }

    /// The writer entry point (H02): a domain service proposes one item.
    pub(crate) fn notebook_propose(
        &self,
        ctx: &Ctx,
        matter: &str,
        input: &ItemInput,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        validate(input).map_err(usage)?;
        Self::check_anchors(&live, ctx, "notebook.propose", &input.anchors)?;
        let book = Self::load_book(&live)?;
        let item = Self::new_item(&live, ctx, new_id(), 1, input.clone(), Vec::new(), None)?;
        self.commit_notebook(
            &live,
            ctx,
            &book,
            Change {
                command: "notebook.proposed",
                body: json!({ "section": input.section.as_str(), "kind": input.kind }),
                items: std::slice::from_ref(&item),
                review: Vec::new(),
            },
        )?;
        let book = Self::load_book(&live)?;
        Ok(book.item_json(&item, &book.disputed()))
    }

    /// The extraction writer: candidate facts for each date in a document,
    /// its source-document item, and one date question per file when its
    /// relative dates have no anchor (H04, RQ-23).
    pub(crate) fn notebook_extract(
        &self,
        ctx: &Ctx,
        matter: &str,
        doc: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let Some(evidence) = live.store.evidence(doc).map_err(store_err)? else {
            return Err(OaError::new(
                ErrorCode::NotFound,
                format!("no evidence entry {doc}"),
            ));
        };
        let (lines, questions) = self.entity_lines(&live, doc)?;
        let book = Self::load_book(&live)?;
        let mut new_items: Vec<Item> = Vec::new();
        let (mut added, mut revised, mut unchanged) = (0, 0, 0);
        let has_source = book.current.iter().any(|i| {
            i.body.kind == "source_document" && i.body.anchors.iter().any(|a| a.doc == doc)
        });
        if !has_source {
            if let Some((page, hash)) = Self::first_line(&live, doc)? {
                let input = ItemInput {
                    section: Section::SourceDocuments,
                    kind: "source_document".into(),
                    description: evidence.original_name.clone(),
                    anchors: vec![NoteAnchor {
                        doc: doc.to_string(),
                        page,
                        line: None,
                        line_hash: (!hash.is_empty()).then_some(hash),
                        rect: Some(oa_ocr::Rect::zero()),
                        start: None,
                        end: None,
                    }],
                    method: "ingest:evidence".into(),
                    ..ItemInput::default()
                };
                new_items.push(Self::new_item(
                    &live,
                    ctx,
                    new_id(),
                    1,
                    input,
                    Vec::new(),
                    None,
                )?);
                added += 1;
            }
        }
        for l in &lines {
            for (input, disputes) in facts_from_line(doc, &l.text, &l.entities, &l.open) {
                let existing = book.current.iter().find(|i| {
                    i.body.kind == "fact"
                        && i.body
                            .anchors
                            .first()
                            .zip(input.anchors.first())
                            .is_some_and(|(a, b)| same_anchor(a, b))
                });
                match existing {
                    Some(old)
                        if old.body.date_type == Some(DateType::Unresolved)
                            && input.date_type != Some(DateType::Unresolved) =>
                    {
                        let mut ids = old.ocr_disputes.clone();
                        for d in disputes {
                            if !ids.contains(&d) {
                                ids.push(d);
                            }
                        }
                        new_items.push(Self::new_item(
                            &live,
                            ctx,
                            old.id.clone(),
                            old.version + 1,
                            input,
                            ids,
                            Some("re-extracted with a date anchor".into()),
                        )?);
                        revised += 1;
                    }
                    Some(_) => unchanged += 1,
                    None => {
                        new_items.push(Self::new_item(
                            &live,
                            ctx,
                            new_id(),
                            1,
                            input,
                            disputes,
                            None,
                        )?);
                        added += 1;
                    }
                }
            }
        }
        let mut review = Vec::new();
        let key = format!("date_anchor|{doc}");
        if !questions.is_empty() && !book.review.iter().any(|r| r.key == key) {
            let now = oa_types::now_utc();
            review.push(ReviewItem {
                id: new_id(),
                kind: "date_anchor".into(),
                key,
                state: "open".into(),
                summary: format!("{}: {}", evidence.original_name, questions[0]),
                items: Vec::new(),
                anchors: Vec::new(),
                doc: Some(doc.to_string()),
                reason: None,
                decided_by: None,
                created_at: now.clone(),
                updated_at: now,
            });
        }
        let review = self.commit_notebook(
            &live,
            ctx,
            &book,
            Change {
                command: "notebook.extracted",
                body: json!({ "doc": doc }),
                items: &new_items,
                review,
            },
        )?;
        Ok(json!({
            "doc": doc,
            "added": added,
            "revised": revised,
            "unchanged": unchanged,
            "questions": questions,
            "review": review.iter().map(|r| json!({ "id": r.id, "kind": r.kind, "state": r.state })).collect::<Vec<_>>(),
        }))
    }

    /// A correction is a new version with a reason (rule 12). It goes back to
    /// candidate, and keeps the OCR disputes of the version it replaces, so a
    /// correction cannot clear a dispute.
    pub(crate) fn notebook_correct(
        &self,
        ctx: &Ctx,
        matter: &str,
        id: &str,
        reason: &str,
        input: &ItemInput,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        if reason.trim().is_empty() {
            return Err(usage("a correction needs --reason"));
        }
        let book = Self::load_book(&live)?;
        let old = book
            .item(id)
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no notebook item {id}")))?;
        if old.body.section != input.section || old.body.kind != input.kind {
            return Err(usage(format!(
                "a correction keeps the section and kind ({} {})",
                old.body.section.as_str(),
                old.body.kind
            )));
        }
        validate(input).map_err(usage)?;
        Self::check_anchors(&live, ctx, "notebook.correct", &input.anchors)?;
        let item = Self::new_item(
            &live,
            ctx,
            old.id.clone(),
            old.version + 1,
            input.clone(),
            old.ocr_disputes.clone(),
            Some(reason.to_string()),
        )?;
        self.commit_notebook(
            &live,
            ctx,
            &book,
            Change {
                command: "notebook.corrected",
                body: json!({ "item": id, "reason": reason }),
                items: std::slice::from_ref(&item),
                review: Vec::new(),
            },
        )?;
        let book = Self::load_book(&live)?;
        Ok(book.item_json(&item, &book.disputed()))
    }

    /// The advocate confirms a candidate. Refused while the item's source text
    /// has an open OCR dispute (G-AC-07).
    pub(crate) fn notebook_confirm(
        &self,
        ctx: &Ctx,
        matter: &str,
        id: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let book = Self::load_book(&live)?;
        let item = book
            .item(id)
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no notebook item {id}")))?;
        if item.status == Status::Confirmed {
            return Err(OaError::new(
                ErrorCode::Conflict,
                format!("item {id} is already confirmed"),
            ));
        }
        let open = book.open_ocr_of(item);
        if !open.is_empty() {
            let reason = format!(
                "item {id} rests on text with an open OCR dispute ({}); decide it with `oa ocr decide` first",
                open.join(", ")
            );
            live.store
                .record_rejected(&rejected(ctx, "notebook.confirm", &reason, id.as_bytes()))
                .map_err(store_err)?;
            return Err(
                OaError::new(ErrorCode::Conflict, reason).with_detail(json!({ "disputes": open }))
            );
        }
        if ctx.origin != Origin::Ui {
            self.require_presence(&format!(
                "Confirm {} {id}: {}",
                item.body.kind, item.body.description
            ))?;
        }
        let confirmed = Item {
            version: item.version + 1,
            status: Status::Confirmed,
            reason: Some("confirmed by the advocate".into()),
            created_by: ctx.origin.actor().to_string(),
            created_at: oa_types::now_utc(),
            ..item.clone()
        };
        self.commit_notebook(
            &live,
            ctx,
            &book,
            Change {
                command: "notebook.confirmed",
                body: json!({ "item": id }),
                items: std::slice::from_ref(&confirmed),
                review: Vec::new(),
            },
        )?;
        let book = Self::load_book(&live)?;
        Ok(book.item_json(&confirmed, &book.disputed()))
    }

    /// The advocate skips a review item so the Notebook can become ready
    /// (rule 10, L-05). A human command.
    pub(crate) fn notebook_skip(
        &self,
        ctx: &Ctx,
        matter: &str,
        review: &str,
        reason: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        if reason.trim().is_empty() {
            return Err(usage("a skip needs --reason"));
        }
        let book = Self::load_book(&live)?;
        let r =
            book.review.iter().find(|r| r.id == review).ok_or_else(|| {
                OaError::new(ErrorCode::NotFound, format!("no review item {review}"))
            })?;
        if r.state != "open" {
            return Err(OaError::new(
                ErrorCode::Conflict,
                format!("review item {review} is already {}", r.state),
            ));
        }
        if ctx.origin != Origin::Ui {
            self.require_presence(&format!("Skip review item: {}", r.summary))?;
        }
        let skipped = ReviewItem {
            state: "skipped".into(),
            reason: Some(reason.to_string()),
            decided_by: Some(ctx.origin.actor().to_string()),
            updated_at: oa_types::now_utc(),
            ..r.clone()
        };
        self.commit_event(
            &live,
            ctx,
            "notebook.review_skipped",
            json!({ "review": review, "reason": reason }),
            &[review_row(&skipped)?],
        )?;
        Ok(serde_json::to_value(&skipped).unwrap_or(Value::Null))
    }

    /// The advocate's answer to a document's date question (RQ-23). A human
    /// command.
    pub(crate) fn notebook_date_anchor(
        &self,
        ctx: &Ctx,
        matter: &str,
        doc: &str,
        date: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| usage(format!("date {date:?} is not YYYY-MM-DD")))?;
        if live.store.evidence(doc).map_err(store_err)?.is_none() {
            return Err(OaError::new(
                ErrorCode::NotFound,
                format!("no evidence entry {doc}"),
            ));
        }
        if ctx.origin != Origin::Ui {
            self.require_presence(&format!("Anchor relative dates in {doc} on {date}"))?;
        }
        let book = Self::load_book(&live)?;
        let now = oa_types::now_utc();
        let mut writes = vec![MatterWrite::SetNotebookMeta {
            key: format!("date_anchor:{doc}"),
            value: date.to_string(),
        }];
        for r in book.review.iter().filter(|r| {
            r.kind == "date_anchor" && r.state == "open" && r.doc.as_deref() == Some(doc)
        }) {
            writes.push(review_row(&ReviewItem {
                state: "resolved".into(),
                reason: Some(format!("anchored on {date}")),
                decided_by: Some(ctx.origin.actor().to_string()),
                updated_at: now.clone(),
                ..r.clone()
            })?);
        }
        self.commit_event(
            &live,
            ctx,
            "notebook.date_anchored",
            json!({ "doc": doc, "date": date }),
            &writes,
        )?;
        Ok(json!({ "doc": doc, "date": date }))
    }

    /// Hides or restores an event or category in one view (rule 6).
    pub(crate) fn notebook_exclude(
        &self,
        ctx: &Ctx,
        matter: &str,
        view: &str,
        event: Option<&str>,
        category: Option<&str>,
        restore: bool,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        if view.trim().is_empty() {
            return Err(usage("exclude needs --view"));
        }
        let (target_kind, target) = match (event, category) {
            (Some(e), None) => ("event", e),
            (None, Some(c)) if !c.trim().is_empty() => ("category", c),
            _ => return Err(usage("exclude takes exactly one of --event or --category")),
        };
        if target_kind == "event" {
            let book = Self::load_book(&live)?;
            if !book.item(target).is_some_and(Item::is_dated) {
                return Err(OaError::new(
                    ErrorCode::NotFound,
                    format!("no dated event {target}"),
                ));
            }
        }
        let write = if restore {
            MatterWrite::RemoveNotebookExclusion {
                view: view.to_string(),
                target_kind: target_kind.to_string(),
                target: target.to_string(),
            }
        } else {
            MatterWrite::AddNotebookExclusion(NotebookExclusionRow {
                view: view.to_string(),
                target_kind: target_kind.to_string(),
                target: target.to_string(),
                created_at: oa_types::now_utc(),
            })
        };
        let command = if restore {
            "notebook.restored"
        } else {
            "notebook.excluded"
        };
        let body = json!({ "view": view, "target_kind": target_kind, "target": target });
        self.commit_event(&live, ctx, command, body.clone(), &[write])?;
        Ok(
            json!({ "view": view, "target_kind": target_kind, "target": target, "excluded": !restore }),
        )
    }

    pub(crate) fn notebook_impugned_set(
        &self,
        ctx: &Ctx,
        matter: &str,
        order: &ImpugnedOrder,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        order.validate().map_err(usage)?;
        let value = serialise("impugned order", order)?;
        self.commit_event(
            &live,
            ctx,
            "notebook.impugned_set",
            json!({ "impugned": order }),
            &[MatterWrite::SetNotebookMeta {
                key: IMPUGNED_KEY.into(),
                value,
            }],
        )?;
        Ok(json!({ "impugned": order, "missing": order.missing() }))
    }

    fn impugned(live: &Live) -> Result<Option<ImpugnedOrder>, OaError> {
        live.store
            .notebook_meta(IMPUGNED_KEY)
            .map_err(store_err)?
            .map(|v| serde_json::from_str(&v).map_err(|e| damaged("the impugned order", e)))
            .transpose()
    }

    /// One or all sections with their counts (H08).
    pub(crate) fn notebook_show(
        &self,
        matter: &str,
        section: Option<&str>,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let section = section
            .map(|s| Section::parse(s).ok_or_else(|| usage(format!("no section {s:?}"))))
            .transpose()?;
        let book = Self::load_book(&live)?;
        let disputed = book.disputed();
        let items: Vec<Value> = book
            .current
            .iter()
            .filter(|i| match section {
                None => true,
                Some(Section::Chronology) => i.is_dated(),
                Some(Section::Review) => false,
                Some(s) => i.body.section == s,
            })
            .map(|i| book.item_json(i, &disputed))
            .collect();
        let review: Vec<&ReviewItem> = book
            .review
            .iter()
            .filter(|_| matches!(section, None | Some(Section::Review)))
            .collect();
        let impugned = Self::impugned(&live)?;
        let missing: Vec<&str> = match &impugned {
            Some(o) => o.missing(),
            None => vec!["impugned_order"],
        };
        let as_of = live
            .store
            .last_event()
            .map_err(store_err)?
            .map(|e| e.seq)
            .unwrap_or(0);
        Ok(json!({
            "matter": live.row.id,
            "as_of_seq": as_of,
            "impugned": impugned,
            "missing": missing,
            "counts": section_counts(&book.current, &book.review, &book.exclusions, &disputed),
            "items": items,
            "review": review,
        }))
    }

    /// One item at its current or a named version (H-AC-08).
    pub(crate) fn notebook_item(
        &self,
        matter: &str,
        id: &str,
        version: Option<u32>,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let book = Self::load_book(&live)?;
        let mut versions: Vec<&Item> = book.versions.iter().filter(|i| i.id == id).collect();
        if versions.is_empty() {
            return Err(OaError::new(
                ErrorCode::NotFound,
                format!("no notebook item {id}"),
            ));
        }
        versions.sort_by_key(|i| i.version);
        let chosen = match version {
            None => *versions.last().expect("not empty"),
            Some(n) => *versions.iter().find(|i| i.version == n).ok_or_else(|| {
                OaError::new(ErrorCode::NotFound, format!("item {id} has no version {n}"))
            })?,
        };
        let mut v = book.item_json(chosen, &book.disputed());
        v["current_version"] = json!(versions.last().map(|i| i.version));
        v["versions"] = json!(versions
            .iter()
            .map(|i| json!({
                "version": i.version,
                "status": status_str(i.status),
                "reason": i.reason,
                "created_by": i.created_by,
                "created_at": i.created_at,
            }))
            .collect::<Vec<_>>());
        Ok(v)
    }

    /// The Factual Matrix (H04).
    pub(crate) fn notebook_facts(
        &self,
        matter: &str,
        status: Option<&str>,
    ) -> Result<Vec<Value>, OaError> {
        if let Some(s) = status {
            if !matches!(s, "candidate" | "confirmed" | "disputed") {
                return Err(usage(format!(
                    "status must be candidate, confirmed or disputed, not {s}"
                )));
            }
        }
        let live = self.live(matter)?;
        let book = Self::load_book(&live)?;
        let disputed = book.disputed();
        Ok(book
            .current
            .iter()
            .filter(|i| i.body.section == Section::FactualMatrix)
            .filter(|i| status.is_none_or(|s| shown_status(i, disputed.contains(&i.id)) == s))
            .map(|i| book.item_json(i, &disputed))
            .collect())
    }

    /// The chronology of one view (H05). With `for_prose`, only the events a
    /// generated List of Dates may state (rule 8).
    pub(crate) fn notebook_chronology(
        &self,
        matter: &str,
        view: Option<&str>,
        show_excluded: bool,
        for_prose: bool,
    ) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        let book = Self::load_book(&live)?;
        let disputed = book.disputed();
        let view = view.unwrap_or(DEFAULT_VIEW);
        let entries = chronology(
            &book.current,
            view,
            &book.exclusions,
            &disputed,
            show_excluded && !for_prose,
        );
        let shown: Vec<_> = if for_prose {
            list_of_dates(&entries).into_iter().cloned().collect()
        } else {
            entries
        };
        Ok(shown
            .iter()
            .map(|e| {
                let mut v = book.item_json(&e.item, &disputed);
                v["view"] = json!(view);
                v["excluded"] = json!(e.excluded);
                v
            })
            .collect())
    }

    /// Ready, or exactly what blocks readiness (H07, rule 10).
    pub(crate) fn notebook_ready(&self, matter: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let mut blockers = Vec::new();
        for j in self.registry()?.jobs().map_err(store_err)? {
            if j.status == JobStatus::Running
                && INGESTION_JOBS.iter().any(|k| j.kind.starts_with(k))
            {
                blockers.push(Blocker {
                    kind: "job".into(),
                    id: j.id.clone(),
                    label: format!("{} running ({}/{})", j.kind, j.done, j.total),
                });
            }
        }
        for i in live.store.ingests().map_err(store_err)? {
            let processed = i.text_fingerprint.is_some()
                || live
                    .store
                    .ocr_document(&i.evidence_id)
                    .map_err(store_err)?
                    .is_some();
            if i.status == "pending" && !processed {
                let name = live
                    .store
                    .evidence(&i.evidence_id)
                    .map_err(store_err)?
                    .map(|e| e.original_name)
                    .unwrap_or_default();
                blockers.push(Blocker {
                    kind: "ingest".into(),
                    id: i.evidence_id.clone(),
                    label: format!("queued for ingestion: {name}"),
                });
            }
        }
        let book = Self::load_book(&live)?;
        for r in book.review.iter().filter(|r| r.state == "open") {
            blockers.push(Blocker {
                kind: "review_item".into(),
                id: r.id.clone(),
                label: r.summary.clone(),
            });
        }
        for (id, doc) in Self::open_dispute_ids(&live)? {
            blockers.push(Blocker {
                kind: "ocr_dispute".into(),
                id,
                label: format!("open OCR dispute in {doc}"),
            });
        }
        let mut v = readiness_json(&blockers);
        v["matter"] = json!(live.row.id);
        Ok(v)
    }

    /// Every conflict review item, open or closed, with its anchors (H09).
    pub(crate) fn notebook_conflicts(&self, matter: &str) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        let book = Self::load_book(&live)?;
        Ok(book
            .review
            .iter()
            .filter(|r| r.kind == "conflict")
            .map(|r| serde_json::to_value(r).unwrap_or(Value::Null))
            .collect())
    }

    /// The chain from an item to the original file: extract, line, page,
    /// source hash, original file (rule 11).
    pub(crate) fn trace(&self, matter: &str, id: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let book = Self::load_book(&live)?;
        let item = book
            .item(id)
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no notebook item {id}")))?;
        let mut chain = Vec::new();
        for a in &item.body.anchors {
            let evidence = live.store.evidence(&a.doc).map_err(store_err)?;
            let resolved = Self::resolve_anchor(&live, &a.doc, a.page, a.line_hash.as_deref());
            let (line, line_hash, text, rect, error) = match resolved {
                Ok(r) => (r.line, r.line_hash, r.text, Some(r.rect), None),
                Err(e) => (None, None, None, None, Some(e)),
            };
            let extract = match (&text, a.start, a.end) {
                (Some(t), Some(s), Some(e)) => t.get(s..e).map(str::to_string),
                (Some(t), _, _) => Some(t.clone()),
                _ => None,
            };
            chain.push(json!({
                "extract": extract,
                "line": line,
                "line_hash": line_hash,
                "anchored_line_hash": a.line_hash,
                "page": a.page,
                "rect": a.rect.or(rect),
                "doc": a.doc,
                "source_hash": evidence.as_ref().map(|e| e.blob.clone()),
                "original_file": evidence.as_ref().map(|e| e.original_name.clone()),
                "resolved": error.is_none(),
                "error": error,
            }));
        }
        Ok(json!({
            "item": id,
            "kind": item.body.kind,
            "description": item.body.description,
            "component": item.component.as_str(),
            "component_label": item.component.label(),
            "chain": chain,
        }))
    }

    /// A Notebook item or review item, for the Inspector (A16).
    pub(crate) fn notebook_record(
        live: &Live,
        id: &str,
    ) -> Result<Option<(&'static str, Value)>, OaError> {
        let book = Self::load_book(live)?;
        if let Some(i) = book.item(id) {
            return Ok(Some(("notebook_item", book.item_json(i, &book.disputed()))));
        }
        if let Some(r) = book.review.iter().find(|r| r.id == id) {
            return Ok(Some((
                "notebook_review",
                serde_json::to_value(r).unwrap_or(Value::Null),
            )));
        }
        Ok(None)
    }
}

//! Documents and editors (spec J) on the kernel side: generated drafts,
//! proposals against paragraph anchors, revert, the hosted editor's working
//! copy, the Changes viewer, the filing PDF/A and its conversion record.
//!
//! The kernel never parses a DOCX. Every read, edit and render goes through
//! the DOCX engine hook (X-04), and K's checks go through the `checks` hook.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::PathBuf;

use oa_docs::docx::Block;
use oa_docs::filing::{assemble, AnnexureInput, FRONT_PAGES};
use oa_docs::generate::{template, LodEvent, TEMPLATES};
use oa_docs::pdf::{self, PdfDoc};
use oa_docs::{fidelity, DocError, Edited};
use oa_store::{DocRecordRow, MatterWrite, RevisionRow};
use oa_types::{ErrorCode, OaError, Origin};
use serde_json::{json, Value};

use crate::drafts::{author, draft_json, revision_by, revision_json};
use crate::hooks::CheckInput;
use crate::ledger::sha256_hex;
use crate::records::{blob_path, put_blob, Live};
use crate::{io_err, rejected, store_err, Ctx, Kernel};

pub(crate) const PROPOSAL: &str = "proposal";
pub(crate) const NOTE: &str = "note";
pub(crate) const SESSION: &str = "editor_session";
pub(crate) const CONVERSION: &str = "conversion";
pub(crate) const KINDS: &[&str] = &[PROPOSAL, NOTE, SESSION, CONVERSION];

/// The gate an approval must pass before conversion (spec C rule 10).
pub(crate) const FINAL_REVISION: &str = "final_revision";

const PENDING: &str = "pending";

fn engine_err(e: DocError) -> OaError {
    match e {
        DocError::Conflict(paras) => OaError::new(
            ErrorCode::Conflict,
            format!("paragraphs changed since: {}", paras.join(", ")),
        )
        .with_detail(json!({ "paragraphs": paras })),
        DocError::NoParagraph(p) => OaError::new(
            ErrorCode::NotFound,
            format!("no paragraph {p} in the revision"),
        ),
        DocError::Engine(m) => OaError::new(ErrorCode::Unavailable, m),
        other => OaError::new(ErrorCode::CheckFailed, format!("unreadable: {other}")),
    }
}

fn body_of(row: &DocRecordRow) -> Result<Value, OaError> {
    serde_json::from_str(&row.body).map_err(|e| {
        OaError::new(
            ErrorCode::MatterDamaged,
            format!("{} {} is not valid JSON: {e}", row.kind, row.id),
        )
    })
}

pub(crate) fn record_json(row: &DocRecordRow) -> Value {
    let mut v: Value = serde_json::from_str(&row.body).unwrap_or(Value::Null);
    v["kind"] = json!(row.kind);
    v["state"] = json!(row.state);
    v["updated_at"] = json!(row.updated_at);
    v
}

fn new_record(kind: &str, draft: &str, state: &str, body: &Value) -> DocRecordRow {
    let now = oa_types::now_utc();
    DocRecordRow {
        kind: kind.into(),
        id: body["id"].as_str().unwrap_or_default().to_string(),
        draft_id: draft.into(),
        state: state.into(),
        body: body.to_string(),
        created_at: now.clone(),
        updated_at: now,
    }
}

fn update(row: &DocRecordRow, state: &str, body: &Value) -> MatterWrite {
    MatterWrite::UpdateDocRecord {
        kind: row.kind.clone(),
        id: row.id.clone(),
        expected: row.state.clone(),
        state: state.into(),
        body: body.to_string(),
        updated_at: oa_types::now_utc(),
    }
}

/// The links of a new revision, for the link index (C17).
fn rev_links(rev: &RevisionRow, extra: &[(&str, &str)]) -> Value {
    let mut links = vec![json!({ "from": rev.hash, "to": rev.draft_id })];
    links.push(json!({ "from": rev.hash, "to": rev.blob }));
    for p in serde_json::from_str::<Vec<String>>(&rev.parents).unwrap_or_default() {
        links.push(json!({ "from": rev.hash, "to": p }));
    }
    for (from, to) in extra {
        links.push(json!({ "from": from, "to": to }));
    }
    json!(links)
}

/// What kind of change a revision is, for the Changes viewer (J15).
fn change_kind(r: &RevisionRow) -> &'static str {
    let note = r.note.as_deref().unwrap_or_default();
    if r.author_kind == "wordcraft" {
        "wordcraft_save"
    } else if note.starts_with("restore of checkpoint") {
        "restore"
    } else if note.starts_with("revert of") {
        "revert"
    } else if note.starts_with("accepted proposal") {
        "proposal"
    } else if note.starts_with("generated from") {
        "generated"
    } else if r.parents == "[]" {
        "created"
    } else {
        "commit"
    }
}

/// A revision to commit on the head with its event (see `commit_on_head`).
struct OnHead<'a> {
    event: &'a str,
    rev: &'a RevisionRow,
    body: Value,
    /// Records the new revision links to, besides its draft, blob and parent.
    links_to: Vec<String>,
    writes: Vec<MatterWrite>,
}

/// `draft.note`'s arguments.
pub(crate) struct NoteArgs {
    pub draft: String,
    pub rev: String,
    pub para: String,
    pub text: String,
    pub to_agent: bool,
}

/// `draft.propose`'s arguments.
pub(crate) struct ProposeArgs {
    pub draft: String,
    pub para: String,
    pub replace: String,
    pub reason: Option<String>,
    pub turn: Option<String>,
}

impl Kernel {
    fn bytes_of(live: &Live, blob: &str) -> Result<Vec<u8>, OaError> {
        fs::read(blob_path(&live.dir, blob)).map_err(|e| io_err("revision bytes", e))
    }

    fn rev_row(live: &Live, rev: &str) -> Result<RevisionRow, OaError> {
        live.store
            .revision(rev)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no revision {rev}")))
    }

    fn rev_bytes(live: &Live, rev: &str) -> Result<(RevisionRow, Vec<u8>), OaError> {
        let r = Self::rev_row(live, rev)?;
        let bytes = Self::bytes_of(live, &r.blob)?;
        Ok((r, bytes))
    }

    fn paragraphs_of(&self, bytes: &[u8]) -> Result<Vec<Block>, OaError> {
        self.hooks.docx.paragraphs(bytes).map_err(engine_err)
    }

    fn doc_row(live: &Live, kind: &str, id: &str) -> Result<DocRecordRow, OaError> {
        live.store
            .doc_record(kind, id)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no {kind} {id}")))
    }

    pub(crate) fn doc_record_of(
        live: &Live,
        id: &str,
    ) -> Result<Option<(&'static str, Value)>, OaError> {
        for kind in KINDS {
            if let Some(row) = live.store.doc_record(kind, id).map_err(store_err)? {
                return Ok(Some((kind, record_json(&row))));
            }
        }
        Ok(None)
    }

    /// Commits a revision on the head it was built on (compare-and-swap on
    /// its first parent) with extra writes.
    fn commit_on_head(&self, live: &Live, ctx: &Ctx, c: OnHead) -> Result<(), OaError> {
        let OnHead {
            event,
            rev,
            mut body,
            links_to,
            mut writes,
        } = c;
        let head = serde_json::from_str::<Vec<String>>(&rev.parents)
            .ok()
            .and_then(|p| p.into_iter().next())
            .unwrap_or_default();
        let extra: Vec<(&str, &str)> = links_to
            .iter()
            .map(|t| (rev.hash.as_str(), t.as_str()))
            .collect();
        body["draft"] = json!(rev.draft_id);
        body["revision"] = json!(rev.hash);
        body["parent"] = json!(head);
        body["links"] = rev_links(rev, &extra);
        writes.insert(0, MatterWrite::InsertRevision(rev.clone()));
        writes.insert(
            1,
            MatterWrite::MoveHead {
                draft_id: rev.draft_id.clone(),
                expected: head,
                new: rev.hash.clone(),
            },
        );
        self.commit_event(live, ctx, event, body, &writes)?;
        Ok(())
    }

    // ----- generation (J04, J10) -----

    pub(crate) fn draft_new(
        &self,
        ctx: &Ctx,
        matter: &str,
        title: &str,
        tmpl: &str,
        from_notebook: bool,
    ) -> Result<Value, OaError> {
        let events: Vec<LodEvent> = if from_notebook {
            self.notebook_chronology(matter, None, false, true)?
                .iter()
                .filter_map(|e| {
                    Some(LodEvent {
                        id: e["id"].as_str()?.to_string(),
                        date: e["date"].as_str()?.to_string(),
                        description: e["description"].as_str().unwrap_or_default().to_string(),
                    })
                })
                .collect()
        } else {
            Vec::new()
        };
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let title = title.trim();
        if title.is_empty() {
            return Err(OaError::new(ErrorCode::Usage, "a draft needs a title"));
        }
        let bytes = template(tmpl, title, &events).ok_or_else(|| {
            OaError::new(
                ErrorCode::Usage,
                format!("no template {tmpl:?}; templates: {}", TEMPLATES.join(", ")),
            )
        })?;
        let blob = put_blob(&live.dir, &bytes)?;
        let draft_id = ulid::Ulid::new().to_string();
        let (kind, who) = author(ctx);
        let rev = revision_by(
            kind,
            who,
            &draft_id,
            &[],
            blob,
            Some(format!("generated from template {tmpl}")),
        );
        let draft = oa_store::DraftRow {
            id: draft_id.clone(),
            title: title.to_string(),
            head: rev.hash.clone(),
            created_at: rev.created_at.clone(),
        };
        let event_ids: Vec<&str> = events.iter().map(|e| e.id.as_str()).collect();
        let mut links = vec![
            json!({ "from": draft_id, "to": rev.hash }),
            json!({ "from": rev.hash, "to": draft_id }),
            json!({ "from": rev.hash, "to": rev.blob }),
        ];
        links.extend(
            event_ids
                .iter()
                .map(|e| json!({ "from": rev.hash, "to": e })),
        );
        self.commit_event(
            &live,
            ctx,
            "draft.generated",
            json!({
                "draft": draft_id, "title": title, "template": tmpl,
                "revision": rev.hash, "blob": rev.blob, "events": event_ids, "links": links,
            }),
            &[
                MatterWrite::InsertDraft(draft.clone()),
                MatterWrite::InsertRevision(rev.clone()),
            ],
        )?;
        Ok(json!({
            "draft": draft_json(&draft),
            "revision": revision_json(&live, &rev),
            "events": event_ids.len(),
        }))
    }

    // ----- paragraphs, notes, the viewer (J01, J02) -----

    fn notes_for(live: &Live, draft: &str) -> Result<Vec<Value>, OaError> {
        Ok(live
            .store
            .doc_records(NOTE)
            .map_err(store_err)?
            .iter()
            .filter(|r| r.draft_id == draft)
            .map(record_json)
            .collect())
    }

    fn paragraph_values(live: &Live, draft: &str, paras: &[Block]) -> Result<Vec<Value>, OaError> {
        let notes = Self::notes_for(live, draft)?;
        Ok(paras
            .iter()
            .map(|p| {
                let mut v = serde_json::to_value(p).unwrap_or(Value::Null);
                v["notes"] = json!(notes
                    .iter()
                    .filter(|n| n["para"] == p.id.as_str())
                    .collect::<Vec<_>>());
                v
            })
            .collect())
    }

    pub(crate) fn draft_paragraphs(&self, matter: &str, rev: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let (r, bytes) = Self::rev_bytes(&live, rev)?;
        let paras = self.paragraphs_of(&bytes)?;
        Ok(json!({
            "revision": rev,
            "draft": r.draft_id,
            "paragraphs": Self::paragraph_values(&live, &r.draft_id, &paras)?,
        }))
    }

    /// Our viewer's pane state (J01, J02). A revision the engine cannot open
    /// is shown as `unreadable` with the reason, not as an error.
    pub(crate) fn view(
        &self,
        matter: &str,
        target: &str,
        page: Option<u32>,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(r) = live.store.revision(target).map_err(store_err)? {
            let bytes = Self::bytes_of(&live, &r.blob)?;
            return Ok(match self.hooks.docx.paragraphs(&bytes) {
                Ok(paras) => {
                    let pages = oa_docs::engine::layout(
                        &paras,
                        oa_docs::engine::LINE_WIDTH,
                        oa_docs::engine::PAGE_LINES,
                    );
                    json!({
                        "kind": "docx", "target": target, "draft": r.draft_id,
                        "state": "readable", "page": page.unwrap_or(1), "page_count": pages.len(),
                        "paragraphs": Self::paragraph_values(&live, &r.draft_id, &paras)?,
                    })
                }
                Err(DocError::Engine(m)) => return Err(OaError::new(ErrorCode::Unavailable, m)),
                Err(e) => json!({
                    "kind": "docx", "target": target, "draft": r.draft_id,
                    "state": "unreadable", "reason": e.to_string(), "paragraphs": [],
                }),
            });
        }
        if let Some(row) = live
            .store
            .doc_record(CONVERSION, target)
            .map_err(store_err)?
        {
            let c = body_of(&row)?;
            let bytes = Self::bytes_of(&live, c["pdf_hash"].as_str().unwrap_or_default())?;
            let read = pdf::read(&bytes).map_err(engine_err)?;
            return Ok(json!({
                "kind": "pdf", "target": target, "state": "readable", "role": read.role,
                "page": page.unwrap_or(1), "page_count": read.pages.len(),
                "pages": read.pages, "bookmarks": read.bookmarks, "labels": read.labels,
                "validation": c["validation"],
            }));
        }
        if let Some(e) = live.store.evidence(target).map_err(store_err)? {
            let lines = self.ocr_lines(matter, target, None).unwrap_or_default();
            let mut pages: BTreeMap<u64, Vec<Value>> = BTreeMap::new();
            for l in lines {
                pages
                    .entry(l["page"].as_u64().unwrap_or(1))
                    .or_default()
                    .push(json!({
                        "line": l["line"], "line_hash": l["line_hash"], "rect": l["rect"],
                        "text": l["canonical_text"], "disputed": l["disputed"],
                    }));
            }
            let pages: Vec<Value> = pages
                .into_iter()
                .map(|(n, lines)| json!({ "page": n, "lines": lines }))
                .collect();
            return Ok(json!({
                "kind": "pdf", "target": target, "file_name": e.original_name,
                "state": if pages.is_empty() { "no_text_layer" } else { "readable" },
                "page": page.unwrap_or(1), "page_count": pages.len(), "pages": pages,
                "disputes": self.ocr_disputes(Some(matter), Some(target)).unwrap_or_default(),
            }));
        }
        Err(OaError::new(
            ErrorCode::NotFound,
            format!("{target} is not a revision, conversion or evidence entry in this matter"),
        ))
    }

    pub(crate) fn draft_note(
        &self,
        ctx: &Ctx,
        matter: &str,
        args: &NoteArgs,
    ) -> Result<Value, OaError> {
        let NoteArgs {
            draft,
            rev,
            para,
            text,
            to_agent,
        } = args;
        let (draft, rev, para, to_agent) = (draft.as_str(), rev.as_str(), para.as_str(), *to_agent);
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        if text.trim().is_empty() {
            return Err(OaError::new(ErrorCode::Usage, "a review note needs text"));
        }
        if to_agent
            && self
                .settings_get("changes.agent_capability")
                .ok()
                .and_then(|v| v["value"].as_str().map(|s| s == "true"))
                != Some(true)
        {
            return Err(OaError::new(
                ErrorCode::WriteRefused,
                "sending a note to the agent needs the agent capability on the Changes viewer",
            ));
        }
        let (r, bytes) = Self::rev_bytes(&live, rev)?;
        if r.draft_id != draft {
            return Err(OaError::new(
                ErrorCode::Usage,
                format!("revision {rev} is not in draft {draft}"),
            ));
        }
        if !self.paragraphs_of(&bytes)?.iter().any(|p| p.id == para) {
            return Err(OaError::new(
                ErrorCode::NotFound,
                format!("no paragraph {para} in revision {rev}"),
            ));
        }
        let body = json!({
            "id": ulid::Ulid::new().to_string(), "draft": draft, "revision": rev, "para": para,
            "text": text.trim(), "author": ctx.origin.actor(), "to_agent": to_agent,
            "created_at": oa_types::now_utc(),
        });
        let row = new_record(NOTE, draft, "open", &body);
        self.commit_event(
            &live,
            ctx,
            "draft.noted",
            json!({ "note": row.id, "draft": draft, "revision": rev, "para": para,
                    "links": [{ "from": row.id, "to": rev }] }),
            &[MatterWrite::InsertDocRecord(row.clone())],
        )?;
        Ok(record_json(&row))
    }

    // ----- proposals (J03, RQ-27, L-09) -----

    pub(crate) fn draft_propose(
        &self,
        ctx: &Ctx,
        matter: &str,
        args: ProposeArgs,
    ) -> Result<Value, OaError> {
        let ProposeArgs {
            draft,
            para,
            replace,
            reason,
            turn,
        } = args;
        let (draft, para) = (draft.as_str(), para.as_str());
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let d = Self::draft_row(&live, draft)?;
        let (_, bytes) = Self::rev_bytes(&live, &d.head)?;
        let paras = self.paragraphs_of(&bytes)?;
        let original = paras
            .iter()
            .find(|p| p.id == para)
            .ok_or_else(|| {
                OaError::new(
                    ErrorCode::NotFound,
                    format!("no paragraph {para} at the head"),
                )
            })?
            .text
            .clone();
        let (kind, who) = author(ctx);
        let who = match (&turn, ctx.origin) {
            (Some(t), Origin::Harness) => format!("agent:{t}"),
            _ => who.to_string(),
        };
        let body = json!({
            "id": ulid::Ulid::new().to_string(), "type": "edit", "draft": draft, "base": d.head,
            "para": para, "original": original, "replace": replace, "reason": reason,
            "author_kind": kind, "author": who, "turn": turn,
            "created_at": oa_types::now_utc(),
        });
        let row = new_record(PROPOSAL, draft, PENDING, &body);
        self.commit_event(
            &live,
            ctx,
            "draft.proposed",
            json!({ "proposal": row.id, "draft": draft, "base": d.head, "para": para,
                    "links": [{ "from": row.id, "to": d.head }] }),
            &[MatterWrite::InsertDocRecord(row.clone())],
        )?;
        Ok(record_json(&row))
    }

    pub(crate) fn draft_proposals(
        &self,
        matter: &str,
        draft: Option<&str>,
        all: bool,
    ) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        Ok(live
            .store
            .doc_records(PROPOSAL)
            .map_err(store_err)?
            .iter()
            .filter(|r| draft.is_none_or(|d| r.draft_id == d))
            .filter(|r| all || r.state == PENDING)
            .map(record_json)
            .collect())
    }

    /// A human command: the advocate accepts one proposal. A proposal on a
    /// moved head is re-based and shown again, never applied (L-09).
    pub(crate) fn draft_accept(
        &self,
        ctx: &Ctx,
        matter: &str,
        proposal: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let row = Self::doc_row(&live, PROPOSAL, proposal)?;
        if row.state != PENDING {
            return Err(OaError::new(
                ErrorCode::Conflict,
                format!("proposal {proposal} is {}, not pending", row.state),
            ));
        }
        let mut p = body_of(&row)?;
        let d = Self::draft_row(&live, &row.draft_id)?;
        let para = p["para"].as_str().unwrap_or_default().to_string();
        self.require_presence(&format!(
            "Accept proposal {proposal} on paragraph {para} of draft {}",
            d.title
        ))?;
        let (_, head_bytes) = Self::rev_bytes(&live, &d.head)?;
        let base = p["base"].as_str().unwrap_or_default().to_string();
        let now = oa_types::now_utc();
        if p["type"] == "import" {
            let (_, base_bytes) = Self::rev_bytes(&live, &base)?;
            let import = p["import_revision"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            let (_, import_bytes) = Self::rev_bytes(&live, &import)?;
            let edited = self
                .hooks
                .docx
                .apply_changes(&base_bytes, &import_bytes, &head_bytes)
                .map_err(engine_err)?;
            return self.accept_with(ctx, &live, &row, p, edited, ("wordcraft", "wordcraft"));
        }
        if base != d.head {
            let head_paras = self.paragraphs_of(&head_bytes)?;
            p["decided_at"] = json!(now);
            let Some(current) = head_paras.iter().find(|h| h.id == para) else {
                p["outcome"] = json!("orphaned");
                self.commit_event(
                    &live,
                    ctx,
                    "draft.proposal_orphaned",
                    json!({ "proposal": proposal, "head": d.head, "para": para }),
                    &[update(&row, "orphaned", &p)],
                )?;
                return Ok(
                    json!({ "outcome": "orphaned", "proposal": record_json(&row),
                    "reason": format!("paragraph {para} is not in the head any more") }),
                );
            };
            let mut fresh = p.clone();
            fresh["id"] = json!(ulid::Ulid::new().to_string());
            fresh["base"] = json!(d.head);
            fresh["original"] = json!(current.text);
            fresh["rebased_from"] = json!(proposal);
            fresh["created_at"] = json!(now);
            for k in ["decided_at", "outcome"] {
                fresh.as_object_mut().map(|o| o.remove(k));
            }
            p["rebased_to"] = fresh["id"].clone();
            let new_row = new_record(PROPOSAL, &row.draft_id, PENDING, &fresh);
            self.commit_event(
                &live,
                ctx,
                "draft.proposal_rebased",
                json!({ "proposal": proposal, "rebased_to": new_row.id, "head": d.head,
                        "links": [{ "from": new_row.id, "to": proposal },
                                  { "from": new_row.id, "to": d.head }] }),
                &[
                    update(&row, "superseded", &p),
                    MatterWrite::InsertDocRecord(new_row.clone()),
                ],
            )?;
            return Ok(
                json!({ "outcome": "rebased", "proposal": record_json(&new_row),
                "reason": format!("the head moved from {base} to {}", d.head) }),
            );
        }
        let text = p["replace"].as_str().unwrap_or_default().to_string();
        let edited = self
            .hooks
            .docx
            .replace(&head_bytes, &para, &text)
            .map_err(engine_err)?;
        let (kind, who) = (
            p["author_kind"].as_str().unwrap_or("agent").to_string(),
            p["author"].as_str().unwrap_or("agent").to_string(),
        );
        self.accept_with(ctx, &live, &row, p, edited, (&kind, &who))
    }

    /// Commits an accepted proposal's edit on the head, authored by `who`.
    fn accept_with(
        &self,
        ctx: &Ctx,
        live: &Live,
        row: &DocRecordRow,
        mut p: Value,
        edited: Edited,
        (kind, who): (&str, &str),
    ) -> Result<Value, OaError> {
        let head = Self::draft_row(live, &row.draft_id)?.head;
        let head = head.as_str();
        let blob = put_blob(&live.dir, &edited.docx)?;
        let rev = revision_by(
            kind,
            who,
            &row.draft_id,
            &[head.to_string()],
            blob,
            Some(format!("accepted proposal {}", row.id)),
        );
        p["revision"] = json!(rev.hash);
        p["decided_at"] = json!(oa_types::now_utc());
        p["decided_by"] = json!(ctx.origin.actor());
        p["outcome"] = json!("accepted");
        self.commit_on_head(
            live,
            ctx,
            OnHead {
                event: "draft.proposal_accepted",
                rev: &rev,
                body: json!({ "proposal": row.id, "changed": edited.changed }),
                links_to: vec![row.id.clone()],
                writes: vec![update(row, "accepted", &p)],
            },
        )?;
        Ok(json!({ "outcome": "accepted", "proposal": row.id,
                   "revision": revision_json(live, &rev) }))
    }

    pub(crate) fn draft_reject(
        &self,
        ctx: &Ctx,
        matter: &str,
        proposal: &str,
        reason: Option<String>,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let row = Self::doc_row(&live, PROPOSAL, proposal)?;
        if row.state != PENDING {
            return Err(OaError::new(
                ErrorCode::Conflict,
                format!("proposal {proposal} is {}, not pending", row.state),
            ));
        }
        self.require_presence(&format!("Reject proposal {proposal}"))?;
        let mut p = body_of(&row)?;
        p["decided_at"] = json!(oa_types::now_utc());
        p["decided_by"] = json!(ctx.origin.actor());
        p["decision_reason"] = json!(reason);
        p["outcome"] = json!("rejected");
        self.commit_event(
            &live,
            ctx,
            "draft.proposal_rejected",
            json!({ "proposal": proposal, "draft": row.draft_id }),
            &[update(&row, "rejected", &p)],
        )?;
        Ok(json!({ "outcome": "rejected", "proposal": proposal }))
    }

    /// Reverts one agent edit: its paragraph changes are inverted on the head
    /// as a new revision. Nothing is rewritten (RQ-27).
    pub(crate) fn draft_revert(
        &self,
        ctx: &Ctx,
        matter: &str,
        draft: &str,
        rev: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let d = Self::draft_row(&live, draft)?;
        let (r, edit_bytes) = Self::rev_bytes(&live, rev)?;
        if r.draft_id != draft {
            return Err(OaError::new(
                ErrorCode::Usage,
                format!("revision {rev} is not in draft {draft}"),
            ));
        }
        if r.author_kind != "agent" {
            return Err(OaError::new(
                ErrorCode::Usage,
                format!(
                    "revision {rev} is by {}; only agent edits are reverted one by one (restore a checkpoint instead)",
                    r.author_kind
                ),
            ));
        }
        let parents: Vec<String> = serde_json::from_str(&r.parents).unwrap_or_default();
        let parent = parents.first().ok_or_else(|| {
            OaError::new(
                ErrorCode::Usage,
                "the first revision has nothing to revert to",
            )
        })?;
        let (_, parent_bytes) = Self::rev_bytes(&live, parent)?;
        let (_, head_bytes) = Self::rev_bytes(&live, &d.head)?;
        let edited = self
            .hooks
            .docx
            .apply_changes(&edit_bytes, &parent_bytes, &head_bytes)
            .map_err(engine_err)?;
        let blob = put_blob(&live.dir, &edited.docx)?;
        let (kind, who) = author(ctx);
        let new = revision_by(
            kind,
            who,
            draft,
            std::slice::from_ref(&d.head),
            blob,
            Some(format!("revert of {rev}")),
        );
        self.commit_on_head(
            &live,
            ctx,
            OnHead {
                event: "draft.reverted",
                rev: &new,
                body: json!({ "reverted": rev, "changed": edited.changed }),
                links_to: vec![rev.to_string()],
                writes: Vec::new(),
            },
        )?;
        Ok(revision_json(&live, &new))
    }

    // ----- the hosted editor (J05, RQ-72) -----

    fn work_dir(&self, matter: &str, draft: &str, session: &str) -> PathBuf {
        self.app_data
            .join("wordcraft")
            .join(matter)
            .join(draft)
            .join(session)
    }

    fn open_session(live: &Live, draft: &str) -> Result<Option<DocRecordRow>, OaError> {
        Ok(live
            .store
            .doc_records(SESSION)
            .map_err(store_err)?
            .into_iter()
            .rev()
            .find(|r| r.draft_id == draft && r.state == "open"))
    }

    pub(crate) fn draft_open_editor(
        &self,
        ctx: &Ctx,
        matter: &str,
        draft: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        if let Some(open) = Self::open_session(&live, draft)? {
            return Ok(record_json(&open));
        }
        let d = Self::draft_row(&live, draft)?;
        let (_, bytes) = Self::rev_bytes(&live, &d.head)?;
        let id = ulid::Ulid::new().to_string();
        let dir = self.work_dir(&live.row.id, draft, &id);
        fs::create_dir_all(&dir).map_err(|e| io_err("editor working folder", e))?;
        let working = dir.join("working.docx");
        fs::write(&working, &bytes).map_err(|e| io_err("working copy", e))?;
        let body = json!({
            "id": id, "draft": draft, "base": d.head,
            "working": working.to_string_lossy(), "work_dir": dir.to_string_lossy(),
            "editor": "wordcraft", "opened_at": oa_types::now_utc(),
        });
        let row = new_record(SESSION, draft, "open", &body);
        self.commit_event(
            &live,
            ctx,
            "draft.editor_opened",
            json!({ "session": id, "draft": draft, "base": d.head,
                    "links": [{ "from": id, "to": d.head }] }),
            &[MatterWrite::InsertDocRecord(row.clone())],
        )?;
        Ok(record_json(&row))
    }

    pub(crate) fn draft_editor_status(&self, matter: &str, draft: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let d = Self::draft_row(&live, draft)?;
        let Some(row) = Self::open_session(&live, draft)? else {
            return Ok(json!({ "draft": draft, "title": d.title, "state": "closed" }));
        };
        let s = body_of(&row)?;
        let working = PathBuf::from(s["working"].as_str().unwrap_or_default());
        let base = Self::rev_row(&live, s["base"].as_str().unwrap_or_default())?;
        let saved = fs::read(&working)
            .map(|b| sha256_hex(&b) != base.blob)
            .unwrap_or(false);
        let autosave = oa_docs::editor::autosave_path(&working);
        let mut v = record_json(&row);
        v["title"] = json!(d.title);
        v["head"] = json!(d.head);
        v["head_moved"] = json!(d.head != base.hash);
        v["unimported_save"] = json!(saved);
        v["autosave"] = json!(autosave
            .is_file()
            .then(|| autosave.to_string_lossy().to_string()));
        v["working_present"] = json!(working.is_file());
        Ok(v)
    }

    /// Files under `drafts/<draft id>/` that the draft store did not write:
    /// a hosted editor that wrote there is detected here (J-AC-07).
    fn foreign_draft_files(live: &Live, draft: &str) -> Vec<String> {
        let dir = live.dir.join("drafts").join(draft);
        fs::read_dir(dir)
            .map(|rd| {
                rd.filter_map(Result::ok)
                    .map(|e| e.path().to_string_lossy().to_string())
                    .collect()
            })
            .unwrap_or_default()
    }

    pub(crate) fn draft_import_working_copy(
        &self,
        ctx: &Ctx,
        matter: &str,
        draft: &str,
        autosave: bool,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let foreign = Self::foreign_draft_files(&live, draft);
        if !foreign.is_empty() {
            for f in &foreign {
                live.store
                    .record_rejected(&rejected(
                        ctx,
                        "draft.import_working_copy",
                        &format!("an editor wrote {f} inside the draft store"),
                        f.as_bytes(),
                    ))
                    .map_err(store_err)?;
            }
            return Err(OaError::new(
                ErrorCode::WriteRefused,
                format!(
                    "the editor wrote inside drafts/{draft}/, which only the draft store writes: {}",
                    foreign.join(", ")
                ),
            ));
        }
        let row = Self::open_session(&live, draft)?.ok_or_else(|| {
            OaError::new(
                ErrorCode::NotFound,
                format!("no open editor session on draft {draft}"),
            )
        })?;
        let mut s = body_of(&row)?;
        let working = PathBuf::from(s["working"].as_str().unwrap_or_default());
        let path = if autosave {
            oa_docs::editor::autosave_path(&working)
        } else {
            working
        };
        let bytes = fs::read(&path).map_err(|e| io_err("the editor's saved file", e))?;
        let base = s["base"].as_str().unwrap_or_default().to_string();
        let base_row = Self::rev_row(&live, &base)?;
        if sha256_hex(&bytes) == base_row.blob {
            return Ok(json!({ "outcome": "unchanged", "session": row.id }));
        }
        let imported = self.hooks.docx.import(&bytes).map_err(engine_err)?;
        let blob = put_blob(&live.dir, &imported.docx)?;
        let note = if autosave {
            "wordcraft autosave recovered"
        } else {
            "wordcraft save"
        };
        let rev = revision_by(
            "wordcraft",
            "wordcraft",
            draft,
            std::slice::from_ref(&base),
            blob,
            Some(note.into()),
        );
        let d = Self::draft_row(&live, draft)?;
        s["base"] = json!(rev.hash);
        if d.head == base {
            self.commit_on_head(
                &live,
                ctx,
                OnHead {
                    event: "draft.imported",
                    rev: &rev,
                    body: json!({ "session": row.id, "autosave": autosave, "id_changes": imported.changes }),
                    links_to: vec![row.id.clone()],
                    writes: vec![update(&row, "open", &s)],
                },
            )?;
            return Ok(
                json!({ "outcome": "imported", "id_changes": imported.changes,
                              "revision": revision_json(&live, &rev) }),
            );
        }
        // The head moved while WordCraft had the file: the save is kept off
        // the head and becomes a proposal for the advocate (J edge case).
        let body = json!({
            "id": ulid::Ulid::new().to_string(), "type": "import", "draft": draft,
            "base": base, "import_revision": rev.hash, "session": row.id,
            "reason": format!("WordCraft saved on {base}, but the head is now {}", d.head),
            "author_kind": "wordcraft", "author": "wordcraft",
            "created_at": oa_types::now_utc(),
        });
        let proposal = new_record(PROPOSAL, draft, PENDING, &body);
        self.commit_event(
            &live,
            ctx,
            "draft.import_conflict",
            json!({
                "session": row.id, "draft": draft, "revision": rev.hash, "head": d.head,
                "proposal": proposal.id, "id_changes": imported.changes,
                "links": rev_links(&rev, &[(&proposal.id, &rev.hash)]),
            }),
            &[
                MatterWrite::InsertRevision(rev.clone()),
                MatterWrite::InsertDocRecord(proposal.clone()),
                update(&row, "open", &s),
            ],
        )?;
        Ok(
            json!({ "outcome": "conflict", "proposal": record_json(&proposal),
                   "revision": revision_json(&live, &rev) }),
        )
    }

    // ----- the Changes viewer (J15) -----

    fn para_diff(old: &[Block], new: &[Block]) -> Vec<Value> {
        let before: BTreeMap<&str, &Block> = old.iter().map(|p| (p.id.as_str(), p)).collect();
        let after_ids: BTreeSet<&str> = new.iter().map(|p| p.id.as_str()).collect();
        let mut out = Vec::new();
        for p in new {
            match before.get(p.id.as_str()) {
                None => out.push(json!({ "para": p.id, "change": "added", "after": p.text })),
                Some(b) if b.xml_hash != p.xml_hash => out.push(json!({
                    "para": p.id, "change": "changed", "before": b.text, "after": p.text,
                })),
                _ => {}
            }
        }
        for p in old.iter().filter(|p| !after_ids.contains(p.id.as_str())) {
            out.push(json!({ "para": p.id, "change": "removed", "before": p.text }));
        }
        out
    }

    pub(crate) fn draft_diff(&self, matter: &str, a: &str, b: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let (ra, ba) = Self::rev_bytes(&live, a)?;
        let (rb, bb) = Self::rev_bytes(&live, b)?;
        let (pa, pb) = (self.paragraphs_of(&ba)?, self.paragraphs_of(&bb)?);
        let notes = Self::notes_for(&live, &rb.draft_id)?;
        let ids: BTreeSet<&str> = pb.iter().map(|p| p.id.as_str()).collect();
        Ok(json!({
            "a": a, "b": b, "draft": rb.draft_id,
            "a_author": ra.author, "b_author": rb.author,
            "changes": Self::para_diff(&pa, &pb),
            "notes": notes.iter().filter(|n| n["para"].as_str().is_some_and(|p| ids.contains(p))).collect::<Vec<_>>(),
        }))
    }

    pub(crate) fn draft_changes(&self, matter: &str, draft: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let d = Self::draft_row(&live, draft)?;
        let revisions = live.store.revisions(draft).map_err(store_err)?;
        let mut paras: BTreeMap<String, Vec<Block>> = BTreeMap::new();
        for r in &revisions {
            let bytes = Self::bytes_of(&live, &r.blob)?;
            paras.insert(
                r.hash.clone(),
                self.paragraphs_of(&bytes).unwrap_or_default(),
            );
        }
        let notes = Self::notes_for(&live, draft)?;
        let proposals = live.store.doc_records(PROPOSAL).map_err(store_err)?;
        let entries: Vec<Value> = revisions
            .iter()
            .map(|r| {
                let parents: Vec<String> = serde_json::from_str(&r.parents).unwrap_or_default();
                let old = parents
                    .first()
                    .and_then(|p| paras.get(p))
                    .cloned()
                    .unwrap_or_default();
                let new = paras.get(&r.hash).cloned().unwrap_or_default();
                let kind = change_kind(r);
                let proposal = proposals
                    .iter()
                    .find(|p| {
                        p.state == "accepted"
                            && body_of(p)
                                .ok()
                                .and_then(|b| b["revision"].as_str().map(|s| s == r.hash))
                                == Some(true)
                    })
                    .map(|p| p.id.clone());
                json!({
                    "revision": r.hash, "parent": parents.first(), "kind": kind,
                    "author_kind": r.author_kind, "author": r.author, "note": r.note,
                    "created_at": r.created_at, "head": r.hash == d.head,
                    "revertable": kind == "proposal" && r.author_kind == "agent",
                    "proposal": proposal,
                    "changes": Self::para_diff(&old, &new),
                })
            })
            .collect();
        Ok(json!({
            "draft": draft_json(&d),
            "revisions": entries,
            "notes": notes,
            "agent_capability": self.settings_get("changes.agent_capability").ok()
                .and_then(|v| v["value"].as_str().map(|s| s == "true")).unwrap_or(false),
        }))
    }

    // ----- render, filing PDF/A, conversion record (J13) -----

    pub(crate) fn draft_render(
        &self,
        ctx: &Ctx,
        matter: &str,
        rev: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let (r, bytes) = Self::rev_bytes(&live, rev)?;
        let pages = self.hooks.docx.render(&bytes).map_err(engine_err)?;
        let out = PdfDoc {
            pages,
            ..PdfDoc::default()
        }
        .write();
        let blob = put_blob(&live.dir, &out)?;
        let page_count = pdf::read(&out).map(|p| p.pages.len()).unwrap_or(0);
        self.commit_event(
            &live,
            ctx,
            "draft.rendered",
            json!({ "revision": rev, "draft": r.draft_id, "pdf": blob,
                    "links": [{ "from": blob, "to": rev }] }),
            &[],
        )?;
        Ok(json!({
            "revision": rev, "pdf": blob, "path": blob_path(&live.dir, &blob).to_string_lossy(),
            "pages": page_count, "renderer": self.hooks.docx.version().unwrap_or_default(),
        }))
    }

    fn pdfa_level(&self) -> (u8, String) {
        let v = self
            .settings_get("filing.pdfa")
            .ok()
            .and_then(|v| v["value"].as_str().map(str::to_string))
            .unwrap_or_else(|| "2B".into());
        let part = v.chars().next().and_then(|c| c.to_digit(10)).unwrap_or(2) as u8;
        let level: String = v.chars().skip(1).collect();
        (part, if level.is_empty() { "B".into() } else { level })
    }

    fn annexures(
        &self,
        live: &Live,
        matter: &str,
        ids: &[String],
    ) -> Result<Vec<AnnexureInput>, OaError> {
        let mut out = Vec::new();
        for id in ids {
            let e = live.store.evidence(id).map_err(store_err)?.ok_or_else(|| {
                OaError::new(ErrorCode::NotFound, format!("no evidence {id} to annex"))
            })?;
            let mut pages: BTreeMap<u64, Vec<String>> = BTreeMap::new();
            for l in self.ocr_lines(matter, id, None).unwrap_or_default() {
                pages
                    .entry(l["page"].as_u64().unwrap_or(1))
                    .or_default()
                    .push(l["canonical_text"].as_str().unwrap_or_default().to_string());
            }
            let pages: Vec<String> = if pages.is_empty() {
                vec![format!(
                    "[{} is merged as it is: {}]",
                    e.original_name, e.blob
                )]
            } else {
                pages.into_values().map(|l| l.join("\n")).collect()
            };
            out.push(AnnexureInput {
                id: id.clone(),
                title: e.original_name.clone(),
                pages,
            });
        }
        Ok(out)
    }

    /// The filing PDF/A from the approved head with clear gates (J rules 9,
    /// 12 and 14). Refused with no PDF otherwise. A failed conversion check
    /// is recorded and reported, and the PDF stays an unfiled output.
    pub(crate) fn filing_pdf(
        &self,
        ctx: &Ctx,
        matter: &str,
        rev: &str,
        annex: &[String],
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let (r, bytes) = Self::rev_bytes(&live, rev)?;
        let d = Self::draft_row(&live, &r.draft_id)?;
        let mut reasons = Vec::new();
        if d.head != rev {
            reasons.push(format!(
                "{rev} is not the head of draft {} ({})",
                d.title, d.head
            ));
        }
        let approved = live.store.approvals().map_err(store_err)?.iter().any(|a| {
            a.gate == FINAL_REVISION && a.target == rev && a.decision.as_deref() == Some("accepted")
        });
        if !approved {
            reasons.push(format!("{rev} has no accepted {FINAL_REVISION} approval"));
        }
        let paras = self.paragraphs_of(&bytes)?;
        let annexures = self.annexures(&live, matter, annex)?;
        let numbering: Vec<oa_docs::filing::IndexEntry> =
            assemble(&d.title, &[], &annexures, (2, "B".into())).index;
        for b in self.hooks.checks.blockers(&CheckInput {
            matter,
            draft: &r.draft_id,
            revision: rev,
            paragraphs: &paras,
            index: &numbering,
        }) {
            reasons.push(format!("gate {} is blocked: {}", b.gate, b.detail));
        }
        if !reasons.is_empty() {
            return Err(OaError::new(
                ErrorCode::CheckFailed,
                format!("conversion refused: {}", reasons.join("; ")),
            )
            .with_detail(json!({ "reasons": reasons })));
        }
        let body = self.hooks.docx.render(&bytes).map_err(|e| {
            OaError::new(
                ErrorCode::Unavailable,
                format!("filing preparation is blocked: the DOCX engine could not render: {e}"),
            )
        })?;
        let renderer = self
            .hooks
            .docx
            .version()
            .unwrap_or_else(|_| "unknown".into());
        let level = self.pdfa_level();
        let filing = assemble(&d.title, &body, &annexures, level.clone());
        let out = filing.doc.write();
        let validation = pdf::preflight(&out, level.0, &level.1);
        let read = pdf::read(&out).map_err(engine_err)?;
        let body_text: Vec<String> = read
            .pages
            .iter()
            .skip(FRONT_PAGES)
            .take(body.len().max(1))
            .cloned()
            .collect();
        let checks = self.hooks.checks.conversion(&paras, &body_text);
        let passed = validation.passed && oa_docs::conversion::passed(&checks);
        let pdf_hash = put_blob(&live.dir, &out)?;
        let id = ulid::Ulid::new().to_string();
        let filings = live.dir.join("filings");
        fs::create_dir_all(&filings).map_err(|e| io_err("filings folder", e))?;
        let path = filings.join(format!("{id}.pdf"));
        fs::write(&path, &out).map_err(|e| io_err("filing PDF", e))?;
        let record = json!({
            "id": id, "draft": r.draft_id, "revision": rev, "docx_hash": r.blob,
            "renderer": renderer, "pdf_hash": pdf_hash, "path": path.to_string_lossy(),
            "page_count": read.pages.len(), "pdfa": { "part": level.0, "conformance": level.1 },
            "validation": validation, "check": { "passed": oa_docs::conversion::passed(&checks), "paragraphs": checks },
            "index": filing.index, "annexures": annex, "created_at": oa_types::now_utc(),
        });
        let state = if passed { "passed" } else { "failed" };
        let row = new_record(CONVERSION, &r.draft_id, state, &record);
        let mut links = vec![
            json!({ "from": id, "to": rev }),
            json!({ "from": id, "to": pdf_hash }),
        ];
        links.extend(annex.iter().map(|a| json!({ "from": id, "to": a })));
        self.commit_event(
            &live,
            ctx,
            "filing.converted",
            json!({ "conversion": id, "revision": rev, "docx_hash": r.blob, "pdf_hash": pdf_hash,
                    "state": state, "links": links }),
            &[MatterWrite::InsertDocRecord(row.clone())],
        )?;
        Ok(record_json(&row))
    }

    pub(crate) fn filing_conversions(&self, matter: &str) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        live.store
            .doc_records(CONVERSION)
            .map_err(store_err)?
            .iter()
            .map(|row| {
                let mut v = record_json(row);
                let on_disk = fs::read(v["path"].as_str().unwrap_or_default())
                    .map(|b| sha256_hex(&b))
                    .ok();
                v["file_matches"] = json!(on_disk.as_deref() == v["pdf_hash"].as_str());
                Ok(v)
            })
            .collect()
    }

    /// The fidelity oracle (J12): the engine's render against our viewer's
    /// page model, and Word when installed.
    pub(crate) fn fidelity_check(&self, matter: &str, rev: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let (_, bytes) = Self::rev_bytes(&live, rev)?;
        let text = |pages: Vec<oa_docs::pdf::PdfPage>| -> Vec<String> {
            pages.iter().map(|p| p.lines.join("\n")).collect()
        };
        let engine = self.hooks.docx.render(&bytes).map_err(engine_err)?;
        let paras = self.paragraphs_of(&bytes)?;
        let viewer = oa_docs::engine::layout(
            &paras,
            oa_docs::engine::LINE_WIDTH,
            oa_docs::engine::PAGE_LINES,
        );
        let threshold = self
            .settings_get("fidelity.threshold")
            .ok()
            .and_then(|v| v["value"].as_str().and_then(|s| s.parse().ok()))
            .unwrap_or(0.02);
        let report = fidelity::compare(
            vec![
                fidelity::Rendering {
                    renderer: self
                        .hooks
                        .docx
                        .version()
                        .unwrap_or_else(|_| "wordcraft-engine".into()),
                    pages: Some(text(engine)),
                    detail: None,
                },
                fidelity::Rendering {
                    renderer: "viewer".into(),
                    pages: Some(text(viewer)),
                    detail: None,
                },
                fidelity::Rendering {
                    renderer: "word".into(),
                    pages: None,
                    detail: Some("Word through COM is not wired yet".into()),
                },
            ],
            threshold,
        );
        let mut v = serde_json::to_value(report).unwrap_or(Value::Null);
        v["revision"] = json!(rev);
        Ok(v)
    }

    /// PdfCraft gets a working copy of a PDF. The filing PDF is refused
    /// (J rule 13), whatever path it is reached by.
    pub(crate) fn pdf_open_editor(
        &self,
        ctx: &Ctx,
        matter: &str,
        target: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let refuse = |why: String| -> Result<Value, OaError> {
            live.store
                .record_rejected(&rejected(ctx, "pdf.open_editor", &why, target.as_bytes()))
                .map_err(store_err)?;
            Err(OaError::new(ErrorCode::WriteRefused, why))
        };
        let conversions = live.store.doc_records(CONVERSION).map_err(store_err)?;
        if conversions
            .iter()
            .any(|c| c.id == target || body_of(c).is_ok_and(|b| b["pdf_hash"] == target))
        {
            return refuse(format!(
                "{target} is a filing PDF, which is never edited: change the DOCX and convert again"
            ));
        }
        let blob = match live.store.evidence(target).map_err(store_err)? {
            Some(e) => e.blob,
            None if target.starts_with("sha256:") => target.to_string(),
            None => {
                return Err(OaError::new(
                    ErrorCode::NotFound,
                    format!("{target} is not an evidence entry or a blob"),
                ))
            }
        };
        let bytes = Self::bytes_of(&live, &blob)?;
        if pdf::read(&bytes).is_ok_and(|r| r.role.as_deref() == Some("filing")) {
            return refuse(format!(
                "{target} is a filing PDF, which is never edited: change the DOCX and convert again"
            ));
        }
        let dir = self.app_data.join("pdfcraft").join(&live.row.id);
        fs::create_dir_all(&dir).map_err(|e| io_err("PdfCraft working folder", e))?;
        let working = dir.join(format!("{}.pdf", ulid::Ulid::new()));
        fs::write(&working, &bytes).map_err(|e| io_err("PdfCraft working copy", e))?;
        self.commit_event(
            &live,
            ctx,
            "pdf.editor_opened",
            json!({ "target": target, "blob": blob, "links": [{ "from": target, "to": blob }] }),
            &[],
        )?;
        Ok(json!({ "target": target, "editor": "pdfcraft", "working": working.to_string_lossy() }))
    }
}

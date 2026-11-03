//! The draft store (spec C rules 7 and 8): DOCX revisions in a DAG, heads
//! moved by compare-and-swap, named checkpoints, restore as a new revision.
//! Nothing is ever deleted. Reverting one agent edit needs the DOCX engine
//! (spec J) and is not here yet.

use oa_store::{CheckpointRow, DraftRow, MatterWrite, RevisionRow};
use oa_types::{ErrorCode, OaError, Origin};
use serde_json::{json, Value};

use crate::command::Attachment;
use crate::ledger::{canonical, sha256_hex};
use crate::records::{blob_path, put_blob, Live};
use crate::{store_err, Ctx, Kernel};

fn author(ctx: &Ctx) -> (&'static str, &'static str) {
    match ctx.origin {
        Origin::Harness => ("agent", "agent"),
        Origin::Test => ("test", "test"),
        Origin::Ui | Origin::Cli => ("advocate", "advocate"),
    }
}

fn revision(
    ctx: &Ctx,
    draft_id: &str,
    parents: &[String],
    blob: String,
    note: Option<String>,
) -> RevisionRow {
    let (author_kind, author) = author(ctx);
    let created_at = oa_types::now_utc();
    let parents = canonical(&json!(parents));
    let hash = sha256_hex(
        canonical(&json!({
            "draft": draft_id,
            "parents": parents,
            "blob": blob,
            "author_kind": author_kind,
            "author": author,
            "note": note,
            "created_at": created_at,
        }))
        .as_bytes(),
    );
    RevisionRow {
        hash,
        draft_id: draft_id.to_string(),
        parents,
        author_kind: author_kind.to_string(),
        author: author.to_string(),
        blob,
        note,
        created_at,
    }
}

fn revision_json(live: &Live, r: &RevisionRow) -> Value {
    json!({
        "hash": r.hash,
        "draft": r.draft_id,
        "parents": serde_json::from_str::<Value>(&r.parents).unwrap_or(Value::Null),
        "author_kind": r.author_kind,
        "author": r.author,
        "blob": r.blob,
        "blob_path": blob_path(&live.dir, &r.blob).to_string_lossy(),
        "note": r.note,
        "created_at": r.created_at,
    })
}

fn draft_json(d: &DraftRow) -> Value {
    json!({ "id": d.id, "title": d.title, "head": d.head, "created_at": d.created_at })
}

impl Kernel {
    fn draft_row(live: &Live, draft: &str) -> Result<DraftRow, OaError> {
        live.store
            .draft(draft)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no draft {draft}")))
    }

    pub(crate) fn draft_create(
        &self,
        ctx: &Ctx,
        matter: &str,
        title: &str,
        file: &Attachment,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let title = title.trim();
        if title.is_empty() {
            return Err(OaError::new(ErrorCode::Usage, "a draft needs a title"));
        }
        let blob = put_blob(&live.dir, &file.bytes)?;
        let draft_id = ulid::Ulid::new().to_string();
        let rev = revision(ctx, &draft_id, &[], blob, None);
        let draft = DraftRow {
            id: draft_id.clone(),
            title: title.to_string(),
            head: rev.hash.clone(),
            created_at: rev.created_at.clone(),
        };
        self.commit_event(
            &live,
            ctx,
            "draft.created",
            json!({ "draft": draft_id, "title": title, "revision": rev.hash, "blob": rev.blob }),
            &[
                MatterWrite::InsertDraft(draft.clone()),
                MatterWrite::InsertRevision(rev.clone()),
            ],
        )?;
        Ok(json!({ "draft": draft_json(&draft), "revision": revision_json(&live, &rev) }))
    }

    /// A new revision on `base`. Refused with a typed conflict naming the
    /// current head when `base` is not the head (spec C rule 7).
    pub(crate) fn draft_commit(
        &self,
        ctx: &Ctx,
        matter: &str,
        draft: &str,
        base: &str,
        file: &Attachment,
        note: Option<String>,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let d = Self::draft_row(&live, draft)?;
        if d.head != base {
            return Err(OaError::new(
                ErrorCode::Conflict,
                format!("stale parent: the head of draft {draft} is {}", d.head),
            )
            .with_detail(json!({ "head": d.head })));
        }
        let blob = put_blob(&live.dir, &file.bytes)?;
        let rev = revision(ctx, draft, &[base.to_string()], blob, note);
        self.commit_event(
            &live,
            ctx,
            "draft.revised",
            json!({ "draft": draft, "revision": rev.hash, "parent": base, "blob": rev.blob }),
            &[
                MatterWrite::InsertRevision(rev.clone()),
                MatterWrite::MoveHead {
                    draft_id: draft.to_string(),
                    expected: base.to_string(),
                    new: rev.hash.clone(),
                },
            ],
        )?;
        Ok(revision_json(&live, &rev))
    }

    pub(crate) fn draft_checkpoint(
        &self,
        ctx: &Ctx,
        matter: &str,
        draft: &str,
        name: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let name = name.trim();
        if name.is_empty() {
            return Err(OaError::new(ErrorCode::Usage, "a checkpoint needs a name"));
        }
        let d = Self::draft_row(&live, draft)?;
        if live
            .store
            .checkpoint(draft, name)
            .map_err(store_err)?
            .is_some()
        {
            return Err(OaError::new(
                ErrorCode::Conflict,
                format!("checkpoint {name:?} already exists on draft {draft}"),
            ));
        }
        let cp = CheckpointRow {
            draft_id: draft.to_string(),
            name: name.to_string(),
            revision: d.head.clone(),
            created_at: oa_types::now_utc(),
        };
        self.commit_event(
            &live,
            ctx,
            "draft.checkpointed",
            json!({ "draft": draft, "name": name, "revision": d.head }),
            &[MatterWrite::InsertCheckpoint(cp.clone())],
        )?;
        Ok(json!({ "draft": draft, "name": name, "revision": cp.revision }))
    }

    /// Restoring a checkpoint is a new revision with the checkpoint's content,
    /// on top of the current head. History is never rewritten (L-16).
    pub(crate) fn draft_restore(
        &self,
        ctx: &Ctx,
        matter: &str,
        draft: &str,
        checkpoint: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let d = Self::draft_row(&live, draft)?;
        let cp = live
            .store
            .checkpoint(draft, checkpoint)
            .map_err(store_err)?
            .ok_or_else(|| {
                OaError::new(ErrorCode::NotFound, format!("no checkpoint {checkpoint:?}"))
            })?;
        let source = live
            .store
            .revision(&cp.revision)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::MatterDamaged, "checkpoint revision missing"))?;
        let rev = revision(
            ctx,
            draft,
            std::slice::from_ref(&d.head),
            source.blob.clone(),
            Some(format!("restore of checkpoint {checkpoint}")),
        );
        self.commit_event(
            &live,
            ctx,
            "draft.restored",
            json!({ "draft": draft, "checkpoint": checkpoint, "revision": rev.hash, "parent": d.head }),
            &[
                MatterWrite::InsertRevision(rev.clone()),
                MatterWrite::MoveHead {
                    draft_id: draft.to_string(),
                    expected: d.head.clone(),
                    new: rev.hash.clone(),
                },
            ],
        )?;
        Ok(revision_json(&live, &rev))
    }

    pub(crate) fn draft_list(&self, matter: &str) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        Ok(live
            .store
            .drafts()
            .map_err(store_err)?
            .iter()
            .map(draft_json)
            .collect())
    }

    pub(crate) fn draft_log(&self, matter: &str, draft: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let d = Self::draft_row(&live, draft)?;
        let revisions = live.store.revisions(draft).map_err(store_err)?;
        let checkpoints = live.store.checkpoints(draft).map_err(store_err)?;
        Ok(json!({
            "draft": draft_json(&d),
            "revisions": revisions.iter().map(|r| revision_json(&live, r)).collect::<Vec<_>>(),
            "checkpoints": checkpoints.iter().map(|c| json!({
                "name": c.name, "revision": c.revision, "created_at": c.created_at,
            })).collect::<Vec<_>>(),
        }))
    }

    pub(crate) fn draft_show(&self, matter: &str, rev: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let r = live
            .store
            .revision(rev)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no revision {rev}")))?;
        let mut out = revision_json(&live, &r);
        out["bytes_present"] = json!(blob_path(&live.dir, &r.blob).is_file());
        Ok(out)
    }
}

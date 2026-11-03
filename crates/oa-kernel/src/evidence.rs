//! The evidence store (spec C rule 6): immutable source documents in the
//! content-addressed blob store, one entry per document, every origin kept.

use oa_store::{EvidenceRow, MatterWrite, OriginRow};
use oa_types::{ErrorCode, OaError};
use serde_json::{json, Value};

use crate::command::Attachment;
use crate::hooks::Step;
use crate::matters::safe_file_name;
use crate::records::{blob_path, put_blob, Live};
use crate::{rejected, store_err, Ctx, Kernel};

const KNOWN_ORIGINS: &[&str] = &["court_portal", "india_code", "email", "advocate_import"];

/// Origins a connection may claim. The others are recorded only by their own
/// capture path, never on a caller's word (L-07). Stub until F: the capture
/// paths do not exist yet, so only advocate imports can be added.
const CONNECTION_ORIGINS: &[&str] = &["advocate_import"];

pub(crate) fn evidence_json(live: &Live, row: &EvidenceRow, origins: &[OriginRow]) -> Value {
    json!({
        "id": row.id,
        "original_name": row.original_name,
        "primary_origin": row.primary_origin,
        "blob": row.blob,
        "blob_path": blob_path(&live.dir, &row.blob).to_string_lossy(),
        "size": row.size,
        "created_at": row.created_at,
        "origins": origins.iter().map(|o| json!({
            "origin": o.origin,
            "original_name": o.original_name,
            "added_at": o.added_at,
        })).collect::<Vec<_>>(),
    })
}

impl Kernel {
    pub(crate) fn evidence_add(
        &self,
        ctx: &Ctx,
        matter: &str,
        file: &Attachment,
        origin: &str,
    ) -> Result<Value, OaError> {
        const COMMAND: &str = "evidence.add";
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        if !CONNECTION_ORIGINS.contains(&origin) {
            let reason = if KNOWN_ORIGINS.contains(&origin) {
                format!("origin {origin:?} is recorded only by its capture path")
            } else {
                format!("unknown origin {origin:?}")
            };
            live.store
                .record_rejected(&rejected(ctx, COMMAND, &reason, &file.bytes))
                .map_err(store_err)?;
            return Err(OaError::new(ErrorCode::WriteRefused, reason));
        }
        let name = safe_file_name(&file.file_name)?;
        let now = oa_types::now_utc();

        self.hooks.faults.before(Step::WriteBlob)?;
        let blob = put_blob(&live.dir, &file.bytes)?;

        self.hooks.faults.before(Step::CommitEvidence)?;
        if let Some(existing) = live.store.evidence_by_blob(&blob).map_err(store_err)? {
            let origin_row = OriginRow {
                evidence_id: existing.id.clone(),
                origin: origin.to_string(),
                original_name: name.clone(),
                added_at: now,
            };
            self.commit_event(
                &live,
                ctx,
                "evidence.origin_added",
                json!({ "evidence": existing.id, "origin": origin, "original_name": name }),
                &[MatterWrite::AddOrigin(origin_row)],
            )?;
            let origins = live.store.origins(&existing.id).map_err(store_err)?;
            let mut out = evidence_json(&live, &existing, &origins);
            out["duplicate"] = json!(true);
            return Ok(out);
        }

        let row = EvidenceRow {
            id: ulid::Ulid::new().to_string(),
            original_name: name.clone(),
            primary_origin: origin.to_string(),
            blob: blob.clone(),
            size: file.bytes.len() as i64,
            created_at: now.clone(),
        };
        let origin_row = OriginRow {
            evidence_id: row.id.clone(),
            origin: origin.to_string(),
            original_name: name.clone(),
            added_at: now,
        };
        self.commit_event(
            &live,
            ctx,
            "evidence.added",
            json!({
                "evidence": row.id,
                "blob": blob,
                "original_name": name,
                "origin": origin,
                "size": row.size,
            }),
            &[
                MatterWrite::InsertEvidence(row.clone()),
                MatterWrite::AddOrigin(origin_row.clone()),
            ],
        )?;
        let mut out = evidence_json(&live, &row, &[origin_row]);
        out["duplicate"] = json!(false);
        Ok(out)
    }

    pub(crate) fn evidence_list(&self, matter: &str) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        let rows = live.store.evidence_list().map_err(store_err)?;
        rows.iter()
            .map(|r| {
                let origins = live.store.origins(&r.id).map_err(store_err)?;
                Ok(evidence_json(&live, r, &origins))
            })
            .collect()
    }

    pub(crate) fn evidence_show(&self, matter: &str, id: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let row =
            live.store.evidence(id).map_err(store_err)?.ok_or_else(|| {
                OaError::new(ErrorCode::NotFound, format!("no evidence entry {id}"))
            })?;
        let origins = live.store.origins(id).map_err(store_err)?;
        let mut out = evidence_json(&live, &row, &origins);
        out["bytes_present"] = json!(blob_path(&live.dir, &row.blob).is_file());
        Ok(out)
    }
}

//! Capture and ingest (spec F): the browser supervisor's capture record, the
//! per-file ingestion queue, duplicate fingerprints, court codebooks and
//! adapter health. Capture records are refused from every origin except
//! `Origin::Capture` (F-AC-03, L-07).

use oa_capture::{detect_format, propose_class, text_fingerprint, Readability};
use oa_store::{
    AdapterHealthRow, CaptureRow, CodebookRow, EvidenceRow, IngestRow, MatterWrite, OriginRow,
};
use oa_types::{ErrorCode, OaError};
use serde_json::{json, Value};

use crate::command::{Attachment, CaptureInput};
use crate::matters::safe_file_name;
use crate::records::{blob_path, put_blob, Live};
use crate::{rejected, store_err, Ctx, Kernel};

const KNOWN_ORIGINS: &[&str] = &["court_portal", "india_code", "email", "advocate_import"];

pub(crate) fn capture_json(c: &CaptureRow) -> Value {
    json!({
        "id": c.id,
        "evidence_id": c.evidence_id,
        "url": c.url,
        "final_url": c.final_url,
        "captured_at": c.captured_at,
        "blob": c.blob,
        "profile": c.profile,
        "gesture": c.gesture,
        "portal_date": c.portal_date,
        "adapter": c.adapter,
        "status": c.status,
        "reason": c.reason,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    })
}

pub(crate) fn ingest_json(i: &IngestRow) -> Value {
    json!({
        "id": i.id,
        "evidence_id": i.evidence_id,
        "status": i.status,
        "format": i.format,
        "readability": i.readability,
        "proposed_class": i.proposed_class,
        "text_fingerprint": i.text_fingerprint,
        "duplicate_of": i.duplicate_of,
        "message": i.message,
        "created_at": i.created_at,
        "updated_at": i.updated_at,
    })
}

/// The ingest row every evidence entry gets, whatever path it arrived by
/// (F rule 1). Encrypted, corrupt and unsupported files stop after hashing.
pub(crate) fn ingest_row_for(
    evidence_id: &str,
    file_name: &str,
    bytes: &[u8],
    now: &str,
) -> IngestRow {
    let report = detect_format(file_name, bytes);
    let class = propose_class(file_name, "");
    let blocked = matches!(
        report.readability,
        Readability::Encrypted | Readability::Corrupt | Readability::Unsupported
    );
    let message = report.detail.clone().or_else(|| {
        blocked.then(|| match report.readability {
            Readability::Encrypted => "encrypted; no ingestion beyond hashing".to_string(),
            Readability::Corrupt => "corrupt; no ingestion beyond hashing".to_string(),
            Readability::Unsupported => {
                "unsupported format; no ingestion beyond hashing".to_string()
            }
            _ => String::new(),
        })
    });
    IngestRow {
        id: ulid::Ulid::new().to_string(),
        evidence_id: evidence_id.to_string(),
        status: if blocked { "blocked" } else { "pending" }.to_string(),
        format: report.actual.as_str().to_string(),
        readability: report.readability.as_str().to_string(),
        proposed_class: class.document_type.to_string(),
        text_fingerprint: None,
        duplicate_of: None,
        message,
        created_at: now.to_string(),
        updated_at: now.to_string(),
    }
}

fn health_for(capture: &CaptureInput) -> Option<AdapterHealthRow> {
    if let Some(h) = &capture.health {
        return Some(AdapterHealthRow {
            adapter: capture.adapter.clone(),
            contract_state: h.contract_state.clone(),
            runtime_state: h.runtime_state.clone(),
            detail: h.detail.clone(),
            checked_at: oa_types::now_utc(),
        });
    }
    let runtime = match capture.status.as_str() {
        "captcha_pending" => "captcha_pending",
        "failed" if capture.reason.as_deref() == Some("adapter_degraded") => "degraded",
        _ => return None,
    };
    Some(AdapterHealthRow {
        adapter: capture.adapter.clone(),
        contract_state: "unknown".into(),
        runtime_state: runtime.into(),
        detail: capture.reason.clone(),
        checked_at: oa_types::now_utc(),
    })
}

impl Kernel {
    pub(crate) fn capture_commit(
        &self,
        ctx: &Ctx,
        matter: &str,
        capture: &CaptureInput,
    ) -> Result<Value, OaError> {
        const COMMAND: &str = "capture.commit";
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        if !KNOWN_ORIGINS.contains(&capture.origin.as_str()) {
            let reason = format!("unknown capture origin {:?}", capture.origin);
            live.store
                .record_rejected(&rejected(ctx, COMMAND, &reason, b""))
                .map_err(store_err)?;
            return Err(OaError::new(ErrorCode::WriteRefused, reason));
        }
        let now = oa_types::now_utc();
        let capture_id = ulid::Ulid::new().to_string();
        let mut writes: Vec<MatterWrite> = Vec::new();
        let mut evidence_id: Option<String> = None;
        let mut blob: Option<String> = None;
        let mut ingest: Option<IngestRow> = None;

        if let Some(file) = &capture.file {
            let name = safe_file_name(&file.file_name)?;
            self.hooks.faults.before(crate::hooks::Step::WriteBlob)?;
            let hash = put_blob(&live.dir, &file.bytes)?;
            blob = Some(hash.clone());
            let existing = live.store.evidence_by_blob(&hash).map_err(store_err)?;
            let evidence = match existing {
                Some(row) => {
                    let origins = live.store.origins(&row.id).map_err(store_err)?;
                    if !origins.iter().any(|o| o.origin == capture.origin) {
                        writes.push(MatterWrite::AddOrigin(OriginRow {
                            evidence_id: row.id.clone(),
                            origin: capture.origin.clone(),
                            original_name: name.clone(),
                            added_at: now.clone(),
                        }));
                    }
                    row
                }
                None => {
                    let row = EvidenceRow {
                        id: ulid::Ulid::new().to_string(),
                        original_name: name.clone(),
                        primary_origin: capture.origin.clone(),
                        blob: hash.clone(),
                        size: file.bytes.len() as i64,
                        created_at: now.clone(),
                    };
                    writes.push(MatterWrite::InsertEvidence(row.clone()));
                    writes.push(MatterWrite::AddOrigin(OriginRow {
                        evidence_id: row.id.clone(),
                        origin: capture.origin.clone(),
                        original_name: name.clone(),
                        added_at: now.clone(),
                    }));
                    row
                }
            };
            evidence_id = Some(evidence.id.clone());
            if live
                .store
                .ingest_by_evidence(&evidence.id)
                .map_err(store_err)?
                .is_none()
            {
                let row = ingest_row_for(&evidence.id, &name, &file.bytes, &now);
                writes.push(MatterWrite::InsertIngest(row.clone()));
                ingest = Some(row);
            }
        }

        let row = CaptureRow {
            id: capture_id.clone(),
            evidence_id: evidence_id.clone(),
            url: capture.url.clone(),
            final_url: capture.final_url.clone(),
            captured_at: capture.captured_at.clone(),
            blob: blob.clone(),
            profile: capture.profile.clone(),
            gesture: capture.gesture.clone(),
            portal_date: capture.portal_date.clone(),
            adapter: capture.adapter.clone(),
            status: capture.status.clone(),
            reason: capture.reason.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        writes.push(MatterWrite::InsertCapture(row.clone()));

        self.commit_event(
            &live,
            ctx,
            "capture.committed",
            json!({
                "capture": row.id,
                "evidence": evidence_id,
                "blob": blob,
                "origin": capture.origin,
                "url": capture.url,
                "final_url": capture.final_url,
                "captured_at": capture.captured_at,
                "profile": capture.profile,
                "gesture": capture.gesture,
                "portal_date": capture.portal_date,
                "adapter": capture.adapter,
                "status": capture.status,
                "reason": capture.reason,
            }),
            &writes,
        )?;

        if let Some(health) = health_for(capture) {
            self.registry()?
                .upsert_adapter_health(&health)
                .map_err(store_err)?;
        }
        if let Some(codebook) = &capture.codebook {
            let codes = serde_json::to_string(&codebook.codes).map_err(|e| {
                OaError::new(
                    ErrorCode::Internal,
                    format!("codebook does not serialise: {e}"),
                )
            })?;
            self.registry()?
                .upsert_codebook(&CodebookRow {
                    scheme: codebook.scheme.clone(),
                    version: codebook.version.clone(),
                    codes,
                    updated_at: now,
                })
                .map_err(store_err)?;
        }

        let mut out = capture_json(&row);
        if let Some(i) = ingest {
            out["ingest"] = ingest_json(&i);
        }
        Ok(out)
    }

    pub(crate) fn capture_status(&self) -> Result<Vec<Value>, OaError> {
        let mut out = Vec::new();
        for matter in self.registry()?.matters().map_err(store_err)? {
            if matter.removed {
                continue;
            }
            let live = self.live(&matter.id)?;
            for c in live.store.captures().map_err(store_err)? {
                if c.status == "completed" {
                    continue;
                }
                let mut v = capture_json(&c);
                v["matter"] = json!(matter.id);
                out.push(v);
            }
        }
        Ok(out)
    }

    pub(crate) fn ingest_status(&self, doc: Option<&str>) -> Result<Vec<Value>, OaError> {
        let mut out = Vec::new();
        for matter in self.registry()?.matters().map_err(store_err)? {
            if matter.removed {
                continue;
            }
            let live = self.live(&matter.id)?;
            for i in live.store.ingests().map_err(store_err)? {
                if doc.is_some_and(|d| d != i.evidence_id) {
                    continue;
                }
                let mut v = ingest_json(&i);
                v["matter"] = json!(matter.id);
                out.push(v);
            }
        }
        Ok(out)
    }

    pub(crate) fn evidence_duplicates(&self, matter: &str) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        let ingests = live.store.ingests().map_err(store_err)?;
        let mut out = Vec::new();
        for i in &ingests {
            let Some(fp) = &i.text_fingerprint else {
                continue;
            };
            let same: Vec<&IngestRow> = ingests
                .iter()
                .filter(|o| o.text_fingerprint.as_deref() == Some(fp.as_str()))
                .collect();
            if same.len() < 2 || same[0].id != i.id {
                continue;
            }
            let evidence: Vec<Value> = same
                .iter()
                .map(|o| {
                    let name = live
                        .store
                        .evidence(&o.evidence_id)
                        .ok()
                        .flatten()
                        .map(|e| e.original_name)
                        .unwrap_or_default();
                    json!({ "evidence": o.evidence_id, "name": name, "ingest": o.id })
                })
                .collect();
            out.push(json!({
                "kind": "same_text",
                "fingerprint": fp,
                "matter": matter,
                "items": evidence,
            }));
        }
        Ok(out)
    }

    pub(crate) fn codebook_show(&self, scheme: &str) -> Result<Value, OaError> {
        let row = self
            .registry()?
            .codebook(scheme)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no codebook {scheme}")))?;
        let codes: Value = serde_json::from_str(&row.codes).unwrap_or(Value::Array(Vec::new()));
        Ok(json!({
            "scheme": row.scheme,
            "version": row.version,
            "codes": codes,
            "updated_at": row.updated_at,
        }))
    }

    pub(crate) fn adapter_health(&self) -> Result<Vec<Value>, OaError> {
        Ok(self
            .registry()?
            .adapters()
            .map_err(store_err)?
            .into_iter()
            .map(|a| {
                json!({
                    "adapter": a.adapter,
                    "contract_state": a.contract_state,
                    "runtime_state": a.runtime_state,
                    "detail": a.detail,
                    "checked_at": a.checked_at,
                })
            })
            .collect())
    }

    pub(crate) fn evidence_import(
        &self,
        ctx: &Ctx,
        matter: Option<&str>,
        files: &[Attachment],
    ) -> Result<Vec<Value>, OaError> {
        let matter = match matter {
            Some(m) => m.to_string(),
            None => {
                let open: Vec<_> = self
                    .registry()?
                    .matters()
                    .map_err(store_err)?
                    .into_iter()
                    .filter(|m| !m.removed)
                    .collect();
                match open.as_slice() {
                    [one] => one.id.clone(),
                    _ => {
                        return Err(OaError::new(
                            ErrorCode::Usage,
                            "choose a matter with --matter; more than one is open",
                        ))
                    }
                }
            }
        };
        let mut out = Vec::new();
        for (i, file) in files.iter().enumerate() {
            let key = format!("{}:{i}", ctx.key());
            let file_ctx = Ctx {
                origin: ctx.origin,
                key: Some(key),
            };
            out.push(self.evidence_add(&file_ctx, &matter, file, "advocate_import")?);
        }
        Ok(out)
    }

    pub(crate) fn ingest_set_text(
        &self,
        ctx: &Ctx,
        matter: &str,
        evidence: &str,
        text: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let ingest = live
            .store
            .ingest_by_evidence(evidence)
            .map_err(store_err)?
            .ok_or_else(|| {
                OaError::new(
                    ErrorCode::NotFound,
                    format!("no ingest job for evidence {evidence}"),
                )
            })?;
        let fingerprint = text_fingerprint(text);
        let duplicate_of = live
            .store
            .ingests_with_text(&fingerprint)
            .map_err(store_err)?
            .into_iter()
            .find(|i| i.id != ingest.id)
            .map(|i| i.evidence_id);
        let now = oa_types::now_utc();
        self.commit_event(
            &live,
            ctx,
            "ingest.text_set",
            json!({
                "evidence": evidence,
                "ingest": ingest.id,
                "fingerprint": fingerprint,
                "duplicate_of": duplicate_of,
            }),
            &[MatterWrite::SetIngestText {
                id: ingest.id.clone(),
                text_fingerprint: fingerprint.clone(),
                duplicate_of: duplicate_of.clone(),
                updated_at: now.clone(),
            }],
        )?;
        let mut row = ingest;
        row.text_fingerprint = Some(fingerprint);
        row.duplicate_of = duplicate_of;
        row.updated_at = now;
        Ok(ingest_json(&row))
    }
}

/// The blob path for a capture's hash, for the Inspector (F-AC-13).
pub(crate) fn capture_blob_path(live: &Live, capture: &CaptureRow) -> Option<String> {
    capture
        .blob
        .as_ref()
        .map(|b| blob_path(&live.dir, b).to_string_lossy().to_string())
}

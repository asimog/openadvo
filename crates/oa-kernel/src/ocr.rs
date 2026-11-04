//! OCR and document intelligence (spec G): the kernel stores the supervisor's
//! readings, runs the agreement engine, keeps disputes and typed copies, and
//! answers the line, dispute, entity and engine queries. The OCR models run in
//! separate processes; this module never loads one.

use std::collections::BTreeMap;

use oa_ocr::{agree, extract_entities, DateAnchor, LineRecord, LineRef, Reading, Rect};
use oa_store::{AdapterHealthRow, MatterWrite, OcrDocumentRow};
use oa_types::{ErrorCode, OaError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::command::{OcrEngineHealthInput, OcrRunInput};
use crate::{store_err, Ctx, Kernel};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OcrPageRecord {
    page: u32,
    raster_hash: String,
    width: f32,
    height: f32,
    dpi: u32,
    text_layer: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DisputeRecord {
    id: String,
    doc: String,
    page: u32,
    line_hash: String,
    token_index: usize,
    reading_a: String,
    reading_b: String,
    class: String,
    reason: String,
    state: String,
    decided_reading: Option<String>,
    decided_text: Option<String>,
    decided_by: Option<String>,
    decided_at: Option<String>,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TypedCopyRecord {
    doc: String,
    page: u32,
    text: String,
    typist: String,
    created_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct OcrData {
    pages: Vec<OcrPageRecord>,
    lines: Vec<LineRecord>,
    disputes: Vec<DisputeRecord>,
    typed_copies: Vec<TypedCopyRecord>,
}

fn parse_data(row: &OcrDocumentRow) -> Result<OcrData, OaError> {
    serde_json::from_str(&row.data).map_err(|e| {
        OaError::new(
            ErrorCode::MatterDamaged,
            format!("OCR data for {} is not valid JSON: {e}", row.doc),
        )
    })
}

fn dispute_json(d: &DisputeRecord) -> Value {
    json!({
        "id": d.id,
        "doc": d.doc,
        "page": d.page,
        "line_hash": d.line_hash,
        "token_index": d.token_index,
        "reading_a": d.reading_a,
        "reading_b": d.reading_b,
        "class": d.class,
        "reason": d.reason,
        "state": d.state,
        "decided_reading": d.decided_reading,
        "decided_text": d.decided_text,
        "decided_by": d.decided_by,
        "decided_at": d.decided_at,
        "created_at": d.created_at,
    })
}

fn line_json(l: &LineRecord) -> Value {
    json!({
        "page": l.page,
        "line": l.line,
        "line_hash": l.line_hash,
        "rect": l.rect,
        "agreement": l.agreement,
        "canonical_text": l.canonical_text,
        "reading_a": l.reading_a,
        "reading_b": l.reading_b,
        "disputed": l.disputed,
        "normalisation_version": l.normalisation_version,
        "edit_distance_version": l.edit_distance_version,
    })
}

fn engine_health_row(h: &OcrEngineHealthInput) -> AdapterHealthRow {
    AdapterHealthRow {
        adapter: format!("ocr:{}", h.engine),
        contract_state: "healthy".into(),
        runtime_state: h.state.clone(),
        detail: Some(
            json!({ "version": h.version, "model_hash": h.model_hash, "detail": h.detail })
                .to_string(),
        ),
        checked_at: oa_types::now_utc(),
    }
}

impl Kernel {
    pub(crate) fn ocr_run(
        &self,
        ctx: &Ctx,
        matter: &str,
        doc: &str,
        input: &OcrRunInput,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        if live.store.evidence(doc).map_err(store_err)?.is_none() {
            return Err(OaError::new(
                ErrorCode::NotFound,
                format!("no evidence entry {doc}"),
            ));
        }
        let now = oa_types::now_utc();
        let pages: Vec<OcrPageRecord> = input
            .pages
            .iter()
            .map(|p| OcrPageRecord {
                page: p.page,
                raster_hash: p.raster_hash.clone(),
                width: p.width,
                height: p.height,
                dpi: p.dpi,
                text_layer: p.text_layer.clone(),
            })
            .collect();
        let mut grouped: BTreeMap<(u32, u32), Vec<Reading>> = BTreeMap::new();
        for input_reading in &input.readings {
            grouped
                .entry((input_reading.page, input_reading.line))
                .or_default()
                .push(input_reading.reading.clone());
        }
        let mut lines = Vec::new();
        let mut disputes = Vec::new();
        for ((page, line), readings) in grouped {
            let a = readings[0].clone();
            let b = readings.get(1).cloned().unwrap_or_else(|| a.clone());
            let rect = a.words.first().map(|w| w.rect).unwrap_or_else(Rect::zero);
            let record = agree(page, line, rect, a, b, &[]);
            for d in &record.disputed {
                disputes.push(DisputeRecord {
                    id: ulid::Ulid::new().to_string(),
                    doc: doc.to_string(),
                    page,
                    line_hash: record.line_hash.clone(),
                    token_index: d.token_index,
                    reading_a: d.reading_a.clone(),
                    reading_b: d.reading_b.clone(),
                    class: format!("{:?}", d.class).to_lowercase(),
                    reason: d.reason.clone(),
                    state: "open".into(),
                    decided_reading: None,
                    decided_text: None,
                    decided_by: None,
                    decided_at: None,
                    created_at: now.clone(),
                });
            }
            lines.push(record);
        }
        let failed_engine = input
            .engine_health
            .iter()
            .any(|h| h.state != "healthy" && h.state != "captcha_pending");
        let state = if !disputes.is_empty() || failed_engine {
            "needs_review"
        } else {
            "done"
        };
        let data = OcrData {
            pages,
            lines,
            disputes,
            typed_copies: Vec::new(),
        };
        let data_json = serde_json::to_string(&data).map_err(|e| {
            OaError::new(
                ErrorCode::Internal,
                format!("OCR data does not serialise: {e}"),
            )
        })?;
        let existing = live.store.ocr_document(doc).map_err(store_err)?;
        let row = OcrDocumentRow {
            doc: doc.to_string(),
            state: state.to_string(),
            page_count: data.pages.len() as i64,
            disputes: data.disputes.len() as i64,
            data: data_json,
            created_at: existing
                .as_ref()
                .map(|r| r.created_at.clone())
                .unwrap_or_else(|| now.clone()),
            updated_at: now.clone(),
        };
        self.commit_event(
            &live,
            ctx,
            "ocr.ran",
            json!({
                "doc": doc,
                "state": state,
                "pages": row.page_count,
                "disputes": row.disputes,
                "lines": data.lines.len(),
                "engines": input.engine_health.iter().map(|h| json!({
                    "engine": h.engine,
                    "version": h.version,
                    "model_hash": h.model_hash,
                    "state": h.state,
                })).collect::<Vec<_>>(),
            }),
            &[MatterWrite::UpsertOcrDocument(row.clone())],
        )?;
        for health in &input.engine_health {
            self.registry()?
                .upsert_adapter_health(&engine_health_row(health))
                .map_err(store_err)?;
        }
        Ok(json!({
            "doc": row.doc,
            "state": row.state,
            "page_count": row.page_count,
            "disputes": row.disputes,
            "lines": data.lines.len(),
        }))
    }

    pub(crate) fn ocr_lines(
        &self,
        matter: &str,
        doc: &str,
        page: Option<u32>,
    ) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        let row = live
            .store
            .ocr_document(doc)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no OCR run for {doc}")))?;
        let data = parse_data(&row)?;
        Ok(data
            .lines
            .iter()
            .filter(|l| page.is_none_or(|p| l.page == p))
            .map(line_json)
            .collect())
    }

    pub(crate) fn ocr_disputes(
        &self,
        matter: Option<&str>,
        doc: Option<&str>,
    ) -> Result<Vec<Value>, OaError> {
        let mut out = Vec::new();
        let matters: Vec<String> = match matter {
            Some(m) => vec![m.to_string()],
            None => self
                .registry()?
                .matters()
                .map_err(store_err)?
                .into_iter()
                .filter(|m| !m.removed)
                .map(|m| m.id)
                .collect(),
        };
        for m in matters {
            let live = self.live(&m)?;
            let rows = match doc {
                Some(d) => live
                    .store
                    .ocr_document(d)
                    .map_err(store_err)?
                    .into_iter()
                    .collect(),
                None => live.store.ocr_documents().map_err(store_err)?,
            };
            for row in rows {
                let data = parse_data(&row)?;
                for d in data.disputes.iter().filter(|d| d.state == "open") {
                    let mut v = dispute_json(d);
                    v["matter"] = json!(m);
                    out.push(v);
                }
            }
        }
        Ok(out)
    }

    pub(crate) fn ocr_decide(
        &self,
        ctx: &Ctx,
        matter: &str,
        dispute: &str,
        reading: &str,
        text: Option<&str>,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let rows = live.store.ocr_documents().map_err(store_err)?;
        let mut found: Option<(OcrDocumentRow, OcrData, usize)> = None;
        for row in rows {
            let data = parse_data(&row)?;
            if let Some(index) = data.disputes.iter().position(|d| d.id == dispute) {
                found = Some((row, data, index));
                break;
            }
        }
        let Some((mut row, mut data, index)) = found else {
            return Err(OaError::new(
                ErrorCode::NotFound,
                format!("no OCR dispute {dispute}"),
            ));
        };
        let now = oa_types::now_utc();
        let decided_by = ctx.origin.actor().to_string();
        {
            let d = &mut data.disputes[index];
            d.state = "decided".into();
            d.decided_reading = Some(reading.to_string());
            d.decided_text = text.map(str::to_string);
            d.decided_by = Some(decided_by.clone());
            d.decided_at = Some(now.clone());
        }
        row.data = serde_json::to_string(&data).map_err(|e| {
            OaError::new(
                ErrorCode::Internal,
                format!("OCR data does not serialise: {e}"),
            )
        })?;
        row.updated_at = now;
        self.commit_event(
            &live,
            ctx,
            "ocr.dispute_decided",
            json!({
                "doc": row.doc,
                "dispute": dispute,
                "reading": reading,
                "text": text,
                "decided_by": decided_by,
            }),
            &[MatterWrite::UpsertOcrDocument(row)],
        )?;
        Ok(dispute_json(&data.disputes[index]))
    }

    pub(crate) fn ocr_typed_copy(
        &self,
        ctx: &Ctx,
        matter: &str,
        doc: &str,
        page: u32,
        text: &str,
        typist: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let mut row = live
            .store
            .ocr_document(doc)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no OCR run for {doc}")))?;
        let mut data = parse_data(&row)?;
        let now = oa_types::now_utc();
        let copy = TypedCopyRecord {
            doc: doc.to_string(),
            page,
            text: text.to_string(),
            typist: typist.to_string(),
            created_at: now.clone(),
        };
        data.typed_copies.push(copy.clone());
        row.data = serde_json::to_string(&data).map_err(|e| {
            OaError::new(
                ErrorCode::Internal,
                format!("OCR data does not serialise: {e}"),
            )
        })?;
        row.updated_at = now;
        self.commit_event(
            &live,
            ctx,
            "ocr.typed_copy",
            json!({ "doc": doc, "page": page, "typist": typist }),
            &[MatterWrite::UpsertOcrDocument(row)],
        )?;
        Ok(json!({
            "doc": copy.doc,
            "page": copy.page,
            "text": copy.text,
            "typist": copy.typist,
            "created_at": copy.created_at,
        }))
    }

    pub(crate) fn extract_entities(&self, matter: &str, doc: &str) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        let row = live
            .store
            .ocr_document(doc)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no OCR run for {doc}")))?;
        let data = parse_data(&row)?;
        let mut out = Vec::new();
        for line in &data.lines {
            let line_ref = LineRef {
                page: line.page,
                line: line.line,
                line_hash: &line.line_hash,
                rect: line.rect,
            };
            let extraction =
                extract_entities(&line.canonical_text, line_ref, &[], &DateAnchor::default());
            for entity in extraction.entities {
                let mut v = serde_json::to_value(entity).unwrap_or(Value::Null);
                v["doc"] = json!(doc);
                out.push(v);
            }
        }
        Ok(out)
    }

    pub(crate) fn ocr_engines(&self) -> Result<Vec<Value>, OaError> {
        Ok(self
            .registry()?
            .adapters()
            .map_err(store_err)?
            .into_iter()
            .filter(|a| a.adapter.starts_with("ocr:"))
            .map(|a| {
                let detail: Value = a
                    .detail
                    .as_deref()
                    .and_then(|d| serde_json::from_str(d).ok())
                    .unwrap_or(Value::Null);
                json!({
                    "engine": a.adapter.trim_start_matches("ocr:"),
                    "version": detail["version"],
                    "model_hash": detail["model_hash"],
                    "runtime_state": a.runtime_state,
                    "detail": detail["detail"],
                    "checked_at": a.checked_at,
                })
            })
            .collect())
    }
}

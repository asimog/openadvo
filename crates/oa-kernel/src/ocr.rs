//! OCR and document intelligence (spec G): the kernel stores the supervisor's
//! readings, runs the agreement engine, keeps disputes and typed copies, and
//! answers the line, dispute, entity and engine queries. The OCR models run in
//! separate processes; this module never loads one.

use std::collections::BTreeMap;

use oa_ocr::{
    agree, extract_entities, map_line_versions, Agreement, DateAnchor, LineRecord, LineRef,
    LineVersion, Reading, Rect,
};
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
    /// Engines that did not return a healthy reading on the last run.
    #[serde(default)]
    engine_failures: Vec<String>,
    /// Lines replaced by a later run, kept so old anchors resolve (G rule 10).
    #[serde(default)]
    superseded: Vec<LineRecord>,
    /// Old line hash to the current line hash at the same position (G08).
    #[serde(default)]
    line_map: BTreeMap<String, String>,
}

/// Reading a is always Tesseract's and reading b PaddleOCR's, whatever order
/// the supervisor sent them in.
const READING_A_ENGINE: &str = "tesseract";
/// A born-digital line comes from the pdfium text layer and is not OCR'd
/// (G rule 2), so it has one reading by design.
const BORN_DIGITAL_ENGINE: &str = "pdfium";

impl OcrData {
    fn open_disputes(&self) -> usize {
        self.disputes.iter().filter(|d| d.state == "open").count()
    }

    fn state(&self) -> &'static str {
        if self.open_disputes() > 0 || !self.engine_failures.is_empty() {
            "needs_review"
        } else {
            "done"
        }
    }

    /// Old line hashes that now resolve to `line_hash`.
    fn supersedes(&self, line_hash: &str) -> Vec<&str> {
        self.line_map
            .iter()
            .filter(|(_, new)| new.as_str() == line_hash)
            .map(|(old, _)| old.as_str())
            .collect()
    }

    /// The line's text with decided disputes applied, and the byte spans of
    /// tokens still under open dispute (G rule 6).
    fn effective_text(&self, line: &LineRecord) -> (String, Vec<(usize, usize)>) {
        let mut text = String::new();
        let mut open = Vec::new();
        for (i, token) in line.canonical_text.split(' ').enumerate() {
            let dispute = self
                .disputes
                .iter()
                .find(|d| d.line_hash == line.line_hash && d.token_index == i);
            let chosen = match dispute {
                Some(d) if d.state == "decided" => match d.decided_reading.as_deref() {
                    Some("b") => d.reading_b.as_str(),
                    Some("typed") => d.decided_text.as_deref().unwrap_or(token),
                    _ => d.reading_a.as_str(),
                },
                _ => token,
            };
            if !text.is_empty() {
                text.push(' ');
            }
            let start = text.len();
            text.push_str(chosen);
            if dispute.is_some_and(|d| d.state == "open") {
                open.push((start, text.len()));
            }
        }
        (text, open)
    }
}

fn missing_reading() -> Reading {
    Reading {
        engine: "none".into(),
        engine_version: "none".into(),
        model_hash: String::new(),
        text: String::new(),
        confidence: 0.0,
        words: Vec::new(),
    }
}

fn line_version(l: &LineRecord) -> LineVersion {
    LineVersion {
        page: l.page,
        line: l.line,
        line_hash: l.line_hash.clone(),
        engine_version: l.reading_a.engine_version.clone(),
    }
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

fn line_json(data: &OcrData, l: &LineRecord) -> Value {
    json!({
        "supersedes": data.supersedes(&l.line_hash),
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
        let previous = live
            .store
            .ocr_document(doc)
            .map_err(store_err)?
            .map(|row| parse_data(&row).map(|data| (row.created_at, data)))
            .transpose()?;
        let mut lines = Vec::new();
        let mut disputes = Vec::new();
        for ((page, line), mut readings) in grouped {
            readings.sort_by_key(|r| (r.engine != READING_A_ENGINE, r.engine.clone()));
            let a = readings[0].clone();
            let b = match readings.get(1) {
                Some(b) => b.clone(),
                None if a.engine == BORN_DIGITAL_ENGINE => a.clone(),
                // One engine read the line and the other did not: every token
                // is disputed, never agreed with itself (G edge cases).
                None => missing_reading(),
            };
            let rect = a.words.first().map(|w| w.rect).unwrap_or_else(Rect::zero);
            let record = agree(page, line, rect, a, b, &[]);
            for d in &record.disputed {
                let carried = previous.as_ref().and_then(|(_, p)| {
                    p.disputes.iter().find(|o| {
                        o.state == "decided"
                            && o.line_hash == record.line_hash
                            && o.token_index == d.token_index
                            && o.reading_a == d.reading_a
                            && o.reading_b == d.reading_b
                    })
                });
                if let Some(old) = carried {
                    disputes.push(old.clone());
                    continue;
                }
                let reason = if record.agreement == Agreement::OneEngineEmpty {
                    "one_engine_empty".to_string()
                } else {
                    d.reason.clone()
                };
                disputes.push(DisputeRecord {
                    id: ulid::Ulid::new().to_string(),
                    doc: doc.to_string(),
                    page,
                    line_hash: record.line_hash.clone(),
                    token_index: d.token_index,
                    reading_a: d.reading_a.clone(),
                    reading_b: d.reading_b.clone(),
                    class: format!("{:?}", d.class).to_lowercase(),
                    reason,
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
        let engine_failures: Vec<String> = input
            .engine_health
            .iter()
            .filter(|h| h.state != "healthy")
            .map(|h| h.engine.clone())
            .collect();
        let mut data = OcrData {
            pages,
            lines,
            disputes,
            engine_failures,
            ..OcrData::default()
        };
        let mut created_at = now.clone();
        if let Some((created, old)) = previous {
            created_at = created;
            // Decisions on lines that changed stay as history, not open.
            for d in old.disputes {
                if d.state == "decided" && !data.disputes.iter().any(|n| n.id == d.id) {
                    data.disputes.push(d);
                }
            }
            data.typed_copies = old.typed_copies;
            let new_versions: Vec<LineVersion> = data.lines.iter().map(line_version).collect();
            let old_versions: Vec<LineVersion> = old.lines.iter().map(line_version).collect();
            let fresh = map_line_versions(&old_versions, &new_versions);
            data.line_map = old
                .line_map
                .into_iter()
                .map(|(k, v)| {
                    let v = fresh.get(&v).cloned().unwrap_or(v);
                    (k, v)
                })
                .collect();
            for (old_hash, new_hash) in fresh {
                if old_hash != new_hash {
                    data.line_map.insert(old_hash, new_hash);
                }
            }
            data.superseded = old.superseded;
            data.superseded.extend(
                old.lines
                    .into_iter()
                    .filter(|l| !data.lines.iter().any(|n| n.line_hash == l.line_hash)),
            );
        }
        let state = data.state();
        let data_json = serde_json::to_string(&data).map_err(|e| {
            OaError::new(
                ErrorCode::Internal,
                format!("OCR data does not serialise: {e}"),
            )
        })?;
        let row = OcrDocumentRow {
            doc: doc.to_string(),
            state: state.to_string(),
            page_count: data.pages.len() as i64,
            disputes: data.open_disputes() as i64,
            data: data_json,
            created_at,
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
            .map(|l| line_json(&data, l))
            .collect())
    }

    /// Each document's pipeline state, pages and open dispute count (G GUI
    /// "Pipeline").
    pub(crate) fn ocr_pipeline(&self, matter: Option<&str>) -> Result<Vec<Value>, OaError> {
        let mut out = Vec::new();
        for m in self.ocr_matters(matter)? {
            let live = self.live(&m)?;
            for row in live.store.ocr_documents().map_err(store_err)? {
                let data = parse_data(&row)?;
                out.push(json!({
                    "matter": m,
                    "doc": row.doc,
                    "state": row.state,
                    "pages": row.page_count,
                    "lines": data.lines.len(),
                    "disputes": row.disputes,
                    "engine_failures": data.engine_failures,
                    "updated_at": row.updated_at,
                }));
            }
        }
        Ok(out)
    }

    fn ocr_matters(&self, matter: Option<&str>) -> Result<Vec<String>, OaError> {
        Ok(match matter {
            Some(m) => vec![m.to_string()],
            None => self
                .registry()?
                .matters()
                .map_err(store_err)?
                .into_iter()
                .filter(|m| !m.removed)
                .map(|m| m.id)
                .collect(),
        })
    }

    pub(crate) fn ocr_disputes(
        &self,
        matter: Option<&str>,
        doc: Option<&str>,
    ) -> Result<Vec<Value>, OaError> {
        let mut out = Vec::new();
        for m in self.ocr_matters(matter)? {
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
        match (reading, text) {
            ("a" | "b", _) => {}
            ("typed", Some(t)) if !t.trim().is_empty() => {}
            ("typed", _) => {
                return Err(OaError::new(
                    ErrorCode::Usage,
                    "a typed decision needs --text",
                ))
            }
            (other, _) => {
                return Err(OaError::new(
                    ErrorCode::Usage,
                    format!("reading must be a, b or typed, not {other}"),
                ))
            }
        }
        if data.disputes[index].state != "open" {
            return Err(OaError::new(
                ErrorCode::Conflict,
                format!(
                    "dispute {dispute} is already {}",
                    data.disputes[index].state
                ),
            ));
        }
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
        row.state = data.state().to_string();
        row.disputes = data.open_disputes() as i64;
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
            let (text, open) = data.effective_text(line);
            let extraction = extract_entities(&text, line_ref, &[], &DateAnchor::default());
            for entity in extraction.entities {
                let disputed = open
                    .iter()
                    .any(|(start, end)| entity.start < *end && *start < entity.end);
                let mut v = serde_json::to_value(entity).unwrap_or(Value::Null);
                v["doc"] = json!(doc);
                v["disputed"] = json!(disputed);
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

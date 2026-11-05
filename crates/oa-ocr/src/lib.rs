//! OCR and document intelligence pure logic (spec G): the canonical line, the
//! agreement engine that compares two readings and disputes critical tokens,
//! date extraction with anchors, entity extraction, anchor geometry, bounded
//! batches, line versions and gold-set accuracy. The engine supervisor runs
//! each engine as a separate OS process; the binaries in `src/bin` are stubs
//! that read a sidecar text file, so the process boundary and failure handling
//! are real while the OCR models are not vendored here.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use chrono::{NaiveDate, NaiveTime};
use regex::Regex;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use unicode_normalization::UnicodeNormalization;

#[cfg(all(not(debug_assertions), feature = "test-doubles"))]
compile_error!("A release build that links a test double fails (Q-AC-10).");

pub mod pdf;
pub use pdf::{find_pdfium_dll, init_pdfium, ExtractedPageText, PdfDoc, PdfError};

pub mod tesseract;
pub mod paddle;

pub const NORMALISATION_VERSION: &str = "nfc-whitespace-hyphen-devanagari-1";
pub const EDIT_DISTANCE_VERSION: &str = "prose-levenshtein-2-1";
pub const PROSE_THRESHOLD_LONG: usize = 2;
pub const PROSE_THRESHOLD_SHORT: usize = 1;

/// `sha256:{lowercase hex}` for a raster or document.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

/// A rectangle in the raster's coordinate space. Every viewer highlight and
/// OCR box uses this space (G rule 1).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Rect {
    pub fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    pub fn zero() -> Self {
        Rect::new(0.0, 0.0, 0.0, 0.0)
    }
}

/// The spec's one-pixel tolerance for an anchor landing on the same word as the
/// OCR box (G-AC-11).
pub fn within_one_pixel(a: &Rect, b: &Rect) -> bool {
    (a.x - b.x).abs() <= 1.0
        && (a.y - b.y).abs() <= 1.0
        && (a.width - b.width).abs() <= 1.0
        && (a.height - b.height).abs() <= 1.0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TokenClass {
    Critical,
    Prose,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Token {
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub class: TokenClass,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Word {
    pub text: String,
    pub rect: Rect,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Reading {
    pub engine: String,
    pub engine_version: String,
    pub model_hash: String,
    pub text: String,
    pub confidence: f32,
    #[serde(default)]
    pub words: Vec<Word>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Agreement {
    Agreed,
    Disputed,
    OneEngineEmpty,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DisputedToken {
    pub token_index: usize,
    pub reading_a: String,
    pub reading_b: String,
    pub class: TokenClass,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rect_a: Option<Rect>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rect_b: Option<Rect>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LineRecord {
    pub page: u32,
    pub line: u32,
    pub rect: Rect,
    pub reading_a: Reading,
    pub reading_b: Reading,
    pub agreement: Agreement,
    pub canonical_text: String,
    pub disputed: Vec<DisputedToken>,
    pub line_hash: String,
    pub normalisation_version: String,
    pub edit_distance_version: String,
}

impl LineRecord {
    pub fn is_disputed(&self) -> bool {
        self.agreement != Agreement::Agreed
    }
}

fn devanagari_digit(ch: char) -> char {
    match ch {
        '०' => '0',
        '१' => '1',
        '२' => '2',
        '३' => '3',
        '४' => '4',
        '५' => '5',
        '६' => '6',
        '७' => '7',
        '८' => '8',
        '९' => '9',
        other => other,
    }
}

/// Normalisation is fixed and versioned (G rule 5 and 15): Unicode NFC,
/// line-end hyphen join, Devanagari digits to ASCII, straight/curly quote
/// equivalence, then whitespace collapse.
pub fn normalise(text: &str) -> String {
    let nfc: String = text.nfc().collect();
    let joined = nfc.replace("-\r\n", "").replace("-\n", "");
    let digits: String = joined.chars().map(devanagari_digit).collect();
    let quotes = digits
        .replace(['\u{2018}', '\u{2019}'], "'")
        .replace(['\u{201c}', '\u{201d}'], "\"");
    quotes.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn negation_words() -> &'static [&'static str] {
    &[
        "not",
        "no",
        "never",
        "nor",
        "without",
        "nothing",
        "none",
        "neither",
        "cannot",
        "can't",
        "n't",
        "मत",
        "न",
        "नहीं",
        "बिना",
    ]
}

fn provision_words() -> &'static [&'static str] {
    &[
        "section",
        "sec",
        "article",
        "art",
        "rule",
        "order",
        "clause",
        "schedule",
        "act",
        "code",
        "regulation",
        "notification",
    ]
}

fn case_words() -> &'static [&'static str] {
    &[
        "wp", "cwp", "slp", "crl", "writ", "petition", "appeal", "civil", "criminal", "oa", "ma",
        "ia", "crl.a", "c.a", "crl.a.", "c.a.",
    ]
}

fn citation_words() -> &'static [&'static str] {
    &[
        "insc", "scc", "air", "scr", "bom", "del", "mad", "cal", "ap", "mp", "guj", "ker", "kar",
        "raj", "pat", "all", "lah",
    ]
}

fn amount_words() -> &'static [&'static str] {
    &["rs", "rs.", "inr", "₹"]
}

/// A token is critical when it carries a digit or belongs to one of the classes
/// the spec lists (party names, statutory provisions, negations, citations,
/// case numbers and amounts).
pub fn classify(text: &str, parties: &[String]) -> TokenClass {
    let lower = text.to_lowercase();
    let bare = lower.trim_matches(|c: char| !c.is_alphanumeric() && c != '.');
    if bare.chars().any(|c| c.is_ascii_digit()) {
        return TokenClass::Critical;
    }
    if negation_words().contains(&bare)
        || provision_words().contains(&bare)
        || case_words().contains(&bare)
        || citation_words().contains(&bare)
        || amount_words().contains(&bare)
    {
        return TokenClass::Critical;
    }
    for party in parties {
        for word in party.split_whitespace() {
            if word.to_lowercase() == bare {
                return TokenClass::Critical;
            }
        }
    }
    TokenClass::Prose
}

/// Tokenise a normalised string, keeping byte spans so anchors can point at the
/// word in the raster.
pub fn tokenise(text: &str, parties: &[String]) -> Vec<Token> {
    let mut out = Vec::new();
    let mut start: Option<usize> = None;
    for (i, ch) in text.char_indices() {
        if ch.is_whitespace() {
            if let Some(s) = start.take() {
                push_token(&mut out, text, s, i, parties);
            }
        } else if start.is_none() {
            start = Some(i);
        }
    }
    if let Some(s) = start {
        push_token(&mut out, text, s, text.len(), parties);
    }
    out
}

fn push_token(out: &mut Vec<Token>, text: &str, start: usize, end: usize, parties: &[String]) {
    let slice = &text[start..end];
    let Some(first) = slice.find(|c: char| c.is_alphanumeric() || c == '₹') else {
        return;
    };
    let Some(last) = slice.rfind(|c: char| c.is_alphanumeric() || c == '₹' || c == '.') else {
        return;
    };
    if last < first {
        return;
    }
    let token = &slice[first..=last];
    let class = classify(token, parties);
    out.push(Token {
        text: token.to_string(),
        start: start + first,
        end: start + last + 1,
        class,
    });
}

fn critical_form(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter(|c| *c != ',' && *c != '\u{00a0}')
        .collect()
}

/// Bounded Levenshtein distance. The prose threshold is versioned.
pub fn bounded_edit_distance(a: &str, b: &str, limit: usize) -> Option<usize> {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len().abs_diff(b.len()) > limit {
        return None;
    }
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    let mut current = vec![0usize; b.len() + 1];
    for (i, ca) in a.iter().enumerate() {
        current[0] = i + 1;
        let mut row_min = current[0];
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            current[j + 1] = (previous[j] + cost)
                .min(previous[j + 1] + 1)
                .min(current[j] + 1);
            row_min = row_min.min(current[j + 1]);
        }
        if row_min > limit {
            return None;
        }
        std::mem::swap(&mut previous, &mut current);
    }
    let distance = previous[b.len()];
    (distance <= limit).then_some(distance)
}

fn prose_threshold(token: &str) -> usize {
    if token.chars().count() >= 6 {
        PROSE_THRESHOLD_LONG
    } else {
        PROSE_THRESHOLD_SHORT
    }
}

/// Compare two readings of the same line. A critical token must match exactly;
/// prose tokens may differ within the versioned edit-distance threshold.
pub fn agree(
    page: u32,
    line: u32,
    rect: Rect,
    reading_a: Reading,
    reading_b: Reading,
    parties: &[String],
) -> LineRecord {
    let mut a = reading_a;
    let mut b = reading_b;
    a.text = normalise(&a.text);
    b.text = normalise(&b.text);
    let tokens_a = tokenise(&a.text, parties);
    let tokens_b = tokenise(&b.text, parties);
    let mut disputed = Vec::new();
    let max = tokens_a.len().max(tokens_b.len());
    let mut canonical = Vec::new();
    for i in 0..max {
        match (tokens_a.get(i), tokens_b.get(i)) {
            (Some(ta), Some(tb)) => {
                canonical.push(ta.text.clone());
                let reason = if ta.class != tb.class {
                    Some("class_mismatch".to_string())
                } else if ta.class == TokenClass::Critical {
                    (critical_form(&ta.text) != critical_form(&tb.text))
                        .then(|| "critical_mismatch".into())
                } else if bounded_edit_distance(&ta.text, &tb.text, prose_threshold(&ta.text))
                    .is_none()
                {
                    Some("prose_distance".to_string())
                } else {
                    None
                };
                if let Some(reason) = reason {
                    disputed.push(DisputedToken {
                        token_index: i,
                        reading_a: ta.text.clone(),
                        reading_b: tb.text.clone(),
                        class: ta.class,
                        reason,
                        rect_a: a.words.get(i).map(|w| w.rect),
                        rect_b: b.words.get(i).map(|w| w.rect),
                    });
                }
            }
            (Some(ta), None) | (None, Some(ta)) => {
                canonical.push(ta.text.clone());
                disputed.push(DisputedToken {
                    token_index: i,
                    reading_a: tokens_a.get(i).map(|t| t.text.clone()).unwrap_or_default(),
                    reading_b: tokens_b.get(i).map(|t| t.text.clone()).unwrap_or_default(),
                    class: ta.class,
                    reason: "token_count_mismatch".into(),
                    rect_a: a.words.get(i).map(|w| w.rect),
                    rect_b: b.words.get(i).map(|w| w.rect),
                });
            }
            (None, None) => break,
        }
    }
    let agreement = if a.text.is_empty() && b.text.is_empty() {
        Agreement::Agreed
    } else if a.text.is_empty() || b.text.is_empty() {
        Agreement::OneEngineEmpty
    } else if disputed.is_empty() {
        Agreement::Agreed
    } else {
        Agreement::Disputed
    };
    let canonical_text = canonical.join(" ");
    let mut hasher = Sha256::new();
    hasher.update(format!(
        "{}|{}|{}|{}|{}|{}|{}|{}|{}",
        page,
        line,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        canonical_text,
        a.engine_version,
        b.engine_version
    ));
    let line_hash = format!("sha256:{}", hex::encode(hasher.finalize()));
    LineRecord {
        page,
        line,
        rect,
        reading_a: a,
        reading_b: b,
        agreement,
        canonical_text,
        disputed,
        line_hash,
        normalisation_version: NORMALISATION_VERSION.into(),
        edit_distance_version: EDIT_DISTANCE_VERSION.into(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DateKind {
    Explicit,
    Inferred,
    Unresolved,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DateEntity {
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub kind: DateKind,
    pub date: Option<NaiveDate>,
    pub time: Option<NaiveTime>,
}

#[derive(Debug, Clone, Default)]
pub struct DateAnchor {
    pub header: Option<NaiveDate>,
    pub portal: Option<NaiveDate>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DateExtraction {
    pub entities: Vec<DateEntity>,
    pub questions: Vec<String>,
}

fn month_number(name: &str) -> Option<u32> {
    let lower = name.to_lowercase();
    let month = match &lower[..3.min(lower.len())] {
        "jan" => 1,
        "feb" => 2,
        "mar" => 3,
        "apr" => 4,
        "may" => 5,
        "jun" => 6,
        "jul" => 7,
        "aug" => 8,
        "sep" => 9,
        "oct" => 10,
        "nov" => 11,
        "dec" => 12,
        _ => return None,
    };
    Some(month)
}

fn time_after(text: &str, end: usize) -> Option<NaiveTime> {
    let window = text.get(end..end.saturating_add(24).min(text.len()))?;
    let re = Regex::new(r"(?i)^\s*at\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?").ok()?;
    let caps = re.captures(window)?;
    let mut hour: u32 = caps.get(1)?.as_str().parse().ok()?;
    let minute: u32 = caps.get(2)?.as_str().parse().ok()?;
    let second: u32 = caps
        .get(3)
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(0);
    let meridiem = caps.get(4).map(|m| m.as_str().to_lowercase());
    if let Some(m) = meridiem {
        if m == "pm" && hour < 12 {
            hour += 12;
        } else if m == "am" && hour == 12 {
            hour = 0;
        }
    }
    NaiveTime::from_hms_opt(hour, minute, second)
}

/// Extract explicit Indian date forms and resolve relative dates only against
/// an anchor. Vague expressions never become dates (G rule 8).
pub fn extract_dates(text: &str, anchor: &DateAnchor) -> DateExtraction {
    let normalised = normalise(text);
    let mut entities: Vec<DateEntity> = Vec::new();
    let mut questions: Vec<String> = Vec::new();
    let mut covered: Vec<(usize, usize)> = Vec::new();
    let conflict = matches!((anchor.header, anchor.portal), (Some(h), Some(p)) if h != p);
    if conflict {
        questions.push(
            "The document header date and the portal date conflict; which date anchors relative dates?"
                .into(),
        );
    }
    let dmy = Regex::new(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b").expect("a date regex");
    let dmonth = Regex::new(
        r"(?i)\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b",
    )
    .expect("a date regex");
    let monthd = Regex::new(
        r"(?i)\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b",
    )
    .expect("a date regex");
    let ymd = Regex::new(r"\b(\d{4})-(\d{2})-(\d{2})\b").expect("a date regex");
    for caps in dmy.captures_iter(&normalised) {
        let day = caps[1].parse::<u32>().ok();
        let month = caps[2].parse::<u32>().ok();
        let year = caps[3].parse::<u32>().ok();
        if let (Some(d), Some(m), Some(y)) = (day, month, year) {
            if let Some(date) = NaiveDate::from_ymd_opt(y as i32, m, d) {
                let m0 = caps.get(0).unwrap();
                let time = time_after(&normalised, m0.end());
                entities.push(DateEntity {
                    text: m0.as_str().to_string(),
                    start: m0.start(),
                    end: m0.end(),
                    kind: DateKind::Explicit,
                    date: Some(date),
                    time,
                });
                covered.push((m0.start(), m0.end()));
            }
        }
    }
    for caps in dmonth.captures_iter(&normalised) {
        let day = caps[1].parse::<u32>().ok();
        let month = month_number(&caps[2]);
        let year = caps[3].parse::<u32>().ok();
        if let (Some(d), Some(m), Some(y)) = (day, month, year) {
            if let Some(date) = NaiveDate::from_ymd_opt(y as i32, m, d) {
                let m0 = caps.get(0).unwrap();
                let time = time_after(&normalised, m0.end());
                entities.push(DateEntity {
                    text: m0.as_str().to_string(),
                    start: m0.start(),
                    end: m0.end(),
                    kind: DateKind::Explicit,
                    date: Some(date),
                    time,
                });
                covered.push((m0.start(), m0.end()));
            }
        }
    }
    for caps in monthd.captures_iter(&normalised) {
        let month = month_number(&caps[1]);
        let day = caps[2].parse::<u32>().ok();
        let year = caps[3].parse::<u32>().ok();
        if let (Some(d), Some(m), Some(y)) = (day, month, year) {
            if let Some(date) = NaiveDate::from_ymd_opt(y as i32, m, d) {
                let m0 = caps.get(0).unwrap();
                let time = time_after(&normalised, m0.end());
                entities.push(DateEntity {
                    text: m0.as_str().to_string(),
                    start: m0.start(),
                    end: m0.end(),
                    kind: DateKind::Explicit,
                    date: Some(date),
                    time,
                });
                covered.push((m0.start(), m0.end()));
            }
        }
    }
    for caps in ymd.captures_iter(&normalised) {
        let year = caps[1].parse::<u32>().ok();
        let month = caps[2].parse::<u32>().ok();
        let day = caps[3].parse::<u32>().ok();
        if let (Some(d), Some(m), Some(y)) = (day, month, year) {
            if let Some(date) = NaiveDate::from_ymd_opt(y as i32, m, d) {
                let m0 = caps.get(0).unwrap();
                if covered
                    .iter()
                    .any(|(s, e)| m0.start() >= *s && m0.end() <= *e)
                {
                    continue;
                }
                entities.push(DateEntity {
                    text: m0.as_str().to_string(),
                    start: m0.start(),
                    end: m0.end(),
                    kind: DateKind::Explicit,
                    date: Some(date),
                    time: None,
                });
            }
        }
    }

    let relative = [
        ("on the next day", 1),
        ("the next day", 1),
        ("next day", 1),
        ("the following day", 1),
        ("following day", 1),
        ("on the previous day", -1),
        ("the previous day", -1),
        ("previous day", -1),
        ("the day before", -1),
        ("day before", -1),
    ];
    let lower = normalised.to_lowercase();
    let mut relative_hits: Vec<(usize, usize, i64)> = Vec::new();
    for (phrase, offset) in relative {
        for m in lower.match_indices(phrase) {
            relative_hits.push((m.0, m.0 + phrase.len(), offset));
        }
    }
    relative_hits.sort_by_key(|(s, _, _)| *s);
    let anchor_date = match (anchor.header, anchor.portal) {
        (Some(h), Some(p)) if h == p => Some(h),
        (Some(h), None) => Some(h),
        (None, Some(p)) => Some(p),
        _ => None,
    };
    let mut last_end = 0;
    for (start, end, offset) in relative_hits {
        if start < last_end {
            continue;
        }
        if covered.iter().any(|(s, e)| start < *e && end > *s) {
            continue;
        }
        last_end = end;
        let text = normalised[start..end].to_string();
        if conflict || anchor_date.is_none() {
            entities.push(DateEntity {
                text: text.clone(),
                start,
                end,
                kind: DateKind::Unresolved,
                date: None,
                time: None,
            });
            if !conflict {
                questions.push(format!(
                    "The document has a relative date but no header or portal date to anchor it. What date does \"{text}\" refer to?"
                ));
            }
        } else if let Some(base) = anchor_date {
            let date = base
                .checked_add_signed(chrono::Duration::days(offset))
                .unwrap_or(base);
            entities.push(DateEntity {
                text,
                start,
                end,
                kind: DateKind::Inferred,
                date: Some(date),
                time: None,
            });
        }
    }
    entities.sort_by_key(|e| e.start);
    entities.dedup_by(|a, b| a.start == b.start && a.end == b.end);
    DateExtraction {
        entities,
        questions,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityKind {
    Date,
    RelativeDate,
    CaseNumber,
    Cnr,
    Party,
    Amount,
    Provision,
    Citation,
    Negation,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Anchor {
    pub page: u32,
    pub line: u32,
    pub line_hash: String,
    pub rect: Rect,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Entity {
    pub kind: EntityKind,
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub anchor: Anchor,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<NaiveDate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_kind: Option<DateKind>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EntityExtraction {
    pub entities: Vec<Entity>,
    pub questions: Vec<String>,
}

/// The line a set of entities belongs to.
#[derive(Debug, Clone, Copy)]
pub struct LineRef<'a> {
    pub page: u32,
    pub line: u32,
    pub line_hash: &'a str,
    pub rect: Rect,
}

fn entity_rect(line: Rect, text: &str, start: usize, end: usize) -> Rect {
    if text.is_empty() {
        return line;
    }
    let total = text.len().max(1) as f32;
    let x = line.x + line.width * (start as f32 / total);
    let width = line.width * ((end.saturating_sub(start)) as f32 / total);
    Rect::new(x, line.y, width.max(1.0), line.height)
}

/// Rules-first entity extraction. Every entity carries the line anchor it came
/// from; dates also carry their explicit or inferred value (G rule 9).
pub fn extract_entities(
    text: &str,
    line: LineRef<'_>,
    parties: &[String],
    anchor: &DateAnchor,
) -> EntityExtraction {
    let normalised = normalise(text);
    let mut entities: Vec<Entity> = Vec::new();
    let mut questions: Vec<String> = Vec::new();
    let date_extraction = extract_dates(&normalised, anchor);
    questions.extend(date_extraction.questions.iter().cloned());
    for d in &date_extraction.entities {
        entities.push(Entity {
            kind: if d.kind == DateKind::Explicit {
                EntityKind::Date
            } else {
                EntityKind::RelativeDate
            },
            text: d.text.clone(),
            start: d.start,
            end: d.end,
            anchor: Anchor {
                page: line.page,
                line: line.line,
                line_hash: line.line_hash.to_string(),
                rect: entity_rect(line.rect, &normalised, d.start, d.end),
            },
            date: d.date,
            date_kind: Some(d.kind),
        });
    }
    let patterns = [
        (EntityKind::Cnr, r"\b[A-Z]{4}\d{12}\b"),
        (
            EntityKind::CaseNumber,
            r"(?i)\b(?:W\.?P\.?|C\.?W\.?P\.?|S\.?L\.?P\.?|Crl\.?\s*A\.?|C\.?A\.?|O\.?A\.?|M\.?A\.?|I\.?A\.?)\s*(?:No\.?)?\s*[\d/]+(?:/\d{4})?\b",
        ),
        (
            EntityKind::Amount,
            r"(?i)(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d+)?",
        ),
        (
            EntityKind::Provision,
            r"(?i)\b(?:Section|Sec\.?|Article|Art\.?|Rule|Order|Clause|Schedule)\s+[0-9IVXLC]+[A-Za-z()]*\b",
        ),
        (
            EntityKind::Citation,
            r"\b\d{4}\s+INSC\s+\d+\b|\b(?:AIR|SCC|SCR)\s+\d+\b",
        ),
        (
            EntityKind::Negation,
            r"(?i)\b(?:not|no|never|nor|without|nothing|none|neither|cannot|can't|n't|मत|न|नहीं|बिना)\b",
        ),
    ];
    for (kind, pattern) in patterns {
        let re = Regex::new(pattern).expect("an entity regex");
        for m in re.find_iter(&normalised) {
            if entities
                .iter()
                .any(|e| e.start == m.start() && e.end == m.end())
            {
                continue;
            }
            entities.push(Entity {
                kind,
                text: m.as_str().to_string(),
                start: m.start(),
                end: m.end(),
                anchor: Anchor {
                    page: line.page,
                    line: line.line,
                    line_hash: line.line_hash.to_string(),
                    rect: entity_rect(line.rect, &normalised, m.start(), m.end()),
                },
                date: None,
                date_kind: None,
            });
        }
    }
    for party in parties {
        let Ok(re) = Regex::new(&format!("(?i){}", regex::escape(party))) else {
            continue;
        };
        for m in re.find_iter(&normalised) {
            if entities
                .iter()
                .any(|e| e.start == m.start() && e.end == m.end())
            {
                continue;
            }
            entities.push(Entity {
                kind: EntityKind::Party,
                text: m.as_str().to_string(),
                start: m.start(),
                end: m.end(),
                anchor: Anchor {
                    page: line.page,
                    line: line.line,
                    line_hash: line.line_hash.to_string(),
                    rect: entity_rect(line.rect, &normalised, m.start(), m.end()),
                },
                date: None,
                date_kind: None,
            });
        }
    }
    entities.sort_by_key(|e| e.start);
    EntityExtraction {
        entities,
        questions,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LineVersion {
    pub page: u32,
    pub line: u32,
    pub line_hash: String,
    pub engine_version: String,
}

/// Map every old line hash to the new line hash at the same page and line
/// index. Anchors on the old lines stay resolvable (G-AC-12).
pub fn map_line_versions(old: &[LineVersion], new: &[LineVersion]) -> HashMap<String, String> {
    let mut by_position: HashMap<(u32, u32), String> = HashMap::new();
    for line in new {
        by_position
            .entry((line.page, line.line))
            .or_insert_with(|| line.line_hash.clone());
    }
    let mut mapping = HashMap::new();
    for line in old {
        if let Some(new_hash) = by_position.get(&(line.page, line.line)) {
            mapping.insert(line.line_hash.clone(), new_hash.clone());
        }
    }
    mapping
}

pub fn resolve_anchor(old: &[LineVersion], new: &[LineVersion], hash: &str) -> Option<String> {
    let mapping = map_line_versions(old, new);
    mapping.get(hash).cloned().or_else(|| {
        new.iter()
            .any(|l| l.line_hash == hash)
            .then(|| hash.to_string())
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PipelineState {
    Queued,
    Rasterising,
    Reading,
    Agreeing,
    Extracting,
    Done,
    NeedsReview,
    Failed,
}

impl PipelineState {
    pub fn next(self, disputes: bool) -> PipelineState {
        match self {
            PipelineState::Queued => PipelineState::Rasterising,
            PipelineState::Rasterising => PipelineState::Reading,
            PipelineState::Reading => PipelineState::Agreeing,
            PipelineState::Agreeing => PipelineState::Extracting,
            PipelineState::Extracting => {
                if disputes {
                    PipelineState::NeedsReview
                } else {
                    PipelineState::Done
                }
            }
            PipelineState::NeedsReview | PipelineState::Done | PipelineState::Failed => self,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pipeline {
    pub doc: String,
    pub state: PipelineState,
    pub pages: usize,
    pub disputes: usize,
}

impl Pipeline {
    pub fn new(doc: impl Into<String>, pages: usize) -> Self {
        Pipeline {
            doc: doc.into(),
            state: PipelineState::Queued,
            pages,
            disputes: 0,
        }
    }

    pub fn advance(&mut self) {
        self.state = self.state.next(self.disputes > 0);
    }
}

/// Bounded batches keep a 1,500 page record inside a fixed memory ceiling
/// (G-AC-14).
pub fn bounded_batches<T>(items: &[T], batch_size: usize) -> impl Iterator<Item = &[T]> {
    items.chunks(batch_size.max(1))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GoldLine {
    pub text: String,
    pub critical_tokens: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AccuracyReport {
    pub engine_a: f64,
    pub engine_b: f64,
    pub agreed: f64,
}

fn accuracy_for(reading: &str, gold: &GoldLine) -> f64 {
    if gold.critical_tokens.is_empty() {
        return 1.0;
    }
    let normalised = normalise(reading);
    let tokens: Vec<String> = normalised
        .split_whitespace()
        .map(|t| t.to_lowercase())
        .collect();
    let matched = gold
        .critical_tokens
        .iter()
        .filter(|critical| {
            let c = normalise(critical).to_lowercase();
            tokens.contains(&c)
        })
        .count();
    matched as f64 / gold.critical_tokens.len() as f64
}

pub fn critical_token_accuracy(
    engine_a: &str,
    engine_b: &str,
    agreed: &str,
    gold: &GoldLine,
) -> AccuracyReport {
    AccuracyReport {
        engine_a: accuracy_for(engine_a, gold),
        engine_b: accuracy_for(engine_b, gold),
        agreed: accuracy_for(agreed, gold),
    }
}

/// A change fails CI when the new accuracy falls below the baseline by more
/// than the allowed tolerance (G-AC-13).
pub fn regression_fails(new: f64, baseline: f64, tolerance: f64) -> bool {
    new + tolerance < baseline
}

#[derive(Debug, Error)]
pub enum OcrError {
    #[error("the engine {0} is not available")]
    EngineMissing(String),
    #[error("the engine {0} failed: {1}")]
    EngineFailed(String, String),
    #[error("the engine {0} timed out")]
    EngineTimeout(String),
    #[error("the engine output was not valid JSON: {0}")]
    InvalidOutput(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineJob {
    pub doc: String,
    pub page: u32,
    pub image_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_layer: Option<String>,
    /// Test-only failure injection. Never set by the application.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fail_mode: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EngineFailure {
    pub kind: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EngineRun {
    pub engine: String,
    pub version: String,
    pub model_hash: String,
    pub lines: Vec<Reading>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure: Option<EngineFailure>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EngineOutput {
    pub engine: String,
    pub version: String,
    pub model_hash: String,
    pub lines: Vec<RawLine>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RawLine {
    pub text: String,
    pub confidence: f32,
    #[serde(default)]
    pub words: Vec<Word>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PageRun {
    pub born_digital: bool,
    pub readings: Vec<Reading>,
    pub failures: Vec<EngineFailure>,
}

/// Run one engine as a separate OS process. The engine reads a job file and
/// writes structured output; a crash, a malformed output or a timeout is a
/// recorded failure, never a panic in this process (G-AC-01, G-AC-02).
pub fn run_engine(
    program: &Path,
    job: &EngineJob,
    work_dir: &Path,
    timeout: Duration,
) -> EngineRun {
    let engine = program
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "engine".into());
    let safe_engine: String = engine
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let job_path = work_dir.join(format!("job-{}-{safe_engine}.json", job.page));
    let out_path = work_dir.join(format!("out-{}-{safe_engine}.json", job.page));
    let empty = |failure: EngineFailure| EngineRun {
        engine: engine.clone(),
        version: "unknown".into(),
        model_hash: "unknown".into(),
        lines: Vec::new(),
        failure: Some(failure),
    };
    let _ = std::fs::remove_file(&out_path);
    if let Err(e) = std::fs::create_dir_all(work_dir)
        .and_then(|_| std::fs::write(&job_path, serde_json::to_vec(job).unwrap_or_default()))
    {
        return empty(EngineFailure {
            kind: "raised".into(),
            detail: format!("could not prepare the engine job: {e}"),
        });
    }
    let mut child = match Command::new(program)
        .arg(&job_path)
        .arg(&out_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return empty(EngineFailure {
                kind: "tool_missing".into(),
                detail: format!("{engine}: {e}"),
            })
        }
    };
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return empty(EngineFailure {
                        kind: "raised".into(),
                        detail: format!("{engine} exited with {status}"),
                    });
                }
                break;
            }
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return empty(EngineFailure {
                        kind: "engine_timeout".into(),
                        detail: format!("{engine} exceeded {timeout:?}"),
                    });
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return empty(EngineFailure {
                    kind: "raised".into(),
                    detail: format!("{engine}: {e}"),
                });
            }
        }
    }
    let raw = match std::fs::read_to_string(&out_path)
        .map_err(|e| e.to_string())
        .and_then(|s| serde_json::from_str::<EngineOutput>(&s).map_err(|e| e.to_string()))
    {
        Ok(o) => o,
        Err(e) => {
            return empty(EngineFailure {
                kind: "raised".into(),
                detail: format!("{engine} wrote no usable structured output: {e}"),
            })
        }
    };
    let lines = raw
        .lines
        .into_iter()
        .map(|line| Reading {
            engine: raw.engine.clone(),
            engine_version: raw.version.clone(),
            model_hash: raw.model_hash.clone(),
            text: line.text,
            confidence: line.confidence,
            words: line.words,
        })
        .collect();
    EngineRun {
        engine: raw.engine,
        version: raw.version,
        model_hash: raw.model_hash,
        lines,
        failure: None,
    }
}

/// Run both engines on one page. A page with a usable text layer skips OCR
/// (G rule 2).
pub fn run_page(
    job: &EngineJob,
    engines: &[PathBuf],
    work_dir: &Path,
    timeout: Duration,
) -> PageRun {
    if let Some(layer) = &job.text_layer {
        if !layer.trim().is_empty() {
            return PageRun {
                born_digital: true,
                readings: vec![Reading {
                    engine: "pdfium".into(),
                    engine_version: "pdfium".into(),
                    model_hash: "sha256:pdfium-text-layer".into(),
                    text: layer.clone(),
                    confidence: 1.0,
                    words: Vec::new(),
                }],
                failures: Vec::new(),
            };
        }
    }
    let mut run = PageRun::default();
    for program in engines {
        let result = run_engine(program, job, work_dir, timeout);
        if let Some(failure) = result.failure {
            run.failures.push(failure);
        } else {
            run.readings.extend(result.lines);
        }
    }
    run
}

/// The stub engines read `<image_path>.<engine>.txt` and write structured JSON.
/// They exist so the process boundary, the timeout and the crash handling are
/// exercised without vendoring a model.
#[cfg(any(debug_assertions, test, feature = "test-doubles"))]
pub mod stub {
    use super::{EngineJob, EngineOutput, RawLine, Rect, Word};

    pub fn engine_main(engine: &str) {
        let args: Vec<String> = std::env::args().collect();
        if args.len() < 3 {
            eprintln!("usage: {engine} <job.json> <out.json>");
            std::process::exit(2);
        }
        let job: EngineJob = match std::fs::read_to_string(&args[1])
            .map_err(|e| e.to_string())
            .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
        {
            Ok(j) => j,
            Err(e) => {
                eprintln!("{engine}: could not read the job: {e}");
                std::process::exit(1);
            }
        };
        if job.fail_mode.as_deref() == Some("crash") {
            std::process::exit(7);
        }
        if job.fail_mode.as_deref() == Some("hang") {
            std::thread::sleep(std::time::Duration::from_secs(10));
        }
        let text = if let Some(layer) = &job.text_layer {
            layer.clone()
        } else {
            let sidecar = format!("{}.{engine}.txt", job.image_path);
            std::fs::read_to_string(sidecar).unwrap_or_default()
        };
        let lines = parse_stub_lines(&text, engine);
        let out = EngineOutput {
            engine: engine.to_string(),
            version: "stub-1.0".into(),
            model_hash: "sha256:stub-model".into(),
            lines,
        };
        if let Err(e) = std::fs::write(&args[2], serde_json::to_vec(&out).unwrap_or_default()) {
            eprintln!("{engine}: could not write structured output: {e}");
            std::process::exit(1);
        }
    }

    pub fn parse_stub_lines(text: &str, _engine: &str) -> Vec<RawLine> {
        text.lines()
            .enumerate()
            .filter(|(_, line)| !line.trim().is_empty())
            .map(|(index, line)| RawLine {
                text: line.to_string(),
                confidence: 0.95,
                words: stub_words(line, index as u32),
            })
            .collect()
    }

    fn stub_words(line: &str, line_index: u32) -> Vec<Word> {
        line.split_whitespace()
            .enumerate()
            .map(|(i, word)| Word {
                text: word.to_string(),
                rect: Rect::new(
                    i as f32 * 12.0,
                    line_index as f32 * 20.0,
                    (word.chars().count() as f32 * 7.0).max(4.0),
                    12.0,
                ),
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reading(engine: &str, text: &str) -> Reading {
        Reading {
            engine: engine.into(),
            engine_version: "v1".into(),
            model_hash: "sha256:m".into(),
            text: text.into(),
            confidence: 0.9,
            words: Vec::new(),
        }
    }

    #[test]
    fn normalisation_joins_hyphens_and_maps_devanagari_digits() {
        let text = "respondent-\ncount १२.०३.२०१९ ‘quoted’";
        assert_eq!(normalise(text), "respondentcount 12.03.2019 'quoted'");
    }

    #[test]
    fn g_ac_03_a_date_reading_disagreement_is_a_dispute() {
        let line = agree(
            1,
            1,
            Rect::zero(),
            reading("tesseract", "paid Rs. 1,50,000 on 12.03.2019"),
            reading("paddle", "paid Rs. 1,50,000 on 12.08.2019"),
            &[],
        );
        assert_eq!(line.agreement, Agreement::Disputed);
        assert!(line
            .disputed
            .iter()
            .any(|d| d.reading_a == "12.03.2019" && d.reading_b == "12.08.2019"));
    }

    #[test]
    fn g_ac_04_a_prose_edit_distance_of_one_is_not_a_dispute() {
        let line = agree(
            1,
            1,
            Rect::zero(),
            reading("tesseract", "the respondent filed the reply"),
            reading("paddle", "the respondcnt filed the reply"),
            &[],
        );
        assert_eq!(line.agreement, Agreement::Agreed);
    }

    #[test]
    fn g_ac_05_a_party_name_one_character_apart_is_a_dispute() {
        let line = agree(
            1,
            1,
            Rect::zero(),
            reading("tesseract", "Ramesh Kumar filed the reply"),
            reading("paddle", "Ramcsh Kumar filed the reply"),
            &["Ramesh Kumar".into()],
        );
        assert_eq!(line.agreement, Agreement::Disputed);
        assert!(line.disputed.iter().any(|d| d.reading_a == "Ramesh"));
    }

    #[test]
    fn g_ac_06_a_negation_reading_difference_is_a_dispute() {
        let line = agree(
            1,
            1,
            Rect::zero(),
            reading("tesseract", "the respondent did not appear"),
            reading("paddle", "the respondent did nut appear"),
            &[],
        );
        assert_eq!(line.agreement, Agreement::Disputed);
        assert!(line.disputed.iter().any(|d| d.reading_a == "not"));
    }

    #[test]
    fn g_ac_09_relative_dates_resolve_only_against_an_anchor() {
        let anchor = DateAnchor {
            header: NaiveDate::from_ymd_opt(2020, 1, 10),
            portal: None,
        };
        let next = extract_dates("on the next day the matter was listed", &anchor);
        assert_eq!(next.entities.len(), 1);
        assert_eq!(next.entities[0].kind, DateKind::Inferred);
        assert_eq!(next.entities[0].date, NaiveDate::from_ymd_opt(2020, 1, 11));
        let thereafter = extract_dates("thereafter the matter was listed", &anchor);
        assert!(thereafter.entities.is_empty());
    }

    #[test]
    fn g_ac_10_portal_date_anchors_and_no_anchor_asks_one_question() {
        let portal = DateAnchor {
            header: None,
            portal: NaiveDate::from_ymd_opt(2020, 2, 3),
        };
        let next = extract_dates("on the next day the matter was listed", &portal);
        assert_eq!(next.entities[0].date, NaiveDate::from_ymd_opt(2020, 2, 4));
        let none = extract_dates(
            "on the next day the matter was listed",
            &DateAnchor::default(),
        );
        assert_eq!(none.questions.len(), 1);
        assert_eq!(none.entities[0].kind, DateKind::Unresolved);
    }

    #[test]
    fn g_ac_11_anchor_boxes_land_within_one_pixel() {
        let ocr = Rect::new(10.0, 20.0, 30.0, 12.0);
        let highlight = Rect::new(10.4, 20.2, 30.0, 12.0);
        assert!(within_one_pixel(&ocr, &highlight));
        let off = Rect::new(12.0, 20.0, 30.0, 12.0);
        assert!(!within_one_pixel(&ocr, &off));
    }

    #[test]
    fn g_ac_12_rerun_keeps_old_anchors_resolvable() {
        let old = vec![LineVersion {
            page: 1,
            line: 1,
            line_hash: "sha256:old".into(),
            engine_version: "v1".into(),
        }];
        let new = vec![LineVersion {
            page: 1,
            line: 1,
            line_hash: "sha256:new".into(),
            engine_version: "v2".into(),
        }];
        assert_eq!(
            resolve_anchor(&old, &new, "sha256:old"),
            Some("sha256:new".into())
        );
        assert_eq!(resolve_anchor(&old, &new, "sha256:gone"), None);
    }

    #[test]
    fn g_ac_13_gold_set_accuracy_is_reported_and_regression_fails() {
        let gold = GoldLine {
            text: "The respondent paid Rs. 1,50,000 on 12.03.2019".into(),
            critical_tokens: vec!["Rs.".into(), "1,50,000".into(), "12.03.2019".into()],
        };
        let good = critical_token_accuracy(
            "The respondent paid Rs. 1,50,000 on 12.03.2019",
            "The respondent paid Rs. 1,50,000 on 12.03.2019",
            "The respondent paid Rs. 1,50,000 on 12.03.2019",
            &gold,
        );
        assert!((good.agreed - 1.0).abs() < f64::EPSILON);
        let bad = critical_token_accuracy(
            "The respondent paid Rs. 1,50,000 on 12.08.2019",
            "The respondent paid Rs. 1,50,000 on 12.03.2019",
            "The respondent paid Rs. 1,50,000 on 12.08.2019",
            &gold,
        );
        assert!(bad.agreed < 1.0);
        assert!(regression_fails(bad.agreed, good.agreed, 0.01));
    }

    #[test]
    fn g_ac_14_batches_are_bounded() {
        let pages: Vec<u32> = (0..1500).collect();
        let batches: Vec<&[u32]> = bounded_batches(&pages, 20).collect();
        assert_eq!(batches.len(), 75);
        assert!(batches.iter().all(|b| b.len() <= 20));
    }

    #[test]
    fn entities_carry_an_anchor_and_dates() {
        let text = "Ramesh Kumar filed WP No. 123/2020 on 12.03.2019 for Rs. 1,50,000";
        let line = LineRef {
            page: 1,
            line: 2,
            line_hash: "sha256:line",
            rect: Rect::new(0.0, 40.0, 600.0, 12.0),
        };
        let entities =
            extract_entities(text, line, &["Ramesh Kumar".into()], &DateAnchor::default());
        assert!(entities
            .entities
            .iter()
            .any(|e| e.kind == EntityKind::Party));
        assert!(entities.entities.iter().any(|e| e.kind == EntityKind::Date));
        assert!(entities
            .entities
            .iter()
            .any(|e| e.kind == EntityKind::Amount));
        assert!(entities
            .entities
            .iter()
            .all(|e| e.anchor.line_hash == "sha256:line"));
    }

    #[test]
    fn a_pipeline_reaches_needs_review_when_a_line_is_disputed() {
        let mut pipeline = Pipeline::new("doc", 3);
        pipeline.disputes = 1;
        for _ in 0..5 {
            pipeline.advance();
        }
        assert_eq!(pipeline.state, PipelineState::NeedsReview);
    }
}

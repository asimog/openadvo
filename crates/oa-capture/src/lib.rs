//! Capture and ingest pure logic (spec F): format and readability detection,
//! classification, court codes, the fixture portal adapter contract, the
//! capture driver over a `BrowserPort`, email triage and text fingerprints.
//!
//! The kernel stores what this crate reports. No browser, no model and no
//! kernel is touched here, so the tests run with no external process.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// `sha256:{lowercase hex}` for bytes (docs/specs/README.md, "Identifiers").
pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    format!("sha256:{}", hex::encode(digest))
}

/// The format actually detected from magic bytes and structure, never from the
/// extension alone (F rule 8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActualFormat {
    Pdf,
    Docx,
    Xlsx,
    Pptx,
    Doc,
    Zip,
    Png,
    Jpeg,
    Tiff,
    Html,
    Text,
    Unknown,
}

impl ActualFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            ActualFormat::Pdf => "pdf",
            ActualFormat::Docx => "docx",
            ActualFormat::Xlsx => "xlsx",
            ActualFormat::Pptx => "pptx",
            ActualFormat::Doc => "doc",
            ActualFormat::Zip => "zip",
            ActualFormat::Png => "png",
            ActualFormat::Jpeg => "jpeg",
            ActualFormat::Tiff => "tiff",
            ActualFormat::Html => "html",
            ActualFormat::Text => "text",
            ActualFormat::Unknown => "unknown",
        }
    }

    pub fn extension_for(self) -> &'static str {
        match self {
            ActualFormat::Pdf => "pdf",
            ActualFormat::Docx => "docx",
            ActualFormat::Xlsx => "xlsx",
            ActualFormat::Pptx => "pptx",
            ActualFormat::Doc => "doc",
            ActualFormat::Zip => "zip",
            ActualFormat::Png => "png",
            ActualFormat::Jpeg => "jpg",
            ActualFormat::Tiff => "tiff",
            ActualFormat::Html => "html",
            ActualFormat::Text => "txt",
            ActualFormat::Unknown => "",
        }
    }
}

/// Honest readability. Encrypted and corrupt files get a review item, never a
/// silent skip (F rule 8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Readability {
    Readable,
    Encrypted,
    Corrupt,
    PartiallyReadable,
    Unsupported,
}

impl Readability {
    pub fn as_str(self) -> &'static str {
        match self {
            Readability::Readable => "readable",
            Readability::Encrypted => "encrypted",
            Readability::Corrupt => "corrupt",
            Readability::PartiallyReadable => "partially_readable",
            Readability::Unsupported => "unsupported",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FormatReport {
    pub actual: ActualFormat,
    pub readability: Readability,
    pub extension_mismatch: bool,
    pub macro_bearing: bool,
    pub detail: Option<String>,
}

impl FormatReport {
    pub fn to_json(&self) -> Value {
        json!({
            "actual": self.actual.as_str(),
            "readability": self.readability.as_str(),
            "extension_mismatch": self.extension_mismatch,
            "macro_bearing": self.macro_bearing,
            "detail": self.detail,
        })
    }
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty() && haystack.windows(needle.len()).any(|w| w == needle)
}

fn extension(file_name: &str) -> Option<String> {
    let name = file_name.rsplit(['/', '\\']).next().unwrap_or(file_name);
    let (_, ext) = name.rsplit_once('.')?;
    if ext.is_empty() {
        None
    } else {
        Some(ext.to_ascii_lowercase())
    }
}

fn expected_format(ext: &str) -> Option<ActualFormat> {
    Some(match ext {
        "pdf" => ActualFormat::Pdf,
        "docx" => ActualFormat::Docx,
        "xlsx" | "xlsm" => ActualFormat::Xlsx,
        "pptx" => ActualFormat::Pptx,
        "doc" => ActualFormat::Doc,
        "zip" => ActualFormat::Zip,
        "png" => ActualFormat::Png,
        "jpg" | "jpeg" => ActualFormat::Jpeg,
        "tif" | "tiff" => ActualFormat::Tiff,
        "html" | "htm" => ActualFormat::Html,
        "txt" | "md" | "text" => ActualFormat::Text,
        _ => return None,
    })
}

fn looks_like_html(bytes: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(512)])
        .trim_start()
        .to_ascii_lowercase();
    head.starts_with("<!doctype html")
        || head.starts_with("<html")
        || head.starts_with("<body")
        || head.contains("<html")
}

/// Detects the actual format from the bytes and compares it with the name.
pub fn detect_format(file_name: &str, bytes: &[u8]) -> FormatReport {
    let ext = extension(file_name);
    let mut macro_bearing = false;
    let mut detail: Option<String> = None;

    let (actual, readability) = if bytes.is_empty() {
        (ActualFormat::Unknown, Readability::Corrupt)
    } else if bytes.starts_with(b"%PDF-") {
        let encrypted = contains(bytes, b"/Encrypt");
        if encrypted {
            (ActualFormat::Pdf, Readability::Encrypted)
        } else if !contains(bytes, b"%%EOF") {
            (ActualFormat::Pdf, Readability::PartiallyReadable)
        } else {
            (ActualFormat::Pdf, Readability::Readable)
        }
    } else if is_zip(bytes) {
        let names = [
            (b"word/document.xml".as_slice(), ActualFormat::Docx),
            (b"xl/workbook.xml".as_slice(), ActualFormat::Xlsx),
            (b"ppt/presentation.xml".as_slice(), ActualFormat::Pptx),
        ];
        let found = names.iter().find(|(needle, _)| contains(bytes, needle));
        if contains(bytes, b"vbaProject.bin") {
            macro_bearing = true;
            detail = Some("macro-bearing Office file; imported as bytes".into());
        }
        match found {
            Some((_, format)) => (*format, Readability::Readable),
            None => (ActualFormat::Zip, Readability::Readable),
        }
    } else if bytes.starts_with(&[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) {
        (ActualFormat::Doc, Readability::Readable)
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        (ActualFormat::Png, Readability::Readable)
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        (ActualFormat::Jpeg, Readability::Readable)
    } else if bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*") {
        (ActualFormat::Tiff, Readability::Readable)
    } else if looks_like_html(bytes) {
        (ActualFormat::Html, Readability::Readable)
    } else if std::str::from_utf8(bytes).is_ok()
        && !bytes.contains(&0)
        && printable_ratio(bytes) > 0.9
    {
        (ActualFormat::Text, Readability::Readable)
    } else {
        (ActualFormat::Unknown, Readability::Unsupported)
    };

    let extension_mismatch = match (&ext, actual) {
        (Some(e), a) => expected_format(e).is_some_and(|expected| expected != a),
        (None, _) => false,
    };
    if extension_mismatch && detail.is_none() {
        detail = Some(format!(
            "the name says {ext:?} but the bytes are {}",
            actual.as_str()
        ));
    }

    FormatReport {
        actual,
        readability,
        extension_mismatch,
        macro_bearing,
        detail,
    }
}

fn is_zip(bytes: &[u8]) -> bool {
    bytes.starts_with(b"PK\x03\x04")
        || bytes.starts_with(b"PK\x05\x06")
        || bytes.starts_with(b"PK\x07\x08")
}

fn printable_ratio(bytes: &[u8]) -> f64 {
    let printable = bytes
        .iter()
        .filter(|b| {
            let b = **b;
            b == b'\n' || b == b'\r' || b == b'\t' || (0x20..=0x7E).contains(&b)
        })
        .count();
    printable as f64 / bytes.len() as f64
}

/// A rule-first document suggestion. A wrong class costs a review item, not a
/// reroute (F rule 9).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Classification {
    pub document_type: &'static str,
    pub legal_category: &'static str,
    pub confidence: &'static str,
    pub review: bool,
}

pub fn propose_class(file_name: &str, text: &str) -> Classification {
    let name = file_name.to_ascii_lowercase();
    let body = text.to_ascii_lowercase();
    let hay = format!("{name} {body}");

    let document_type = if hay.contains("vakalatnama") {
        "vakalatnama"
    } else if hay.contains("affidavit") {
        "affidavit"
    } else if hay.contains("judgment") || hay.contains("judgement") {
        "judgment"
    } else if hay.contains("petition") {
        "petition"
    } else if hay.contains("memo") {
        "memo"
    } else if hay.contains("annexure") {
        "annexure"
    } else if hay.contains("receipt") {
        "receipt"
    } else if hay.contains("order") {
        "order"
    } else if hay.contains("evidence") || hay.contains("exhibit") {
        "evidence"
    } else {
        "other"
    };

    let legal_category = if hay.contains("criminal")
        || hay.contains("bail")
        || hay.contains("conviction")
        || hay.contains("sessions")
    {
        "criminal"
    } else if hay.contains("writ") || hay.contains("article 226") || hay.contains("article 32") {
        "writ"
    } else if hay.contains("civil") || hay.contains("suit") || hay.contains("decree") {
        "civil"
    } else {
        "unknown"
    };

    let confident = document_type != "other" && legal_category != "unknown";
    Classification {
        document_type,
        legal_category,
        confidence: if confident { "medium" } else { "low" },
        review: !confident,
    }
}

/// A court code kept as `{scheme, code, label}` with the label verbatim, never
/// renumbered (F rule 10, RQ-50).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CourtCode {
    pub scheme: String,
    pub code: String,
    pub label: String,
}

impl CourtCode {
    pub fn new(
        scheme: impl Into<String>,
        code: impl Into<String>,
        label: impl Into<String>,
    ) -> Self {
        CourtCode {
            scheme: scheme.into(),
            code: code.into(),
            label: label.into(),
        }
    }

    /// The value sent back to the portal is the code, never the label.
    pub fn search_value(&self) -> &str {
        &self.code
    }

    pub fn to_json(&self) -> Value {
        json!({ "scheme": self.scheme, "code": self.code, "label": self.label })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Codebook {
    pub scheme: String,
    pub version: String,
    pub codes: Vec<CourtCode>,
}

impl Codebook {
    pub fn to_json(&self) -> Value {
        json!({
            "scheme": self.scheme,
            "version": self.version,
            "codes": self.codes.iter().map(CourtCode::to_json).collect::<Vec<_>>(),
        })
    }
}

pub fn round_trip_code(code: &CourtCode) -> Result<CourtCode, String> {
    let wire = serde_json::to_string(&code.to_json()).map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(&wire).map_err(|e| e.to_string())?;
    let back: CourtCode = serde_json::from_value(value)
        .map_err(|e| format!("court code does not round trip: {e}"))?;
    if back.code != code.code {
        return Err("the code changed in the round trip".into());
    }
    Ok(back)
}

/// Fixture portal pages (recorded from the Supreme Court case-status shape).
pub const SC_CASE_OK: &str = include_str!("../fixtures/sc_case_ok.html");
pub const SC_CASE_CHANGED: &str = include_str!("../fixtures/sc_case_changed.html");
pub const SC_CAPTCHA: &str = include_str!("../fixtures/sc_captcha.html");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageKind {
    CaseOrders,
    Captcha,
    Unknown,
}

pub fn page_kind(html: &str) -> PageKind {
    if html.contains("id=\"captcha-form\"") || html.contains("id=\"captcha-input\"") {
        PageKind::Captcha
    } else if html.contains("id=\"case-orders\"") {
        PageKind::CaseOrders
    } else {
        PageKind::Unknown
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortalOrder {
    pub url: String,
    pub date: Option<String>,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AdapterError {
    Captcha,
    Degraded(String),
}

impl AdapterError {
    pub fn reason(&self) -> &str {
        match self {
            AdapterError::Captcha => "captcha_pending",
            AdapterError::Degraded(_) => "adapter_degraded",
        }
    }
}

fn attr(fragment: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=\"");
    let start = fragment.find(&needle)? + needle.len();
    let rest = &fragment[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

/// Parses the recorded case-status shape. Any other shape is refused with
/// `adapter_degraded`, never guessed (F rule 12, RQ-41).
pub fn parse_case_listing(html: &str) -> Result<Vec<PortalOrder>, AdapterError> {
    match page_kind(html) {
        PageKind::Captcha => return Err(AdapterError::Captcha),
        PageKind::Unknown => {
            return Err(AdapterError::Degraded(
                "the case-status page no longer has id=\"case-orders\"".into(),
            ))
        }
        PageKind::CaseOrders => {}
    }
    let mut orders = Vec::new();
    for fragment in html.split("<tr").skip(1) {
        let tag_end = fragment.find('>').unwrap_or(fragment.len());
        let tag = &fragment[..tag_end];
        if !tag.contains("class=\"order\"") {
            continue;
        }
        let Some(url) = attr(tag, "data-href") else {
            return Err(AdapterError::Degraded(
                "an order row has no data-href".into(),
            ));
        };
        let label = attr(tag, "data-label").unwrap_or_else(|| "Order".into());
        orders.push(PortalOrder {
            url,
            date: attr(tag, "data-date"),
            label,
        });
    }
    Ok(orders)
}

/// The CI contract test for the fixture portal. It fails on a changed shape.
pub fn contract_test(html: &str) -> Result<Vec<PortalOrder>, AdapterError> {
    let orders = parse_case_listing(html)?;
    if orders.is_empty() {
        return Err(AdapterError::Degraded(
            "the case-status table has no order rows".into(),
        ));
    }
    Ok(orders)
}

/// Fixture lower-court search results. Stub until the portal adapter (M)
/// drives the real search; the shape is the facts the search form takes.
pub const SC_LOWER_COURT: &str = include_str!("../fixtures/sc_lower_court.html");

/// The facts the portal's lower-court search takes (RQ-62). Codes are sent,
/// never labels.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LowerCourtQuery {
    pub court_type: String,
    pub state: String,
    pub bench: String,
    pub case_type: String,
    pub number: String,
    pub year: String,
    pub order_date: String,
    pub cnr: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LowerCourtCase {
    pub court_type: String,
    pub state: String,
    pub bench: String,
    pub case_type: String,
    pub number: String,
    pub year: String,
    pub order_date: String,
    pub cnr: Option<String>,
    pub title: String,
}

/// Runs a lower-court search against a results page: the rows that match
/// every fact given, and the CNR when the query has one.
pub fn search_lower_court(
    html: &str,
    query: &LowerCourtQuery,
) -> Result<Vec<LowerCourtCase>, AdapterError> {
    if page_kind(html) == PageKind::Captcha {
        return Err(AdapterError::Captcha);
    }
    if !html.contains("id=\"lower-court-results\"") {
        return Err(AdapterError::Degraded(
            "the lower-court search page no longer has id=\"lower-court-results\"".into(),
        ));
    }
    let mut out = Vec::new();
    for fragment in html.split("<tr").skip(1) {
        let tag = &fragment[..fragment.find('>').unwrap_or(fragment.len())];
        if !tag.contains("class=\"case\"") {
            continue;
        }
        let get = |n: &str| attr(tag, n).unwrap_or_default();
        let case = LowerCourtCase {
            court_type: get("data-court-type"),
            state: get("data-state"),
            bench: get("data-bench"),
            case_type: get("data-case-type"),
            number: get("data-number"),
            year: get("data-year"),
            order_date: get("data-order-date"),
            cnr: attr(tag, "data-cnr"),
            title: get("data-title"),
        };
        let facts_match = case.court_type == query.court_type
            && case.state == query.state
            && case.bench == query.bench
            && case.case_type == query.case_type
            && case.number == query.number
            && case.year == query.year
            && case.order_date == query.order_date;
        let cnr_match = query.cnr.is_none() || query.cnr == case.cnr;
        if facts_match && cnr_match {
            out.push(case);
        }
    }
    Ok(out)
}

/// Runtime health from the page that was actually served.
pub fn health_state(html: &str) -> (&'static str, Option<String>) {
    match page_kind(html) {
        PageKind::Captcha => ("captcha_pending", None),
        PageKind::CaseOrders => match contract_test(html) {
            Ok(_) => ("healthy", None),
            Err(AdapterError::Degraded(detail)) => ("degraded", Some(detail)),
            Err(AdapterError::Captcha) => ("captcha_pending", None),
        },
        PageKind::Unknown => (
            "degraded",
            Some("the case-status page no longer has id=\"case-orders\"".into()),
        ),
    }
}

/// The advocate's gesture that started or authorised a capture.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Gesture {
    pub kind: String,
    pub at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureState {
    Pending,
    CaptchaPending,
    LoginPending,
    Completed,
    Failed,
    Abandoned,
}

impl CaptureState {
    pub fn as_str(self) -> &'static str {
        match self {
            CaptureState::Pending => "pending",
            CaptureState::CaptchaPending => "captcha_pending",
            CaptureState::LoginPending => "login_pending",
            CaptureState::Completed => "completed",
            CaptureState::Failed => "failed",
            CaptureState::Abandoned => "abandoned",
        }
    }
}

/// The visible browser, as the driver needs it. The real implementation is M;
/// tests use a fixture port.
pub trait BrowserPort {
    fn navigate(&mut self, url: &str) -> Result<(), String>;
    fn current_url(&self) -> String;
    fn page_html(&self) -> String;
    fn focus(&mut self) -> Result<(), String>;
    fn fill(&mut self, selector: &str, value: &str) -> Result<(), String>;
    fn download(&mut self, url: &str) -> Result<Vec<u8>, String>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct CapturedDocument {
    pub order: PortalOrder,
    pub bytes: Vec<u8>,
    pub format: FormatReport,
}

/// Drives one solved portal session. It never fills the CAPTCHA field: the
/// advocate does that, and `solve_captcha` records the gesture (F rule 5).
pub struct CaptureDriver<P: BrowserPort> {
    port: P,
    state: CaptureState,
    gesture: Option<Gesture>,
    solves: u32,
    typed: Vec<(String, String)>,
}

impl<P: BrowserPort> CaptureDriver<P> {
    pub fn new(port: P) -> Self {
        CaptureDriver {
            port,
            state: CaptureState::Pending,
            gesture: None,
            solves: 0,
            typed: Vec::new(),
        }
    }

    pub fn state(&self) -> CaptureState {
        self.state
    }

    pub fn gesture(&self) -> Option<&Gesture> {
        self.gesture.as_ref()
    }

    pub fn captcha_solves(&self) -> u32 {
        self.solves
    }

    pub fn typed(&self) -> &[(String, String)] {
        &self.typed
    }

    pub fn port(&mut self) -> &mut P {
        &mut self.port
    }

    /// Opens the case status page. A CAPTCHA or login hands off to the
    /// advocate and focuses the visible browser; it never types into the field.
    pub fn begin_case(&mut self, url: &str) -> Result<(), String> {
        self.port.navigate(url)?;
        match page_kind(&self.port.page_html()) {
            PageKind::Captcha => {
                self.port.focus()?;
                self.state = CaptureState::CaptchaPending;
                Ok(())
            }
            PageKind::CaseOrders => {
                self.state = CaptureState::Pending;
                Ok(())
            }
            PageKind::Unknown => {
                self.state = CaptureState::Failed;
                Err("adapter_degraded".into())
            }
        }
    }

    /// Records the advocate's completion gesture. The driver does not touch
    /// the CAPTCHA field itself.
    pub fn solve_captcha(&mut self, gesture: Gesture) -> Result<(), String> {
        if self.state != CaptureState::CaptchaPending {
            return Err("the capture is not waiting for a CAPTCHA".into());
        }
        self.gesture = Some(gesture);
        self.state = CaptureState::Pending;
        self.solves += 1;
        Ok(())
    }

    /// Captures the listing and every order document in one session.
    pub fn capture_case(&mut self, url: &str) -> Result<Vec<CapturedDocument>, String> {
        self.begin_case(url)?;
        if self.state == CaptureState::CaptchaPending {
            return Err("captcha_pending".into());
        }
        self.download_listing()
    }

    /// Continues after the advocate solved the CAPTCHA, reusing the session.
    pub fn resume_case(&mut self) -> Result<Vec<CapturedDocument>, String> {
        if self.state == CaptureState::CaptchaPending {
            return Err("captcha_pending".into());
        }
        if self.solves == 0 {
            return Err("no solved session to reuse".into());
        }
        self.download_listing()
    }

    fn download_listing(&mut self) -> Result<Vec<CapturedDocument>, String> {
        let html = self.port.page_html();
        let orders = parse_case_listing(&html).map_err(|e| e.reason().to_string())?;
        let mut out = Vec::new();
        for order in orders {
            self.port.navigate(&order.url)?;
            if page_kind(&self.port.page_html()) == PageKind::Captcha {
                // A solved session should not ask again; if it does, ask the
                // advocate rather than attempt to solve it.
                self.port.focus()?;
                self.state = CaptureState::CaptchaPending;
                return Err("captcha_pending".into());
            }
            let bytes = self.port.download(&order.url)?;
            let format = detect_format(&order.label, &bytes);
            out.push(CapturedDocument {
                order,
                bytes,
                format,
            });
        }
        self.state = CaptureState::Completed;
        Ok(out)
    }
}

/// An email attachment that can be proposed for import. Email can only
/// propose; it never changes a permission or starts a filing (F rule 11).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImportProposal {
    pub message_id: String,
    pub attachment: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct EmailTriage {
    pub proposals: Vec<ImportProposal>,
    pub ignored_instructions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmailMessage {
    pub message_id: String,
    pub subject: String,
    pub body: String,
    pub attachments: Vec<String>,
}

pub fn triage_email(email: &EmailMessage) -> EmailTriage {
    let text = format!("{} {}", email.subject, email.body).to_ascii_lowercase();
    let mut ignored_instructions = Vec::new();
    for phrase in ["change permissions", "file the petition"] {
        if text.contains(phrase) {
            ignored_instructions.push(phrase.to_string());
        }
    }
    let proposals = email
        .attachments
        .iter()
        .map(|attachment| ImportProposal {
            message_id: email.message_id.clone(),
            attachment: attachment.clone(),
            reason: "email attachment; the advocate confirms the import".into(),
        })
        .collect();
    EmailTriage {
        proposals,
        ignored_instructions,
    }
}

/// The same text after OCR gets the same fingerprint, so two scans can be
/// compared without merging them (F rule 7, F-AC-10).
pub fn normalize_text(text: &str) -> String {
    text.replace("\r\n", "\n")
        .replace('\r', "\n")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub fn text_fingerprint(text: &str) -> String {
    sha256_hex(normalize_text(text).as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn docx_bytes(with_macro: bool) -> Vec<u8> {
        let mut bytes = b"PK\x03\x04\x14\x00\x00\x00".to_vec();
        bytes.extend_from_slice(b"[Content_Types].xml");
        bytes.extend_from_slice(b"word/document.xml");
        if with_macro {
            bytes.extend_from_slice(b"word/vbaProject.bin");
        }
        bytes
    }

    fn encrypted_pdf() -> Vec<u8> {
        let mut bytes = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n".to_vec();
        bytes.extend_from_slice(b"trailer\n<< /Encrypt 5 0 R >>\n%%EOF\n");
        bytes
    }

    #[test]
    fn f_ac_06_a_renamed_pdf_that_is_really_a_docx_is_a_docx() {
        let report = detect_format("order.pdf", &docx_bytes(false));
        assert_eq!(report.actual, ActualFormat::Docx);
        assert!(report.extension_mismatch, "the name and the bytes disagree");
        assert_eq!(report.readability, Readability::Readable);
    }

    #[test]
    fn f_ac_07_an_encrypted_pdf_is_encrypted_and_not_readable() {
        let report = detect_format("scan.pdf", &encrypted_pdf());
        assert_eq!(report.actual, ActualFormat::Pdf);
        assert_eq!(report.readability, Readability::Encrypted);
    }

    #[test]
    fn a_macro_bearing_docx_is_flagged() {
        let report = detect_format("reply.docx", &docx_bytes(true));
        assert!(report.macro_bearing);
        assert_eq!(report.actual, ActualFormat::Docx);
    }

    #[test]
    fn f_ac_08_a_changed_fixture_shape_fails_the_contract_and_degrades_health() {
        assert!(contract_test(SC_CASE_OK).is_ok());
        let err = contract_test(SC_CASE_CHANGED).unwrap_err();
        assert_eq!(err.reason(), "adapter_degraded");
        let (state, detail) = health_state(SC_CASE_CHANGED);
        assert_eq!(state, "degraded");
        assert!(detail.unwrap().contains("case-orders"));
    }

    #[test]
    fn f_ac_08_a_captcha_contract_state_is_honest() {
        let (state, detail) = health_state(SC_CAPTCHA);
        assert_eq!(state, "captcha_pending");
        assert!(detail.is_none());
    }

    #[derive(Debug, Clone)]
    struct FixturePort {
        page: String,
        url: String,
        focus_calls: usize,
        downloads: Vec<Vec<u8>>,
        typed: Vec<String>,
    }

    impl FixturePort {
        fn new(page: &str) -> Self {
            FixturePort {
                page: page.into(),
                url: String::new(),
                focus_calls: 0,
                downloads: vec![b"%PDF-1.7\n%%EOF\n".to_vec(); 3],
                typed: Vec::new(),
            }
        }
    }

    impl BrowserPort for FixturePort {
        fn navigate(&mut self, url: &str) -> Result<(), String> {
            self.url = url.to_string();
            Ok(())
        }

        fn current_url(&self) -> String {
            self.url.clone()
        }

        fn page_html(&self) -> String {
            self.page.clone()
        }

        fn focus(&mut self) -> Result<(), String> {
            self.focus_calls += 1;
            Ok(())
        }

        fn fill(&mut self, selector: &str, _value: &str) -> Result<(), String> {
            self.typed.push(selector.to_string());
            Ok(())
        }

        fn download(&mut self, _url: &str) -> Result<Vec<u8>, String> {
            Ok(self.downloads.remove(0))
        }
    }

    #[test]
    fn f_ac_04_a_captcha_pauses_capture_and_no_automation_types_into_it() {
        let mut driver = CaptureDriver::new(FixturePort::new(SC_CAPTCHA));
        driver.begin_case("https://sc.example/case").unwrap();
        assert_eq!(driver.state(), CaptureState::CaptchaPending);
        assert_eq!(driver.port().focus_calls, 1);
        assert!(driver.typed().is_empty(), "no input was sent to any field");
        assert!(driver.port().typed.is_empty());
    }

    #[test]
    fn f_ac_05_one_solved_session_captures_the_listing_and_all_orders() {
        let mut port = FixturePort::new(SC_CAPTCHA);
        let mut driver = CaptureDriver::new(port.clone());
        driver.begin_case("https://sc.example/case").unwrap();
        driver
            .solve_captcha(Gesture {
                kind: "focus_and_keypress".into(),
                at: "2026-11-04T00:00:00.000Z".into(),
            })
            .unwrap();
        // After the advocate solves it, the portal serves the listing.
        driver.port().page = SC_CASE_OK.into();
        let docs = driver.resume_case().unwrap();
        assert_eq!(driver.captcha_solves(), 1);
        assert_eq!(docs.len(), 3);
        assert_eq!(driver.state(), CaptureState::Completed);
        // Keep the original port binding used for the assertion above.
        port.focus_calls = driver.port().focus_calls;
        assert_eq!(port.focus_calls, 1);
    }

    #[test]
    fn f_ac_09_email_text_cannot_change_permissions_or_file_a_petition() {
        let email = EmailMessage {
            message_id: "m1".into(),
            subject: "Please change permissions".into(),
            body: "Also file the petition today.".into(),
            attachments: vec!["order.pdf".into()],
        };
        let triage = triage_email(&email);
        assert_eq!(triage.proposals.len(), 1, "only an import is proposed");
        assert_eq!(triage.proposals[0].attachment, "order.pdf");
        assert_eq!(triage.ignored_instructions.len(), 2);
        assert!(triage
            .ignored_instructions
            .iter()
            .any(|i| i.contains("change permissions")));
        assert!(triage
            .ignored_instructions
            .iter()
            .any(|i| i.contains("file the petition")));
    }

    #[test]
    fn f_ac_10_the_same_text_after_ocr_gets_the_same_fingerprint() {
        let scan_a = "IN THE SUPREME COURT\r\nOrder dated 1 March 2024";
        let scan_b = "  in the supreme court\n\nOrder dated 1 March 2024 ";
        assert_eq!(text_fingerprint(scan_a), text_fingerprint(scan_b));
        assert_ne!(
            text_fingerprint(scan_a),
            text_fingerprint("a different order")
        );
    }

    #[test]
    fn f_ac_11_a_court_code_round_trips_with_its_verbatim_label() {
        let code = CourtCode::new("supreme_court:list-2024-03", "WP", "Writ Petition (Civil)");
        let back = round_trip_code(&code).unwrap();
        assert_eq!(back.code, "WP");
        assert_eq!(back.label, "Writ Petition (Civil)");
        assert_eq!(code.search_value(), "WP");
    }

    #[test]
    fn classification_is_rule_first_and_a_miss_is_a_review() {
        let c = propose_class("order-2024.pdf", "IN THE SUPREME COURT criminal appeal");
        assert_eq!(c.document_type, "order");
        assert_eq!(c.legal_category, "criminal");
        let unknown = propose_class("scan.bin", "");
        assert_eq!(unknown.document_type, "other");
        assert!(unknown.review);
    }
}

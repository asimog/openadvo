//! The typed commands. Each has one name and one class (docs/specs/README.md,
//! "Command classes"). The serde tag is the wire name, and the JSON Schema
//! generated from these types is the protocol schema (spec B rule 1).

use std::path::PathBuf;

use oa_notebook::{ImpugnedOrder, ItemInput};
use oa_ocr::Reading;
use oa_types::CommandClass;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Bytes travel as base64 strings.
mod b64 {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(bytes: &[u8], s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&STANDARD.encode(bytes))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<u8>, D::Error> {
        let text = String::deserialize(d)?;
        STANDARD.decode(text).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum ClientSpec {
    None,
    Existing(String),
    /// A client not yet in firm data. Creating it needs the advocate's
    /// confirmation (RQ-87).
    New(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Attachment {
    pub file_name: String,
    #[serde(with = "b64")]
    #[schemars(with = "String")]
    pub bytes: Vec<u8>,
}

/// One court code as the portal issues it, with the label verbatim.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CourtCodeInput {
    pub scheme: String,
    pub code: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CodebookInput {
    pub scheme: String,
    pub version: String,
    pub codes: Vec<CourtCodeInput>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AdapterHealthInput {
    pub contract_state: String,
    pub runtime_state: String,
    pub detail: Option<String>,
}

/// What the browser supervisor hands the kernel for one capture. The file is
/// absent when the capture is still waiting for a CAPTCHA or login.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CaptureInput {
    pub file: Option<Attachment>,
    pub origin: String,
    pub url: String,
    pub final_url: String,
    pub captured_at: String,
    pub profile: String,
    pub gesture: String,
    pub portal_date: Option<String>,
    pub adapter: String,
    pub status: String,
    pub reason: Option<String>,
    pub health: Option<AdapterHealthInput>,
    pub codebook: Option<CodebookInput>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct OcrPageInput {
    pub page: u32,
    pub raster_hash: String,
    pub width: f32,
    pub height: f32,
    pub dpi: u32,
    pub text_layer: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct OcrEngineHealthInput {
    pub engine: String,
    pub version: String,
    pub model_hash: String,
    pub state: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct OcrReadingInput {
    pub page: u32,
    pub line: u32,
    pub reading: Reading,
}

/// The supervisor's raw readings. The kernel runs the agreement engine and
/// stores the canonical lines and disputes (G rule 5).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct OcrRunInput {
    pub pages: Vec<OcrPageInput>,
    pub readings: Vec<OcrReadingInput>,
    pub engine_health: Vec<OcrEngineHealthInput>,
}

/// A contact, organisation, counsel, court or bench (spec O01). For
/// `contacts.edit`, an empty name or kind and an absent field keep the
/// current value, and an empty field clears it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ContactInput {
    pub name: String,
    /// person, organisation, counsel, court or bench.
    pub kind: String,
    /// Required for a court or bench, for example `codebook:<scheme>/<code>`.
    pub source: Option<String>,
    pub organisation: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "command", content = "input")]
pub enum Request {
    #[serde(rename = "workspace.init")]
    WorkspaceInit { root: PathBuf },
    #[serde(rename = "matter.create")]
    MatterCreate {
        title: String,
        client: ClientSpec,
        from: Option<Attachment>,
    },
    #[serde(rename = "matter.confirm")]
    MatterConfirm { pending: String },
    #[serde(rename = "matter.list")]
    MatterList { include_removed: bool },
    #[serde(rename = "matter.open")]
    MatterOpen { id: String },
    #[serde(rename = "matter.archive")]
    MatterArchive { id: String },
    #[serde(rename = "matter.rename")]
    MatterRename { id: String, title: String },
    #[serde(rename = "matter.write_file")]
    MatterWriteFile {
        id: String,
        relpath: String,
        #[serde(with = "b64")]
        #[schemars(with = "String")]
        bytes: Vec<u8>,
    },
    #[serde(rename = "registry.rescan")]
    RegistryRescan,
    #[serde(rename = "settings.get")]
    SettingsGet { key: String },
    #[serde(rename = "settings.set")]
    SettingsSet { key: String, value: String },
    #[serde(rename = "job.list")]
    JobList,
    #[serde(rename = "job.show")]
    JobShow { id: String },
    #[serde(rename = "job.cancel")]
    JobCancel { id: String },

    #[serde(rename = "ledger.tail")]
    LedgerTail { matter: String, n: Option<u32> },
    #[serde(rename = "ledger.verify")]
    LedgerVerify { matter: String },
    #[serde(rename = "audit.rejected")]
    AuditRejected { matter: Option<String> },
    #[serde(rename = "audit.commands")]
    AuditCommands,

    #[serde(rename = "evidence.add")]
    EvidenceAdd {
        matter: String,
        file: Attachment,
        origin: String,
    },
    /// `oa import`: one or more files into a matter's evidence and ingest queue.
    #[serde(rename = "evidence.import")]
    EvidenceImport {
        matter: Option<String>,
        files: Vec<Attachment>,
    },
    /// Ingestion receives the OCR text and compares fingerprints (spec G hands
    /// this to spec F).
    #[serde(rename = "ingest.set_text")]
    IngestSetText {
        matter: String,
        evidence: String,
        text: String,
    },
    /// The browser supervisor's capture record. Refused from any other origin.
    #[serde(rename = "capture.commit")]
    CaptureCommit {
        matter: String,
        capture: Box<CaptureInput>,
    },
    #[serde(rename = "capture.status")]
    CaptureStatus,
    #[serde(rename = "ingest.status")]
    IngestStatus { doc: Option<String> },
    #[serde(rename = "evidence.duplicates")]
    EvidenceDuplicates { matter: String },
    #[serde(rename = "codebook.show")]
    CodebookShow { scheme: String },
    #[serde(rename = "adapter.health")]
    AdapterHealth,
    #[serde(rename = "ocr.run")]
    OcrRun {
        matter: String,
        doc: String,
        input: OcrRunInput,
    },
    #[serde(rename = "ocr.lines")]
    OcrLines {
        matter: String,
        doc: String,
        page: Option<u32>,
    },
    #[serde(rename = "ocr.pipeline")]
    OcrPipeline { matter: Option<String> },
    #[serde(rename = "ocr.disputes")]
    OcrDisputes {
        matter: Option<String>,
        doc: Option<String>,
    },
    #[serde(rename = "ocr.decide")]
    OcrDecide {
        matter: String,
        dispute: String,
        reading: String,
        text: Option<String>,
    },
    #[serde(rename = "ocr.typed_copy")]
    OcrTypedCopy {
        matter: String,
        doc: String,
        page: u32,
        text: String,
        typist: String,
    },
    #[serde(rename = "extract.entities")]
    ExtractEntities { matter: String, doc: String },
    #[serde(rename = "ocr.engines")]
    OcrEngines,
    #[serde(rename = "notebook.show")]
    NotebookShow {
        matter: String,
        section: Option<String>,
    },
    #[serde(rename = "notebook.item")]
    NotebookItem {
        matter: String,
        id: String,
        version: Option<u32>,
    },
    #[serde(rename = "notebook.facts")]
    NotebookFacts {
        matter: String,
        status: Option<String>,
    },
    #[serde(rename = "notebook.chronology")]
    NotebookChronology {
        matter: String,
        view: Option<String>,
        show_excluded: bool,
        /// Only the events a generated List of Dates may state (H rule 8).
        for_prose: bool,
    },
    #[serde(rename = "notebook.ready")]
    NotebookReady { matter: String },
    #[serde(rename = "notebook.conflicts")]
    NotebookConflicts { matter: String },
    #[serde(rename = "trace")]
    Trace { matter: String, id: String },
    /// A domain service's proposal (H02). The kernel resolves its anchors.
    #[serde(rename = "notebook.propose")]
    NotebookPropose {
        matter: String,
        item: Box<ItemInput>,
    },
    /// The extraction writer over one document's OCR lines.
    #[serde(rename = "notebook.extract")]
    NotebookExtract { matter: String, doc: String },
    #[serde(rename = "notebook.correct")]
    NotebookCorrect {
        matter: String,
        id: String,
        reason: String,
        item: Box<ItemInput>,
    },
    #[serde(rename = "notebook.exclude")]
    NotebookExclude {
        matter: String,
        view: String,
        event: Option<String>,
        category: Option<String>,
        restore: bool,
    },
    #[serde(rename = "notebook.impugned_set")]
    NotebookImpugnedSet {
        matter: String,
        order: ImpugnedOrder,
    },
    #[serde(rename = "notebook.confirm")]
    NotebookConfirm { matter: String, id: String },
    #[serde(rename = "notebook.skip")]
    NotebookSkip {
        matter: String,
        review: String,
        reason: String,
    },
    /// The advocate's answer to a document's date question (RQ-23).
    #[serde(rename = "notebook.date_anchor")]
    NotebookDateAnchor {
        matter: String,
        doc: String,
        date: String,
    },
    #[serde(rename = "evidence.list")]
    EvidenceList { matter: String },
    #[serde(rename = "evidence.show")]
    EvidenceShow { matter: String, id: String },

    #[serde(rename = "draft.create")]
    DraftCreate {
        matter: String,
        title: String,
        file: Attachment,
    },
    #[serde(rename = "draft.commit")]
    DraftCommit {
        matter: String,
        draft: String,
        base: String,
        file: Attachment,
        note: Option<String>,
    },
    #[serde(rename = "draft.list")]
    DraftList { matter: String },
    #[serde(rename = "draft.log")]
    DraftLog { matter: String, draft: String },
    #[serde(rename = "draft.show")]
    DraftShow { matter: String, rev: String },
    #[serde(rename = "draft.checkpoint")]
    DraftCheckpoint {
        matter: String,
        draft: String,
        name: String,
    },
    #[serde(rename = "draft.restore")]
    DraftRestore {
        matter: String,
        draft: String,
        checkpoint: String,
    },

    /// Opens a revision, an evidence document or a conversion in our viewer
    /// and returns the pane state (J01, J02).
    #[serde(rename = "view")]
    View {
        matter: String,
        target: String,
        page: Option<u32>,
    },
    /// The first revision of a generated draft (J04, J10).
    #[serde(rename = "draft.new")]
    DraftNew {
        matter: String,
        title: String,
        template: String,
        from_notebook: bool,
    },
    #[serde(rename = "draft.paragraphs")]
    DraftParagraphs { matter: String, rev: String },
    /// A proposal against a paragraph anchor (J03, RQ-27).
    #[serde(rename = "draft.propose")]
    DraftPropose {
        matter: String,
        draft: String,
        para: String,
        replace: String,
        reason: Option<String>,
        /// The agent turn that made the proposal, for the revision's author.
        turn: Option<String>,
    },
    /// The edit surface: pending proposals, or every proposal with `all`.
    #[serde(rename = "draft.proposals")]
    DraftProposals {
        matter: String,
        draft: Option<String>,
        all: bool,
    },
    #[serde(rename = "draft.accept")]
    DraftAccept { matter: String, proposal: String },
    #[serde(rename = "draft.reject")]
    DraftReject {
        matter: String,
        proposal: String,
        reason: Option<String>,
    },
    /// Reverts one agent edit as a new revision (RQ-27).
    #[serde(rename = "draft.revert")]
    DraftRevert {
        matter: String,
        draft: String,
        rev: String,
    },
    #[serde(rename = "draft.open_editor")]
    DraftOpenEditor { matter: String, draft: String },
    #[serde(rename = "draft.editor_status")]
    DraftEditorStatus { matter: String, draft: String },
    /// WordCraft's saved bytes, or its autosave after a crash, as a new
    /// revision (RQ-72).
    #[serde(rename = "draft.import_working_copy")]
    DraftImportWorkingCopy {
        matter: String,
        draft: String,
        autosave: bool,
    },
    #[serde(rename = "draft.diff")]
    DraftDiff {
        matter: String,
        a: String,
        b: String,
    },
    /// The Changes viewer (J15): every revision of a draft against its parent.
    #[serde(rename = "draft.changes")]
    DraftChanges { matter: String, draft: String },
    /// A review note anchored to a paragraph id (J15).
    #[serde(rename = "draft.note")]
    DraftNote {
        matter: String,
        draft: String,
        rev: String,
        para: String,
        text: String,
        to_agent: bool,
    },
    #[serde(rename = "draft.render")]
    DraftRender { matter: String, rev: String },
    /// The filing PDF/A (J13), from the approved head with clear gates.
    #[serde(rename = "filing.pdf")]
    FilingPdf {
        matter: String,
        rev: String,
        /// Evidence ids to annex, in order; J11 numbers them.
        annexures: Vec<String>,
    },
    #[serde(rename = "filing.conversions")]
    FilingConversions { matter: String },
    #[serde(rename = "fidelity.check")]
    FidelityCheck { matter: String, rev: String },
    /// A PDF for PdfCraft. The filing PDF is refused (J rule 13).
    #[serde(rename = "pdf.open_editor")]
    PdfOpenEditor { matter: String, target: String },

    #[serde(rename = "approval.request")]
    ApprovalRequest {
        matter: String,
        gate: String,
        target: String,
    },
    #[serde(rename = "approval.decide")]
    ApprovalDecide {
        matter: String,
        id: String,
        accept: bool,
        reason: String,
    },
    #[serde(rename = "approval.status")]
    ApprovalStatus {
        matter: String,
        gate: String,
        target: String,
    },

    #[serde(rename = "rules.pin")]
    RulesPin { matter: String },

    #[serde(rename = "inspect")]
    Inspect { matter: String, id: String },
    #[serde(rename = "links.out")]
    LinksOut { matter: String, id: String },
    #[serde(rename = "links.in")]
    LinksIn { matter: String, id: String },
    #[serde(rename = "settings.list")]
    SettingsList,
    #[serde(rename = "approval.list")]
    ApprovalList { matter: String },
    #[serde(rename = "outbox.list")]
    OutboxList {
        matter: String,
        state: Option<String>,
    },
    #[serde(rename = "outbox.reconcile")]
    OutboxReconcile {
        matter: String,
        id: String,
        outcome: String,
        detail: Option<String>,
    },
    #[serde(rename = "kernel.shutdown")]
    KernelShutdown,
    #[serde(rename = "find")]
    Find {
        matter: Option<String>,
        query: String,
        kinds: Vec<String>,
        filter: Option<String>,
    },

    /// Navigates in a profile (spec M). A download is intercepted and routed
    /// to the matter inbox: the profile's matter, or `matter` for the filing
    /// and agent profiles.
    #[serde(rename = "browser.open")]
    BrowserOpen {
        profile: String,
        url: String,
        matter: Option<String>,
    },
    #[serde(rename = "browser.state")]
    BrowserState { profile: Option<String> },
    #[serde(rename = "browser.dom")]
    BrowserDom {
        profile: Option<String>,
        selector: String,
    },
    /// Main text, links and tables, labelled untrusted, with URL and time.
    #[serde(rename = "browser.extract")]
    BrowserExtract { profile: Option<String> },
    #[serde(rename = "browser.screenshot")]
    BrowserScreenshot { profile: Option<String> },
    /// Lets the agent drive the matter's visible browser. Human only (RQ-81).
    #[serde(rename = "browser.attach")]
    BrowserAttach { matter: String },
    #[serde(rename = "browser.detach")]
    BrowserDetach,
    #[serde(rename = "browser.attachments")]
    BrowserAttachments,
    #[serde(rename = "browser.downloads")]
    BrowserDownloads { matter: Option<String> },
    /// The egress log: every connection per profile, allowed or refused.
    #[serde(rename = "browser.egress")]
    BrowserEgress {
        profile: Option<String>,
        refused: bool,
    },
    /// Opens DevTools for a profile. Refused in the filing profile (M05).
    #[serde(rename = "browser.devtools")]
    BrowserDevtools { profile: String },
    #[serde(rename = "contacts.list")]
    ContactsList { kind: Option<String> },
    #[serde(rename = "contacts.show")]
    ContactsShow { id: String },
    #[serde(rename = "contacts.add")]
    ContactsAdd { contact: ContactInput },
    #[serde(rename = "contacts.edit")]
    ContactsEdit { id: String, contact: ContactInput },
    #[serde(rename = "parties.list")]
    PartiesList { matter: String },
    #[serde(rename = "parties.set")]
    PartiesSet {
        matter: String,
        contact: String,
        role: String,
        /// The name as it appears in the record; defaults to the contact's.
        record_name: Option<String>,
    },
    /// A matter's or a contact's activity, computed from the ledger.
    #[serde(rename = "timeline")]
    Timeline {
        matter: Option<String>,
        contact: Option<String>,
    },
    /// Records a call, meeting or letter. It never sends anything.
    #[serde(rename = "correspondence.log")]
    CorrespondenceLog {
        matter: String,
        kind: String,
        summary: String,
        contact: Option<String>,
        occurred_at: Option<String>,
    },
}

impl Request {
    /// Every command name, in schema order. The registry the harness tools
    /// and the UI bind to (spec B rule 2).
    pub const NAMES: &'static [&'static str] = &[
        "workspace.init",
        "matter.create",
        "matter.confirm",
        "matter.list",
        "matter.open",
        "matter.archive",
        "matter.rename",
        "matter.write_file",
        "registry.rescan",
        "settings.get",
        "settings.set",
        "job.list",
        "job.show",
        "job.cancel",
        "ledger.tail",
        "ledger.verify",
        "audit.rejected",
        "audit.commands",
        "evidence.add",
        "evidence.import",
        "ingest.set_text",
        "capture.commit",
        "capture.status",
        "ingest.status",
        "evidence.duplicates",
        "codebook.show",
        "adapter.health",
        "ocr.run",
        "ocr.lines",
        "ocr.pipeline",
        "ocr.disputes",
        "ocr.decide",
        "ocr.typed_copy",
        "extract.entities",
        "ocr.engines",
        "notebook.show",
        "notebook.item",
        "notebook.facts",
        "notebook.chronology",
        "notebook.ready",
        "notebook.conflicts",
        "trace",
        "notebook.propose",
        "notebook.extract",
        "notebook.correct",
        "notebook.exclude",
        "notebook.impugned_set",
        "notebook.confirm",
        "notebook.skip",
        "notebook.date_anchor",
        "evidence.list",
        "evidence.show",
        "draft.create",
        "draft.commit",
        "draft.list",
        "draft.log",
        "draft.show",
        "draft.checkpoint",
        "draft.restore",
        "view",
        "draft.new",
        "draft.paragraphs",
        "draft.propose",
        "draft.proposals",
        "draft.accept",
        "draft.reject",
        "draft.revert",
        "draft.open_editor",
        "draft.editor_status",
        "draft.import_working_copy",
        "draft.diff",
        "draft.changes",
        "draft.note",
        "draft.render",
        "filing.pdf",
        "filing.conversions",
        "fidelity.check",
        "pdf.open_editor",
        "approval.request",
        "approval.decide",
        "approval.status",
        "rules.pin",
        "inspect",
        "links.out",
        "links.in",
        "settings.list",
        "approval.list",
        "outbox.list",
        "outbox.reconcile",
        "kernel.shutdown",
        "find",
        "browser.open",
        "browser.state",
        "browser.dom",
        "browser.extract",
        "browser.screenshot",
        "browser.attach",
        "browser.detach",
        "browser.attachments",
        "browser.downloads",
        "browser.egress",
        "browser.devtools",
        "contacts.list",
        "contacts.show",
        "contacts.add",
        "contacts.edit",
        "parties.list",
        "parties.set",
        "timeline",
        "correspondence.log",
    ];

    /// Every `query` class command. The shell's view registry must cover each
    /// one (A-AC-16); a kernel test keeps this list equal to `class()`.
    pub const QUERY_NAMES: &'static [&'static str] = &[
        "matter.list",
        "settings.get",
        "job.list",
        "job.show",
        "ledger.tail",
        "ledger.verify",
        "audit.rejected",
        "audit.commands",
        "outbox.list",
        "evidence.list",
        "evidence.show",
        "capture.status",
        "ingest.status",
        "evidence.duplicates",
        "codebook.show",
        "adapter.health",
        "ocr.lines",
        "ocr.pipeline",
        "ocr.disputes",
        "extract.entities",
        "ocr.engines",
        "notebook.show",
        "notebook.item",
        "notebook.facts",
        "notebook.chronology",
        "notebook.ready",
        "notebook.conflicts",
        "trace",
        "draft.list",
        "draft.log",
        "draft.show",
        "view",
        "draft.paragraphs",
        "draft.proposals",
        "draft.editor_status",
        "draft.diff",
        "draft.changes",
        "filing.conversions",
        "fidelity.check",
        "approval.status",
        "rules.pin",
        "inspect",
        "links.out",
        "links.in",
        "find",
        "settings.list",
        "approval.list",
        "browser.state",
        "browser.dom",
        "browser.extract",
        "browser.screenshot",
        "browser.attachments",
        "browser.downloads",
        "browser.egress",
        "contacts.list",
        "contacts.show",
        "parties.list",
        "timeline",
    ];

    /// The class of a command by wire name. Used by the tool registry, which
    /// lists commands without building a request.
    pub fn class_of_name(name: &str) -> Option<CommandClass> {
        if !Self::NAMES.contains(&name) {
            return None;
        }
        Some(if Self::QUERY_NAMES.contains(&name) {
            CommandClass::Query
        } else if matches!(
            name,
            "matter.confirm"
                | "approval.decide"
                | "ocr.decide"
                | "ocr.typed_copy"
                | "notebook.confirm"
                | "notebook.skip"
                | "notebook.date_anchor"
                | "draft.accept"
                | "draft.reject"
                | "browser.attach"
        ) {
            CommandClass::Human
        } else if name == "browser.open" {
            CommandClass::External
        } else {
            CommandClass::Internal
        })
    }

    pub fn name(&self) -> &'static str {
        match self {
            Request::WorkspaceInit { .. } => "workspace.init",
            Request::MatterCreate { .. } => "matter.create",
            Request::MatterConfirm { .. } => "matter.confirm",
            Request::MatterList { .. } => "matter.list",
            Request::MatterOpen { .. } => "matter.open",
            Request::MatterArchive { .. } => "matter.archive",
            Request::MatterRename { .. } => "matter.rename",
            Request::MatterWriteFile { .. } => "matter.write_file",
            Request::RegistryRescan => "registry.rescan",
            Request::SettingsGet { .. } => "settings.get",
            Request::SettingsSet { .. } => "settings.set",
            Request::JobList => "job.list",
            Request::JobShow { .. } => "job.show",
            Request::JobCancel { .. } => "job.cancel",
            Request::LedgerTail { .. } => "ledger.tail",
            Request::LedgerVerify { .. } => "ledger.verify",
            Request::AuditRejected { .. } => "audit.rejected",
            Request::AuditCommands => "audit.commands",
            Request::EvidenceAdd { .. } => "evidence.add",
            Request::EvidenceImport { .. } => "evidence.import",
            Request::IngestSetText { .. } => "ingest.set_text",
            Request::CaptureCommit { .. } => "capture.commit",
            Request::CaptureStatus => "capture.status",
            Request::IngestStatus { .. } => "ingest.status",
            Request::EvidenceDuplicates { .. } => "evidence.duplicates",
            Request::CodebookShow { .. } => "codebook.show",
            Request::AdapterHealth => "adapter.health",
            Request::OcrRun { .. } => "ocr.run",
            Request::OcrLines { .. } => "ocr.lines",
            Request::OcrPipeline { .. } => "ocr.pipeline",
            Request::OcrDisputes { .. } => "ocr.disputes",
            Request::OcrDecide { .. } => "ocr.decide",
            Request::OcrTypedCopy { .. } => "ocr.typed_copy",
            Request::ExtractEntities { .. } => "extract.entities",
            Request::OcrEngines => "ocr.engines",
            Request::NotebookShow { .. } => "notebook.show",
            Request::NotebookItem { .. } => "notebook.item",
            Request::NotebookFacts { .. } => "notebook.facts",
            Request::NotebookChronology { .. } => "notebook.chronology",
            Request::NotebookReady { .. } => "notebook.ready",
            Request::NotebookConflicts { .. } => "notebook.conflicts",
            Request::Trace { .. } => "trace",
            Request::NotebookPropose { .. } => "notebook.propose",
            Request::NotebookExtract { .. } => "notebook.extract",
            Request::NotebookCorrect { .. } => "notebook.correct",
            Request::NotebookExclude { .. } => "notebook.exclude",
            Request::NotebookImpugnedSet { .. } => "notebook.impugned_set",
            Request::NotebookConfirm { .. } => "notebook.confirm",
            Request::NotebookSkip { .. } => "notebook.skip",
            Request::NotebookDateAnchor { .. } => "notebook.date_anchor",
            Request::EvidenceList { .. } => "evidence.list",
            Request::EvidenceShow { .. } => "evidence.show",
            Request::DraftCreate { .. } => "draft.create",
            Request::DraftCommit { .. } => "draft.commit",
            Request::DraftList { .. } => "draft.list",
            Request::DraftLog { .. } => "draft.log",
            Request::DraftShow { .. } => "draft.show",
            Request::DraftCheckpoint { .. } => "draft.checkpoint",
            Request::DraftRestore { .. } => "draft.restore",
            Request::View { .. } => "view",
            Request::DraftNew { .. } => "draft.new",
            Request::DraftParagraphs { .. } => "draft.paragraphs",
            Request::DraftPropose { .. } => "draft.propose",
            Request::DraftProposals { .. } => "draft.proposals",
            Request::DraftAccept { .. } => "draft.accept",
            Request::DraftReject { .. } => "draft.reject",
            Request::DraftRevert { .. } => "draft.revert",
            Request::DraftOpenEditor { .. } => "draft.open_editor",
            Request::DraftEditorStatus { .. } => "draft.editor_status",
            Request::DraftImportWorkingCopy { .. } => "draft.import_working_copy",
            Request::DraftDiff { .. } => "draft.diff",
            Request::DraftChanges { .. } => "draft.changes",
            Request::DraftNote { .. } => "draft.note",
            Request::DraftRender { .. } => "draft.render",
            Request::FilingPdf { .. } => "filing.pdf",
            Request::FilingConversions { .. } => "filing.conversions",
            Request::FidelityCheck { .. } => "fidelity.check",
            Request::PdfOpenEditor { .. } => "pdf.open_editor",
            Request::ApprovalRequest { .. } => "approval.request",
            Request::ApprovalDecide { .. } => "approval.decide",
            Request::ApprovalStatus { .. } => "approval.status",
            Request::RulesPin { .. } => "rules.pin",
            Request::Inspect { .. } => "inspect",
            Request::LinksOut { .. } => "links.out",
            Request::LinksIn { .. } => "links.in",
            Request::Find { .. } => "find",
            Request::SettingsList => "settings.list",
            Request::ApprovalList { .. } => "approval.list",
            Request::OutboxList { .. } => "outbox.list",
            Request::OutboxReconcile { .. } => "outbox.reconcile",
            Request::KernelShutdown => "kernel.shutdown",
            Request::BrowserOpen { .. } => "browser.open",
            Request::BrowserState { .. } => "browser.state",
            Request::BrowserDom { .. } => "browser.dom",
            Request::BrowserExtract { .. } => "browser.extract",
            Request::BrowserScreenshot { .. } => "browser.screenshot",
            Request::BrowserAttach { .. } => "browser.attach",
            Request::BrowserDetach => "browser.detach",
            Request::BrowserAttachments => "browser.attachments",
            Request::BrowserDownloads { .. } => "browser.downloads",
            Request::BrowserEgress { .. } => "browser.egress",
            Request::BrowserDevtools { .. } => "browser.devtools",
            Request::ContactsList { .. } => "contacts.list",
            Request::ContactsShow { .. } => "contacts.show",
            Request::ContactsAdd { .. } => "contacts.add",
            Request::ContactsEdit { .. } => "contacts.edit",
            Request::PartiesList { .. } => "parties.list",
            Request::PartiesSet { .. } => "parties.set",
            Request::Timeline { .. } => "timeline",
            Request::CorrespondenceLog { .. } => "correspondence.log",
        }
    }

    pub fn class(&self) -> CommandClass {
        match self {
            Request::MatterList { .. }
            | Request::SettingsGet { .. }
            | Request::JobList
            | Request::JobShow { .. }
            | Request::LedgerTail { .. }
            | Request::LedgerVerify { .. }
            | Request::AuditRejected { .. }
            | Request::AuditCommands
            | Request::EvidenceList { .. }
            | Request::EvidenceShow { .. }
            | Request::CaptureStatus
            | Request::IngestStatus { .. }
            | Request::EvidenceDuplicates { .. }
            | Request::CodebookShow { .. }
            | Request::AdapterHealth
            | Request::OcrLines { .. }
            | Request::OcrPipeline { .. }
            | Request::OcrDisputes { .. }
            | Request::ExtractEntities { .. }
            | Request::OcrEngines
            | Request::NotebookShow { .. }
            | Request::NotebookItem { .. }
            | Request::NotebookFacts { .. }
            | Request::NotebookChronology { .. }
            | Request::NotebookReady { .. }
            | Request::NotebookConflicts { .. }
            | Request::Trace { .. }
            | Request::DraftList { .. }
            | Request::DraftLog { .. }
            | Request::DraftShow { .. }
            | Request::View { .. }
            | Request::DraftParagraphs { .. }
            | Request::DraftProposals { .. }
            | Request::DraftEditorStatus { .. }
            | Request::DraftDiff { .. }
            | Request::DraftChanges { .. }
            | Request::FilingConversions { .. }
            | Request::FidelityCheck { .. }
            | Request::ApprovalStatus { .. }
            | Request::RulesPin { .. }
            | Request::Inspect { .. }
            | Request::LinksOut { .. }
            | Request::LinksIn { .. }
            | Request::Find { .. }
            | Request::SettingsList
            | Request::ApprovalList { .. }
            | Request::BrowserState { .. }
            | Request::BrowserDom { .. }
            | Request::BrowserExtract { .. }
            | Request::BrowserScreenshot { .. }
            | Request::BrowserAttachments
            | Request::BrowserDownloads { .. }
            | Request::BrowserEgress { .. }
            | Request::ContactsList { .. }
            | Request::ContactsShow { .. }
            | Request::PartiesList { .. }
            | Request::OutboxList { .. }
            | Request::Timeline { .. } => CommandClass::Query,
            Request::BrowserOpen { .. } => CommandClass::External,
            Request::MatterConfirm { .. }
            | Request::ApprovalDecide { .. }
            | Request::OcrDecide { .. }
            | Request::OcrTypedCopy { .. }
            | Request::NotebookConfirm { .. }
            | Request::NotebookSkip { .. }
            | Request::NotebookDateAnchor { .. }
            | Request::DraftAccept { .. }
            | Request::DraftReject { .. }
            | Request::BrowserAttach { .. } => CommandClass::Human,
            Request::WorkspaceInit { .. }
            | Request::MatterCreate { .. }
            | Request::MatterOpen { .. }
            | Request::MatterArchive { .. }
            | Request::MatterRename { .. }
            | Request::MatterWriteFile { .. }
            | Request::RegistryRescan
            | Request::SettingsSet { .. }
            | Request::JobCancel { .. }
            | Request::EvidenceAdd { .. }
            | Request::EvidenceImport { .. }
            | Request::IngestSetText { .. }
            | Request::CaptureCommit { .. }
            | Request::OcrRun { .. }
            | Request::NotebookPropose { .. }
            | Request::NotebookExtract { .. }
            | Request::NotebookCorrect { .. }
            | Request::NotebookExclude { .. }
            | Request::NotebookImpugnedSet { .. }
            | Request::DraftCreate { .. }
            | Request::DraftCommit { .. }
            | Request::DraftCheckpoint { .. }
            | Request::DraftRestore { .. }
            | Request::DraftNew { .. }
            | Request::DraftPropose { .. }
            | Request::DraftRevert { .. }
            | Request::DraftOpenEditor { .. }
            | Request::DraftImportWorkingCopy { .. }
            | Request::DraftNote { .. }
            | Request::DraftRender { .. }
            | Request::FilingPdf { .. }
            | Request::PdfOpenEditor { .. }
            | Request::ApprovalRequest { .. }
            | Request::BrowserDetach
            | Request::BrowserDevtools { .. }
            | Request::ContactsAdd { .. }
            | Request::ContactsEdit { .. }
            | Request::PartiesSet { .. }
            | Request::CorrespondenceLog { .. }
            | Request::OutboxReconcile { .. }
            | Request::KernelShutdown => CommandClass::Internal,
        }
    }

    /// The matter a command acts on, for the command audit.
    pub fn matter(&self) -> Option<&str> {
        match self {
            Request::MatterOpen { id }
            | Request::MatterArchive { id }
            | Request::MatterRename { id, .. }
            | Request::MatterWriteFile { id, .. } => Some(id),
            Request::LedgerTail { matter, .. }
            | Request::LedgerVerify { matter }
            | Request::EvidenceAdd { matter, .. }
            | Request::IngestSetText { matter, .. }
            | Request::CaptureCommit { matter, .. }
            | Request::OcrRun { matter, .. }
            | Request::OcrLines { matter, .. }
            | Request::OcrDecide { matter, .. }
            | Request::OcrTypedCopy { matter, .. }
            | Request::ExtractEntities { matter, .. }
            | Request::NotebookShow { matter, .. }
            | Request::NotebookItem { matter, .. }
            | Request::NotebookFacts { matter, .. }
            | Request::NotebookChronology { matter, .. }
            | Request::NotebookReady { matter }
            | Request::NotebookConflicts { matter }
            | Request::Trace { matter, .. }
            | Request::NotebookPropose { matter, .. }
            | Request::NotebookExtract { matter, .. }
            | Request::NotebookCorrect { matter, .. }
            | Request::NotebookExclude { matter, .. }
            | Request::NotebookImpugnedSet { matter, .. }
            | Request::NotebookConfirm { matter, .. }
            | Request::NotebookSkip { matter, .. }
            | Request::NotebookDateAnchor { matter, .. }
            | Request::EvidenceDuplicates { matter }
            | Request::EvidenceList { matter }
            | Request::EvidenceShow { matter, .. }
            | Request::DraftCreate { matter, .. }
            | Request::DraftCommit { matter, .. }
            | Request::DraftList { matter }
            | Request::DraftLog { matter, .. }
            | Request::DraftShow { matter, .. }
            | Request::DraftCheckpoint { matter, .. }
            | Request::DraftRestore { matter, .. }
            | Request::View { matter, .. }
            | Request::DraftNew { matter, .. }
            | Request::DraftParagraphs { matter, .. }
            | Request::DraftPropose { matter, .. }
            | Request::DraftProposals { matter, .. }
            | Request::DraftAccept { matter, .. }
            | Request::DraftReject { matter, .. }
            | Request::DraftRevert { matter, .. }
            | Request::DraftOpenEditor { matter, .. }
            | Request::DraftEditorStatus { matter, .. }
            | Request::DraftImportWorkingCopy { matter, .. }
            | Request::DraftDiff { matter, .. }
            | Request::DraftChanges { matter, .. }
            | Request::DraftNote { matter, .. }
            | Request::DraftRender { matter, .. }
            | Request::FilingPdf { matter, .. }
            | Request::FilingConversions { matter, .. }
            | Request::FidelityCheck { matter, .. }
            | Request::PdfOpenEditor { matter, .. }
            | Request::ApprovalRequest { matter, .. }
            | Request::ApprovalDecide { matter, .. }
            | Request::ApprovalStatus { matter, .. }
            | Request::Inspect { matter, .. }
            | Request::ApprovalList { matter }
            | Request::OutboxList { matter, .. }
            | Request::OutboxReconcile { matter, .. }
            | Request::LinksOut { matter, .. }
            | Request::LinksIn { matter, .. }
            | Request::RulesPin { matter }
            | Request::BrowserAttach { matter }
            | Request::PartiesList { matter }
            | Request::PartiesSet { matter, .. }
            | Request::CorrespondenceLog { matter, .. } => Some(matter),
            Request::AuditRejected { matter }
            | Request::EvidenceImport { matter, .. }
            | Request::OcrDisputes { matter, .. }
            | Request::OcrPipeline { matter }
            | Request::Find { matter, .. }
            | Request::BrowserOpen { matter, .. }
            | Request::BrowserDownloads { matter }
            | Request::Timeline { matter, .. } => matter.as_deref(),
            Request::CodebookShow { .. }
            | Request::CaptureStatus
            | Request::IngestStatus { .. }
            | Request::AdapterHealth
            | Request::OcrEngines => None,
            _ => None,
        }
    }

    /// The protocol schema (spec B rule 1).
    pub fn schema() -> serde_json::Value {
        serde_json::to_value(schemars::schema_for!(Request)).expect("a schema serialises")
    }
}

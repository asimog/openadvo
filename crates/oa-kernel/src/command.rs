//! The typed commands. Each has one name and one class (docs/specs/README.md,
//! "Command classes"). The serde tag is the wire name, and the JSON Schema
//! generated from these types is the protocol schema (spec B rule 1).

use std::path::PathBuf;

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
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
        "evidence.list",
        "evidence.show",
        "draft.create",
        "draft.commit",
        "draft.list",
        "draft.log",
        "draft.show",
        "draft.checkpoint",
        "draft.restore",
        "approval.request",
        "approval.decide",
        "approval.status",
        "rules.pin",
        "inspect",
        "links.out",
        "links.in",
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
        "evidence.list",
        "evidence.show",
        "draft.list",
        "draft.log",
        "draft.show",
        "approval.status",
        "rules.pin",
        "inspect",
        "links.out",
        "links.in",
    ];

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
            Request::EvidenceList { .. } => "evidence.list",
            Request::EvidenceShow { .. } => "evidence.show",
            Request::DraftCreate { .. } => "draft.create",
            Request::DraftCommit { .. } => "draft.commit",
            Request::DraftList { .. } => "draft.list",
            Request::DraftLog { .. } => "draft.log",
            Request::DraftShow { .. } => "draft.show",
            Request::DraftCheckpoint { .. } => "draft.checkpoint",
            Request::DraftRestore { .. } => "draft.restore",
            Request::ApprovalRequest { .. } => "approval.request",
            Request::ApprovalDecide { .. } => "approval.decide",
            Request::ApprovalStatus { .. } => "approval.status",
            Request::RulesPin { .. } => "rules.pin",
            Request::Inspect { .. } => "inspect",
            Request::LinksOut { .. } => "links.out",
            Request::LinksIn { .. } => "links.in",
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
            | Request::DraftList { .. }
            | Request::DraftLog { .. }
            | Request::DraftShow { .. }
            | Request::ApprovalStatus { .. }
            | Request::RulesPin { .. }
            | Request::Inspect { .. }
            | Request::LinksOut { .. }
            | Request::LinksIn { .. } => CommandClass::Query,
            Request::MatterConfirm { .. } | Request::ApprovalDecide { .. } => CommandClass::Human,
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
            | Request::DraftCreate { .. }
            | Request::DraftCommit { .. }
            | Request::DraftCheckpoint { .. }
            | Request::DraftRestore { .. }
            | Request::ApprovalRequest { .. } => CommandClass::Internal,
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
            | Request::EvidenceList { matter }
            | Request::EvidenceShow { matter, .. }
            | Request::DraftCreate { matter, .. }
            | Request::DraftCommit { matter, .. }
            | Request::DraftList { matter }
            | Request::DraftLog { matter, .. }
            | Request::DraftShow { matter, .. }
            | Request::DraftCheckpoint { matter, .. }
            | Request::DraftRestore { matter, .. }
            | Request::ApprovalRequest { matter, .. }
            | Request::ApprovalDecide { matter, .. }
            | Request::ApprovalStatus { matter, .. }
            | Request::Inspect { matter, .. }
            | Request::LinksOut { matter, .. }
            | Request::LinksIn { matter, .. }
            | Request::RulesPin { matter } => Some(matter),
            Request::AuditRejected { matter } => matter.as_deref(),
            _ => None,
        }
    }

    /// The protocol schema (spec B rule 1).
    pub fn schema() -> serde_json::Value {
        serde_json::to_value(schemars::schema_for!(Request)).expect("a schema serialises")
    }
}

/// One row of the global registry (spec E, `registry.db`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatterRow {
    pub id: String,
    pub path: String,
    pub title: String,
    pub archived: bool,
    pub removed: bool,
    pub last_seen: String,
}

/// The current-state view of one matter (spec C rule 1).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatterState {
    pub id: String,
    pub title: String,
    pub archived: bool,
    pub client_id: Option<String>,
    pub created_at: String,
    pub standard_version: String,
}

/// One ledger event (spec C rule 3). `body` is canonical JSON.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LedgerEvent {
    pub seq: i64,
    pub recorded_at: String,
    pub actor: String,
    pub origin: String,
    pub command: String,
    pub idempotency_key: Option<String>,
    pub body: String,
    pub prev_hash: String,
    pub hash: String,
}

/// A refused write or command (spec C rule 5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RejectedWrite {
    pub at: String,
    pub actor: String,
    pub origin: String,
    pub command: String,
    pub reason: String,
    pub body_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Contact {
    pub id: String,
    pub name: String,
    pub creation_key: Option<String>,
    pub created_at: String,
    /// person, organisation, counsel, court or bench (spec O01).
    pub kind: String,
    /// Where reference data came from, for courts and benches (O rule 4).
    pub source: Option<String>,
    /// Canonical JSON object: organisation, phone, email, address, note.
    pub details: String,
    pub updated_at: String,
    /// False for a contact the agent added and no advocate has confirmed.
    /// Using it as a matter's client needs the RQ-87 confirmation.
    pub confirmed: bool,
}

impl Contact {
    /// A person known only by name, as matter creation makes a new client.
    pub fn person(id: &str, name: &str, creation_key: Option<String>, at: &str) -> Self {
        Contact {
            id: id.to_string(),
            name: name.to_string(),
            creation_key,
            created_at: at.to_string(),
            kind: "person".into(),
            source: None,
            details: "{}".into(),
            updated_at: at.to_string(),
            confirmed: true,
        }
    }
}

/// A command waiting for a human confirmation, for example a matter for a
/// new client proposed by the agent (RQ-87).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pending {
    pub id: String,
    pub kind: String,
    pub payload: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobStatus {
    Running,
    Done,
    Cancelled,
    Failed,
    Checkpointed,
}

impl JobStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            JobStatus::Running => "running",
            JobStatus::Done => "done",
            JobStatus::Cancelled => "cancelled",
            JobStatus::Failed => "failed",
            JobStatus::Checkpointed => "checkpointed",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "running" => Some(JobStatus::Running),
            "done" => Some(JobStatus::Done),
            "cancelled" => Some(JobStatus::Cancelled),
            "failed" => Some(JobStatus::Failed),
            "checkpointed" => Some(JobStatus::Checkpointed),
            _ => None,
        }
    }
}

/// A long job (spec A rule 12).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobRow {
    pub id: String,
    pub kind: String,
    pub status: JobStatus,
    pub done: i64,
    pub total: i64,
    pub cancel_requested: bool,
    pub message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobUpdate {
    pub status: JobStatus,
    pub done: i64,
    pub total: i64,
    pub message: Option<String>,
    pub at: String,
}

/// One legal document's entry in the evidence store (spec C rule 6). The bytes
/// live in the blob store and never change.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvidenceRow {
    pub id: String,
    pub original_name: String,
    pub primary_origin: String,
    pub blob: String,
    pub size: i64,
    pub created_at: String,
}

/// Each way the same bytes arrived. Identical bytes add an origin, not a blob.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OriginRow {
    pub evidence_id: String,
    pub origin: String,
    pub original_name: String,
    pub added_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DraftRow {
    pub id: String,
    pub title: String,
    pub head: String,
    pub created_at: String,
}

/// One node of a draft's revision DAG (spec C rule 7). Never deleted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RevisionRow {
    pub hash: String,
    pub draft_id: String,
    /// Canonical JSON array of parent revision hashes.
    pub parents: String,
    pub author_kind: String,
    pub author: String,
    pub blob: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckpointRow {
    pub draft_id: String,
    pub name: String,
    pub revision: String,
    pub created_at: String,
}

/// A gate wait bound to the exact target it judges (spec C rules 10 and 11).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovalRow {
    pub id: String,
    pub gate: String,
    pub target: String,
    pub requested_at: String,
    pub requested_by: String,
    pub decision: Option<String>,
    pub reason: Option<String>,
    pub decided_at: Option<String>,
    pub decided_by: Option<String>,
}

/// A capture record (spec F rule 4). Created only by the browser supervisor
/// and committed by the kernel; the hash equals the blob hash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureRow {
    pub id: String,
    pub evidence_id: Option<String>,
    pub url: String,
    pub final_url: String,
    pub captured_at: String,
    pub blob: Option<String>,
    pub profile: String,
    pub gesture: String,
    pub portal_date: Option<String>,
    pub adapter: String,
    pub status: String,
    pub reason: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Per-file ingestion state (spec F). Independent of how the file arrived.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IngestRow {
    pub id: String,
    pub evidence_id: String,
    pub status: String,
    pub format: String,
    pub readability: String,
    pub proposed_class: String,
    pub text_fingerprint: Option<String>,
    pub duplicate_of: Option<String>,
    pub message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// A court codebook list with its version (spec F rule 10, RQ-50).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodebookRow {
    pub scheme: String,
    pub version: String,
    /// Canonical JSON array of `{scheme, code, label}`.
    pub codes: String,
    pub updated_at: String,
}

/// A portal adapter's contract and runtime health (spec F rule 12).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdapterHealthRow {
    pub adapter: String,
    pub contract_state: String,
    pub runtime_state: String,
    pub detail: Option<String>,
    pub checked_at: String,
}

/// OCR state for one document, keyed by its evidence id (spec G rule 11).
/// The JSON `data` column holds the page, line, dispute and typed-copy records
/// so the kernel can keep one document's OCR run atomic.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OcrDocumentRow {
    pub doc: String,
    pub state: String,
    pub page_count: i64,
    pub disputes: i64,
    pub data: String,
    pub created_at: String,
    pub updated_at: String,
}

/// One version of a Notebook item (spec H rules 1 and 12). Versions are
/// append-only; the JSON `data` column is the whole item.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotebookItemRow {
    pub id: String,
    pub version: i64,
    pub section: String,
    pub kind: String,
    pub status: String,
    pub component: String,
    pub data: String,
    pub created_at: String,
}

/// A Notebook review item: a conflict or a date question (spec H rules 7
/// and 10).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotebookReviewRow {
    pub id: String,
    pub kind: String,
    pub key: String,
    pub state: String,
    pub data: String,
    pub created_at: String,
    pub updated_at: String,
}

/// An event or category hidden in one view (spec H rule 6).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotebookExclusionRow {
    pub view: String,
    pub target_kind: String,
    pub target: String,
    pub created_at: String,
}

/// A spec J record: a proposal, a review note, an editor session or a
/// conversion. The body is the record's JSON; `state` is what moves.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocRecordRow {
    pub kind: String,
    pub id: String,
    pub draft_id: String,
    pub state: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

/// A row written in the same transaction as a ledger event (spec C rule 1).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MatterWrite {
    State(MatterState),
    InsertEvidence(EvidenceRow),
    AddOrigin(OriginRow),
    InsertDraft(DraftRow),
    InsertRevision(RevisionRow),
    /// Compare-and-swap: refused with `Conflict` unless the head is `expected`.
    MoveHead {
        draft_id: String,
        expected: String,
        new: String,
    },
    InsertCheckpoint(CheckpointRow),
    InsertApproval(ApprovalRow),
    /// Refused with `Conflict` if the approval was already decided.
    DecideApproval {
        id: String,
        decision: String,
        reason: String,
        decided_at: String,
        decided_by: String,
    },
    InsertCapture(CaptureRow),
    InsertIngest(IngestRow),
    UpdateCaptureStatus {
        id: String,
        status: String,
        reason: Option<String>,
        updated_at: String,
    },
    SetIngestText {
        id: String,
        text_fingerprint: String,
        duplicate_of: Option<String>,
        updated_at: String,
    },
    UpsertOcrDocument(OcrDocumentRow),
    /// Refused with `Conflict` if that version exists.
    InsertNotebookItem(NotebookItemRow),
    UpsertNotebookReview(NotebookReviewRow),
    AddNotebookExclusion(NotebookExclusionRow),
    RemoveNotebookExclusion {
        view: String,
        target_kind: String,
        target: String,
    },
    SetNotebookMeta {
        key: String,
        value: String,
    },
    InsertDocRecord(DocRecordRow),
    InsertOutbox(OutboxRow),
    /// Compare-and-swap on the state: refused with `Conflict` unless the
    /// entry is in `expected`.
    UpdateOutboxState {
        id: String,
        expected: String,
        state: String,
        outcome: Option<String>,
        detail: Option<String>,
        updated_at: String,
    },
    /// Compare-and-swap on the state: refused with `Conflict` unless the
    /// record is in `expected`.
    UpdateDocRecord {
        kind: String,
        id: String,
        expected: String,
        state: String,
        body: String,
        updated_at: String,
    },
}

/// One external effect queued or completed in the outbox (spec C rule 14).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutboxRow {
    pub id: String,
    pub created_at: String,
    pub actor: String,
    pub origin: String,
    pub command: String,
    pub idempotency_key: Option<String>,
    pub state: String,
    pub payload: String,
    pub approval_id: Option<String>,
    pub attempt_count: i64,
    pub last_attempt_at: Option<String>,
    pub outcome: Option<String>,
    pub detail: Option<String>,
}

/// One connection a browser profile made or refused (spec M, the egress log).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EgressRow {
    pub id: String,
    pub at: String,
    pub profile: String,
    pub url: String,
    pub host: String,
    pub initiator: String,
    pub kind: String,
    pub allowed: bool,
    pub reason: String,
    pub status: Option<i64>,
    pub error: Option<String>,
}

/// One intercepted download (M rule 5, F06): its hash from the bytes on
/// disk, and where it was routed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadRow {
    pub id: String,
    pub at: String,
    pub profile: String,
    pub url: String,
    pub final_url: String,
    pub file_name: String,
    pub content_type: String,
    pub sha256: String,
    pub size: i64,
    pub matter: Option<String>,
    pub evidence_id: Option<String>,
    pub capture_id: Option<String>,
    /// routed, or unrouted when there was no matter to route to.
    pub status: String,
    pub detail: Option<String>,
}

/// The agent's attachment to a visible profile (RQ-81). Active while
/// `detached_at` is empty.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachmentRow {
    pub id: String,
    pub profile: String,
    pub attached_at: String,
    pub attached_by: String,
    pub detached_at: Option<String>,
    pub detached_by: Option<String>,
}

/// An accepted command, for the control audit (spec B rule 8).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandLogRow {
    pub at: String,
    pub actor: String,
    pub origin: String,
    pub command: String,
    pub idempotency_key: Option<String>,
    pub matter: Option<String>,
}

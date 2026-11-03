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
}

impl JobStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            JobStatus::Running => "running",
            JobStatus::Done => "done",
            JobStatus::Cancelled => "cancelled",
            JobStatus::Failed => "failed",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "running" => Some(JobStatus::Running),
            "done" => Some(JobStatus::Done),
            "cancelled" => Some(JobStatus::Cancelled),
            "failed" => Some(JobStatus::Failed),
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

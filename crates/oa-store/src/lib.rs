//! Repository traits over the three SQLite files a step-1 kernel needs
//! (spec E, "Files"): `registry.db` and `firm.db` in the application data
//! folder, and one `matter.db` per matter workspace.
//!
//! Domain code depends on these traits only (spec R rule 1). The SQLite
//! implementations live in [`sqlite`].

mod model;
pub mod session;
pub mod sqlite;

use std::path::Path;

pub use model::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoreErrorKind {
    /// The file could not be opened or is not a database we recognise.
    Unavailable,
    /// A compare-and-swap check failed: the caller's view is stale.
    Conflict,
    /// A row that must exist does not.
    NotFound,
    Other,
}

#[derive(Debug, Clone, thiserror::Error)]
#[error("{message}")]
pub struct StoreError {
    pub kind: StoreErrorKind,
    pub message: String,
}

impl StoreError {
    pub fn new(kind: StoreErrorKind, message: impl Into<String>) -> Self {
        StoreError {
            kind,
            message: message.into(),
        }
    }
}

pub type StoreResult<T> = Result<T, StoreError>;

/// The matter index. Rebuildable from the matter folders (spec A rule 2).
pub trait RegistryStore: Send {
    fn matter(&self, id: &str) -> StoreResult<Option<MatterRow>>;
    fn matters(&self) -> StoreResult<Vec<MatterRow>>;
    fn upsert_matter(&self, row: &MatterRow) -> StoreResult<()>;
    /// Writes the matter row and the idempotency record in one transaction.
    fn insert_created_matter(&self, row: &MatterRow, key: &str, result: &str) -> StoreResult<()>;
    fn idempotent_result(&self, key: &str) -> StoreResult<Option<String>>;
    /// Upserts every found row and marks every other row removed, in one
    /// transaction. Returns the ids newly marked removed.
    fn apply_rescan(&self, found: &[MatterRow], seen_at: &str) -> StoreResult<Vec<String>>;

    fn create_job(&self, job: &JobRow) -> StoreResult<()>;
    fn update_job(&self, id: &str, update: &JobUpdate) -> StoreResult<()>;
    fn request_cancel(&self, id: &str, at: &str) -> StoreResult<bool>;
    fn job(&self, id: &str) -> StoreResult<Option<JobRow>>;
    fn jobs(&self) -> StoreResult<Vec<JobRow>>;

    fn codebook(&self, scheme: &str) -> StoreResult<Option<CodebookRow>>;
    fn codebooks(&self) -> StoreResult<Vec<CodebookRow>>;
    fn upsert_codebook(&self, row: &CodebookRow) -> StoreResult<()>;
    fn adapter_health(&self, adapter: &str) -> StoreResult<Option<AdapterHealthRow>>;
    fn adapters(&self) -> StoreResult<Vec<AdapterHealthRow>>;
    fn upsert_adapter_health(&self, row: &AdapterHealthRow) -> StoreResult<()>;
}

/// Firm-level data that cannot be rebuilt from folders (spec O): the
/// workspace root, contacts, firm settings, pending confirmations, and the
/// audit of refused firm-level commands. The workspace root lives here, not in
/// the registry, because the registry must be rebuildable by a rescan that
/// needs the root.
pub trait FirmStore: Send {
    fn workspace_root(&self) -> StoreResult<Option<String>>;
    fn set_workspace_root(&self, root: &str) -> StoreResult<()>;

    fn contact(&self, id: &str) -> StoreResult<Option<Contact>>;
    fn contact_by_creation_key(&self, key: &str) -> StoreResult<Option<Contact>>;
    fn insert_contact(&self, contact: &Contact) -> StoreResult<()>;

    fn setting(&self, key: &str) -> StoreResult<Option<String>>;
    fn set_setting(&self, key: &str, value: &str, at: &str) -> StoreResult<()>;
    /// Every firm setting as (key, value), sorted by key.
    fn settings(&self) -> StoreResult<Vec<(String, String)>>;

    fn insert_pending(&self, pending: &Pending) -> StoreResult<()>;
    fn pending(&self, id: &str) -> StoreResult<Option<Pending>>;
    fn remove_pending(&self, id: &str) -> StoreResult<()>;

    fn record_rejected(&self, rejected: &RejectedWrite) -> StoreResult<()>;
    fn rejected(&self) -> StoreResult<Vec<RejectedWrite>>;

    fn log_command(&self, row: &CommandLogRow) -> StoreResult<()>;
    fn commands(&self) -> StoreResult<Vec<CommandLogRow>>;
}

/// One matter workspace's canonical record (spec C rules 1 and 3).
pub trait MatterStore: Send {
    /// Writes the current-state row and the genesis event in one transaction.
    fn initialise(&self, state: &MatterState, genesis: &LedgerEvent) -> StoreResult<()>;
    fn state(&self) -> StoreResult<MatterState>;
    fn last_event(&self) -> StoreResult<Option<LedgerEvent>>;
    fn events(&self) -> StoreResult<Vec<LedgerEvent>>;
    fn event_by_key(&self, key: &str) -> StoreResult<Option<LedgerEvent>>;
    /// The single commit path: appends one event and applies its writes, in
    /// one transaction. Refused with `Conflict` unless the event's sequence and
    /// previous hash follow the stored head, or if a compare-and-swap write
    /// fails. Nothing is written when anything is refused.
    fn commit(&self, event: &LedgerEvent, writes: &[MatterWrite]) -> StoreResult<()>;

    fn evidence(&self, id: &str) -> StoreResult<Option<EvidenceRow>>;
    fn evidence_by_blob(&self, blob: &str) -> StoreResult<Option<EvidenceRow>>;
    fn evidence_list(&self) -> StoreResult<Vec<EvidenceRow>>;
    fn origins(&self, evidence_id: &str) -> StoreResult<Vec<OriginRow>>;

    fn draft(&self, id: &str) -> StoreResult<Option<DraftRow>>;
    fn drafts(&self) -> StoreResult<Vec<DraftRow>>;
    fn revision(&self, hash: &str) -> StoreResult<Option<RevisionRow>>;
    fn revisions(&self, draft_id: &str) -> StoreResult<Vec<RevisionRow>>;
    fn checkpoint(&self, draft_id: &str, name: &str) -> StoreResult<Option<CheckpointRow>>;
    fn checkpoints(&self, draft_id: &str) -> StoreResult<Vec<CheckpointRow>>;

    fn approval(&self, id: &str) -> StoreResult<Option<ApprovalRow>>;
    fn approvals(&self) -> StoreResult<Vec<ApprovalRow>>;

    fn capture(&self, id: &str) -> StoreResult<Option<CaptureRow>>;
    fn capture_by_evidence(&self, evidence_id: &str) -> StoreResult<Option<CaptureRow>>;
    fn captures(&self) -> StoreResult<Vec<CaptureRow>>;
    fn ingest(&self, id: &str) -> StoreResult<Option<IngestRow>>;
    fn ingest_by_evidence(&self, evidence_id: &str) -> StoreResult<Option<IngestRow>>;
    fn ingests(&self) -> StoreResult<Vec<IngestRow>>;
    fn ingests_with_text(&self, fingerprint: &str) -> StoreResult<Vec<IngestRow>>;

    fn record_rejected(&self, rejected: &RejectedWrite) -> StoreResult<()>;
    fn rejected(&self) -> StoreResult<Vec<RejectedWrite>>;
}

/// Opens the stores. The one place that knows how they are persisted.
pub trait StoreFactory: Send + Sync {
    fn registry(&self, app_data: &Path) -> StoreResult<Box<dyn RegistryStore>>;
    fn firm(&self, app_data: &Path) -> StoreResult<Box<dyn FirmStore>>;
    /// Creates `matter.db` in a matter folder. Refuses if it already exists.
    fn create_matter(&self, matter_dir: &Path) -> StoreResult<Box<dyn MatterStore>>;
    /// Opens an existing `matter.db`. Refuses if it is missing.
    fn open_matter(&self, matter_dir: &Path) -> StoreResult<Box<dyn MatterStore>>;
}

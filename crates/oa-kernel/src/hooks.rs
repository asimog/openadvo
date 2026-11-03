//! Seams the kernel calls out through: fault injection for kill tests, the
//! user-presence prompt for `human` commands (H-09), and the write-grant
//! policy (C09). Each has a fail-safe default.

use std::sync::Arc;

use oa_types::OaError;

use crate::paths::WriteArea;

/// The steps of `oa matter create`, in order (spec A rule 1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    StageFolder,
    WriteManifest,
    CreateMatterDb,
    WriteGenesis,
    MoveIntoPlace,
    WriteRegistryRow,
    /// Before an evidence blob is written.
    WriteBlob,
    /// Before an evidence entry is committed.
    CommitEvidence,
}

impl Step {
    pub const CREATE_ORDER: [Step; 6] = [
        Step::StageFolder,
        Step::WriteManifest,
        Step::CreateMatterDb,
        Step::WriteGenesis,
        Step::MoveIntoPlace,
        Step::WriteRegistryRow,
    ];
}

/// Called before each step of a multi-step operation. A test implementation
/// returns an error to stop the operation at that point with no cleanup, which
/// is what a killed process leaves behind.
pub trait FaultHook: Send + Sync {
    fn before(&self, _step: Step) -> Result<(), OaError> {
        Ok(())
    }

    /// Called before each item of a long job.
    fn before_job_item(&self) {}
}

pub struct NoFaults;

impl FaultHook for NoFaults {}

/// Asks the human at the machine to confirm. Must not be satisfiable by a
/// process on its own once backed by the OS prompt (H-09).
pub trait PresencePrompt: Send + Sync {
    fn confirm(&self, summary: &str) -> bool;
}

/// The fail-safe default: nobody is present, so nothing is confirmed.
pub struct NobodyPresent;

impl PresencePrompt for NobodyPresent {
    fn confirm(&self, _summary: &str) -> bool {
        false
    }
}

/// Decides whether the harness may write raw files into an area of a matter
/// (spec A rule 5).
pub trait GrantPolicy: Send + Sync {
    fn harness_may_write(&self, matter_id: &str, area: WriteArea) -> bool;
}

/// Stub until C09: the harness holds a grant for the inbox and its scratch
/// area of every matter.
pub struct StepOneGrants;

impl GrantPolicy for StepOneGrants {
    fn harness_may_write(&self, _matter_id: &str, _area: WriteArea) -> bool {
        true
    }
}

#[derive(Clone)]
pub struct Hooks {
    pub faults: Arc<dyn FaultHook>,
    pub presence: Arc<dyn PresencePrompt>,
    pub grants: Arc<dyn GrantPolicy>,
}

impl Default for Hooks {
    fn default() -> Self {
        Hooks {
            faults: Arc::new(NoFaults),
            presence: Arc::new(NobodyPresent),
            grants: Arc::new(StepOneGrants),
        }
    }
}

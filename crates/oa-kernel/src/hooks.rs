//! Seams the kernel calls out through: fault injection for kill tests, the
//! user-presence prompt for `human` commands (H-09), the write-grant policy
//! (C09), the DOCX engine (J) and K's draft checks. Each has a fail-safe
//! default.

use std::sync::Arc;

use oa_docs::conversion::ParaCheck;
use oa_docs::docx::Block;
use oa_docs::filing::IndexEntry;
use oa_docs::{DocxEngine, ProcessEngine};
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
    /// The DOCX engine (J, X-04): `wordcraft --headless` beside the running
    /// executable by default.
    pub docx: Arc<dyn DocxEngine>,
    /// K's draft checks, which J calls before conversion and on it.
    pub checks: Arc<dyn DraftChecks>,
    /// Starts browser profile processes (spec M): `oa-browser-profile`
    /// beside the running executable by default.
    pub browser: Arc<dyn oa_browser::Launcher>,
}

impl Default for Hooks {
    fn default() -> Self {
        Hooks {
            faults: Arc::new(NoFaults),
            presence: Arc::new(NobodyPresent),
            grants: Arc::new(StepOneGrants),
            docx: Arc::new(ProcessEngine::beside_current_exe()),
            checks: Arc::new(VerifyChecks),
            browser: Arc::new(oa_browser::ProcessLauncher::beside_current_exe()),
        }
    }
}

/// What K's checks see of one revision.
pub struct CheckInput<'a> {
    pub matter: &'a str,
    pub draft: &'a str,
    pub revision: &'a str,
    pub paragraphs: &'a [Block],
    /// The annexure manager's numbering for this filing (J11), for K06.
    pub index: &'a [IndexEntry],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateBlocker {
    pub gate: String,
    pub detail: String,
}

/// The seam where K (the verification adapter) plugs into J. J asks whether
/// a revision's gates are clear before conversion (J rule 12) and runs the
/// conversion check on the produced PDF/A (J rule 14). K replaces
/// [`StubDraftChecks`].
pub trait DraftChecks: Send + Sync {
    fn blockers(&self, input: &CheckInput) -> Vec<GateBlocker>;
    fn conversion(&self, paragraphs: &[Block], pdf_body: &[String]) -> Vec<ParaCheck>;
}

/// Stub until K: no consistency findings of its own, and the paragraph-by-
/// paragraph text comparison as the conversion check.
pub struct StubDraftChecks;

impl DraftChecks for StubDraftChecks {
    fn blockers(&self, _input: &CheckInput) -> Vec<GateBlocker> {
        Vec::new()
    }

    fn conversion(&self, paragraphs: &[Block], pdf_body: &[String]) -> Vec<ParaCheck> {
        oa_docs::conversion::compare(paragraphs, pdf_body)
    }
}

/// Spec K's checks while the adapter is deferred until the ULOS standard is
/// ready: no revision has a verification record, so every revision is
/// blocked pending source verification (P4), and conversion keeps J's
/// paragraph comparison.
pub struct VerifyChecks;

impl DraftChecks for VerifyChecks {
    fn blockers(&self, _input: &CheckInput) -> Vec<GateBlocker> {
        let (state, reason) = oa_verify::deferred_gate();
        vec![GateBlocker {
            gate: state.label().to_string(),
            detail: reason.to_string(),
        }]
    }

    fn conversion(&self, paragraphs: &[Block], pdf_body: &[String]) -> Vec<ParaCheck> {
        oa_docs::conversion::compare(paragraphs, pdf_body)
    }
}

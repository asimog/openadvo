//! The verification adapter (spec K), deferred. This is a skeleton: the
//! vocabulary of the ULOS standard (docs/ULOSarchitecture.md, decisions 5.3)
//! and the one seam through which the `ulos` validator will be run. The
//! standard and its CLI are being built separately (ulosadvo); until then
//! every request answers `Unavailable`, which blocks, and nothing here ever
//! produces `verified` (P3, P4, L-14).

use serde::{Deserialize, Serialize};

/// The four validator outcomes (decisions 5.3). Only `ulos` produces them;
/// the adapter will read them from its records and never decide one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Verified,
    Failed,
    Unresolved,
    NotApplicable,
}

/// The six gate states the advocate sees, in precedence order (decisions
/// 5.3). The mapping function (K08) is deferred with the adapter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GateState {
    BlockedPendingSourceVerification,
    NeedsCorrection,
    BlockedPendingLegalReview,
    BlockedPendingFilingCompliance,
    NeedsAdditionalInstructions,
    ReadyForAdvocateReview,
}

impl GateState {
    pub fn label(self) -> &'static str {
        match self {
            GateState::BlockedPendingSourceVerification => "Blocked pending source verification",
            GateState::NeedsCorrection => "Needs correction",
            GateState::BlockedPendingLegalReview => "Blocked pending legal review",
            GateState::BlockedPendingFilingCompliance => "Blocked pending filing compliance",
            GateState::NeedsAdditionalInstructions => "Needs additional instructions",
            GateState::ReadyForAdvocateReview => "Ready for advocate review",
        }
    }
}

/// The ULOS checks the adapter will request (ULOSarchitecture.md).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Check {
    #[serde(rename = "ULOS-C")]
    Citation,
    #[serde(rename = "ULOS-CI")]
    Paragraph,
    #[serde(rename = "ULOS-L")]
    Legislation,
    #[serde(rename = "ULOS-N")]
    Notebook,
}

/// Why no verification record exists.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Unavailable {
    pub reason: String,
}

/// What the validator answered: the raw `ulos` record JSON, kept verbatim.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RawRecord(pub String);

/// The narrow seam to the `ulos` validator process (K11): one bundle in,
/// the records `ulos` printed out. A record is admitted only from a known
/// `ulos` release (K09) and never from a fixture source in production (K10);
/// both checks arrive with the adapter.
pub trait Validator: Send + Sync {
    fn verify(&self, bundle_json: &str) -> Result<Vec<RawRecord>, Unavailable>;
}

/// The reason every check is unavailable until the standard is ready.
pub const DEFERRED: &str =
    "verification is deferred until the ULOS standard and its ulos validator (ulosadvo) are ready";

/// The validator until then: nothing is checked, so nothing is verified.
pub struct Deferred;

impl Validator for Deferred {
    fn verify(&self, _bundle_json: &str) -> Result<Vec<RawRecord>, Unavailable> {
        Err(Unavailable {
            reason: DEFERRED.into(),
        })
    }
}

/// The gate state of a revision while the adapter is deferred: no record
/// exists, so source verification is pending (P4: unchecked blocks).
pub fn deferred_gate() -> (GateState, &'static str) {
    (GateState::BlockedPendingSourceVerification, DEFERRED)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_deferred_adapter_is_unavailable_and_blocks() {
        assert_eq!(
            Deferred.verify("{}"),
            Err(Unavailable {
                reason: DEFERRED.into()
            })
        );
        let (state, _) = deferred_gate();
        assert_eq!(state, GateState::BlockedPendingSourceVerification);
        assert!(state < GateState::ReadyForAdvocateReview);
    }
}

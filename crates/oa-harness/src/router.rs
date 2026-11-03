//! The model router: the one choke point that decides which text may leave the
//! machine (spec D rule 12, D03, OQ-14).

use crate::provider::Residency;

/// A matter's confidentiality label.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Confidentiality {
    Normal,
    Restricted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Deny(String),
}

/// Working decision for OQ-14: a restricted matter never reaches a remote
/// provider, whatever the budget. Normal matters may use either.
pub fn decide(label: Confidentiality, provider: Residency) -> Decision {
    match (label, provider) {
        (Confidentiality::Restricted, Residency::Remote) => Decision::Deny(
            "this matter is restricted; its text may not leave the machine for a remote provider"
                .into(),
        ),
        _ => Decision::Allow,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restricted_matters_stay_local() {
        assert!(matches!(
            decide(Confidentiality::Restricted, Residency::Remote),
            Decision::Deny(_)
        ));
        assert_eq!(
            decide(Confidentiality::Restricted, Residency::Local),
            Decision::Allow
        );
        assert_eq!(
            decide(Confidentiality::Normal, Residency::Remote),
            Decision::Allow
        );
    }
}

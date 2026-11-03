//! Playbooks (spec D rule 13, D09 and D10): workflow progression is data, run
//! by one interpreter. The SLP workflow is a playbook whose stages come from
//! docs/advocate-workflow.md section 1: Matter creation, Record acquisition,
//! Document intelligence, Notebook, Legal research, Case conference, SLP
//! drafting, Verification, Filing preparation, Filing.

use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stage {
    pub id: &'static str,
    pub title: &'static str,
    /// Artefacts that must exist before this stage can be entered.
    pub requires: &'static [&'static str],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Playbook {
    pub id: &'static str,
    pub title: &'static str,
    pub stages: Vec<Stage>,
}

pub fn slp() -> Playbook {
    let s = |id, title, requires| Stage {
        id,
        title,
        requires,
    };
    Playbook {
        id: "slp",
        title: "Special Leave Petition",
        stages: vec![
            s("matter_creation", "Matter creation", &[]),
            s("record_acquisition", "Record acquisition", &["matter"]),
            s(
                "document_intelligence",
                "Document intelligence",
                &["source_documents"],
            ),
            s("notebook", "Notebook", &["extracted_lines"]),
            s("legal_research", "Legal research", &["notebook_facts"]),
            s("case_conference", "Case conference", &["research_notes"]),
            s("slp_drafting", "SLP drafting", &["approved_direction"]),
            s("verification", "Verification", &["draft_revision"]),
            s(
                "filing_preparation",
                "Filing preparation",
                &["verification_proof"],
            ),
            s("filing", "Filing", &["filing_payload_approved"]),
        ],
    }
}

pub fn all() -> Vec<Playbook> {
    vec![slp()]
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Advance {
    Entered(&'static str),
    /// The next stage needs artefacts the matter does not have yet.
    Blocked {
        stage: &'static str,
        missing: Vec<&'static str>,
    },
    Finished,
}

/// The one interpreter: from the current stage (or none), try to enter the
/// next one. A stage is never skipped, and entry conditions are checked.
pub fn advance(pb: &Playbook, current: Option<&str>, artefacts: &BTreeSet<String>) -> Advance {
    let next = match current {
        None => pb.stages.first(),
        Some(c) => pb
            .stages
            .iter()
            .position(|s| s.id == c)
            .and_then(|i| pb.stages.get(i + 1)),
    };
    let Some(stage) = next else {
        return Advance::Finished;
    };
    let missing: Vec<&'static str> = stage
        .requires
        .iter()
        .copied()
        .filter(|r| !artefacts.contains(*r))
        .collect();
    if missing.is_empty() {
        Advance::Entered(stage.id)
    } else {
        Advance::Blocked {
            stage: stage.id,
            missing,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_interpreter_enters_a_stage_only_when_its_artefacts_exist() {
        let pb = slp();
        let have = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<BTreeSet<_>>();
        assert_eq!(
            advance(&pb, None, &have(&[])),
            Advance::Entered("matter_creation")
        );
        assert_eq!(
            advance(&pb, Some("matter_creation"), &have(&[])),
            Advance::Blocked {
                stage: "record_acquisition",
                missing: vec!["matter"]
            }
        );
        assert_eq!(
            advance(&pb, Some("matter_creation"), &have(&["matter"])),
            Advance::Entered("record_acquisition")
        );
        assert_eq!(advance(&pb, Some("filing"), &have(&[])), Advance::Finished);
        assert_eq!(pb.stages.len(), 10);
    }
}

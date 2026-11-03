//! Panes the shell reserves for groups that are not built yet. Each shows what
//! it waits for instead of pretending to work (honest states, AGENTS.md).

/// A pane registered with the layout whose content another spec builds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Stub {
    pub title: &'static str,
    /// The group whose spec builds the pane's content.
    pub waits_for: &'static str,
}

pub const STUBS: [Stub; 3] = [
    Stub {
        title: "Notebook",
        waits_for: "H, the Notebook",
    },
    Stub {
        title: "Viewer",
        waits_for: "J, the viewers",
    },
    Stub {
        title: "Agent",
        waits_for: "D, the harness",
    },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rule_6_every_stub_pane_is_registered_once() {
        let mut titles: Vec<_> = STUBS.iter().map(|p| p.title).collect();
        titles.sort();
        titles.dedup();
        assert_eq!(titles.len(), STUBS.len());
    }
}

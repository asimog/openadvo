//! The command bar (spec A09 and rule 18): commands ranked by frecency. Only
//! registered commands are issued. Free text that matches no command is a
//! search, never an action.

use std::collections::BTreeMap;

use oa_protocol::Request;

/// Per-command use, kept by the shell as a convenience. Not canonical state.
#[derive(Debug, Default, Clone)]
pub struct Frecency {
    uses: BTreeMap<String, (u32, u64)>,
}

/// Half-life of a use, in milliseconds (one week).
const HALF_LIFE_MS: f64 = 7.0 * 24.0 * 3600.0 * 1000.0;

impl Frecency {
    pub fn record(&mut self, name: &str, now_ms: u64) {
        let e = self.uses.entry(name.to_string()).or_insert((0, now_ms));
        e.0 += 1;
        e.1 = now_ms;
    }

    pub fn score(&self, name: &str, now_ms: u64) -> f64 {
        self.uses.get(name).map_or(0.0, |(n, last)| {
            let age = now_ms.saturating_sub(*last) as f64;
            f64::from(*n) * 0.5f64.powf(age / HALF_LIFE_MS)
        })
    }

    pub fn to_pairs(&self) -> Vec<(String, u32, u64)> {
        self.uses
            .iter()
            .map(|(k, (n, t))| (k.clone(), *n, *t))
            .collect()
    }

    pub fn from_pairs(pairs: impl IntoIterator<Item = (String, u32, u64)>) -> Self {
        Frecency {
            uses: pairs.into_iter().map(|(k, n, t)| (k, (n, t))).collect(),
        }
    }
}

/// Registered commands matching the text, best first. A command never used
/// ranks by name.
pub fn rank(text: &str, f: &Frecency, now_ms: u64) -> Vec<&'static str> {
    let needle = text.trim().to_lowercase();
    let mut hits: Vec<&'static str> = Request::NAMES
        .iter()
        .copied()
        .filter(|n| n.contains(&needle))
        .collect();
    hits.sort_by(|a, b| {
        f.score(b, now_ms)
            .partial_cmp(&f.score(a, now_ms))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.cmp(b))
    });
    hits
}

#[derive(Debug, PartialEq, Eq)]
pub enum Action {
    /// A registered command, by name.
    Command(&'static str),
    /// Free text that matches no command.
    Search(String),
}

/// What Enter does with the text: the top ranked command whose name the text
/// equals or prefixes, otherwise a search. Never an arbitrary action.
pub fn resolve(text: &str, f: &Frecency, now_ms: u64) -> Action {
    let t = text.trim();
    if let Some(exact) = Request::NAMES.iter().find(|n| **n == t) {
        return Action::Command(exact);
    }
    match rank(t, f, now_ms).first() {
        Some(top) if !t.is_empty() && top.starts_with(&t.to_lowercase()) => Action::Command(top),
        _ => Action::Search(t.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rule_18_frecency_ranks_a_used_command_first() {
        let mut f = Frecency::default();
        let now = 10_000_000_000;
        assert_eq!(rank("ledger", &f, now)[0], "ledger.tail");
        f.record("ledger.verify", now - 1000);
        f.record("ledger.verify", now - 500);
        assert_eq!(rank("ledger", &f, now)[0], "ledger.verify");
        let mut g = Frecency::default();
        for _ in 0..3 {
            g.record("ledger.verify", 0);
        }
        g.record("ledger.tail", now * 10);
        assert_eq!(rank("ledger", &g, now * 10)[0], "ledger.tail");
    }

    #[test]
    fn a_rule_18_free_text_is_a_search_never_an_action() {
        let f = Frecency::default();
        assert_eq!(
            resolve("ledger.tail", &f, 0),
            Action::Command("ledger.tail")
        );
        assert_eq!(
            resolve("settings.s", &f, 0),
            Action::Command("settings.set")
        );
        assert_eq!(
            resolve("delete everything", &f, 0),
            Action::Search("delete everything".into())
        );
        assert_eq!(resolve("", &f, 0), Action::Search(String::new()));
    }

    #[test]
    fn frecency_survives_a_round_trip() {
        let mut f = Frecency::default();
        f.record("job.list", 5);
        let g = Frecency::from_pairs(f.to_pairs());
        assert_eq!(g.score("job.list", 5), f.score("job.list", 5));
    }
}

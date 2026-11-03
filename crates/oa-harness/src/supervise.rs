//! Process supervision (spec D rule 15, D15): a handshake, a health check and a
//! restart budget for each supervised process. This is the policy and state
//! machine; spawning real children is wired by the shell and kernel.

use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    Running,
    /// Crashed or stopped; the supervisor may restart it.
    Stopped,
    /// The restart budget is exhausted. Pending tool calls become `raised`
    /// with a tool-failure reason, not a task failure.
    Failed,
}

impl State {
    pub fn as_str(self) -> &'static str {
        match self {
            State::Running => "running",
            State::Stopped => "stopped",
            State::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Service {
    pub name: String,
    pub state: State,
    pub restarts_used: u32,
    pub restart_budget: u32,
    pub version: String,
}

#[derive(Default)]
pub struct Supervisor {
    services: BTreeMap<String, Service>,
}

impl Supervisor {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers a process after its handshake reported its version.
    pub fn handshake(&mut self, name: &str, version: &str, restart_budget: u32) {
        self.services.insert(
            name.to_string(),
            Service {
                name: name.to_string(),
                state: State::Running,
                restarts_used: 0,
                restart_budget,
                version: version.to_string(),
            },
        );
    }

    /// A health check failed or the process exited. Returns whether to
    /// restart it.
    pub fn crashed(&mut self, name: &str) -> bool {
        let Some(s) = self.services.get_mut(name) else {
            return false;
        };
        if s.restarts_used >= s.restart_budget {
            s.state = State::Failed;
            false
        } else {
            s.restarts_used += 1;
            s.state = State::Stopped;
            true
        }
    }

    pub fn restarted(&mut self, name: &str) {
        if let Some(s) = self.services.get_mut(name) {
            if s.state == State::Stopped {
                s.state = State::Running;
            }
        }
    }

    pub fn status(&self) -> Vec<&Service> {
        self.services.values().collect()
    }

    pub fn get(&self, name: &str) -> Option<&Service> {
        self.services.get(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn d_ac_08_a_crash_marks_only_that_service_stopped_and_a_loop_ends_failed() {
        let mut s = Supervisor::new();
        s.handshake("harness", "0.1", 2);
        s.handshake("ocr", "0.1", 2);
        assert!(s.crashed("harness"));
        assert_eq!(s.get("harness").unwrap().state, State::Stopped);
        assert_eq!(
            s.get("ocr").unwrap().state,
            State::Running,
            "others keep working"
        );
        s.restarted("harness");
        assert!(s.crashed("harness"));
        s.restarted("harness");
        assert!(!s.crashed("harness"), "the budget is spent");
        assert_eq!(s.get("harness").unwrap().state, State::Failed);
    }
}

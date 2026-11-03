//! Replay from the trace store (spec D rule 8, D-AC-04). A recorded turn is
//! run again with a provider that must never be asked: every model call has to
//! be answered from the trace by request hash. The first request with no
//! recorded answer is the divergence.

use std::sync::{Arc, Mutex};

use crate::provider::{ModelRequest, Provider, ProviderError, ProviderUsage, Residency, Stream};
use crate::runner::{HarnessError, Outcome, Runner, TurnInput};
use std::sync::atomic::AtomicBool;

/// A provider that records that it was asked, and refuses.
struct Tripwire {
    asked: Mutex<u32>,
}

impl Provider for Tripwire {
    fn name(&self) -> &str {
        "replay"
    }

    fn residency(&self) -> Residency {
        Residency::Local
    }

    fn stream(&self, _: &ModelRequest) -> Result<Stream, ProviderError> {
        *self.asked.lock().unwrap_or_else(|p| p.into_inner()) += 1;
        Err(ProviderError::Outage("no recorded response".into()))
    }

    fn usage(&self, _: &ModelRequest) -> ProviderUsage {
        ProviderUsage {
            input_tokens: 0,
            output_tokens: 0,
            cost_micro: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplayReport {
    /// The step (zero based) whose request had no recorded answer, or `None`
    /// when the whole turn replayed from the trace.
    pub divergence: Option<u32>,
}

impl Runner {
    /// Replays an instruction against the recorded session. Effects already
    /// `returned` are reused, never run again, so a replay has no effects.
    pub fn replay(&self, input: TurnInput<'_>) -> Result<ReplayReport, HarnessError> {
        let trip = Arc::new(Tripwire {
            asked: Mutex::new(0),
        });
        let child = self.fork(trip, self.allowlist.clone());
        let report = child.run_turn(input, &AtomicBool::new(false))?;
        Ok(ReplayReport {
            divergence: match report.outcome {
                Outcome::ProviderOutage(_) => Some(report.steps),
                _ => None,
            },
        })
    }
}

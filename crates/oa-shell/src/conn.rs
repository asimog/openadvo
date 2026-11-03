//! Kernel connection state for the status bar (A-AC-20). Time is passed in so
//! the rule is testable without sleeping.

/// A lost connection must show within this many milliseconds.
pub const LOST_AFTER_MS: u64 = 2000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Conn {
    Connected { origin: String },
    Lost { since_ms: u64 },
    Never,
}

#[derive(Debug, Default)]
pub struct Monitor {
    origin: Option<String>,
    last_ok_ms: Option<u64>,
}

impl Monitor {
    pub fn ok(&mut self, now_ms: u64, origin: &str) {
        self.last_ok_ms = Some(now_ms);
        self.origin = Some(origin.to_string());
    }

    pub fn state(&self, now_ms: u64) -> Conn {
        match (self.last_ok_ms, &self.origin) {
            (Some(t), Some(o)) if now_ms.saturating_sub(t) <= LOST_AFTER_MS => {
                Conn::Connected { origin: o.clone() }
            }
            (Some(t), _) => Conn::Lost { since_ms: t },
            _ => Conn::Never,
        }
    }

    pub fn label(&self, now_ms: u64) -> String {
        match self.state(now_ms) {
            Conn::Connected { origin } => format!("Connected   origin: {origin}"),
            Conn::Lost { .. } => "Kernel connection lost. Input is disabled.".into(),
            Conn::Never => "Disconnected".into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_ac_20_the_status_shows_the_decided_origin_and_a_loss_within_two_seconds() {
        let mut m = Monitor::default();
        assert_eq!(m.state(0), Conn::Never);
        m.ok(1000, "ui");
        assert_eq!(m.label(1500), "Connected   origin: ui");
        assert_eq!(
            m.state(3000),
            Conn::Connected {
                origin: "ui".into()
            }
        );
        assert!(matches!(m.state(3001), Conn::Lost { .. }));
        assert!(m.label(3001).contains("lost"));
        m.ok(4000, "ui");
        assert!(matches!(m.state(4100), Conn::Connected { .. }));
    }
}

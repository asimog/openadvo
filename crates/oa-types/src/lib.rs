//! Types every Open Advocate crate shares: matter ids, connection origins,
//! command classes, record time and the error catalogue with its exit codes
//! (docs/specs/README.md, "CLI output and exit codes").

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use ulid::Ulid;

/// Where a connection comes from. Set by the kernel, never claimed by a client
/// (spec B rule 3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Origin {
    Ui,
    Cli,
    Harness,
    Test,
}

impl Origin {
    pub fn as_str(self) -> &'static str {
        match self {
            Origin::Ui => "ui",
            Origin::Cli => "cli",
            Origin::Harness => "harness",
            Origin::Test => "test",
        }
    }

    /// The actor recorded in the ledger for commands from this origin.
    pub fn actor(self) -> &'static str {
        match self {
            Origin::Harness => "agent",
            Origin::Test => "test",
            Origin::Ui | Origin::Cli => "advocate",
        }
    }
}

/// Every command has exactly one class (docs/specs/README.md, "Command classes").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandClass {
    Query,
    Internal,
    External,
    Human,
}

/// A matter id. The folder name is the bare ULID; the identity form is
/// `urn:ulos:matter:{ulid}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct MatterId(Ulid);

impl MatterId {
    pub fn new() -> Self {
        MatterId(Ulid::new())
    }

    pub fn urn(&self) -> String {
        format!("urn:ulos:matter:{}", self.0)
    }
}

impl Default for MatterId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for MatterId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for MatterId {
    type Err = OaError;

    /// Accepts the bare ULID or the `urn:ulos:matter:` form.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let bare = s.strip_prefix("urn:ulos:matter:").unwrap_or(s);
        Ulid::from_string(bare)
            .map(MatterId)
            .map_err(|_| OaError::new(ErrorCode::Usage, format!("not a matter id: {s}")))
    }
}

/// Record time: UTC, RFC 3339, milliseconds (docs/specs/README.md, "Time").
pub fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// A fresh idempotency key, for callers that did not supply one.
pub fn new_key() -> String {
    Ulid::new().to_string()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    Usage,
    NotFound,
    WorkspaceNotInitialised,
    Conflict,
    ConfirmationRequired,
    Cancelled,
    CheckFailed,
    ProtocolMismatch,
    WriteRefused,
    LegalLayerReadOnly,
    HumanCommandRefused,
    ConfirmationDenied,
    MatterRemoved,
    MatterDamaged,
    Unavailable,
    FaultInjected,
    Internal,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::Usage => "usage",
            ErrorCode::NotFound => "not_found",
            ErrorCode::WorkspaceNotInitialised => "workspace_not_initialised",
            ErrorCode::Conflict => "conflict",
            ErrorCode::ConfirmationRequired => "confirmation_required",
            ErrorCode::Cancelled => "cancelled",
            ErrorCode::CheckFailed => "check_failed",
            ErrorCode::ProtocolMismatch => "protocol_mismatch",
            ErrorCode::WriteRefused => "write_refused",
            ErrorCode::LegalLayerReadOnly => "legal_layer_read_only",
            ErrorCode::HumanCommandRefused => "human_command_refused",
            ErrorCode::ConfirmationDenied => "confirmation_denied",
            ErrorCode::MatterRemoved => "matter_removed",
            ErrorCode::MatterDamaged => "matter_damaged",
            ErrorCode::Unavailable => "unavailable",
            ErrorCode::FaultInjected => "fault_injected",
            ErrorCode::Internal => "internal",
        }
    }

    /// `oa` exit codes: 0 success, 1 negative result, 2 usage, 3 refused,
    /// 4 unknown effect, 5 dependency unavailable, 10 internal.
    pub fn exit_code(self) -> i32 {
        match self {
            ErrorCode::Conflict
            | ErrorCode::ConfirmationRequired
            | ErrorCode::Cancelled
            | ErrorCode::CheckFailed => 1,
            ErrorCode::Usage | ErrorCode::NotFound | ErrorCode::WorkspaceNotInitialised => 2,
            ErrorCode::WriteRefused
            | ErrorCode::LegalLayerReadOnly
            | ErrorCode::HumanCommandRefused
            | ErrorCode::ConfirmationDenied => 3,
            ErrorCode::MatterRemoved
            | ErrorCode::MatterDamaged
            | ErrorCode::Unavailable
            | ErrorCode::ProtocolMismatch => 5,
            ErrorCode::FaultInjected | ErrorCode::Internal => 10,
        }
    }
}

#[derive(Debug, Clone, thiserror::Error, Serialize, Deserialize)]
#[error("{}: {message}", code.as_str())]
pub struct OaError {
    pub code: ErrorCode,
    pub message: String,
    /// Extra typed detail, for example the pending confirmation id.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<serde_json::Value>,
}

impl OaError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        OaError {
            code,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: serde_json::Value) -> Self {
        self.detail = Some(detail);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matter_id_parses_bare_and_urn_forms() {
        let id = MatterId::new();
        assert_eq!(id.to_string().parse::<MatterId>().unwrap(), id);
        assert_eq!(id.urn().parse::<MatterId>().unwrap(), id);
        assert!("not-an-id".parse::<MatterId>().is_err());
    }

    #[test]
    fn record_time_is_utc_with_milliseconds() {
        let t = now_utc();
        assert!(t.ends_with('Z'), "{t}");
        assert_eq!(t.split('.').nth(1).map(|s| s.len()), Some(4), "{t}");
    }
}

//! The browser (spec M): one binary, one process per profile (RQ-80), the
//! agent's headless throwaway profile (RQ-81), egress policy with the hard
//! filing refusal (H-15), page extraction labelled untrusted (M07) and
//! download interception (M04, F06).
//!
//! Pure logic and the profile process. No kernel, no window. The visible
//! Chromium (CEF) embedded in the pane is not vendored: `oa-browser-profile`
//! is a stub behind the real process boundary (see `process`).

pub mod egress;
pub mod page;
pub mod port;
pub mod process;
pub mod profile;
pub mod supervisor;

pub use egress::{
    decide, is_filing_destination, parse_allow_list, Decision, EgressSpec, Initiator, Url,
    FILING_HOSTS, PUBLIC_LEGAL_SOURCES,
};
pub use page::{extract, Extraction, UNTRUSTED};
pub use port::SupervisedPort;
pub use process::{Connection, Cookie, DownloadFile, LaunchSpec, ProfileRequest, ProfileResponse};
pub use profile::{
    autofill, launch_plan, Credential, CredentialStore, LaunchPlan, Profile, ProfileConfig,
};
pub use supervisor::{
    intercept, sha256, BrowserError, InProcessLauncher, Intercepted, Launcher, ProcessLauncher,
    ProcessStatus, ProfileConn, Supervisor, Unavailable,
};

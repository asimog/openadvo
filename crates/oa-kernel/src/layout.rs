//! The matter workspace on disk (docs/component-map.md, "Workspace layout on
//! disk"). The manifest is a display copy of the current-state view in
//! `matter.db`; rescan repairs it when they differ.

use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const MANIFEST: &str = "manifest.json";
pub const STAGING: &str = ".staging";
pub const STANDARD_VERSION: &str = "0.1";
/// Stub until C14: no rule pack is pinned yet.
pub const RULE_PACK: &str = "unpinned";

pub const SUBDIRS: &[&str] = &[
    "inbox",
    "evidence",
    "blobs",
    "captures",
    "drafts",
    "drafts/external",
    "filings",
    "exports",
    "harness",
    "harness/scratch",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    pub id: String,
    pub urn: String,
    pub title: String,
    pub archived: bool,
    pub client_id: Option<String>,
    pub created_at: String,
    pub standard_version: String,
    pub rule_pack: String,
    /// The idempotency key of the `matter create` that made this folder, so a
    /// retried create can find it.
    pub creation_key: String,
}

pub fn create_layout(dir: &Path) -> io::Result<()> {
    for sub in SUBDIRS {
        fs::create_dir_all(dir.join(sub))?;
    }
    Ok(())
}

/// Writes through a temporary file and a rename, so a reader never sees a
/// half-written file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension("tmp-write");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

pub fn write_manifest(dir: &Path, manifest: &Manifest) -> io::Result<()> {
    let json = serde_json::to_vec_pretty(manifest).map_err(io::Error::other)?;
    write_atomic(&dir.join(MANIFEST), &json)
}

pub fn read_manifest(dir: &Path) -> Result<Manifest, String> {
    let bytes = fs::read(dir.join(MANIFEST)).map_err(|e| format!("manifest unreadable: {e}"))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("manifest invalid: {e}"))
}

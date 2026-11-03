//! Shared plumbing for matter-scoped commands, plus the ledger, audit and
//! rule-pin views (spec C rules 1, 3, 5 and 13).

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use oa_store::{LedgerEvent, MatterRow, MatterStore, MatterWrite};
use oa_types::{ErrorCode, OaError};
use serde_json::{json, Value};

use crate::layout;
use crate::ledger::{self, NewEvent};
use crate::{io_err, store_err, Ctx, Kernel};

/// A live matter: its registry row, its folder and its open store.
pub(crate) struct Live {
    pub row: MatterRow,
    pub dir: PathBuf,
    pub store: Box<dyn MatterStore>,
}

/// Writes bytes into the matter's content-addressed blob store (spec E rule 7):
/// a temporary file, synced, then renamed to its hash. Returns `sha256:{hex}`.
pub(crate) fn put_blob(dir: &Path, bytes: &[u8]) -> Result<String, OaError> {
    let hash = ledger::sha256_hex(bytes);
    let path = blob_path(dir, &hash);
    if path.is_file() {
        return Ok(hash);
    }
    let tmp = dir
        .join("blobs")
        .join(format!(".tmp-{}", ulid::Ulid::new()));
    let write = || -> std::io::Result<()> {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, &path)
    };
    write().map_err(|e| {
        let _ = fs::remove_file(&tmp);
        io_err("blob", e)
    })?;
    Ok(hash)
}

pub(crate) fn blob_path(dir: &Path, hash: &str) -> PathBuf {
    dir.join("blobs")
        .join(hash.strip_prefix("sha256:").unwrap_or(hash))
}

pub(crate) fn event_json(e: &LedgerEvent) -> Value {
    json!({
        "seq": e.seq,
        "recorded_at": e.recorded_at,
        "actor": e.actor,
        "origin": e.origin,
        "command": e.command,
        "idempotency_key": e.idempotency_key,
        "body": serde_json::from_str::<Value>(&e.body).unwrap_or(Value::Null),
        "prev_hash": e.prev_hash,
        "hash": e.hash,
    })
}

impl Kernel {
    pub(crate) fn live(&self, matter: &str) -> Result<Live, OaError> {
        let (row, dir) = self.locate(matter)?;
        let store = self.open_matter(&dir)?;
        Ok(Live { row, dir, store })
    }

    /// When this idempotency key already committed an event, returns what it
    /// recorded instead of acting again.
    pub(crate) fn replayed(&self, live: &Live, ctx: &Ctx) -> Result<Option<Value>, OaError> {
        Ok(live
            .store
            .event_by_key(ctx.key())
            .map_err(store_err)?
            .map(|e| json!({ "replayed": true, "event": event_json(&e) })))
    }

    /// The single commit path for matter-scoped changes: one ledger event and
    /// its writes in one transaction (spec C rule 1).
    pub(crate) fn commit_event(
        &self,
        live: &Live,
        ctx: &Ctx,
        command: &str,
        mut body: Value,
        writes: &[MatterWrite],
    ) -> Result<LedgerEvent, OaError> {
        let head = live.store.last_event().map_err(store_err)?.ok_or_else(|| {
            OaError::new(ErrorCode::MatterDamaged, "the ledger has no genesis event")
        })?;
        body["matter"] = json!(format!("urn:ulos:matter:{}", live.row.id));
        let event = ledger::build(NewEvent {
            seq: head.seq + 1,
            prev_hash: &head.hash,
            origin: ctx.origin,
            command,
            key: Some(ctx.key()),
            body,
        });
        live.store.commit(&event, writes).map_err(store_err)?;
        Ok(event)
    }

    pub(crate) fn ledger_tail(&self, matter: &str, n: Option<u32>) -> Result<Vec<Value>, OaError> {
        let events = self.live(matter)?.store.events().map_err(store_err)?;
        let n = n.unwrap_or(20) as usize;
        let skip = events.len().saturating_sub(n);
        Ok(events.iter().skip(skip).map(event_json).collect())
    }

    pub(crate) fn ledger_verify(&self, matter: &str) -> Result<Value, OaError> {
        let events = self.live(matter)?.store.events().map_err(store_err)?;
        match ledger::verify_chain(&events) {
            Ok(()) => Ok(json!({ "ok": true, "events": events.len() })),
            Err(b) => Err(OaError::new(
                ErrorCode::CheckFailed,
                format!(
                    "the ledger chain breaks at sequence {}: {}",
                    b.seq, b.reason
                ),
            )
            .with_detail(json!({ "first_bad_seq": b.seq, "reason": b.reason }))),
        }
    }

    pub(crate) fn audit_rejected(&self, matter: Option<&str>) -> Result<Vec<Value>, OaError> {
        let mut out: Vec<Value> = Vec::new();
        let mut push = |scope: &str, r: &oa_store::RejectedWrite| {
            out.push(json!({
                "scope": scope,
                "at": r.at,
                "actor": r.actor,
                "origin": r.origin,
                "command": r.command,
                "reason": r.reason,
                "body_hash": r.body_hash,
            }))
        };
        for r in self.firm()?.rejected().map_err(store_err)? {
            push("firm", &r);
        }
        if let Some(m) = matter {
            for r in self.live(m)?.store.rejected().map_err(store_err)? {
                push("matter", &r);
            }
        }
        Ok(out)
    }

    pub(crate) fn audit_commands(&self) -> Result<Vec<Value>, OaError> {
        Ok(self
            .firm()?
            .commands()
            .map_err(store_err)?
            .into_iter()
            .map(|c| {
                json!({
                    "at": c.at,
                    "actor": c.actor,
                    "origin": c.origin,
                    "command": c.command,
                    "idempotency_key": c.idempotency_key,
                    "matter": c.matter,
                })
            })
            .collect())
    }

    pub(crate) fn rules_pin(&self, matter: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let manifest = layout::read_manifest(&live.dir)
            .map_err(|e| OaError::new(ErrorCode::MatterDamaged, e))?;
        Ok(json!({
            "matter": live.row.id,
            "standard_version": manifest.standard_version,
            "rule_pack": manifest.rule_pack,
        }))
    }
}

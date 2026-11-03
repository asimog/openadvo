//! The hash-chained ledger (spec C rule 3). The event hash covers every field
//! except itself, as canonical JSON with sorted keys.

use oa_store::LedgerEvent;
use oa_types::Origin;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const GENESIS_PREV: &str =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";

pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("sha256:{}", hex::encode(Sha256::digest(bytes)))
}

/// Canonical JSON: `serde_json` objects keep keys sorted, and the output has
/// no insignificant whitespace.
pub fn canonical(value: &Value) -> String {
    serde_json::to_string(value).expect("a JSON value always serialises")
}

fn hash_of(e: &LedgerEvent) -> String {
    let unsigned = json!({
        "seq": e.seq,
        "recorded_at": e.recorded_at,
        "actor": e.actor,
        "origin": e.origin,
        "command": e.command,
        "idempotency_key": e.idempotency_key,
        "body": e.body,
        "prev_hash": e.prev_hash,
    });
    sha256_hex(canonical(&unsigned).as_bytes())
}

pub struct NewEvent<'a> {
    pub seq: i64,
    pub prev_hash: &'a str,
    pub origin: Origin,
    pub command: &'a str,
    pub key: Option<&'a str>,
    pub body: Value,
}

pub fn build(new: NewEvent<'_>) -> LedgerEvent {
    let mut e = LedgerEvent {
        seq: new.seq,
        recorded_at: oa_types::now_utc(),
        actor: new.origin.actor().to_string(),
        origin: new.origin.as_str().to_string(),
        command: new.command.to_string(),
        idempotency_key: new.key.map(str::to_string),
        body: canonical(&new.body),
        prev_hash: new.prev_hash.to_string(),
        hash: String::new(),
    };
    e.hash = hash_of(&e);
    e
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChainBreak {
    pub seq: i64,
    pub reason: &'static str,
}

/// Recomputes the chain. Returns the first bad sequence number.
pub fn verify_chain(events: &[LedgerEvent]) -> Result<(), ChainBreak> {
    let mut prev = GENESIS_PREV.to_string();
    for (i, e) in events.iter().enumerate() {
        let expected_seq = i as i64 + 1;
        if e.seq != expected_seq {
            return Err(ChainBreak {
                seq: expected_seq,
                reason: "sequence gap or reorder",
            });
        }
        if e.prev_hash != prev {
            return Err(ChainBreak {
                seq: e.seq,
                reason: "previous hash does not link",
            });
        }
        if hash_of(e) != e.hash {
            return Err(ChainBreak {
                seq: e.seq,
                reason: "event hash does not match its content",
            });
        }
        prev = e.hash.clone();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chain(n: i64) -> Vec<LedgerEvent> {
        let mut out: Vec<LedgerEvent> = Vec::new();
        for seq in 1..=n {
            let prev = out
                .last()
                .map(|e| e.hash.clone())
                .unwrap_or(GENESIS_PREV.into());
            out.push(build(NewEvent {
                seq,
                prev_hash: &prev,
                origin: Origin::Test,
                command: "test.event",
                key: None,
                body: json!({ "n": seq }),
            }));
        }
        out
    }

    #[test]
    fn intact_chain_verifies() {
        assert_eq!(verify_chain(&chain(4)), Ok(()));
    }

    #[test]
    fn edit_delete_and_swap_are_detected() {
        let mut edited = chain(4);
        edited[2].body = "{\"n\":99}".into();
        assert_eq!(verify_chain(&edited).unwrap_err().seq, 3);

        let mut deleted = chain(4);
        deleted.remove(1);
        assert_eq!(verify_chain(&deleted).unwrap_err().seq, 2);

        let mut swapped = chain(4);
        swapped.swap(1, 2);
        assert_eq!(verify_chain(&swapped).unwrap_err().seq, 2);
    }
}

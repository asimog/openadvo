//! Outbox: external effects and reconciliation (spec C rules 1, 13, 14).
//!
//! An external effect is an outbox row written in the same SQLite transaction
//! as its ledger event (rule 1). An effect whose outcome is not known is
//! `unknown` and is never retried before `oa outbox reconcile` (rule 14).

use oa_store::{MatterWrite, OutboxRow};
use oa_types::{ErrorCode, OaError};
use serde_json::{json, Value};

use crate::{store_err, Ctx, Kernel};

pub(crate) fn outbox_json(o: &OutboxRow) -> Value {
    let payload_val: Value =
        serde_json::from_str(&o.payload).unwrap_or(Value::String(o.payload.clone()));
    json!({
        "id": o.id,
        "created_at": o.created_at,
        "actor": o.actor,
        "origin": o.origin,
        "command": o.command,
        "idempotency_key": o.idempotency_key,
        "state": o.state,
        "payload": payload_val,
        "approval_id": o.approval_id,
        "attempt_count": o.attempt_count,
        "last_attempt_at": o.last_attempt_at,
        "outcome": o.outcome,
        "detail": o.detail,
    })
}

impl Kernel {
    /// Lists outbox external effects for a matter, optionally filtered by state.
    pub(crate) fn outbox_list(
        &self,
        matter: &str,
        state: Option<&str>,
    ) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        let rows = live.store.outbox(state).map_err(store_err)?;
        Ok(rows.iter().map(outbox_json).collect())
    }

    /// Reconciles an external effect whose outcome was unknown (C rule 14, RQ-29).
    pub(crate) fn outbox_reconcile(
        &self,
        ctx: &Ctx,
        matter: &str,
        id: &str,
        outcome: &str,
        detail: Option<&str>,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let entry = live
            .store
            .outbox_entry(id)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no outbox entry {id}")))?;

        if entry.state != "unknown" {
            return Err(OaError::new(
                ErrorCode::Conflict,
                format!(
                    "outbox entry {id} is in state '{}'; only unknown effects can be reconciled",
                    entry.state
                ),
            ));
        }

        // Reconciling records the outcome found (C-AC-24). `pending` would be
        // a retry and `unknown` resolves nothing, so neither is an outcome.
        let new_state = match outcome {
            "succeeded" | "done" => "done",
            "failed" => "failed",
            "sent" => "sent",
            other => {
                return Err(OaError::new(
                    ErrorCode::Usage,
                    format!("outcome must be done, succeeded, sent or failed, not '{other}'"),
                ))
            }
        };

        let now = oa_types::now_utc();
        self.commit_event(
            &live,
            ctx,
            "outbox.reconciled",
            json!({
                "outbox_id": id,
                "outcome": outcome,
                "state": new_state,
                "detail": detail,
            }),
            &[MatterWrite::UpdateOutboxState {
                id: id.to_string(),
                expected: "unknown".to_string(),
                state: new_state.to_string(),
                outcome: Some(outcome.to_string()),
                detail: detail.map(String::from),
                updated_at: now,
            }],
        )?;

        let updated = live
            .store
            .outbox_entry(id)
            .map_err(store_err)?
            .expect("outbox entry exists");
        Ok(outbox_json(&updated))
    }
}

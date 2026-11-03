//! Gates and approvals (spec C rules 10 and 11, step-1 part). An approval is
//! bound to the exact revision it judged, so it never satisfies a gate on a
//! different revision. Lapse and effect ordering arrive with D and L.

use oa_store::{ApprovalRow, MatterWrite};
use oa_types::{ErrorCode, OaError};
use serde_json::{json, Value};

use crate::{store_err, Ctx, Kernel};

const ACCEPTED: &str = "accepted";
const REJECTED: &str = "rejected";

pub(crate) fn approval_json(a: &ApprovalRow) -> Value {
    json!({
        "id": a.id,
        "gate": a.gate,
        "target": a.target,
        "requested_at": a.requested_at,
        "requested_by": a.requested_by,
        "decision": a.decision,
        "reason": a.reason,
        "decided_at": a.decided_at,
        "decided_by": a.decided_by,
    })
}

impl Kernel {
    pub(crate) fn approval_request(
        &self,
        ctx: &Ctx,
        matter: &str,
        gate: &str,
        target: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        if gate.trim().is_empty() {
            return Err(OaError::new(ErrorCode::Usage, "an approval needs a gate"));
        }
        if live.store.revision(target).map_err(store_err)?.is_none() {
            return Err(OaError::new(
                ErrorCode::NotFound,
                format!("no revision {target} in this matter"),
            ));
        }
        let row = ApprovalRow {
            id: ulid::Ulid::new().to_string(),
            gate: gate.to_string(),
            target: target.to_string(),
            requested_at: oa_types::now_utc(),
            requested_by: ctx.origin.actor().to_string(),
            decision: None,
            reason: None,
            decided_at: None,
            decided_by: None,
        };
        self.commit_event(
            &live,
            ctx,
            "approval.requested",
            json!({ "approval": row.id, "gate": gate, "target": target }),
            &[MatterWrite::InsertApproval(row.clone())],
        )?;
        Ok(approval_json(&row))
    }

    /// A human command: refused to the harness by `dispatch`, and confirmed by
    /// the person at the machine here.
    pub(crate) fn approval_decide(
        &self,
        ctx: &Ctx,
        matter: &str,
        id: &str,
        accept: bool,
        reason: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        if reason.trim().is_empty() {
            return Err(OaError::new(ErrorCode::Usage, "a decision needs a reason"));
        }
        let a = live
            .store
            .approval(id)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no approval {id}")))?;
        if a.decision.is_some() {
            return Err(OaError::new(
                ErrorCode::Conflict,
                format!("approval {id} is already decided"),
            ));
        }
        let decision = if accept { ACCEPTED } else { REJECTED };
        self.require_presence(&format!(
            "Record \"{decision}\" on gate {} for revision {}",
            a.gate, a.target
        ))?;
        let decided_at = oa_types::now_utc();
        let decided_by = ctx.origin.actor().to_string();
        self.commit_event(
            &live,
            ctx,
            "approval.decided",
            json!({ "approval": id, "gate": a.gate, "target": a.target, "decision": decision, "reason": reason }),
            &[MatterWrite::DecideApproval {
                id: id.to_string(),
                decision: decision.to_string(),
                reason: reason.to_string(),
                decided_at: decided_at.clone(),
                decided_by: decided_by.clone(),
            }],
        )?;
        let decided = live
            .store
            .approval(id)
            .map_err(store_err)?
            .expect("the approval was just decided");
        Ok(approval_json(&decided))
    }

    /// Every approval of the matter. An accepted approval whose target is no
    /// longer the head of its draft is marked stale (spec C, Approvals board).
    pub(crate) fn approval_list(&self, matter: &str) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        let heads: std::collections::BTreeSet<String> = live
            .store
            .drafts()
            .map_err(store_err)?
            .into_iter()
            .map(|d| d.head)
            .collect();
        Ok(live
            .store
            .approvals()
            .map_err(store_err)?
            .iter()
            .map(|a| {
                let mut v = approval_json(a);
                v["stale"] = json!(a.decision.is_some() && !heads.contains(&a.target));
                v["state"] = json!(a.decision.clone().unwrap_or_else(|| "pending".into()));
                v
            })
            .collect())
    }

    /// Whether a gate is satisfied for exactly this target. Approvals given on
    /// other revisions are reported as stale and never count (spec C rule 10).
    pub(crate) fn approval_status(
        &self,
        matter: &str,
        gate: &str,
        target: &str,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let all: Vec<ApprovalRow> = live
            .store
            .approvals()
            .map_err(store_err)?
            .into_iter()
            .filter(|a| a.gate == gate)
            .collect();
        let accepted = |a: &&ApprovalRow| a.decision.as_deref() == Some(ACCEPTED);
        let satisfied = all.iter().filter(accepted).any(|a| a.target == target);
        Ok(json!({
            "gate": gate,
            "target": target,
            "satisfied": satisfied,
            "for_target": all.iter().filter(|a| a.target == target).map(approval_json).collect::<Vec<_>>(),
            "stale": all.iter().filter(accepted).filter(|a| a.target != target).map(approval_json).collect::<Vec<_>>(),
        }))
    }
}

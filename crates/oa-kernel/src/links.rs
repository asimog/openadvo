//! The link index and the inspectable record (spec C rules 18 and 19).
//!
//! Links are derived from the ledger, never stored apart from it, so a rebuild
//! always gives the same answer (C-AC-21). Each event names its subject and the
//! records it references; the edge set is a pure function of the event list.

use std::collections::BTreeSet;

use oa_store::LedgerEvent;
use oa_types::{ErrorCode, OaError};
use serde_json::{json, Value};

use crate::approvals::approval_json;
use crate::drafts::{draft_json, revision_json};
use crate::evidence::evidence_json;
use crate::records::{event_json, Live};
use crate::{store_err, Kernel};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Edge {
    pub from: String,
    pub to: String,
    /// The ledger sequence that created the edge.
    pub seq: i64,
    pub via: String,
}

fn s(body: &Value, key: &str) -> Option<String> {
    body.get(key).and_then(Value::as_str).map(str::to_string)
}

/// A checkpoint has no id of its own, so it is addressed as `draft#name`.
pub fn checkpoint_id(draft: &str, name: &str) -> String {
    format!("{draft}#{name}")
}

/// The edge set of a ledger. Pure: the same events give the same edges.
pub fn edges(events: &[LedgerEvent]) -> Vec<Edge> {
    let mut out = BTreeSet::new();
    for e in events {
        let body: Value = serde_json::from_str(&e.body).unwrap_or(Value::Null);
        let mut add = |from: Option<String>, to: Option<String>| {
            if let (Some(from), Some(to)) = (from, to) {
                out.insert(Edge {
                    from,
                    to,
                    seq: e.seq,
                    via: e.command.clone(),
                });
            }
        };
        match e.command.as_str() {
            "evidence.added" => add(s(&body, "evidence"), s(&body, "blob")),
            "draft.created" => {
                add(s(&body, "draft"), s(&body, "revision"));
                add(s(&body, "revision"), s(&body, "draft"));
                add(s(&body, "revision"), s(&body, "blob"));
            }
            "draft.revised" => {
                add(s(&body, "revision"), s(&body, "draft"));
                add(s(&body, "revision"), s(&body, "parent"));
                add(s(&body, "revision"), s(&body, "blob"));
            }
            "draft.checkpointed" => {
                if let (Some(d), Some(n)) = (s(&body, "draft"), s(&body, "name")) {
                    let cp = checkpoint_id(&d, &n);
                    add(Some(cp.clone()), s(&body, "revision"));
                    add(Some(cp), Some(d));
                }
            }
            "draft.restored" => {
                add(s(&body, "revision"), s(&body, "draft"));
                add(s(&body, "revision"), s(&body, "parent"));
                if let (Some(d), Some(n)) = (s(&body, "draft"), s(&body, "checkpoint")) {
                    add(s(&body, "revision"), Some(checkpoint_id(&d, &n)));
                }
            }
            "approval.requested" | "approval.decided" => {
                add(s(&body, "approval"), s(&body, "target"));
            }
            _ => {}
        }
    }
    out.into_iter().collect()
}

/// Whether an event body names the id in any string value.
fn names(v: &Value, id: &str) -> bool {
    match v {
        Value::String(t) => t == id,
        Value::Array(a) => a.iter().any(|x| names(x, id)),
        Value::Object(m) => m.values().any(|x| names(x, id)),
        _ => false,
    }
}

fn edge_json(e: &Edge) -> Value {
    json!({ "from": e.from, "to": e.to, "seq": e.seq, "via": e.via })
}

impl Kernel {
    pub(crate) fn links_out(&self, matter: &str, id: &str) -> Result<Vec<Value>, OaError> {
        let events = self.live(matter)?.store.events().map_err(store_err)?;
        Ok(edges(&events)
            .iter()
            .filter(|e| e.from == id)
            .map(edge_json)
            .collect())
    }

    pub(crate) fn links_in(&self, matter: &str, id: &str) -> Result<Vec<Value>, OaError> {
        let events = self.live(matter)?.store.events().map_err(store_err)?;
        Ok(edges(&events)
            .iter()
            .filter(|e| e.to == id)
            .map(edge_json)
            .collect())
    }

    fn record_of(live: &Live, id: &str) -> Result<(&'static str, Value), OaError> {
        let st = &live.store;
        if let Some(r) = st.evidence(id).map_err(store_err)? {
            let origins = st.origins(id).map_err(store_err)?;
            return Ok(("evidence", evidence_json(live, &r, &origins)));
        }
        if let Some(d) = st.draft(id).map_err(store_err)? {
            return Ok(("draft", draft_json(&d)));
        }
        if let Some(r) = st.revision(id).map_err(store_err)? {
            return Ok(("revision", revision_json(live, &r)));
        }
        if let Some(a) = st.approval(id).map_err(store_err)? {
            return Ok(("approval", approval_json(&a)));
        }
        if let Some((d, n)) = id.split_once('#') {
            if let Some(c) = st.checkpoint(d, n).map_err(store_err)? {
                return Ok((
                    "checkpoint",
                    json!({ "draft": c.draft_id, "name": c.name, "revision": c.revision, "created_at": c.created_at }),
                ));
            }
        }
        if id == format!("urn:ulos:matter:{}", live.row.id) || id == live.row.id {
            return Ok((
                "matter",
                json!({ "id": live.row.id, "title": live.row.title, "archived": live.row.archived }),
            ));
        }
        if let Some(e) = st.evidence_by_blob(id).map_err(store_err)? {
            return Ok(("blob", json!({ "hash": id, "evidence": e.id })));
        }
        Err(OaError::new(
            ErrorCode::NotFound,
            format!("no record {id} in this matter"),
        ))
    }

    /// Any record, the ledger events that touched it and its links (C19).
    pub(crate) fn inspect(&self, matter: &str, id: &str) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        let (kind, record) = Self::record_of(&live, id)?;
        let events = live.store.events().map_err(store_err)?;
        let touched: Vec<Value> = events
            .iter()
            .filter(|e| {
                let body: Value = serde_json::from_str(&e.body).unwrap_or(Value::Null);
                names(&body, id)
                    || id
                        .split_once('#')
                        .is_some_and(|(d, n)| names(&body, d) && names(&body, n))
            })
            .map(event_json)
            .collect();
        let all = edges(&events);
        Ok(json!({
            "id": id,
            "kind": kind,
            "record": record,
            "events": touched,
            "links_out": all.iter().filter(|e| e.from == id).map(edge_json).collect::<Vec<_>>(),
            "links_in": all.iter().filter(|e| e.to == id).map(edge_json).collect::<Vec<_>>(),
        }))
    }
}

//! One search across every record kind (spec E rule 10).
//!
//! The filter language is a list of `field:value` clauses separated by
//! spaces. Every clause must match. `kind` is a field of every result.

use oa_types::{ErrorCode, OaError};
use serde_json::{json, Value};

use crate::{store_err, Kernel};

pub const KINDS: &[&str] = &[
    "matter",
    "evidence",
    "draft",
    "revision",
    "approval",
    "ledger_event",
];

/// A searchable record before matching.
pub struct Candidate {
    pub kind: &'static str,
    pub id: String,
    pub matter: Option<String>,
    pub title: String,
    pub text: String,
    pub fields: Value,
}

pub fn parse_filter(expr: &str) -> Result<Vec<(String, String)>, OaError> {
    expr.split_whitespace()
        .map(|clause| {
            clause
                .split_once(':')
                .filter(|(k, v)| !k.is_empty() && !v.is_empty())
                .map(|(k, v)| (k.to_lowercase(), v.to_lowercase()))
                .ok_or_else(|| {
                    OaError::new(
                        ErrorCode::Usage,
                        format!("filter clause {clause:?} is not field:value"),
                    )
                })
        })
        .collect()
}

fn field_text(c: &Candidate, key: &str) -> Option<String> {
    match key {
        "kind" => Some(c.kind.to_string()),
        "matter" => c.matter.clone(),
        other => c.fields.get(other).map(|v| match v {
            Value::String(s) => s.clone(),
            v => v.to_string(),
        }),
    }
}

/// Matches candidates against the query words and the filter. Pure.
pub fn matching(
    candidates: Vec<Candidate>,
    query: &str,
    kinds: &[String],
    filter: &[(String, String)],
) -> Vec<Value> {
    let words: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
    candidates
        .into_iter()
        .filter(|c| kinds.is_empty() || kinds.iter().any(|k| k == c.kind))
        .filter(|c| {
            let hay = format!("{} {} {}", c.id, c.title, c.text).to_lowercase();
            words.iter().all(|w| hay.contains(w))
        })
        .filter(|c| {
            filter.iter().all(|(k, v)| {
                field_text(c, k).is_some_and(|t| t.to_lowercase().contains(v.as_str()))
            })
        })
        .map(|c| {
            json!({
                "kind": c.kind,
                "id": c.id,
                "matter": c.matter,
                "title": c.title,
                "snippet": c.text.chars().take(120).collect::<String>(),
            })
        })
        .collect()
}

impl Kernel {
    fn matter_candidates(&self, id: &str, out: &mut Vec<Candidate>) -> Result<(), OaError> {
        let live = self.live(id)?;
        let st = &live.store;
        for e in st.evidence_list().map_err(store_err)? {
            out.push(Candidate {
                kind: "evidence",
                id: e.id.clone(),
                matter: Some(id.to_string()),
                title: e.original_name.clone(),
                text: format!("{} {}", e.primary_origin, e.blob),
                fields: json!({ "origin": e.primary_origin, "blob": e.blob }),
            });
        }
        for d in st.drafts().map_err(store_err)? {
            for r in st.revisions(&d.id).map_err(store_err)? {
                out.push(Candidate {
                    kind: "revision",
                    id: r.hash.clone(),
                    matter: Some(id.to_string()),
                    title: format!("{} revision", d.title),
                    text: format!("{} {}", r.author, r.note.clone().unwrap_or_default()),
                    fields: json!({ "draft": d.id, "author": r.author, "author_kind": r.author_kind }),
                });
            }
            out.push(Candidate {
                kind: "draft",
                id: d.id.clone(),
                matter: Some(id.to_string()),
                title: d.title.clone(),
                text: d.head.clone(),
                fields: json!({ "head": d.head }),
            });
        }
        for a in st.approvals().map_err(store_err)? {
            let state = a.decision.clone().unwrap_or_else(|| "pending".into());
            out.push(Candidate {
                kind: "approval",
                id: a.id.clone(),
                matter: Some(id.to_string()),
                title: format!("{} gate", a.gate),
                text: format!(
                    "{} {} {}",
                    a.gate,
                    a.target,
                    a.reason.clone().unwrap_or_default()
                ),
                fields: json!({ "gate": a.gate, "state": state, "target": a.target }),
            });
        }
        for e in st.events().map_err(store_err)? {
            out.push(Candidate {
                kind: "ledger_event",
                id: format!("event:{}", e.seq),
                matter: Some(id.to_string()),
                title: e.command.clone(),
                text: e.body.clone(),
                fields: json!({ "command": e.command, "actor": e.actor, "origin": e.origin, "seq": e.seq }),
            });
        }
        Ok(())
    }

    pub(crate) fn find(
        &self,
        matter: Option<&str>,
        query: &str,
        kinds: &[String],
        filter: Option<&str>,
    ) -> Result<Vec<Value>, OaError> {
        if let Some(bad) = kinds.iter().find(|k| !KINDS.contains(&k.as_str())) {
            return Err(OaError::new(
                ErrorCode::Usage,
                format!("unknown kind {bad:?}; kinds are {}", KINDS.join(", ")),
            ));
        }
        let filter = parse_filter(filter.unwrap_or(""))?;
        let mut cands = Vec::new();
        let rows = self.registry()?.matters().map_err(store_err)?;
        let wanted: Vec<_> = rows
            .into_iter()
            .filter(|r| !r.removed && matter.is_none_or(|m| m == r.id))
            .collect();
        if let Some(m) = matter {
            if wanted.is_empty() {
                return Err(OaError::new(ErrorCode::NotFound, format!("no matter {m}")));
            }
        }
        for r in &wanted {
            cands.push(Candidate {
                kind: "matter",
                id: r.id.clone(),
                matter: Some(r.id.clone()),
                title: r.title.clone(),
                text: r.path.clone(),
                fields: json!({ "archived": r.archived }),
            });
            self.matter_candidates(&r.id, &mut cands)?;
        }
        Ok(matching(cands, query, kinds, &filter))
    }
}

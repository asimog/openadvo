//! Settings in two layers (spec A rule 10). The legal layer is compiled in
//! and read only. Firm preferences live in `firm.db` and cannot use a legal
//! key.

use oa_types::{ErrorCode, OaError};
use serde_json::{json, Value};

use crate::{store_err, Ctx, Kernel};

/// Stub until C14 rule packs: the legal layer's keys and values.
const LEGAL_LAYER: &[(&str, &str)] = &[
    ("legal.blocker_list_version", "1"),
    ("legal.outcome_mapping_version", "1"),
    ("legal.rule_pack", "unpinned"),
];

fn is_legal(key: &str) -> bool {
    key == "legal" || key.starts_with("legal.")
}

fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.split('.').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
        })
}

impl Kernel {
    pub(crate) fn settings_get(&self, key: &str) -> Result<Value, OaError> {
        if is_legal(key) {
            return LEGAL_LAYER
                .iter()
                .find(|(k, _)| *k == key)
                .map(|(k, v)| json!({ "key": k, "value": v, "layer": "legal" }))
                .ok_or_else(|| {
                    OaError::new(ErrorCode::NotFound, format!("no legal setting {key}"))
                });
        }
        self.firm()?
            .setting(key)
            .map_err(store_err)?
            .map(|v| json!({ "key": key, "value": v, "layer": "firm" }))
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no setting {key}")))
    }

    /// Both layers, each value with its source (spec A, Settings).
    pub(crate) fn settings_list(&self) -> Result<Vec<Value>, OaError> {
        let mut out: Vec<Value> = LEGAL_LAYER
            .iter()
            .map(|(k, v)| json!({ "key": k, "value": v, "layer": "legal" }))
            .collect();
        for (k, v) in self.firm()?.settings().map_err(store_err)? {
            out.push(json!({ "key": k, "value": v, "layer": "firm" }));
        }
        Ok(out)
    }

    pub(crate) fn settings_set(&self, ctx: &Ctx, key: &str, value: &str) -> Result<Value, OaError> {
        if is_legal(key) {
            let reason = "the legal layer is read only";
            self.audit_firm(
                ctx,
                "settings.set",
                reason,
                format!("{key}={value}").as_bytes(),
            )?;
            return Err(OaError::new(
                ErrorCode::LegalLayerReadOnly,
                format!("{key}: {reason}"),
            ));
        }
        if !valid_key(key) {
            return Err(OaError::new(
                ErrorCode::Usage,
                format!("{key:?} is not a valid key: use lowercase dotted words"),
            ));
        }
        if key.starts_with("browser.allow") && ctx.origin == oa_types::Origin::Harness {
            let reason = "the agent cannot change a browser allow list (M09)";
            self.audit_firm(
                ctx,
                "settings.set",
                reason,
                format!("{key}={value}").as_bytes(),
            )?;
            return Err(OaError::new(ErrorCode::WriteRefused, reason));
        }
        self.firm()?
            .set_setting(key, value, &oa_types::now_utc())
            .map_err(store_err)?;
        Ok(json!({ "key": key, "value": value, "layer": "firm" }))
    }
}

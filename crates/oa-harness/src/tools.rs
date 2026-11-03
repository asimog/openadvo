//! The tool registry and policy (spec D rules 10, 11, 14 and 22).
//!
//! Tools are control commands the harness may call. Policy is default deny:
//! a query is allowed, anything with an effect needs a grant, and a `human`
//! class tool is never callable by the harness.

use std::collections::{BTreeMap, BTreeSet};

use oa_types::CommandClass;
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
pub struct ToolSpec {
    pub name: String,
    pub class: CommandClass,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolError {
    /// The tool ran and failed. Recorded `raised`.
    Failed(String),
    /// The tool cannot say whether it took effect.
    Unknown(String),
}

pub trait Tool: Send + Sync {
    fn spec(&self) -> &ToolSpec;
    fn call(&self, args: &Value) -> Result<Value, ToolError>;
}

/// What an adapter supports and does not (spec D rule 10).
#[derive(Debug, Clone, Serialize)]
pub struct Manifest {
    pub adapter: String,
    pub supports: BTreeSet<String>,
    pub unsupported: BTreeSet<String>,
}

#[derive(Default)]
pub struct Registry {
    tools: BTreeMap<String, Box<dyn Tool>>,
    manifests: BTreeMap<String, Manifest>,
    /// Which adapter serves each tool.
    adapter_of: BTreeMap<String, String>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, tool: Box<dyn Tool>) {
        self.tools.insert(tool.spec().name.clone(), tool);
    }

    pub fn add_for(&mut self, adapter: &Manifest, tool: Box<dyn Tool>) {
        self.adapter_of
            .insert(tool.spec().name.clone(), adapter.adapter.clone());
        self.manifests
            .insert(adapter.adapter.clone(), adapter.clone());
        self.add(tool);
    }

    pub fn get(&self, name: &str) -> Option<&dyn Tool> {
        self.tools.get(name).map(|t| t.as_ref())
    }

    pub fn list(&self) -> Vec<&ToolSpec> {
        self.tools.values().map(|t| t.spec()).collect()
    }

    /// The machine-readable registry `oa tools list --json` prints.
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "tools": self.list(),
            "manifests": self.manifests.values().collect::<Vec<_>>(),
        })
    }

    /// Refuses a tool call that claims a capability its adapter omits (D-AC-09).
    pub fn check_claims(&self, tool: &str, args: &Value) -> Result<(), String> {
        let claims: Vec<&str> = args["capabilities"]
            .as_array()
            .map(|a| a.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default();
        if claims.is_empty() {
            return Ok(());
        }
        let manifest = self
            .adapter_of
            .get(tool)
            .and_then(|a| self.manifests.get(a))
            .ok_or_else(|| {
                format!("{tool} has no capability manifest, so it supports no claims")
            })?;
        for c in claims {
            if !manifest.supports.contains(c) {
                return Err(format!(
                    "adapter {} does not support capability {c}",
                    manifest.adapter
                ));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    Allow,
    Deny(String),
}

/// Default deny (rule 11). Grants name a tool, or `class:internal` and
/// `class:external` for a whole class.
#[derive(Debug, Clone, Default)]
pub struct Policy {
    grants: BTreeSet<String>,
}

impl Policy {
    pub fn deny_all() -> Self {
        Policy::default()
    }

    pub fn grant(&mut self, grant: &str) {
        self.grants.insert(grant.to_string());
    }

    pub fn grants(&self) -> Vec<&str> {
        self.grants.iter().map(String::as_str).collect()
    }

    pub fn check(&self, spec: &ToolSpec) -> Verdict {
        match spec.class {
            CommandClass::Query => Verdict::Allow,
            CommandClass::Human => Verdict::Deny(format!(
                "{} is a human command; the harness never issues one",
                spec.name
            )),
            CommandClass::Internal | CommandClass::External => {
                let class = if spec.class == CommandClass::Internal {
                    "class:internal"
                } else {
                    "class:external"
                };
                // An external effect needs a grant naming the tool itself.
                let ok = self.grants.contains(&spec.name)
                    || (spec.class == CommandClass::Internal && self.grants.contains(class));
                if ok {
                    Verdict::Allow
                } else {
                    Verdict::Deny(format!(
                        "{} ({:?}) has no grant; policy is default deny",
                        spec.name, spec.class
                    ))
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fake(ToolSpec);
    impl Tool for Fake {
        fn spec(&self) -> &ToolSpec {
            &self.0
        }
        fn call(&self, _: &Value) -> Result<Value, ToolError> {
            Ok(Value::Null)
        }
    }

    fn spec(name: &str, class: CommandClass) -> ToolSpec {
        ToolSpec {
            name: name.into(),
            class,
            description: String::new(),
        }
    }

    #[test]
    fn default_deny_allows_queries_and_refuses_effects_and_human_commands() {
        let mut p = Policy::deny_all();
        assert_eq!(p.check(&spec("find", CommandClass::Query)), Verdict::Allow);
        assert!(matches!(
            p.check(&spec("draft.commit", CommandClass::Internal)),
            Verdict::Deny(_)
        ));
        p.grant("class:internal");
        assert_eq!(
            p.check(&spec("draft.commit", CommandClass::Internal)),
            Verdict::Allow
        );
        assert!(
            matches!(
                p.check(&spec("outbox.send", CommandClass::External)),
                Verdict::Deny(_)
            ),
            "a class grant never covers an external tool"
        );
        p.grant("outbox.send");
        assert_eq!(
            p.check(&spec("outbox.send", CommandClass::External)),
            Verdict::Allow
        );
        p.grant("approval.decide");
        assert!(matches!(
            p.check(&spec("approval.decide", CommandClass::Human)),
            Verdict::Deny(_)
        ));
    }

    #[test]
    fn d_ac_09_a_claim_the_manifest_omits_is_refused_with_a_reason() {
        let manifest = Manifest {
            adapter: "browser".into(),
            supports: ["navigate".to_string()].into(),
            unsupported: ["upload".to_string()].into(),
        };
        let mut r = Registry::new();
        r.add_for(
            &manifest,
            Box::new(Fake(spec("browser.go", CommandClass::External))),
        );
        let ok = serde_json::json!({ "capabilities": ["navigate"] });
        let bad = serde_json::json!({ "capabilities": ["navigate", "upload"] });
        assert!(r.check_claims("browser.go", &ok).is_ok());
        let err = r.check_claims("browser.go", &bad).unwrap_err();
        assert!(err.contains("upload"), "{err}");
        assert!(r.to_json()["manifests"][0]["adapter"] == "browser");
    }
}

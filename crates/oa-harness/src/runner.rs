//! The one turn loop (spec D rules 2, 5 to 8, 16 to 22). Exactly one crate
//! contains a turn loop (D-AC-11); this is it. The loop owns the session, not a
//! provider framework (C-6).

use std::collections::BTreeSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use oa_session::{EffectRow, EffectState, Fence, RunRow, SessionError, SessionStore, Usage};
use oa_types::CommandClass;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::context::{
    assemble, request_hash, ContextConfig, Input, Instruction, MatterSearch, NoSearch,
};
use crate::provider::{Message, Provider, ProviderError, StreamItem};
use crate::router::{decide, Confidentiality, Decision};
use crate::tools::{Policy, Registry, ToolError, Verdict};

pub struct Config {
    /// The model sees at most this many characters of one tool result (D19).
    pub result_limit: usize,
    pub max_steps: u32,
    /// Tokens (input plus output) one turn may spend before it asks.
    pub budget_tokens: u64,
    pub page_budget: usize,
    /// No progress for this long marks a run stalled (D-AC-19).
    pub stall_ms: u64,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            result_limit: 2000,
            max_steps: 64,
            budget_tokens: 200_000,
            page_budget: 8,
            stall_ms: 120_000,
        }
    }
}

/// Where a test may kill the harness (D-AC-02, D-AC-03).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Boundary {
    BeforeEffect,
    AfterIntentBeforeCall,
    AfterCallBeforeReturn,
}

pub type Fault = Box<dyn Fn(Boundary) -> bool + Send + Sync>;

#[derive(Debug, PartialEq, Eq)]
pub enum HarnessError {
    /// A fault hook killed the harness at a boundary.
    Crashed(Boundary),
    Session(String),
}

impl From<SessionError> for HarnessError {
    fn from(e: SessionError) -> Self {
        HarnessError::Session(e.message)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Answered(String),
    Cancelled,
    /// The turn stopped at a safe point and asks the advocate (D-AC-14).
    NeedsAdvocate(String),
    /// A provider outage; the turn can resume (D-AC-13).
    ProviderOutage(String),
    /// The router refused to send text to this provider.
    Blocked(String),
    StepLimit,
}

impl Outcome {
    fn label(&self) -> &'static str {
        match self {
            Outcome::Answered(_) => "answered",
            Outcome::Cancelled => "cancelled",
            Outcome::NeedsAdvocate(_) => "needs_advocate",
            Outcome::ProviderOutage(_) => "provider_outage",
            Outcome::Blocked(_) => "blocked",
            Outcome::StepLimit => "step_limit",
        }
    }
}

/// A tool card: what the advocate sees for one call (spec D, Tool card).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolCard {
    pub call_id: String,
    pub tool: String,
    pub class: Option<CommandClass>,
    /// `returned`, `raised`, `unknown` or `refused`.
    pub state: String,
    pub result: String,
    /// True when the model saw only a preview (D19).
    pub preview_only: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Report {
    pub turn: u64,
    pub outcome: Outcome,
    pub cards: Vec<ToolCard>,
    pub usage: Usage,
    pub steps: u32,
}

pub struct TurnInput<'a> {
    pub text: &'a str,
    pub origin: &'a str,
    pub plan_step: Option<&'a str>,
    pub untrusted: Vec<(String, String)>,
}

impl<'a> TurnInput<'a> {
    pub fn advocate(text: &'a str) -> Self {
        TurnInput {
            text,
            origin: "cli",
            plan_step: None,
            untrusted: Vec::new(),
        }
    }
}

pub struct Runner {
    pub provider: Arc<dyn Provider>,
    pub registry: Arc<Registry>,
    pub policy: Policy,
    pub session: Arc<dyn SessionStore>,
    pub search: Arc<dyn MatterSearch>,
    pub label: Confidentiality,
    pub config: Config,
    pub fence: Fence,
    /// A sub-agent's tool allowlist. `None` is the orchestrator.
    pub allowlist: Option<BTreeSet<String>>,
    pub fault: Option<Fault>,
    pub clock: Arc<dyn Fn() -> u64 + Send + Sync>,
    lifecycle: Mutex<Vec<String>>,
}

fn short_hash(s: &str) -> String {
    hex::encode(&Sha256::digest(s.as_bytes())[..8])
}

/// The hash an effect row records for its arguments.
pub fn args_hash(args: &Value) -> String {
    short_hash(&args.to_string())
}

impl Runner {
    pub fn new(
        provider: Arc<dyn Provider>,
        registry: Arc<Registry>,
        policy: Policy,
        session: Arc<dyn SessionStore>,
    ) -> Result<Self, SessionError> {
        let fence = session.claim()?;
        Ok(Runner {
            provider,
            registry,
            policy,
            session,
            search: Arc::new(NoSearch),
            label: Confidentiality::Normal,
            config: Config::default(),
            fence,
            allowlist: None,
            fault: None,
            clock: Arc::new(|| 0),
            lifecycle: Mutex::new(Vec::new()),
        })
    }

    /// Lifecycle facts, for their own outbox topic (rule 20).
    pub fn lifecycle(&self) -> Vec<String> {
        self.lifecycle
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    fn publish(&self, fact: &str) {
        self.lifecycle
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .push(fact.to_string());
    }

    fn crash(&self, at: Boundary) -> Result<(), HarnessError> {
        match &self.fault {
            Some(f) if f(at) => Err(HarnessError::Crashed(at)),
            _ => Ok(()),
        }
    }

    /// After a restart: effects left `started` become `unknown` (rule 6).
    pub fn recover(&self) -> Result<usize, HarnessError> {
        Ok(self.session.mark_started_unknown(self.fence)?)
    }

    fn run_row(&self, status: &str, detail: &str) -> RunRow {
        let now = (self.clock)();
        RunRow {
            status: status.into(),
            detail: detail.into(),
            since_ms: now,
            last_progress_ms: now,
        }
    }

    /// Marks the run blocked on a gate. It belongs to the orchestrator's run,
    /// never a sub-agent's (spec D, edge cases).
    pub fn block_on_gate(&self, gate: &str) -> Result<(), HarnessError> {
        self.session
            .set_run(self.fence, &self.run_row("blocked_on_gate", gate))?;
        self.publish(&format!("waiting:{gate}"));
        Ok(())
    }

    pub fn run_turn(
        &self,
        input: TurnInput<'_>,
        cancel: &AtomicBool,
    ) -> Result<Report, HarnessError> {
        let session = &self.session;
        let fence = self.fence;
        let instruction_id = session.record_instruction(fence, input.text, input.origin)?;
        let turn = session.begin_turn(fence, input.text)?;
        session.set_run(fence, &self.run_row("running", input.text))?;
        self.publish("run_opened");
        self.publish(&format!("turn_started:{turn}"));

        let mut history: Vec<Message> = Vec::new();
        let mut cards: Vec<ToolCard> = Vec::new();
        let mut usage = Usage::default();
        let mut step = 0u32;
        let ctx_cfg = ContextConfig {
            page_budget: self.config.page_budget,
        };

        let outcome = loop {
            if cancel.load(Ordering::SeqCst) {
                break Outcome::Cancelled;
            }
            if step >= self.config.max_steps {
                break Outcome::StepLimit;
            }
            if usage.input_tokens + usage.output_tokens >= self.config.budget_tokens {
                break Outcome::NeedsAdvocate(format!(
                    "the turn used its budget of {} tokens; continue?",
                    self.config.budget_tokens
                ));
            }
            // The orchestrator reads the notes as they are now, so an
            // advocate edit is what it reads next (D-AC-20).
            let notes = session.memory()?.map(|m| m.text);
            let material = self.search.search(input.text);
            let assembled = assemble(
                &ctx_cfg,
                Input {
                    notes: notes.as_deref(),
                    plan_step: input.plan_step,
                    instruction: Instruction {
                        text: input.text,
                        origin: input.origin,
                    },
                    material,
                    untrusted: input.untrusted.clone(),
                    history: history.clone(),
                },
            );
            session.put_manifest(
                fence,
                turn,
                step,
                &serde_json::to_string(&assembled.manifest).unwrap_or_default(),
            )?;
            let hash = request_hash(&assembled.request);

            // Resume: a recorded response for this exact request is replayed
            // instead of asking the model again (rule 8).
            let items: Vec<StreamItem> = match session.trace(&hash)? {
                Some(recorded) => serde_json::from_str(&recorded).unwrap_or_default(),
                None => {
                    if let Decision::Deny(reason) = decide(self.label, self.provider.residency()) {
                        break Outcome::Blocked(reason);
                    }
                    let stream = match self.provider.stream(&assembled.request) {
                        Ok(s) => s,
                        Err(e) => break Outcome::ProviderOutage(describe(&e)),
                    };
                    let mut got = Vec::new();
                    let mut interrupted = None;
                    for item in stream {
                        // A stream is cancelled between tokens (rule 2).
                        if cancel.load(Ordering::SeqCst) {
                            interrupted = Some(Outcome::Cancelled);
                            break;
                        }
                        match item {
                            Ok(i) => got.push(i),
                            Err(e) => {
                                interrupted = Some(Outcome::ProviderOutage(describe(&e)));
                                break;
                            }
                        }
                    }
                    if let Some(o) = interrupted {
                        break o;
                    }
                    let u = self.provider.usage(&assembled.request);
                    usage.input_tokens += u.input_tokens;
                    usage.output_tokens += u.output_tokens;
                    usage.cost_micro += u.cost_micro;
                    session.put_trace(
                        fence,
                        &hash,
                        &serde_json::to_string(&got).unwrap_or_default(),
                    )?;
                    got
                }
            };
            step += 1;

            let text: String = items
                .iter()
                .filter_map(|i| match i {
                    StreamItem::Token { text } => Some(text.as_str()),
                    _ => None,
                })
                .collect();
            let calls: Vec<(&String, &Value)> = items
                .iter()
                .filter_map(|i| match i {
                    StreamItem::ToolCall { name, args } => Some((name, args)),
                    _ => None,
                })
                .collect();
            if calls.is_empty() {
                break Outcome::Answered(text);
            }
            if !text.is_empty() {
                history.push(Message::Assistant { text });
            }
            for (i, (name, args)) in calls.into_iter().enumerate() {
                let call_id = short_hash(&format!("{hash}:{i}"));
                history.push(Message::ToolCall {
                    id: call_id.clone(),
                    name: name.clone(),
                    args: args.clone(),
                });
                let card = self.dispatch(turn, &call_id, name, args)?;
                let (shown, preview_only) = self.preview(&call_id, &card.result);
                history.push(Message::ToolResult {
                    id: call_id,
                    content: shown,
                });
                cards.push(ToolCard {
                    preview_only,
                    ..card
                });
            }
            session.set_run(fence, &self.run_row("running", "tool calls returned"))?;
        };

        let label = outcome.label();
        session.end_turn(fence, turn, label, &usage)?;
        session.finish_instruction(
            &instruction_id,
            match &outcome {
                Outcome::Cancelled => "cancelled",
                _ => "answered",
            },
        )?;
        self.publish(&format!("turn_ended:{turn}:{label}"));
        Ok(Report {
            turn,
            outcome,
            cards,
            usage,
            steps: step,
        })
    }

    /// The model sees at most `result_limit` characters (D19). The session
    /// keeps the whole result, and the cut is the same every replay.
    fn preview(&self, call_id: &str, full: &str) -> (String, bool) {
        let limit = self.config.result_limit;
        if full.chars().count() <= limit {
            return (full.to_string(), false);
        }
        let head: String = full.chars().take(limit).collect();
        (
            format!(
                "{head}\n[cut: showing {limit} of {} characters; call read_tool_result with id {call_id} to page through the whole result]",
                full.chars().count()
            ),
            true,
        )
    }

    fn refused(&self, call_id: &str, tool: &str, reason: String) -> ToolCard {
        ToolCard {
            call_id: call_id.into(),
            tool: tool.into(),
            class: None,
            state: "refused".into(),
            result: format!("refused: {reason}"),
            preview_only: false,
        }
    }

    fn dispatch(
        &self,
        turn: u64,
        call_id: &str,
        name: &str,
        args: &Value,
    ) -> Result<ToolCard, HarnessError> {
        let fence = self.fence;
        if name == "read_tool_result" {
            let id = args["id"].as_str().unwrap_or_default();
            let page = args["page"].as_u64().unwrap_or(0) as usize;
            let full = self.session.result(id)?.unwrap_or_default();
            let size = self.config.result_limit.max(1);
            let chunk: String = full.chars().skip(page * size).take(size).collect();
            return Ok(ToolCard {
                call_id: call_id.into(),
                tool: name.into(),
                class: Some(CommandClass::Query),
                state: "returned".into(),
                result: chunk,
                preview_only: false,
            });
        }
        if let Some(allow) = &self.allowlist {
            if !allow.contains(name) {
                return Ok(self.refused(
                    call_id,
                    name,
                    format!("{name} is not in this agent's tool allowlist"),
                ));
            }
        }
        let Some(tool) = self.registry.get(name) else {
            return Ok(self.refused(call_id, name, format!("no tool named {name}")));
        };
        let spec = tool.spec();
        if let Err(reason) = self.registry.check_claims(name, args) {
            return Ok(self.refused(call_id, name, reason));
        }
        if let Verdict::Deny(reason) = self.policy.check(spec) {
            return Ok(self.refused(call_id, name, reason));
        }
        let class = spec.class;
        if class == CommandClass::Query {
            let (state, result) = match tool.call(args) {
                Ok(v) => ("returned", stringify(&v)),
                Err(ToolError::Failed(m) | ToolError::Unknown(m)) => ("raised", m),
            };
            self.session.put_result(fence, call_id, &result)?;
            return Ok(ToolCard {
                call_id: call_id.into(),
                tool: name.into(),
                class: Some(class),
                state: state.into(),
                result,
                preview_only: false,
            });
        }

        // An effect: intent first, then the call, then the outcome (rule 6).
        if let Some(existing) = self.session.effect(call_id)? {
            let retryable = existing.state == EffectState::Raised
                && existing
                    .reason
                    .as_deref()
                    .is_some_and(|r| r.starts_with("reconciled: did not happen"));
            if !retryable {
                let result = match existing.state {
                    EffectState::Returned => existing.result.clone().unwrap_or_default(),
                    EffectState::Raised => existing.reason.clone().unwrap_or_default(),
                    EffectState::Unknown | EffectState::Started => format!(
                        "effect {call_id} is unknown and is not retried until reconciliation proves it did not happen"
                    ),
                };
                let state = if existing.state == EffectState::Started {
                    EffectState::Unknown
                } else {
                    existing.state
                };
                return Ok(ToolCard {
                    call_id: call_id.into(),
                    tool: name.into(),
                    class: Some(class),
                    state: state.as_str().into(),
                    result,
                    preview_only: false,
                });
            }
        }
        self.crash(Boundary::BeforeEffect)?;
        self.session.begin_effect(
            fence,
            &EffectRow {
                id: call_id.into(),
                turn,
                tool: name.into(),
                class: format!("{class:?}").to_lowercase(),
                args_hash: args_hash(args),
                state: EffectState::Started,
                result: None,
                reason: None,
            },
        )?;
        self.crash(Boundary::AfterIntentBeforeCall)?;
        let outcome = tool.call(args);
        self.crash(Boundary::AfterCallBeforeReturn)?;
        let (state, result, reason) = match outcome {
            Ok(v) => (EffectState::Returned, stringify(&v), None),
            Err(ToolError::Failed(m)) => (EffectState::Raised, m.clone(), Some(m)),
            Err(ToolError::Unknown(m)) => (EffectState::Unknown, m.clone(), Some(m)),
        };
        self.session
            .finish_effect(fence, call_id, state, Some(&result), reason.as_deref())?;
        self.session.put_result(fence, call_id, &result)?;
        Ok(ToolCard {
            call_id: call_id.into(),
            tool: name.into(),
            class: Some(class),
            state: state.as_str().into(),
            result,
            preview_only: false,
        })
    }

    /// Checks one `unknown` effect before any retry (rule 7). The checker
    /// reports whether the effect happened.
    pub fn reconcile(
        &self,
        effect_id: &str,
        check: &dyn Fn(&EffectRow) -> Reconciled,
    ) -> Result<EffectState, HarnessError> {
        let Some(row) = self.session.effect(effect_id)? else {
            return Err(HarnessError::Session(format!("no effect {effect_id}")));
        };
        if row.state != EffectState::Unknown {
            return Ok(row.state);
        }
        match check(&row) {
            Reconciled::Happened(result) => {
                self.session.finish_effect(
                    self.fence,
                    effect_id,
                    EffectState::Returned,
                    Some(&result),
                    None,
                )?;
                self.session.put_result(self.fence, effect_id, &result)?;
                Ok(EffectState::Returned)
            }
            Reconciled::DidNotHappen => {
                self.session.finish_effect(
                    self.fence,
                    effect_id,
                    EffectState::Raised,
                    None,
                    Some("reconciled: did not happen"),
                )?;
                Ok(EffectState::Raised)
            }
            Reconciled::CannotTell => Ok(EffectState::Unknown),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reconciled {
    Happened(String),
    DidNotHappen,
    /// The external system offers no check. Stays `unknown` and becomes a
    /// review item for the advocate.
    CannotTell,
}

fn stringify(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn describe(e: &ProviderError) -> String {
    match e {
        ProviderError::Outage(m) => format!("provider outage: {m}"),
        ProviderError::Malformed(m) => format!("provider returned malformed tool JSON: {m}"),
    }
}

impl Runner {
    /// A runner over the same session with another provider and allowlist.
    /// Sub-agents and replays are forks: a configuration, not a runtime.
    pub(crate) fn fork(
        &self,
        provider: Arc<dyn Provider>,
        allowlist: Option<BTreeSet<String>>,
    ) -> Runner {
        Runner {
            provider,
            registry: self.registry.clone(),
            policy: self.policy.clone(),
            session: self.session.clone(),
            search: self.search.clone(),
            label: self.label,
            config: Config {
                result_limit: self.config.result_limit,
                max_steps: self.config.max_steps,
                budget_tokens: self.config.budget_tokens,
                page_budget: self.config.page_budget,
                stall_ms: self.config.stall_ms,
            },
            fence: self.fence,
            allowlist,
            fault: None,
            clock: self.clock.clone(),
            lifecycle: Mutex::new(Vec::new()),
        }
    }
}

/// A typed sub-agent: an allowlist, a budget and a size-capped return
/// (rule 3, D-AC-07).
pub struct SubAgentSpec {
    pub name: String,
    pub allowlist: BTreeSet<String>,
    pub budget_tokens: u64,
    pub return_cap: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubReturn {
    pub text: String,
    pub manifest_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SubFailure {
    /// The return exceeded its cap; reported to the orchestrator as a tool
    /// failure (D-AC-07).
    ReturnTooLarge {
        cap: usize,
        got: usize,
    },
    DidNotAnswer(String),
    Harness(String),
}

impl Runner {
    /// Runs a sub-agent in this harness: a configuration, not a runtime. It
    /// shares the provider, registry and session, with its own allowlist.
    pub fn run_subagent(
        &self,
        spec: &SubAgentSpec,
        instruction: &str,
        cancel: &AtomicBool,
    ) -> Result<SubReturn, SubFailure> {
        let mut child = self.fork(self.provider.clone(), Some(spec.allowlist.clone()));
        child.config.budget_tokens = spec.budget_tokens;
        let report = child
            .run_turn(
                TurnInput {
                    text: instruction,
                    origin: "harness",
                    plan_step: None,
                    untrusted: Vec::new(),
                },
                cancel,
            )
            .map_err(|e| SubFailure::Harness(format!("{e:?}")))?;
        let manifest_hash = self
            .session
            .manifests(report.turn)
            .ok()
            .and_then(|m| m.last().cloned())
            .map(|(_, m)| format!("sha256:{}", hex::encode(Sha256::digest(m.as_bytes()))))
            .unwrap_or_default();
        match report.outcome {
            Outcome::Answered(text) => {
                let got = text.chars().count();
                if got > spec.return_cap {
                    return Err(SubFailure::ReturnTooLarge {
                        cap: spec.return_cap,
                        got,
                    });
                }
                Ok(SubReturn {
                    text,
                    manifest_hash,
                })
            }
            other => Err(SubFailure::DidNotAnswer(other.label().to_string())),
        }
    }
}

/// Runs waiting on you and stalled, from the session's run row (D-AC-19).
pub fn waiting(session: &dyn SessionStore, now_ms: u64, stall_ms: u64) -> Vec<Value> {
    let Ok(Some(run)) = session.run() else {
        return Vec::new();
    };
    match run.status.as_str() {
        "blocked_on_gate" => vec![json!({
            "why": "blocked_on_gate",
            "gate": run.detail,
            "since_ms": run.since_ms,
        })],
        "running" if now_ms.saturating_sub(run.last_progress_ms) > stall_ms => vec![json!({
            "why": "stalled",
            "since_ms": run.last_progress_ms,
        })],
        _ => Vec::new(),
    }
}

//! The harness commands of spec D: `oa tools`, `oa playbook`, `oa services`
//! and `oa agent`. Until the supervisor (D15) keeps a harness process alive,
//! `oa agent run` runs the one turn loop in this process. Its tool calls go to
//! the kernel with origin `harness`, never with the advocate's origin, so the
//! kernel refuses `human` commands to it exactly as it would to the real
//! harness process.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use clap::{Args, Subcommand};
use oa_client::{Client, InProcess};
use oa_harness::playbook;
use oa_harness::provider::{Provider, Residency, Scripted, StreamItem};
use oa_harness::supervise::Supervisor;
use oa_harness::tools::{Policy, Registry, Tool, ToolError, ToolSpec};
use oa_harness::{Outcome, Runner, TurnInput};
use oa_kernel::Request;
use oa_session::{EffectState, SessionStore};
use oa_store::session::SqliteSession;
use oa_types::{CommandClass, ErrorCode, OaError, Origin};
use serde_json::{json, Value};

#[derive(Args)]
pub struct MatterArg {
    #[arg(long)]
    matter: String,
}

#[derive(Subcommand)]
pub enum ToolsCmd {
    /// The registry with classes and whether the harness may call each
    List,
}

#[derive(Subcommand)]
pub enum PlaybookCmd {
    List,
    Show { id: String },
}

#[derive(Subcommand)]
pub enum ServicesCmd {
    /// Every supervised process, its health and restart budget
    Status,
}

#[derive(Subcommand)]
pub enum AgentCmd {
    /// Run one orchestrator turn for a matter
    Run {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        instruction: String,
        /// A JSON file of scripted model responses (an array of arrays of
        /// stream items). Until a provider adapter exists this is the only
        /// model source.
        #[arg(long)]
        script: Option<PathBuf>,
        /// Grant the harness every `internal` tool
        #[arg(long)]
        grant_internal: bool,
    },
    /// Turns, the current run and the budget used
    Status {
        #[command(flatten)]
        m: MatterArg,
    },
    /// Effect intents and their states
    Effects {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        state: Option<String>,
    },
    /// Reads or replaces the matter memory, attributed to the editor
    Memory {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long, value_name = "FILE")]
        edit: Option<PathBuf>,
    },
    /// Runs blocked on a gate or stalled
    Waiting {
        #[command(flatten)]
        m: MatterArg,
    },
    /// The whole result of a tool call, paged
    Result {
        #[command(flatten)]
        m: MatterArg,
        call: String,
        #[arg(long, default_value_t = 0)]
        page: usize,
    },
    /// The context manifest of each model call in a turn
    Context {
        #[command(flatten)]
        m: MatterArg,
        turn: u64,
    },
    /// Instructions as received and how each ended
    Instructions {
        #[command(flatten)]
        m: MatterArg,
    },
    /// Replays an instruction from the trace store and reports divergence
    Replay {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        instruction: String,
    },
    Steer {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        text: String,
    },
    Cancel {
        #[command(flatten)]
        m: MatterArg,
    },
}

fn unavailable(msg: impl Into<String>) -> OaError {
    OaError::new(ErrorCode::Unavailable, msg)
}

/// A control command offered to the model as a tool.
struct ControlTool {
    spec: ToolSpec,
    client: Arc<InProcess>,
}

impl Tool for ControlTool {
    fn spec(&self) -> &ToolSpec {
        &self.spec
    }

    fn call(&self, args: &Value) -> Result<Value, ToolError> {
        let envelope = json!({ "command": self.spec.name, "input": args });
        let req: Request = serde_json::from_value(envelope)
            .map_err(|e| ToolError::Failed(format!("{}: {e}", self.spec.name)))?;
        let key = (self.spec.class != CommandClass::Query).then(oa_types::new_key);
        match self.client.call(key, req) {
            Ok(mut v) if v.len() == 1 => Ok(v.remove(0)),
            Ok(v) => Ok(Value::Array(v)),
            Err(e) => Err(ToolError::Failed(format!(
                "{}: {}",
                e.code.as_str(),
                e.message
            ))),
        }
    }
}

fn control_registry(client: Arc<InProcess>) -> Registry {
    let mut r = Registry::new();
    for name in Request::NAMES {
        let class = Request::class_of_name(name).unwrap_or(CommandClass::Internal);
        r.add(Box::new(ControlTool {
            spec: ToolSpec {
                name: name.to_string(),
                class,
                description: format!("control command {name}"),
            },
            client: client.clone(),
        }));
    }
    r
}

pub fn tools_list() -> Vec<Value> {
    Request::NAMES
        .iter()
        .map(|name| {
            let class = Request::class_of_name(name).unwrap_or(CommandClass::Internal);
            json!({
                "name": name,
                "class": class,
                "harness_may_call": class != CommandClass::Human,
                "needs_grant": matches!(class, CommandClass::Internal | CommandClass::External),
            })
        })
        .collect()
}

pub fn playbook(cmd: PlaybookCmd) -> Result<Vec<Value>, OaError> {
    match cmd {
        PlaybookCmd::List => Ok(playbook::all()
            .iter()
            .map(|p| json!({ "id": p.id, "title": p.title, "stages": p.stages.len() }))
            .collect()),
        PlaybookCmd::Show { id } => {
            let pb = playbook::all()
                .into_iter()
                .find(|p| p.id == id)
                .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no playbook {id}")))?;
            Ok(vec![json!({
                "id": pb.id,
                "title": pb.title,
                "stages": pb.stages.iter().map(|s| json!({
                    "id": s.id, "title": s.title, "requires": s.requires,
                })).collect::<Vec<_>>(),
            })])
        }
    }
}

/// Services are supervised by the shell and kernel (D15). With no supervisor
/// running there is nothing to report but the registered kinds.
pub fn services() -> Vec<Value> {
    let mut s = Supervisor::new();
    s.handshake("kernel", env!("CARGO_PKG_VERSION"), 3);
    s.status()
        .iter()
        .map(|x| {
            json!({
                "name": x.name, "state": x.state.as_str(), "version": x.version,
                "restarts_used": x.restarts_used, "restart_budget": x.restart_budget,
                "note": "this process; harness, OCR, browser and ulos are not supervised yet",
            })
        })
        .collect()
}

fn matter_dir(client: &dyn Client, matter: &str) -> Result<PathBuf, OaError> {
    let list = client.call(
        None,
        Request::MatterList {
            include_removed: false,
        },
    )?;
    list.iter()
        .find(|m| m["id"] == matter)
        .and_then(|m| m["path"].as_str())
        .map(PathBuf::from)
        .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no matter {matter}")))
}

fn session_at(dir: &Path) -> Result<SqliteSession, OaError> {
    SqliteSession::open(&dir.join("harness").join("session.db"))
        .map_err(|e| unavailable(format!("session store: {e}")))
}

fn s_err(e: oa_session::SessionError) -> OaError {
    unavailable(format!("session store: {e}"))
}

pub fn agent(
    cmd: AgentCmd,
    user: &dyn Client,
    harness: Arc<InProcess>,
) -> Result<Vec<Value>, OaError> {
    match cmd {
        AgentCmd::Run {
            m,
            instruction,
            script,
            grant_internal,
        } => {
            let dir = matter_dir(user, &m.matter)?;
            let Some(script) = script else {
                return Err(unavailable(
                    "no model provider is configured; pass --script <responses.json> (a provider adapter arrives with D03)",
                ));
            };
            let text = std::fs::read_to_string(&script)
                .map_err(|e| OaError::new(ErrorCode::Usage, format!("{}: {e}", script.display())))?;
            let responses: Vec<Vec<StreamItem>> = serde_json::from_str(&text)
                .map_err(|e| OaError::new(ErrorCode::Usage, format!("script: {e}")))?;
            let session: Arc<dyn SessionStore> = Arc::new(session_at(&dir)?);
            let provider: Arc<dyn Provider> = Arc::new(Scripted::new(Residency::Local, responses));
            let mut policy = Policy::deny_all();
            if grant_internal {
                policy.grant("class:internal");
            }
            let runner = Runner::new(provider, Arc::new(control_registry(harness)), policy, session)
                .map_err(s_err)?;
            runner.recover().map_err(|e| unavailable(format!("{e:?}")))?;
            let report = runner
                .run_turn(
                    TurnInput {
                        text: &instruction,
                        origin: "cli",
                        plan_step: None,
                        untrusted: Vec::new(),
                    },
                    &AtomicBool::new(false),
                )
                .map_err(|e| unavailable(format!("{e:?}")))?;
            let (state, detail) = match &report.outcome {
                Outcome::Answered(t) => ("answered", t.clone()),
                Outcome::Cancelled => ("cancelled", String::new()),
                Outcome::NeedsAdvocate(t) => ("needs_advocate", t.clone()),
                Outcome::ProviderOutage(t) => ("provider_outage", t.clone()),
                Outcome::Blocked(t) => ("blocked", t.clone()),
                Outcome::StepLimit => ("step_limit", String::new()),
            };
            Ok(vec![json!({
                "turn": report.turn,
                "outcome": state,
                "text": detail,
                "steps": report.steps,
                "tools": report.cards.iter().map(|c| json!({
                    "call": c.call_id, "tool": c.tool, "state": c.state, "preview_only": c.preview_only,
                })).collect::<Vec<_>>(),
                "tokens_in": report.usage.input_tokens,
            })])
        }
        AgentCmd::Status { m } => {
            let s = session_at(&matter_dir(user, &m.matter)?)?;
            let turns = s.turns().map_err(s_err)?;
            Ok(vec![json!({
                "turns": turns.len(),
                "last_outcome": turns.last().map(|t| t.outcome.clone()),
                "run": s.run().map_err(s_err)?,
                "tokens_in": turns.iter().map(|t| t.usage.input_tokens).sum::<u64>(),
                "cost_micro": turns.iter().map(|t| t.usage.cost_micro).sum::<u64>(),
            })])
        }
        AgentCmd::Effects { m, state } => {
            let s = session_at(&matter_dir(user, &m.matter)?)?;
            let want = match state.as_deref().map(EffectState::parse) {
                Some(None) => {
                    return Err(OaError::new(
                        ErrorCode::Usage,
                        "state is one of started, returned, raised, unknown",
                    ))
                }
                Some(Some(x)) => Some(x),
                None => None,
            };
            let mut rows = s.effects().map_err(s_err)?;
            // Unknown effects come first (spec D, Effects view).
            rows.sort_by_key(|e| e.state != EffectState::Unknown);
            Ok(rows
                .into_iter()
                .filter(|e| want.is_none_or(|w| e.state == w))
                .map(|e| json!(e))
                .collect())
        }
        AgentCmd::Memory { m, edit } => {
            let s = session_at(&matter_dir(user, &m.matter)?)?;
            if let Some(file) = edit {
                let text = std::fs::read_to_string(&file)
                    .map_err(|e| OaError::new(ErrorCode::Usage, format!("{}: {e}", file.display())))?;
                s.set_memory(None, &text, "advocate").map_err(s_err)?;
            }
            Ok(vec![json!(s.memory().map_err(s_err)?)])
        }
        AgentCmd::Waiting { m } => {
            let s = session_at(&matter_dir(user, &m.matter)?)?;
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            Ok(oa_harness::waiting(&s, now, oa_harness::Config::default().stall_ms))
        }
        AgentCmd::Result { m, call, page } => {
            let s = session_at(&matter_dir(user, &m.matter)?)?;
            let full = s
                .result(&call)
                .map_err(s_err)?
                .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no tool call {call}")))?;
            let size = oa_harness::Config::default().result_limit;
            let chunk: String = full.chars().skip(page * size).take(size).collect();
            Ok(vec![json!({
                "call": call, "page": page, "page_size": size,
                "total_chars": full.chars().count(), "text": chunk,
            })])
        }
        AgentCmd::Context { m, turn } => {
            let s = session_at(&matter_dir(user, &m.matter)?)?;
            let ms = s.manifests(turn).map_err(s_err)?;
            if ms.is_empty() {
                return Err(OaError::new(ErrorCode::NotFound, format!("no manifest for turn {turn}")));
            }
            Ok(ms
                .into_iter()
                .map(|(step, m)| {
                    json!({ "step": step, "manifest": serde_json::from_str::<Value>(&m).unwrap_or(Value::Null) })
                })
                .collect())
        }
        AgentCmd::Instructions { m } => {
            let s = session_at(&matter_dir(user, &m.matter)?)?;
            Ok(s.instructions().map_err(s_err)?.into_iter().map(|i| json!(i)).collect())
        }
        AgentCmd::Replay { m, instruction } => {
            let dir = matter_dir(user, &m.matter)?;
            let session: Arc<dyn SessionStore> = Arc::new(session_at(&dir)?);
            let provider: Arc<dyn Provider> = Arc::new(Scripted::new(Residency::Local, vec![]));
            let runner = Runner::new(
                provider,
                Arc::new(control_registry(harness)),
                Policy::deny_all(),
                session,
            )
            .map_err(s_err)?;
            let r = runner
                .replay(TurnInput::advocate(&instruction))
                .map_err(|e| unavailable(format!("{e:?}")))?;
            Ok(vec![json!({ "divergence_step": r.divergence })])
        }
        AgentCmd::Steer { .. } | AgentCmd::Cancel { .. } => Err(unavailable(
            "no harness process is running; steer and cancel need the supervisor (D15), and `oa agent run` is a single in-process turn",
        )),
    }
}

pub fn harness_client(kernel: oa_kernel::Kernel) -> Arc<InProcess> {
    Arc::new(InProcess::new(kernel, Origin::Harness))
}

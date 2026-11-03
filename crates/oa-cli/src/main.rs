//! `oa`: parses arguments, sends one request, prints the response. It holds no
//! logic of its own (spec B: "the CLI holds no logic").
//!
//! By default `oa` runs a headless kernel in this process, for scripted runs.
//! With `--connect` it talks to a running kernel (`oa kernel serve`) over the
//! control pipe, and the kernel decides the connection's origin.

use std::io::{BufRead, IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;

use clap::{Args, Parser, Subcommand};
mod harness_cmds;

use oa_client::{Client, InProcess, PipeClient};
use oa_kernel::{Attachment, ClientSpec, Hooks, Kernel, PresencePrompt, Request};
use oa_store::sqlite::SqliteFactory;
use oa_types::{ErrorCode, OaError, Origin};
use serde_json::Value;

#[derive(Parser)]
#[command(name = "oa", version, about = "Open Advocate control CLI")]
struct Cli {
    /// One JSON object per line on stdout, and nothing else.
    #[arg(long, global = true)]
    json: bool,
    /// Application data folder. Defaults to OA_APP_DATA, then %APPDATA%\OpenAdvocate.
    #[arg(long, global = true, value_name = "DIR")]
    app_data: Option<PathBuf>,
    /// Idempotency key for internal commands. Generated when omitted.
    #[arg(long, global = true, value_name = "KEY")]
    idempotency_key: Option<String>,
    /// Talk to a running kernel over the control pipe instead of running one.
    #[arg(long, global = true)]
    connect: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Workspace root
    #[command(subcommand)]
    Workspace(WorkspaceCmd),
    /// Matter workspaces
    #[command(subcommand)]
    Matter(MatterCmd),
    /// The global registry
    #[command(subcommand)]
    Registry(RegistryCmd),
    /// Firm settings (the legal layer is read only)
    #[command(subcommand)]
    Settings(SettingsCmd),
    /// Long jobs
    #[command(subcommand)]
    Job(JobCmd),
    /// The canonical ledger of a matter
    #[command(subcommand)]
    Ledger(LedgerCmd),
    /// Refused writes and accepted commands
    #[command(subcommand)]
    Audit(AuditCmd),
    /// Source documents
    #[command(subcommand)]
    Evidence(EvidenceCmd),
    /// Drafts and their revisions
    #[command(subcommand)]
    Draft(DraftCmd),
    /// Gates and approvals
    #[command(subcommand)]
    Approval(ApprovalCmd),
    /// The rule pack and standard version a matter pins
    #[command(subcommand)]
    Rules(RulesCmd),
    /// Any record with the ledger events that touched it and its links
    Inspect {
        #[command(flatten)]
        m: MatterArg,
        id: String,
    },
    /// What a record references, and what references it
    #[command(subcommand)]
    Links(LinksCmd),
    /// One search across every record kind
    Find {
        query: String,
        /// Limit to a matter (default: every matter)
        #[arg(long)]
        matter: Option<String>,
        /// Limit to a kind; repeatable
        #[arg(long = "kind")]
        kinds: Vec<String>,
        /// field:value clauses separated by spaces
        #[arg(long)]
        filter: Option<String>,
    },
    /// The harness tool registry
    #[command(subcommand)]
    Tools(harness_cmds::ToolsCmd),
    /// Workflow playbooks
    #[command(subcommand)]
    Playbook(harness_cmds::PlaybookCmd),
    /// Supervised processes
    #[command(subcommand)]
    Services(harness_cmds::ServicesCmd),
    /// The agent: runs, effects, memory, context
    #[command(subcommand)]
    Agent(harness_cmds::AgentCmd),
    /// Run the kernel and its control pipe
    #[command(subcommand)]
    Kernel(KernelCmd),
    /// Print the protocol schema
    Schema {
        /// Only this command's entry
        #[arg(long)]
        command: Option<String>,
    },
    /// Issue any command by name, with its input as JSON
    Call {
        command: String,
        #[arg(long, default_value = "null")]
        input: String,
    },
}

#[derive(Subcommand)]
enum WorkspaceCmd {
    /// Create a workspace root and the global registry
    Init { root: PathBuf },
}

#[derive(Subcommand)]
enum MatterCmd {
    /// Create a matter workspace
    Create {
        #[arg(long)]
        title: String,
        /// An existing client id
        #[arg(long, conflicts_with = "new_client")]
        client: Option<String>,
        /// A client not yet in firm data. Needs a confirmation
        #[arg(long, value_name = "NAME")]
        new_client: Option<String>,
        /// A file to place in the new matter's inbox
        #[arg(long, value_name = "FILE")]
        from: Option<PathBuf>,
    },
    /// Confirm a pending matter for a new client (human command)
    Confirm {
        pending: String,
    },
    /// List matters
    List {
        #[arg(long)]
        include_removed: bool,
    },
    Open {
        id: String,
    },
    Archive {
        id: String,
    },
    Rename {
        id: String,
        title: String,
    },
    /// Write a raw file into the inbox or harness scratch area
    WriteFile {
        id: String,
        relpath: String,
        #[arg(long, value_name = "FILE")]
        from: PathBuf,
    },
}

#[derive(Subcommand)]
enum RegistryCmd {
    /// Rebuild the registry from the matter folders
    Rescan,
}

#[derive(Subcommand)]
enum SettingsCmd {
    Get {
        key: String,
    },
    Set {
        key: String,
        value: String,
    },
    /// Both layers, each value with its source
    List,
}

#[derive(Subcommand)]
enum JobCmd {
    List,
    Show { id: String },
    Cancel { id: String },
}

#[derive(Args)]
struct MatterArg {
    #[arg(long)]
    matter: String,
}

#[derive(Subcommand)]
enum LedgerCmd {
    /// Recent canonical events
    Tail {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        n: Option<u32>,
    },
    /// Recompute the hash chain and report the first break
    Verify {
        #[command(flatten)]
        m: MatterArg,
    },
}

#[derive(Subcommand)]
enum AuditCmd {
    /// Refused writes and commands
    Rejected {
        #[arg(long)]
        matter: Option<String>,
    },
    /// Accepted commands with actor and origin
    Commands,
}

#[derive(Subcommand)]
enum EvidenceCmd {
    /// Add a source document (stub until F's `oa import`)
    Add {
        #[command(flatten)]
        m: MatterArg,
        file: PathBuf,
        #[arg(long, default_value = "advocate_import")]
        origin: String,
    },
    List {
        #[command(flatten)]
        m: MatterArg,
    },
    Show {
        #[command(flatten)]
        m: MatterArg,
        id: String,
    },
}

#[derive(Subcommand)]
enum DraftCmd {
    /// Create a draft from a DOCX file (stub until J's `oa draft new`)
    Create {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        title: String,
        #[arg(long, value_name = "FILE")]
        from: PathBuf,
    },
    /// Commit a new revision on top of `--base`
    Commit {
        #[command(flatten)]
        m: MatterArg,
        #[arg(long)]
        draft: String,
        #[arg(long)]
        base: String,
        #[arg(long, value_name = "FILE")]
        from: PathBuf,
        #[arg(long)]
        note: Option<String>,
    },
    List {
        #[command(flatten)]
        m: MatterArg,
    },
    Log {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
    },
    Show {
        #[command(flatten)]
        m: MatterArg,
        rev: String,
    },
    Checkpoint {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
        #[arg(long)]
        name: String,
    },
    Restore {
        #[command(flatten)]
        m: MatterArg,
        draft: String,
        #[arg(long)]
        checkpoint: String,
    },
}

#[derive(Subcommand)]
enum ApprovalCmd {
    /// Every approval, with stale ones marked
    List {
        #[command(flatten)]
        m: MatterArg,
    },
    Request {
        #[command(flatten)]
        m: MatterArg,
        gate: String,
        #[arg(long)]
        target: String,
    },
    /// Record a decision (human command)
    Decide {
        #[command(flatten)]
        m: MatterArg,
        id: String,
        #[arg(long, conflicts_with = "reject", required_unless_present = "reject")]
        accept: bool,
        #[arg(long)]
        reject: bool,
        #[arg(long)]
        reason: String,
    },
    Status {
        #[command(flatten)]
        m: MatterArg,
        gate: String,
        #[arg(long)]
        target: String,
    },
}

#[derive(Subcommand)]
enum RulesCmd {
    Pin {
        #[command(flatten)]
        m: MatterArg,
    },
}

#[derive(Subcommand)]
enum LinksCmd {
    Out {
        #[command(flatten)]
        m: MatterArg,
        id: String,
    },
    In {
        #[command(flatten)]
        m: MatterArg,
        id: String,
    },
}

#[derive(Subcommand)]
enum KernelCmd {
    /// Serve the control pipe until stopped
    Serve,
}

/// Stub for H-09: a terminal confirmation. Refuses when no terminal is
/// attached, so a script or a process cannot confirm on its own.
struct TerminalPresence;

impl PresencePrompt for TerminalPresence {
    fn confirm(&self, summary: &str) -> bool {
        if !std::io::stdin().is_terminal() || !std::io::stderr().is_terminal() {
            return false;
        }
        let mut err = std::io::stderr();
        let _ = write!(err, "{summary}?\nType yes to confirm: ");
        let _ = err.flush();
        let mut line = String::new();
        std::io::stdin().lock().read_line(&mut line).is_ok() && line.trim() == "yes"
    }
}

fn app_data(flag: Option<PathBuf>) -> PathBuf {
    flag.or_else(|| std::env::var_os("OA_APP_DATA").map(PathBuf::from))
        .or_else(|| std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join("OpenAdvocate")))
        .unwrap_or_else(|| PathBuf::from(".openadvocate"))
}

fn attachment(path: &Path) -> Result<Attachment, OaError> {
    let bytes = std::fs::read(path)
        .map_err(|e| OaError::new(ErrorCode::Usage, format!("{}: {e}", path.display())))?;
    Ok(Attachment {
        file_name: path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        bytes,
    })
}

fn kernel(app: &Path) -> Kernel {
    let hooks = Hooks {
        presence: Arc::new(TerminalPresence),
        ..Hooks::default()
    };
    Kernel::new(app, Arc::new(SqliteFactory), hooks)
}

fn request(cmd: Command) -> Result<Request, OaError> {
    Ok(match cmd {
        Command::Workspace(WorkspaceCmd::Init { root }) => Request::WorkspaceInit { root },
        Command::Matter(m) => match m {
            MatterCmd::Create {
                title,
                client,
                new_client,
                from,
            } => {
                let client = match (client, new_client) {
                    (Some(id), _) => ClientSpec::Existing(id),
                    (None, Some(name)) => ClientSpec::New(name),
                    (None, None) => ClientSpec::None,
                };
                let from = from.as_deref().map(attachment).transpose()?;
                Request::MatterCreate {
                    title,
                    client,
                    from,
                }
            }
            MatterCmd::Confirm { pending } => Request::MatterConfirm { pending },
            MatterCmd::List { include_removed } => Request::MatterList { include_removed },
            MatterCmd::Open { id } => Request::MatterOpen { id },
            MatterCmd::Archive { id } => Request::MatterArchive { id },
            MatterCmd::Rename { id, title } => Request::MatterRename { id, title },
            MatterCmd::WriteFile { id, relpath, from } => Request::MatterWriteFile {
                id,
                relpath,
                bytes: attachment(&from)?.bytes,
            },
        },
        Command::Registry(RegistryCmd::Rescan) => Request::RegistryRescan,
        Command::Settings(SettingsCmd::Get { key }) => Request::SettingsGet { key },
        Command::Settings(SettingsCmd::List) => Request::SettingsList,
        Command::Settings(SettingsCmd::Set { key, value }) => Request::SettingsSet { key, value },
        Command::Job(JobCmd::List) => Request::JobList,
        Command::Job(JobCmd::Show { id }) => Request::JobShow { id },
        Command::Job(JobCmd::Cancel { id }) => Request::JobCancel { id },
        Command::Ledger(LedgerCmd::Tail { m, n }) => Request::LedgerTail {
            matter: m.matter,
            n,
        },
        Command::Ledger(LedgerCmd::Verify { m }) => Request::LedgerVerify { matter: m.matter },
        Command::Audit(AuditCmd::Rejected { matter }) => Request::AuditRejected { matter },
        Command::Audit(AuditCmd::Commands) => Request::AuditCommands,
        Command::Evidence(e) => match e {
            EvidenceCmd::Add { m, file, origin } => Request::EvidenceAdd {
                matter: m.matter,
                file: attachment(&file)?,
                origin,
            },
            EvidenceCmd::List { m } => Request::EvidenceList { matter: m.matter },
            EvidenceCmd::Show { m, id } => Request::EvidenceShow {
                matter: m.matter,
                id,
            },
        },
        Command::Draft(d) => match d {
            DraftCmd::Create { m, title, from } => Request::DraftCreate {
                matter: m.matter,
                title,
                file: attachment(&from)?,
            },
            DraftCmd::Commit {
                m,
                draft,
                base,
                from,
                note,
            } => Request::DraftCommit {
                matter: m.matter,
                draft,
                base,
                file: attachment(&from)?,
                note,
            },
            DraftCmd::List { m } => Request::DraftList { matter: m.matter },
            DraftCmd::Log { m, draft } => Request::DraftLog {
                matter: m.matter,
                draft,
            },
            DraftCmd::Show { m, rev } => Request::DraftShow {
                matter: m.matter,
                rev,
            },
            DraftCmd::Checkpoint { m, draft, name } => Request::DraftCheckpoint {
                matter: m.matter,
                draft,
                name,
            },
            DraftCmd::Restore {
                m,
                draft,
                checkpoint,
            } => Request::DraftRestore {
                matter: m.matter,
                draft,
                checkpoint,
            },
        },
        Command::Approval(a) => match a {
            ApprovalCmd::Request { m, gate, target } => Request::ApprovalRequest {
                matter: m.matter,
                gate,
                target,
            },
            ApprovalCmd::Decide {
                m,
                id,
                accept,
                reject: _,
                reason,
            } => Request::ApprovalDecide {
                matter: m.matter,
                id,
                accept,
                reason,
            },
            ApprovalCmd::List { m } => Request::ApprovalList { matter: m.matter },
            ApprovalCmd::Status { m, gate, target } => Request::ApprovalStatus {
                matter: m.matter,
                gate,
                target,
            },
        },
        Command::Rules(RulesCmd::Pin { m }) => Request::RulesPin { matter: m.matter },
        Command::Find {
            query,
            matter,
            kinds,
            filter,
        } => Request::Find {
            matter,
            query,
            kinds,
            filter,
        },
        Command::Inspect { m, id } => Request::Inspect {
            matter: m.matter,
            id,
        },
        Command::Links(LinksCmd::Out { m, id }) => Request::LinksOut {
            matter: m.matter,
            id,
        },
        Command::Links(LinksCmd::In { m, id }) => Request::LinksIn {
            matter: m.matter,
            id,
        },
        Command::Call { command, input } => {
            let input: Value = serde_json::from_str(&input)
                .map_err(|e| OaError::new(ErrorCode::Usage, format!("--input is not JSON: {e}")))?;
            let mut envelope = serde_json::json!({ "command": command });
            if !input.is_null() {
                envelope["input"] = input;
            }
            serde_json::from_value(envelope)
                .map_err(|e| OaError::new(ErrorCode::Usage, format!("{command}: {e}")))?
        }
        Command::Kernel(_)
        | Command::Schema { .. }
        | Command::Tools(_)
        | Command::Playbook(_)
        | Command::Services(_)
        | Command::Agent(_) => {
            unreachable!("handled before a request is built")
        }
    })
}

/// The schema, or one command's entry in it.
fn schema(command: Option<String>) -> Result<Value, OaError> {
    let schema = Request::schema();
    let Some(name) = command else {
        return Ok(schema);
    };
    schema["oneOf"]
        .as_array()
        .and_then(|entries| {
            entries
                .iter()
                .find(|e| e["properties"]["command"]["enum"][0] == name.as_str())
        })
        .cloned()
        .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no command {name}")))
}

#[cfg(windows)]
fn serve(app: &Path) -> Result<Vec<Value>, OaError> {
    let name = oa_protocol::pipe_name(app);
    let job = oa_control::HarnessJob::new()
        .map_err(|e| OaError::new(ErrorCode::Unavailable, format!("harness job: {e}")))?;
    eprintln!(
        "{}",
        serde_json::json!({ "serving": name, "app_data": app.to_string_lossy() })
    );
    oa_control::serve(
        Arc::new(kernel(app)),
        Some(Arc::new(job)),
        oa_control::PipeListener::bind(&name),
    )
    .map_err(|e| OaError::new(ErrorCode::Unavailable, format!("control pipe {name}: {e}")))?;
    Ok(Vec::new())
}

#[cfg(not(windows))]
fn serve(_app: &Path) -> Result<Vec<Value>, OaError> {
    Err(OaError::new(
        ErrorCode::Unavailable,
        "the control pipe is implemented for Windows first",
    ))
}

/// Short human text: one line per object, scalar fields as `key=value`.
fn human(v: &Value) -> String {
    match v {
        Value::Object(map) => map
            .iter()
            .filter(|(_, v)| !v.is_null())
            .map(|(k, v)| match v {
                Value::String(s) => format!("{k}={s}"),
                other => format!("{k}={other}"),
            })
            .collect::<Vec<_>>()
            .join("  "),
        other => other.to_string(),
    }
}

fn run(cli: Cli) -> Result<Vec<Value>, OaError> {
    let app = app_data(cli.app_data);
    match cli.command {
        Command::Kernel(KernelCmd::Serve) => return serve(&app),
        Command::Schema { command } => return schema(command).map(|s| vec![s]),
        Command::Tools(harness_cmds::ToolsCmd::List) => return Ok(harness_cmds::tools_list()),
        Command::Playbook(c) => return harness_cmds::playbook(c),
        Command::Services(_) => return Ok(harness_cmds::services()),
        Command::Agent(c) => {
            let user = InProcess::new(kernel(&app), Origin::Cli);
            let harness = harness_cmds::harness_client(kernel(&app));
            return harness_cmds::agent(c, &user, harness);
        }
        _ => {}
    }
    let key = cli.idempotency_key.or_else(|| Some(oa_types::new_key()));
    let req = request(cli.command)?;
    if cli.connect {
        PipeClient::connect(&app, Origin::Cli)?.call(key, req)
    } else {
        InProcess::new(kernel(&app), Origin::Cli).call(key, req)
    }
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let json = cli.json;
    let result = run(cli);
    let mut out = std::io::stdout().lock();
    match result {
        Ok(values) => {
            for v in values {
                let line = if json { v.to_string() } else { human(&v) };
                let _ = writeln!(out, "{line}");
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            if json {
                let _ = writeln!(out, "{}", serde_json::json!({ "error": e }));
            }
            eprintln!("error[{}]: {}", e.code.as_str(), e.message);
            ExitCode::from(e.code.exit_code() as u8)
        }
    }
}

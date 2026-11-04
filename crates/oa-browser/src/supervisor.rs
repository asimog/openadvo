//! The browser supervisor (D15 for browser processes): one process per
//! profile, started on demand, restarted after a crash, with the hard filing
//! check (H-15) applied before any request reaches the agent profile, and
//! every download hashed off disk before anything opens it (M rule 5).

use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::egress::{is_filing_destination, EgressSpec, Initiator, Url};
use crate::process::{
    now, Connection, DownloadFile, LaunchSpec, ProfileProcess, ProfileRequest, ProfileResponse,
};
use crate::profile::Profile;

/// A live connection to one profile process.
pub trait ProfileConn: Send {
    fn call(&mut self, req: &ProfileRequest) -> Result<ProfileResponse, String>;
    fn alive(&mut self) -> bool;
    /// Kills the process outright, as a crash would.
    fn kill(&mut self);
    fn pid(&self) -> Option<u32>;
}

/// Starts profile processes.
pub trait Launcher: Send + Sync {
    fn launch(&self, spec: &LaunchSpec) -> Result<Box<dyn ProfileConn>, String>;
    fn describe(&self) -> String;
}

/// Spawns `oa-browser-profile` as its own OS process for each profile.
pub struct ProcessLauncher {
    pub program: PathBuf,
}

impl ProcessLauncher {
    pub fn new(program: impl Into<PathBuf>) -> Self {
        ProcessLauncher {
            program: program.into(),
        }
    }

    /// `OA_BROWSER_PROFILE`, or `oa-browser-profile` beside the running
    /// executable.
    pub fn beside_current_exe() -> Self {
        if let Some(p) = std::env::var_os("OA_BROWSER_PROFILE") {
            return ProcessLauncher::new(p);
        }
        let dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| PathBuf::from("."));
        ProcessLauncher::new(dir.join(format!(
            "oa-browser-profile{}",
            std::env::consts::EXE_SUFFIX
        )))
    }
}

struct ChildConn {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<String>,
}

const CALL_TIMEOUT: Duration = Duration::from_secs(30);

impl ProfileConn for ChildConn {
    fn call(&mut self, req: &ProfileRequest) -> Result<ProfileResponse, String> {
        let line = serde_json::to_string(req).map_err(|e| e.to_string())?;
        writeln!(self.stdin, "{line}")
            .and_then(|_| self.stdin.flush())
            .map_err(|e| format!("the profile process is gone: {e}"))?;
        let reply = self
            .lines
            .recv_timeout(CALL_TIMEOUT)
            .map_err(|_| "the profile process did not answer".to_string())?;
        serde_json::from_str(&reply).map_err(|e| format!("a malformed reply: {e}"))
    }

    fn alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }

    fn pid(&self) -> Option<u32> {
        Some(self.child.id())
    }
}

impl Drop for ChildConn {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Launcher for ProcessLauncher {
    fn launch(&self, spec: &LaunchSpec) -> Result<Box<dyn ProfileConn>, String> {
        std::fs::create_dir_all(&spec.profile_dir).map_err(|e| e.to_string())?;
        let launch = spec.profile_dir.join("launch.json");
        std::fs::write(
            &launch,
            serde_json::to_vec_pretty(spec).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let mut child = Command::new(&self.program)
            .arg("--launch")
            .arg(&launch)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("{} cannot start: {e}", self.program.display()))?;
        let stdin = child.stdin.take().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
        Ok(Box::new(ChildConn {
            child,
            stdin,
            lines: rx,
        }))
    }

    fn describe(&self) -> String {
        self.program.display().to_string()
    }
}

/// Runs the same profile handler inside this process. For kernel tests,
/// where the profile executable is not built; the process boundary itself is
/// tested in `oa-browser` against the built executable.
pub struct InProcessLauncher;

struct InProcessConn {
    process: Option<ProfileProcess>,
}

impl ProfileConn for InProcessConn {
    fn call(&mut self, req: &ProfileRequest) -> Result<ProfileResponse, String> {
        let p = self.process.as_mut().ok_or("the profile process is gone")?;
        let resp = p.handle(req);
        if *req == ProfileRequest::Shutdown {
            self.process = None;
        }
        Ok(resp)
    }

    fn alive(&mut self) -> bool {
        self.process.is_some()
    }

    fn kill(&mut self) {
        self.process = None;
    }

    fn pid(&self) -> Option<u32> {
        None
    }
}

impl Launcher for InProcessLauncher {
    fn launch(&self, spec: &LaunchSpec) -> Result<Box<dyn ProfileConn>, String> {
        std::fs::create_dir_all(&spec.profile_dir).map_err(|e| e.to_string())?;
        Ok(Box::new(InProcessConn {
            process: Some(ProfileProcess::new(spec.clone())),
        }))
    }

    fn describe(&self) -> String {
        "in-process profile handler (tests)".into()
    }
}

/// A launcher that cannot start anything: Chromium is missing.
pub struct Unavailable(pub String);

impl Launcher for Unavailable {
    fn launch(&self, _spec: &LaunchSpec) -> Result<Box<dyn ProfileConn>, String> {
        Err(self.0.clone())
    }

    fn describe(&self) -> String {
        format!("unavailable: {}", self.0)
    }
}

struct Running {
    conn: Box<dyn ProfileConn>,
    dir: PathBuf,
    started_at: String,
    egress: EgressSpec,
}

/// The status of one profile process, for `oa browser state` and the pane.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessStatus {
    pub profile: String,
    pub state: String,
    pub pid: Option<u32>,
    pub started_at: Option<String>,
    pub restarts: u32,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BrowserError {
    /// Refused by policy (exit 3). The connections carry the refusal for the
    /// egress log.
    Refused {
        reason: String,
        connections: Vec<Connection>,
    },
    /// The process could not start or answer (exit 5).
    Unavailable(String),
    /// The page or the request failed.
    Failed {
        reason: String,
        connections: Vec<Connection>,
    },
}

impl BrowserError {
    pub fn connections(&self) -> &[Connection] {
        match self {
            BrowserError::Refused { connections, .. }
            | BrowserError::Failed { connections, .. } => connections,
            BrowserError::Unavailable(_) => &[],
        }
    }

    pub fn reason(&self) -> &str {
        match self {
            BrowserError::Refused { reason, .. }
            | BrowserError::Failed { reason, .. }
            | BrowserError::Unavailable(reason) => reason,
        }
    }
}

/// A download, hashed from the bytes on disk before anything opened it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Intercepted {
    pub file: DownloadFile,
    pub sha256: String,
    pub bytes: Vec<u8>,
}

pub fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{}", hex::encode(Sha256::digest(bytes)))
}

/// Reads a download off disk and hashes it.
pub fn intercept(file: &DownloadFile) -> Result<Intercepted, String> {
    let bytes = std::fs::read(&file.path)
        .map_err(|e| format!("the intercepted download {} is unreadable: {e}", file.path))?;
    Ok(Intercepted {
        file: file.clone(),
        sha256: sha256(&bytes),
        bytes,
    })
}

pub struct Supervisor {
    launcher: Arc<dyn Launcher>,
    root: PathBuf,
    running: BTreeMap<Profile, Running>,
    restarts: BTreeMap<Profile, u32>,
    last_error: BTreeMap<Profile, String>,
}

impl Supervisor {
    /// `root` holds one folder per persistent profile, and the throwaway
    /// agent folders.
    pub fn new(launcher: Arc<dyn Launcher>, root: impl Into<PathBuf>) -> Self {
        Supervisor {
            launcher,
            root: root.into(),
            running: BTreeMap::new(),
            restarts: BTreeMap::new(),
            last_error: BTreeMap::new(),
        }
    }

    pub fn launcher(&self) -> String {
        self.launcher.describe()
    }

    fn dir_for(&self, profile: &Profile) -> PathBuf {
        if profile.config().persistent {
            self.root.join("profiles").join(profile.dir_name())
        } else {
            // Fresh for each run, discarded after (M rule 2).
            self.root
                .join("runs")
                .join(format!("agent-{}", ulid::Ulid::new()))
        }
    }

    /// Starts the profile's process if it is not running, or restarts it
    /// after a crash. A changed egress spec restarts it with the new spec.
    fn ensure(&mut self, profile: &Profile, egress: &EgressSpec) -> Result<(), BrowserError> {
        let mut crashed = false;
        let mut changed = false;
        if let Some(r) = self.running.get_mut(profile) {
            if !r.conn.alive() {
                crashed = true;
            } else if r.egress != *egress {
                changed = true;
            } else {
                return Ok(());
            }
        }
        if crashed || changed {
            self.stop(profile);
            if crashed {
                *self.restarts.entry(profile.clone()).or_default() += 1;
            }
        }
        let dir = self.dir_for(profile);
        let spec = LaunchSpec {
            profile: profile.clone(),
            profile_dir: dir.clone(),
            egress: egress.clone(),
            devtools: profile.config().devtools,
        };
        match self.launcher.launch(&spec) {
            Ok(conn) => {
                self.last_error.remove(profile);
                self.running.insert(
                    profile.clone(),
                    Running {
                        conn,
                        dir,
                        started_at: now(),
                        egress: egress.clone(),
                    },
                );
                Ok(())
            }
            Err(e) => {
                let reason = format!("the {profile} browser process failed to start: {e}");
                self.last_error.insert(profile.clone(), reason.clone());
                Err(BrowserError::Unavailable(reason))
            }
        }
    }

    fn call(
        &mut self,
        profile: &Profile,
        req: &ProfileRequest,
    ) -> Result<ProfileResponse, BrowserError> {
        let running = self.running.get_mut(profile).ok_or_else(|| {
            BrowserError::Unavailable(format!("the {profile} browser is not running"))
        })?;
        let resp = running.conn.call(req).map_err(|e| {
            BrowserError::Unavailable(format!("the {profile} browser process: {e}"))
        })?;
        if resp.ok {
            Ok(resp)
        } else if resp.unavailable {
            Err(BrowserError::Unavailable(resp.error.unwrap_or_default()))
        } else if resp.refused {
            Err(BrowserError::Refused {
                reason: resp.error.unwrap_or_default(),
                connections: resp.connections,
            })
        } else {
            Err(BrowserError::Failed {
                reason: resp.error.unwrap_or_default(),
                connections: resp.connections,
            })
        }
    }

    /// Navigates in a profile. The agent profile's filing refusal is checked
    /// here, before the request reaches the process (H-15).
    pub fn navigate(
        &mut self,
        profile: &Profile,
        egress: &EgressSpec,
        url: &str,
        initiator: Initiator,
    ) -> Result<ProfileResponse, BrowserError> {
        let parsed = Url::parse(url).map_err(|e| BrowserError::Failed {
            reason: e,
            connections: Vec::new(),
        })?;
        if *profile == Profile::Agent && is_filing_destination(&parsed.host) {
            return Err(BrowserError::Refused {
                reason: format!(
                    "{} is a filing destination: the agent profile never opens it (H-15)",
                    parsed.host
                ),
                connections: vec![Connection {
                    at: now(),
                    url: parsed.to_string(),
                    host: parsed.host.clone(),
                    initiator,
                    kind: "navigation".into(),
                    allowed: false,
                    reason: "filing destination: refused by the supervisor (H-15)".into(),
                    status: None,
                    error: None,
                }],
            });
        }
        self.ensure(profile, egress)?;
        self.call(
            profile,
            &ProfileRequest::Navigate {
                url: parsed.to_string(),
                initiator,
            },
        )
    }

    /// A query to a running profile. Queries never start a process.
    pub fn query(
        &mut self,
        profile: &Profile,
        req: &ProfileRequest,
    ) -> Result<ProfileResponse, BrowserError> {
        if let Some(r) = self.running.get_mut(profile) {
            if !r.conn.alive() {
                self.last_error
                    .insert(profile.clone(), "the browser process exited".into());
                self.stop(profile);
            }
        }
        self.call(profile, req)
    }

    /// Starts a profile (for DevTools and status checks).
    pub fn start(&mut self, profile: &Profile, egress: &EgressSpec) -> Result<(), BrowserError> {
        self.ensure(profile, egress)
    }

    pub fn open_devtools(
        &mut self,
        profile: &Profile,
        egress: &EgressSpec,
    ) -> Result<ProfileResponse, BrowserError> {
        if !profile.config().devtools {
            return Err(BrowserError::Refused {
                reason: format!("DevTools are disabled in the {profile} profile (M05)"),
                connections: Vec::new(),
            });
        }
        self.ensure(profile, egress)?;
        self.call(profile, &ProfileRequest::OpenDevtools)
    }

    /// Kills one profile's process, as a crash would. The others keep running.
    pub fn kill(&mut self, profile: &Profile) {
        if let Some(r) = self.running.get_mut(profile) {
            r.conn.kill();
        }
    }

    /// Stops a profile. The agent profile's folder is deleted with it.
    pub fn stop(&mut self, profile: &Profile) {
        if let Some(mut r) = self.running.remove(profile) {
            if r.conn.alive() {
                let _ = r.conn.call(&ProfileRequest::Shutdown);
            }
            r.conn.kill();
            if !profile.config().persistent {
                let _ = std::fs::remove_dir_all(&r.dir);
            }
        }
    }

    /// Ends an agent run: the throwaway profile and its folder go.
    pub fn end_agent_run(&mut self) {
        self.stop(&Profile::Agent);
    }

    pub fn is_running(&mut self, profile: &Profile) -> bool {
        self.running
            .get_mut(profile)
            .is_some_and(|r| r.conn.alive())
    }

    pub fn profile_dir(&self, profile: &Profile) -> Option<&Path> {
        self.running.get(profile).map(|r| r.dir.as_path())
    }

    pub fn status(&mut self) -> Vec<ProcessStatus> {
        let mut profiles: Vec<Profile> = self.running.keys().cloned().collect();
        for p in self.last_error.keys() {
            if !profiles.contains(p) {
                profiles.push(p.clone());
            }
        }
        profiles.sort();
        profiles
            .into_iter()
            .map(|p| {
                let restarts = self.restarts.get(&p).copied().unwrap_or(0);
                let last_error = self.last_error.get(&p).cloned();
                match self.running.get_mut(&p) {
                    Some(r) => {
                        let alive = r.conn.alive();
                        ProcessStatus {
                            profile: p.name(),
                            state: if alive { "running" } else { "crashed" }.into(),
                            pid: r.conn.pid(),
                            started_at: Some(r.started_at.clone()),
                            restarts,
                            last_error,
                        }
                    }
                    None => ProcessStatus {
                        profile: p.name(),
                        state: "failed".into(),
                        pid: None,
                        started_at: None,
                        restarts,
                        last_error,
                    },
                }
            })
            .collect()
    }
}

impl Drop for Supervisor {
    fn drop(&mut self) {
        let profiles: Vec<Profile> = self.running.keys().cloned().collect();
        for p in profiles {
            self.stop(&p);
        }
    }
}

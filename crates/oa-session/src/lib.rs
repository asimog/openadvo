//! The harness session store contract (spec D rules 5, 6, 17, 19, 21).
//!
//! The session store is harness local: turns, effect intents, notes, the model
//! trace store and context manifests. It is not canonical state. The harness
//! crate depends on this trait and never on the canonical store crates (spec C
//! rule 2). `oa-store` provides the SQLite implementation; [`MemSession`] is
//! the in-memory one the loop's tests use.

use std::collections::BTreeMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

pub type Fence = u64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionErrorKind {
    /// An append carried an older fence than the newest claim (D18).
    StaleFence,
    NotFound,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionError {
    pub kind: SessionErrorKind,
    pub message: String,
}

impl SessionError {
    pub fn new(kind: SessionErrorKind, message: impl Into<String>) -> Self {
        SessionError {
            kind,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for SessionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for SessionError {}

pub type R<T> = Result<T, SessionError>;

/// Where an effect intent stands (spec D rule 6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectState {
    Started,
    Returned,
    Raised,
    /// The outcome cannot be determined after a crash. Not retried until
    /// reconciliation proves the effect did not happen (rule 7).
    Unknown,
}

impl EffectState {
    pub fn as_str(self) -> &'static str {
        match self {
            EffectState::Started => "started",
            EffectState::Returned => "returned",
            EffectState::Raised => "raised",
            EffectState::Unknown => "unknown",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "started" => EffectState::Started,
            "returned" => EffectState::Returned,
            "raised" => EffectState::Raised,
            "unknown" => EffectState::Unknown,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EffectRow {
    /// Deterministic from the request and call index, so a resumed turn finds
    /// the same row instead of acting twice.
    pub id: String,
    pub turn: u64,
    pub tool: String,
    pub class: String,
    pub args_hash: String,
    pub state: EffectState,
    pub result: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    /// Cost in millionths of a currency unit, attributed per turn (D16).
    pub cost_micro: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TurnRow {
    pub n: u64,
    pub instruction: String,
    pub outcome: String,
    pub usage: Usage,
}

/// An instruction as it arrived and how it ended (spec D rule 19).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstructionRow {
    pub id: String,
    pub text: String,
    pub origin: String,
    /// `received`, then `answered`, `cancelled` or `disconnected`.
    pub outcome: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Memory {
    pub text: String,
    pub editor: String,
}

/// What the run is doing, for the Waiting on you view (D-AC-19).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunRow {
    /// `running`, `blocked_on_gate`, `stalled` or `closed`.
    pub status: String,
    pub detail: String,
    pub since_ms: u64,
    pub last_progress_ms: u64,
}

pub trait SessionStore: Send + Sync {
    /// Claims the matter's session. Each claim increments the fence; an append
    /// carrying an older fence is refused afterwards (rule 17).
    fn claim(&self) -> R<Fence>;

    fn begin_turn(&self, fence: Fence, instruction: &str) -> R<u64>;
    fn end_turn(&self, fence: Fence, turn: u64, outcome: &str, usage: &Usage) -> R<()>;
    fn turns(&self) -> R<Vec<TurnRow>>;

    fn begin_effect(&self, fence: Fence, row: &EffectRow) -> R<()>;
    fn finish_effect(
        &self,
        fence: Fence,
        id: &str,
        state: EffectState,
        result: Option<&str>,
        reason: Option<&str>,
    ) -> R<()>;
    fn effect(&self, id: &str) -> R<Option<EffectRow>>;
    fn effects(&self) -> R<Vec<EffectRow>>;
    /// After a restart: every effect still `started` becomes `unknown`.
    fn mark_started_unknown(&self, fence: Fence) -> R<usize>;

    fn put_trace(&self, fence: Fence, request_hash: &str, response: &str) -> R<()>;
    fn trace(&self, request_hash: &str) -> R<Option<String>>;

    fn put_manifest(&self, fence: Fence, turn: u64, step: u32, manifest: &str) -> R<()>;
    fn manifests(&self, turn: u64) -> R<Vec<(u32, String)>>;

    /// The whole result of a tool call. The model may have seen a preview.
    fn put_result(&self, fence: Fence, call_id: &str, content: &str) -> R<()>;
    fn result(&self, call_id: &str) -> R<Option<String>>;

    fn memory(&self) -> R<Option<Memory>>;
    /// `fence` is `None` for an advocate edit, which is not the harness.
    fn set_memory(&self, fence: Option<Fence>, text: &str, editor: &str) -> R<()>;

    fn record_instruction(&self, fence: Fence, text: &str, origin: &str) -> R<String>;
    fn finish_instruction(&self, id: &str, outcome: &str) -> R<()>;
    fn instructions(&self) -> R<Vec<InstructionRow>>;

    fn set_run(&self, fence: Fence, run: &RunRow) -> R<()>;
    fn run(&self) -> R<Option<RunRow>>;
}

#[derive(Default)]
struct Inner {
    fence: Fence,
    turns: Vec<TurnRow>,
    effects: BTreeMap<String, EffectRow>,
    effect_order: Vec<String>,
    traces: BTreeMap<String, String>,
    manifests: BTreeMap<u64, Vec<(u32, String)>>,
    results: BTreeMap<String, String>,
    memory: Option<Memory>,
    instructions: Vec<InstructionRow>,
    run: Option<RunRow>,
}

/// An in-memory session. Cloning shares nothing; wrap in `Arc` to share.
#[derive(Default)]
pub struct MemSession {
    inner: Mutex<Inner>,
}

impl MemSession {
    pub fn new() -> Self {
        Self::default()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|p| p.into_inner())
    }
}

fn check(inner: &Inner, fence: Fence) -> R<()> {
    if fence < inner.fence {
        return Err(SessionError::new(
            SessionErrorKind::StaleFence,
            format!(
                "fence {fence} is older than the current claim {}",
                inner.fence
            ),
        ));
    }
    Ok(())
}

impl SessionStore for MemSession {
    fn claim(&self) -> R<Fence> {
        let mut g = self.lock();
        g.fence += 1;
        Ok(g.fence)
    }

    fn begin_turn(&self, fence: Fence, instruction: &str) -> R<u64> {
        let mut g = self.lock();
        check(&g, fence)?;
        let n = g.turns.len() as u64 + 1;
        g.turns.push(TurnRow {
            n,
            instruction: instruction.to_string(),
            outcome: "running".into(),
            usage: Usage::default(),
        });
        Ok(n)
    }

    fn end_turn(&self, fence: Fence, turn: u64, outcome: &str, usage: &Usage) -> R<()> {
        let mut g = self.lock();
        check(&g, fence)?;
        let t = g
            .turns
            .iter_mut()
            .find(|t| t.n == turn)
            .ok_or_else(|| SessionError::new(SessionErrorKind::NotFound, "no such turn"))?;
        t.outcome = outcome.to_string();
        t.usage = usage.clone();
        Ok(())
    }

    fn turns(&self) -> R<Vec<TurnRow>> {
        Ok(self.lock().turns.clone())
    }

    fn begin_effect(&self, fence: Fence, row: &EffectRow) -> R<()> {
        let mut g = self.lock();
        check(&g, fence)?;
        if g.effects.insert(row.id.clone(), row.clone()).is_none() {
            g.effect_order.push(row.id.clone());
        }
        Ok(())
    }

    fn finish_effect(
        &self,
        fence: Fence,
        id: &str,
        state: EffectState,
        result: Option<&str>,
        reason: Option<&str>,
    ) -> R<()> {
        let mut g = self.lock();
        check(&g, fence)?;
        let e = g
            .effects
            .get_mut(id)
            .ok_or_else(|| SessionError::new(SessionErrorKind::NotFound, "no such effect"))?;
        e.state = state;
        e.result = result.map(str::to_string);
        e.reason = reason.map(str::to_string);
        Ok(())
    }

    fn effect(&self, id: &str) -> R<Option<EffectRow>> {
        Ok(self.lock().effects.get(id).cloned())
    }

    fn effects(&self) -> R<Vec<EffectRow>> {
        let g = self.lock();
        Ok(g.effect_order
            .iter()
            .filter_map(|id| g.effects.get(id).cloned())
            .collect())
    }

    fn mark_started_unknown(&self, fence: Fence) -> R<usize> {
        let mut g = self.lock();
        check(&g, fence)?;
        let mut n = 0;
        for e in g.effects.values_mut() {
            if e.state == EffectState::Started {
                e.state = EffectState::Unknown;
                e.reason = Some("the harness stopped before the effect returned".into());
                n += 1;
            }
        }
        Ok(n)
    }

    fn put_trace(&self, fence: Fence, request_hash: &str, response: &str) -> R<()> {
        let mut g = self.lock();
        check(&g, fence)?;
        g.traces
            .insert(request_hash.to_string(), response.to_string());
        Ok(())
    }

    fn trace(&self, request_hash: &str) -> R<Option<String>> {
        Ok(self.lock().traces.get(request_hash).cloned())
    }

    fn put_manifest(&self, fence: Fence, turn: u64, step: u32, manifest: &str) -> R<()> {
        let mut g = self.lock();
        check(&g, fence)?;
        g.manifests
            .entry(turn)
            .or_default()
            .push((step, manifest.to_string()));
        Ok(())
    }

    fn manifests(&self, turn: u64) -> R<Vec<(u32, String)>> {
        Ok(self
            .lock()
            .manifests
            .get(&turn)
            .cloned()
            .unwrap_or_default())
    }

    fn put_result(&self, fence: Fence, call_id: &str, content: &str) -> R<()> {
        let mut g = self.lock();
        check(&g, fence)?;
        g.results.insert(call_id.to_string(), content.to_string());
        Ok(())
    }

    fn result(&self, call_id: &str) -> R<Option<String>> {
        Ok(self.lock().results.get(call_id).cloned())
    }

    fn memory(&self) -> R<Option<Memory>> {
        Ok(self.lock().memory.clone())
    }

    fn set_memory(&self, fence: Option<Fence>, text: &str, editor: &str) -> R<()> {
        let mut g = self.lock();
        if let Some(f) = fence {
            check(&g, f)?;
        }
        g.memory = Some(Memory {
            text: text.to_string(),
            editor: editor.to_string(),
        });
        Ok(())
    }

    fn record_instruction(&self, fence: Fence, text: &str, origin: &str) -> R<String> {
        let mut g = self.lock();
        check(&g, fence)?;
        let id = format!("I{}", g.instructions.len() + 1);
        g.instructions.push(InstructionRow {
            id: id.clone(),
            text: text.to_string(),
            origin: origin.to_string(),
            outcome: "received".into(),
        });
        Ok(id)
    }

    fn finish_instruction(&self, id: &str, outcome: &str) -> R<()> {
        let mut g = self.lock();
        let i = g
            .instructions
            .iter_mut()
            .find(|i| i.id == id)
            .ok_or_else(|| SessionError::new(SessionErrorKind::NotFound, "no such instruction"))?;
        i.outcome = outcome.to_string();
        Ok(())
    }

    fn instructions(&self) -> R<Vec<InstructionRow>> {
        Ok(self.lock().instructions.clone())
    }

    fn set_run(&self, fence: Fence, run: &RunRow) -> R<()> {
        let mut g = self.lock();
        check(&g, fence)?;
        g.run = Some(run.clone());
        Ok(())
    }

    fn run(&self) -> R<Option<RunRow>> {
        Ok(self.lock().run.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn d_ac_18_an_older_fence_is_refused_after_a_newer_claim() {
        let s = MemSession::new();
        let old = s.claim().unwrap();
        s.begin_turn(old, "first").unwrap();
        let newer = s.claim().unwrap();
        assert!(newer > old);
        let err = s.begin_turn(old, "ghost").unwrap_err();
        assert_eq!(err.kind, SessionErrorKind::StaleFence);
        assert!(s.set_memory(Some(old), "x", "agent").is_err());
        s.begin_turn(newer, "second").unwrap();
        // An advocate edit carries no fence and is never refused.
        s.set_memory(None, "note", "advocate").unwrap();
    }
}

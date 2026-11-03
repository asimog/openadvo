//! Model providers behind our trait (spec D rule 2, assumptions). The loop owns
//! the session; no provider framework does (C-6).

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One item of a streamed model response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StreamItem {
    Token { text: String },
    ToolCall { name: String, args: Value },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_micro: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderError {
    /// The provider is unreachable or failed mid-stream (D-AC-13).
    Outage(String),
    /// The provider returned tool JSON that is not valid.
    Malformed(String),
}

/// Where a provider runs, for the router (spec D rule 12).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Residency {
    Local,
    Remote,
}

/// What the model is sent. `manifest_hash` covers the context manifest, so the
/// request hash changes when anything the model sees changes (rule 8).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelRequest {
    pub system: String,
    pub messages: Vec<Message>,
    pub manifest_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "role", rename_all = "snake_case")]
pub enum Message {
    User {
        text: String,
    },
    Assistant {
        text: String,
    },
    ToolCall {
        id: String,
        name: String,
        args: Value,
    },
    ToolResult {
        id: String,
        content: String,
    },
    /// Page text, email bodies and document text: data with an origin label
    /// (rule 14). Never an instruction.
    Data {
        origin: String,
        text: String,
    },
}

pub type Stream = Box<dyn Iterator<Item = Result<StreamItem, ProviderError>>>;

pub trait Provider: Send + Sync {
    fn name(&self) -> &str;
    fn residency(&self) -> Residency;
    fn stream(&self, req: &ModelRequest) -> Result<Stream, ProviderError>;
    /// Tokens and cost for the call just made. Attributed per turn (D16).
    fn usage(&self, req: &ModelRequest) -> ProviderUsage;
}

/// A provider that replays scripted responses, one per call. It records every
/// request, so a test can assert what the model was shown.
pub struct Scripted {
    residency: Residency,
    responses: Mutex<std::collections::VecDeque<Result<Vec<StreamItem>, ProviderError>>>,
    pub requests: Mutex<Vec<ModelRequest>>,
}

impl Scripted {
    pub fn new(residency: Residency, responses: Vec<Vec<StreamItem>>) -> Self {
        Scripted {
            residency,
            responses: Mutex::new(responses.into_iter().map(Ok).collect()),
            requests: Mutex::new(Vec::new()),
        }
    }

    pub fn with_results(
        residency: Residency,
        responses: Vec<Result<Vec<StreamItem>, ProviderError>>,
    ) -> Self {
        Scripted {
            residency,
            responses: Mutex::new(responses.into()),
            requests: Mutex::new(Vec::new()),
        }
    }

    pub fn calls(&self) -> usize {
        self.requests
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .len()
    }
}

/// The text a message contributes to a call. The manifest and the provider's
/// usage both count this, so they describe the same bytes.
pub fn message_text(m: &Message) -> String {
    match m {
        Message::User { text } | Message::Assistant { text } | Message::Data { text, .. } => {
            text.clone()
        }
        Message::ToolCall { name, args, .. } => format!("{name}{args}"),
        Message::ToolResult { content, .. } => content.clone(),
    }
}

/// Tokens a request costs: its system text plus every message.
pub fn request_tokens(req: &ModelRequest) -> u64 {
    estimate_tokens(&req.system)
        + req
            .messages
            .iter()
            .map(|m| estimate_tokens(&message_text(m)))
            .sum::<u64>()
}

/// A rough, shared token estimate: four characters a token. Providers report
/// their own counts; the manifest uses this one and D-AC-05 compares them.
pub fn estimate_tokens(text: &str) -> u64 {
    (text.chars().count() as u64).div_ceil(4)
}

impl Provider for Scripted {
    fn name(&self) -> &str {
        "scripted"
    }

    fn residency(&self) -> Residency {
        self.residency
    }

    fn stream(&self, req: &ModelRequest) -> Result<Stream, ProviderError> {
        self.requests
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .push(req.clone());
        let next = self
            .responses
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .pop_front()
            .unwrap_or_else(|| Ok(Vec::new()));
        next.map(|items| Box::new(items.into_iter().map(Ok)) as Stream)
    }

    fn usage(&self, req: &ModelRequest) -> ProviderUsage {
        ProviderUsage {
            input_tokens: request_tokens(req),
            output_tokens: 10,
            cost_micro: 100,
        }
    }
}

type Answer = Box<dyn Fn(&ModelRequest) -> Result<Vec<StreamItem>, ProviderError> + Send + Sync>;

/// A provider whose answer is a function of the request, so a restarted
/// harness gets the same answer for the same context.
pub struct FnProvider {
    residency: Residency,
    f: Answer,
    asked: std::sync::atomic::AtomicUsize,
}

impl FnProvider {
    pub fn new(
        residency: Residency,
        f: impl Fn(&ModelRequest) -> Result<Vec<StreamItem>, ProviderError> + Send + Sync + 'static,
    ) -> Self {
        FnProvider {
            residency,
            f: Box::new(f),
            asked: std::sync::atomic::AtomicUsize::new(0),
        }
    }

    /// How many times the model was actually asked.
    pub fn asked(&self) -> usize {
        self.asked.load(std::sync::atomic::Ordering::SeqCst)
    }
}

impl Provider for FnProvider {
    fn name(&self) -> &str {
        "fn"
    }

    fn residency(&self) -> Residency {
        self.residency
    }

    fn stream(&self, req: &ModelRequest) -> Result<Stream, ProviderError> {
        self.asked.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        (self.f)(req).map(|items| Box::new(items.into_iter().map(Ok)) as Stream)
    }

    fn usage(&self, req: &ModelRequest) -> ProviderUsage {
        ProviderUsage {
            input_tokens: request_tokens(req),
            output_tokens: 10,
            cost_micro: 100,
        }
    }
}

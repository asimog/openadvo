//! The DOCX engine boundary. The kernel asks the engine for paragraphs,
//! edits and renders through [`DocxEngine`]. [`ProcessEngine`] runs
//! `wordcraft --headless` as its own process and speaks one JSON line per
//! request; [`InProcessEngine`] runs the same handler in this process for
//! kernel tests. Both reach [`handle`].

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::docx::{Block, Docx, IdChange};
use crate::pdf::PdfPage;
use crate::DocError;

pub const ENGINE: &str = "wordcraft-engine";
/// The stub engine's version. A conversion record names it.
pub const VERSION: &str = "stub-0.1";

mod b64 {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(bytes: &[u8], s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&STANDARD.encode(bytes))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<u8>, D::Error> {
        let text = String::deserialize(d)?;
        STANDARD.decode(text).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum EngineRequest {
    Version,
    Paragraphs {
        #[serde(with = "b64")]
        docx: Vec<u8>,
    },
    Blocks {
        #[serde(with = "b64")]
        docx: Vec<u8>,
    },
    Replace {
        #[serde(with = "b64")]
        docx: Vec<u8>,
        para: String,
        text: String,
    },
    /// A file saved by the hosted editor: duplicate and missing ids are
    /// re-issued and the mapping returned.
    Import {
        #[serde(with = "b64")]
        docx: Vec<u8>,
    },
    ApplyChanges {
        #[serde(with = "b64")]
        from: Vec<u8>,
        #[serde(with = "b64")]
        to: Vec<u8>,
        #[serde(with = "b64")]
        onto: Vec<u8>,
    },
    Render {
        #[serde(with = "b64")]
        docx: Vec<u8>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum EngineResponse {
    Version {
        engine: String,
        version: String,
    },
    Blocks {
        blocks: Vec<Block>,
    },
    Docx {
        #[serde(with = "b64")]
        docx: Vec<u8>,
        #[serde(default)]
        changes: Vec<IdChange>,
        #[serde(default)]
        changed: Vec<String>,
    },
    Render {
        pages: Vec<PdfPage>,
    },
    Error {
        kind: String,
        message: String,
        #[serde(default)]
        paragraphs: Vec<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Edited {
    pub docx: Vec<u8>,
    pub changes: Vec<IdChange>,
    pub changed: Vec<String>,
}

pub const LINE_WIDTH: usize = 88;
pub const PAGE_LINES: usize = 48;

fn wrap(text: &str, width: usize) -> Vec<String> {
    let mut out = Vec::new();
    for raw in text.split('\n') {
        let mut line = String::new();
        for word in raw.replace('\t', "    ").split_whitespace() {
            if !line.is_empty() && line.chars().count() + 1 + word.chars().count() > width {
                out.push(std::mem::take(&mut line));
            }
            if !line.is_empty() {
                line.push(' ');
            }
            line.push_str(word);
        }
        out.push(line);
    }
    out
}

/// Lays paragraphs out on pages: wrapped lines, a blank line after each
/// paragraph. The engine's render (OQ-03) and the viewer's page model share
/// it; the fidelity oracle compares them with other renderers.
pub fn layout(paragraphs: &[Block], width: usize, page_lines: usize) -> Vec<PdfPage> {
    let mut pages = vec![PdfPage::default()];
    for p in paragraphs {
        let mut lines = wrap(&p.text, width);
        lines.push(String::new());
        for l in lines {
            if pages.last().is_some_and(|pg| pg.lines.len() >= page_lines) {
                pages.push(PdfPage::default());
            }
            if let Some(pg) = pages.last_mut() {
                pg.lines.push(l);
            }
        }
    }
    for pg in &mut pages {
        while pg.lines.last().is_some_and(String::is_empty) {
            pg.lines.pop();
        }
    }
    pages
}

fn err(e: DocError) -> EngineResponse {
    match e {
        DocError::Conflict(paragraphs) => EngineResponse::Error {
            kind: "conflict".into(),
            message: format!(
                "paragraphs changed on both sides: {}",
                paragraphs.join(", ")
            ),
            paragraphs,
        },
        DocError::NoParagraph(p) => EngineResponse::Error {
            kind: "no_paragraph".into(),
            message: format!("no paragraph {p}"),
            paragraphs: vec![p],
        },
        other => EngineResponse::Error {
            kind: "unreadable".into(),
            message: other.to_string(),
            paragraphs: Vec::new(),
        },
    }
}

/// One request, answered. Never panics on a bad document.
pub fn handle(req: &EngineRequest) -> EngineResponse {
    let run = || -> Result<EngineResponse, DocError> {
        Ok(match req {
            EngineRequest::Version => EngineResponse::Version {
                engine: ENGINE.into(),
                version: VERSION.into(),
            },
            EngineRequest::Paragraphs { docx } => EngineResponse::Blocks {
                blocks: Docx::open(docx)?.paragraphs(),
            },
            EngineRequest::Blocks { docx } => EngineResponse::Blocks {
                blocks: Docx::open(docx)?.blocks(),
            },
            EngineRequest::Replace { docx, para, text } => {
                let mut d = Docx::open(docx)?;
                d.replace_paragraph(para, text)?;
                EngineResponse::Docx {
                    docx: d.save(),
                    changes: Vec::new(),
                    changed: vec![para.clone()],
                }
            }
            EngineRequest::Import { docx } => {
                let mut d = Docx::open(docx)?;
                let changes = d.normalise_ids();
                EngineResponse::Docx {
                    docx: d.save(),
                    changes,
                    changed: Vec::new(),
                }
            }
            EngineRequest::ApplyChanges { from, to, onto } => {
                let (from, to) = (Docx::open(from)?, Docx::open(to)?);
                let mut d = Docx::open(onto)?;
                let changed = d.apply_changes(&from, &to)?;
                EngineResponse::Docx {
                    docx: d.save(),
                    changes: Vec::new(),
                    changed,
                }
            }
            EngineRequest::Render { docx } => EngineResponse::Render {
                pages: layout(&Docx::open(docx)?.paragraphs(), LINE_WIDTH, PAGE_LINES),
            },
        })
    };
    run().unwrap_or_else(err)
}

pub trait DocxEngine: Send + Sync {
    fn call(&self, req: &EngineRequest) -> Result<EngineResponse, DocError>;
}

fn expect_blocks(r: EngineResponse) -> Result<Vec<Block>, DocError> {
    match r {
        EngineResponse::Blocks { blocks } => Ok(blocks),
        other => Err(from_response(other)),
    }
}

fn expect_docx(r: EngineResponse) -> Result<Edited, DocError> {
    match r {
        EngineResponse::Docx {
            docx,
            changes,
            changed,
        } => Ok(Edited {
            docx,
            changes,
            changed,
        }),
        other => Err(from_response(other)),
    }
}

fn from_response(r: EngineResponse) -> DocError {
    match r {
        EngineResponse::Error {
            kind, paragraphs, ..
        } if kind == "conflict" => DocError::Conflict(paragraphs),
        EngineResponse::Error {
            kind, paragraphs, ..
        } if kind == "no_paragraph" => {
            DocError::NoParagraph(paragraphs.into_iter().next().unwrap_or_default())
        }
        EngineResponse::Error { message, .. } => DocError::Package(message),
        other => DocError::Engine(format!("unexpected engine answer: {other:?}")),
    }
}

/// The calls the kernel makes, over any engine.
impl dyn DocxEngine {
    pub fn version(&self) -> Result<String, DocError> {
        match self.call(&EngineRequest::Version)? {
            EngineResponse::Version { engine, version } => Ok(format!("{engine} {version}")),
            other => Err(from_response(other)),
        }
    }

    pub fn paragraphs(&self, docx: &[u8]) -> Result<Vec<Block>, DocError> {
        expect_blocks(self.call(&EngineRequest::Paragraphs {
            docx: docx.to_vec(),
        })?)
    }

    pub fn blocks(&self, docx: &[u8]) -> Result<Vec<Block>, DocError> {
        expect_blocks(self.call(&EngineRequest::Blocks {
            docx: docx.to_vec(),
        })?)
    }

    pub fn replace(&self, docx: &[u8], para: &str, text: &str) -> Result<Edited, DocError> {
        expect_docx(self.call(&EngineRequest::Replace {
            docx: docx.to_vec(),
            para: para.into(),
            text: text.into(),
        })?)
    }

    pub fn import(&self, docx: &[u8]) -> Result<Edited, DocError> {
        expect_docx(self.call(&EngineRequest::Import {
            docx: docx.to_vec(),
        })?)
    }

    pub fn apply_changes(&self, from: &[u8], to: &[u8], onto: &[u8]) -> Result<Edited, DocError> {
        expect_docx(self.call(&EngineRequest::ApplyChanges {
            from: from.to_vec(),
            to: to.to_vec(),
            onto: onto.to_vec(),
        })?)
    }

    pub fn render(&self, docx: &[u8]) -> Result<Vec<PdfPage>, DocError> {
        match self.call(&EngineRequest::Render {
            docx: docx.to_vec(),
        })? {
            EngineResponse::Render { pages } => Ok(pages),
            other => Err(from_response(other)),
        }
    }
}

pub struct InProcessEngine;

impl DocxEngine for InProcessEngine {
    fn call(&self, req: &EngineRequest) -> Result<EngineResponse, DocError> {
        Ok(handle(req))
    }
}

/// `wordcraft --headless` as a separate process, one per call. A missing
/// executable, a crash or a timeout is an `Unavailable` engine, never a panic.
pub struct ProcessEngine {
    pub program: PathBuf,
    pub timeout: Duration,
}

impl ProcessEngine {
    pub fn new(program: impl Into<PathBuf>) -> Self {
        ProcessEngine {
            program: program.into(),
            timeout: Duration::from_secs(30),
        }
    }

    /// `OA_WORDCRAFT`, else `wordcraft` beside the running executable.
    pub fn beside_current_exe() -> Self {
        if let Some(p) = std::env::var_os("OA_WORDCRAFT") {
            return ProcessEngine::new(p);
        }
        let dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| PathBuf::from("."));
        ProcessEngine::new(dir.join(format!("wordcraft{}", std::env::consts::EXE_SUFFIX)))
    }
}

impl DocxEngine for ProcessEngine {
    fn call(&self, req: &EngineRequest) -> Result<EngineResponse, DocError> {
        let line = serde_json::to_string(req).map_err(|e| DocError::Engine(e.to_string()))?;
        let mut child = Command::new(&self.program)
            .arg("--headless")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| {
                DocError::Engine(format!("{} cannot start: {e}", self.program.display()))
            })?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = writeln!(stdin, "{line}");
        }
        let mut stdout = child.stdout.take();
        let reader = std::thread::spawn(move || {
            let mut out = String::new();
            if let Some(s) = stdout.as_mut() {
                let _ = s.read_to_string(&mut out);
            }
            out
        });
        let started = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) if !status.success() => {
                    return Err(DocError::Engine(format!("the engine exited with {status}")))
                }
                Ok(Some(_)) => break,
                Ok(None) if started.elapsed() >= self.timeout => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(DocError::Engine(format!(
                        "the engine exceeded {:?}",
                        self.timeout
                    )));
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(10)),
                Err(e) => return Err(DocError::Engine(e.to_string())),
            }
        }
        let out = reader.join().unwrap_or_default();
        let first = out.lines().next().unwrap_or_default();
        serde_json::from_str(first)
            .map_err(|e| DocError::Engine(format!("the engine answered no usable JSON: {e}")))
    }
}

/// `wordcraft --headless`: one JSON request per line in, one answer per line
/// out, until end of input.
pub fn serve(input: impl Read, mut output: impl Write) {
    for line in BufReader::new(input).lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let answer = match serde_json::from_str::<EngineRequest>(&line) {
            Ok(req) => handle(&req),
            Err(e) => EngineResponse::Error {
                kind: "usage".into(),
                message: format!("not a request: {e}"),
                paragraphs: Vec::new(),
            },
        };
        let _ = writeln!(
            output,
            "{}",
            serde_json::to_string(&answer).unwrap_or_default()
        );
        let _ = output.flush();
    }
}

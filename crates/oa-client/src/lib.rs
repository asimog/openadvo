//! The one way a front end issues commands. The CLI, and later the panes and
//! the harness, hold a `Client`.
//!
//! [`InProcess`] runs a headless kernel in this process, for scripted runs.
//! [`PipeClient`] talks to a running kernel over the control protocol, where
//! the kernel decides the origin from the connecting process.

use std::fs::{File, OpenOptions};
use std::io::BufReader;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use oa_kernel::{Ctx, Kernel, Request};
use oa_protocol::{pipe_name, read_msg, write_msg, Call, Hello, Reply, PROTOCOL_VERSION};
use oa_types::{ErrorCode, OaError, Origin};
use serde_json::Value;

pub trait Client {
    /// Issues one command. `key` is the idempotency key for `internal` and
    /// `external` commands.
    fn call(&self, key: Option<String>, req: Request) -> Result<Vec<Value>, OaError>;
}

/// A headless kernel in this process, with a fixed origin.
pub struct InProcess {
    kernel: Kernel,
    origin: Origin,
}

impl InProcess {
    pub fn new(kernel: Kernel, origin: Origin) -> Self {
        InProcess { kernel, origin }
    }
}

impl Client for InProcess {
    fn call(&self, key: Option<String>, req: Request) -> Result<Vec<Value>, OaError> {
        let ctx = Ctx {
            origin: self.origin,
            key,
        };
        self.kernel.dispatch(&ctx, req)
    }
}

struct Conn {
    reader: BufReader<File>,
    writer: File,
}

/// A connection to the kernel's control pipe.
pub struct PipeClient {
    conn: Mutex<Conn>,
    origin: Origin,
}

fn unavailable(message: String) -> OaError {
    OaError::new(ErrorCode::Unavailable, message)
}

impl PipeClient {
    /// Connects to the kernel serving `app_data`, waiting briefly for a busy
    /// or just-starting pipe.
    pub fn connect(app_data: &Path, claimed: Origin) -> Result<Self, OaError> {
        const ERROR_PIPE_BUSY: i32 = 231;
        let name = pipe_name(app_data);
        let deadline = Instant::now() + Duration::from_secs(3);
        let file = loop {
            match OpenOptions::new().read(true).write(true).open(&name) {
                Ok(f) => break f,
                Err(e)
                    if Instant::now() < deadline
                        && (e.raw_os_error() == Some(ERROR_PIPE_BUSY)
                            || e.kind() == std::io::ErrorKind::NotFound) =>
                {
                    std::thread::sleep(Duration::from_millis(20));
                }
                Err(e) => {
                    return Err(unavailable(format!(
                        "no kernel is serving {name}: {e}; start one with `oa kernel serve`"
                    )))
                }
            }
        };
        let writer = file.try_clone().map_err(|e| unavailable(e.to_string()))?;
        let mut conn = Conn {
            reader: BufReader::new(file),
            writer,
        };
        write_msg(
            &mut conn.writer,
            &Hello {
                protocol: PROTOCOL_VERSION,
                claimed_origin: claimed,
            },
        )
        .map_err(|e| unavailable(e.to_string()))?;
        match read_msg::<Reply>(&mut conn.reader).map_err(|e| unavailable(e.to_string()))? {
            Some(Reply::Welcome(w)) => Ok(PipeClient {
                conn: Mutex::new(conn),
                origin: w.origin,
            }),
            Some(Reply::Error { error }) => Err(error),
            Some(Reply::Ok { .. }) | None => Err(unavailable(
                "the kernel did not complete the handshake".into(),
            )),
        }
    }

    /// The origin the kernel decided for this connection.
    pub fn origin(&self) -> Origin {
        self.origin
    }
}

impl Client for PipeClient {
    fn call(&self, key: Option<String>, request: Request) -> Result<Vec<Value>, OaError> {
        let mut conn = self.conn.lock().unwrap_or_else(|p| p.into_inner());
        write_msg(&mut conn.writer, &Call { key, request })
            .map_err(|e| unavailable(e.to_string()))?;
        match read_msg::<Reply>(&mut conn.reader).map_err(|e| unavailable(e.to_string()))? {
            Some(Reply::Ok { values }) => Ok(values),
            Some(Reply::Error { error }) => Err(error),
            Some(Reply::Welcome(_)) | None => {
                Err(unavailable("the kernel closed the connection".into()))
            }
        }
    }
}

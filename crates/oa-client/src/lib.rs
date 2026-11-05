//! The client side of the control surface.
//!
//! [`PipeClient`] talks to a running kernel over the control protocol, where
//! the kernel decides the origin from the connecting process.

use std::fs::{File, OpenOptions};
use std::io::BufReader;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use oa_protocol::{pipe_name, read_msg, write_msg, Call, Hello, Reply, Request, PROTOCOL_VERSION};
use oa_types::{ErrorCode, OaError, Origin};
use serde_json::Value;

pub trait Client: Send + Sync {
    /// Issues one command. `key` is the idempotency key for `internal` and
    /// `external` commands.
    fn call(&self, key: Option<String>, req: Request) -> Result<Vec<Value>, OaError>;
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
    fn handshake(file: File, claimed: Origin) -> Result<Self, OaError> {
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
        Self::handshake(file, claimed)
    }

    /// Probes and connects immediately if a kernel is serving, without the 3-second wait.
    pub fn try_connect(app_data: &Path, claimed: Origin) -> Result<Self, OaError> {
        const ERROR_PIPE_BUSY: i32 = 231;
        let name = pipe_name(app_data);
        let file = match OpenOptions::new().read(true).write(true).open(&name) {
            Ok(f) => f,
            Err(e) if e.raw_os_error() == Some(ERROR_PIPE_BUSY) => {
                let deadline = Instant::now() + Duration::from_millis(500);
                loop {
                    std::thread::sleep(Duration::from_millis(10));
                    match OpenOptions::new().read(true).write(true).open(&name) {
                        Ok(f) => break f,
                        Err(e)
                            if Instant::now() < deadline
                                && e.raw_os_error() == Some(ERROR_PIPE_BUSY) =>
                        {
                            continue
                        }
                        Err(e) => return Err(unavailable(format!("pipe busy: {e}"))),
                    }
                }
            }
            Err(e) => return Err(unavailable(format!("no kernel is serving {name}: {e}"))),
        };
        Self::handshake(file, claimed)
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

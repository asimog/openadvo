//! The control protocol (spec B01). One JSON object per line, in both
//! directions, over a local named pipe.
//!
//! A connection opens with [`Hello`]; the kernel answers [`Welcome`] with the
//! origin *it* decided from the connecting process, or refuses an
//! incompatible major version (spec B rule 10). Then each [`Call`] gets one
//! [`Reply`].

use std::io::{self, BufRead, Write};
use std::path::Path;

use oa_kernel::Request;
use oa_types::{OaError, Origin};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

/// The protocol major version. A client with another major is refused.
pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hello {
    pub protocol: u32,
    /// What the client says it is. The kernel overrides it from the
    /// process identity (spec B rule 3).
    pub claimed_origin: Origin,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Welcome {
    pub protocol: u32,
    /// The origin the kernel will record for this connection.
    pub origin: Origin,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Call {
    pub key: Option<String>,
    pub request: Request,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Reply {
    Welcome(Welcome),
    Ok { values: Vec<Value> },
    Error { error: OaError },
}

/// The pipe a kernel serves for one application data folder. Distinct folders
/// get distinct pipes, so tests and installations never cross.
pub fn pipe_name(app_data: &Path) -> String {
    let abs = std::path::absolute(app_data).unwrap_or_else(|_| app_data.to_path_buf());
    let key = abs.to_string_lossy().to_lowercase();
    let digest = hex::encode(Sha256::digest(key.as_bytes()));
    format!(r"\\.\pipe\openadvocate-{}", &digest[..24])
}

pub fn write_msg<T: Serialize>(w: &mut impl Write, msg: &T) -> io::Result<()> {
    let mut line = serde_json::to_vec(msg).map_err(io::Error::other)?;
    line.push(b'\n');
    w.write_all(&line)?;
    w.flush()
}

/// Reads one message. `Ok(None)` means the peer closed the connection.
pub fn read_msg<T: DeserializeOwned>(r: &mut impl BufRead) -> io::Result<Option<T>> {
    let mut line = String::new();
    if r.read_line(&mut line)? == 0 {
        return Ok(None);
    }
    serde_json::from_str(line.trim_end())
        .map(Some)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messages_round_trip_through_the_framing() {
        let call = Call {
            key: Some("k1".into()),
            request: Request::MatterList {
                include_removed: true,
            },
        };
        let mut buf = Vec::new();
        write_msg(&mut buf, &call).unwrap();
        assert_eq!(buf.iter().filter(|b| **b == b'\n').count(), 1);
        let back: Call = read_msg(&mut buf.as_slice()).unwrap().unwrap();
        assert_eq!(back.request, call.request);
        assert!(read_msg::<Call>(&mut &b""[..]).unwrap().is_none());
    }

    #[test]
    fn pipe_names_differ_per_app_data_folder() {
        let a = pipe_name(Path::new(r"C:\one"));
        let b = pipe_name(Path::new(r"C:\two"));
        assert_ne!(a, b);
        assert!(a.starts_with(r"\\.\pipe\openadvocate-"));
        assert_eq!(
            a,
            pipe_name(Path::new(r"c:\ONE")),
            "Windows paths are case-insensitive"
        );
    }
}

//! The control server (spec B01) in the kernel process.
//!
//! The kernel, not the client, decides each connection's origin (spec B rule
//! 3). A process the supervisor starts as the harness is placed in a Windows
//! Job Object, and every process it starts inherits the job and cannot leave
//! it. A connection from any process in that job is `harness`, whatever it
//! claims, so the agent cannot run `oa` to issue a `human` command (X-19).

use std::io::BufReader;

use oa_kernel::{Ctx, Kernel};
use oa_protocol::{read_msg, write_msg, Call, Hello, Reply, Welcome, PROTOCOL_VERSION};
use oa_types::{ErrorCode, OaError, Origin};

#[cfg(windows)]
mod win;

#[cfg(windows)]
pub use win::{serve, HarnessJob, PipeListener};

/// Decides the recorded origin from the claim and the process identity.
pub fn decide_origin(claimed: Origin, in_harness_job: bool) -> Origin {
    if in_harness_job {
        Origin::Harness
    } else {
        claimed
    }
}

/// Runs one connection to completion: handshake, then calls until the peer
/// closes. Generic over the stream so it is testable without a pipe.
pub fn handle_connection<S>(kernel: &Kernel, stream: S, in_harness_job: bool) -> std::io::Result<()>
where
    S: std::io::Read + std::io::Write + TryCloneStream,
{
    let mut writer = stream.try_clone_stream()?;
    let mut reader = BufReader::new(stream);
    let Some(hello) = read_msg::<Hello>(&mut reader)? else {
        return Ok(());
    };
    if hello.protocol != PROTOCOL_VERSION {
        let error = OaError::new(
            ErrorCode::ProtocolMismatch,
            format!(
                "client speaks protocol {}, this kernel speaks {PROTOCOL_VERSION}",
                hello.protocol
            ),
        );
        return write_msg(&mut writer, &Reply::Error { error });
    }
    let origin = decide_origin(hello.claimed_origin, in_harness_job);
    write_msg(
        &mut writer,
        &Reply::Welcome(Welcome {
            protocol: PROTOCOL_VERSION,
            origin,
        }),
    )?;
    while let Some(call) = read_msg::<Call>(&mut reader)? {
        let ctx = Ctx {
            origin,
            key: call.key,
        };
        let reply = match kernel.dispatch(&ctx, call.request) {
            Ok(values) => Reply::Ok { values },
            Err(error) => Reply::Error { error },
        };
        write_msg(&mut writer, &reply)?;
    }
    Ok(())
}

/// A stream whose write half can be split off for a reader thread's peer.
pub trait TryCloneStream: Sized {
    fn try_clone_stream(&self) -> std::io::Result<Self>;
}

impl TryCloneStream for std::fs::File {
    fn try_clone_stream(&self) -> std::io::Result<Self> {
        self.try_clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn b_ac_05_a_harness_process_is_harness_whatever_it_claims() {
        for claimed in [Origin::Ui, Origin::Cli, Origin::Test, Origin::Harness] {
            assert_eq!(decide_origin(claimed, true), Origin::Harness);
        }
        assert_eq!(decide_origin(Origin::Cli, false), Origin::Cli);
    }
}
